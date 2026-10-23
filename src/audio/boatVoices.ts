import { CONFIG } from '../config';
import { EngineSound, noiseBuffer, type EngineVoiceId } from './engineAudio';
import { mixer } from './mixer';

/**
 * The other players' boats, heard where they are (owner, Oct 2026: "hear your friends whizzing
 * past you in a motorboat ... spatialised ... the horn has to work so you can beep at your
 * friends"; CONFIG.boatSounds). Your own boat's sounds are the sound board's as ever; this is
 * everyone else's: for each of the nearest few within range,
 *
 *   her engine  ─┐
 *   the rush    ─┼─► air low-pass (by distance) ─► 3D panner (her place) ─► engine / effects bus
 *   her horn    ─┘
 *
 * all synthesised (her engine is the same diesel the sound board plays for your own, in her
 * engine's voice). The Doppler shift ("zoom"): her revs, as heard, scaled by the speed of
 * sound over it less her speed toward you (dopplerFactor), so the note rises as she comes and
 * drops as she goes. The App keeps the AudioContext's listener at your head.
 */

/** A boat to hear this frame (world metres and m/s). */
export interface HeardBoat {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Her velocity (world, m/s). */
  vx: number;
  vz: number;
  voice: EngineVoiceId;
  ratedRpm: number;
  twin: boolean;
  rpm: number;
  load: number;
  running: boolean;
  cranking: boolean;
  horn: boolean;
}

/** The listener: where your head is and how fast you're moving (world). */
export interface Listener {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
}

const C_SOUND = 343;

/**
 * How much higher (above 1) or lower she sounds for her motion and yours: the classic
 * f' = f (c + v_listener toward her) / (c - v_source toward you), within 1 ± `max`.
 */
export function dopplerFactor(b: { x: number; z: number; vx: number; vz: number }, l: Listener, max = CONFIG.boatSounds.dopplerMax): number {
  const dx = l.x - b.x;
  const dz = l.z - b.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-3) return 1;
  const ux = dx / d;
  const uz = dz / d;
  const towardMe = b.vx * ux + b.vz * uz; // her speed toward me
  const towardHer = -(l.vx * ux + l.vz * uz); // my speed toward her
  const f = (C_SOUND + towardHer) / Math.max(1, C_SOUND - towardMe);
  return Math.min(1 + max, Math.max(1 - max, f));
}

/** The boats to hear: within `range`, the nearest `max` (each heard boat keeps its voice). */
export function audibleBoats<T extends { id: string; x: number; z: number }>(boats: readonly T[], l: { x: number; z: number }, range = CONFIG.boatSounds.range, max = CONFIG.boatSounds.maxBoats): T[] {
  return boats
    .map((b) => ({ b, d: Math.hypot(b.x - l.x, b.z - l.z) }))
    .filter((o) => o.d <= range)
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((o) => o.b);
}

/** One boat's sound: her engine, the rush of water, her horn, in one place in 3D. */
class Voice {
  readonly panner: PannerNode;
  private readonly airLp: BiquadFilterNode;
  private readonly effectsLp: BiquadFilterNode;
  private engine: EngineSound | null = null;
  private engineKey = '';
  private building = false;
  private readonly rushGain: GainNode;
  private readonly rushSrc: AudioBufferSourceNode;
  private readonly hornGain: GainNode;
  private readonly horns: OscillatorNode[] = [];
  private gone = false;
  private placed = false;
  private readonly effectsPanner: PannerNode;

  constructor(
    private readonly ctx: AudioContext,
  ) {
    const s = CONFIG.boatSounds;
    const panner = (bus: 'engine' | 'effects') => {
      const p = ctx.createPanner();
      // Equal-power panning: cheap enough for a few at once on the Quest.
      p.panningModel = 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = s.refDistance;
      p.rolloffFactor = s.rolloff;
      p.maxDistance = s.range * 2;
      p.connect(mixer.bus(ctx, bus));
      return p;
    };
    this.panner = panner('engine');
    this.effectsPanner = panner('effects');
    this.airLp = ctx.createBiquadFilter();
    this.airLp.type = 'lowpass';
    this.airLp.frequency.value = s.airLp;
    this.airLp.connect(this.panner);
    this.effectsLp = ctx.createBiquadFilter();
    this.effectsLp.type = 'lowpass';
    this.effectsLp.frequency.value = s.airLp;
    this.effectsLp.connect(this.effectsPanner);
    // The rush: noise band-passed round the hiss of thrown water.
    this.rushSrc = ctx.createBufferSource();
    this.rushSrc.buffer = noiseBuffer(ctx, 2);
    this.rushSrc.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.6;
    this.rushGain = ctx.createGain();
    this.rushGain.gain.value = 0;
    this.rushSrc.connect(bp).connect(this.rushGain).connect(this.effectsLp);
    this.rushSrc.start();
    // Her horn: as your own boat's (audio/hornAudio.ts), two low tones a major third apart.
    const hornLp = ctx.createBiquadFilter();
    hornLp.type = 'lowpass';
    hornLp.frequency.value = 1400;
    this.hornGain = ctx.createGain();
    this.hornGain.gain.value = 0;
    hornLp.connect(this.hornGain).connect(this.effectsLp);
    for (const [f, a] of [
      [150, 0.5],
      [188, 0.45],
      [300, 0.15],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = Math.random() * 8 - 4;
      const g = ctx.createGain();
      g.gain.value = a;
      o.connect(g).connect(hornLp);
      o.start();
      this.horns.push(o);
    }
  }

  update(b: HeardBoat, l: Listener): void {
    const s = CONFIG.boatSounds;
    const t = this.ctx.currentTime;
    for (const p of [this.panner, this.effectsPanner]) {
      // Put straight there the first time (not glided in from the map's origin), then followed.
      if (this.placed) {
        p.positionX.setTargetAtTime(b.x, t, 0.05);
        p.positionY.setTargetAtTime(b.y, t, 0.05);
        p.positionZ.setTargetAtTime(b.z, t, 0.05);
      } else {
        p.positionX.setValueAtTime(b.x, t);
        p.positionY.setValueAtTime(b.y, t);
        p.positionZ.setValueAtTime(b.z, t);
      }
    }
    this.placed = true;
    const d = Math.hypot(b.x - l.x, b.y - l.y, b.z - l.z);
    const lp = Math.max(600, s.airLp - (s.airLpPerKm * d) / 1000);
    this.airLp.frequency.setTargetAtTime(lp, t, 0.2);
    this.effectsLp.frequency.setTargetAtTime(lp, t, 0.2);
    const doppler = dopplerFactor(b, l);
    // Her engine, in her voice (built once, again if she's changed).
    const key = `${b.voice}|${b.ratedRpm}`;
    if (key !== this.engineKey && !this.building) {
      this.building = true;
      void EngineSound.create(this.ctx, this.airLp, CONFIG.engineVoices[b.voice], b.ratedRpm).then((e) => {
        this.building = false;
        if (this.gone) return e.dispose();
        this.engine?.dispose();
        this.engine = e;
        this.engineKey = key;
      });
    }
    this.engine?.set({ rpm: b.rpm * doppler, load: b.load, ratedRpm: b.ratedRpm, running: b.running, cranking: b.cranking }, s.engineLevel * (b.twin ? s.twinLevel : 1));
    const speed = Math.hypot(b.vx, b.vz);
    const rush = Math.min(1, (speed / s.rushFullSpeed) ** 2);
    this.rushGain.gain.setTargetAtTime(s.rushLevel * rush, t, 0.15);
    this.rushSrc.playbackRate.setTargetAtTime(doppler, t, 0.1);
    this.hornGain.gain.setTargetAtTime(b.horn ? s.hornLevel : 0, t, b.horn ? 0.03 : 0.12);
  }

  dispose(): void {
    this.gone = true;
    this.engine?.dispose();
    this.rushSrc.stop();
    for (const o of this.horns) o.stop();
    this.panner.disconnect();
    this.effectsPanner.disconnect();
  }
}

/** Every other player's boat within earshot, each with her voice (CONFIG.boatSounds). */
export class BoatVoices {
  private ctx: AudioContext | null = null;
  private readonly voices = new Map<string, Voice>();

  attach(ctx: AudioContext | null): void {
    if (ctx) this.ctx = ctx;
  }

  /** How many boats are being heard now (for checks). */
  get heard(): number {
    return this.voices.size;
  }

  /** Each frame: the boats to hear (not your own), and where you are. */
  update(boats: readonly HeardBoat[], l: Listener): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const near = audibleBoats(boats, l);
    const keep = new Set(near.map((b) => b.id));
    for (const [id, v] of this.voices) {
      if (keep.has(id)) continue;
      v.dispose();
      this.voices.delete(id);
    }
    for (const b of near) {
      let v = this.voices.get(b.id);
      if (!v) this.voices.set(b.id, (v = new Voice(ctx)));
      v.update(b, l);
    }
  }
}

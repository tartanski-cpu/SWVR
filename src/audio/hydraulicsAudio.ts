import { mixer } from './mixer';
import { noiseBuffer } from './engineAudio';

/**
 * The deck machinery's sounds, synthesised (no audio files): the tender crane, the tow
 * winch, the trawl's net drum and the line hauler. All three are hydraulic, so they share a character, each
 * with its own pitch and weight:
 *
 *   pump whine   the hydraulic motor's gear whine: a triangle tone with a band-passed
 *                harmonic, its pitch rising with speed and sagging under load
 *   flow hiss    oil through the valves: band-passed noise, louder under load
 *   rumble       the drum or slewing gear turning: a low, low-passed sawtooth with a
 *                slow wobble (the drum's lay of wire or the slew ring's teeth)
 *   clunks       the control valve opening and closing: a short low thump when a machine
 *                starts or stops
 *   relief       the winch stalled against a pull it can't take: the relief valve's
 *                thin, high hiss (it's holding pressure, not turning)
 *
 * Level by distance to each machine, muffled in the wheelhouse like the other outside
 * sounds. Every voice is always wired; one silent costs next to nothing.
 */
export interface MachineSound {
  /** Running (0..1): turning under pressure. */
  run: number;
  /** Load (0..1): how hard it's working (the line's pull, the lift). */
  load: number;
  /** Stalled against too much load (relief valve lifting). */
  stalled?: boolean;
  /** Listener to the machine (m). */
  distance: number;
}

/** Each machine's voice: base whine pitch (Hz), rumble pitch (Hz), loudness. */
const VOICES = {
  crane: { whine: 520, rumble: 58, level: 0.9 },
  winch: { whine: 380, rumble: 44, level: 1.0 },
  trawl: { whine: 330, rumble: 38, level: 1.0 },
  /** The line hauler (owner, 29 Oct 2026: longlining): a small motor at the rail, lighter than the winch. */
  hauler: { whine: 460, rumble: 50, level: 0.75 },
  /** A foiling boat's foils raised or lowered (the foiling ferry's, owner 28 Oct 2026: retractable): a quieter, higher pump. */
  foils: { whine: 610, rumble: 52, level: 0.6 },
} as const;
type MachineName = keyof typeof VOICES;

class Voice {
  readonly out: GainNode;
  private readonly whine: OscillatorNode;
  private readonly harm: OscillatorNode;
  private readonly harmFilter: BiquadFilterNode;
  private readonly whineGain: GainNode;
  private readonly hissGain: GainNode;
  private readonly rumble: OscillatorNode;
  private readonly rumbleGain: GainNode;
  private readonly wobble: OscillatorNode;
  private readonly reliefGain: GainNode;
  private running = false;
  private readonly wobbleDepth: GainNode;

  constructor(
    private readonly ctx: AudioContext,
    noise: AudioBuffer,
    dest: AudioNode,
    private readonly base: (typeof VOICES)[MachineName],
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    // Pump whine: a triangle and its band-passed third harmonic.
    this.whine = ctx.createOscillator();
    this.whine.type = 'triangle';
    this.whine.frequency.value = base.whine;
    const harm = (this.harm = ctx.createOscillator());
    harm.type = 'sawtooth';
    harm.frequency.value = base.whine;
    const hbp = (this.harmFilter = ctx.createBiquadFilter());
    hbp.type = 'bandpass';
    hbp.frequency.value = base.whine * 3;
    hbp.Q.value = 6;
    const hg = ctx.createGain();
    hg.gain.value = 0.25;
    this.whineGain = ctx.createGain();
    this.whineGain.gain.value = 0;
    this.whine.connect(this.whineGain);
    harm.connect(hbp).connect(hg).connect(this.whineGain);
    this.whineGain.connect(this.out);
    // Flow hiss: looped noise through a band-pass.
    const hiss = ctx.createBufferSource();
    hiss.buffer = noise;
    hiss.loop = true;
    const fbp = ctx.createBiquadFilter();
    fbp.type = 'bandpass';
    fbp.frequency.value = 2600;
    fbp.Q.value = 1.2;
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0;
    hiss.connect(fbp).connect(this.hissGain).connect(this.out);
    // Drum / slew gear rumble with a slow wobble in level.
    this.rumble = ctx.createOscillator();
    this.rumble.type = 'sawtooth';
    this.rumble.frequency.value = base.rumble;
    const rlp = ctx.createBiquadFilter();
    rlp.type = 'lowpass';
    rlp.frequency.value = 260;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    this.wobble = ctx.createOscillator();
    this.wobble.frequency.value = 3.2;
    const wg = ctx.createGain();
    wg.gain.value = 0;
    this.wobble.connect(wg).connect(this.rumbleGain.gain);
    this.rumble.connect(rlp).connect(this.rumbleGain).connect(this.out);
    // Relief valve: a thin high hiss.
    const rel = ctx.createBufferSource();
    rel.buffer = noise;
    rel.loop = true;
    const rbp = ctx.createBiquadFilter();
    rbp.type = 'bandpass';
    rbp.frequency.value = 5200;
    rbp.Q.value = 8;
    this.reliefGain = ctx.createGain();
    this.reliefGain.gain.value = 0;
    rel.connect(rbp).connect(this.reliefGain).connect(this.out);
    for (const n of [this.whine, harm, this.rumble, this.wobble]) n.start();
    hiss.start(0, Math.random());
    rel.start(0, Math.random());
    // Wobble depth follows the rumble level (set in update through this gain).
    this.wobbleDepth = wg;
  }

  update(m: MachineSound, clunk: (at: number, level: number) => void): void {
    const t = this.ctx.currentTime;
    const b = this.base;
    const on = m.run > 0.01 || !!m.stalled;
    const near = b.level / (1 + m.distance / 5);
    if (on !== this.running) {
      clunk(t, (on ? 0.6 : 0.45) * near); // the valve: in, or back to neutral
      this.running = on;
    }
    this.out.gain.setTargetAtTime(on ? near : 0, t, on ? 0.06 : 0.12);
    // Speed raises the whine; load drags it down a little and opens the hiss.
    const load = Math.min(1, Math.max(0, m.load));
    const pitch = m.stalled ? b.whine * 0.7 : b.whine * (0.75 + 0.35 * m.run - 0.15 * load);
    this.whine.frequency.setTargetAtTime(pitch, t, 0.15);
    this.harm.frequency.setTargetAtTime(pitch, t, 0.15);
    this.harmFilter.frequency.setTargetAtTime(pitch * 3, t, 0.15);
    this.whineGain.gain.setTargetAtTime(on ? 0.05 + 0.03 * load : 0, t, 0.1);
    this.hissGain.gain.setTargetAtTime(on ? 0.04 + 0.08 * load : 0, t, 0.1);
    const turning = m.stalled ? 0 : m.run;
    this.rumble.frequency.setTargetAtTime(b.rumble * (0.8 + 0.4 * turning), t, 0.2);
    this.rumbleGain.gain.setTargetAtTime(0.06 * turning, t, 0.1);
    this.wobbleDepth.gain.setTargetAtTime(0.025 * turning, t, 0.1);
    this.reliefGain.gain.setTargetAtTime(m.stalled ? 0.12 : 0, t, 0.08);
  }
}

export class HydraulicsAudio {
  private ctx: AudioContext | null = null;
  private muffle: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices: Record<MachineName, Voice> | null = null;

  attach(ctx: AudioContext | null): void {
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    this.noise = noiseBuffer(ctx, 2);
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.muffle.connect(mixer.bus(ctx, 'effects'));
    this.voices = {
      crane: new Voice(ctx, this.noise, this.muffle, VOICES.crane),
      winch: new Voice(ctx, this.noise, this.muffle, VOICES.winch),
      trawl: new Voice(ctx, this.noise, this.muffle, VOICES.trawl),
      foils: new Voice(ctx, this.noise, this.muffle, VOICES.foils),
      hauler: new Voice(ctx, this.noise, this.muffle, VOICES.hauler),
    };
  }

  /**
   * @param m      each machine's state this frame
   * @param muffle 0..1, shut in the wheelhouse
   */
  update(m: Record<MachineName, MachineSound>, muffle: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.voices || !this.muffle) return;
    const hz = 20000 - 19400 * muffle;
    this.muffle.frequency.setTargetAtTime(hz, ctx.currentTime, 0.1);
    for (const k of Object.keys(this.voices) as MachineName[]) this.voices[k].update(m[k], (at, level) => this.clunk(at, level));
  }

  /** A valve shifting: a short low thump with a little metallic click on top (level already by distance). */
  private clunk(at: number, level: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.12);
    const c = ctx.createGain();
    c.gain.value = 0.3;
    src.connect(lp).connect(g);
    src.connect(bp).connect(c).connect(g);
    // Past the voices (whose level is still rising or falling), into the wheelhouse muffle.
    g.connect(this.muffle!);
    src.start(at, Math.random() * 1.5, 0.15);
  }
}

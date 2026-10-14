import { mixer } from './mixer';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { loadDieselWorklet } from './dieselWorklet';

/** What the engine is doing, for the sound. */
export interface EngineSoundInput {
  rpm: number;
  /** Fuel rack 0..1 - how hard it is working. */
  load: number;
  ratedRpm: number;
  running: boolean;
  cranking: boolean;
  /**
   * How far under water the wet-exhaust outlet is, 0 (in the air) .. 1 (well under). As the
   * stern squats or dips into a wave, the exhaust note goes muffled and burbling.
   */
  submerged?: number;
}

/**
 * Synthesised marine diesel, no audio files:
 *
 *   diesel worklet ─ ch0 exhaust pulses ─► high-pass 45 Hz ─► resonances (110, 150 Hz) ─► low-pass
 *                  │                       (opens with rpm and load) ─► soft clip ─► thump ─┬─ dry ──────────────┐
 *                  │                                                                          └─ low-pass 220 Hz ─ muffled ─┤
 *                  ├ ch1 injector clicks ─► high-pass ─► presence peak (3.2 kHz) ─► clatter ─────────────────────┤
 *                  └ ch2 exhaust bubbles ─► low-pass 1.2 kHz ─► burble ───────────────────────────────────────────┤
 *   starter motor whine (while cranking) ─────────────────────────────────────────────────────────────────────┤
 *   noise ─► band-pass (intake rush, with load) ─────────────────────────────────────────────────────────────┼─► master
 *
 * Voiced as a working fishing boat's naturally aspirated diesel: no turbo whistle, a dark,
 * round exhaust note with a resonant stack "pop", lumpy uneven beats and little clatter.
 *
 * Wet exhaust: the outlet is in the transom just above the waterline. When it dips under
 * (stern squat, a passing wave, pitching), the note goes dull and burbling: the dry path
 * fades, a low-passed copy and the exhaust-bubble channel come up. It always gurgles a
 * little while running (the cooling water leaving with the gas).
 * The worklet is what makes it "meaty": real, uneven firing pulses (see dieselWorklet.ts),
 * so you hear each cylinder thump at idle and a hard, gritty bark under load. Where
 * AudioWorklet isn't available it falls back to two oscillators (the old, thinner sound).
 *
 * Built on any BaseAudioContext, so it can also be rendered offline for checking levels.
 */
/** Level of the mechanical noise floor (tuned against the reference recording). */
const MECH = 0.15;

export class EngineSound {
  private constructor(
    private readonly ctx: BaseAudioContext,
    readonly master: GainNode,
    private readonly worklet: AudioWorkletNode | null,
    private readonly fallback: { osc1: OscillatorNode; osc2: OscillatorNode } | null,
    private readonly bodyLp: BiquadFilterNode,
    private readonly thump: GainNode,
    private readonly clatter: GainNode,
    private readonly starter: OscillatorNode,
    private readonly starterGain: GainNode,
    private readonly hiss: GainNode,
    private readonly dry: GainNode,
    private readonly muffled: GainNode,
    private readonly burble: GainNode,
    private readonly mech: GainNode,
  ) {}

  static async create(ctx: BaseAudioContext, destination: AudioNode): Promise<EngineSound> {
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(destination);

    // ── Combustion: body resonance, low-pass, a little saturation ──
    const dcBlock = ctx.createBiquadFilter();
    dcBlock.type = 'highpass';
    // Headset speakers can't play the 30 Hz idle fundamental: cut below ~45 Hz and push the
    // harmonics around 110 and 220 Hz (exhaust resonances) that carry the "meat" instead.
    dcBlock.frequency.value = 45;
    dcBlock.Q.value = 0.7;
    // A second high-pass: the cylinder imbalance makes a half-firing line (~22 Hz at 900
    // rpm) that a hull and real speakers don't pass (absent in the reference recording).
    const dcBlock2 = ctx.createBiquadFilter();
    dcBlock2.type = 'highpass';
    dcBlock2.frequency.value = 36;
    dcBlock2.Q.value = 0.7;
    const body = ctx.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 110;
    body.Q.value = 0.9;
    body.gain.value = 4;
    const body2 = ctx.createBiquadFilter();
    body2.type = 'peaking';
    // Exhaust stack resonance: the hollow "pop" of each beat.
    body2.frequency.value = 150;
    body2.Q.value = 2.2;
    body2.gain.value = 3;
    const bodyLp = ctx.createBiquadFilter();
    bodyLp.type = 'lowpass';
    bodyLp.Q.value = 0.7;
    bodyLp.frequency.value = 300;
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClip(1.6);
    shaper.oversample = '2x';
    const thump = ctx.createGain();
    thump.gain.value = 0;
    dcBlock.connect(dcBlock2).connect(body).connect(body2).connect(bodyLp).connect(shaper).connect(thump);
    // Exhaust in the air (dry) or under water (muffled): crossfaded by `submerged`.
    const dry = ctx.createGain();
    dry.gain.value = 1;
    thump.connect(dry).connect(master);
    const underLp = ctx.createBiquadFilter();
    underLp.type = 'lowpass';
    underLp.frequency.value = 220;
    underLp.Q.value = 0.5;
    const muffled = ctx.createGain();
    muffled.gain.value = 0;
    thump.connect(underLp).connect(muffled).connect(master);
    // Exhaust bubbles (worklet channel 2).
    const burbleLp = ctx.createBiquadFilter();
    burbleLp.type = 'lowpass';
    burbleLp.frequency.value = 1200;
    const burble = ctx.createGain();
    burble.gain.value = 0;
    burbleLp.connect(burble).connect(master);

    // ── Mechanical noise floor (worklet channel 3): 200 Hz - 2 kHz, falling with frequency ──
    const mechHp = ctx.createBiquadFilter();
    mechHp.type = 'highpass';
    mechHp.frequency.value = 180;
    mechHp.Q.value = 0.6;
    const mechLp = ctx.createBiquadFilter();
    mechLp.type = 'lowpass';
    mechLp.frequency.value = 900;
    mechLp.Q.value = 0.5;
    const mechLp2 = ctx.createBiquadFilter();
    mechLp2.type = 'lowpass';
    mechLp2.frequency.value = 4500;
    mechLp2.Q.value = 0.5;
    const mech = ctx.createGain();
    mech.gain.value = 0;
    mechHp.connect(mechLp).connect(mechLp2).connect(mech).connect(master);

    // ── Clatter ──
    const clickHp = ctx.createBiquadFilter();
    clickHp.type = 'highpass';
    clickHp.frequency.value = 1200;
    const clickPeak = ctx.createBiquadFilter();
    clickPeak.type = 'peaking';
    clickPeak.frequency.value = 3200;
    clickPeak.Q.value = 1.2;
    clickPeak.gain.value = 6;
    const clatter = ctx.createGain();
    clatter.gain.value = 0;
    clickHp.connect(clickPeak).connect(clatter).connect(master);

    let worklet: AudioWorkletNode | null = null;
    let fallback: { osc1: OscillatorNode; osc2: OscillatorNode } | null = null;
    if (await loadDieselWorklet(ctx)) {
      worklet = new AudioWorkletNode(ctx, 'diesel', { numberOfInputs: 0, outputChannelCount: [4] });
      const split = ctx.createChannelSplitter(4);
      worklet.connect(split);
      split.connect(dcBlock, 0);
      split.connect(clickHp, 1);
      split.connect(burbleLp, 2);
      split.connect(mechHp, 3);
    } else {
      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      const osc2 = ctx.createOscillator();
      osc2.type = 'square';
      const sub = ctx.createGain();
      sub.gain.value = 0.35;
      osc1.connect(dcBlock);
      osc2.connect(sub).connect(dcBlock);
      osc1.start();
      osc2.start();
      fallback = { osc1, osc2 };
    }

    // ── Starter motor ──
    const starter = ctx.createOscillator();
    starter.type = 'sawtooth';
    starter.frequency.value = 160;
    const starterBp = ctx.createBiquadFilter();
    starterBp.type = 'bandpass';
    starterBp.frequency.value = 700;
    starterBp.Q.value = 0.8;
    const starterGain = ctx.createGain();
    starterGain.gain.value = 0;
    starter.connect(starterBp).connect(starterGain).connect(master);
    starter.start();

    // ── Intake / exhaust rush ──
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, 2);
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 900;
    band.Q.value = 0.6;
    const hiss = ctx.createGain();
    hiss.gain.value = 0;
    noise.connect(band).connect(hiss).connect(master);
    noise.start();

    return new EngineSound(ctx, master, worklet, fallback, bodyLp, thump, clatter, starter, starterGain, hiss, dry, muffled, burble, mech);
  }

  private lastSub = 0;

  /** @param level overall level (distance attenuation etc.); @param t schedule time (default now) */
  set(e: EngineSoundInput, level: number, t = this.ctx.currentTime): void {
    const smooth = 0.06;
    const rpm = Math.max(0, e.rpm);
    const rpmFrac = Math.min(1, rpm / e.ratedRpm);
    const turning = e.running || e.cranking || rpm > 20;
    const load = e.running ? e.load : 0;

    if (this.worklet) {
      const p = this.worklet.parameters;
      p.get('rpm')!.setTargetAtTime(rpm, t, smooth);
      p.get('load')!.setTargetAtTime(load, t, 0.1);
      p.get('firing')!.setValueAtTime(e.running ? 1 : 0, t);
    } else if (this.fallback) {
      this.fallback.osc1.frequency.setTargetAtTime(Math.max(1, rpm / 20), t, smooth);
      this.fallback.osc2.frequency.setTargetAtTime(Math.max(1, rpm / 40), t, smooth);
    }
    // Brighter and harder as it revs and digs in.
    this.bodyLp.frequency.setTargetAtTime(190 + 320 * rpmFrac + 380 * load, t, smooth);
    this.thump.gain.setTargetAtTime(turning ? 0.65 + 0.25 * rpmFrac + 0.35 * load : 0, t, 0.1);
    this.clatter.gain.setTargetAtTime(e.running ? 0.05 + 0.02 * rpmFrac : 0, t, 0.1);
    this.mech.gain.setTargetAtTime(turning ? MECH * (0.6 + 0.4 * rpmFrac + 0.3 * load) : 0, t, 0.1);
    // Wet exhaust: dry bark in the air, dull and burbling under water. Under goes fast (the
    // outlet floods), back out a little slower (the water has to clear).
    const sub = Math.min(1, Math.max(0, e.submerged ?? 0));
    const k = sub > this.lastSub ? 0.04 : 0.12;
    this.lastSub = sub;
    this.dry.gain.setTargetAtTime(1 - 0.8 * sub, t, k);
    this.muffled.gain.setTargetAtTime(1.1 * sub, t, k);
    this.burble.gain.setTargetAtTime(e.running ? (0.04 + 0.32 * sub) * (0.6 + 0.4 * load) : 0, t, k);
    this.starter.frequency.setTargetAtTime(120 + rpm * 1.4, t, 0.05);
    this.starterGain.gain.setTargetAtTime(e.cranking ? 0.06 : 0, t, 0.04);
    this.hiss.gain.setTargetAtTime(e.running ? 0.002 + 0.008 * load * rpmFrac : 0, t, 0.2);
    this.master.gain.setTargetAtTime(level, t, 0.1);
  }
}

/**
 * The boat's engine sound, on the shared AudioContext. Browsers only allow audio after a
 * user gesture; `unlock()` is called from the first click/key press and from entering VR.
 */
export class EngineAudio {
  private ctx: AudioContext | null = null;
  private sound: EngineSound | null = null;

  /** The shared AudioContext (null until a user gesture has unlocked audio). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    void EngineSound.create(this.ctx, mixer.bus(this.ctx, 'engine')).then((s) => (this.sound = s));
  }

  /**
   * @param distance  metres from the listener to the engine room
   * @param submerged how far under water the exhaust outlet is, 0..1 (see App)
   */
  update(v: VesselState | undefined, distance: number, submerged = 0): void {
    if (!this.sound || !v) return;
    const e = v.engine;
    this.sound.set(
      { rpm: e.rpm, load: e.rack, ratedRpm: VESSEL_DEFS[v.defId].engine.ratedRpm, running: e.phase === 'running', cranking: e.phase === 'cranking', submerged },
      0.42 / (1 + distance / 8),
    );
  }
}

/** Shared looping white-noise buffer. */
export function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** tanh soft-clip curve: adds harmonics (grit) to loud pulses without hard clipping. */
function softClip(drive: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / Math.tanh(drive);
  }
  return curve;
}

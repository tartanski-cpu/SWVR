import { mixer } from './mixer';
import { noiseBuffer } from './engineAudio';

/**
 * The harbour tug's engine room machinery, synthesised (no audio files; owner, 27 Oct 2026,
 * her start-up's part 2). Her main engines are the boat's own engine sound; these are what
 * comes to life around them as she's started (plant/plant.ts):
 *
 *   generator    a small four-cylinder diesel at 1500 rpm: its firing note (50 Hz) as a
 *                low-passed sawtooth with some band-passed clatter, pitch and level rising
 *                as it runs up, steady once it's on line
 *   fans         the supply fans, on the live switchboard: a broad low roar of air
 *   compressor   the starting air compressor filling the bottles: a two-cylinder chug
 *                (a low sawtooth beaten at its strokes), easing off as they fill
 *   start air    each main engine's start: a sharp blast of air, a second or so, fading
 *
 * Loud below (the engine room is all around you), faint and muffled on deck (through the
 * hull), silent elsewhere. Every voice is always wired; silent ones cost next to nothing.
 */
export interface PlantSound {
  /** The generator: 0 stopped .. 1 running at speed (running up in between). */
  gen: number;
  /** The switchboard live (the fans run). */
  fans: boolean;
  /** The compressor running, and how full the bottles are (0..1). */
  compressor: boolean;
  airFull: number;
  /** A main engine's start began this frame (the starting air's blast). */
  airStart: boolean;
  /** Where you are: below in her engine room, aboard her on deck, or neither. */
  where: 'below' | 'deck' | 'away';
}

export class PlantAudio {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private muffle: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private gen: { osc: OscillatorNode; clatter: BiquadFilterNode; gain: GainNode } | null = null;
  private fans: GainNode | null = null;
  private comp: { osc: OscillatorNode; beat: OscillatorNode; gain: GainNode } | null = null;

  attach(ctx: AudioContext | null): void {
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    this.noise = noiseBuffer(ctx, 2);
    // Everything through one level (below / on deck) and a muffle (through the hull).
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(this.muffle).connect(mixer.bus(ctx, 'engine'));
    const loop = () => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.start(0, Math.random() * 1.5);
      return src;
    };
    // The generator: its firing note, and the clatter of its valve gear and injectors.
    {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 50;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      const clatter = ctx.createBiquadFilter();
      clatter.type = 'bandpass';
      clatter.frequency.value = 1400;
      clatter.Q.value = 1.2;
      const cg = ctx.createGain();
      cg.gain.value = 0.18;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(lp).connect(gain);
      loop().connect(clatter).connect(cg).connect(gain);
      gain.connect(this.out);
      osc.start();
      this.gen = { osc, clatter, gain };
    }
    // The fans: air, low and broad.
    {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      loop().connect(lp).connect(gain).connect(this.out);
      this.fans = gain;
    }
    // The compressor: a low note beaten at its strokes.
    {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 36;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      const beatGain = ctx.createGain();
      beatGain.gain.value = 0.5;
      const beat = ctx.createOscillator();
      beat.type = 'square';
      beat.frequency.value = 12;
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      beat.connect(depth).connect(beatGain.gain);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(lp).connect(beatGain).connect(gain).connect(this.out);
      osc.start();
      beat.start();
      this.comp = { osc, beat, gain };
    }
  }

  /** Each frame, from her state (App). */
  update(s: PlantSound | null): void {
    const ctx = this.ctx;
    if (!ctx || !this.out || !this.muffle || !this.gen || !this.fans || !this.comp) return;
    const now = ctx.currentTime;
    const where = s?.where ?? 'away';
    this.out.gain.setTargetAtTime(where === 'below' ? 1 : where === 'deck' ? 0.25 : 0, now, 0.25);
    this.muffle.frequency.setTargetAtTime(where === 'below' ? 20000 : 500, now, 0.2);
    if (!s) return;
    // Generator: pitch from a third of its speed up to full as it runs up.
    const g = Math.max(0, Math.min(1, s.gen));
    this.gen.osc.frequency.setTargetAtTime(50 * (0.35 + 0.65 * g), now, 0.15);
    this.gen.clatter.frequency.setTargetAtTime(900 + 500 * g, now, 0.2);
    this.gen.gain.gain.setTargetAtTime(g > 0 ? 0.12 + 0.16 * g : 0, now, g > 0 ? 0.3 : 0.6);
    this.fans.gain.setTargetAtTime(s.fans ? 0.09 : 0, now, s.fans ? 1.2 : 0.8);
    // Compressor: working hard on empty bottles, easing as they fill.
    this.comp.gain.gain.setTargetAtTime(s.compressor ? 0.16 * (1 - 0.5 * s.airFull) : 0, now, 0.25);
    this.comp.beat.frequency.setTargetAtTime(12 - 3 * s.airFull, now, 0.5);
    if (s.airStart) this.blast(now);
  }

  /** A main engine's start: the starting air's blast, a second or so. */
  private blast(at: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.5, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, at + 1.3);
    src.connect(bp).connect(g).connect(this.out!);
    src.start(at, Math.random() * 0.5, 1.4);
  }
}

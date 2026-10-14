import { mixer } from './mixer';
/**
 * Ship's horn: two detuned low sawtooth tones a major third apart (~150 / 188 Hz) with a
 * little 2nd harmonic, low-passed - a workboat "whistle" rather than a car hooter.
 * Shares the AudioContext created by EngineAudio.unlock().
 */
export class HornAudio {
  private ctx: AudioContext | null = null;
  private gain!: GainNode;

  attach(ctx: AudioContext | null): void {
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    filter.connect(this.gain).connect(mixer.bus(ctx, 'effects'));
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
      o.connect(g).connect(filter);
      o.start();
    }
  }

  update(on: boolean, distance: number): void {
    if (!this.ctx) return;
    const att = 1 / (1 + distance / 15);
    this.gain.gain.setTargetAtTime(on ? 0.35 * att : 0, this.ctx.currentTime, on ? 0.03 : 0.12);
  }
}

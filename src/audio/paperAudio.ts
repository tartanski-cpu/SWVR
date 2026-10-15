import { mixer } from './mixer';
import { noiseBuffer } from './engineAudio';

/**
 * Paper sounds at the chart table, synthesised: a pencil tick (a tiny filtered click), a
 * signature (a pen scratching: band-passed noise with a quick ragged wobble, ~0.7 s), and
 * a page turned (a soft swish).
 */
export class PaperAudio {
  private ctx: AudioContext | null = null;
  private noise!: AudioBuffer;

  attach(ctx: AudioContext | null): void {
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    this.noise = noiseBuffer(ctx, 2);
  }

  private burst(at: number, len: number, freq: number, q: number, level: number, wobble = 0): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    if (wobble > 0) {
      // Strokes of the pen: the level jumps about at `wobble` Hz.
      for (let t = 0; t < len; t += 1 / wobble) g.gain.setValueAtTime(level * (0.3 + 0.7 * Math.random()), at + t);
    } else g.gain.linearRampToValueAtTime(level, at + len * 0.3);
    g.gain.linearRampToValueAtTime(0, at + len);
    src.connect(bp).connect(g).connect(mixer.bus(ctx, 'effects'));
    src.start(at, Math.random());
    src.stop(at + len + 0.05);
  }

  play(kind: 'tick' | 'sign' | 'page'): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const at = ctx.currentTime;
    if (kind === 'tick') this.burst(at, 0.05, 3200, 2, 0.25);
    else if (kind === 'sign') this.burst(at + 0.25, 0.65, 2600, 1.2, 0.22, 18);
    else this.burst(at, 0.3, 1200, 0.7, 0.18);
  }
}

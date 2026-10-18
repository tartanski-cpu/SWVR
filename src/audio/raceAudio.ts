import { CONFIG } from '../config';
import { mixer } from './mixer';

/**
 * A tidal race's roar (world/currents.ts): low, broken water noise that rises with the
 * race's strength and comes up as you near the zone, so from the approach you hear whether
 * it's running before you can see it. Two bands of the same brown noise the wind uses: a
 * deep rumble and a mid "rushing" band that opens up at full strength. Muffled inside.
 */
export class RaceAudio {
  private ctx: AudioContext | null = null;
  private low!: GainNode;
  private mid!: GainNode;
  private midLp!: BiquadFilterNode;

  attach(ctx: AudioContext | null): void {
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      b = 0.985 * b + (Math.random() * 2 - 1) * 0.18;
      d[i] = b;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lowLp = ctx.createBiquadFilter();
    lowLp.type = 'lowpass';
    lowLp.frequency.value = 160;
    const midBp = ctx.createBiquadFilter();
    midBp.type = 'bandpass';
    midBp.frequency.value = 480;
    midBp.Q.value = 0.9;
    this.midLp = ctx.createBiquadFilter();
    this.midLp.type = 'lowpass';
    this.midLp.frequency.value = 3000;
    this.low = ctx.createGain();
    this.mid = ctx.createGain();
    this.low.gain.value = 0;
    this.mid.gain.value = 0;
    const out = mixer.bus(ctx, 'effects');
    src.connect(lowLp).connect(this.low).connect(out);
    src.connect(midBp).connect(this.midLp).connect(this.mid).connect(out);
    src.start();
  }

  /**
   * @param level  0..1: the race's strength where you are, faded by distance outside it
   * @param inside in the wheelhouse; `closed` how shut-in it is (0..1)
   */
  update(level: number, inside: boolean, closed = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const g = CONFIG.currents.roar.gain * level * (inside ? 0.45 - 0.25 * closed : 1);
    this.low.gain.setTargetAtTime(g, t, 0.5);
    this.mid.gain.setTargetAtTime(g * 0.6 * level, t, 0.5);
    this.midLp.frequency.setTargetAtTime(inside ? 900 - 500 * closed : 3000, t, 0.3);
  }
}

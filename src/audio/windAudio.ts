import { mixer } from './mixer';

/**
 * Wind noise: two bands of noise (a low rumble and a higher whistle in the rigging) whose
 * level rises with the apparent wind - nothing below a light breeze, a steady roar in a
 * gale - and which gust: a slow random swell on the level. Quieter inside the wheelhouse.
 */
export class WindAudio {
  private ctx: AudioContext | null = null;
  private low!: GainNode;
  private high!: GainNode;
  private highBp!: BiquadFilterNode;
  private gust = 0.5;
  private gustTarget = 0.5;
  private gustT = 0;

  attach(ctx: AudioContext | null): void {
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    // Brownish noise (integrated white): more body than hiss.
    let b = 0;
    for (let i = 0; i < len; i++) {
      b = 0.97 * b + (Math.random() * 2 - 1) * 0.25;
      d[i] = b;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lowLp = ctx.createBiquadFilter();
    lowLp.type = 'lowpass';
    lowLp.frequency.value = 350;
    this.highBp = ctx.createBiquadFilter();
    this.highBp.type = 'bandpass';
    this.highBp.frequency.value = 900;
    this.highBp.Q.value = 1.4;
    this.low = ctx.createGain();
    this.high = ctx.createGain();
    this.low.gain.value = 0;
    this.high.gain.value = 0;
    const out = mixer.bus(ctx, 'effects');
    src.connect(lowLp).connect(this.low).connect(out);
    src.connect(this.highBp).connect(this.high).connect(out);
    src.start();
  }

  /**
   * @param apparent apparent wind speed where you are (m/s)
   * @param inside   inside the wheelhouse (muffled)
   */
  update(apparent: number, inside: boolean, dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // Gusts: a new random target every couple of seconds, eased toward.
    this.gustT -= dt;
    if (this.gustT <= 0) {
      this.gustT = 1.5 + Math.random() * 2.5;
      this.gustTarget = 0.6 + Math.random() * 0.8;
    }
    this.gust += (this.gustTarget - this.gust) * Math.min(1, dt * 0.8);
    const w = Math.max(0, apparent - 3) * this.gust; // nothing in a light breeze
    const level = Math.min(1, Math.pow(w / 18, 1.5)) * (inside ? 0.35 : 1);
    const t = ctx.currentTime;
    this.low.gain.setTargetAtTime(level * 0.5, t, 0.3);
    this.high.gain.setTargetAtTime(level * 0.18 * Math.min(1, w / 10), t, 0.3);
    this.highBp.frequency.setTargetAtTime(700 + w * 40, t, 0.5);
  }
}

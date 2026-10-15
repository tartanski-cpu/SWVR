import { mixer } from './mixer';

/**
 * Weather sounds. Wind noise: two bands of noise (a low rumble and a higher whistle in the rigging) whose
 * level rises with the apparent wind - nothing below a light breeze, a steady roar in a
 * gale - and which gust: a slow random swell on the level. Quieter inside the wheelhouse.
 * Rain: a bright hiss outside; inside, a duller drumming on the roof. Thunder: a crack
 * (close strikes) and a long low rumble, after the flash by distance / speed of sound.
 */
export class WindAudio {
  private ctx: AudioContext | null = null;
  private low!: GainNode;
  private high!: GainNode;
  private highBp!: BiquadFilterNode;
  private gust = 0.5;
  private gustTarget = 0.5;
  private gustT = 0;
  private rain!: GainNode;
  private rainLp!: BiquadFilterNode;
  private white: AudioBuffer | null = null;

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
    // Rain: white noise, high-passed (hiss); the low-pass closes down inside (roof drum).
    const wlen = ctx.sampleRate * 2;
    this.white = ctx.createBuffer(1, wlen, ctx.sampleRate);
    const wd = this.white.getChannelData(0);
    for (let i = 0; i < wlen; i++) wd[i] = Math.random() * 2 - 1;
    const rsrc = ctx.createBufferSource();
    rsrc.buffer = this.white;
    rsrc.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 500;
    this.rainLp = ctx.createBiquadFilter();
    this.rainLp.type = 'lowpass';
    this.rainLp.frequency.value = 8000;
    this.rain = ctx.createGain();
    this.rain.gain.value = 0;
    rsrc.connect(hp).connect(this.rainLp).connect(this.rain).connect(out);
    rsrc.start();
  }

  /**
   * Rain level 0..1 where you are; inside, it drums on the roof instead of hissing.
   * `closed`: how shut-in the wheelhouse is, 0 (door and windows open) .. 1 (both shut).
   */
  setRain(rain: number, inside: boolean, closed = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    // Shut in, the drumming on the roof is duller and quieter.
    this.rain.gain.setTargetAtTime(rain * (inside ? 0.22 - 0.13 * closed : 0.14), t, 0.4);
    this.rainLp.frequency.setTargetAtTime(inside ? 1400 - 850 * closed : 8000, t, 0.2);
  }

  /** Thunder from a flash `dist` m away (call at the flash: it waits for the sound). */
  thunder(dist: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.white) return;
    const at = ctx.currentTime + dist / 343;
    const near = Math.max(0, 1 - dist / 4500);
    const out = mixer.bus(ctx, 'effects');
    // Rumble: low-passed noise swelling and dying away over several seconds.
    const len = 3 + 4 * (1 - near);
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 120 + 250 * near;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.9 * (0.3 + near), at + 0.15 + (1 - near) * 0.8);
    g.gain.exponentialRampToValueAtTime(0.001, at + len);
    src.connect(lp).connect(g).connect(out);
    src.start(at);
    src.stop(at + len + 0.1);
    // A close strike cracks first.
    if (near > 0.6) {
      const c = ctx.createBufferSource();
      c.buffer = this.white;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.5 * near, at);
      cg.gain.exponentialRampToValueAtTime(0.001, at + 0.35);
      c.connect(bp).connect(cg).connect(out);
      c.start(at);
      c.stop(at + 0.4);
    }
  }

  /**
   * @param apparent apparent wind speed where you are (m/s)
   * @param inside   inside the wheelhouse (muffled)
   * @param closed   how shut-in it is, 0 (door and windows open) .. 1 (both shut)
   */
  update(apparent: number, inside: boolean, dt: number, closed = 0): void {
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
    const level = Math.min(1, Math.pow(w / 18, 1.5)) * (inside ? 0.35 - 0.28 * closed : 1);
    const t = ctx.currentTime;
    this.low.gain.setTargetAtTime(level * 0.5, t, 0.3);
    this.high.gain.setTargetAtTime(level * 0.18 * Math.min(1, w / 10), t, 0.3);
    this.highBp.frequency.setTargetAtTime(700 + w * 40, t, 0.5);
  }
}

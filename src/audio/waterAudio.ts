/**
 * Water noise around the hull, from filtered noise (no files): a rushing hiss that grows
 * with speed through the water, and a splash burst when the bow slams. Shares the
 * AudioContext created by EngineAudio.
 */
export class WaterAudio {
  private ctx: AudioContext | null = null;
  private rush!: GainNode;
  private rushFilter!: BiquadFilterNode;
  private splash!: GainNode;
  private cooldown = 0;

  attach(ctx: AudioContext | null): void {
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Slightly pink-ish noise: a one-pole low-pass of white noise, mixed with some white.
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = 0.97 * last + 0.03 * w;
      data[i] = last * 6 + w * 0.25;
    }
    const source = (): AudioBufferSourceNode => {
      const s = ctx.createBufferSource();
      s.buffer = buffer;
      s.loop = true;
      s.playbackRate.value = 0.9 + Math.random() * 0.2;
      s.start();
      return s;
    };
    this.rushFilter = ctx.createBiquadFilter();
    this.rushFilter.type = 'lowpass';
    this.rushFilter.frequency.value = 500;
    this.rush = ctx.createGain();
    this.rush.gain.value = 0;
    source().connect(this.rushFilter).connect(this.rush).connect(ctx.destination);

    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 1800;
    hp.Q.value = 0.6;
    this.splash = ctx.createGain();
    this.splash.gain.value = 0;
    source().connect(hp).connect(this.splash).connect(ctx.destination);
  }

  /** @param speed through the water (m/s); @param slam 0..1 this frame; @param distance listener (m) */
  update(speed: number, slam: number, distance: number, dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const att = 1 / (1 + distance / 10);
    const v = Math.min(1, speed / 5);
    this.rush.gain.setTargetAtTime(0.12 * v * v * att, now, 0.3);
    this.rushFilter.frequency.setTargetAtTime(350 + 900 * v, now, 0.3);
    if (slam > 0.05 && this.cooldown === 0) {
      this.splash.gain.cancelScheduledValues(now);
      this.splash.gain.setValueAtTime(0.5 * (0.3 + 0.7 * slam) * att, now);
      this.splash.gain.exponentialRampToValueAtTime(0.001, now + 0.6 + 0.4 * slam);
      this.cooldown = 0.25;
    }
  }
}

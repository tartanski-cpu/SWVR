import { mixer } from './mixer';

/**
 * Fire missions' sound, all from one looping noise buffer:
 *   roar  the fire: low, rumbling noise with a slow crackle (a band-pass that wanders),
 *         loudness with the fire's intensity and falling off with distance;
 *   jet   the monitor: a steady high hiss while water flows (near the boat, so it's loud
 *         on deck and muffled in the wheelhouse like everything outside).
 */
export class FireAudio {
  private ctx: AudioContext | null = null;
  private roar: GainNode | null = null;
  private crackle: BiquadFilterNode | null = null;
  private jet: GainNode | null = null;

  attach(ctx: AudioContext | null): void {
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    const out = mixer.bus(ctx, 'effects');
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = () => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start();
      return s;
    };
    // Fire roar: low-passed rumble plus a crackling band.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    this.crackle = ctx.createBiquadFilter();
    this.crackle.type = 'bandpass';
    this.crackle.frequency.value = 1400;
    this.crackle.Q.value = 3;
    const crackleGain = ctx.createGain();
    crackleGain.gain.value = 0.25;
    this.roar = ctx.createGain();
    this.roar.gain.value = 0;
    src().connect(lp).connect(this.roar);
    src().connect(this.crackle).connect(crackleGain).connect(this.roar);
    this.roar.connect(out);
    // Jet hiss.
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 2600;
    hp.Q.value = 0.7;
    this.jet = ctx.createGain();
    this.jet.gain.value = 0;
    src().connect(hp).connect(this.jet).connect(out);
  }

  /**
   * @param fire     fire intensity 0..1 (0: none)
   * @param fireDist distance to it (m)
   * @param jet      water flowing from the monitor
   * @param muffle   0..1, shut in the wheelhouse
   */
  update(fire: number, fireDist: number, jet: boolean, muffle: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.roar || !this.jet || !this.crackle) return;
    const t = ctx.currentTime;
    const near = 1 / (1 + fireDist / 25);
    this.roar.gain.setTargetAtTime(fire * near * 0.9 * (1 - 0.5 * muffle), t, 0.3);
    this.crackle.frequency.setTargetAtTime(900 + Math.random() * 1800, t, 0.05);
    this.jet.gain.setTargetAtTime(jet ? 0.12 * (1 - 0.6 * muffle) : 0, t, 0.25);
  }
}

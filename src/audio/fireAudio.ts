import { mixer } from './mixer';

/**
 * Fire missions' sound, all from one looping noise buffer:
 *   roar  the fire: low, rumbling noise with a slow crackle (a band-pass that wanders),
 *         loudness with the fire's intensity and falling off with distance;
 *   jet   the monitor: a steady high hiss while water flows (near the boat, so it's loud
 *         on deck and muffled in the wheelhouse like everything outside).
 *   steam the jet landing on the fire: a sharp, sputtering sizzle, louder the more water
 *         lands on it (owner: better feedback). It is the "you're on target" cue, so it
 *         falls off with distance much less than the roar does: you hear it from the helm.
 */
export class FireAudio {
  private ctx: AudioContext | null = null;
  private roar: GainNode | null = null;
  private crackle: BiquadFilterNode | null = null;
  private jet: GainNode | null = null;
  private steam: GainNode | null = null;
  private sputter: GainNode | null = null;

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
    // Steam: high band-passed noise, its level chopped by a fast random wobble (sputter).
    const sb = ctx.createBiquadFilter();
    sb.type = 'bandpass';
    sb.frequency.value = 4800;
    sb.Q.value = 1.4;
    this.sputter = ctx.createGain();
    this.sputter.gain.value = 1;
    this.steam = ctx.createGain();
    this.steam.gain.value = 0;
    src().connect(sb).connect(this.sputter).connect(this.steam).connect(out);
  }

  /**
   * @param fire     fire intensity 0..1 (0: none)
   * @param fireDist distance to it (m)
   * @param jet      water flowing from the monitor
   * @param muffle   0..1, shut in the wheelhouse
   * @param wet      fraction of the jet landing on the fire (0..1)
   */
  update(fire: number, fireDist: number, jet: boolean, muffle: number, wet = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.roar || !this.jet || !this.crackle || !this.steam || !this.sputter) return;
    const t = ctx.currentTime;
    const near = 1 / (1 + fireDist / 25);
    this.roar.gain.setTargetAtTime(fire * near * 0.9 * (1 - 0.5 * muffle), t, 0.3);
    this.crackle.frequency.setTargetAtTime(900 + Math.random() * 1800, t, 0.05);
    this.jet.gain.setTargetAtTime(jet ? 0.12 * (1 - 0.6 * muffle) : 0, t, 0.25);
    // Steam: a gentle fall-off (half as loud at 120 m), never below a floor while it's hit.
    const hitLevel = wet > 0.05 && fire > 0 ? Math.max(0.35, 1 / (1 + fireDist / 120)) * (0.5 + 0.5 * Math.min(1, wet)) : 0;
    this.steam.gain.setTargetAtTime(hitLevel * 0.3 * (1 - 0.4 * muffle), t, 0.15);
    this.sputter.gain.setTargetAtTime(0.55 + Math.random() * 0.45, t, 0.03);
  }
}

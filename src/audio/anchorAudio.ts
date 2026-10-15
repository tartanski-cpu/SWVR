import { mixer } from './mixer';
import { noiseBuffer } from './engineAudio';
import type { AnchorState } from '../vessel/vesselState';

/**
 * The anchor's sounds, synthesised (no audio files), from the chain's movement:
 *
 *   let go     the chain rattles out over the bow roller: a link clank for every
 *              `LINK` m of chain paid out (at 2 m/s, a fast metallic rattle), and a splash
 *              as the anchor goes in.
 *   heaving in the windlass motor hums (a low, slightly rough buzz) and the links come
 *              in one by one, slower and heavier.
 *   stowed     a last clunk as the anchor seats in the roller.
 *
 * Each clank is a short burst of noise through a narrow band-pass (the ring of steel),
 * pitched a little differently each time, with a low thud under it. Level by distance to
 * the bow, muffled in the wheelhouse like the other outside sounds.
 */
const LINK = 0.06;

export class AnchorAudio {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private muffle: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private motor: GainNode | null = null;
  private motorOsc: OscillatorNode | null = null;
  private lastRode = NaN;
  private lastPhase: AnchorState['phase'] | null = null;
  private acc = 0;

  attach(ctx: AudioContext | null): void {
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    this.noise = noiseBuffer(ctx, 1);
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(this.muffle).connect(mixer.bus(ctx, 'effects'));
    // Windlass motor: a sawtooth buzz, low-passed, with a slow wobble (load on the gypsy).
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 95;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    this.motor = ctx.createGain();
    this.motor.gain.value = 0;
    osc.connect(lp).connect(this.motor).connect(this.out);
    osc.start();
    this.motorOsc = osc;
  }

  /**
   * @param a        the workboat's anchor state (undefined: none)
   * @param distance listener to the bow roller (m)
   * @param muffle   0..1, shut in the wheelhouse
   */
  update(a: AnchorState | undefined, distance: number, muffle: number, dt: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.out || !this.motor || !this.muffle || !a) return;
    const t = ctx.currentTime;
    this.out.gain.setTargetAtTime(1 / (1 + distance / 6), t, 0.1);
    this.muffle.frequency.setTargetAtTime(20000 - 19400 * muffle, t, 0.1);
    // Chain going out (let go: it runs free) or coming in (the windlass, also once the
    // anchor has broken out and hangs).
    const delta = Number.isNaN(this.lastRode) ? 0 : a.rodeM - this.lastRode;
    const moved = Math.abs(delta);
    this.lastRode = a.rodeM;
    const phase = a.phase;
    if (this.lastPhase === 'stowed' && phase === 'paying') this.splash(t + 0.35);
    if (this.lastPhase && this.lastPhase !== 'stowed' && phase === 'stowed') this.clank(t, 0.9, 900);
    this.lastPhase = phase;
    // Windlass hum while heaving in (it labours a little: pitch dips with load).
    const heaving = delta < 0;
    this.motor.gain.setTargetAtTime(heaving ? 0.05 : 0, t, 0.08);
    this.motorOsc!.frequency.setTargetAtTime(heaving ? 88 + 10 * Math.random() : 95, t, 0.2);
    // A clank per link through the roller; at most a few per frame (a slow frame catches up).
    this.acc += moved / LINK;
    let n = 0;
    while (this.acc >= 1 && n < 4) {
      this.acc -= 1;
      const paying = delta > 0;
      this.clank(t + Math.random() * Math.max(dt, 0.01), paying ? 0.25 : 0.45, paying ? 2400 : 1500);
      n++;
    }
    if (this.acc > 4) this.acc = 0;
  }

  /** One link over the roller: a ring of steel and a thud. */
  private clank(at: number, level: number, pitch: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = pitch * (0.8 + 0.4 * Math.random());
    bp.Q.value = 9;
    const thud = ctx.createBiquadFilter();
    thud.type = 'lowpass';
    thud.frequency.value = 220;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.09);
    src.connect(bp).connect(g);
    src.connect(thud).connect(g);
    g.connect(this.out!);
    src.start(at, Math.random() * 0.8, 0.12);
  }

  /** The anchor going in: a short rush of low noise. */
  private splash(at: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, at);
    lp.frequency.exponentialRampToValueAtTime(300, at + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.5, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.6);
    src.connect(lp).connect(g).connect(this.out!);
    src.start(at, 0, 0.65);
  }
}

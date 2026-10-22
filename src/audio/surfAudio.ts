import { CONFIG } from '../config';
import type { SurfHere } from '../world/surf';
import { mixer } from './mixer';

/**
 * Surf on the shore (the coast extras plan, C5; where and how big: world/surf.ts). Each
 * breaker in time with the swell (its period, give or take, every seventh of a set bigger),
 * made of three bands of noise, mixed by what the shore is made of:
 *   boom  a low thump as the breaker lands (rock and cliff most)
 *   wash  the broken water running up the shore and away (sand most), over a low murmur
 *   hiss  spray, and on shingle the stones' rattle as the backwash drags them, after the wash
 * Placed where the surf is (an equal-power panner, cheap; the App keeps the listener at the
 * camera), so you hear which way the shore lies. Muffled in a shut wheelhouse. Faded out
 * while your engine runs (the owner: you don't hear it over the engine).
 */
export class SurfAudio {
  private ctx: AudioContext | null = null;
  private boom!: GainNode;
  private wash!: GainNode;
  private hiss!: GainNode;
  private bed!: GainNode;
  private out!: GainNode;
  private lp!: BiquadFilterNode;
  private panner!: PannerNode;
  private next = 0;
  private count = 0;

  attach(ctx: AudioContext | null): void {
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    const len = ctx.sampleRate * 4;
    const brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const white = ctx.createBuffer(1, len, ctx.sampleRate);
    const bd = brown.getChannelData(0);
    const wd = white.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      b = 0.98 * b + (Math.random() * 2 - 1) * 0.2;
      bd[i] = b;
      wd[i] = Math.random() * 2 - 1;
    }
    const loop = (buf: AudioBuffer) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start();
      return s;
    };
    const filter = (type: BiquadFilterType, f: number, q = 0.7) => {
      const n = ctx.createBiquadFilter();
      n.type = type;
      n.frequency.value = f;
      n.Q.value = q;
      return n;
    };
    const gain = () => {
      const g = ctx.createGain();
      g.gain.value = 0;
      return g;
    };
    this.boom = gain();
    this.wash = gain();
    this.hiss = gain();
    this.bed = gain();
    this.out = gain();
    this.lp = filter('lowpass', 6000);
    this.panner = ctx.createPanner();
    this.panner.panningModel = 'equalpower';
    this.panner.distanceModel = 'linear';
    this.panner.rolloffFactor = 0; // the distance is in the level already (world/surf.ts)
    const brownSrc = loop(brown);
    const whiteSrc = loop(white);
    brownSrc.connect(filter('lowpass', 140)).connect(this.boom).connect(this.out);
    brownSrc.connect(filter('bandpass', 650, 0.6)).connect(this.wash).connect(this.out);
    brownSrc.connect(filter('lowpass', 450)).connect(this.bed).connect(this.out);
    whiteSrc.connect(filter('highpass', 2600)).connect(filter('lowpass', 7000)).connect(this.hiss).connect(this.out);
    this.out.connect(this.lp).connect(this.panner).connect(mixer.bus(ctx, 'effects'));
  }

  /**
   * @param surf      where it breaks and how (world/surf.ts)
   * @param engineOn  your boat's engine running (it fades out)
   * @param inside    in the wheelhouse; `closed` how shut-in (0..1)
   */
  update(surf: SurfHere, engineOn: boolean, inside: boolean, closed: number, listener: { x: number; z: number }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const c = CONFIG.surf;
    const t = ctx.currentTime;
    const level = surf.level * (inside ? 0.5 - 0.3 * closed : 1);
    this.out.gain.setTargetAtTime(engineOn ? 0 : c.gain, t, c.engineFade / 3);
    this.lp.frequency.setTargetAtTime(inside ? 1500 - 900 * closed : 6000, t, 0.3);
    // Where it is (a few metres up, at least 20 m off so it's never inside your head).
    const dx = surf.x - listener.x;
    const dz = surf.z - listener.z;
    const d = Math.hypot(dx, dz);
    const k = surf.level > 0 && d > 1e-3 ? Math.max(20, d) / d : 0;
    this.panner.positionX.setTargetAtTime(listener.x + dx * k, t, 0.5);
    this.panner.positionY.setTargetAtTime(1, t, 0.5);
    this.panner.positionZ.setTargetAtTime(listener.z + (k ? dz * k : 20), t, 0.5);
    this.bed.gain.setTargetAtTime(level * 0.18 * surf.wash, t, 1);
    if (level <= 0.01) {
      this.next = t;
      return;
    }
    if (t < this.next) return;
    // The next breaker: the swell's period, give or take; every seventh bigger (a set).
    this.count++;
    const set = this.count % 7 === 0 ? 1.35 : 0.8 + Math.random() * 0.3;
    const p = surf.period * (0.85 + Math.random() * 0.3);
    this.next = t + p;
    const L = Math.min(1, level * set);
    const env = (g: GainNode, at: number, peak: number, rise: number, fall: number) => {
      g.gain.cancelScheduledValues(at);
      g.gain.setValueAtTime(g.gain.value, at);
      g.gain.linearRampToValueAtTime(peak, at + rise);
      g.gain.setTargetAtTime(0, at + rise, fall);
    };
    env(this.boom, t, L * surf.boom * 0.9, 0.12, 0.35);
    env(this.wash, t + 0.05, L * surf.wash * 0.6, 0.5, p * 0.25);
    // Spray at the crash, then the backwash's rattle as the wash drains (shingle's).
    env(this.hiss, t, L * surf.hiss * 0.25, 0.1, 0.3);
    env(this.hiss, t + p * 0.35, L * surf.hiss * 0.35, p * 0.15, p * 0.12);
  }
}

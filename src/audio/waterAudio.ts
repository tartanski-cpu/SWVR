import { noiseBuffer } from './engineAudio';
import { loadWorklet } from './dieselWorklet';
import { WATER_WORKLET } from './waterWorklet';

/**
 * Water around the hull, synthesised (no files).
 *
 *  Bubbles (waterWorklet.ts): the bright, liquid detail - a stream of individually ringing
 *  bubbles that grows with speed (the bow wave breaking and the wash along the hull), and
 *  splash clusters for slams and laps. This is what makes it sound like splashing water
 *  rather than hiss. Where AudioWorklet is missing, the noise layers below carry it alone.
 *
 *  Continuous, growing with speed through the water:
 *    whoosh - low/mid rush of the bow wave along the hull (band-pass ~350-900 Hz)
 *    fizz   - the high, bubbly hiss of broken water and spray (high-pass ~2.5 kHz)
 *  both slowly and irregularly modulated (a random walk, plus a surge whenever the bow digs
 *  in) so it breathes like moving water instead of a steady hiss.
 *
 *  Events, each built from a few short-lived nodes with fresh random variation:
 *    splash (bow slams into a wave): low thud + mid body + long fizzy tail
 *    lap    (smaller entries, also at rest): a short wet "clop" against the hull - what you
 *           hear at anchor or alongside.
 *
 * Built on any BaseAudioContext, so it can be rendered offline for checking.
 */
export class WaterSound {
  readonly master: GainNode;
  private readonly whoosh: GainNode;
  private readonly whooshBp: BiquadFilterNode;
  private readonly fizz: GainNode;
  private readonly buffer: AudioBuffer;
  private mod = 1;
  private surge = 0;
  private splashCooldown = 0;
  private lapCooldown = 0;
  private bubbles: AudioWorkletNode | null = null;
  private bubbleGain: GainNode | null = null;
  /** Resolves when the bubble worklet is running (or isn't available). */
  readonly ready: Promise<void>;

  constructor(private readonly ctx: BaseAudioContext, destination: AudioNode) {
    this.buffer = noiseBuffer(ctx, 3);
    this.master = ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(destination);

    this.whooshBp = ctx.createBiquadFilter();
    this.whooshBp.type = 'bandpass';
    this.whooshBp.frequency.value = 500;
    this.whooshBp.Q.value = 0.6;
    this.whoosh = ctx.createGain();
    this.whoosh.gain.value = 0;
    this.loop().connect(this.whooshBp).connect(this.whoosh).connect(this.master);

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 6000;
    shelf.gain.value = -8;
    this.fizz = ctx.createGain();
    this.fizz.gain.value = 0;
    this.loop().connect(hp).connect(shelf).connect(this.fizz).connect(this.master);

    this.ready = loadWorklet(ctx, 'water', WATER_WORKLET).then((ok) => {
      if (!ok) return;
      const node = new AudioWorkletNode(ctx, 'water', { numberOfInputs: 0, outputChannelCount: [2] });
      // Take the very top off (the smallest bubbles are glassy on headset speakers).
      const soft = ctx.createBiquadFilter();
      soft.type = 'highshelf';
      soft.frequency.value = 4000;
      soft.gain.value = -4;
      const g = ctx.createGain();
      g.gain.value = 0.7;
      // A gentle compressor so a big slam is loud without clipping.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;
      node.connect(soft).connect(g).connect(comp).connect(this.master);
      this.bubbles = node;
      this.bubbleGain = g;
    });
  }

  private loop(): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.buffer;
    s.loop = true;
    s.playbackRate.value = 0.85 + Math.random() * 0.3;
    s.start(0, Math.random() * 2);
    return s;
  }

  /**
   * @param speed  through the water (m/s)
   * @param slam   bow slam strength this frame, 0..1
   * @param lap    smaller bow entry strength this frame, 0..1
   * @param level  overall level (distance)
   */
  update(speed: number, slam: number, lap: number, level: number, dt: number, t = this.ctx.currentTime): void {
    this.splashCooldown = Math.max(0, this.splashCooldown - dt);
    this.lapCooldown = Math.max(0, this.lapCooldown - dt);
    // Irregular breathing: a bounded random walk, plus a surge when the bow digs in.
    this.mod += (Math.random() - 0.5) * 1.6 * dt + (1 - this.mod) * 0.6 * dt;
    this.mod = Math.min(1.5, Math.max(0.5, this.mod));
    this.surge = Math.max(this.surge * Math.exp(-dt / 0.5), Math.max(slam, lap * 0.6));
    const v = Math.min(1, speed / 5);
    const flow = Math.pow(v, 1.5) * (this.mod + this.surge);
    // With splash events carrying the detail, the noise is a low rushing bed under them, and
    // the high fizz (which on its own sounds like frying) is only a hint at full speed.
    const ev = !!this.bubbles;
    this.whoosh.gain.setTargetAtTime((ev ? 0.17 : 0.24) * flow * level, t, 0.15);
    this.whooshBp.frequency.setTargetAtTime((ev ? 260 : 350) + (ev ? 300 : 500) * v + 200 * this.surge, t, 0.2);
    this.fizz.gain.setTargetAtTime((ev ? 0.012 : 0.07) * Math.pow(v, 2.5) * (0.6 + this.mod * 0.4 + this.surge) * level, t, 0.12);
    if (this.bubbles) {
      const p = this.bubbles.parameters;
      // Splashes against the hull: now and then at rest, about ten a second at speed, in
      // gusts as the bow meets the waves.
      const rate = (0.4 + 9 * Math.pow(v, 1.2)) * (0.6 + 0.4 * this.mod + 1.5 * this.surge);
      p.get('rate')!.setTargetAtTime(rate, t, 0.08);
      this.bubbleGain!.gain.setTargetAtTime(0.7 * level, t, 0.1);
      p.get('size')!.setTargetAtTime(Math.min(1, 0.2 + 0.5 * v + 0.3 * this.surge), t, 0.2);
    }

    if (slam > 0.05 && this.splashCooldown === 0) {
      this.splash(slam, level, t);
      this.splashCooldown = 0.25;
    } else if (lap > 0.05 && this.lapCooldown === 0) {
      this.lap(lap, level, t);
      this.lapCooldown = 0.12 + Math.random() * 0.15;
    }
  }

  /** One burst of filtered noise with an attack/decay envelope. */
  private burst(type: BiquadFilterType, freq: number, q: number, peak: number, attack: number, decay: number, t: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 2);
    src.stop(t + attack + decay + 0.05);
  }

  /** A cluster of bubbles (a splash), strength 0..1, from the worklet. */
  private bubbleBurst(strength: number, t: number): void {
    const b = this.bubbles?.parameters.get('burst');
    if (!b) return;
    b.setValueAtTime(Math.min(1, Math.max(0.01, strength)), t);
    b.setValueAtTime(0, t + 0.02);
  }

  /** Bow slam: a thud, then a big burst of bubbles (or, without the worklet, a fizzy tail). */
  splash(strength: number, level: number, t = this.ctx.currentTime): void {
    const s = (0.35 + 0.65 * strength) * level;
    const r = () => 0.8 + Math.random() * 0.4;
    this.burst('lowpass', 160 * r(), 0.9, 1.0 * s, 0.006, 0.16 * r(), t);
    if (this.bubbles) {
      this.bubbleBurst(0.4 + 0.6 * strength, t + 0.01);
      this.burst('bandpass', 900 * r(), 0.8, 0.25 * s, 0.012, 0.25 * r(), t + 0.01);
    } else {
      this.burst('bandpass', 800 * r(), 0.8, 0.55 * s, 0.012, 0.35 * r(), t + 0.01);
      this.burst('highpass', 2600 * r(), 0.7, 0.22 * s, 0.03, (0.6 + 0.6 * strength) * r(), t + 0.02);
    }
  }

  /** Small wave against the hull: a short wet clop and a little spatter of bubbles. */
  lap(strength: number, level: number, t = this.ctx.currentTime): void {
    const s = (0.25 + 0.75 * strength) * level;
    const r = () => 0.75 + Math.random() * 0.5;
    this.burst('bandpass', 420 * r(), 1.4, 0.7 * s, 0.008, 0.12 * r(), t);
    if (this.bubbles) this.bubbleBurst(0.05 + 0.2 * strength, t + 0.01);
    else this.burst('bandpass', 1300 * r(), 1.0, 0.25 * s, 0.01, 0.18 * r(), t + 0.015);
  }
}

/** The boat's water sounds on the shared AudioContext (attached after audio unlocks). */
export class WaterAudio {
  private sound: WaterSound | null = null;

  attach(ctx: AudioContext | null): void {
    if (!ctx || this.sound) return;
    this.sound = new WaterSound(ctx, ctx.destination);
  }

  /** @param distance listener distance from the boat (m) */
  update(speed: number, slam: number, lap: number, distance: number, dt: number): void {
    this.sound?.update(speed, slam, lap, 1 / (1 + distance / 10), dt);
  }

  /** Something (you, a crate) hitting the water nearby: `strength` 0..1. */
  splash(strength: number, distance = 0): void {
    this.sound?.splash(strength, 1 / (1 + distance / 10));
  }
}

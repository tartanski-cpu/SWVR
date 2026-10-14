import { noiseBuffer } from './engineAudio';
import { loadWorklet } from './dieselWorklet';
import { WATER_WORKLET } from './waterWorklet';

/**
 * Water around the hull, synthesised (no files). Three layers, after Andy Farnell's
 * procedural water ("Designing Sound") and the classic filtered-noise sea:
 *
 *  babble (waterWorklet.ts) - the water working along the hull up close: a few continuous
 *    sine voices whose pitch keeps jumping to random cavity frequencies and gliding up,
 *    the way running water sounds. More voices, jumping faster, as she goes faster; a
 *    gentle trickle and gurgle at rest. Wave hits fire a soft slap and a gush.
 *
 *  rush - the bow wave and the wash along the topsides, the part you hear from further
 *    off: band-passed noise (~250-900 Hz) whose loudness and centre frequency swell at two
 *    slightly different slow rates, so it breathes like a sea instead of hissing steadily;
 *    it surges when the bow digs in.
 *
 *  fizz - broken water and spray, only a hint at full speed (on its own it sounds like
 *    frying).
 *
 *  Events: splash (bow slams into a wave) = low thud + slap and gush; lap (smaller
 *  entries, also at rest) = a short wet clop + a small gush.
 *
 * Where AudioWorklet is missing, the noise layers carry it alone (louder, brighter).
 * Built on any BaseAudioContext, so it can be rendered offline for checking.
 */
export class WaterSound {
  readonly master: GainNode;
  private readonly rush: GainNode;
  private readonly rushBp: BiquadFilterNode;
  private readonly fizz: GainNode;
  private readonly buffer: AudioBuffer;
  private surge = 0;
  private swell = 0;
  private splashCooldown = 0;
  private lapCooldown = 0;
  private babble: AudioWorkletNode | null = null;
  private babbleGain: GainNode | null = null;
  /** Resolves when the babble worklet is running (or isn't available). */
  readonly ready: Promise<void>;

  constructor(private readonly ctx: BaseAudioContext, destination: AudioNode) {
    this.buffer = noiseBuffer(ctx, 3);
    this.master = ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(destination);

    this.rushBp = ctx.createBiquadFilter();
    this.rushBp.type = 'bandpass';
    this.rushBp.frequency.value = 400;
    this.rushBp.Q.value = 0.7;
    const rushLp = ctx.createBiquadFilter();
    rushLp.type = 'lowpass';
    rushLp.frequency.value = 1400;
    this.rush = ctx.createGain();
    this.rush.gain.value = 0;
    this.loop().connect(this.rushBp).connect(rushLp).connect(this.rush).connect(this.master);

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
      // Keep the babble out of the deep bass (that's the slaps' and the engine's) and
      // round off the top.
      const hpB = ctx.createBiquadFilter();
      hpB.type = 'highpass';
      hpB.frequency.value = 140;
      const lpB = ctx.createBiquadFilter();
      lpB.type = 'lowpass';
      lpB.frequency.value = 3200;
      const g = ctx.createGain();
      g.gain.value = 1;
      // A gentle compressor so a big slam is loud without clipping.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;
      node.connect(hpB).connect(lpB).connect(g).connect(comp).connect(this.master);
      this.babble = node;
      this.babbleGain = g;
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
    this.swell += dt;
    this.surge = Math.max(this.surge * Math.exp(-dt / 0.6), Math.max(slam, lap * 0.6));
    const v = Math.min(1, speed / 5);
    // Two slow swells at slightly different rates (amplitude, colour): the sea breathing.
    const a = 0.75 + 0.25 * Math.sin(this.swell * 2 * Math.PI * 0.21) + 0.6 * this.surge;
    const c = 0.5 + 0.5 * Math.sin(this.swell * 2 * Math.PI * 0.29 + 1.1);
    const hasBabble = !!this.babble;
    this.rush.gain.setTargetAtTime((hasBabble ? 0.16 : 0.24) * Math.pow(v, 1.5) * a * level, t, 0.15);
    this.rushBp.frequency.setTargetAtTime(250 + 350 * v + 250 * c + 200 * this.surge, t, 0.25);
    this.fizz.gain.setTargetAtTime((hasBabble ? 0.01 : 0.07) * Math.pow(v, 2.5) * (0.7 + this.surge) * level, t, 0.12);
    if (this.babble) {
      const p = this.babble.parameters;
      // A trickle at rest, a busy babble at speed; it swells with the sea and the surges.
      const flow = Math.min(1, (0.04 + 0.9 * Math.pow(v, 1.2)) * (0.75 + 0.25 * a) + 0.4 * this.surge);
      p.get('flow')!.setTargetAtTime(flow, t, 0.1);
      p.get('pitch')!.setTargetAtTime(0.25 + 0.45 * v, t, 0.3);
      this.babbleGain!.gain.setTargetAtTime(level, t, 0.1);
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

  /** A slap and gush from the worklet, strength 0..1. */
  private gush(strength: number, t: number): void {
    const b = this.babble?.parameters.get('burst');
    if (!b) return;
    b.setValueAtTime(Math.min(1, Math.max(0.01, strength)), t);
    b.setValueAtTime(0, t + 0.02);
  }

  /** Bow slam: a low thud, then a slap and a gush (or, without the worklet, a noisy splash). */
  splash(strength: number, level: number, t = this.ctx.currentTime): void {
    const s = (0.35 + 0.65 * strength) * level;
    const r = () => 0.8 + Math.random() * 0.4;
    this.burst('lowpass', 150 * r(), 0.9, 0.9 * s, 0.006, 0.16 * r(), t);
    if (this.babble) {
      this.gush(0.4 + 0.6 * strength, t + 0.005);
    } else {
      this.burst('bandpass', 800 * r(), 0.8, 0.55 * s, 0.012, 0.35 * r(), t + 0.01);
      this.burst('highpass', 2600 * r(), 0.7, 0.22 * s, 0.03, (0.6 + 0.6 * strength) * r(), t + 0.02);
    }
  }

  /** Small wave against the hull: a short wet clop and a little gush. */
  lap(strength: number, level: number, t = this.ctx.currentTime): void {
    const s = (0.25 + 0.75 * strength) * level;
    const r = () => 0.75 + Math.random() * 0.5;
    this.burst('bandpass', 380 * r(), 1.4, 0.6 * s, 0.008, 0.12 * r(), t);
    if (this.babble) this.gush(0.08 + 0.25 * strength, t + 0.01);
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

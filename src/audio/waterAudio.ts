import { mixer } from './mixer';
import { noiseBuffer } from './engineAudio';

/**
 * Water around the hull, synthesised (no files), voiced against a recording of a similar
 * boat under way (owner reference; analysed, not shipped):
 *
 *  wash - the water rushing along the hull: two independent noise streams (left / right:
 *    in the recording the water above 300 Hz is diffuse, L/R correlation ~0.1-0.4) shaped
 *    to its measured spectrum - a gentle -6 dB/octave slope above ~500 Hz, a small "fizz"
 *    shelf around 3-5 kHz, little above 9 kHz. Not crackly: its 20 ms level rarely
 *    exceeds 2x the median (the old bubble "babble" was dense popping - "frying in oil").
 *    It swells slowly and randomly: mostly with 2-4 s periods (0.25-0.5 Hz, the waves
 *    going by), some 1-2 Hz surging, ~30 % depth, brighter as it swells. The hull's real
 *    wave hits (lap, slam) add surges. Louder and brighter with speed.
 *
 *  Events: splash (bow slams into a wave) = low thud + a surge of the wash; lap (smaller
 *  entries, also at rest) = a short wet clop.
 *
 * Built on any BaseAudioContext, so it can be rendered offline for checking.
 */

/** Speed (m/s) at which the wash has its reference level (~7 kn, as in the recording). */
const REF_SPEED = 3.5;
/** Wash level at the reference speed (tuned against the recording, engine at ~894 rpm). */
const WASH = 1.0;

export class WaterSound {
  readonly master: GainNode;
  private readonly wash: GainNode;
  private readonly bright: BiquadFilterNode;
  private readonly buffer: AudioBuffer;
  private surge = 0;
  /** Slow and faster random swells (unit-variance Ornstein-Uhlenbeck processes). */
  private z1 = 0;
  private z2 = 0;
  private splashCooldown = 0;
  private lapCooldown = 0;

  constructor(private readonly ctx: BaseAudioContext, destination: AudioNode) {
    this.buffer = noiseBuffer(ctx, 3);
    this.master = ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(destination);

    // Two decorrelated noise streams -> stereo.
    const merge = ctx.createChannelMerger(2);
    this.loop().connect(merge, 0, 0);
    this.loop(1.37).connect(merge, 0, 1);
    // Spectrum: high-pass under the engine, falling above ~400 Hz, the fizz shelf (peaking
    // at 4 kHz), roll-off above 10 kHz.
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 160;
    hp.Q.value = 0.6;
    // Two first-order low-passes (380 Hz, 1.5 kHz): in 1/3-octave bands this gives the
    // recording's ~-3 dB/octave fall to 1.5 kHz and steeper above.
    const pole = (fc: number) => {
      const k = Math.tan((Math.PI * fc) / ctx.sampleRate);
      return ctx.createIIRFilter([k / (1 + k), k / (1 + k)], [1, (k - 1) / (k + 1)]);
    };
    const slope = pole(380);
    const slope2 = pole(1500);
    const fizz = ctx.createBiquadFilter();
    fizz.type = 'peaking';
    fizz.frequency.value = 4800;
    fizz.Q.value = 1.8;
    fizz.gain.value = 4;
    const top = ctx.createBiquadFilter();
    top.type = 'lowpass';
    top.frequency.value = 10000;
    top.Q.value = 0.6;
    // Brightness that moves with the swell and the speed.
    this.bright = ctx.createBiquadFilter();
    this.bright.type = 'highshelf';
    this.bright.frequency.value = 1800;
    this.bright.gain.value = 0;
    this.wash = ctx.createGain();
    this.wash.gain.value = 0;
    merge.connect(hp).connect(slope).connect(slope2).connect(fizz).connect(top).connect(this.bright).connect(this.wash).connect(this.master);
  }

  private loop(rate = 1): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.buffer;
    s.loop = true;
    s.playbackRate.value = rate * (0.9 + Math.random() * 0.2);
    s.start(0, Math.random() * 2.5);
    return s;
  }

  /** One step of a unit-variance Ornstein-Uhlenbeck process with time constant tau (s). */
  private static ou(z: number, tau: number, dt: number): number {
    const gauss = Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random());
    return z - (z / tau) * dt + Math.sqrt((2 * dt) / tau) * gauss;
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
    this.surge = Math.max(this.surge * Math.exp(-dt / 0.8), Math.max(0.8 * slam, 0.35 * lap));
    // Swells: a slow one (corner ~0.3 Hz) and a faster, smaller one (~1.3 Hz).
    this.z1 = WaterSound.ou(this.z1, 0.5, dt);
    this.z2 = WaterSound.ou(this.z2, 0.12, dt);
    const z = Math.max(-2.5, Math.min(2.5, (this.z1 + 0.5 * this.z2) / 1.118));
    const v = Math.max(0, speed) / REF_SPEED;
    // Level: a trickle at rest, ~v^1.5 under way; the swell modulates ~30 %.
    const base = 0.04 + Math.pow(Math.min(v, 2.5), 1.5);
    const swell = Math.max(0.25, 1 + 0.3 * z + this.surge);
    this.wash.gain.setTargetAtTime(WASH * base * swell * level, t, 0.06);
    // Brighter as it swells, and faster.
    this.bright.gain.setTargetAtTime(Math.max(-9, Math.min(6, 2.5 * z + 4 * this.surge + 3 * (Math.min(v, 2.5) - 1))), t, 0.08);

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

  /** Bow slam (or something falling in): a low thud, and the wash surges. */
  splash(strength: number, level: number, t = this.ctx.currentTime): void {
    const s = (0.35 + 0.65 * strength) * level;
    const r = () => 0.8 + Math.random() * 0.4;
    this.burst('lowpass', 150 * r(), 0.9, 0.9 * s, 0.006, 0.16 * r(), t);
    this.surge = Math.max(this.surge, 0.8 * strength);
  }

  /** Small wave against the hull: a short wet clop. */
  lap(strength: number, level: number, t = this.ctx.currentTime): void {
    const s = (0.25 + 0.75 * strength) * level;
    const r = () => 0.75 + Math.random() * 0.5;
    this.burst('bandpass', 380 * r(), 1.4, 0.6 * s, 0.008, 0.12 * r(), t);
  }
}

/** The boat's water sounds on the shared AudioContext (attached after audio unlocks). */
export class WaterAudio {
  private sound: WaterSound | null = null;

  attach(ctx: AudioContext | null): void {
    if (!ctx || this.sound) return;
    this.sound = new WaterSound(ctx, mixer.bus(ctx, 'effects'));
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

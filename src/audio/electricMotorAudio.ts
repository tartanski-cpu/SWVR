import { mixer } from './mixer';

/**
 * The skiff's electric outboard: a quiet whine whose pitch follows the motor's speed (the
 * throttle), with a little gear hum under it - nothing like the workboat's diesel. Silent
 * with the throttle closed or the battery flat.
 */
export class ElectricMotorAudio {
  private ctx: AudioContext | null = null;
  private whine!: OscillatorNode;
  private hum!: OscillatorNode;
  private gain!: GainNode;

  attach(ctx: AudioContext | null): void {
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    this.whine = ctx.createOscillator();
    this.whine.type = 'sawtooth';
    this.hum = ctx.createOscillator();
    this.hum.type = 'triangle';
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 1.2;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.6;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.whine.connect(bp).connect(this.gain);
    this.hum.connect(humGain).connect(this.gain);
    this.gain.connect(mixer.bus(ctx, 'engine'));
    this.whine.start();
    this.hum.start();
  }

  /**
   * @param throttle -1..1 (0: silent)
   * @param distance from the listener to the motor (m)
   */
  update(throttle: number, battery: number, distance: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const run = battery > 0 ? Math.abs(throttle) : 0;
    this.whine.frequency.setTargetAtTime(380 + 1400 * run, t, 0.15);
    this.hum.frequency.setTargetAtTime(60 + 140 * run, t, 0.15);
    const level = run > 0.02 ? (0.015 + 0.05 * run) / (1 + Math.max(0, distance - 1) / 4) : 0;
    this.gain.gain.setTargetAtTime(level, t, 0.12);
  }
}

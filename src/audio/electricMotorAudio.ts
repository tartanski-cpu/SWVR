import { mixer } from './mixer';

/** Propeller speed at full throttle (rpm) and its blade count: the churn's beat rate. */
const PROP_RPM = 1500;
const BLADES = 3;

/**
 * The skiff's electric outboard. Two layers, nothing like the workboat's diesel:
 *
 *  - motor: a soft, low whine whose pitch follows the motor's speed, with a little gear hum
 *    under it (kept well down - an electric outboard is quiet above the water);
 *  - propeller: water churned by the blades - band-limited noise, beating at the blade rate
 *    (prop rpm x blades / 60, ~75 Hz flat out), louder and rougher going astern where the
 *    prop works in its own wash.
 *
 * Silent with the motor off, in neutral, the throttle closed or the battery flat.
 */
export class ElectricMotorAudio {
  private ctx: AudioContext | null = null;
  private whine!: OscillatorNode;
  private hum!: OscillatorNode;
  private motorGain!: GainNode;
  private churnLp!: BiquadFilterNode;
  private churnGain!: GainNode;
  private beat!: OscillatorNode;
  private beatDepth!: GainNode;

  attach(ctx: AudioContext | null): void {
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    const out = mixer.bus(ctx, 'engine');

    // Motor: triangle (not sawtooth: fewer harsh harmonics) through a gentle lowpass.
    this.whine = ctx.createOscillator();
    this.whine.type = 'triangle';
    this.hum = ctx.createOscillator();
    this.hum.type = 'sine';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    lp.Q.value = 0.5;
    const whineGain = ctx.createGain();
    whineGain.gain.value = 0.35;
    this.motorGain = ctx.createGain();
    this.motorGain.gain.value = 0;
    this.whine.connect(lp).connect(whineGain).connect(this.motorGain);
    this.hum.connect(this.motorGain);
    this.motorGain.connect(out);

    // Propeller churn: looped white noise -> band 150..~1200 Hz -> amplitude beat.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 150;
    this.churnLp = ctx.createBiquadFilter();
    this.churnLp.type = 'lowpass';
    this.churnLp.frequency.value = 800;
    this.churnLp.Q.value = 0.7;
    // Beat: gain = 1 + depth * sin(blade rate).
    const beatAmp = ctx.createGain();
    beatAmp.gain.value = 1;
    this.beat = ctx.createOscillator();
    this.beat.type = 'sine';
    this.beatDepth = ctx.createGain();
    this.beatDepth.gain.value = 0.6;
    this.beat.connect(this.beatDepth).connect(beatAmp.gain);
    this.churnGain = ctx.createGain();
    this.churnGain.gain.value = 0;
    noise.connect(hp).connect(this.churnLp).connect(beatAmp).connect(this.churnGain).connect(out);

    this.whine.start();
    this.hum.start();
    this.beat.start();
    noise.start();
  }

  /**
   * @param throttle effective throttle -1 (full astern) .. 1 (full ahead); 0 silent
   * @param distance from the listener to the motor (m)
   */
  update(throttle: number, battery: number, distance: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const run = battery > 0 ? Math.min(1, Math.abs(throttle)) : 0;
    const astern = throttle < 0;
    const near = 1 / (1 + Math.max(0, distance - 1) / 4);
    const on = run > 0.02;

    this.whine.frequency.setTargetAtTime(220 + 600 * run, t, 0.2);
    this.hum.frequency.setTargetAtTime(50 + 90 * run, t, 0.2);
    this.motorGain.gain.setTargetAtTime(on ? (0.008 + 0.022 * run) * near : 0, t, 0.15);

    // The propeller spins up a little behind the motor; astern it thrashes in its own wash.
    const bladeHz = (PROP_RPM * run * BLADES) / 60;
    this.beat.frequency.setTargetAtTime(Math.max(2, bladeHz), t, 0.25);
    this.beatDepth.gain.setTargetAtTime(astern ? 0.85 : 0.6, t, 0.2);
    this.churnLp.frequency.setTargetAtTime((astern ? 500 : 650) + 700 * run, t, 0.25);
    const churn = on ? (0.03 + 0.09 * Math.pow(run, 0.8)) * (astern ? 1.4 : 1) * near : 0;
    this.churnGain.gain.setTargetAtTime(churn, t, 0.3);
  }
}

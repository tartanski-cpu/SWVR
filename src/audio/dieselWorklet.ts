/**
 * AudioWorklet that synthesises a six-cylinder four-stroke diesel's firing events, sample by
 * sample. Loaded from a Blob URL, so it needs no separate file or bundler setup.
 *
 * A 6-cylinder four-stroke fires 3 times per revolution: firing frequency = rpm / 20 Hz
 * (30 Hz at 600 rpm idle, 90 Hz at 1800 rated). At each firing event:
 *   - channel 0, the exhaust pressure pulse: a smooth bump (1.5 ms rise, 5-9 ms decay,
 *     longer at low rpm), strong with load; a soft compression puff when not firing
 *     (cranking). Only a touch of noise rides on it: a pressure pulse through a silencer
 *     is mostly tone, and the old 40 % noise made the engine sound hissy and "noisy".
 *   - channel 1, the injector / combustion-knock click: a 2.5 ms noise tick, loudest at
 *     idle and light load - the "diesel clatter".
 *   - channel 2, exhaust bubbles: a wet exhaust blowing into water burbles. Each firing
 *     event releases a few big bubbles (100-450 Hz) that ring and chirp upward as they
 *     rise (the same bubble model as the water sound, see waterWorklet.ts). The main
 *     thread fades this in as the outlet goes under.
 *   - channel 3, mechanical noise: a continuous grit (valve train, gears, the hull
 *     carrying it), its level pulsing with the firing. A recording of a similar boat
 *     (owner reference) has this floor ~15-20 dB under the rumble from ~200 Hz to 2 kHz;
 *     it is also what small headset speakers can actually play.
 * No cylinder is quite like the others (fixed strength pattern + a little random jitter
 * per event), so the cycle has the uneven, lumpy rhythm of a real engine.
 * The main thread shapes the channels with filters (see engineAudio.ts).
 */
export const DIESEL_WORKLET = `
class DieselProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 0, minValue: 0, maxValue: 4000, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'firing', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.phase = 0;
    this.cyl = 0;
    this.env = 0;
    this.rise = 0;
    this.click = 0;
    this.seed = 12345;
    // A worn fishing-boat engine: cylinders noticeably unequal, alternating strong / weak
    // (the reference recording's half-order lines at 1.5x, 2.5x, 3.5x firing/2 are only
    // 7-14 dB under the firing line), so the beat is a lumpy chug that lopes once a cycle.
    this.strength = [1.0, 0.48, 1.1, 0.55, 1.03, 0.46];
    // Exhaust bubbles: a small pool of ringing, upward-chirping sinusoids.
    this.bub = [];
    for (let i = 0; i < 12; i++) this.bub.push({ on: false, ph: 0, f: 0, a: 0, d: 0, s: 0, t: 0, delay: 0 });
  }
  rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
  spawnBubble(size) {
    for (const b of this.bub) {
      if (b.on) continue;
      // Minnaert: f0 = 3.26 / r (r in m). Exhaust gas makes big bubbles: r 7-30 mm.
      const r = 0.007 + 0.023 * Math.pow(this.rand(), 1.5) * size;
      b.f = 3.26 / r;
      b.d = 0.13 * b.f + 0.0072 * Math.pow(b.f, 1.5); // damping (1/s)
      b.s = 0.1 * b.d; // rise chirp
      b.a = Math.pow(r / 0.02, 0.8) * (0.5 + 0.5 * this.rand());
      b.ph = 0;
      b.t = 0;
      b.delay = Math.floor(this.rand() * 0.012 * sampleRate);
      b.on = true;
      return;
    }
  }
  process(inputs, outputs, p) {
    const out = outputs[0];
    const a = out[0];
    const b = out[1] || out[0];
    const c = out[2] || out[0];
    const d = out[3] || out[0];
    const rpm = p.rpm[0];
    const load = p.load[0];
    const firing = p.firing[0] > 0.5;
    const step = rpm / 20 / sampleRate;
    // Pulse decay: long enough that the beats run into each other (a rumble, not separate
    // thumps: the reference's level pulses ~40 %, not 70 %).
    const tau = 0.013 + 0.006 * (1 - Math.min(1, rpm / 1800));
    const dEnv = Math.exp(-1 / (tau * sampleRate));
    const dRise = Math.exp(-1 / (0.0015 * sampleRate));
    const dClick = Math.exp(-1 / (0.0025 * sampleRate));
    const dt = 1 / sampleRate;
    for (let i = 0; i < a.length; i++) {
      this.phase += step;
      if (this.phase >= 1) {
        this.phase -= 1;
        this.cyl = (this.cyl + 1) % 6;
        const s = this.strength[this.cyl] * (0.9 + 0.2 * this.rand());
        this.env += s * (firing ? 0.45 + 0.55 * load : 0.2);
        if (firing) {
          this.click += s * (0.9 - 0.6 * load);
          // 1-3 bubbles per beat; more and bigger under load.
          const n = 1 + Math.floor(this.rand() * (1.6 + 1.6 * load));
          for (let k = 0; k < n; k++) this.spawnBubble(0.6 + 0.8 * load);
        }
      }
      // Smooth pulse: the attack follows the envelope with a 1.5 ms lag (no click edge).
      this.rise += (this.env - this.rise) * (1 - dRise);
      const n = this.rand() * 2 - 1;
      a[i] = this.rise * (0.92 + 0.08 * n);
      b[i] = this.click * n;
      d[i] = (this.rand() * 2 - 1) * (0.3 + this.rise) * (firing ? 1 : 0.4);
      this.env *= dEnv;
      this.click *= dClick;
      let w = 0;
      for (const q of this.bub) {
        if (!q.on) continue;
        if (q.delay > 0) { q.delay--; continue; }
        const amp = q.a * Math.exp(-q.d * q.t);
        if (amp < 0.001) { q.on = false; continue; }
        q.ph += 2 * Math.PI * q.f * (1 + q.s * q.t) * dt;
        w += amp * Math.sin(q.ph);
        q.t += dt;
      }
      c[i] = w;
    }
    return true;
  }
}
registerProcessor('diesel', DieselProcessor);
`;

const loaded = new WeakMap<BaseAudioContext, Map<string, Promise<boolean>>>();

/** Register a worklet module on a context once; resolves false if AudioWorklet is unavailable. */
export function loadWorklet(ctx: BaseAudioContext, name: string, code: string): Promise<boolean> {
  let byName = loaded.get(ctx);
  if (!byName) loaded.set(ctx, (byName = new Map()));
  let p = byName.get(name);
  if (!p) {
    if (!ctx.audioWorklet) {
      p = Promise.resolve(false);
    } else {
      const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
      p = ctx.audioWorklet
        .addModule(url)
        .then(() => true)
        .catch(() => false);
    }
    byName.set(name, p);
  }
  return p;
}

export function loadDieselWorklet(ctx: BaseAudioContext): Promise<boolean> {
  return loadWorklet(ctx, 'diesel', DIESEL_WORKLET);
}

/**
 * AudioWorklet that makes moving water out of bubbles.
 *
 * Most of what we hear in splashing water is air bubbles ringing as they form: each is a
 * tiny resonator (Minnaert frequency f0 ≈ 3.26 / r Hz for radius r in metres) that rings
 * for a few milliseconds and chirps upward as it rises and shrinks. Thousands of them make
 * the bright, liquid "plink and splash" that filtered noise can't (van den Doel's model:
 * damping d = 0.13 f0 + 0.0072 f0^1.5 per second, chirp f(t) = f0 (1 + 0.1 d t)).
 *
 *   rate   bubbles per second (the bow wave and the wash along the hull: grows with speed)
 *   size   0..1: bias toward bigger, lower bubbles (deep "bloop") vs fine spray
 *   burst  set it to a strength for a moment (then back to 0): a splash - a cluster of up
 *          to ~120 bubbles of all sizes over a quarter second
 *
 * Bubble radii are spread log-uniformly between ~0.5 mm and ~9 mm (6.5 kHz to 360 Hz), with
 * many more small ones than big (the bright, happy plinks), a little louder for bigger
 * ones. Each gets a random place in the stereo field. A pool of 128 voices; beyond that new bubbles are dropped (inaudible in
 * the crowd).
 */
export const WATER_WORKLET = `
class WaterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rate', defaultValue: 0, minValue: 0, maxValue: 5000, automationRate: 'k-rate' },
      { name: 'size', defaultValue: 0.3, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'burst', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.seed = 987654;
    this.pool = [];
    for (let i = 0; i < 128; i++) this.pool.push({ on: false, ph: 0, f: 0, a: 0, d: 0, s: 0, t: 0, delay: 0, l: 0, r: 0 });
    this.lastBurst = 0;
    this.acc = 0;
  }
  rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
  spawn(size, gain, delay) {
    for (const b of this.pool) {
      if (b.on) continue;
      // Log-uniform radius with more small ones; 'size' stretches the top end.
      const rMin = 0.0005;
      const rMax = 0.003 + 0.006 * size;
      const u = Math.pow(this.rand(), 2.2 - 0.9 * size);
      const r = rMin * Math.pow(rMax / rMin, u);
      b.f = 3.26 / r;
      b.d = 0.13 * b.f + 0.0072 * Math.pow(b.f, 1.5);
      b.s = 0.1 * b.d;
      b.a = gain * Math.pow(r / 0.003, 0.5) * (0.4 + 0.6 * this.rand());
      b.ph = this.rand() * 6.283;
      b.t = 0;
      b.delay = delay;
      const pan = this.rand();
      b.l = Math.cos(pan * 1.5708);
      b.r = Math.sin(pan * 1.5708);
      b.on = true;
      return;
    }
  }
  process(inputs, outputs, p) {
    const out = outputs[0];
    const L = out[0];
    const R = out[1] || out[0];
    const rate = p.rate[0];
    const size = p.size[0];
    const burst = p.burst[0];
    const dt = 1 / sampleRate;
    if (burst > 0 && this.lastBurst === 0) {
      const n = Math.floor(20 + 100 * burst);
      for (let k = 0; k < n; k++) {
        // Front-loaded: most bubbles in the first 80 ms, a tail to 300 ms.
        const when = Math.pow(this.rand(), 2.2) * 0.3;
        this.spawn(Math.min(1, size + 0.3 * burst), 0.25 + 0.3 * burst, Math.floor(when * sampleRate));
      }
    }
    this.lastBurst = burst;
    for (let i = 0; i < L.length; i++) {
      // Poisson arrivals at 'rate' per second.
      this.acc += rate * dt;
      while (this.acc > 0 && this.rand() < this.acc) {
        this.spawn(size, 0.5, 0);
        this.acc -= 1;
      }
      if (this.acc > 1) this.acc = 1;
      let l = 0;
      let r = 0;
      for (const b of this.pool) {
        if (!b.on) continue;
        if (b.delay > 0) { b.delay--; continue; }
        const amp = b.a * Math.exp(-b.d * b.t);
        if (amp < 0.0005) { b.on = false; continue; }
        b.ph += 6.283185 * b.f * (1 + b.s * b.t) * dt;
        const v = amp * Math.sin(b.ph);
        l += v * b.l;
        r += v * b.r;
        b.t += dt;
      }
      L[i] = l;
      R[i] = r;
    }
    return true;
  }
}
registerProcessor('water', WaterProcessor);
`;

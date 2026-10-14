/**
 * AudioWorklet that makes water against a hull out of splash EVENTS.
 *
 * Not a steady stream of tiny bubbles - that is exactly the sound of frying. Water slopping
 * against a moving hull is a series of separate little splashes: a wavelet hits the hull
 * (a short, wet, low-mid slap), the crest breaks and traps air, and a handful of fairly big
 * bubbles ring out over the next tenth of a second, each a "bloop" that glides upward in
 * pitch as it rises (van den Doel's bubble model: Minnaert frequency f0 = 3.26 / r for
 * radius r in metres, damping d = 0.13 f0 + 0.0072 f0^1.5 per second, chirp
 * f(t) = f0 (1 + 0.1 d t)). Bubbles here are 1.5-12 mm (2.2 kHz down to 270 Hz): the
 * liquid "blup" range, not the sizzle range.
 *
 * Each bubble starts at zero phase with a 1.5 ms fade-in - a bubble's pressure pulse starts
 * smoothly, and the earlier instant random-phase starts were clicks (more frying).
 *
 *   rate   splash events per second (a few at rest, ~10 at speed)
 *   size   0..1: bigger, lower, more bubbles per event as the bow digs in
 *   burst  set to a strength for a moment (then 0): a big splash - a heavy slap and a crowd
 *          of bubbles over a quarter second (bow slams)
 *
 * Events alternate roughly between the port and starboard side of the stereo field, and
 * each event's bubbles cluster around it. Pools of 96 bubbles and 12 slaps.
 */
export const WATER_WORKLET = `
class WaterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rate', defaultValue: 0, minValue: 0, maxValue: 100, automationRate: 'k-rate' },
      { name: 'size', defaultValue: 0.3, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'burst', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.seed = 987654;
    this.bub = [];
    for (let i = 0; i < 96; i++) this.bub.push({ on: false, ph: 0, f: 0, a: 0, d: 0, s: 0, t: 0, delay: 0, l: 0, r: 0 });
    this.slaps = [];
    for (let i = 0; i < 12; i++) this.slaps.push({ on: false, a: 0, k: 0, lp: 0, lp2: 0, c: 0, delay: 0, l: 0, r: 0 });
    this.lastBurst = 0;
    this.side = 0;
  }
  rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
  bubble(rMin, rMax, gain, delay, pan) {
    for (const b of this.bub) {
      if (b.on) continue;
      // Log-uniform radius, leaning a little toward the small end of the given range.
      const r = rMin * Math.pow(rMax / rMin, Math.pow(this.rand(), 1.3));
      b.f = 3.26 / r;
      b.d = 0.13 * b.f + 0.0072 * Math.pow(b.f, 1.5);
      b.s = 0.1 * b.d;
      b.a = gain * Math.pow(r / 0.005, 0.6) * (0.5 + 0.5 * this.rand());
      b.ph = 0;
      b.t = 0;
      b.delay = delay;
      const p = Math.min(1, Math.max(0, pan + (this.rand() - 0.5) * 0.3));
      b.l = Math.cos(p * 1.5708);
      b.r = Math.sin(p * 1.5708);
      b.on = true;
      return;
    }
  }
  slap(gain, decay, cutoff, delay, pan) {
    for (const s of this.slaps) {
      if (s.on) continue;
      s.a = gain;
      s.k = Math.exp(-1 / (decay * sampleRate));
      s.c = 1 - Math.exp(-2 * Math.PI * cutoff / sampleRate);
      s.lp = 0;
      s.lp2 = 0;
      s.delay = delay;
      s.l = Math.cos(pan * 1.5708);
      s.r = Math.sin(pan * 1.5708);
      s.on = true;
      return;
    }
  }
  /** One splash against the hull: a slap, then a few bubbles over ~0.15 s. */
  event(size, strength) {
    this.side = 1 - this.side;
    const pan = this.side ? 0.15 + 0.25 * this.rand() : 0.6 + 0.25 * this.rand();
    this.slap(0.5 * strength, 0.012 + 0.025 * this.rand(), 700 + 900 * this.rand(), 0, pan);
    const n = 2 + Math.floor((3 + 9 * size) * this.rand() * (0.5 + strength));
    for (let k = 0; k < n; k++) {
      const delay = Math.floor((0.004 + 0.15 * Math.pow(this.rand(), 1.6)) * sampleRate);
      this.bubble(0.0015, 0.005 + 0.007 * size, 0.55 * strength, delay, pan);
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
      // A slam: a heavy, low slap on both sides, then a crowd of bubbles.
      this.slap(1.0 * burst, 0.05, 500, 0, 0.35);
      this.slap(0.8 * burst, 0.06, 420, Math.floor(0.008 * sampleRate), 0.65);
      const n = Math.floor(4 + 58 * burst);
      for (let k = 0; k < n; k++) {
        const delay = Math.floor((0.01 + 0.3 * Math.pow(this.rand(), 1.8)) * sampleRate);
        this.bubble(0.002, 0.008 + 0.004 * burst, 0.45 + 0.35 * burst, delay, this.rand());
      }
    }
    this.lastBurst = burst;
    // Poisson events at 'rate' per second, decided once per block (128 samples, ~3 ms).
    const pEvent = rate * L.length * dt;
    if (this.rand() < pEvent) this.event(size, 0.6 + 0.4 * this.rand());
    const attack = 1 / (0.0015 * sampleRate);
    for (let i = 0; i < L.length; i++) {
      let l = 0;
      let r = 0;
      for (const b of this.bub) {
        if (!b.on) continue;
        if (b.delay > 0) { b.delay--; continue; }
        const env = Math.exp(-b.d * b.t) * Math.min(1, b.t * sampleRate * attack);
        if (env < 0.002 && b.t > 0.002) { b.on = false; continue; }
        b.ph += 6.283185 * b.f * (1 + b.s * b.t) * dt;
        const v = b.a * env * Math.sin(b.ph);
        l += v * b.l;
        r += v * b.r;
        b.t += dt;
      }
      for (const s of this.slaps) {
        if (!s.on) continue;
        if (s.delay > 0) { s.delay--; continue; }
        // Noise through two one-pole low-passes: a soft, wet thud rather than a hiss.
        const n = this.rand() * 2 - 1;
        s.lp += (n - s.lp) * s.c;
        s.lp2 += (s.lp - s.lp2) * s.c;
        const v = s.a * s.lp2 * 3;
        l += v * s.l;
        r += v * s.r;
        s.a *= s.k;
        if (s.a < 0.001) s.on = false;
      }
      L[i] = l;
      R[i] = r;
    }
    return true;
  }
}
registerProcessor('water', WaterProcessor);
`;

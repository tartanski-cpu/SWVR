/**
 * AudioWorklet for water working along a hull, after Andy Farnell's running-water model
 * ("Designing Sound", MIT Press 2010, practical 13; also the SuperCollider port on
 * Wikibooks):
 *
 *   Running water is a dense pattern of resonating cavities - bubbles and pockets forming
 *   and collapsing - and is best made from a few CONTINUOUS sine voices whose pitch keeps
 *   jumping to new random values, each jump followed by a short upward glide (a cavity
 *   closing up), with a slow random wobble on top. Because each voice never stops, there
 *   are no onsets to click or crackle: the result "babbles" like a brook. One voice sounds
 *   like a toy; it only becomes water when several run together.
 *
 * Earlier versions used short decaying blips (bubble events). Many short blips is exactly
 * the sound of frying, and even fewer, bigger ones sounded plinky; this replaces them.
 *
 *   flow   0..1  how much water is working: voice loudness, how many voices are active,
 *                and how often they jump (calm trickle at rest .. busy torrent at speed)
 *   pitch  0..1  where the cavities sit: low and gurgly (0) .. brighter, lighter (1)
 *   burst  set to a strength for a moment, then 0: a splash - a heavy, soft slap and a
 *                gush (every voice jumps fast and loud for ~0.4 s, a little lower)
 *
 * Voices are spread across the stereo field; each has its own slow "gust" envelope, so
 * the babble comes and goes in patches along the hull instead of a steady wash.
 */
export const WATER_WORKLET = `
class WaterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'flow', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'pitch', defaultValue: 0.4, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'burst', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.seed = 424242;
    this.voices = [];
    const N = 8;
    for (let i = 0; i < N; i++) {
      const pan = (i + 0.5) / N;
      this.voices.push({
        ph: 0, base: 600, rise: 1, wob: 0, wobT: 0, wobC: 0,
        amp: 0, ampT: 0, ampC: 0,
        l: Math.cos(pan * 1.5708), r: Math.sin(pan * 1.5708),
        order: i / N,
      });
    }
    this.slaps = [];
    for (let i = 0; i < 6; i++) this.slaps.push({ on: false, a: 0, k: 0, lp: 0, lp2: 0, c: 0, delay: 0, l: 0, r: 0 });
    this.lastBurst = 0;
    this.gush = 0;
  }
  rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
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
  process(inputs, outputs, p) {
    const out = outputs[0];
    const L = out[0];
    const R = out[1] || out[0];
    const flow = p.flow[0];
    const pitch = p.pitch[0];
    const burst = p.burst[0];
    const sr = sampleRate;
    if (burst > 0 && this.lastBurst === 0) {
      // A wave hitting the hull: a soft, heavy slap on both sides, then a gush.
      this.slap(0.9 * burst, 0.045, 380, 0, 0.35);
      this.slap(0.7 * burst, 0.06, 320, Math.floor(0.01 * sr), 0.65);
      this.gush = Math.max(this.gush, burst);
    }
    this.lastBurst = burst;
    const gushDecay = Math.exp(-1 / (0.35 * sr));
    // Cavity range: lower and gurglier with a gush; brighter with 'pitch'.
    const fLo0 = 220 + 260 * pitch;
    const fHi0 = 700 + 1300 * pitch;
    const riseK = 1 - Math.exp(-1 / (0.03 * sr)); // upward glide after each jump (~30 ms)
    const wobK = 1 - Math.exp(-1 / (0.012 * sr));
    const ampK = 1 - Math.exp(-1 / (0.06 * sr));
    for (let i = 0; i < L.length; i++) {
      const g = this.gush;
      this.gush *= gushDecay;
      const f = Math.min(1, flow + g);
      // Jumps per second per voice: a slow trickle .. a busy babble.
      const rate = 8 + 110 * f;
      const fLo = fLo0 * (1 - 0.3 * g);
      const fHi = fHi0 * (1 - 0.25 * g);
      let l = 0;
      let r = 0;
      for (const v of this.voices) {
        // How many voices take part grows with the flow (the first ones first).
        const active = v.order < 0.15 + 0.85 * f ? 1 : 0;
        if (this.rand() < rate / sr) {
          v.base = fLo * Math.pow(fHi / fLo, this.rand());
          v.rise = 0.72 + 0.12 * this.rand(); // start a little below and glide up
        }
        v.rise += (1 - v.rise) * riseK;
        // Slow random wobble (re-targeted ~25 times a second).
        if (this.rand() < 25 / sr) v.wobT = (this.rand() * 2 - 1) * 0.06;
        v.wob += (v.wobT - v.wob) * wobK;
        // Gusts: each voice's loudness drifts to a new random level ~5 times a second,
        // skewed toward quiet so the babble comes in patches.
        if (this.rand() < 5 / sr) v.ampT = Math.pow(this.rand(), 1.6);
        v.amp += (v.ampT * active * (0.05 + 0.95 * f) - v.amp) * ampK;
        v.ph += 6.283185 * v.base * v.rise * (1 + v.wob) / sr;
        if (v.ph > 6.283185) v.ph -= 6.283185;
        const s = v.amp * Math.sin(v.ph);
        l += s * v.l;
        r += s * v.r;
      }
      for (const s of this.slaps) {
        if (!s.on) continue;
        if (s.delay > 0) { s.delay--; continue; }
        // Noise through two one-pole low-passes: a soft, wet thud rather than a hiss.
        const n = this.rand() * 2 - 1;
        s.lp += (n - s.lp) * s.c;
        s.lp2 += (s.lp - s.lp2) * s.c;
        const v = s.a * s.lp2 * 3.5;
        l += v * s.l;
        r += v * s.r;
        s.a *= s.k;
        if (s.a < 0.001) s.on = false;
      }
      L[i] = l * 0.35;
      R[i] = r * 0.35;
    }
    return true;
  }
}
registerProcessor('water', WaterProcessor);
`;

/**
 * AudioWorklet that synthesises a six-cylinder four-stroke diesel's firing events, sample by
 * sample. Loaded from a Blob URL, so it needs no separate file or bundler setup.
 *
 * A 6-cylinder four-stroke fires 3 times per revolution: firing frequency = rpm / 20 Hz
 * (30 Hz at 600 rpm idle, 90 Hz at 1800 rated). At each firing event:
 *   - a combustion pressure pulse (channel 0): a burst that decays over 5-9 ms (longer at
 *     low rpm; short pulses carry the harmonics small speakers can play), strong with load, a soft compression puff when not firing (cranking);
 *   - an injector / combustion-knock click (channel 1): a 2.5 ms noise tick, loudest at idle
 *     and light load - the "diesel clatter".
 * No cylinder is quite like the others (fixed strength pattern + a little random jitter
 * per event), so the cycle has the uneven, lumpy rhythm of a real engine, with energy at
 * the half and third engine orders, not just a clean buzz.
 * The main thread shapes both channels with filters (see engineAudio.ts).
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
    this.click = 0;
    this.seed = 12345;
    this.strength = [1.0, 0.86, 1.08, 0.92, 1.04, 0.9];
  }
  rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
  process(inputs, outputs, p) {
    const out = outputs[0];
    const a = out[0];
    const b = out[1] || out[0];
    const rpm = p.rpm[0];
    const load = p.load[0];
    const firing = p.firing[0] > 0.5;
    const step = rpm / 20 / sampleRate;
    const tau = 0.005 + 0.004 * (1 - Math.min(1, rpm / 1800));
    const dEnv = Math.exp(-1 / (tau * sampleRate));
    const dClick = Math.exp(-1 / (0.0025 * sampleRate));
    for (let i = 0; i < a.length; i++) {
      this.phase += step;
      if (this.phase >= 1) {
        this.phase -= 1;
        this.cyl = (this.cyl + 1) % 6;
        const s = this.strength[this.cyl] * (0.93 + 0.14 * this.rand());
        this.env += s * (firing ? 0.45 + 0.55 * load : 0.2);
        if (firing) this.click += s * (0.9 - 0.6 * load);
      }
      const n = this.rand() * 2 - 1;
      a[i] = this.env * (0.6 + 0.4 * n);
      b[i] = this.click * n;
      this.env *= dEnv;
      this.click *= dClick;
    }
    return true;
  }
}
registerProcessor('diesel', DieselProcessor);
`;

const loaded = new WeakMap<BaseAudioContext, Promise<boolean>>();

/** Register the worklet on a context once; resolves false if AudioWorklet is unavailable. */
export function loadDieselWorklet(ctx: BaseAudioContext): Promise<boolean> {
  let p = loaded.get(ctx);
  if (!p) {
    if (!ctx.audioWorklet) {
      p = Promise.resolve(false);
    } else {
      const url = URL.createObjectURL(new Blob([DIESEL_WORKLET], { type: 'application/javascript' }));
      p = ctx.audioWorklet
        .addModule(url)
        .then(() => true)
        .catch(() => false);
    }
    loaded.set(ctx, p);
  }
  return p;
}

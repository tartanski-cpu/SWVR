/**
 * AudioWorklet that synthesises a six-cylinder four-stroke diesel's firing events, sample by
 * sample. Loaded from a Blob URL, so it needs no separate file or bundler setup.
 *
 * A 6-cylinder four-stroke fires 3 times per revolution: firing frequency = rpm / 20 Hz
 * (30 Hz at 600 rpm idle, 90 Hz at 1800 rated). At each firing event:
 *   - channel 0, the exhaust pressure pulse: a smooth bump (1.5 ms rise, 13-19 ms decay,
 *     longer at low rpm), strong with load; a soft compression puff when not firing
 *     (cranking). Only a touch of noise rides on it: a pressure pulse through a silencer
 *     is mostly tone, and the old 40 % noise made the engine sound hissy and "noisy".
 *   (A second channel of exhaust bubbles was taken out at the owner's request: it didn't
 *   sound good. With the outlet under water the main thread just muffles this note.)
 * No injector clatter or mechanical rasp: those read as a tinny "lawnmower" buzz (owner
 * feedback), and in a recording of a similar boat everything above ~250 Hz is the water.
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
    this.seed = 12345;
    // A worn fishing-boat engine: cylinders noticeably unequal, alternating strong / weak
    // (the reference recording's half-order lines at 1.5x, 2.5x, 3.5x firing/2 are only
    // 7-14 dB under the firing line), so the beat is a lumpy chug that lopes once a cycle.
    this.strength = [1.0, 0.48, 1.1, 0.55, 1.03, 0.46];
  }
  rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
  process(inputs, outputs, p) {
    const out = outputs[0];
    const a = out[0];
    const rpm = p.rpm[0];
    const load = p.load[0];
    const firing = p.firing[0] > 0.5;
    const step = rpm / 20 / sampleRate;
    // Pulse decay: long enough that the beats run into each other (a rumble, not separate
    // thumps: the reference's level pulses ~40 %, not 70 %).
    const tau = 0.013 + 0.006 * (1 - Math.min(1, rpm / 1800));
    const dEnv = Math.exp(-1 / (tau * sampleRate));
    const dRise = Math.exp(-1 / (0.0015 * sampleRate));
    for (let i = 0; i < a.length; i++) {
      this.phase += step;
      if (this.phase >= 1) {
        this.phase -= 1;
        this.cyl = (this.cyl + 1) % 6;
        const s = this.strength[this.cyl] * (0.9 + 0.2 * this.rand());
        this.env += s * (firing ? 0.45 + 0.55 * load : 0.2);
      }
      // Smooth pulse: the attack follows the envelope with a 1.5 ms lag (no click edge).
      this.rise += (this.env - this.rise) * (1 - dRise);
      const n = this.rand() * 2 - 1;
      a[i] = this.rise * (0.92 + 0.08 * n);
      this.env *= dEnv;
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

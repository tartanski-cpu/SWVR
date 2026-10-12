import { VESSEL_DEFS } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';

/**
 * Synthesised diesel hum - no audio files. A 6-cylinder four-stroke fires 3 times per
 * revolution, so the fundamental is rpm/20 Hz (30 Hz at 600 rpm idle, 90 Hz at 1800 rated).
 *
 *   sawtooth @ firing freq ─┐
 *   square   @ half order  ─┼─► low-pass (opens with load) ─► gain ─┐
 *   noise ─► band-pass (turbo/intake hiss, grows with load) ─────────┼─► master (distance) ─► out
 *
 * Browsers only allow audio after a user gesture; `unlock()` is called from the first
 * click/key press and from entering VR.
 */
export class EngineAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private tone!: GainNode;
  private hiss!: GainNode;
  private filter!: BiquadFilterNode;
  private osc1!: OscillatorNode;
  private osc2!: OscillatorNode;

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 0.9;
    this.tone = ctx.createGain();
    this.tone.gain.value = 0;
    this.filter.connect(this.tone).connect(this.master);

    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    const sub = ctx.createGain();
    sub.gain.value = 0.35;
    this.osc1.connect(this.filter);
    this.osc2.connect(sub).connect(this.filter);
    this.osc1.start();
    this.osc2.start();

    // Looping white noise for hiss.
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1800;
    band.Q.value = 0.7;
    this.hiss = ctx.createGain();
    this.hiss.gain.value = 0;
    noise.connect(band).connect(this.hiss).connect(this.master);
    noise.start();
  }

  /**
   * @param distance metres from the listener to the engine room
   */
  update(v: VesselState | undefined, distance: number): void {
    const ctx = this.ctx;
    if (!ctx || !v) return;
    const t = ctx.currentTime;
    const smooth = 0.08;
    const e = v.engine;
    const cfg = VESSEL_DEFS[v.defId].engine;

    const running = e.phase !== 'off' || e.rpm > 20;
    const rpm = Math.max(e.rpm, 1);
    const firing = rpm / 20;
    // Load = fuel rack (0..1): how hard the engine is working, which is what you hear on a
    // diesel - it gets rougher and louder digging in at the same RPM.
    const load = e.rack;
    const rpmFrac = Math.min(1, rpm / cfg.ratedRpm);

    this.osc1.frequency.setTargetAtTime(firing, t, smooth);
    this.osc2.frequency.setTargetAtTime(firing / 2, t, smooth);
    this.filter.frequency.setTargetAtTime(160 + 500 * rpmFrac + 600 * load, t, smooth);

    const crankWobble = e.phase === 'cranking' ? 0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 9) : 1;
    this.tone.gain.setTargetAtTime(running ? (0.25 + 0.35 * rpmFrac + 0.2 * load) * crankWobble : 0, t, 0.15);
    this.hiss.gain.setTargetAtTime(running ? 0.01 + 0.05 * load * rpmFrac : 0, t, 0.2);

    const att = 1 / (1 + distance / 8);
    this.master.gain.setTargetAtTime(0.5 * att, t, 0.1);
  }
}

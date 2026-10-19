import { CONFIG } from '../config';
import { mixer } from './mixer';

/**
 * The handheld VHF in your hand (player/radioHandset.ts; owner request): the sound of its
 * press-to-talk button. Pressed: a short hard click as the switch goes over, then a brief
 * burst of squelch hiss as the transmitter opens. Let go: a softer click and a shorter burst
 * as the receiver comes back. Made from an oscillator pop and filtered noise, no files; on
 * the VHF bus, not spatial (the radio is in your hand). The crew hear the other end of it
 * through their own radios (net/voice.ts squelch); this is yours.
 */
export class HandsetAudio {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;

  attach(ctx: AudioContext | null): void {
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    const len = Math.floor(ctx.sampleRate * 0.5);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** The talk button pressed (`on`) or let go. */
  click(on: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const c = CONFIG.voice.handset;
    const out = mixer.bus(ctx, 'radio');
    const t = ctx.currentTime + 0.005;
    // The switch: a very short pop, a little lower and softer letting go.
    const pop = ctx.createOscillator();
    pop.type = 'square';
    pop.frequency.setValueAtTime(on ? c.clickHz : c.clickHz * 0.7, t);
    pop.frequency.exponentialRampToValueAtTime(80, t + 0.012);
    const pg = ctx.createGain();
    pg.gain.setValueAtTime((on ? 1 : 0.6) * c.clickGain, t);
    pg.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
    pop.connect(pg).connect(out);
    pop.start(t);
    pop.stop(t + 0.02);
    // The squelch: band-limited hiss, longer as the transmitter opens.
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.6;
    const sg = ctx.createGain();
    const last = on ? c.squelchS : c.squelchS * 0.5;
    sg.gain.setValueAtTime(c.squelchGain, t + 0.01);
    sg.gain.linearRampToValueAtTime(0, t + 0.01 + last);
    s.connect(bp).connect(sg).connect(out);
    s.start(t + 0.01, Math.random() * 0.3, last + 0.02);
  }
}

import { mixer } from './mixer';
import type { ContactState } from '../vessel/vesselState';

/**
 * Hull contact sounds from filtered noise (no files): a low thump when the hull strikes
 * something (quay, rock, seabed) and a grinding scrape while it slides along it under load.
 * Shares the AudioContext created by EngineAudio.
 */
export class ContactAudio {
  private ctx: AudioContext | null = null;
  private thump!: GainNode;
  private scrape!: GainNode;
  private cooldown = 0;

  attach(ctx: AudioContext | null): void {
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const source = (): AudioBufferSourceNode => {
      const s = ctx.createBufferSource();
      s.buffer = buffer;
      s.loop = true;
      s.start();
      return s;
    };
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 160;
    this.thump = ctx.createGain();
    this.thump.gain.value = 0;
    source().connect(low).connect(this.thump).connect(mixer.bus(ctx, 'effects'));

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 420;
    band.Q.value = 0.8;
    this.scrape = ctx.createGain();
    this.scrape.gain.value = 0;
    source().connect(band).connect(this.scrape).connect(mixer.bus(ctx, 'effects'));
  }

  /** A one-off thud (a swimmer struck by a propeller), `distance` m from the listener. */
  thud(strength: number, distance: number): void {
    if (!this.ctx || !this.thump) return;
    const now = this.ctx.currentTime;
    const g = Math.min(1, strength) * 2.6 / (1 + distance / 12);
    this.thump.gain.cancelScheduledValues(now);
    this.thump.gain.setValueAtTime(g, now);
    this.thump.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  }

  /** @param distance listener distance from the boat (m); returns impact strength 0..1 (for haptics) */
  update(c: ContactState, distance: number, dt: number): number {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.ctx) return 0;
    const att = 1 / (1 + distance / 12);
    const now = this.ctx.currentTime;
    let hit = 0;
    if (c.impact > 0.25 && this.cooldown === 0) {
      hit = Math.min(1, c.impact / 2);
      this.thump.gain.cancelScheduledValues(now);
      this.thump.gain.setValueAtTime(2.2 * hit * att, now);
      this.thump.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      this.cooldown = 0.3;
    }
    const grind = c.force > 0 ? Math.min(1, Math.sqrt(c.force / 2e5) * Math.min(1, c.slide / 0.6)) : 0;
    this.scrape.gain.setTargetAtTime(0.35 * grind * att, now, 0.06);
    return hit;
  }
}

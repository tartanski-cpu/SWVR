import { CONFIG } from '../config';
import { mixer } from './mixer';
import { noiseBuffer } from './engineAudio';
import type { WildlifeEvents } from '../wildlife/wildlifeView';

/**
 * Wildlife sounds, synthesised (no audio files):
 *   gull call   two or three falling "kee-ow"s: a sawtooth gliding down from ~2.2 to ~1.3
 *               kHz through a band-pass (a nasal, reedy cry), every few seconds while
 *               gulls are about, louder the nearer the nearest one.
 *   blow        a dolphin breathing out as it surfaces: a short, breathy puff of noise.
 * Muffled in the wheelhouse like the other outside sounds.
 */
export class WildlifeAudio {
  private ctx: AudioContext | null = null;
  private out: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private nextCall = 0;

  attach(ctx: AudioContext | null): void {
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    this.noise = noiseBuffer(ctx, 1);
    this.out = ctx.createBiquadFilter();
    this.out.type = 'lowpass';
    this.out.frequency.value = 20000;
    this.out.connect(mixer.bus(ctx, 'effects'));
    this.nextCall = ctx.currentTime + 3;
  }

  /** @param muffle 0..1, shut in the wheelhouse */
  update(ev: WildlifeEvents, muffle: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const t = ctx.currentTime;
    this.out.frequency.setTargetAtTime(20000 - 19000 * muffle, t, 0.1);
    if (ev.gullDist < 80 && t >= this.nextCall) {
      const [a, b] = CONFIG.wildlife.gullCallEvery;
      this.nextCall = t + a + Math.random() * (b - a);
      const level = 0.14 / (1 + ev.gullDist / 12);
      const notes = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < notes; i++) this.cry(t + i * (0.28 + Math.random() * 0.08), level * (1 - 0.15 * i));
    }
    for (const d of ev.blows) if (d < 60) this.blow(t, 0.35 / (1 + d / 6));
  }

  private cry(at: number, level: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const f0 = 2000 + Math.random() * 500;
    osc.frequency.setValueAtTime(f0, at);
    osc.frequency.linearRampToValueAtTime(f0 * 1.08, at + 0.04);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.58, at + 0.24);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1700;
    bp.Q.value = 2.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.26);
    osc.connect(bp).connect(g).connect(this.out!);
    osc.start(at);
    osc.stop(at + 0.3);
  }

  private blow(at: number, level: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 900;
    hp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
    src.connect(hp).connect(g).connect(this.out!);
    src.start(at, Math.random() * 0.6, 0.35);
  }
}

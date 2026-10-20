import { mixer } from './mixer';
import { babble, speakOrBabble } from './babble';
import { noiseBuffer } from './engineAudio';

/**
 * The little sounds of a recovery, all synthesised (no samples):
 *   - cheer: a bright rising chime and a swell of "crowd" (band-passed noise with a fast
 *     ragged wobble) when everything is out of the water;
 *   - shout: what a survivor calls out, read with the browser's speech synthesis (higher
 *     and quicker than the radio voice, not through the radio's little speaker), or a
 *     babble where the browser can't speak;
 *   - snap: a cargo item set down on deck - a short wooden knock and a small ding;
 *   - gunshot: the line-throwing gun fired (owner request) - a sharp crack with a low thump
 *     under it, and the rocket's motor hissing away for half a second.
 */
export class RescueSounds {
  private ctx: AudioContext | null = null;
  private noise!: AudioBuffer;

  attach(ctx: AudioContext | null): void {
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    this.noise = noiseBuffer(ctx, 2);
  }

  private tone(freq: number, at: number, len: number, level: number, type: OscillatorType = 'sine'): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, at + len);
    o.connect(g).connect(mixer.bus(ctx, 'effects'));
    o.start(at);
    o.stop(at + len + 0.05);
  }

  cheer(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.05;
    // Chime: a rising major arpeggio.
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone(f, t0 + i * 0.11, 0.9, 0.12);
      this.tone(f * 2, t0 + i * 0.11, 0.4, 0.03);
    });
    // Crowd: noise in the voice band, swelling and fading, with a ragged amplitude wobble.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.7;
    const wob = ctx.createGain();
    wob.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.4;
    lfo.connect(lfoDepth).connect(wob.gain);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.16, t0 + 0.4);
    g.gain.linearRampToValueAtTime(0.1, t0 + 1.2);
    g.gain.linearRampToValueAtTime(0, t0 + 2.2);
    src.connect(bp).connect(wob).connect(g).connect(mixer.bus(ctx, 'effects'));
    src.start(t0);
    lfo.start(t0);
    src.stop(t0 + 2.3);
    lfo.stop(t0 + 2.3);
  }

  shout(text: string): void {
    speakOrBabble(
      text,
      (u) => {
        u.rate = 1.2;
        u.pitch = 1.35;
        u.volume = mixer.level('radio');
      },
      () => {
        if (this.ctx) babble(this.ctx, mixer.bus(this.ctx, 'radio'), text, this.ctx.currentTime + 0.05, 210, 0.35);
      },
      false,
    );
  }

  gunshot(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    const out = mixer.bus(ctx, 'effects');
    // The crack: a short bright noise burst.
    const crack = ctx.createBufferSource();
    crack.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const gc = ctx.createGain();
    gc.gain.setValueAtTime(0.9, t);
    gc.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    crack.connect(hp).connect(gc).connect(out);
    crack.start(t, Math.random());
    crack.stop(t + 0.1);
    // The thump under it: the charge, felt more than heard.
    this.tone(70, t, 0.22, 0.6, 'triangle');
    this.tone(140, t, 0.1, 0.25, 'sine');
    // The rocket's motor: a hiss that tails off as it flies away.
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noise;
    hiss.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2600, t);
    bp.frequency.exponentialRampToValueAtTime(1200, t + 0.6);
    bp.Q.value = 0.8;
    const gh = ctx.createGain();
    gh.gain.setValueAtTime(0.25, t + 0.04);
    gh.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    hiss.connect(bp).connect(gh).connect(out);
    hiss.start(t + 0.04, Math.random());
    hiss.stop(t + 0.7);
  }

  snap(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    // Knock: a very short low-passed noise burst and a low thud.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    src.connect(lp).connect(g).connect(mixer.bus(ctx, 'effects'));
    src.start(t, Math.random());
    src.stop(t + 0.08);
    this.tone(110, t, 0.12, 0.3, 'triangle');
    // Ding: "secured".
    this.tone(1318.5, t + 0.07, 0.35, 0.06);
  }
}

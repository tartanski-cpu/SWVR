import { babble, speakOrBabble } from './babble';
import { noiseBuffer } from './engineAudio';

/**
 * The VHF's sounds: a two-tone alert for a distress call, a crackle of static before and
 * after each message, and the message read out with the browser's speech synthesis (Web
 * Speech API) where it exists - otherwise the text on the radio screen is the message.
 * Everything goes through a narrow band-pass so it sounds like a little speaker.
 */
export class RadioAudio {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private noise!: AudioBuffer;
  private level = 1;

  attach(ctx: AudioContext | null): void {
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    this.noise = noiseBuffer(ctx, 1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 0.8;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(bp).connect(ctx.destination);
  }

  /** @param distance from the listener to the radio (m) */
  setDistance(distance: number): void {
    this.level = 1 / (1 + Math.max(0, distance - 1) / 5);
    if (this.ctx) this.out.gain.setTargetAtTime(this.level, this.ctx.currentTime, 0.1);
  }

  /** Distress alert: three two-tone beeps. Returns its length (s). */
  alert(): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const t0 = ctx.currentTime + 0.02;
    for (let i = 0; i < 6; i++) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = i % 2 ? 1700 : 1300;
      const g = ctx.createGain();
      const t = t0 + i * 0.16;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.005);
      g.gain.setValueAtTime(0.12, t + 0.14);
      g.gain.linearRampToValueAtTime(0, t + 0.15);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + 0.16);
    }
    return 6 * 0.16;
  }

  /** A burst of static (key-up / squelch tail). */
  crackle(duration: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    // Ragged: a few random steps in level.
    for (let k = 0; k < 8; k++) g.gain.setValueAtTime(0.05 + Math.random() * 0.12, t + (k / 8) * duration);
    g.gain.setValueAtTime(0, t + duration);
    src.connect(g).connect(this.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + duration + 0.05);
  }

  /**
   * Read a message out after `delay` seconds: with the browser's speech synthesis if it
   * can, else (no voices, or it stays silent - the Quest browser) a radio-voice babble.
   */
  speak(text: string, delay = 0): void {
    const spoken = text.replace(/°/g, ' degrees').replace(/(\d)\.(\d)/g, '$1 point $2').replace(/MAYDAY RELAY/g, 'Mayday relay, Mayday relay').replace(/PAN-PAN/g, 'Pan-pan, pan-pan');
    setTimeout(() => {
      speakOrBabble(
        spoken,
        (u) => {
          u.rate = 1.05;
          u.pitch = 0.85;
          u.volume = Math.min(1, 0.9 * this.level);
          const voices = window.speechSynthesis.getVoices();
          const en = voices.find((v) => v.lang.startsWith('en-GB')) ?? voices.find((v) => v.lang.startsWith('en'));
          if (en) u.voice = en;
          u.onend = () => this.crackle(0.2);
        },
        () => {
          const ctx = this.ctx;
          if (!ctx) return;
          const end = babble(ctx, this.out, spoken, ctx.currentTime + 0.05, 115, 0.45);
          this.crackle(0.2, end - ctx.currentTime);
        },
        true,
      );
    }, delay * 1000);
  }

  /** A whole incoming message: alert (distress only), static, voice. */
  message(kind: 'distress' | 'reply' | 'info', text: string): void {
    let at = 0;
    if (kind === 'distress') at = this.alert() + 0.1;
    this.crackle(0.45, at);
    this.speak(text, at + 0.45);
  }
}

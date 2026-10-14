import { mixer } from './mixer';
/**
 * Engine alarm buzzer on the bridge: a piezo-style square-wave beep (2.4 kHz, 0.2 s on /
 * 0.3 s off) while an alarm is active. Shares the AudioContext created by EngineAudio.
 */
export class AlarmAudio {
  private ctx: AudioContext | null = null;
  private gain!: GainNode;

  attach(ctx: AudioContext | null): void {
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 5000;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 2400;
    o.connect(filter).connect(this.gain).connect(mixer.bus(ctx, 'effects'));
    o.start();
  }

  /** @param distance listener distance from the console (m) */
  update(on: boolean, distance: number): void {
    if (!this.ctx) return;
    const beepOn = on && this.ctx.currentTime % 0.5 < 0.2;
    const level = 0.06 / (1 + distance / 4);
    this.gain.gain.setTargetAtTime(beepOn ? level : 0, this.ctx.currentTime, 0.005);
  }
}

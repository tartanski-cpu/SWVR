import { CONFIG } from '../config';
import { mixer } from './mixer';

/**
 * The FM radio's sound: an internet radio stream in a plain <audio> element. Not through
 * WebAudio, because that needs the stream to allow cross-origin access (most don't); the
 * element's own volume is set every frame from the FM setting and the distance to the set.
 *
 * Each player's browser plays the stream itself (in multiplayer you all hear the station
 * the set is tuned to, a second or two apart). `status` says what it's doing, for the
 * set's display: '' playing, 'TUNING…', or 'NO SIGNAL' (stream failed or unreachable).
 */
export class FmRadio {
  private el: HTMLAudioElement | null = null;
  private url = '';
  status = '';
  private retryAt = 0;
  /** play() was refused for want of a user gesture: wait for one. */
  private blocked = false;

  private element(): HTMLAudioElement {
    if (!this.el) {
      const el = new Audio();
      el.preload = 'none';
      el.addEventListener('playing', () => (this.status = ''));
      el.addEventListener('waiting', () => (this.status = 'TUNING…'));
      el.addEventListener('error', () => {
        this.status = 'NO SIGNAL';
        // Try the stream again a little later (it may come back).
        this.retryAt = performance.now() + 15000;
      });
      this.el = el;
    }
    return this.el;
  }

  /**
   * @param on       the set is switched on
   * @param station  index into CONFIG.fmRadio.stations
   * @param distance from the listener to the set (m)
   */
  update(on: boolean, station: number, distance: number): void {
    const cfg = CONFIG.fmRadio;
    const st = cfg.stations[station];
    // Out of earshot counts as off: no point streaming nobody can hear.
    const audible = on && !!st && distance < cfg.range;
    if (!audible) {
      if (this.el && this.url) {
        this.el.pause();
        this.el.removeAttribute('src');
        this.el.load();
        this.url = '';
      }
      if (!on) this.status = '';
      return;
    }
    if (this.blocked) return;
    const el = this.element();
    const retry = this.status === 'NO SIGNAL' && performance.now() > this.retryAt;
    if (this.url !== st.url || retry) {
      this.url = st.url;
      this.status = 'TUNING…';
      el.src = st.url;
      el.play().catch((e: Error) => {
        // Autoplay refused (no user gesture yet on this page): it'll try again on the next.
        if (e.name === 'NotAllowedError') {
          this.status = 'TAP TO PLAY';
          this.url = '';
          this.blocked = true;
          const again = () => {
            window.removeEventListener('pointerdown', again);
            this.blocked = false;
          };
          window.addEventListener('pointerdown', again);
        }
      });
    }
    const fade = distance <= cfg.fullRange ? 1 : Math.max(0, 1 - (distance - cfg.fullRange) / (cfg.range - cfg.fullRange));
    el.volume = Math.min(1, mixer.level('music') * fade * fade);
  }
}

import { CONFIG } from '../config';
import { mixer } from './mixer';

/**
 * The FM radio's sound: an internet radio stream played from the set, the box hung under
 * the wheelhouse roof.
 *
 * The stream plays in an <audio> element routed into the game's WebAudio graph:
 *
 *   stream -> low-pass (the wheelhouse walls) -> level -> HRTF panner at the set -> 'music' bus
 *
 * so it comes from the set's direction, fades with distance (our own law, `fullRange` to
 * `range`, not the panner's), and outside the wheelhouse it's quieter and duller: the walls
 * take the top off (`outsideLp`, lower again with the doors shut, `outsideShutLp`).
 *
 * Routing a stream into WebAudio needs the station to allow cross-origin access (all the
 * listed ones do). If one doesn't, its load fails; that station is then played the old way,
 * a plain <audio> element whose volume follows the same distance and walls, with no
 * direction and no muffling of the tone.
 *
 * Each player's browser plays the stream itself (in multiplayer you all hear the station
 * the set is tuned to, a second or two apart). `status` says what it's doing, for the
 * set's display: '' playing, 'TUNING…', 'TAP TO PLAY' or 'NO SIGNAL' (stream failed or
 * unreachable).
 */
export class FmRadio {
  private ctx: AudioContext | null = null;
  /** The stream routed through WebAudio (made once there's an AudioContext). */
  private routed: { el: HTMLAudioElement; lp: BiquadFilterNode; gain: GainNode; panner: PannerNode } | null = null;
  /** The plain element, for a station that won't allow WebAudio. */
  private plain: HTMLAudioElement | null = null;
  /** Stations whose stream failed routed: played plain from then on (this page). */
  private readonly plainUrls = new Set<string>();
  /** The element playing now and its stream ('' none). */
  private el: HTMLAudioElement | null = null;
  private url = '';
  status = '';
  private retryAt = 0;
  /** play() was refused for want of a user gesture: wait for one. */
  private blocked = false;

  /** The game's AudioContext, once a user gesture has started audio. */
  attach(ctx: AudioContext | null): void {
    if (ctx) this.ctx = ctx;
  }

  private watch(el: HTMLAudioElement, routed: boolean): void {
    el.preload = 'none';
    el.addEventListener('playing', () => (this.status = ''));
    el.addEventListener('waiting', () => (this.status = 'TUNING…'));
    el.addEventListener('error', () => {
      if (el !== this.el || !this.url) return;
      if (routed && !this.plainUrls.has(this.url)) {
        // Perhaps the station won't allow WebAudio: try it plain straight away.
        this.plainUrls.add(this.url);
        this.retryAt = 0;
      } else {
        // Try the stream again a little later (it may come back).
        this.retryAt = performance.now() + 15000;
      }
      this.status = 'NO SIGNAL';
    });
  }

  private routedElement(ctx: AudioContext): NonNullable<FmRadio['routed']> {
    if (!this.routed) {
      const el = new Audio();
      el.crossOrigin = 'anonymous';
      this.watch(el, true);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 20000;
      lp.Q.value = 0.5;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      // Direction only: the level by distance is ours (`gain`), so no roll-off here.
      panner.distanceModel = 'linear';
      panner.rolloffFactor = 0;
      ctx.createMediaElementSource(el).connect(lp).connect(gain).connect(panner).connect(mixer.bus(ctx, 'music'));
      this.routed = { el, lp, gain, panner };
    }
    return this.routed;
  }

  private plainElement(): HTMLAudioElement {
    if (!this.plain) {
      this.plain = new Audio();
      this.watch(this.plain, false);
    }
    return this.plain;
  }

  private stop(): void {
    if (this.el && this.url) {
      this.el.pause();
      this.el.removeAttribute('src');
      this.el.load();
    }
    this.url = '';
  }

  /**
   * @param on       the set is switched on
   * @param station  index into CONFIG.fmRadio.stations
   * @param set      where the set is (world, m)
   * @param distance from the listener to the set (m)
   * @param walls    between you and the set: 0 in the wheelhouse, 1 outside with its door
   *                 open, 2 outside with the doors shut
   */
  update(on: boolean, station: number, set: { x: number; y: number; z: number }, distance: number, walls: 0 | 1 | 2): void {
    const cfg = CONFIG.fmRadio;
    const st = cfg.stations[station];
    // Out of earshot counts as off: no point streaming nobody can hear.
    const audible = on && !!st && distance < cfg.range;
    if (!audible) {
      this.stop();
      if (!on) this.status = '';
      return;
    }
    // Audio starts on the first tap or click (browsers insist); until then, nothing to play through.
    if (!this.ctx) {
      this.status = 'TAP TO PLAY';
      return;
    }
    if (this.blocked) return;
    const plain = this.plainUrls.has(st.url);
    const routed = plain ? null : this.routedElement(this.ctx);
    const el = routed ? routed.el : this.plainElement();
    const retry = this.status === 'NO SIGNAL' && performance.now() > this.retryAt;
    if (this.url !== st.url || this.el !== el || retry) {
      this.stop();
      this.el = el;
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
    const wallLevel = walls === 0 ? 1 : walls === 1 ? cfg.outsideLevel : cfg.outsideShutLevel;
    // Broadcast streams are mastered loud: `gain` brings them down to sit with the game's sounds.
    const level = Math.min(1, cfg.gain * fade * fade * wallLevel);
    if (routed) {
      const t = this.ctx.currentTime;
      el.volume = 1;
      // The 'music' bus carries the FM volume setting; smoothed so stepping through the door doesn't click.
      routed.gain.gain.setTargetAtTime(level, t, 0.08);
      routed.lp.frequency.setTargetAtTime(walls === 0 ? 20000 : walls === 1 ? cfg.outsideLp : cfg.outsideShutLp, t, 0.08);
      const p = routed.panner;
      if (p.positionX) {
        p.positionX.setValueAtTime(set.x, t);
        p.positionY.setValueAtTime(set.y, t);
        p.positionZ.setValueAtTime(set.z, t);
      } else {
        // Older API (some browsers).
        (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(set.x, set.y, set.z);
      }
    } else {
      el.volume = Math.min(1, level * mixer.level('music'));
    }
  }
}

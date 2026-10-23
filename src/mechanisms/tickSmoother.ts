/**
 * Smoothing a mechanism's drawn position between simulation ticks (owner, Oct 2026: the deck
 * crane's slew "kind of laggy ... the steps"). The simulation moves a crane at 60 ticks a
 * second, the Quest draws 90 frames a second, and a module's view reads the latest tick's
 * state: drawn straight from it, the crane moves on two frames of every three and stands still
 * on the third, a staircase you feel as stutter. (A boat's own pose doesn't: the app draws it
 * between its last two ticks.) On a crew-mate's machine the host's snapshots come further apart
 * still.
 *
 * So each value is drawn following the newest one through two smoothing stages in turn (each
 * closes the gap at a rate set by `tau`), which turns the staircase into a steady motion at the
 * frame rate and starts and stops it gently. `tau` is the time the ticks are arriving apart
 * (measured, so it suits a crew-mate's snapshots too) times `CONFIG.modules.smoothing.tauTicks`:
 * the drawing runs about two of those behind the simulation (some 30 ms on the Quest). A jump
 * bigger than `snap` (a reset, a teleport, a fresh snapshot) is drawn at once.
 */
import { CONFIG } from '../config';

export class TickSmoother {
  private a: number[] = [];
  private b: number[] = [];
  private last: number[] = [];
  /** Time since the newest value arrived, and the measured time between arrivals (s). */
  private since = 0;
  private interval = 1 / CONFIG.sim.tickRate;
  private started = false;

  /** @param snap per value: a change bigger than this is drawn at once, not followed. */
  constructor(private readonly snap: readonly number[]) {}

  /** Start afresh: the next values are drawn as they are. */
  reset(): void {
    this.started = false;
  }

  /**
   * The values to draw this frame, for the latest `target` (from the newest tick) after `dt`
   * seconds of frame time. Returns its own array (read it before the next call).
   */
  update(target: readonly number[], dt: number): readonly number[] {
    const n = target.length;
    if (!this.started || this.b.length !== n) {
      this.a = [...target];
      this.b = [...target];
      this.last = [...target];
      this.started = true;
      return this.b;
    }
    this.since += dt;
    if (target.some((v, i) => v !== this.last[i])) {
      // A new tick: how far apart they come (each arrival's gap, eased; not the pause before
      // it starts moving after standing still).
      if (this.since < 0.25) this.interval += (Math.max(1 / 120, this.since) - this.interval) * 0.2;
      this.since = 0;
      for (let i = 0; i < n; i++) {
        // A jump: drawn at once.
        if (Math.abs(target[i] - this.b[i]) > this.snap[i]) this.a[i] = this.b[i] = target[i];
        this.last[i] = target[i];
      }
    }
    const k = 1 - Math.exp(-dt / (this.interval * CONFIG.modules.smoothing.tauTicks));
    for (let i = 0; i < n; i++) {
      this.a[i] += (target[i] - this.a[i]) * k;
      this.b[i] += (this.a[i] - this.b[i]) * k;
    }
    return this.b;
  }
}

/**
 * Fixed-timestep accumulator ("Fix Your Timestep", Glenn Fiedler).
 *
 * The renderer runs at whatever rate the display or headset gives us (72/90/120 Hz),
 * while the simulation always advances in exact `dt` increments. Each rendered frame
 * we add the real elapsed time to an accumulator and run as many whole ticks as fit.
 * The leftover fraction (`alpha`, 0..1) tells views how far we are between the
 * previous and current simulation state, so they can interpolate and avoid judder.
 */
export class FixedStepLoop {
  readonly dt: number;
  private accumulator = 0;

  constructor(
    tickRate: number,
    private readonly maxTicksPerFrame: number,
  ) {
    this.dt = 1 / tickRate;
  }

  /**
   * @param elapsed real seconds since the previous frame
   * @returns number of simulation ticks to run now, and the interpolation factor
   *          to use when rendering after those ticks.
   */
  advance(elapsed: number): { ticks: number; alpha: number } {
    this.accumulator += Math.max(0, elapsed);

    // Small epsilon so that e.g. exactly 1/60 s of accumulated time yields one tick
    // despite floating-point rounding.
    let ticks = Math.floor(this.accumulator / this.dt + 1e-9);
    if (ticks > this.maxTicksPerFrame) {
      // We fell too far behind: run the maximum and throw the rest away.
      ticks = this.maxTicksPerFrame;
      this.accumulator = ticks * this.dt;
    }
    this.accumulator = Math.max(0, this.accumulator - ticks * this.dt);

    return { ticks, alpha: Math.min(1, this.accumulator / this.dt) };
  }
}

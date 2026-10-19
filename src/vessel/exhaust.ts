import { CONFIG } from '../config';
import { fullLoadTorque, type EngineSpec } from './physics/propulsion';
import type { EngineState } from './vesselState';

/**
 * Why a diesel smokes (owner, Oct 2026): a small model of the combustion, from her engine's
 * state each frame, for the exhaust plume (view/exhaustSmoke.ts). Tunables and the physics
 * in words: CONFIG.effects.exhaust.
 *
 * What is modelled:
 *   air   a full charge every stroke; a turbocharged engine's charge is (1 + boost) of it.
 *         Boost comes from exhaust energy (rack × revs²) and lags it (turbo lag: it spools up
 *         over `turbo.lagS`, and falls off faster). At rated revs and full rack the boost is
 *         `turbo.maxBoost`, and that is what the full-load air–fuel ratio is set at.
 *   fuel  per stroke: what makes the torque, rack × the full-load torque at those revs
 *         (her torque curve; the engine model's own rule), relative to full rack at rated
 *         revs; more of it per stroke at low revs on a mechanical pump (`lugFuel`), and a
 *         transient surplus as the rack swings open (`snapFuel`).
 *   soot  (black) when the ratio of air to fuel, relative to stoichiometric (lambda), falls
 *         below the smoke limit: linearly from `smokeLambda` (a trace) to `blackLambda` (all).
 *   white a cold block: unburnt fuel and water vapour, fading as it warms (`coldC` to
 *         `coldClearC`), less under load, where the cylinders are hotter.
 *   blue  lube oil burnt past worn rings and guides: with the engine's wear, most at idle
 *         (low cylinder pressure draws it in) and more when cold.
 *
 * Nothing here feeds back into her power or heat: the engine model has no turbo. The boost
 * is this model's own estimate, so it lives with the drawing, not in the world state.
 */
export interface ExhaustSmoke {
  /** 0..1 each: black soot, white vapour, blue oil smoke. */
  soot: number;
  white: number;
  blue: number;
  /** How much there is to see, 0..1 (the haze alone is faint). */
  opacity: number;
  /** For displays and tests: the air–fuel ratio relative to stoichiometric, and the turbo's boost. */
  lambda: number;
  boost: number;
}

export class ExhaustModel {
  /** The turbo's boost (0: none; 1: twice the air). Naturally aspirated: stays 0. */
  boost = 0;
  private lastRack: number | null = null;

  readonly ratedRpm: number;
  private readonly torqueRated: number;

  /**
   * @param turbo  turbocharged (her engine voice has a turbo: CONFIG.engineVoices)
   * @param spec   her engine (its rated speed and torque curve)
   */
  constructor(
    readonly turbo: boolean,
    private readonly spec: EngineSpec,
    private readonly c = CONFIG.effects.exhaust,
  ) {
    this.ratedRpm = spec.engine.ratedRpm;
    this.torqueRated = fullLoadTorque(spec, this.ratedRpm);
  }

  step(dt: number, e: EngineState): ExhaustSmoke {
    const c = this.c;
    const running = e.phase === 'running';
    const rpmFrac = Math.min(1.2, Math.max(0, e.rpm / this.ratedRpm));
    const rack = running ? e.rack : 0;
    // The turbo: spools toward the exhaust energy's boost, slower up than down.
    const target = this.turbo ? c.turbo.maxBoost * rack * rpmFrac * rpmFrac : 0;
    const lag = target > this.boost ? c.turbo.lagS : c.turbo.lagS / 2;
    this.boost += (target - this.boost) * Math.min(1, dt / lag);
    const air = (1 + this.boost) / (1 + (this.turbo ? c.turbo.maxBoost : 0));
    // Fuel per stroke: the rack, the pump's over-delivery at low revs, the swing of the rack.
    const rackRate = this.lastRack === null || dt <= 0 ? 0 : Math.max(0, (rack - this.lastRack) / dt);
    this.lastRack = rack;
    const torque = fullLoadTorque(this.spec, Math.max(0, e.rpm)) / this.torqueRated;
    const fuel = rack * torque * (1 + c.lugFuel * Math.max(0, 1 - rpmFrac)) + c.snapFuel * rackRate;
    const lambdaFull = this.turbo ? c.lambdaFull.turbo : c.lambdaFull.natural;
    const lambda = fuel > 0.001 ? (lambdaFull * air) / fuel : 99;
    const soot = running ? clamp((c.smokeLambda - lambda) / (c.smokeLambda - c.blackLambda)) : 0;
    const cold = clamp((c.coldClearC - e.coolantC) / (c.coldClearC - c.coldC));
    const white = running ? cold * (1 - 0.6 * rack) : 0;
    const blue = running ? Math.min(1, c.blueWear * (e.wear ?? 0) * (1 - 0.7 * rack) * (1 + cold)) : 0;
    const opacity = running ? Math.min(1, c.haze + soot + 0.8 * white + 0.6 * blue) : 0;
    return { soot, white, blue, opacity, lambda, boost: this.boost };
  }
}

function clamp(x: number): number {
  return Math.min(1, Math.max(0, x));
}

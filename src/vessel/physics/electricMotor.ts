/**
 * An electric propulsion motor and its propeller (owner, 27 Oct 2026: "it looks like we need
 * to implement the electric drives"; the Shipyard's solar catamaran, one in each of her pods).
 * Deliberately simple, as the diesel is (physics/propulsion.ts), and on the same engine state,
 * so the screens, the sound and the crew's copy read it as they read a diesel's:
 *
 *   lever    past neutral, the speed it asks for: n_set = throttle * rated rpm, ahead or
 *            astern (no clutch and no idle: the motor turns the propeller either way, from
 *            rest, and stands still in neutral)
 *   control  the motor's controller holds that speed: it gives the propeller's torque plus
 *            what closes the gap in about `responseS`, Q = Q_prop + I (w_set - w) / responseS,
 *            no more than its full torque Q_max = P_rated / w_rated either way (a
 *            permanent-magnet motor gives its full torque from standstill to its rated speed;
 *            it isn't run past it). So it holds the speed asked for under load, until the load
 *            takes all its torque.
 *            Pulled back or reversed, it brakes the propeller with the same torque and
 *            returns that energy to the battery (regenerates).
 *   shaft    (I_m + I_p / i^2) dw/dt = Q - Q_prop / (i eta_gear), through the pod's gears i
 *   battery  it draws P = Q w / eta_motor (gives back Q w eta_motor braking), from her
 *            battery's usable kWh; flat, the controller stops (no torque either way).
 *
 * Its state is the engine's (EngineState): `phase` 'running' while it's switched on (the key)
 * with 12 V for the controller and charge in the battery, else 'off'; `rpm` and `gear` the
 * motor's speed and which way it turns (signed speed = gear x rpm); `rack` its torque over
 * Q_max (the load); `powerKw` what it draws (+) or gives back (-). No fuel, heat, oil or wear.
 */
import { clamp } from '../../core/math';
import type { EngineState } from '../vesselState';
import { propellerForces, type DieselSpec } from './propulsion';

const TWO_PI = Math.PI * 2;
/** Switched off or in neutral, below this (motor rpm) it stops. */
const STOP_RPM = 30;

/** The motor as configured (CONFIG.shipyard.solarCat.motor, through the pods' `electric`). */
export interface MotorSpec {
  /** Her battery's usable energy (kWh): VesselState.battery is the share of it left. */
  usableKWh: number;
  /** The motor and its controller's efficiency, 0..1. */
  efficiency: number;
  /** The motor's own rotor inertia (kg m^2, at the motor). */
  inertia: number;
  /** How quickly its controller brings it to the speed asked for (s). */
  responseS: number;
  /** What the fuel berth's charger gives her battery while the hose is on (kW, on the game's clock), until the quayside chargers come. */
  berthChargeKw: number;
}

/** What the motor reads: the lever (-1..1), switched on with 12 V, and her battery's charge (0..1). */
export interface MotorInputs {
  lever: number;
  on: boolean;
  charge: number;
}

/**
 * Advance the motor and its propeller by dt; returns the propeller's thrust (N) and sets
 * `e.powerKw`. The energy drawn is for the caller to take off her battery (`out.kWh`, + drawn).
 *
 * @param speed     the speed of advance at the propeller (m/s, + ahead)
 * @param immersion 0..1, how much of the propeller disc is under water
 */
export function motorStep(e: EngineState, def: DieselSpec, m: MotorSpec, inp: MotorInputs, speed: number, immersion: number, dt: number, out: { kWh: number }): number {
  const cfg = def.engine;
  const i = cfg.gearRatio;
  const ready = inp.on && inp.charge > 0;
  e.phase = ready ? 'running' : 'off';
  e.crank = 0;
  e.shift = 0;
  e.autoCrank = false;
  e.fuelFlowLph = 0;
  // The lever's speed from its neutral band to full (no trolling valve: the motor turns slowly itself).
  const nb = cfg.neutralBand;
  const target = ready && Math.abs(inp.lever) > nb ? Math.sign(inp.lever) * clamp((Math.abs(inp.lever) - nb) / (1 - nb), 0, 1) * cfg.ratedRpm : 0;
  const omegaRated = (cfg.ratedRpm * TWO_PI) / 60;
  const qMax = (cfg.powerKw * 1000) / omegaRated;
  const inertia = m.inertia + def.propeller.inertia / (i * i);
  const steps = 4;
  const h = dt / steps;
  // The motor's signed speed (rpm, + ahead).
  let n = e.gear * e.rpm;
  let thrust = 0;
  let q = 0;
  let joules = 0;
  for (let k = 0; k < steps; k++) {
    const f = propellerForces(def, n / i / 60, speed);
    thrust = f.thrust * immersion;
    // The propeller's torque against the way it turns.
    const load = (Math.sign(n) * f.torque * immersion) / (i * cfg.gearEfficiency);
    const omega = (n * TWO_PI) / 60;
    q = ready ? clamp(load + (inertia * ((target * TWO_PI) / 60 - omega)) / Math.max(m.responseS, h), -qMax, qMax) : 0;
    // Power at the shaft (+ driving, - braking): drawn over the motor's efficiency, given back under it.
    const shaftW = q * omega;
    joules += (shaftW > 0 ? shaftW / m.efficiency : shaftW * m.efficiency) * h;
    const next = omega + ((q - load) / inertia) * h;
    // Coasting down, it stops at rest (the propeller's drag can't spin it backwards), and from a
    // crawl (`STOP_RPM`: its bearings and seals; the propeller's drag fades out with its speed squared).
    // Brought to a stop in neutral, it stops there too.
    n = target === 0 && (Math.sign(next) !== Math.sign(omega) || Math.abs(next) < (STOP_RPM * TWO_PI) / 60) ? 0 : (next * 60) / TWO_PI;
  }
  e.rpm = Math.abs(n);
  e.gear = n > 0.5 ? 1 : n < -0.5 ? -1 : 0;
  if (e.gear === 0) e.rpm = 0;
  e.rack = Math.abs(q) / qMax;
  e.powerKw = joules / dt / 1000;
  out.kWh = joules / 3.6e6;
  return thrust;
}

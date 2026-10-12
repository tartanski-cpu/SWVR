/**
 * Machinery, propeller, rudder and calm-water resistance. Deliberately simple, one engine:
 *
 *   lever ──► gearbox (clutch with shift delay) ──► engine RPM governor (first-order lag)
 *         └─► propeller: T = ρ n² D⁴ K_T(J), K_T linear in J (ahead / astern)
 *   helm  ──► hydraulic rudder actuator (rate-limited) ──► rudder normal force from hull
 *             inflow plus propeller slipstream
 *
 * All functions are pure with respect to their inputs (state is passed in and mutated
 * explicitly), so they run identically in the headless sim and tests.
 */
import { CONFIG } from '../../config';
import { clamp } from '../../core/math';
import type { VesselDef } from '../vesselDef';
import type { VesselState } from '../vesselState';

const NU = 1.19e-6; // kinematic viscosity of sea water at 15 °C (m²/s)

/** Gear the lever is asking for, and the throttle fraction beyond the neutral detent. */
export function leverDemand(def: VesselDef, lever: number): { gear: -1 | 0 | 1; throttle: number } {
  const nb = def.engine.neutralBand;
  const gear = lever > nb ? 1 : lever < -nb ? -1 : 0;
  return { gear, throttle: gear === 0 ? 0 : clamp((Math.abs(lever) - nb) / (1 - nb), 0, 1) };
}

/** Start (only in neutral, if so configured) or stop the engine. */
export function toggleEngine(s: VesselState, def: VesselDef): void {
  const e = s.engine;
  if (e.phase === 'off') {
    if (def.engine.startOnlyInNeutral && leverDemand(def, s.controls.lever).gear !== 0) return;
    e.phase = 'cranking';
    e.crank = 0;
  } else {
    e.phase = 'off';
  }
}

/** Advance engine, clutch and steering gear by dt. */
export function stepMachinery(s: VesselState, def: VesselDef, dt: number): void {
  const e = s.engine;
  const cfg = def.engine;
  const demand = leverDemand(def, s.controls.lever);

  let target = 0;
  switch (e.phase) {
    case 'off':
      e.gear = 0; // no oil pressure, clutch disengaged
      target = 0;
      break;
    case 'cranking':
      e.crank += dt;
      target = 180; // starter motor speed
      if (e.crank >= cfg.crankTime) {
        e.phase = 'running';
        e.rpm = Math.max(e.rpm, cfg.idleRpm * 0.85);
      }
      break;
    case 'running': {
      // Clutch: going to neutral is immediate; engaging a gear needs the lever held there
      // for shiftDelay with the engine near idle (protects the gearbox, like the real thing).
      if (demand.gear !== e.gear) {
        if (demand.gear === 0) {
          e.gear = 0;
          e.shift = 0;
        } else {
          e.shift += dt;
          if (e.shift >= cfg.shiftDelay && e.rpm < cfg.idleRpm * 1.3) {
            e.gear = demand.gear;
            e.shift = 0;
          }
        }
      } else {
        e.shift = 0;
      }
      const throttle = demand.gear === e.gear ? demand.throttle : 0;
      target = cfg.idleRpm + throttle * (cfg.maxRpm - cfg.idleRpm);
      break;
    }
  }
  const tau = target > e.rpm ? cfg.spoolUpTime : cfg.spoolDownTime;
  e.rpm += (target - e.rpm) * Math.min(1, dt / tau);
  if (e.phase === 'off' && e.rpm < 1) e.rpm = 0;

  // Steering gear: rudder follows the helm at a fixed rate.
  const maxA = (def.rudder.maxAngleDeg * Math.PI) / 180;
  const want = clamp(s.controls.helm, -1, 1) * maxA;
  const step = ((def.rudder.rateDegPerS * Math.PI) / 180) * dt;
  s.rudder += clamp(want - s.rudder, -step, step);
}

/**
 * Propeller thrust (N), + = ahead.
 * @param speed vessel speed through the water along the shaft (m/s), + = ahead
 */
export function propellerThrust(s: VesselState, def: VesselDef, speed: number): number {
  const e = s.engine;
  if (e.phase !== 'running' || e.gear === 0) return 0;
  const p = def.propeller;
  const n = e.rpm / def.engine.gearRatio / 60; // prop rev/s
  if (n < 0.05) return 0;
  const va = speed * (1 - p.wake);
  const base = CONFIG.ocean.density * n * n * p.diameter ** 4;
  if (e.gear === 1) {
    const J = va / (n * p.diameter);
    return base * clamp(p.kt0 * (1 - J / p.j0), -0.2 * p.kt0, p.kt0 * 1.5);
  }
  // Astern: advance ratio measured in the astern direction, so moving ahead (crash stop)
  // makes the backing prop bite harder.
  const J = -va / (n * p.diameter);
  return -base * clamp(p.kt0 * p.asternEfficiency * (1 - J / p.j0), -0.2 * p.kt0, p.kt0 * 1.5);
}

/**
 * Rudder force in vessel axes (x = starboard, z = aft) from the water flow seen by the
 * rudder, given as the rudder's velocity relative to the water (vessel axes).
 * Uses a normal-force model: N = ½ ρ A |U|² C_N(α), C_N linear to the stall angle then flat,
 * acting along the rudder's normal - so it also produces drag when the rudder is over.
 */
export function rudderForce(
  s: VesselState,
  def: VesselDef,
  relVx: number,
  relVz: number,
  thrust: number,
  out: { x: number; z: number },
): void {
  const r = def.rudder;
  // Flow seen by the rudder from the hull's motion (water moving aft = +z going ahead).
  const fx = -relVx * (1 - r.flowStraightening);
  let fz = -relVz;
  if (fz > 0) fz *= 1 - def.propeller.wake;
  // Normal force without slipstream...
  let N = rudderNormal(s, def, fx, fz);
  if (thrust > 0) {
    // ...plus the slipstream's contribution. Momentum theory gives the far-wake speed
    // increase; part of it is developed at the rudder. The extra force can't exceed what
    // deflecting the slipstream's momentum (~T) can give, so it is capped at washMaxFraction*T.
    const d = def.propeller.diameter;
    const extra = (r.washFactor * 8 * thrust) / (CONFIG.ocean.density * Math.PI * d * d);
    const withWash = rudderNormal(s, def, fx, Math.sqrt(Math.max(fz, 0) ** 2 + extra));
    const cap = r.washMaxFraction * thrust;
    N += clamp(withWash - N, -cap, cap);
  }
  out.x = N * Math.cos(s.rudder);
  out.z = -N * Math.sin(s.rudder);
}

/** Signed normal force (N) on the rudder plate for inflow (fx, fz) in vessel axes. */
function rudderNormal(s: VesselState, def: VesselDef, fx: number, fz: number): number {
  const r = def.rudder;
  const u2 = fx * fx + fz * fz;
  if (u2 < 1e-6) return 0;
  // Plate normal (perpendicular to the chord; chord runs aft at angle `rudder`).
  const nx = Math.cos(s.rudder);
  const nz = -Math.sin(s.rudder);
  const alpha = Math.asin(clamp((fx * nx + fz * nz) / Math.sqrt(u2), -1, 1));
  const stall = (r.stallDeg * Math.PI) / 180;
  const cn = r.liftSlope * Math.sign(alpha) * Math.min(Math.abs(alpha), stall);
  return 0.5 * CONFIG.ocean.density * r.area * u2 * cn;
}

/**
 * Calm-water resistance (N, always >= 0) at speed U through the water (m/s, + ahead).
 * ITTC-57 friction with a form factor, plus an empirical wave-making term in Fn.
 */
export function calmWaterResistance(def: VesselDef, U: number): number {
  const speed = Math.abs(U);
  if (speed < 1e-4) return 0;
  const r = def.resistance;
  const rho = CONFIG.ocean.density;
  const g = CONFIG.ocean.gravity;
  const Re = Math.max(1e5, (speed * r.lwl) / NU);
  const cf = 0.075 / (Math.log10(Re) - 2) ** 2;
  const rf = 0.5 * rho * def.wettedSurface * speed * speed * cf * (1 + r.formFactor);
  const fn = speed / Math.sqrt(g * r.lwl);
  const rw = def.mass * g * (r.waveA * fn ** 4 + r.waveB * Math.max(0, fn - r.waveKnee) ** 2);
  return (rf + rw) * (U < 0 ? r.asternFactor : 1);
}

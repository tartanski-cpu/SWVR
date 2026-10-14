/**
 * Machinery, propeller, rudder and calm-water resistance. Deliberately simple, one engine:
 *
 *   lever ──► gearbox (clutch with shift delay)
 *         └─► droop governor ──► fuel rack ──► engine torque curve ──┐
 *                                                    shaft torque balance (engine + prop inertia)
 *   propeller: T = K_T(J) ρ n² D⁴, load Q = K_Q(J) ρ n² D⁵ ◄─────────┘
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
import { derateRackCap } from './engineThermal';

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

const TWO_PI = Math.PI * 2;

/** Full-load torque (N*m) at `rpm`, linear interpolation of the configured curve. */
export function fullLoadTorque(def: VesselDef, rpm: number): number {
  const c = def.engine.torqueCurve;
  if (rpm <= c[0][0]) return c[0][1];
  for (let i = 0; i < c.length - 1; i++) {
    if (rpm <= c[i + 1][0]) {
      const t = (rpm - c[i][0]) / (c[i + 1][0] - c[i][0]);
      return c[i][1] + (c[i + 1][1] - c[i][1]) * t;
    }
  }
  return 0;
}

/**
 * Propeller thrust (N, + = ahead) and shaft torque (N*m, opposing rotation, >= 0) at prop
 * speed n (rev/s, signed: + = ahead rotation) and vessel speed through the water (m/s).
 */
export function propellerForces(def: VesselDef, n: number, speed: number): { thrust: number; torque: number } {
  const p = def.propeller;
  const an = Math.abs(n);
  if (an < 0.02) return { thrust: 0, torque: 0 };
  const rho = CONFIG.ocean.density;
  const va = speed * (1 - p.wake);
  // Advance ratio in the prop's own working direction: moving ahead while backing
  // (crash stop) gives negative J, so the prop bites harder and absorbs more torque.
  const J = (n > 0 ? va : -va) / (an * p.diameter);
  const kt = clamp(p.kt0 * (1 - J / p.j0), -0.2 * p.kt0, 1.6 * p.kt0);
  const kq = clamp(p.kq0 * (1 - J / p.jq0), -0.1 * p.kq0, 1.6 * p.kq0);
  const astern = n < 0;
  const thrust = kt * rho * an * an * p.diameter ** 4 * (astern ? p.asternEfficiency : 1);
  const torque = kq * rho * an * an * p.diameter ** 5 * (astern ? p.asternTorque : 1);
  return { thrust: astern ? -thrust : thrust, torque };
}

/** Advance the steering gear: the rudder follows the helm at a fixed rate. */
export function stepSteering(s: VesselState, def: VesselDef, dt: number): void {
  const maxA = (def.rudder.maxAngleDeg * Math.PI) / 180;
  const want = clamp(s.controls.helm, -1, 1) * maxA;
  const step = ((def.rudder.rateDegPerS * Math.PI) / 180) * dt;
  s.rudder += clamp(want - s.rudder, -step, step);
}

/**
 * Advance engine, clutch and shaft by dt and return the propeller thrust (N).
 *
 *   engine torque  Q_e = rack * Q_max(rpm) - (a + b*rpm)          (+ starter while cranking)
 *   prop load      Q_l = Q_prop / (i * eta)                         (only when a gear is in)
 *   shaft          (I_e + I_p / i^2) * dw/dt = Q_e - Q_l
 *   governor       rack = clamp((rpm_set - rpm) / droop, 0, 1), rising no faster than
 *                  the turbo/smoke limiter allows
 *
 * @param speed     vessel speed through the water at the propeller (m/s, + ahead)
 * @param immersion 0..1 how much of the propeller disc is under water
 */
export function stepEngineAndPropeller(s: VesselState, def: VesselDef, speed: number, immersion: number, dt: number): number {
  const e = s.engine;
  const cfg = def.engine;
  const demand = leverDemand(def, s.controls.lever);
  const i = cfg.gearRatio;
  const propInertiaAtCrank = def.propeller.inertia / (i * i);

  // ── Clutch ──
  if (e.phase !== 'running') {
    e.gear = 0; // no oil pressure: clutch packs released
    e.shift = 0;
  } else if (demand.gear !== e.gear) {
    if (demand.gear === 0) {
      e.gear = 0;
      e.shift = 0;
    } else {
      // Engaging needs the lever held there for shiftDelay with the engine near idle.
      e.shift += dt;
      if (e.shift >= cfg.shiftDelay && e.rpm < cfg.idleRpm * 1.3) {
        e.gear = demand.gear;
        e.shift = 0;
        // The stationary prop is picked up: shared angular momentum, a small RPM dip.
        e.rpm *= cfg.inertia / (cfg.inertia + propInertiaAtCrank);
      }
    }
  } else {
    e.shift = 0;
  }

  // ── Governor and fuel ──
  let rackTarget = 0;
  if (e.phase === 'running') {
    const throttle = demand.gear === e.gear ? demand.throttle : 0;
    const set = cfg.idleRpm + throttle * (cfg.ratedRpm - cfg.idleRpm);
    rackTarget = clamp((set - e.rpm) / cfg.droopRpm, 0, derateRackCap(def, e.coolantC));
  }
  e.rack = rackTarget > e.rack ? Math.min(rackTarget, e.rack + cfg.rackRiseRate * dt) : rackTarget;

  // ── Shaft dynamics (substepped: the governor loop is stiff) ──
  const inertia = cfg.inertia + (e.gear !== 0 ? propInertiaAtCrank : 0);
  const steps = 4;
  const h = dt / steps;
  let thrust = 0;
  for (let k = 0; k < steps; k++) {
    const rpm = Math.max(0, e.rpm);
    let q = e.rack * fullLoadTorque(def, rpm);
    if (e.phase === 'cranking' && rpm < cfg.starterMaxRpm) q += cfg.starterTorque;
    if (rpm > 0.5) q -= cfg.frictionTorque + cfg.frictionPerRpm * rpm;
    thrust = 0;
    if (e.gear !== 0) {
      const n = (e.gear * rpm) / i / 60; // prop rev/s, signed
      const f = propellerForces(def, n, speed);
      thrust = f.thrust * immersion;
      q -= (f.torque * immersion) / (i * cfg.gearEfficiency);
    }
    const omega = (rpm * TWO_PI) / 60 + (q / inertia) * h;
    e.rpm = Math.max(0, (omega * 60) / TWO_PI);
  }

  // ── Starting and stopping ──
  if (e.phase === 'cranking') {
    e.crank += dt;
    // It fires once the starter has it spinning, if there is fuel to burn.
    if (e.crank >= cfg.crankTime && e.rpm > cfg.starterMaxRpm * 0.6 && e.fuelL > 0) {
      e.phase = 'running';
      e.rack = 0.3; // fuel on: catches and runs up to idle
    }
  }
  if (e.phase === 'off' && e.rpm < 1) e.rpm = 0;

  s.thrust = thrust;
  return thrust;
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
  // Steep rise toward hull speed, levelled off over the hump (see CONFIG resistance).
  const w = r.waveA * fn ** 4 + r.waveB * Math.max(0, fn - r.waveKnee) ** 2;
  const rw = def.mass * g * r.waveCap * Math.tanh(w / r.waveCap);
  return (rf + rw) * (U < 0 ? r.asternFactor : 1);
}

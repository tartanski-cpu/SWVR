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
 *
 * Modular boats (M4a): the engine and the rudder are modules (modules/dieselInboard,
 * modules/rudder). Their simulation is the `...For` / `...Step` functions here, which take
 * the machine's own state, its configuration and what it reads from the rest of the boat
 * (`DieselInputs`, through the module's ports). A few (vessel state, engine) helpers remain
 * for code that isn't a module yet (the quick start, the duties, tests).
 */
import { isPowered } from '../electrics';
import { CONFIG } from '../../config';
import { clamp } from '../../core/math';
import type { VesselDef } from '../vesselDef';
import type { EngineState, VesselState } from '../vesselState';
import { derateRackCap } from './engineThermal';
import { wearRackCapFor } from '../wear';

type Workboat = typeof CONFIG.vessels.workboat;
/** A diesel as configured (the diesel module's, its gear facts 'diesel'). */
export interface EngineSpec {
  engine: Workboat['engine'];
}
/** A diesel and its propeller as configured; `nozzle`: the propeller in a Kort nozzle (CONFIG.nozzle). */
export interface DieselSpec extends EngineSpec {
  propeller: Workboat['propeller'];
  nozzle?: boolean;
}
/** A rudder as configured, and the propeller it stands behind (its wake and slipstream; in a Kort nozzle or not). */
export interface RudderSpec {
  rudder: Workboat['rudder'];
  propeller: Pick<Workboat['propeller'], 'wake' | 'diameter'>;
  nozzle?: boolean;
}

/** What the diesel reads from the rest of the boat each tick (its module's ports). */
export interface DieselInputs {
  /** Throttle / gear lever, -1..1. */
  lever: number;
  /** HEAT and START held (1) or not (0). */
  heat: number;
  start: number;
  /** 12 V on the bus: the fuel solenoid and the starter work. */
  powered: boolean;
  /** How well the starter turns at the bus voltage (0..1; 1 with no electrics). */
  starterFactor: number;
  /** Fuel in the tank (L). */
  fuelL: number;
}

const NU = 1.19e-6; // kinematic viscosity of sea water at 15 °C (m²/s)

/**
 * Gear the lever is asking for, the throttle fraction, and how fast the propeller shaft
 * turns against the gearbox (`shaft`, 1 locked up).
 *
 * Trolling valve (owner: a big engine in gear at idle is too fast to handle): if the engine
 * has one (`trollingLever` past the neutral detent), the first part of the lever's travel
 * keeps the engine at idle and lets the gearbox clutch slip, the propeller turning from
 * `trollingMinShaft` of its locked-up speed at the detent to all of it at `trollingLever`.
 * Past that the clutch is locked and the throttle opens over the rest of the travel.
 * Without one, the throttle opens from the detent, as before.
 */
export function leverDemand(def: EngineSpec, lever: number): { gear: -1 | 0 | 1; throttle: number; shaft: number } {
  const cfg = def.engine;
  const nb = cfg.neutralBand;
  const gear = lever > nb ? 1 : lever < -nb ? -1 : 0;
  if (gear === 0) return { gear, throttle: 0, shaft: 1 };
  const a = Math.abs(lever);
  const troll = cfg.trollingLever ?? 0;
  if (troll > nb) {
    if (a < troll) {
      const min = cfg.trollingMinShaft ?? 1;
      return { gear, throttle: 0, shaft: min + ((1 - min) * (a - nb)) / (troll - nb) };
    }
    return { gear, throttle: clamp((a - troll) / (1 - troll), 0, 1), shaft: 1 };
  }
  return { gear, throttle: clamp((a - nb) / (1 - nb), 0, 1), shaft: 1 };
}

/**
 * Quick start / stop (tests, trials, the quick-start option): stopped, it turns the key on,
 * counts the plugs as preheated and cranks until she catches (only in neutral, with 12 V);
 * running, it turns the key off. The real procedure is key on, wait for the GLOW lamp to go
 * out, START (ignitionStep).
 */
export function toggleEngine(s: VesselState, def: EngineSpec): void {
  const e = s.engine;
  if (e.phase === 'off') {
    if (!isPowered(s)) return; // no 12 V: the starter doesn't turn
    if (def.engine.startOnlyInNeutral && leverDemand(def, s.controls.lever).gear !== 0) return;
    e.key = 1;
    e.glow = preheatNeeded(s, def);
    e.phase = 'cranking';
    e.crank = 0;
    e.autoCrank = true;
  } else {
    e.phase = 'off';
    e.key = 0;
    e.autoCrank = false;
  }
}

/**
 * Diesel ignition, before the engine dynamics each tick:
 *   - no 12 V or the key off: the fuel solenoid closes - she stops (or never starts);
 *   - key on with her stopped: the glow plugs heat on their own (the preheat timer, owner:
 *     the way most small diesels start: key on, the GLOW lamp lights, wait for it to go
 *     out, then START). They heat until preheatNeeded (shorter warm), then are held hot
 *     until she starts or the key goes off; then they cool. HEAT, on a boat that still has
 *     the button, heats them further while held;
 *   - START held, key on, lever in neutral (neutral-safety switch): crank; let go before
 *     she catches and the starter stops.
 */
export function ignitionStep(e: EngineState, spec: DieselSpec, inp: DieselInputs, dt: number): void {
  const cfg = spec.engine;
  const keyOn = e.key > 0 && inp.powered;
  if (!keyOn && e.phase !== 'off') {
    e.phase = 'off';
    e.autoCrank = false;
  }
  const need = preheatNeededFor(e, spec);
  const waiting = keyOn && e.phase === 'off';
  if (waiting && e.glow < need) e.glow = Math.min(need, e.glow + dt); // the preheat timer
  else if (keyOn && inp.heat > 0) e.glow = Math.min(need * 1.5, e.glow + dt);
  // Held hot while she waits, and while she cranks (powered with the starter); they cool after.
  else if (!waiting && e.phase !== 'cranking') e.glow = Math.max(0, e.glow - cfg.glowCoolRate * dt);
  const neutral = !cfg.startOnlyInNeutral || leverDemand(spec, inp.lever).gear === 0;
  if (e.phase === 'off' && keyOn && inp.start > 0 && neutral) {
    e.phase = 'cranking';
    e.crank = 0;
  } else if (e.phase === 'cranking' && inp.start <= 0 && !e.autoCrank) {
    e.phase = 'off';
  }
}

/**
 * Seconds of glow-plug preheat the engine needs now: preheatTime stone cold (coolant at
 * sea temperature), falling linearly to preheatHotTime at coldBelowC and above.
 */
export function preheatNeeded(s: VesselState, def: EngineSpec): number {
  return preheatNeededFor(s.engine, def);
}

export function preheatNeededFor(e: Pick<EngineState, 'coolantC'>, spec: EngineSpec): number {
  const cfg = spec.engine;
  const sea = CONFIG.environment.seaTempC;
  const warm = clamp((e.coolantC - sea) / Math.max(1, cfg.coldBelowC - sea), 0, 1);
  return cfg.preheatTime + (cfg.preheatHotTime - cfg.preheatTime) * warm;
}

/** Seconds of cranking she needs to catch: longer cold and unheated. */
export function crankNeededFor(e: EngineState, spec: EngineSpec): number {
  const cfg = spec.engine;
  const cold = e.coolantC < cfg.coldBelowC ? 1 : 0;
  // (An engine with no glow plugs, a petrol outboard's: preheat 0, always ready.)
  const need = preheatNeededFor(e, spec);
  const heated = need > 0 ? Math.min(1, e.glow / need) : 1;
  return cfg.crankTime + cold * (1 - heated) * cfg.unheatedExtraCrank;
}

const TWO_PI = Math.PI * 2;

/** Full-load torque (N*m) at `rpm`, linear interpolation of the configured curve. */
export function fullLoadTorque(def: EngineSpec, rpm: number): number {
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
export function propellerForces(def: Pick<DieselSpec, 'propeller' | 'nozzle'>, n: number, speed: number): { thrust: number; torque: number } {
  const p = def.propeller;
  const an = Math.abs(n);
  if (an < 0.02) return { thrust: 0, torque: 0 };
  const rho = CONFIG.ocean.density;
  const va = speed * (1 - p.wake);
  // Advance ratio in the prop's own working direction: moving ahead while backing
  // (crash stop) gives negative J, so the prop bites harder and absorbs more torque.
  const J = (n > 0 ? va : -va) / (an * p.diameter);
  // In a Kort nozzle (CONFIG.nozzle): more thrust at a standstill, falling off sooner with
  // advance (the duct's drag), a little more torque, and poorer astern.
  const nz = def.nozzle ? CONFIG.nozzle : null;
  const kt0 = p.kt0 * (nz?.thrustGain ?? 1);
  const j0 = p.j0 * (nz?.jFactor ?? 1);
  const kq0 = p.kq0 * (nz?.torqueGain ?? 1);
  const kt = clamp(kt0 * (1 - J / j0), -0.2 * kt0, 1.6 * kt0);
  const kq = clamp(kq0 * (1 - J / p.jq0), -0.1 * kq0, 1.6 * kq0);
  const astern = n < 0;
  const thrust = kt * rho * an * an * p.diameter ** 4 * (astern ? p.asternEfficiency * (nz?.asternGain ?? 1) : 1);
  const torque = kq * rho * an * an * p.diameter ** 5 * (astern ? p.asternTorque : 1);
  return { thrust: astern ? -thrust : thrust, torque };
}

/**
 * The rudder angle (rad) after dt, from where it is and the helm (-1..1). Mechanical
 * (cable / chain) steering: the rudder is where the wheel puts it. Hydraulic: it follows
 * the helm at a fixed rate.
 */
export function steeringStep(angle: number, helm: number, rudder: Workboat['rudder'], dt: number): number {
  const maxA = (rudder.maxAngleDeg * Math.PI) / 180;
  const want = clamp(helm, -1, 1) * maxA;
  const rate = rudder.rateDegPerS;
  if (rate === null) return want;
  const step = ((rate * Math.PI) / 180) * dt;
  return angle + clamp(want - angle, -step, step);
}

/**
 * Advance engine, clutch and shaft by dt and return the propeller thrust (N).
 *
 *   engine torque  Q_e = rack * Q_max(rpm) - (a + b*rpm)          (+ starter while cranking)
 *   prop load      Q_l = Q_prop / (i * eta)                         (only when a gear is in)
 *   propeller      n = s * rpm / i, s < 1 while a trolling valve lets the clutch slip: the
 *                  clutch passes the propeller's torque and turns the difference in speed
 *                  into heat
 *   shaft          (I_e + I_p / i^2) * dw/dt = Q_e - Q_l
 *   governor       rack = clamp((rpm_set - rpm) / droop, 0, 1), rising no faster than
 *                  the turbo/smoke limiter allows
 *
 * @param speed     vessel speed through the water at the propeller (m/s, + ahead)
 * @param immersion 0..1 how much of the propeller disc is under water
 */
export function engineStep(e: EngineState, def: DieselSpec, inp: DieselInputs, speed: number, immersion: number, dt: number): number {
  const cfg = def.engine;
  const demand = leverDemand(def, inp.lever);
  const i = cfg.gearRatio;
  const propInertiaAtCrank = def.propeller.inertia / (i * i);
  ignitionStep(e, def, inp, dt);
  const starter = cfg.starterTorque * inp.starterFactor;

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
    rackTarget = clamp((set - e.rpm) / cfg.droopRpm, 0, derateRackCap(def, e.coolantC) * wearRackCapFor(e.wear));
  }
  e.rack = rackTarget > e.rack ? Math.min(rackTarget, e.rack + cfg.rackRiseRate * dt) : rackTarget;

  // The clutch's slip (trolling valve) for the gear that's in: 1 locked up.
  const slip = e.gear !== 0 && demand.gear === e.gear ? demand.shaft : 1;

  // ── Shaft dynamics (substepped: the governor loop is stiff) ──
  const inertia = cfg.inertia + (e.gear !== 0 ? propInertiaAtCrank : 0);
  const steps = 4;
  const h = dt / steps;
  let thrust = 0;
  for (let k = 0; k < steps; k++) {
    const rpm = Math.max(0, e.rpm);
    let q = e.rack * fullLoadTorque(def, rpm);
    if (e.phase === 'cranking' && rpm < cfg.starterMaxRpm) q += starter;
    if (rpm > 0.5) q -= cfg.frictionTorque + cfg.frictionPerRpm * rpm;
    thrust = 0;
    if (e.gear !== 0) {
      const n = (e.gear * rpm * slip) / i / 60; // prop rev/s, signed
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
    if (e.crank >= crankNeededFor(e, def) && e.rpm > cfg.starterMaxRpm * 0.6 && inp.fuelL > 0) {
      e.phase = 'running';
      e.autoCrank = false;
      e.rack = 0.3; // fuel on: catches and runs up to idle
    }
  }
  if (e.phase === 'off' && e.rpm < 1) e.rpm = 0;
  return thrust;
}

/**
 * Rudder force in vessel axes (x = starboard, z = aft) from the water flow seen by the
 * rudder, given as the rudder's velocity relative to the water (vessel axes).
 * Uses a normal-force model: N = ½ ρ A |U|² C_N(α), C_N linear to the stall angle then flat,
 * acting along the rudder's normal - so it also produces drag when the rudder is over.
 * The rudder at `angle` (rad).
 */
export function rudderForceAt(angle: number, def: RudderSpec, relVx: number, relVz: number, thrust: number, out: { x: number; z: number }): void {
  const r = def.rudder;
  // Flow seen by the rudder from the hull's motion (water moving aft = +z going ahead).
  const fx = -relVx * (1 - r.flowStraightening);
  let fz = -relVz;
  if (fz > 0) fz *= 1 - def.propeller.wake;
  // Normal force without slipstream; coasting (little or no thrust), the skeg helps it
  // (coastSteer, fading out as thrust builds)...
  const coast = 1 + (r.coastSteer - 1) * Math.max(0, 1 - Math.abs(thrust) / r.coastFadeThrust);
  let N = rudderNormal(angle, def, fx, fz) * coast;
  if (thrust > 0) {
    // ...plus the slipstream's contribution. Momentum theory gives the far-wake speed
    // increase; part of it is developed at the rudder. The extra force can't exceed what
    // deflecting the slipstream's momentum (~T) can give, so it is capped at washMaxFraction*T.
    // A rudder in a Kort nozzle's jet (CONFIG.nozzle.steerGain): the jet is concentrated on
    // it, so more of the slipstream's momentum is turned.
    const d = def.propeller.diameter;
    const steer = def.nozzle ? CONFIG.nozzle.steerGain : 1;
    const extra = (r.washFactor * steer * 8 * thrust) / (CONFIG.ocean.density * Math.PI * d * d);
    const withWash = rudderNormal(angle, def, fx, Math.sqrt(Math.max(fz, 0) ** 2 + extra)) * coast;
    const cap = r.washMaxFraction * steer * thrust;
    N += clamp(withWash - N, -cap, cap);
  } else if (thrust < 0 && def.nozzle) {
    // Astern in a Kort nozzle (owner: "when you go backwards, it hardly steers at all"): the
    // propeller draws its water in from aft, through the duct, past the rudder just behind
    // it, so the rudder stands in that concentrated inflow (flowing forward: fz < 0). A share
    // of the slipstream effect ahead (CONFIG.nozzle.asternSteer). An open propeller's inflow
    // is drawn from all round it and does little for the rudder: none added.
    const d = def.propeller.diameter;
    const share = CONFIG.nozzle.steerGain * CONFIG.nozzle.asternSteer;
    const extra = (r.washFactor * share * 8 * -thrust) / (CONFIG.ocean.density * Math.PI * d * d);
    const withSuction = rudderNormal(angle, def, fx, -Math.sqrt(Math.max(-fz, 0) ** 2 + extra)) * coast;
    const cap = r.washMaxFraction * share * -thrust;
    N += clamp(withSuction - N, -cap, cap);
  }
  out.x = N * Math.cos(angle);
  out.z = -N * Math.sin(angle);
}

/** Signed normal force (N) on the rudder plate for inflow (fx, fz) in vessel axes. */
function rudderNormal(angle: number, def: RudderSpec, fx: number, fz: number): number {
  const r = def.rudder;
  const u2 = fx * fx + fz * fz;
  if (u2 < 1e-6) return 0;
  // Plate normal (perpendicular to the chord; chord runs aft at angle `rudder`).
  const nx = Math.cos(angle);
  const nz = -Math.sin(angle);
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

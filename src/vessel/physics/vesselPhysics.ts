/**
 * Rigid-body dynamics of one hull in waves. Called once per fixed simulation tick.
 *
 * Forces (all evaluated at the start of the tick, then integrated semi-implicitly):
 *
 *  1. Gravity  m·g at the centre of gravity.
 *
 *  2. Hydrostatics, station by station (strip method). For each transverse station we
 *     sample the wave surface at its port chine, centreline and starboard chine, treat the
 *     water surface as linear across the section, clip the section polygon at that
 *     waterline and get the immersed area A and its centroid. The station's slice of
 *     displaced volume is A·w (w = station spacing), giving a vertical force ρ·g·A·w at the
 *     centroid. Summed over stations this reproduces displacement, LCB, and the full
 *     large-angle righting-arm (GZ) curve of the actual hull shape, including deck-edge
 *     immersion, in calm water and in waves (Froude-Krylov at hydrostatic level).
 *
 *  3. Hydrodynamic damping and drag, using velocity RELATIVE to the water particles (the
 *     orbital velocity from the wave model), so the hull is not damped for moving with
 *     the water, only for moving through it:
 *       - vertical damping along the centreline of each station (heave and pitch), linear
 *         plus a quadratic water-entry term standing in for slamming losses,
 *       - lateral hull lift (∝ U·v) and crossflow drag per station, proportional to local
 *         draft (sway and yaw damping; the centre of lateral resistance falls out of the
 *         hull shape),
 *       - a small linear surge damping per station, only to settle residual creep (the
 *         real resistance is the calm-water curve in propulsion.ts),
 *       - angular damping, chiefly roll (radiation + viscous/chine roll damping).
 *
 *  4. Propulsion (propulsion.ts): engine/gearbox/steering gear state, propeller thrust
 *     T(1-t) on the shaft line, rudder normal force (hull inflow + slipstream), and the
 *     calm-water resistance curve R(V) against speed through the water. Fuel burn and
 *     engine temperatures (engineThermal.ts).
 *
 *  Payload (cargo on deck) is added as point masses: total mass, the combined CG and the
 *  inertia about it (parallel-axis theorem, principal axes kept) are recomputed every tick,
 *  so a load sinks her by its weight and trims/heels her by its position - the buoyancy
 *  side needs nothing, since the strips simply find the new equilibrium waterline.
 *
 *  5. With the archipelago present: penalty contacts with seabed, shore, quays and piers at
 *     points on the keel/chines/deck edges (contacts.ts), and the anchor chain pulling at the
 *     bow roller (anchor.ts).
 *
 * Added mass is modelled as constant fractions of the rigid-body mass/inertia per axis,
 * scaled by immersion, so it vanishes when the hull is airborne.
 *
 * Integration: semi-implicit (symplectic) Euler on the CG: v += a·dt, then x += v·dt;
 * angular velocity in body axes with the gyroscopic term ω × (I·ω); orientation via
 * q += ½·(0, ω)·q·dt, renormalised.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { sampleSurface, type PreparedWave, type SurfaceSample } from '../../ocean/waves';
import type { VesselDef } from '../vesselDef';
import type { VesselState } from '../vesselState';
import { calmWaterResistance } from './propulsion';
import { submergedSection, type SubmergedSection } from './sectionClip';
import { physicsStations } from '../hullForm';
import { contactAt, guardContactAt, hullContactPoints, type ContactResult, type GuardMaterial } from './contacts';
import { blockNear } from '../../world/geography';
import { stepMooring } from './mooring';
import type { ExternalForce } from './vesselContact';
import type { PhysicsPort } from '../../modular/module';
import { gearOf, vesselRuntime } from '../../boats/sims';

/** Optional per-tick diagnostics for the debug view (vessel-local coordinates). */
export interface HydroDebug {
  /** Per station: immersed-area centroid (x, y, z) and buoyant force (N). */
  stations: { x: number; y: number; z: number; force: number }[];
  /** World up direction expressed in vessel axes (to draw vertical force arrows). */
  upLocal: [number, number, number];
  submergedVolume: number;
}

// Scratch objects (the sim is single-threaded; avoids per-tick allocation).
const q = new THREE.Quaternion();
const qInv = new THREE.Quaternion();
const pos = new THREE.Vector3();
const cgW = new THREE.Vector3();
const v = new THREE.Vector3();
const w = new THREE.Vector3();
const force = new THREE.Vector3();
const torque = new THREE.Vector3();
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const pt = new THREE.Vector3();
const portW = new THREE.Vector3();
const stbdW = new THREE.Vector3();
const centreW = new THREE.Vector3();
const sub: SubmergedSection = { area: 0, cx: 0, cy: 0, maxDepth: 0 };
const depths: number[] = [];
const dq = new THREE.Quaternion();
const ptV = new THREE.Vector3();
const cf = new THREE.Vector3();
const contact: ContactResult = { fx: 0, fy: 0, fz: 0, normal: 0, slide: 0, approach: 0 };
const lineBow = new THREE.Vector3();
const lineBowV = new THREE.Vector3();
const lineStern = new THREE.Vector3();
const lineSternV = new THREE.Vector3();
const fBow = { x: 0, y: 0, z: 0 };
const fStern = { x: 0, y: 0, z: 0 };
/** Centre of gravity (vessel axes) and principal inertia (x pitch, y yaw, z roll) this tick. */
const cgL = new THREE.Vector3();
const inertia = new THREE.Vector3();

/** Add a point mass m at offset d from the CG to the inertia (diagonal terms). */
/** How far her ends reach from her origin (m, in plan): for the cheap is-a-quay-near check. */
const reaches = new WeakMap<VesselDef, number>();
function reachOf(def: VesselDef): number {
  let r = reaches.get(def);
  if (r === undefined) {
    r = Math.max(...def.hull.stations.map((st) => Math.hypot(st.z, st.halfBeamDeck)));
    reaches.set(def, r);
  }
  return r;
}

function addPointInertia(m: number, d: THREE.Vector3): void {
  inertia.x += m * (d.y * d.y + d.z * d.z);
  inertia.y += m * (d.x * d.x + d.z * d.z);
  inertia.z += m * (d.x * d.x + d.y * d.y);
}

function toWorld(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(x, y, z).applyQuaternion(q).add(pos);
}

/** Add force F (world) acting at world point p: accumulates force and torque about the CG. */
function addForceAt(f: THREE.Vector3, p: THREE.Vector3): void {
  force.add(f);
  tmp2.subVectors(p, cgW).cross(f);
  torque.add(tmp2);
}

/** Velocity of the hull material point at world position p. */
function pointVelocity(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.subVectors(p, cgW).crossVectors(w, out).add(v);
}

/**
 * The physics port (modular boats M4a): what a machine module (the diesel and its propeller,
 * the rudder) gets during the rigid-body step, where the inboard drive was worked out
 * before. It does the same sums the old code did, in the same order, so the handling is
 * unchanged (the golden runs and the sea trials match to the last recorded digit).
 */
let portWaves: readonly PreparedWave[] = [];
const portP = new THREE.Vector3();
const portS = new THREE.Vector3();
const portV = new THREE.Vector3();
const portF = new THREE.Vector3();
const port: PhysicsPort = {
  flowAt(local, level = false) {
    const p = toWorld(local[0], local[1], local[2], portP);
    const sw = sampleSurface(portWaves, p.x, p.z);
    pointVelocity(p, portV);
    portV.x -= sw.velocity[0];
    portV.y -= sw.velocity[1];
    portV.z -= sw.velocity[2];
    if (level) portV.y = 0;
    portV.applyQuaternion(qInv);
    return { x: portV.x, y: portV.y, z: portV.z };
  },
  depthAt(local, surfaceAt = local) {
    const at = toWorld(surfaceAt[0], surfaceAt[1], surfaceAt[2], portS);
    const height = sampleSurface(portWaves, at.x, at.z).height;
    return height - toWorld(local[0], local[1], local[2], portP).y;
  },
  addForce(local, fx, fy, fz) {
    addForceAt(portF.set(fx, fy, fz).applyQuaternion(q), toWorld(local[0], local[1], local[2], portP));
  },
  worldPoint(local) {
    return toWorld(local[0], local[1], local[2], portP).clone();
  },
  worldVelocity(local) {
    return pointVelocity(toWorld(local[0], local[1], local[2], portP), portV).clone();
  },
  addWorldForce(local, fx, fy, fz) {
    addForceAt(portF.set(fx, fy, fz), toWorld(local[0], local[1], local[2], portP));
  },
};

export function stepVessel(
  state: VesselState,
  def: VesselDef,
  waves: readonly PreparedWave[],
  dt: number,
  debug?: HydroDebug,
  /** Land, seabed and harbour structures to collide with (false: open sea, e.g. trials). */
  geography = true,
  /** Cargo aboard: point masses at positions in vessel axes. */
  payload: readonly { mass: number; pos: THREE.Vector3 }[] = [],
  /** Other forces this tick (world force at a world point): another boat's hull against this one. */
  external: readonly ExternalForce[] = [],
): void {
  const rho = CONFIG.ocean.density;
  const g = CONFIG.ocean.gravity;
  const d = def.damping;

  // ── Mass properties with payload ──
  let mass = def.mass;
  cgL.fromArray(def.cg);
  inertia.fromArray(def.inertia);
  if (payload.length > 0) {
    cgL.multiplyScalar(def.mass);
    for (const p of payload) {
      mass += p.mass;
      cgL.addScaledVector(p.pos, p.mass);
    }
    cgL.divideScalar(mass);
    // Parallel axis: the hull's own inertia moved to the new CG, plus each point mass.
    addPointInertia(def.mass, tmp.fromArray(def.cg).sub(cgL));
    for (const p of payload) addPointInertia(p.mass, tmp.copy(p.pos).sub(cgL));
  }

  q.fromArray(state.orientation);
  qInv.copy(q).invert();
  pos.fromArray(state.position);
  cgW.copy(cgL).applyQuaternion(q).add(pos);
  v.fromArray(state.linearVelocity);
  w.fromArray(state.angularVelocity);

  force.set(0, -mass * g, 0);
  torque.set(0, 0, 0);

  if (debug) {
    debug.stations.length = 0;
    tmp.set(0, 1, 0).applyQuaternion(qInv);
    debug.upLocal = [tmp.x, tmp.y, tmp.z];
  }

  let submergedVolume = 0;
  for (const st of physicsStations(def.hull)) {
    const b = Math.max(st.halfBeamChine, 0.05);
    // Water surface at port chine, centreline and starboard chine (at DWL height).
    toWorld(-b, 0, st.z, portW);
    toWorld(0, 0, st.z, centreW);
    toWorld(b, 0, st.z, stbdW);
    const sP: SurfaceSample = sampleSurface(waves, portW.x, portW.z);
    const sC: SurfaceSample = sampleSurface(waves, centreW.x, centreW.z);
    const sS: SurfaceSample = sampleSurface(waves, stbdW.x, stbdW.z);

    // Depth of each section vertex below the (piecewise-linear) water surface.
    depths.length = st.polygon.length;
    for (let i = 0; i < st.polygon.length; i++) {
      const [x, y] = st.polygon[i];
      const h = x < 0 ? sC.height + (sP.height - sC.height) * (-x / b) : sC.height + (sS.height - sC.height) * (x / b);
      depths[i] = h - toWorld(x, y, st.z, pt).y;
    }
    submergedSection(st.polygon, depths, sub);
    if (sub.area <= 0) {
      if (debug) debug.stations.push({ x: 0, y: 0, z: st.z, force: 0 });
      continue;
    }

    // ── Hydrostatic (buoyant) force at the immersed centroid ──
    const vol = sub.area * st.weight;
    submergedVolume += vol;
    const fb = rho * g * vol;
    toWorld(sub.cx, sub.cy, st.z, pt);
    addForceAt(tmp.set(0, fb, 0), pt);
    if (debug) debug.stations.push({ x: sub.cx, y: sub.cy, z: st.z, force: fb });

    // ── Vertical damping on the centreline, relative to the water (heave and pitch) ──
    // Applied on the centreline so it does not also damp roll; roll damping has its own
    // coefficient below. Scaled by how wet the section is (fades in over 0.3 m of draft).
    // A quadratic term (flat-plate drag on the station's waterplane strip) stands in for
    // slamming / water-entry losses: negligible at seakeeping velocities (~0.3 m/s), but
    // it dominates on violent entry and stops the hull rebounding out of the water.
    const wet = Math.min(1, sub.maxDepth / 0.3);
    const strip = 2 * b * st.weight * wet;
    const relV = pointVelocity(centreW, tmp).y - sC.velocity[1];
    const fv = -(d.vertical * strip * relV + 0.5 * rho * d.verticalCd * strip * Math.abs(relV) * relV);
    addForceAt(tmp.set(0, fv, 0), centreW);

    // ── Horizontal drag at the immersed centroid, in vessel axes ──
    pointVelocity(pt, tmp);
    tmp.x -= sC.velocity[0];
    tmp.z -= sC.velocity[2];
    tmp.y = 0;
    tmp.applyQuaternion(qInv); // relative velocity in vessel axes (x = sway, z = surge)
    // Lateral force on the local "keel area" (draft x station spacing):
    //   - hull lift: the hull is a very low aspect-ratio foil; at forward speed U a drift
    //     velocity v gives a force linear in U*v. This is what gives a hull its linear
    //     sway and yaw damping (Y_v, N_r) and a sensible turning circle.
    //   - crossflow drag, quadratic in v (dominant at low speed and large drift),
    //   - a small linear term for settling at rest.
    const aLat = sub.maxDepth * st.weight;
    const uFwd = Math.abs(tmp.z);
    const fx = -(
      d.lateralLinear * aLat * tmp.x +
      0.5 * rho * d.lateralLift * aLat * uFwd * tmp.x +
      0.5 * rho * d.lateralCd * aLat * Math.abs(tmp.x) * tmp.x
    );
    const fz = -d.surgeLinear * sub.area * tmp.z;
    addForceAt(tmp.set(fx, 0, fz).applyQuaternion(q), pt);
  }

  const immersion = Math.min(1, submergedVolume / def.designVolume);
  if (debug) debug.submergedVolume = submergedVolume;

  // ── Machinery: her modules that push on the hull (engine and propeller, rudder; an outboard) ──
  const machinery = vesselRuntime(state);
  if (machinery) {
    portWaves = waves;
    machinery.physics(port, dt);
  }

  // Calm-water resistance at mid-draft at the LCG, against speed through the water.
  const resW = toWorld(0, def.resistance.y, cgL.z, centreW);
  const sO = sampleSurface(waves, resW.x, resW.z);
  pointVelocity(resW, tmp);
  tmp.x -= sO.velocity[0];
  tmp.z -= sO.velocity[2];
  tmp.y = 0;
  const U = -tmp.applyQuaternion(qInv).z; // forward speed through water
  const vSway = tmp.x; // sideways through the water, + to starboard
  const R = calmWaterResistance(def, U) * immersion;
  addForceAt(tmp.set(0, 0, Math.sign(U) * R).applyQuaternion(q), resW);

  // ── A planing hull banks into a turn (def.planing; the landing craft) ──
  // Turning, she slides outward through the water. The half of her vee bottom on that side
  // meets the water at a steeper angle and lifts more; the inner half lifts less. That pair
  // of vertical forces across her chines rolls her into the turn, against the outward heel of
  // her CG swinging round above the side force on her hull (all a displacement hull has).
  // Modelled as  F = bank * 1/2 rho Awp U v  up on the side she's sliding toward and down on
  // the other, at the chines over her LCG; faded in from Fn `fnStart` (off the hump) to
  // `fnFull` (planing), and with how much of her is in the water.
  const pl = def.planing;
  if (pl && immersion > 0) {
    const fn = Math.abs(U) / Math.sqrt(g * def.resistance.lwl);
    const t = Math.min(1, Math.max(0, (fn - pl.fnStart) / (pl.fnFull - pl.fnStart)));
    const fade = t * t * (3 - 2 * t);
    if (fade > 0) {
      let b = 0;
      let awp = 0;
      for (const st of def.hull.stations) {
        b = Math.max(b, st.halfBeamChine);
        awp += 2 * st.halfBeamChine * st.weight;
      }
      const f = fade * immersion * pl.bank * 0.5 * rho * awp * Math.abs(U) * vSway;
      // Up at the starboard chine when sliding to starboard (vSway > 0), down at port.
      addForceAt(tmp.set(0, f, 0).applyQuaternion(q), toWorld(b, def.resistance.y, cgL.z, portP));
      addForceAt(tmp.set(0, -f, 0).applyQuaternion(q), toWorld(-b, def.resistance.y, cgL.z, portP));
    }
  }

  for (const e of external) addForceAt(cf.copy(e.force), e.point);

  // ── Contacts and anchor (archipelago only) ──
  const c = state.contact;
  c.force = 0;
  c.slide = 0;
  c.impact = 0;
  if (geography) {
    let touching = 0;
    // The penalty springs are tuned for the workboat; a lighter boat gets them scaled by
    // her mass, so k/m and c/m (what sets the step's stability) stay the same. Unscaled,
    // the 330 kg skiff would bounce off a beach and blow up.
    const scale = Math.min(1, def.mass / CONFIG.contacts.referenceMass);
    for (const [lx, ly, lz] of hullContactPoints(def.hull)) {
      toWorld(lx, ly, lz, pt);
      pointVelocity(pt, ptV);
      if (!contactAt(pt.x, pt.y, pt.z, ptV.x, ptV.y, ptV.z, contact)) continue;
      addForceAt(cf.set(contact.fx * scale, contact.fy * scale, contact.fz * scale), pt);
      touching++;
      c.force += contact.normal * scale;
      c.slide += contact.slide;
      c.impact = Math.max(c.impact, contact.approach);
    }
    // Guards on her sides (vessel/physics/guards.ts): the crew's fenders while they're out, a
    // rubbing strake or tyres, a tug's push fender on her bow. Each point stands proud of her
    // plating and meets a quay or pier first, with its own spring; it takes up `absorb` of the
    // knock before any of it counts as a hit on her hull. Probed only with a quay or pier
    // within reach of her.
    const fenders = gearOf(state, 'fenders');
    const sideGuard = gearOf(state, 'sideGuard');
    const pushFender = gearOf(state, 'pushFender');
    const fendersOut = !!fenders && state.controls.fenders > 0;
    if ((fendersOut || sideGuard || pushFender) && blockNear(pos.x, pos.z, reachOf(def) + 1)) {
      const guard = (probes: readonly (readonly [number, number, number])[], mat: GuardMaterial) => {
        for (const [lx, ly, lz] of probes) {
          toWorld(lx, ly, lz, pt);
          pointVelocity(pt, ptV);
          if (!guardContactAt(pt.x, pt.y, pt.z, ptV.x, ptV.y, ptV.z, mat, contact)) continue;
          addForceAt(cf.set(contact.fx * scale, contact.fy * scale, contact.fz * scale), pt);
          touching++;
          c.force += contact.normal * scale;
          c.slide += contact.slide;
          c.impact = Math.max(c.impact, contact.approach - mat.absorb);
        }
      };
      if (fendersOut) guard(fenders.probes, CONFIG.contacts.guards.fenders);
      if (sideGuard) guard(sideGuard.probes, CONFIG.contacts.guards[sideGuard.kind]);
      if (pushFender) guard(pushFender.probes, CONFIG.contacts.guards.pushFender);
    }
    if (touching > 0) c.slide /= touching;
    // Her anchor (a module, M5a): the chain's pull at the hawse.
    machinery?.mooring(port, dt);
    // Mooring lines (docked), at her forward and aft cleats' stations (modules/cleat).
    const bowCleat = gearOf(state, 'bowCleat');
    const sternCleat = gearOf(state, 'sternCleat');
    if (bowCleat && sternCleat) {
      toWorld(0, bowCleat.lineY, bowCleat.z, lineBow);
      pointVelocity(lineBow, lineBowV);
      toWorld(0, sternCleat.lineY, sternCleat.z, lineStern);
      pointVelocity(lineStern, lineSternV);
      stepMooring(state, { bow: bowCleat.z, stern: sternCleat.z }, lineBow, lineBowV, lineStern, lineSternV, dt, fBow, fStern);
      if (state.mooring.phase !== 'free') {
        addForceAt(cf.set(fBow.x, 0, fBow.z), lineBow);
        addForceAt(cf.set(fStern.x, 0, fStern.z), lineStern);
      }
    }
  }

  // ── Linear: a = F / m_eff, with added mass per vessel axis ──
  tmp.copy(force).applyQuaternion(qInv);
  tmp.set(
    tmp.x / (mass * (1 + def.addedLinear[0] * immersion)),
    tmp.y / (mass * (1 + def.addedLinear[1] * immersion)),
    tmp.z / (mass * (1 + def.addedLinear[2] * immersion)),
  );
  v.addScaledVector(tmp.applyQuaternion(q), dt);

  // ── Angular, in vessel axes (x = pitch, y = yaw, z = roll) ──
  const wb = tmp.copy(w).applyQuaternion(qInv);
  const tb = tmp2.copy(torque).applyQuaternion(qInv);
  tb.x -= d.pitch * immersion * wb.x;
  tb.y -= d.yaw * immersion * wb.y;
  tb.z -= d.roll * immersion * wb.z;
  const Ix = inertia.x * (1 + def.addedAngular[0] * immersion);
  const Iy = inertia.y * (1 + def.addedAngular[1] * immersion);
  const Iz = inertia.z * (1 + def.addedAngular[2] * immersion);
  // Gyroscopic term ω × (I·ω)
  const gx = wb.y * (Iz * wb.z) - wb.z * (Iy * wb.y);
  const gy = wb.z * (Ix * wb.x) - wb.x * (Iz * wb.z);
  const gz = wb.x * (Iy * wb.y) - wb.y * (Ix * wb.x);
  wb.x += ((tb.x - gx) / Ix) * dt;
  wb.y += ((tb.y - gy) / Iy) * dt;
  wb.z += ((tb.z - gz) / Iz) * dt;
  w.copy(wb).applyQuaternion(q);

  // ── Integrate CG position and orientation with the new velocities ──
  cgW.addScaledVector(v, dt);
  dq.set(w.x, w.y, w.z, 0).multiply(q);
  q.set(q.x + 0.5 * dt * dq.x, q.y + 0.5 * dt * dq.y, q.z + 0.5 * dt * dq.z, q.w + 0.5 * dt * dq.w).normalize();
  pos.copy(cgL).applyQuaternion(q).negate().add(cgW);

  state.position = [pos.x, pos.y, pos.z];
  state.orientation = [q.x, q.y, q.z, q.w];
  state.linearVelocity = [v.x, v.y, v.z];
  state.angularVelocity = [w.x, w.y, w.z];
}

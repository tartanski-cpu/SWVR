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
import { calmWaterResistance, rudderForce, stepEngineAndPropeller, stepSteering } from './propulsion';
import { submergedSection, type SubmergedSection } from './sectionClip';
import { stepFuelAndHeat } from './engineThermal';
import { contactAt, hullContactPoints, type ContactResult } from './contacts';
import { stepAnchor } from './anchor';

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
const rud = { x: 0, z: 0 };
const ptV = new THREE.Vector3();
const cf = new THREE.Vector3();
const contact: ContactResult = { fx: 0, fy: 0, fz: 0, normal: 0, slide: 0, approach: 0 };
const chain = { x: 0, y: 0, z: 0 };
/** Centre of gravity (vessel axes) and principal inertia (x pitch, y yaw, z roll) this tick. */
const cgL = new THREE.Vector3();
const inertia = new THREE.Vector3();

/** Add a point mass m at offset d from the CG to the inertia (diagonal terms). */
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
  for (const st of def.hull.stations) {
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

  // ── Machinery, propeller, rudder, calm-water resistance ──
  stepSteering(state, def, dt);
  const rudderW = toWorld(...def.rudder.position, portW);
  const propW = toWorld(...def.propeller.position, stbdW);
  const sR = sampleSurface(waves, rudderW.x, rudderW.z);
  // Propeller immersion: full thrust when the disc is under water, fading as it emerges.
  const D = def.propeller.diameter;
  const propWet = Math.min(1, Math.max(0, (sR.height - propW.y + D / 2) / D));
  // Rudder's velocity relative to the water, in vessel axes.
  pointVelocity(rudderW, tmp);
  tmp.x -= sR.velocity[0];
  tmp.y -= sR.velocity[1];
  tmp.z -= sR.velocity[2];
  tmp.applyQuaternion(qInv);
  const relRx = tmp.x;
  const relRz = tmp.z;
  const thrust = stepEngineAndPropeller(state, def, -relRz, propWet, dt);
  stepFuelAndHeat(state, def, dt);
  // Net propulsive force T(1 - t) along the shaft (forward is -z).
  addForceAt(tmp.set(0, 0, -thrust * (1 - def.propeller.thrustDeduction)).applyQuaternion(q), propW);
  // Prop walk: sideways force at the prop from the blades' asymmetric bite (strongest at low
  // speed and going astern). Right-handed: stern to starboard ahead, to port astern.
  const pp = def.propeller;
  const walkFrac = thrust >= 0 ? pp.propWalkAhead : -pp.propWalkAstern;
  const walk = Math.abs(thrust) * walkFrac * (pp.rightHanded ? 1 : -1) / (1 + (relRz / pp.propWalkFadeSpeed) ** 2);
  addForceAt(tmp.set(walk, 0, 0).applyQuaternion(q), propW);
  rudderForce(state, def, relRx, relRz, thrust, rud);
  addForceAt(tmp.set(rud.x * propWet, 0, rud.z * propWet).applyQuaternion(q), rudderW);

  // Calm-water resistance at mid-draft at the LCG, against speed through the water.
  const resW = toWorld(0, def.resistance.y, cgL.z, centreW);
  const sO = sampleSurface(waves, resW.x, resW.z);
  pointVelocity(resW, tmp);
  tmp.x -= sO.velocity[0];
  tmp.z -= sO.velocity[2];
  tmp.y = 0;
  const U = -tmp.applyQuaternion(qInv).z; // forward speed through water
  const R = calmWaterResistance(def, U) * immersion;
  addForceAt(tmp.set(0, 0, Math.sign(U) * R).applyQuaternion(q), resW);

  // ── Contacts and anchor (archipelago only) ──
  const c = state.contact;
  c.force = 0;
  c.slide = 0;
  c.impact = 0;
  if (geography) {
    let touching = 0;
    for (const [lx, ly, lz] of hullContactPoints(def.hull)) {
      toWorld(lx, ly, lz, pt);
      pointVelocity(pt, ptV);
      if (!contactAt(pt.x, pt.y, pt.z, ptV.x, ptV.y, ptV.z, contact)) continue;
      addForceAt(cf.set(contact.fx, contact.fy, contact.fz), pt);
      touching++;
      c.force += contact.normal;
      c.slide += contact.slide;
      c.impact = Math.max(c.impact, contact.approach);
    }
    if (touching > 0) c.slide /= touching;
    toWorld(...def.anchor.hawse, pt);
    pointVelocity(pt, ptV);
    stepAnchor(state, def, pt, ptV, dt, chain);
    if (chain.x !== 0 || chain.y !== 0 || chain.z !== 0) addForceAt(cf.set(chain.x, chain.y, chain.z), pt);
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

/**
 * Leeway: the wind's push on a boat's topsides and wheelhouse, ONE drag force at the centre
 * of effort (so it also heels her a little and turns her head). From the apparent wind
 * (true wind minus the boat's own velocity) in the boat's axes, each axis separately:
 *
 *   F_x = 1/2 rho_air Cd A_side  |u_x| u_x      (beam-on: the big area)
 *   F_z = 1/2 rho_air Cd A_front |u_z| u_z      (head-on)
 *
 * The hull's lateral resistance in the water (vesselPhysics) does the rest: she slides
 * sideways slowly - more in the light skiff - and you steer to hold a course.
 *
 * Where it pushes decides how she lies. With the wind on the beam the centre of effort is
 * over the hull's centre of lateral resistance (CLR: the draft-weighted middle of the
 * underwater profile), so there is no turning moment. As the wind comes round toward the
 * bow or stern the centre of effort moves toward that (upwind) end, by up to
 * `windCeShift` x length - like a flat plate's centre of pressure - so the upwind end is
 * pushed off downwind: a stopped boat swings beam-on and lies there, as real ones do.
 * (Without this she weathercocks end-on and, with the hull's lift, runs off downwind
 * like an arrow, far too fast.)
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { EnvironmentState } from '../../environment/environmentState';
import { windVector } from '../../environment/weather';
import type { VesselDef } from '../vesselDef';
import type { VesselState } from '../vesselState';
import type { ExternalForce } from './vesselContact';

const q = new THREE.Quaternion();
const qInv = new THREE.Quaternion();
const wind = { x: 0, z: 0 };
const u = new THREE.Vector3();

/** Centre of lateral resistance (vessel z) per hull: keel depth x station length weighted. */
const clrCache = new WeakMap<VesselDef, number>();
function clrZ(def: VesselDef): number {
  let z = clrCache.get(def);
  if (z === undefined) {
    let sum = 0;
    let moment = 0;
    for (const st of def.hull.stations) {
      const depth = Math.max(0, -Math.min(...st.polygon.map((p) => p[1])));
      sum += depth * st.weight;
      moment += depth * st.weight * st.z;
    }
    z = sum > 0 ? moment / sum : 0;
    clrCache.set(def, z);
  }
  return z;
}

/** The wind's force on a vessel this tick, or null in a calm / without weather. */
export function windForce(s: VesselState, def: VesselDef, env: EnvironmentState): ExternalForce | null {
  windVector(env, wind);
  if (!env.weather || env.weather.now.wind < 0.2) return null;
  const c = CONFIG.weather;
  // Apparent wind in vessel axes.
  q.fromArray(s.orientation);
  qInv.copy(q).invert();
  u.set(wind.x - s.linearVelocity[0], 0, wind.z - s.linearVelocity[2]).applyQuaternion(qInv);
  const k = 0.5 * c.airDensity * c.windCd;
  const fx = k * def.windage.side * Math.abs(u.x) * u.x;
  const fz = k * def.windage.front * Math.abs(u.z) * u.z;
  const force = new THREE.Vector3(fx, 0, fz).applyQuaternion(q);
  force.y = 0; // horizontal push only
  // Centre of effort: over the CLR side-on, toward the upwind end with the wind along her.
  // The wind blows toward u, so it comes from the end at -u.z.
  const along = -u.z / (Math.hypot(u.x, u.z) || 1);
  const [cx, cy, cz] = def.windage.center;
  const point = new THREE.Vector3(cx, cy, clrZ(def) + cz + along * c.windCeShift * def.hull.params.length);
  point.applyQuaternion(q).add(new THREE.Vector3().fromArray(s.position));
  return { force, point };
}

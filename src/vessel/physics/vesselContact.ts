/**
 * Boat against boat (the skiff alongside the workboat): a soft, fender-like contact.
 *
 * Each hull is sampled at its deck edges and chines, station by station (both sides). A
 * sample point of boat A that is inside boat B's hull (in B's plan, between its keel and
 * a little above its deck) is pushed out along the shortest way out of B - sideways, or
 * fore / aft near the ends - by a spring-damper:
 *
 *   F = max(0, k * depth - c * v_n)   along that outward normal, at the point,
 *
 * on A, and the opposite on B (v_n: approach speed of the point relative to B). Forces are
 * evaluated from the start-of-tick states, before the vessels are stepped, so the result
 * does not depend on which boat is stepped first. With the workboat 50x the skiff's mass,
 * the skiff does the bouncing.
 */
import * as THREE from 'three';
import type { Vec3 } from '../../core/math';
import { hullPlan } from '../layout';
import type { VesselDef } from '../vesselDef';
import type { VesselState } from '../vesselState';

/** Per sample point (N/m) and (N*s/m): a few points share a typical side-on touch. */
const STIFFNESS = 30000;
const DAMPING = 2500;
/** Height above the deck edge that still counts as touching (gunwale, fenders, m). */
const ABOVE_DECK = 0.3;

export interface ExternalForce {
  force: THREE.Vector3;
  point: THREE.Vector3;
}

const qA = new THREE.Quaternion();
const qB = new THREE.Quaternion();
const qBInv = new THREE.Quaternion();
const p = new THREE.Vector3();
const l = new THREE.Vector3();
const n = new THREE.Vector3();
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const tmp = new THREE.Vector3();

/** Velocity (world) of a world point fixed to a vessel. */
function pointVelocity(s: VesselState, cgW: Vec3, point: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const [wx, wy, wz] = s.angularVelocity;
  const rx = point.x - cgW[0];
  const ry = point.y - cgW[1];
  const rz = point.z - cgW[2];
  return out.set(s.linearVelocity[0] + wy * rz - wz * ry, s.linearVelocity[1] + wz * rx - wx * rz, s.linearVelocity[2] + wx * ry - wy * rx);
}

function cgWorld(s: VesselState, def: VesselDef, q: THREE.Quaternion): Vec3 {
  tmp.fromArray(def.cg).applyQuaternion(q);
  return [tmp.x + s.position[0], tmp.y + s.position[1], tmp.z + s.position[2]];
}

/** Sample points of a hull in its own axes: deck edge and chine, both sides, every station. */
const samplesCache = new WeakMap<VesselDef, Vec3[]>();
function samples(def: VesselDef): Vec3[] {
  let s = samplesCache.get(def);
  if (!s) {
    s = [];
    for (const st of def.hull.stations) {
      const [xd, yd] = st.polygon[4];
      const [xc, yc] = st.polygon[3];
      s.push([xd, yd, st.z], [-xd, yd, st.z], [xc, yc, st.z], [-xc, yc, st.z]);
    }
    samplesCache.set(def, s);
  }
  return s;
}

/** Points of A inside B: push them apart. Adds to `outA` / `outB`. */
function pushOut(a: VesselState, defA: VesselDef, b: VesselState, defB: VesselDef, outA: ExternalForce[], outB: ExternalForce[]): void {
  qA.fromArray(a.orientation);
  qB.fromArray(b.orientation);
  qBInv.copy(qB).invert();
  const planB = hullPlan(defB);
  const keelB = Math.min(...defB.hull.stations.map((st) => st.polygon[2][1]));
  const cgA = cgWorld(a, defA, qA);
  const cgB = cgWorld(b, defB, qB);
  for (const s of samples(defA)) {
    p.fromArray(s).applyQuaternion(qA).add(tmp.fromArray(a.position));
    // In B's axes.
    l.copy(p).sub(tmp.fromArray(b.position)).applyQuaternion(qBInv);
    if (l.z > planB.transom || l.z < planB.stem) continue;
    if (l.y < keelB || l.y > planB.deckY(l.z) + ABOVE_DECK) continue;
    const half = planB.halfBeam(l.z);
    const side = half - Math.abs(l.x);
    if (side <= 0) continue;
    // Shortest way out: sideways, or past the transom / stem.
    const aft = planB.transom - l.z;
    const fwd = l.z - planB.stem;
    let depth = side;
    n.set(Math.sign(l.x) || 1, 0, 0);
    if (aft < depth) [depth, n.x, n.z] = [aft, 0, 1];
    if (fwd < depth) [depth, n.x, n.z] = [fwd, 0, -1];
    n.applyQuaternion(qB);
    n.y = 0;
    n.normalize();
    pointVelocity(a, cgA, p, vA);
    pointVelocity(b, cgB, p, vB);
    const vn = vA.sub(vB).dot(n); // < 0: moving further in
    const f = Math.max(0, STIFFNESS * depth - DAMPING * vn);
    if (f <= 0) continue;
    outA.push({ force: n.clone().multiplyScalar(f), point: p.clone() });
    outB.push({ force: n.clone().multiplyScalar(-f), point: p.clone() });
  }
}

/**
 * Contact forces between every pair of vessels that are close enough to touch, by vessel
 * id. `skip(id)`: vessels not in the water as free bodies (a tender stowed on its davit).
 */
export function vesselContacts(vessels: readonly VesselState[], defs: (s: VesselState) => VesselDef, skip: (s: VesselState) => boolean = () => false): Map<string, ExternalForce[]> {
  const out = new Map<string, ExternalForce[]>();
  const list = vessels.filter((v) => !skip(v));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const da = defs(a);
      const db = defs(b);
      const reach = (da.hull.params.length + db.hull.params.length) / 2 + 0.5;
      if (Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]) > reach) continue;
      const fa = out.get(a.id) ?? [];
      const fb = out.get(b.id) ?? [];
      pushOut(a, da, b, db, fa, fb);
      pushOut(b, db, a, da, fb, fa);
      if (fa.length) out.set(a.id, fa);
      if (fb.length) out.set(b.id, fb);
    }
  }
  return out;
}

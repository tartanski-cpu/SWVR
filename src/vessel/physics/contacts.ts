/**
 * Hull contacts with the seabed, the shore and harbour structures.
 *
 * The hull is probed at points on every other station: keel, both chines and both deck
 * edges (the hard-chine sections' corners). Each tick every point is tested against the
 * terrain height field and the quay/pier blocks; a point that is inside gets a penalty
 * force at that point:
 *
 *   F_n = max(0, k·d − c·v_n)        d = penetration depth, v_n = velocity along the normal
 *   F_t = −min(μ·F_n, c_t·|v_t|)·v̂_t  friction, viscous below `stickSpeed` so it settles
 *
 * Penalty stiffness is chosen so k/m and k·r²/I stay well inside the 60 Hz step's
 * stability limit even with several points touching at once.
 */
import { harbourBoatContact } from '../../world/harbourBoats';
import { CONFIG } from '../../config';
import { blockContact, type BlockHit } from '../../world/geography';
import { groundHeight, groundNormal } from '../../world/terrain';
import { coastGroundSolid } from '../../world/coastTerrain';
import type { HullForm } from '../hullForm';

export type ContactPoint = [number, number, number];

const cache = new WeakMap<HullForm, ContactPoint[]>();

/** Probe points in vessel axes: keel, chines and deck edges of every other station. */
export function hullContactPoints(hull: HullForm): ContactPoint[] {
  let pts = cache.get(hull);
  if (pts) return pts;
  pts = [];
  hull.stations.forEach((st, i) => {
    if (i % 2 !== 0 && i !== hull.stations.length - 1) return;
    for (const [x, y] of st.polygon) pts!.push([x, y, st.z]);
  });
  cache.set(hull, pts);
  return pts;
}

const hit: BlockHit = { depth: 0, nx: 0, ny: 0, nz: 0, fendered: false };
const n = { x: 0, y: 0, z: 0 };

export interface ContactResult {
  /** Force on the hull at the point (N, world). */
  fx: number;
  fy: number;
  fz: number;
  /** Normal force (N) and sliding speed (m/s), 0 if not touching. */
  normal: number;
  slide: number;
  /** Approach speed along the normal (m/s, + = into the surface). */
  approach: number;
}

/**
 * Contact force at one hull point (world position p, world velocity v).
 * Returns false if the point touches nothing.
 */
export function contactAt(px: number, py: number, pz: number, vx: number, vy: number, vz: number, out: ContactResult): boolean {
  const c = CONFIG.contacts;
  let depth = 0;
  let fendered = false;
  // Structures first (they stand on the terrain), and the boats lying in the harbours.
  if (blockContact(px, py, pz, hit) || harbourBoatContact(px, py, pz, hit)) {
    depth = hit.depth;
    n.x = hit.nx;
    n.y = hit.ny;
    n.z = hit.nz;
    fendered = hit.fendered;
  } else {
    // A big map's ground not streamed in yet is only its coarse grid: no contact there
    // until the detailed mesh arrives (coastTerrain.ts coastGroundSolid).
    if (!coastGroundSolid(px, pz)) return false;
    const h = groundHeight(px, pz);
    if (py >= h) return false;
    groundNormal(px, pz, n);
    depth = (h - py) * n.y; // distance to the local ground plane
  }
  const k = fendered ? c.fenderStiffness : c.stiffness;
  const damp = fendered ? c.fenderDamping : c.damping;
  const mu = fendered ? c.fenderFriction : c.friction;
  push(depth, k, damp, mu, vx, vy, vz, out);
  return true;
}

/** What a guard on her sides is made of (CONFIG.contacts.guards). */
export interface GuardMaterial {
  stiffness: number;
  damping: number;
  friction: number;
  absorb: number;
}

/**
 * Contact force at one of a guard's points (a fender, the rubbing strake, a tyre: standing
 * proud of her plating, so it meets a quay first). Only quays and piers: a guard is there
 * for coming alongside, not for rocks or the seabed (her hull's own points meet those).
 * Against a quay's own rubber fenders, the softer of the two springs, and the lower friction.
 */
export function guardContactAt(px: number, py: number, pz: number, vx: number, vy: number, vz: number, mat: GuardMaterial, out: ContactResult): boolean {
  if (!blockContact(px, py, pz, hit) && !harbourBoatContact(px, py, pz, hit)) return false;
  const c = CONFIG.contacts;
  n.x = hit.nx;
  n.y = hit.ny;
  n.z = hit.nz;
  const k = hit.fendered ? Math.min(mat.stiffness, c.fenderStiffness) : mat.stiffness;
  const mu = hit.fendered ? Math.min(mat.friction, c.fenderFriction) : mat.friction;
  push(hit.depth, k, mat.damping, mu, vx, vy, vz, out);
  return true;
}

/** The penalty spring's push at a point `depth` into a surface (normal `n`), and its friction. */
function push(depth: number, k: number, damp: number, mu: number, vx: number, vy: number, vz: number, out: ContactResult): void {
  const c = CONFIG.contacts;
  const vn = vx * n.x + vy * n.y + vz * n.z;
  const fn = Math.max(0, k * depth - damp * vn);
  // Tangential velocity and friction.
  const tx = vx - vn * n.x;
  const ty = vy - vn * n.y;
  const tz = vz - vn * n.z;
  const vt = Math.hypot(tx, ty, tz);
  let ft = 0;
  if (vt > 1e-6) ft = Math.min(mu * fn, ((mu * fn) / c.stickSpeed) * vt) / vt;
  out.fx = fn * n.x - ft * tx;
  out.fy = fn * n.y - ft * ty;
  out.fz = fn * n.z - ft * tz;
  out.normal = fn;
  out.slide = vt;
  out.approach = -vn;
}

/**
 * Docking and mooring lines (constants in CONFIG.docking).
 *
 *   free    : under way, no lines ashore. Each tick we note whether she is in a berth's hot
 *             spot (close, slow, lined up with the berth either way round): then a line can
 *             be made fast.
 *   docking : a line is ashore. The crew make each end fast at a cleat (owner request: no
 *             DOCK button): a forward cleat sends the bow line to the nearest bollard, an aft
 *             cleat the stern line, each on its own (`bow` / `stern`: the cleat's side).
 *             Lines come taut over `warpTime`, pulling her in gently (`warpForce`).
 *   moored  : both ends fast and settled: stiff, well-damped lines (capped at `holdForce`)
 *             hold bow and stern on their marks. Lines act horizontally only, so she still
 *             heaves, pitches and rolls in the swell. Dragged more than `breakDist` off, they
 *             part.
 * A cleat with its line fast casts that end off; with neither end fast she's free. The menu's
 * Dock / Cast off does both ends at once (toggleDock).
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { BerthDef } from '../../world/archipelago';
import { berthsNear, berthWithId } from '../../world/berths';
import { gearOf } from '../../boats/sims';
import { VESSEL_DEFS } from '../vesselDef';
import type { VesselState } from '../vesselState';

const q = new THREE.Quaternion();
const f = new THREE.Vector3();

/** The vessel's bow direction in the horizontal plane (unit x, z). */
function bowDirection(s: VesselState): { x: number; z: number } {
  f.set(0, 0, -1).applyQuaternion(q.fromArray(s.orientation));
  const len = Math.hypot(f.x, f.z) || 1;
  return { x: f.x / len, z: f.z / len };
}

/** Unit vector along a berth's axis, the way the boat will lie. */
export function berthAxis(b: BerthDef, reversed: boolean): { x: number; z: number } {
  const h = ((b.headingDeg + (reversed ? 180 : 0)) * Math.PI) / 180;
  return { x: Math.sin(h), z: -Math.cos(h) };
}

/** The berth whose hot spot she is in, and which way round she'd lie, or null. */
export function berthInRange(s: VesselState): { berth: BerthDef; reversed: boolean } | null {
  const c = CONFIG.docking;
  if (Math.hypot(s.linearVelocity[0], s.linearVelocity[2]) > c.maxSpeed) return null;
  const bow = bowDirection(s);
  const cosMax = Math.cos((c.maxAngleDeg * Math.PI) / 180);
  let best: { berth: BerthDef; reversed: boolean } | null = null;
  let bestDist = Infinity;
  for (const b of berthsNear(s.position[0], s.position[2])) {
    const d = Math.hypot(s.position[0] - b.x, s.position[2] - b.z);
    if (d > c.range || d >= bestDist) continue;
    const a = berthAxis(b, false);
    const dot = bow.x * a.x + bow.z * a.z;
    if (Math.abs(dot) < cosMax) continue;
    best = { berth: b, reversed: dot < 0 };
    bestDist = d;
  }
  return best;
}

/** Cast off everything. */
function castOff(m: VesselState['mooring']): void {
  m.phase = 'free';
  m.bow = 0;
  m.stern = 0;
  m.t = 0;
}

/**
 * A cleat (0 forward port, 1 forward starboard, 2 aft port, 3 aft starboard): if its end's
 * line is fast, cast that end off; else, in a berth's hot spot, make that end fast from this
 * cleat to the berth's bollard. Returns false when there's nothing in reach to make fast to.
 */
export function toggleCleat(s: VesselState, cleat: number): boolean {
  const m = s.mooring;
  const end = cleat < 2 ? 'bow' : 'stern';
  const side = cleat % 2 === 0 ? -1 : 1;
  if (m[end]) {
    m[end] = 0;
    if (!m.bow && !m.stern) castOff(m);
    return true;
  }
  // A line goes out only from a cleat she has (modules/cleat), and she moors only with both ends.
  if (!gearOf(s, 'bowCleat') || !gearOf(s, 'sternCleat')) return false;
  if (m.phase === 'free') {
    const r = berthInRange(s);
    if (!r) return false;
    m.berthId = r.berth.id;
    m.reversed = r.reversed;
    m.t = 0;
  }
  m[end] = side;
  m.phase = 'docking';
  return true;
}

/** The menu's Dock / Cast off: both lines at once (on the side facing the quay), or both off. */
export function toggleDock(s: VesselState): void {
  const m = s.mooring;
  if (m.phase !== 'free') return castOff(m);
  if (!gearOf(s, 'bowCleat') || !gearOf(s, 'sternCleat')) return;
  const r = berthInRange(s);
  if (!r) return;
  m.berthId = r.berth.id;
  m.reversed = r.reversed;
  m.t = 0;
  const side = shoreSide(s, r.berth);
  m.bow = side;
  m.stern = side;
  m.phase = 'docking';
}

/** Which side of the boat faces a berth's quay: -1 port, +1 starboard. */
export function shoreSide(s: VesselState, b: BerthDef): number {
  const bow = bowDirection(s);
  // Starboard is the bow turned 90 degrees clockwise seen from above: (-bow.z, bow.x) in (x, z).
  return -bow.z * b.shoreX + bow.x * b.shoreZ >= 0 ? 1 : -1;
}

export function berthById(id: string | null): BerthDef | undefined {
  return id ? berthWithId(id) : undefined;
}

type V = { x: number; y: number; z: number };

/**
 * How much closer to the quay than the berth's mark she lies (m; negative: further off). The
 * marks are set for the workboat's beam (BerthDef.shoreDist off the face): she lies with her
 * widest deck half-beam and CONFIG.docking.fenderClear off it, unless her cleats say (the
 * skiff's `inshore`), so a broad boat isn't moored into the quay.
 */
export function berthInshore(s: { defId: string }, shoreDist: number): number {
  const set = gearOf(s, 'bowCleat')?.inshore;
  if (set !== undefined) return set;
  const def = VESSEL_DEFS[s.defId];
  const halfBeam = def ? Math.max(...def.hull.stations.map((st) => st.halfBeamDeck)) : 2.1;
  // To the millimetre: the workboat's comes out at 0, not a rounding hair off it.
  return Math.round((shoreDist - halfBeam - CONFIG.docking.fenderClear) * 1000) / 1000;
}

/** Where to put her alongside a berth (world x, z), her beam allowed for. */
export function berthPose(s: { defId: string }, b: BerthDef): { x: number; z: number; headingDeg: number } {
  const inshore = berthInshore(s, b.shoreDist);
  return { x: b.x + b.shoreX * inshore, z: b.z + b.shoreZ * inshore, headingDeg: b.headingDeg };
}

/**
 * Advance docking/mooring and return the line forces at the bow and stern line points.
 * @param cleats             the stations (vessel z) of her bow and stern cleats, and how much
 *                           closer to the quay than the berth's marks she lies (`inshore`, m:
 *                           a small boat; the marks are set for the workboat's beam)
 * @param bow, stern          line points on the boat (world) and their velocities
 * @param outBow, outStern    horizontal forces (world, N)
 */
export function stepMooring(s: VesselState, cleats: { bow: number; stern: number; inshore?: number }, bow: V, bowVel: V, stern: V, sternVel: V, dt: number, outBow: V, outStern: V): void {
  const c = CONFIG.docking;
  const m = s.mooring;
  outBow.x = outBow.y = outBow.z = 0;
  outStern.x = outStern.y = outStern.z = 0;
  if (m.phase === 'free') {
    m.berthId = berthInRange(s)?.berth.id ?? null;
    return;
  }
  const b = berthById(m.berthId);
  if (!b) {
    castOff(m);
    return;
  }
  // Alongside with no ends recorded (a state from before the lines went to cleats, or one
  // set straight to moored, e.g. the menu's port shortcut): both ends fast, on the quay side.
  if (!m.bow && !m.stern) m.bow = m.stern = shoreSide(s, b);
  m.t += dt;
  const docking = m.phase === 'docking';
  const ramp = docking ? Math.min(1, m.t / c.warpTime) : 1;
  const k = c.stiffness * ramp;
  const damp = c.damping * ramp;
  const cap = docking ? c.warpForce : c.holdForce;
  const a = berthAxis(b, m.reversed);
  let worst = 0;
  const line = (p: V, v: V, tx: number, tz: number, out: V) => {
    const dx = tx - p.x;
    const dz = tz - p.z;
    worst = Math.max(worst, Math.hypot(dx, dz));
    let fx = k * dx - damp * v.x;
    let fz = k * dz - damp * v.z;
    const mag = Math.hypot(fx, fz);
    if (mag > cap) {
      fx *= cap / mag;
      fz *= cap / mag;
    }
    out.x = fx;
    out.z = fz;
  };
  // Each end only if its line is fast. The marks are where that cleat's station lies with
  // her alongside, centred on the berth (vessel z is aft, the berth axis points her bow).
  const fz = -cleats.bow;
  const az = -cleats.stern;
  const inshore = cleats.inshore ?? berthInshore(s, b.shoreDist);
  const inX = b.shoreX * inshore;
  const inZ = b.shoreZ * inshore;
  if (m.bow) line(bow, bowVel, b.x + a.x * fz + inX, b.z + a.z * fz + inZ, outBow);
  if (m.stern) line(stern, sternVel, b.x + a.x * az + inX, b.z + a.z * az + inZ, outStern);

  if (worst > c.breakDist && !docking) {
    // Lines parted.
    castOff(m);
    outBow.x = outBow.z = outStern.x = outStern.z = 0;
    return;
  }
  const speed = Math.hypot(s.linearVelocity[0], s.linearVelocity[2]);
  // Moored once both ends are fast and she has settled; with one end only she stays 'docking'.
  if (docking && m.bow && m.stern && ((worst < 0.3 && speed < 0.3) || m.t > 25)) m.phase = 'moored';
  else if (!docking && !(m.bow && m.stern)) m.phase = 'docking';
}

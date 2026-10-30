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
 *
 * Two ropes besides (owner, 30 Oct 2026, for Training): a spring (toggleSpring: from the bow
 * cleat aft to the berth's aft bollard, or the stern cleat forward to its forward one) and a
 * mooring buoy's pennant (a forward cleat close by a `mooring` mark: toggleCleat). A rope pulls
 * only when stretched past its length, along itself, stiff and damped as the lines are and
 * capped at `holdForce`; it parts past `breakDist` of stretch. Both act whatever the phase,
 * so she can lie to a buoy free of any berth, or motor ahead against a spring with her bow and
 * stern lines let go (springing off).
 */
import { berthTaken } from '../../world/harbourBoats';
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { BerthDef } from '../../world/archipelago';
import { berthsNear, berthWithId } from '../../world/berths';
import { MARKS } from '../../world/archipelago';
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
    // A harbour boat lies there (world/harbourBoats.ts), unless she has stepped aside for this one.
    if (berthTaken(b.id) && d > 5) continue;
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
  // A forward cleat to a mooring buoy: slip it, or (free, no berth in reach, the buoy close under the bow) make fast to it.
  if (end === 'bow' && m.buoy) {
    delete m.buoy;
    return true;
  }
  if (end === 'bow' && m.phase === 'free' && !berthInRange(s) && toggleBuoy(s)) return true;
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

/** Her bow or stern cleat's place in the world (x, z), near enough for a rope's end. */
function cleatAt(s: VesselState, end: 'bow' | 'stern'): { x: number; z: number } {
  const c = gearOf(s, end === 'bow' ? 'bowCleat' : 'sternCleat');
  const bow = bowDirection(s);
  // Vessel z runs aft: the cleat is -z along the bow.
  const along = -(c?.z ?? 0);
  return { x: s.position[0] + bow.x * along, z: s.position[2] + bow.z * along };
}

/** The mooring buoy within reach of her bow cleat (CONFIG.docking.buoyReach), slow enough to pick up, or null. */
export function buoyInReach(s: VesselState): { id: string; x: number; z: number } | null {
  const c = CONFIG.docking;
  if (Math.hypot(s.linearVelocity[0], s.linearVelocity[2]) > c.buoyMaxSpeed) return null;
  const at = cleatAt(s, 'bow');
  let best: { id: string; x: number; z: number } | null = null;
  let bestD = c.buoyReach;
  for (const mk of MARKS) {
    if (mk.kind !== 'mooring') continue;
    const d = Math.hypot(mk.x - at.x, mk.z - at.z);
    if (d < bestD) {
      bestD = d;
      best = { id: mk.name, x: mk.x, z: mk.z };
    }
  }
  return best;
}

/** Make fast to the mooring buoy in reach, or slip the one she's on. Returns false when there's none in reach. */
export function toggleBuoy(s: VesselState): boolean {
  const m = s.mooring;
  if (m.buoy) {
    delete m.buoy;
    return true;
  }
  if (!gearOf(s, 'bowCleat')) return false;
  const b = buoyInReach(s);
  if (!b) return false;
  m.buoy = { id: b.id, x: b.x, z: b.z, length: CONFIG.docking.buoyPennant };
  return true;
}

/**
 * Put a spring on (`fore`: bow cleat aft to the berth's aft bollard; `aft`: stern cleat forward
 * to its forward one), or take it off (`end` null, or the one she has). Needs a berth: the one
 * she's alongside or in reach of. Returns false when there's none.
 */
export function toggleSpring(s: VesselState, end: 'fore' | 'aft' | null): boolean {
  const m = s.mooring;
  if (!end || m.spring?.end === end) {
    delete m.spring;
    return true;
  }
  if (!gearOf(s, 'bowCleat') || !gearOf(s, 'sternCleat')) return false;
  const inRange = m.phase === 'free' ? berthInRange(s) : null;
  const b = m.phase !== 'free' ? berthById(m.berthId) : inRange?.berth;
  if (!b) return false;
  const reversed = m.phase !== 'free' ? m.reversed : inRange!.reversed;
  const a = berthAxis(b, reversed);
  const half = b.bollardHalf ?? 6;
  // The bollard on the quay's edge: aft of her middle for a fore spring, forward for an aft one.
  const k = end === 'fore' ? -half : half;
  const bx = b.x + b.shoreX * b.shoreDist + a.x * k;
  const bz = b.z + b.shoreZ * b.shoreDist + a.z * k;
  const c = cleatAt(s, end === 'fore' ? 'bow' : 'stern');
  m.spring = { end, x: bx, z: bz, length: Math.hypot(bx - c.x, bz - c.z) + CONFIG.docking.springSlack };
  return true;
}

/**
 * A rope from the point `p` (velocity `v`) to (ax, az), `length` long: the horizontal pull on
 * the boat at `p` when it's stretched (stiff and damped as a line, capped), added to `out`.
 * Returns how far it's stretched (m; 0 slack).
 */
function rope(p: V, v: V, ax: number, az: number, length: number, k: number, damp: number, cap: number, out: V): number {
  const dx = ax - p.x;
  const dz = az - p.z;
  const d = Math.hypot(dx, dz);
  const stretch = d - length;
  if (stretch <= 0 || d < 1e-6) return 0;
  const ux = dx / d;
  const uz = dz / d;
  // Pulling her toward the end, and damping her moving away from it along the rope.
  const away = -(v.x * ux + v.z * uz);
  const f = Math.min(cap, Math.max(0, k * stretch + damp * Math.max(0, away)));
  out.x += f * ux;
  out.z += f * uz;
  return stretch;
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
 *                           a small boat; the marks are set for the workboat's beam); her
 *                           mass (`massKg`: a light boat's lines are scaled to her)
 * @param bow, stern          line points on the boat (world) and their velocities
 * @param outBow, outStern    horizontal forces (world, N)
 */
export function stepMooring(s: VesselState, cleats: { bow: number; stern: number; inshore?: number; massKg?: number }, bow: V, bowVel: V, stern: V, sternVel: V, dt: number, outBow: V, outStern: V): void {
  const c = CONFIG.docking;
  const m = s.mooring;
  outBow.x = outBow.y = outBow.z = 0;
  outStern.x = outStern.y = outStern.z = 0;
  // The spring and the buoy's pennant, whatever the phase (added to the lines' pulls at the end).
  const ropes = { x: 0, y: 0, z: 0 };
  const sternRope = { x: 0, y: 0, z: 0 };
  const lightR = Math.min(1, (cleats.massKg ?? c.lightBoatKg) / c.lightBoatKg);
  if (m.buoy && rope(bow, bowVel, m.buoy.x, m.buoy.z, m.buoy.length, c.stiffness * lightR, c.damping * lightR, c.holdForce * lightR, ropes) > c.breakDist) delete m.buoy;
  if (m.spring) {
    const fore = m.spring.end === 'fore';
    if (rope(fore ? bow : stern, fore ? bowVel : sternVel, m.spring.x, m.spring.z, m.spring.length, c.stiffness * lightR, c.damping * lightR, c.holdForce * lightR, fore ? ropes : sternRope) > c.breakDist) delete m.spring;
  }
  const addRopes = () => {
    outBow.x += ropes.x;
    outBow.z += ropes.z;
    outStern.x += sternRope.x;
    outStern.z += sternRope.z;
  };
  if (m.phase === 'free') {
    m.berthId = berthInRange(s)?.berth.id ?? null;
    addRopes();
    return;
  }
  const b = berthById(m.berthId);
  if (!b) {
    castOff(m);
    addRopes();
    return;
  }
  // Alongside with no ends recorded (a state from before the lines went to cleats, or one
  // set straight to moored, e.g. the menu's port shortcut): both ends fast, on the quay side.
  if (!m.bow && !m.stern) m.bow = m.stern = shoreSide(s, b);
  m.t += dt;
  const docking = m.phase === 'docking';
  const ramp = docking ? Math.min(1, m.t / c.warpTime) : 1;
  // A light boat's lines scaled to her (CONFIG.docking.lightBoatKg).
  const light = Math.min(1, (cleats.massKg ?? c.lightBoatKg) / c.lightBoatKg);
  const k = c.stiffness * ramp * light;
  const damp = c.damping * ramp * light;
  const cap = (docking ? c.warpForce : c.holdForce) * light;
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
    addRopes();
    return;
  }
  const speed = Math.hypot(s.linearVelocity[0], s.linearVelocity[2]);
  // Moored once both ends are fast and she has settled; with one end only she stays 'docking'.
  if (docking && m.bow && m.stern && ((worst < 0.3 && speed < 0.3) || m.t > 25)) m.phase = 'moored';
  else if (!docking && !(m.bow && m.stern)) m.phase = 'docking';
  addRopes();
}

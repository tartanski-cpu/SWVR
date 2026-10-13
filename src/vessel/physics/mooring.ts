/**
 * Docking and mooring lines (constants in CONFIG.docking).
 *
 *   free    : under way. Each tick we note whether she is in a berth's hot spot (close,
 *             slow, lined up with the berth either way round) so the DOCK button can light.
 *   docking : DOCK pressed in a hot spot. Bow and stern lines go ashore and come taut over
 *             `warpTime`, pulling her in gently (force capped at `warpForce`).
 *   moored  : made fast: stiff, well-damped lines (capped at `holdForce`) hold bow and stern
 *             on their marks. Lines act horizontally only, so she still heaves, pitches and
 *             rolls in the swell. Dragged more than `breakDist` off, they part.
 * Pressing DOCK again (or the lines parting) casts off.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { BERTHS, type BerthDef } from '../../world/archipelago';
import type { VesselDef } from '../vesselDef';
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
  for (const b of BERTHS) {
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

/** DOCK button: start docking if in a hot spot; if docking or moored, cast off. */
export function toggleDock(s: VesselState): void {
  const m = s.mooring;
  if (m.phase !== 'free') {
    m.phase = 'free';
    m.t = 0;
    return;
  }
  const r = berthInRange(s);
  if (!r) return;
  m.phase = 'docking';
  m.berthId = r.berth.id;
  m.reversed = r.reversed;
  m.t = 0;
}

export function berthById(id: string | null): BerthDef | undefined {
  return id ? BERTHS.find((b) => b.id === id) : undefined;
}

type V = { x: number; y: number; z: number };

/**
 * Advance docking/mooring and return the line forces at the bow and stern line points.
 * @param bow, stern          line points on the boat (world) and their velocities
 * @param outBow, outStern    horizontal forces (world, N)
 */
export function stepMooring(s: VesselState, def: VesselDef, bow: V, bowVel: V, stern: V, sternVel: V, dt: number, outBow: V, outStern: V): void {
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
    m.phase = 'free';
    return;
  }
  m.t += dt;
  const docking = m.phase === 'docking';
  const ramp = docking ? Math.min(1, m.t / c.warpTime) : 1;
  const k = c.stiffness * ramp;
  const damp = c.damping * ramp;
  const cap = docking ? c.warpForce : c.holdForce;
  const a = berthAxis(b, m.reversed);
  const L = def.mooring.lineZ;
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
  line(bow, bowVel, b.x + a.x * L, b.z + a.z * L, outBow);
  line(stern, sternVel, b.x - a.x * L, b.z - a.z * L, outStern);

  if (worst > c.breakDist && !docking) {
    // Lines parted.
    m.phase = 'free';
    outBow.x = outBow.z = outStern.x = outStern.z = 0;
    return;
  }
  const speed = Math.hypot(s.linearVelocity[0], s.linearVelocity[2]);
  if (docking && ((worst < 0.3 && speed < 0.3) || m.t > 25)) m.phase = 'moored';
}

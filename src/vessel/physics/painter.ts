import * as THREE from 'three';
import { CONFIG } from '../../config';
import { clamp } from '../../core/math';
import type { Intent } from '../../core/intents';
import type { WorldState } from '../../core/world';
import { bowEyeLocal } from '../../tow/tow';
import { hullPlan } from '../layout';
import { VESSEL_DEFS, isWorkboat, type VesselDef } from '../vesselDef';
import type { VesselState } from '../vesselState';
import type { ExternalForce } from './vesselContact';

/**
 * The skiff's painter (owner request: launched on a windy day she blew away): a bow line
 * from a cleat on her stem head to one of the ship's cleats.
 *
 * Modelled as a rope that only pulls: slack, nothing; taut, a spring-damper along the line
 * between the two cleats (the same law as the towline), pulling the ship's cleat and her bow
 * towards each other. Damping uses the two boats' reduced mass, so it's the same fraction of
 * critical whatever's on the other end. Above its breaking load it parts.
 *
 * The ship's cleats, in this order (0-3 as the mooring lines number them):
 *   0 forward port, 1 forward starboard, 2 aft port, 3 aft starboard,
 *   4 midship port, 5 midship starboard.
 * Each is on the bulwark top; the line pulls from just above it.
 */
export const CLEAT_COUNT = 6;

export function cleatName(i: number): string {
  const where = i < 2 ? 'forward' : i < 4 ? 'aft' : 'midship';
  return `${i % 2 === 0 ? 'port' : 'starboard'} ${where} cleat`;
}

/** Cleat `i` on the ship (vessel axes): the point the line pulls from. */
export function cleatLocal(def: VesselDef, i: number): [number, number, number] | null {
  if (!isWorkboat(def)) return null;
  const mo = def.mooring;
  const z = i < 2 ? mo.cleatFwdZ : i < 4 ? mo.cleatAftZ : mo.cleatMidZ;
  const side = i % 2 === 0 ? -1 : 1;
  const plan = hullPlan(def);
  return [side * (plan.halfBeam(z) - 0.03), plan.deckY(z) + def.layout.bulwarkHeight + 0.06, z];
}

/** Her bow cleat (vessel axes): the stem head, where a towline would go. */
export function skiffCleatLocal(def: VesselDef): [number, number, number] {
  return bowEyeLocal(def);
}

const q = new THREE.Quaternion();
const tmp = new THREE.Vector3();
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const dir = new THREE.Vector3();

function toWorld(v: VesselState, local: readonly number[], out: THREE.Vector3): THREE.Vector3 {
  q.fromArray(v.orientation);
  return out.set(local[0], local[1], local[2]).applyQuaternion(q).add(tmp.fromArray(v.position));
}

/** Velocity of a world point fixed to a vessel (v + w x r, r from her origin). */
function pointVelocity(v: VesselState, p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const [wx, wy, wz] = v.angularVelocity;
  const rx = p.x - v.position[0];
  const ry = p.y - v.position[1];
  const rz = p.z - v.position[2];
  return out.set(v.linearVelocity[0] + wy * rz - wz * ry, v.linearVelocity[1] + wz * rx - wx * rz, v.linearVelocity[2] + wx * ry - wy * rx);
}

/** Distance (m) from her bow cleat to the ship's cleat `i`, or null if there's no such cleat. */
function cleatDistance(world: WorldState, tender: VesselState, i: number): number | null {
  const host = tender.tender && world.vessels[tender.tender.hostId];
  const local = host && cleatLocal(VESSEL_DEFS[host.defId], i);
  if (!host || !local) return null;
  toWorld(host, local, a);
  toWorld(tender, skiffCleatLocal(VESSEL_DEFS[tender.defId]), b);
  return a.distanceTo(b);
}

/** What clicking would do: the cleat it goes to (or comes off), or why not. */
export type PainterPlan = { action: 'castOff'; cleat: number } | { action: 'makeFast'; cleat: number; length: number } | { action: 'none'; why: string };

/**
 * The plan for a click: `cleat` < 0 is her own bow cleat (let go if fast, else make fast to
 * the nearest of the ship's cleats in reach); a ship's cleat index leads the painter there
 * (or lets it go from there if it's already on it).
 */
export function painterPlan(world: WorldState, tender: VesselState, cleat: number): PainterPlan {
  const t = tender.tender;
  if (!t || t.phase !== 'free') return { action: 'none', why: 'the skiff is on the crane' };
  const cfg = CONFIG.docking.painter;
  if (t.painter && (cleat < 0 || t.painter.cleat === cleat)) return { action: 'castOff', cleat: t.painter.cleat };
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < CLEAT_COUNT; i++) {
    if (cleat >= 0 && i !== cleat) continue;
    const d = cleatDistance(world, tender, i);
    if (d !== null && d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best < 0) return { action: 'none', why: 'no cleat' };
  if (bestD > cfg.reach) return { action: 'none', why: `bring her bow within ${cfg.reach} m of the ${cleatName(best)} (${bestD.toFixed(0)} m)` };
  return { action: 'makeFast', cleat: best, length: clamp(bestD + cfg.slack, cfg.minLength, cfg.maxLength) };
}

/** The `painter` intent, aimed at the skiff (value: the cleat clicked, -1 her own). */
export function applyPainterIntent(world: WorldState, intent: Intent): void {
  const tender = world.vessels[intent.targetId];
  const t = tender?.tender;
  if (!t) return;
  const plan = painterPlan(world, tender, Math.round(intent.value));
  if (plan.action === 'castOff') delete t.painter;
  else if (plan.action === 'makeFast') t.painter = { cleat: plan.cleat, length: plan.length };
}

/**
 * Launched: make fast to the nearer forward cleat at once (the crane sets her down off the
 * starboard bow), however far, so she can't drift off before anyone gets to it.
 */
export function painterOnLaunch(world: WorldState, tender: VesselState): void {
  const t = tender.tender;
  if (!t) return;
  const cfg = CONFIG.docking.painter;
  const d0 = cleatDistance(world, tender, 0);
  const d1 = cleatDistance(world, tender, 1);
  if (d0 === null || d1 === null) return;
  const cleat = d1 <= d0 ? 1 : 0;
  t.painter = { cleat, length: clamp(Math.min(d0, d1) + cfg.slack, cfg.minLength, cfg.maxLength) };
}

/**
 * The painters' pull on both boats this tick (world force at world point), and parting a
 * painter that's past its strength. Call with the start-of-tick states.
 */
export function painterForces(world: WorldState): Map<string, ExternalForce[]> {
  const out = new Map<string, ExternalForce[]>();
  const cfg = CONFIG.docking.painter;
  for (const v of Object.values(world.vessels)) {
    const t = v.tender;
    if (!t?.painter || t.phase !== 'free') continue;
    const host = world.vessels[t.hostId];
    const hostDef = host && VESSEL_DEFS[host.defId];
    const local = hostDef && cleatLocal(hostDef, t.painter.cleat);
    if (!host || !local) {
      delete t.painter;
      continue;
    }
    toWorld(host, local, a);
    toWorld(v, skiffCleatLocal(VESSEL_DEFS[v.defId]), b);
    dir.copy(b).sub(a);
    const len = dir.length();
    const stretch = len - t.painter.length;
    if (stretch <= 0 || len < 1e-6) continue; // slack: it doesn't push
    dir.divideScalar(len);
    // Rate the line is being stretched: her bow's speed away from the cleat.
    const rate = pointVelocity(v, b, vb).sub(pointVelocity(host, a, va)).dot(dir);
    const m1 = VESSEL_DEFS[v.defId].mass;
    const m2 = hostDef.mass;
    const m = (m1 * m2) / (m1 + m2);
    const c = 2 * cfg.dampingRatio * Math.sqrt(cfg.stiffness * m);
    const T = Math.max(0, cfg.stiffness * stretch + c * rate);
    if (T > cfg.breakForce || stretch > cfg.maxStretch) {
      delete t.painter; // parted
      continue;
    }
    out.set(v.id, [{ force: dir.clone().multiplyScalar(-T), point: b.clone() }]);
    out.set(host.id, [...(out.get(host.id) ?? []), { force: dir.clone().multiplyScalar(T), point: a.clone() }]);
  }
  return out;
}

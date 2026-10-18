import * as THREE from 'three';
import { CONFIG } from '../../config';
import { clamp } from '../../core/math';
import type { Intent } from '../../core/intents';
import type { WorldState } from '../../core/world';
import { bowEyeLocal } from '../../tow/tow';
import { hullPlan } from '../layout';
import { gearOf } from '../../boats/sims';
import { VESSEL_DEFS, type VesselDef } from '../vesselDef';
import type { TenderState, VesselState } from '../vesselState';
import type { ExternalForce } from './vesselContact';
import { berthById, berthInRange, shoreSide, toggleCleat } from './mooring';

/**
 * The skiff's painter (owner request: launched on a windy day she blew away): a bow line
 * from a cleat on her stem head to one of the ship's cleats; and her stern line the same way
 * from her stern cleat (owner: tie her up front and back). Her own cleats also take her
 * lines ashore at a quay berth, as the big boats' do (mooring.ts; modules/boatCleat).
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
  // Her cleats are modules (M5b): no cleat there, nothing to make fast to.
  const cleat = gearOf({ defId: def.id }, i < 2 ? 'bowCleat' : i < 4 ? 'sternCleat' : 'midCleat');
  if (!cleat) return null;
  const z = cleat.z;
  const side = i % 2 === 0 ? -1 : 1;
  const plan = hullPlan(def);
  return [side * (plan.halfBeam(z) - 0.03), plan.deckY(z) + def.layout.bulwarkHeight + 0.06, z];
}

/** Which of her ends a line is from. */
export type PainterEnd = 'bow' | 'stern';

/**
 * Her cleat at an end (vessel axes): the point that end's line pulls from (her cleat modules;
 * without a bow cleat module, her stem head, where a towline would go). Null: no stern cleat.
 */
export function skiffCleatLocal(def: VesselDef, end?: 'bow'): [number, number, number];
export function skiffCleatLocal(def: VesselDef, end: PainterEnd): [number, number, number] | null;
export function skiffCleatLocal(def: VesselDef, end: PainterEnd = 'bow'): [number, number, number] | null {
  const c = gearOf({ defId: def.id }, end === 'bow' ? 'bowCleat' : 'sternCleat');
  if (c) return [c.x ?? 0, c.lineY, c.z];
  return end === 'bow' ? bowEyeLocal(def) : null;
}

/** Her line to the ship from an end, while it's fast. */
export function lineFrom(t: TenderState, end: PainterEnd): TenderState['painter'] {
  return end === 'bow' ? t.painter : t.sternPainter;
}

function setLine(t: TenderState, end: PainterEnd, line: TenderState['painter']): void {
  if (end === 'bow') {
    if (line) t.painter = line;
    else delete t.painter;
  } else if (line) t.sternPainter = line;
  else delete t.sternPainter;
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

/** Distance (m) from her cleat at `end` to the ship's cleat `i`, or null if either isn't there. */
function cleatDistance(world: WorldState, tender: VesselState, i: number, end: PainterEnd = 'bow'): number | null {
  const host = tender.tender && world.vessels[tender.tender.hostId];
  const local = host && cleatLocal(VESSEL_DEFS[host.defId], i);
  const own = skiffCleatLocal(VESSEL_DEFS[tender.defId], end);
  if (!host || !local || !own) return null;
  toWorld(host, local, a);
  toWorld(tender, own, b);
  return a.distanceTo(b);
}

/**
 * The quay berth her lines would go to: the one she's alongside, or the one whose hot spot
 * she's in, unless another boat lies there (the ship's own berth: her lines go to the ship).
 */
function berthFor(world: WorldState, tender: VesselState) {
  const m = tender.mooring;
  const berth = m.phase !== 'free' ? berthById(m.berthId) : berthInRange(tender)?.berth;
  if (!berth) return null;
  const taken = Object.values(world.vessels).some((o) => o !== tender && o.mooring.phase !== 'free' && o.mooring.berthId === berth.id);
  return taken ? null : berth;
}

/** What clicking would do: the ship's cleat a line goes to (or comes off), ashore, or why not. */
export type PainterPlan =
  | { action: 'castOff'; cleat: number; end: PainterEnd }
  | { action: 'makeFast'; cleat: number; length: number; end: PainterEnd }
  | { action: 'ashore'; end: PainterEnd }
  | { action: 'letGoAshore'; end: PainterEnd }
  | { action: 'none'; why: string };

/**
 * The plan for a click. `cleat` -1 or -2 is her own bow or stern cleat: let its line go if
 * it's fast (to the ship or ashore); else, at a free quay berth, make it fast ashore; else to
 * the nearest of the ship's cleats in reach. A ship's cleat index (>= 0) lets go the line
 * that's on it, or leads there the line from whichever of her free ends is nearer to it.
 */
export function painterPlan(world: WorldState, tender: VesselState, cleat: number): PainterPlan {
  const t = tender.tender;
  if (!t || t.phase !== 'free') return { action: 'none', why: 'the skiff is on the crane' };
  const cfg = CONFIG.docking.painter;
  const m = tender.mooring;
  const ashore = (end: PainterEnd) => m.phase !== 'free' && !!(end === 'bow' ? m.bow : m.stern);
  let end: PainterEnd;
  if (cleat < 0) {
    end = cleat === -2 ? 'stern' : 'bow';
    const line = lineFrom(t, end);
    if (line) return { action: 'castOff', cleat: line.cleat, end };
    if (ashore(end)) return { action: 'letGoAshore', end };
    if (berthFor(world, tender)) return { action: 'ashore', end };
  } else {
    for (const e of ['bow', 'stern'] as const) if (lineFrom(t, e)?.cleat === cleat) return { action: 'castOff', cleat, end: e };
    // Her free ends (not fast to the ship or ashore), the nearer to that cleat first.
    const free = (['bow', 'stern'] as const).filter((e) => !lineFrom(t, e) && !ashore(e) && cleatDistance(world, tender, cleat, e) !== null);
    if (!free.length) return { action: 'none', why: 'both her lines are fast' };
    free.sort((p, q) => cleatDistance(world, tender, cleat, p)! - cleatDistance(world, tender, cleat, q)!);
    end = free[0];
  }
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < CLEAT_COUNT; i++) {
    if (cleat >= 0 && i !== cleat) continue;
    const d = cleatDistance(world, tender, i, end);
    if (d !== null && d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best < 0) return { action: 'none', why: 'no cleat' };
  if (bestD > cfg.reach) return { action: 'none', why: `bring her ${end} within ${cfg.reach} m of the ${cleatName(best)} (${bestD.toFixed(0)} m)` };
  return { action: 'makeFast', cleat: best, length: clamp(bestD + cfg.slack, cfg.minLength, cfg.maxLength), end };
}

/** The `painter` intent, aimed at the skiff (value: the cleat clicked: a ship's, or -1 / -2 her own). */
export function applyPainterIntent(world: WorldState, intent: Intent): void {
  const tender = world.vessels[intent.targetId];
  const t = tender?.tender;
  if (!t) return;
  const plan = painterPlan(world, tender, Math.round(intent.value));
  if (plan.action === 'castOff') setLine(t, plan.end, undefined);
  else if (plan.action === 'makeFast') setLine(t, plan.end, { cleat: plan.cleat, length: plan.length });
  else if (plan.action === 'ashore' || plan.action === 'letGoAshore') {
    // Her mooring line at that end, on the side facing the quay (mooring.ts numbers its cleats).
    const berth = berthFor(world, tender);
    const side = plan.action === 'ashore' && berth ? shoreSide(tender, berth) : -1;
    toggleCleat(tender, (plan.end === 'bow' ? 0 : 2) + (side > 0 ? 1 : 0));
  }
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
  for (const v of Object.values(world.vessels)) for (const end of ['bow', 'stern'] as const) {
    const t = v.tender;
    const line = t && lineFrom(t, end);
    if (!t || !line || t.phase !== 'free') continue;
    const host = world.vessels[t.hostId];
    const hostDef = host && VESSEL_DEFS[host.defId];
    const local = hostDef && cleatLocal(hostDef, line.cleat);
    const own = skiffCleatLocal(VESSEL_DEFS[v.defId], end);
    if (!host || !local || !own) {
      setLine(t, end, undefined);
      continue;
    }
    toWorld(host, local, a);
    toWorld(v, own, b);
    dir.copy(b).sub(a);
    const len = dir.length();
    const stretch = len - line.length;
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
      setLine(t, end, undefined); // parted
      continue;
    }
    out.set(v.id, [...(out.get(v.id) ?? []), { force: dir.clone().multiplyScalar(-T), point: b.clone() }]);
    out.set(host.id, [...(out.get(host.id) ?? []), { force: dir.clone().multiplyScalar(T), point: a.clone() }]);
  }
  return out;
}

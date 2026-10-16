/**
 * Fishing: a side mission (owner request) with a simple trawl. Plain shared state
 * (WorldState.fishing), stepped by the host; the net is worked from the TRAWL switch on
 * the console (vessel control `trawl`).
 *
 *   net       stowed -> shooting (paid out over the quarter gallows, `shootTime` s) -> down
 *             -> hauling (`haulTime` s) -> stowed. While it's out it drags on the boat:
 *             F = -(cL + cQ |v|) v at the stern, scaled by how far out it is (a trawl at
 *             3 kn is a few kN: you hear the engine work).
 *   catching  with the net down, in one of the fishing grounds (CONFIG.fishing.grounds,
 *             dashed rings on the chartplotter), at trawling speed (`minSpeed`..`maxSpeed`
 *             m/s, about 2-4 kn), the net fills at `richness / boxEvery` per s. Each time
 *             it's full, a box of fish appears on the aft deck (a cargo item bound for
 *             'any' port: carry it ashore to any goods stack to land it). Too slow and the
 *             fish swim out; too fast and the net lifts off the bottom; outside a ground
 *             there's nothing; deck full: the catch waits in the net.
 *   fouled    trawled where it's shallower than `snagDepth` m, the net catches on the
 *             bottom: it holds her back hard and catches nothing until it's hauled.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { aboard, footprint, deckHeightAt, type CargoItem } from '../cargo/cargo';
import { deckSpot } from '../cargo/deck';
import { hullPlan } from '../vessel/layout';
import { isWorkboat, VESSEL_DEFS } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import type { ExternalForce } from '../vessel/physics/vesselContact';
import { groundHeight } from '../world/terrain';
import type { EntityId } from '../core/ids';
import { hasUpgrade } from '../career/career';

export type FishStatus = 'stowed' | 'shooting' | 'hauling' | 'fishing' | 'slow' | 'fast' | 'outside' | 'fouled' | 'full';

export interface FishingState {
  net: 'stowed' | 'shooting' | 'down' | 'hauling';
  /** How far out the net is, 0 (aboard) .. 1 (fishing). */
  t: number;
  /** The net's fill toward the next box, 0..1. */
  fill: number;
  status: FishStatus;
  /** The ground she's in (name), if any. */
  ground: string | null;
  /** Boxes caught, and landed ashore. */
  caught: number;
  landed: number;
  seq: number;
}

export function createFishingState(): FishingState {
  return { net: 'stowed', t: 0, fill: 0, status: 'stowed', ground: null, caught: 0, landed: 0, seq: 0 };
}

function trawler(world: WorldState): VesselState | undefined {
  return Object.values(world.vessels).find((v) => isWorkboat(VESSEL_DEFS[v.defId]));
}

/** The fishing ground at (x, z), if any. */
export function groundAt(x: number, z: number): (typeof CONFIG.fishing.grounds)[number] | undefined {
  return CONFIG.fishing.grounds.find((g) => Math.hypot(g.x - x, g.z - z) < g.radius);
}

/** Speed over the ground (m/s, horizontal). */
function speedOf(v: VesselState): number {
  return Math.hypot(v.linearVelocity[0], v.linearVelocity[2]);
}

const FISH_KIND = () => CONFIG.cargo.kinds.findIndex((k) => k.name === 'Fish box');

/** A box of fish on the aft deck, if there's room. */
function landBox(world: WorldState, v: VesselState, f: FishingState): CargoItem | null {
  const kind = FISH_KIND();
  const k = CONFIG.cargo.kinds[kind];
  const proto = { kind, mass: k.mass } as CargoItem;
  const others = aboard(world, v.id).map((c) => {
    const at = c.at as Extract<CargoItem['at'], { vessel: string }>;
    const fp = footprint(c);
    return { x: at.pos[0], z: at.pos[2], r: Math.max(fp.hx, fp.hz) };
  });
  const z0 = hullPlan(VESSEL_DEFS[v.defId]).transom - CONFIG.fishing.boxInset;
  const spot = deckSpot(v.defId, footprint(proto), ((f.seq % 3) - 1) * 0.7, z0, others);
  if (!spot) return null;
  f.seq += 1;
  const item: CargoItem = {
    id: `fish-${f.seq}-${Math.floor(world.time)}`,
    kind,
    mass: k.mass,
    from: 'trawl',
    to: 'any',
    at: { vessel: v.id, pos: [spot.x, deckHeightAt(v.defId, spot.z), spot.z], yaw: 0, vel: [0, 0], lashed: false },
  };
  world.cargo[item.id] = item;
  return item;
}

/** One tick: the net out or in, and the catch. */
export function stepFishing(world: WorldState, dt: number): void {
  const f = (world.fishing ??= createFishingState());
  const v = trawler(world);
  if (!v) return;
  const c = CONFIG.fishing;
  const want = (v.controls.trawl ?? 0) > 0.5;
  if (want && (f.net === 'stowed' || f.net === 'hauling')) f.net = 'shooting';
  if (!want && (f.net === 'down' || f.net === 'shooting')) f.net = 'hauling';
  f.ground = groundAt(v.position[0], v.position[2])?.name ?? null;
  if (f.net === 'shooting') {
    f.t = Math.min(1, f.t + dt / c.shootTime);
    if (f.t >= 1) f.net = 'down';
    f.status = f.status === 'fouled' ? 'fouled' : 'shooting';
    return;
  }
  if (f.net === 'hauling') {
    f.t = Math.max(0, f.t - dt / c.haulTime);
    if (f.t <= 0) f.net = 'stowed';
    f.status = f.t <= 0 ? 'stowed' : 'hauling';
    return;
  }
  if (f.net === 'stowed') {
    f.status = 'stowed';
    return;
  }
  // Down: fishing, or why not.
  const depth = -groundHeight(v.position[0], v.position[2]);
  if (f.status === 'fouled' || depth < c.snagDepth) {
    f.status = 'fouled';
    return;
  }
  const g = groundAt(v.position[0], v.position[2]);
  const sp = speedOf(v);
  if (!g) f.status = 'outside';
  else if (sp < c.minSpeed) f.status = 'slow';
  else if (sp > c.maxSpeed) f.status = 'fast';
  else {
    f.status = 'fishing';
    // The bigger trawl (a career upgrade) fills faster.
    const every = c.boxEvery / (hasUpgrade(world, 'trawl') ? c.bigTrawlFactor : 1);
    f.fill = Math.min(1, f.fill + (g.richness * dt) / every);
  }
  if (f.fill >= 1) {
    if (landBox(world, v, f)) {
      f.fill = 0;
      f.caught += 1;
    } else f.status = 'full';
  }
}

const vel = new THREE.Vector3();
const q = new THREE.Quaternion();

/** The net's drag on the boat this tick (an external force at the stern, where the warps lead). */
export function trawlForces(world: WorldState): Map<EntityId, ExternalForce[]> {
  const out = new Map<EntityId, ExternalForce[]>();
  const f = world.fishing;
  const v = trawler(world);
  if (!f || !v || f.t <= 0) return out;
  const c = CONFIG.fishing;
  vel.set(v.linearVelocity[0], 0, v.linearVelocity[2]);
  const sp = vel.length();
  const fouled = f.status === 'fouled';
  const k = (fouled ? c.foulDrag : c.dragLinear + c.dragQuad * sp) * f.t;
  const force = vel.clone().multiplyScalar(-k);
  // Fouled with her stopped, it still holds: a pull astern she has to tow against.
  if (fouled && sp < 0.3) {
    q.fromArray(v.orientation);
    force.add(new THREE.Vector3(0, 0, 1).applyQuaternion(q).setY(0).normalize().multiplyScalar(c.foulHold * f.t));
  }
  const plan = hullPlan(VESSEL_DEFS[v.defId]);
  const zs = plan.transom - 0.7;
  const point = new THREE.Vector3(0, plan.deckY(zs) + 1.5, zs).applyQuaternion(q.fromArray(v.orientation)).add(new THREE.Vector3(...v.position));
  out.set(v.id, [{ force, point }]);
  return out;
}

/** One line for displays while the net is out, else null. */
export function fishingStatus(world: WorldState): string | null {
  const f = world.fishing;
  if (!f || f.net === 'stowed') return null;
  const box = `net ${Math.round(f.fill * 100)} %`;
  const where = f.ground ? ` on ${f.ground}` : '';
  switch (f.status) {
    case 'shooting':
      return 'Shooting the trawl...';
    case 'hauling':
      return 'Hauling the trawl...';
    case 'fishing':
      return `Trawling${where}: ${box}`;
    case 'slow':
      return `Trawling${where}: too slow, the fish outswim the net (2-4 kn)`;
    case 'fast':
      return `Trawling${where}: too fast, the net lifts off the bottom (2-4 kn)`;
    case 'outside':
      return 'Trawling: no fish here - find a fishing ground (dashed on the plotter)';
    case 'fouled':
      return 'Net fouled on the bottom! Haul it in (TRAWL switch off)';
    case 'full':
      return 'Deck full: land your catch before more comes aboard';
    default:
      return null;
  }
}

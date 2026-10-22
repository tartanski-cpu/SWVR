/**
 * Fishing: a side mission (owner request) with a simple trawl. Plain shared state
 * (WorldState.fishing), stepped by the host. The net is worked two ways: the TRAWL switch
 * on the console (vessel control `trawl`) runs it all the way out or in when it's flipped;
 * the PAY OUT / HAUL buttons on the A-frame's starboard leg (hold-to-run, `netOut` / `netIn`) move it by
 * hand while held and stop it where it is ('held').
 *
 *   net       stowed -> shooting (paid out through the A-frame's blocks over the transom, `shootTime` s) -> down
 *             -> hauling (`haulTime` s) -> stowed. While it's out it drags on the boat:
 *             F = -(cL + cQ |v|) v at the stern, scaled by how far out it is (a trawl at
 *             3 kn is a few kN: you hear the engine work).
 *   catching  with the net down, in one of the fishing grounds (FISHING_GROUNDS in world/archipelago.ts,
 *             dashed rings on the chartplotter), at trawling speed (`minSpeed`..`maxSpeed`
 *             m/s, about 2-4.5 kn), the net fills at `richness / boxEvery` per s. Each time
 *             it's full, a box of fish appears on the aft deck (a cargo item bound for
 *             'any' port: carry it ashore to any goods stack to land it). Too slow and the
 *             fish swim out; too fast and the net lifts off the bottom; outside a ground
 *             there's nothing; deck full: the catch waits in the net.
 *   fouled    trawled where it's shallower than `snagDepth` m, the net catches on the
 *             bottom: it holds her back hard and catches nothing until it's hauled.
 */
import * as THREE from 'three';
import { FISHING_GROUNDS, type FishingGroundDef } from '../world/archipelago';
import { CONFIG } from '../config';
import { hydraulicsOn } from '../vessel/electrics';
import type { WorldState } from '../core/world';
import { aboard, footprint, deckHeightAt, type CargoItem } from '../cargo/cargo';
import { deckSpot } from '../cargo/deck';
import { hullPlan } from '../vessel/layout';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { gearOf } from '../boats/sims';
import type { GearFacts } from '../modular/module';
import type { VesselState } from '../vessel/vesselState';
import type { ExternalForce } from '../vessel/physics/vesselContact';
import { groundHeight } from '../world/terrain';
import type { EntityId } from '../core/ids';
import { hasUpgrade } from '../career/career';
import { significantWaveHeight } from '../ocean/waves';
import { holdOf, stowInHold } from './fishHold';

export type FishStatus = 'stowed' | 'shooting' | 'hauling' | 'held' | 'noHydraulics' | 'fishing' | 'slow' | 'fast' | 'outside' | 'fouled' | 'full' | 'rough';

export interface FishingState {
  net: 'stowed' | 'shooting' | 'down' | 'hauling' | 'held';
  /** The TRAWL switch as last seen (a flip starts a full shoot or haul). */
  sw?: number;
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

/** The fishing boat: the first with a trawl aboard (modular boats M5; modules/trawl). */
function trawler(world: WorldState): VesselState | undefined {
  return Object.values(world.vessels).find((v) => gearOf(v, 'trawl'));
}

/** The fishing ground at (x, z), if any. */
export function groundAt(x: number, z: number): FishingGroundDef | undefined {
  return FISHING_GROUNDS.find((g) => Math.hypot(g.x - x, g.z - z) < g.radius);
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
    // What's in it: the ground's species (named on the box; the buyer prices it).
    species: groundAt(v.position[0], v.position[2])?.species,
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
  // The console switch: a flip runs the net all the way out, or all the way in.
  const sw = (v.controls.trawl ?? 0) > 0.5 ? 1 : 0;
  if (sw !== (f.sw ?? 0)) {
    if (sw && f.net !== 'down') f.net = 'shooting';
    if (!sw && f.net !== 'stowed') f.net = 'hauling';
  }
  f.sw = sw;
  // The A-frame's buttons: out or in by hand while held, stopping where it is when let go.
  const jog = (v.controls.netOut ?? 0) - (v.controls.netIn ?? 0);
  // The net drum is hydraulic: with no pressure (engine off, DECK HYD off) nothing moves; a
  // shoot or haul asked for waits, and starts when the hydraulics come on.
  f.ground = groundAt(v.position[0], v.position[2])?.name ?? null;
  if (!hydraulicsOn(v) && (jog || f.net === 'shooting' || f.net === 'hauling')) {
    if (f.status !== 'fouled') f.status = 'noHydraulics';
    return;
  }
  if (jog) {
    f.t = Math.min(1, Math.max(0, f.t + (jog * dt) / (jog > 0 ? c.shootTime : c.haulTime)));
    f.net = f.t >= 1 ? 'down' : f.t <= 0 ? 'stowed' : 'held';
    // The switch follows: on while any of the net is out (flip it off to haul it all in).
    v.controls.trawl = f.sw = f.t > 0 ? 1 : 0;
  }
  if (f.net === 'held') {
    // Part out, stopped: it drags (by how far out it is) but doesn't fish. Still fouled if it was.
    if (f.status !== 'fouled') f.status = 'held';
    return;
  }
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
  // Heavy weather: the net can't be worked in a big sea (phase 2).
  if (significantWaveHeight(world.environment.waves) > c.maxHs) f.status = 'rough';
  else if (!g) f.status = 'outside';
  else if (sp < c.minSpeed) f.status = 'slow';
  else if (sp > c.maxSpeed) f.status = 'fast';
  else {
    f.status = 'fishing';
    // The bigger trawl (a career upgrade) fills faster.
    const every = c.boxEvery / (hasUpgrade(world, 'trawl') ? c.bigTrawlFactor : 1);
    f.fill = Math.min(1, f.fill + (g.richness * dt) / every);
  }
  if (f.fill >= 1) {
    // Down into her fish hold if she has one with room (fishHold.ts), else on deck.
    if (stowInHold(v, groundAt(v.position[0], v.position[2])?.species) || landBox(world, v, f)) {
      f.fill = 0;
      f.caught += 1;
    } else f.status = 'full';
  }
}

/**
 * Her trawl gantry (the A-frame over the transom, modules/aFrame; vessel axes): the
 * starboard foot (x, z, deck height; port is -x) and head (x, z, height), the blocks' x on
 * the crossbeam, and where each leg's brace meets the deck (z). Null on boats without one.
 */
export function aFrameOf(v: { defId: string }): GearFacts['trawlGantry'] | null {
  return gearOf(v, 'trawlGantry');
}

const vel = new THREE.Vector3();
const q = new THREE.Quaternion();

/** The net's drag on the boat this tick (an external force at the A-frame's blocks, where the warps lead). */
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
  const af = aFrameOf(v);
  const plan = hullPlan(VESSEL_DEFS[v.defId]);
  const local = af ? new THREE.Vector3(0, af.top - 0.14, af.headZ) : new THREE.Vector3(0, plan.deckY(plan.transom) + 1.5, plan.transom);
  const point = local.applyQuaternion(q.fromArray(v.orientation)).add(new THREE.Vector3(...v.position));
  out.set(v.id, [{ force, point }]);
  return out;
}

/** The trawling speed window in knots, for the status line (e.g. "2-4.5 kn"). */
export function trawlKnots(): string {
  const kn = (ms: number) => String(Math.round(ms * 1.9438 * 2) / 2);
  return `${kn(CONFIG.fishing.minSpeed)}-${kn(CONFIG.fishing.maxSpeed)} kn`;
}

/** One line for displays while the net is out, else null. */
export function fishingStatus(world: WorldState): string | null {
  const f = world.fishing;
  if (!f || f.net === 'stowed') return null;
  const v = trawler(world);
  const hold = v ? holdOf(v) : null;
  const box = `net ${Math.round(f.fill * 100)} %${hold ? `, hold ${v!.hold?.boxes.length ?? 0}/${hold.slots.length}` : ''}`;
  const where = f.ground ? ` on ${f.ground}` : '';
  switch (f.status) {
    case 'shooting':
      return 'Shooting the trawl...';
    case 'hauling':
      return 'Hauling the trawl...';
    case 'held':
      return `Net ${Math.round(f.t * 100)} % out, stopped (PAY OUT / HAUL on the A-frame, or the TRAWL switch)`;
    case 'noHydraulics':
      return 'Net drum has no hydraulics: engine running and DECK HYD breaker on';
    case 'fishing':
      return `Trawling${where}: ${box}`;
    case 'slow':
      return `Trawling${where}: too slow, the fish outswim the net (${trawlKnots()})`;
    case 'fast':
      return `Trawling${where}: too fast, the net lifts off the bottom (${trawlKnots()})`;
    case 'outside':
      return 'Trawling: no fish here - find a fishing ground (dashed on the plotter)';
    case 'fouled':
      return 'Net fouled on the bottom! Haul it in (TRAWL switch off, or HAUL on the A-frame)';
    case 'rough':
      return 'Too rough to fish: the net jumps off the bottom - haul it and wait for better weather';
    case 'full':
      return hold ? 'Hold and deck full: land your catch before more comes aboard' : 'Deck full: land your catch before more comes aboard';
    default:
      return null;
  }
}

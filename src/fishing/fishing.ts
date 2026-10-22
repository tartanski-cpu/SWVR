/**
 * Fishing: a side mission (owner request) with a trawl. Plain shared state
 * (WorldState.fishing), stepped by the host. The net is worked two ways: the TRAWL switch
 * on the console (vessel control `trawl`) runs it all the way out or in when it's flipped;
 * the PAY OUT / HAUL buttons on the A-frame's control box (hold-to-run, `netOut` / `netIn`) move it by
 * hand while held and stop it where it is ('held').
 *
 *   net       stowed (on its drum) -> shooting (paid out through the A-frame's blocks over the
 *             transom, `shootTime` s) -> down -> hauling (the warps in, `haulTime` s, the trawl
 *             doors coming up to hang at the blocks) -> lifting (owner, Oct 2026: the net up
 *             the stern and the codend, the bag of fish at its end, up under the A-frame, which
 *             swings it in over the deck: `liftTime` s; codend.ts) -> aboard (hanging over the
 *             deck: RELEASE on the A-frame's box empties it) -> stowing (the A-frame swings
 *             back out, the net goes back on its drum, `stowTime` s) -> stowed. Shot again
 *             from aboard, the codend goes back over the stern first (what's in it stays in it).
 *             While it's out it drags on the boat: F = -(cL + cQ |v|) v at the stern, scaled by
 *             how far out it is (a trawl at 3 kn is a few kN: you hear the engine work).
 *   catching  with the net down, in one of the fishing grounds (FISHING_GROUNDS in world/archipelago.ts,
 *             dashed rings on the chartplotter), at trawling speed (`minSpeed`..`maxSpeed`
 *             m/s, about 2-4.5 kn), the net fills at `richness / boxEvery` per s. Each time
 *             it's full, a box's worth of fish is in the codend (each its ground's species), up
 *             to `codendBoxes`: then it's full and wants hauling. Too slow and the fish swim
 *             out; too fast and the net lifts off the bottom; outside a ground there's nothing.
 *   the catch emptied on deck, the crew boxes it, a box every `boxTime` s: into the fish hold
 *             first if she has one with room (fishHold.ts), else on the deck by the heap (a
 *             cargo item bound for 'any' port: carry it ashore to any goods stack to land it).
 *             With no room on deck the heap waits. The codend's weight hangs on her at the
 *             A-frame once it's out of the water (codendPayload).
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
import { codendAt, codendOutOfWater, luffOf } from './codend';

export type FishStatus = 'stowed' | 'shooting' | 'hauling' | 'held' | 'noHydraulics' | 'fishing' | 'slow' | 'fast' | 'outside' | 'fouled' | 'full' | 'rough' | 'lifting' | 'aboard' | 'stowing';

export interface FishingState {
  net: 'stowed' | 'shooting' | 'down' | 'hauling' | 'held' | 'lifting' | 'aboard' | 'stowing';
  /** The TRAWL switch as last seen (a flip starts a full shoot or haul). */
  sw?: number;
  /** How far out the net is, 0 (aboard) .. 1 (fishing). */
  t: number;
  /** The net's fill toward the next box, 0..1. */
  fill: number;
  status: FishStatus;
  /** The ground she's in (name), if any. */
  ground: string | null;
  /** Boxes caught (into the net), and landed ashore. */
  caught: number;
  landed: number;
  seq: number;
  /** How far the net is up the stern and in over the deck, 0 (the warps just in) .. 1 (the codend hanging inboard): codend.ts. Absent: 0. */
  lift?: number;
  /** What's in the codend: a box's worth each, its species ('' unnamed). Absent: empty. */
  catch?: string[];
  /** The catch emptied on deck, waiting to be boxed (as `catch`); and how long since the last box (s). */
  pile?: string[];
  boxT?: number;
  /** The heap's boxes found no room on deck (the status says so). */
  deckFull?: boolean;
  /**
   * How much of the net is wound on its drum (a net drum's, modules/netDrum; drawn whether
   * she has one or not), 0 .. 1: all of it stowed; it comes off over the first quarter of a
   * shoot, back on as it comes up the stern (to `drumAboard`, the codend still hanging), and
   * the rest as it's stowed. Absent: 1 if stowed, else 0.
   */
  drum?: number;
}

/** The share of the net on its drum with the codend hanging aboard (the rest is the codend and its throat). */
const drumAboard = 0.85;
/** How far out the warps are when the last of the net comes off the drum shooting. */
const drumOff = 0.25;

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

/** A box of fish on the deck by the heap (where the codend was emptied), if there's room. */
function landBox(world: WorldState, v: VesselState, f: FishingState, species: string): CargoItem | null {
  const kind = FISH_KIND();
  const k = CONFIG.cargo.kinds[kind];
  const proto = { kind, mass: k.mass } as CargoItem;
  const others = aboard(world, v.id).map((c) => {
    const at = c.at as Extract<CargoItem['at'], { vessel: string }>;
    const fp = footprint(c);
    return { x: at.pos[0], z: at.pos[2], r: Math.max(fp.hx, fp.hz) };
  });
  const [hx, hz] = heapAt(v);
  const spot = deckSpot(v.defId, footprint(proto), hx + ((f.seq % 3) - 1) * 0.7, hz - 0.9, others);
  if (!spot) return null;
  f.seq += 1;
  const item: CargoItem = {
    id: `fish-${f.seq}-${Math.floor(world.time)}`,
    kind,
    mass: k.mass,
    from: 'trawl',
    to: 'any',
    // What's in it: the ground's species (named on the box; the buyer prices it).
    ...(species ? { species } : {}),
    at: { vessel: v.id, pos: [spot.x, deckHeightAt(v.defId, spot.z), spot.z], yaw: 0, vel: [0, 0], lashed: false },
  };
  world.cargo[item.id] = item;
  return item;
}

/** One tick: the net out or in (and up and aboard), the catch, and boxing it. */
export function stepFishing(world: WorldState, dt: number): void {
  const f = (world.fishing ??= createFishingState());
  const v = trawler(world);
  if (!v) return;
  const c = CONFIG.fishing;
  f.lift ??= 0;
  const inNet = (f.catch ??= []);
  boxTheCatch(world, v, f, dt);
  // The console switch: a flip runs the net all the way out, or all the way in (and aboard).
  const sw = (v.controls.trawl ?? 0) > 0.5 ? 1 : 0;
  if (sw !== (f.sw ?? 0)) {
    if (sw && f.net !== 'down') f.net = 'shooting';
    if (!sw && f.net !== 'stowed' && f.net !== 'aboard' && f.net !== 'stowing') f.net = 'hauling';
  }
  f.sw = sw;
  // The A-frame's buttons: out or in by hand while held, stopping where it is when let go.
  const jog = (v.controls.netOut ?? 0) - (v.controls.netIn ?? 0);
  // RELEASE on the A-frame's box: the codend opened over the deck, its catch on deck.
  if (v.controls.netRelease) {
    v.controls.netRelease = 0;
    if (f.net === 'aboard' && inNet.length) {
      (f.pile ??= []).push(...inNet.splice(0));
      f.boxT = 0;
    }
  }
  // The net drum and the A-frame's rams are hydraulic: with no pressure (engine off, DECK HYD
  // off) nothing moves; a shoot, haul or stow asked for waits, and starts when the hydraulics come on.
  f.ground = groundAt(v.position[0], v.position[2])?.name ?? null;
  const moving = jog || f.net === 'shooting' || f.net === 'hauling' || f.net === 'lifting' || f.net === 'stowing' || (f.net === 'aboard' && !inNet.length);
  if (!hydraulicsOn(v) && moving) {
    if (f.status !== 'fouled') f.status = 'noHydraulics';
    v.aFrameLuff = luffOf(f.lift);
    v.trawlGear = { warp: f.t, net: f.drum ?? 1 };
    return;
  }
  stepNet(f, v, jog, dt);
  stepDrum(f);
  v.aFrameLuff = luffOf(f.lift);
  // What the net drum and the trawl winches show (modules/netDrum, modules/trawlWinches).
  v.trawlGear = { warp: f.t, net: f.drum ?? 1 };
  if (f.net !== 'down') return;
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
  else if (inNet.length >= c.codendBoxes) f.status = 'full';
  else {
    f.status = 'fishing';
    // The bigger trawl (a career upgrade) fills faster.
    const every = c.boxEvery / (hasUpgrade(world, 'trawl') ? c.bigTrawlFactor : 1);
    f.fill = Math.min(1, f.fill + (g.richness * dt) / every);
    if (f.fill >= 1) {
      // A box's worth more in the codend.
      inNet.push(g.species ?? '');
      f.fill = 0;
      f.caught += 1;
    }
  }
}

/** The net's way out and in: the warps (`t`), then up the stern and aboard (`lift`), by the switch or by hand. */
function stepNet(f: FishingState, v: VesselState, jog: number, dt: number): void {
  const c = CONFIG.fishing;
  const lift = f.lift ?? 0;
  const inNet = f.catch ?? [];
  if (jog) {
    // By hand: PAY OUT lowers the codend back over the stern first, then pays the warps out;
    // HAUL winds the warps in, then lifts the net aboard. (On its drum, HAUL does nothing.)
    if (jog > 0) {
      if (lift > 0) f.lift = Math.max(0, lift - (jog * dt) / c.liftTime);
      else f.t = Math.min(1, f.t + (jog * dt) / c.shootTime);
    } else if (f.net !== 'stowed') {
      if (f.t > 0) f.t = Math.max(0, f.t + (jog * dt) / c.haulTime);
      else f.lift = Math.min(1, lift - (jog * dt) / c.liftTime);
    }
    f.net = f.t >= 1 ? 'down' : f.lift! >= 1 ? 'aboard' : 'held';
    // The switch follows: on while any of the net is out (flip it off to haul it all in).
    v.controls.trawl = f.sw = f.t > 0 ? 1 : 0;
  }
  switch (f.net) {
    case 'held':
      // Part out (or part up), stopped: it drags (by how far out it is) but doesn't fish. Still fouled if it was.
      if (f.status !== 'fouled') f.status = 'held';
      return;
    case 'shooting':
      // The codend back over the stern first, if it's up, then the warps out.
      if (lift > 0) f.lift = Math.max(0, lift - dt / c.liftTime);
      else f.t = Math.min(1, f.t + dt / c.shootTime);
      if (f.t >= 1) f.net = 'down';
      f.status = f.status === 'fouled' ? 'fouled' : 'shooting';
      return;
    case 'hauling':
      if (f.t > 0) {
        f.t = Math.max(0, f.t - dt / c.haulTime);
        f.status = 'hauling';
        return;
      }
      f.net = 'lifting';
      f.status = 'lifting';
      return;
    case 'lifting':
      f.lift = Math.min(1, lift + dt / c.liftTime);
      f.status = 'lifting';
      if (f.lift >= 1) f.net = 'aboard';
      return;
    case 'aboard':
      // Hanging over the deck: emptied (RELEASE), or empty, it's stowed.
      f.status = 'aboard';
      if (!inNet.length) f.net = 'stowing';
      return;
    case 'stowing':
      f.lift = Math.max(0, lift - dt / c.stowTime);
      f.status = 'stowing';
      if (f.lift <= 0) {
        f.net = 'stowed';
        f.status = 'stowed';
      }
      return;
    case 'stowed':
      f.status = 'stowed';
      return;
  }
}

/**
 * The net on its drum: paid off over the first quarter of the warps going out; wound back on
 * as the net comes up the stern, to `drumAboard` with the codend hanging over the deck; the
 * rest wound on as it's stowed; off again as the codend is lowered back over the stern.
 */
function stepDrum(f: FishingState): void {
  const lift = f.lift ?? 0;
  let drum = (f.drum ??= f.net === 'stowed' ? 1 : 0);
  if (f.net === 'stowed') drum = 1;
  else if (f.net === 'stowing') drum = Math.max(drum, drumAboard + (1 - drumAboard) * (1 - lift));
  else if (f.t > 0) drum = Math.min(drum, Math.max(0, 1 - f.t / drumOff));
  // (Warps in: as far up the stern as the net is; at the stern with none of it up, as it was.)
  else if (lift > 0) drum = drumAboard * Math.min(1, lift / CONFIG.fishing.codend.hangAt);
  f.drum = drum;
}

/** The catch emptied on deck, boxed a box every `boxTime` s: into the fish hold if it has room, else on deck by the heap. */
function boxTheCatch(world: WorldState, v: VesselState, f: FishingState, dt: number): void {
  const pile = f.pile;
  if (!pile?.length) {
    f.deckFull = false;
    return;
  }
  f.boxT = (f.boxT ?? 0) + dt;
  if (f.boxT < CONFIG.fishing.boxTime) return;
  const species = pile[0];
  const done = stowInHold(v, species) || !!landBox(world, v, f, species);
  f.deckFull = !done;
  if (done) {
    pile.shift();
    f.boxT = 0;
  }
}

/**
 * Where the catch lands on deck emptied from the codend (her axes, x and z): under where it
 * hangs inboard, or the nearest open deck to that (clear of her deck gear: a fish hold's
 * coaming, the winch). Kept by her type (it depends only on her gear).
 */
export function heapAt(v: { defId: string }): [number, number] {
  const def = VESSEL_DEFS[v.defId];
  let h = heaps.get(def);
  if (!h) {
    const af = aFrameOf(v);
    const p = af ? codendAt(af, 1) : [0, 0, hullPlan(def).transom - 2.2];
    const spot = deckSpot(v.defId, { hx: 0.45, hz: 0.45 }, p[0], p[2], []);
    heaps.set(def, (h = spot ? [spot.x, spot.z] : [p[0], p[2]]));
  }
  return h;
}
const heaps = new WeakMap<object, [number, number]>();

/** The codend's weight on her once it's out of the water (it hangs from the A-frame), with what's in it. */
export function codendPayload(world: WorldState, vesselId: EntityId): { mass: number; pos: THREE.Vector3 }[] {
  const f = world.fishing;
  const v = world.vessels[vesselId];
  if (!f?.catch?.length || !f.lift || !v || trawler(world) !== v) return [];
  const af = aFrameOf(v);
  const share = codendOutOfWater(f.lift);
  if (!af || share <= 0) return [];
  const k = CONFIG.cargo.kinds[FISH_KIND()];
  return [{ mass: f.catch.length * k.mass * share, pos: new THREE.Vector3(...codendAt(af, f.lift)) }];
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

/** One line for displays while the net is out (or the catch is being boxed), else null. */
export function fishingStatus(world: WorldState): string | null {
  const f = world.fishing;
  const pile = f?.pile?.length ?? 0;
  const boxing = pile ? (f!.deckFull ? `Deck full: ${pile} box${pile > 1 ? 'es' : ''} of fish waiting on deck - land some` : `Boxing the catch: ${pile} to go`) : null;
  if (!f || f.net === 'stowed') return boxing;
  const net = netStatus(world, f);
  return net && boxing ? `${net} · ${boxing}` : (net ?? boxing);
}

function netStatus(world: WorldState, f: FishingState): string | null {
  const v = trawler(world);
  const hold = v ? holdOf(v) : null;
  const n = f.catch?.length ?? 0;
  const inNet = `${n} box${n === 1 ? '' : 'es'} in the codend`;
  const box = `net ${Math.round(f.fill * 100)} %, ${inNet}${hold ? `, hold ${v!.hold?.boxes.length ?? 0}/${hold.slots.length}` : ''}`;
  const where = f.ground ? ` on ${f.ground}` : '';
  switch (f.status) {
    case 'shooting':
      return 'Shooting the trawl...';
    case 'hauling':
      return `Hauling the trawl: the warps coming in (${inNet})`;
    case 'lifting':
      return `The net coming up the stern, the codend swung aboard (${inNet})`;
    case 'aboard':
      return n ? `Codend aboard with ${n} box${n === 1 ? '' : 'es'} of fish: RELEASE on the A-frame's box empties it on deck` : null;
    case 'stowing':
      return 'Stowing the net';
    case 'held':
      return f.t > 0 ? `Net ${Math.round(f.t * 100)} % out, stopped (PAY OUT / HAUL on the A-frame, or the TRAWL switch)` : `Net up the stern, stopped (HAUL on the A-frame brings it aboard, or the TRAWL switch)`;
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
      return `Codend full (${n} boxes): haul it in and empty it`;
    default:
      return null;
  }
}

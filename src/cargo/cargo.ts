/**
 * Cargo between ports, carried by hand. Plain-data simulation (WorldState.cargo),
 * multiplayer-ready like the rest: players send intents, the simulation checks them.
 *
 *   - Goods wait in a row on a port's quay or beach, each bound for another port: ordered at
 *     its cargo screen (cargo/order.ts, CONFIG.cargo.onDemand), or with that off, kept
 *     stocked to CONFIG.cargo.perPort at every port.
 *   - Pick one up ('cargoTake'), carry it (one hand, or both for the heavy ones), set it
 *     down ('cargoPlace': on a deck, or ashore). Set down ashore near its destination's
 *     goods stack, it's delivered (stocked ports: a replacement appears somewhere else).
 *   - Dropped in the sea, it's lost (stocked ports: a replacement appears too).
 *   - On deck, unlashed items slide when the apparent gravity along the deck beats friction
 *     (stepDeckCargo below), and can go over the rail. Strapped to a lashing point
 *     ('cargoLash') they stay put.
 *   - At an anchorage there's no quay: launch the workboat's skiff, load her (two crates
 *     or one drum: `cargo.slots`), run her up the beach and carry the goods up to the stack.
 *   - A boat's deck crane (modules/deckCrane) lifts it too: HOOK takes the item under the
 *     hook, and sets it down again on the deck, the quay or the sea (stepCraneCargo). It
 *     hangs rigid under the hook (no swing, owner's choice), its weight on the boat there.
 *   - Cargo aboard, and cargo carried by players aboard, is real deadweight: payloadOf()
 *     feeds masses and positions to the vessel physics (mass, CG, inertia), so cargo
 *     shifting to one side gives her a list.
 *
 * New items are chosen with a deterministic hash of a counter in WorldState, so a host and
 * its clients (or a replay) agree.
 */
import { logPayload } from '../voyage/timber';
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { EntityId } from '../core/ids';
import type { Intent } from '../core/intents';
import type { Vec3 } from '../core/math';
import type { WorldState } from '../core/world';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { hullPlan } from '../vessel/layout';
import type { VesselState } from '../vessel/vesselState';
import { anchorageOnly, PORTS, SLIPWAYS, type PortDef } from '../world/archipelago';
import { standingHeight } from '../world/geography';
import { deckSpot, onOpenDeck, overDeck, type DeckFootprint } from './deck';
import { compensatedHook, craneStateOf, cranesOf, hookOnBoat } from './craneHook';
import { hasUpgrade } from '../career/career';
import { hydraulicsOn } from '../vessel/electrics';
import { safeLoadAt } from '../modules/deckCrane';
import { cargoLost, earn, portName } from '../career/career';
import { isPot, potLost, shootPot } from '../potting/potting';
import { applyOrderIntent } from './order';
import { bottomOf, isStackedUp, restingOn, setOnTop, stackTopNear, stackWithRoom } from './stack';
import { berthWithId } from '../world/berths';
import type { BerthDef } from '../world/defs';
import { isProjectBuoy, isProjectItem, layProjectBuoy, projectItemLost, projectItemName } from '../career/projects';

export type CargoAt =
  /** Ashore (world frame): `pos` is the middle of its base. `on`: the item it's stacked on (cargo/stack.ts). */
  | { ground: Vec3; yaw: number; on?: EntityId }
  /** On a vessel's deck (vessel axes): base centre, yaw, sliding velocity (x, z) and lashing; `on`: the item it's stacked on. */
  | { vessel: EntityId; pos: Vec3; yaw: number; vel: [number, number]; lashed: boolean; on?: EntityId }
  /** In a player's hands. */
  | { carriedBy: EntityId }
  /** On a vessel's deck crane's hook (`crane`: its path on her), hanging under it. */
  | { hook: EntityId; crane: string };

export interface CargoItem {
  id: EntityId;
  /** Index into CONFIG.cargo.kinds. */
  kind: number;
  mass: number;
  from: string;
  to: string;
  at: CargoAt;
  /** A pot hauled up (potting): what's in it. */
  pot?: PotContents;
  /** A fish box from the trawl: what's in it (the ground's species, FishingGroundDef). */
  species?: string;
  /** A salvage crate from a dive (dive/diveReturn.ts): what's in it and what it fetches (£). */
  salvage?: { name: string; value: number };
}

/** What's in a hauled pot (potting/potting.ts catchFor). */
export interface PotContents {
  crab: number;
  lobster: number;
  bycatch: 'fish' | 'starfish' | 'boot' | null;
}

/** Placement target for 'cargoPlace' meaning "ashore / in the sea" rather than a vessel. */
export const GROUND = 'ground';

/** Deterministic pseudo-random number in [0, 1) from an integer. */
function hash01(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export function portById(id: string): PortDef | undefined {
  return PORTS.find((p) => p.id === id);
}

export function kindOf(item: CargoItem) {
  return CONFIG.cargo.kinds[item.kind];
}

/** Crane cargo (CONFIG.cargo.crane): too heavy to carry, lifted only by a deck crane's hook. */
export function craneOnly(item: CargoItem): boolean {
  return isProjectBuoy(item) || CONFIG.cargo.crane.kinds.includes(kindOf(item)?.name ?? '');
}

/** A port's cargo berth (its quay, for crane cargo), or null (an anchorage, a beach). */
export function cargoBerth(port: PortDef): BerthDef | null {
  return port.cargo.berth ? (berthWithId(`${port.id}-cargo`) ?? null) : null;
}

/** Needs both hands to lift. */
export function isHeavy(item: CargoItem): boolean {
  return item.mass > CONFIG.cargo.twoHandKg;
}

/** Plan footprint of an item (half sizes across and along, in its own axes). */
export function footprint(item: CargoItem): DeckFootprint {
  const [sx, , sz] = kindOf(item).size;
  return { hx: sx / 2, hz: sz / 2 };
}

/** Which side of a port's goods row its further rows go (+1 / -1: the side with higher ground, away from the water). */
const ROW_SIDE = new Map<string, number>();
function rowSide(port: PortDef): number {
  let side = ROW_SIDE.get(port.id);
  if (side !== undefined) return side;
  const s = port.cargo;
  const yaw = (s.stackYawDeg * Math.PI) / 180;
  const gap = CONFIG.cargo.stackRowGap * 2;
  const h = (k: number) => standingHeight(s.stackX + Math.cos(yaw) * gap * k, s.stackZ + Math.sin(yaw) * gap * k);
  side = h(1) >= h(-1) ? 1 : -1;
  ROW_SIDE.set(port.id, side);
  return side;
}

/**
 * World position of place `i` in a port's goods stack (on the quay or beach): rows of
 * `stackRow` along the row's line, each further row `stackRowGap` back from the water.
 */
export function stackPoint(port: PortDef, i: number): Vec3 {
  const c = CONFIG.cargo;
  const s = port.cargo;
  const yaw = (s.stackYawDeg * Math.PI) / 180;
  const along = (i % c.stackRow) * c.stackSpacing;
  const back = Math.floor(i / c.stackRow) * c.stackRowGap * rowSide(port);
  const x = s.stackX + Math.sin(yaw) * along + Math.cos(yaw) * back;
  const z = s.stackZ - Math.cos(yaw) * along + Math.sin(yaw) * back;
  return [x, standingHeight(x, z), z];
}

/**
 * World position of place `i` of a port's crane cargo (CONFIG.cargo.crane): along its cargo
 * berth's quay edge, `edgeIn` in from it, `spacing` apart, centred on the berth. Null with
 * no cargo berth.
 */
export function craneStackPoint(port: PortDef, i: number): Vec3 | null {
  const b = cargoBerth(port);
  if (!b) return null;
  const c = CONFIG.cargo.crane;
  const h = (b.headingDeg * Math.PI) / 180;
  // From the berth's middle outward, either way in turn: 0, +1, -1, +2, -2 ...
  const along = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * c.spacing;
  const inn = b.shoreDist + c.edgeIn;
  const x = b.x + b.shoreX * inn + Math.sin(h) * along;
  const z = b.z + b.shoreZ * inn - Math.cos(h) * along;
  return [x, standingHeight(x, z), z];
}

/** The port whose goods area (x, z) is in, if any: by its goods stack, or along its cargo berth's quay (crane cargo). */
export function portAtPoint(x: number, z: number): PortDef | null {
  const r = CONFIG.cargo.deliveryRadius;
  for (const p of PORTS) if (Math.hypot(x - p.cargo.stackX, z - p.cargo.stackZ) < r) return p;
  for (const p of PORTS) {
    const b = cargoBerth(p);
    if (b && Math.hypot(x - (b.x + b.shoreX * (b.shoreDist + CONFIG.cargo.crane.edgeIn)), z - (b.z + b.shoreZ * (b.shoreDist + CONFIG.cargo.crane.edgeIn))) < r) return p;
  }
  return null;
}

/** By the pot pallet (potting): the harbour it's in, or null. */
function potQuayAt(x: number, z: number): PortDef | null {
  const { x: px, z: pz } = CONFIG.potting.pallet;
  if (Math.hypot(x - px, z - pz) > CONFIG.cargo.deliveryRadius) return null;
  return PORTS.reduce((a, b) => (Math.hypot(a.x - px, a.z - pz) <= Math.hypot(b.x - px, b.z - pz) ? a : b));
}

/**
 * How many items wait at each port (port id -> count), hand or crane cargo, in one pass over
 * the cargo (review, Oct 2026: counting port by port for every new item made filling the
 * Clyde's 56 ports freeze the start for ~25 s).
 */
function waitingCounts(world: WorldState, crane: boolean): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of Object.values(world.cargo)) {
    if (c.from === 'pots' || isProjectItem(c) || craneOnly(c) !== crane || !('ground' in c.at)) continue;
    const p = portAtPoint(c.at.ground[0], c.at.ground[2]);
    if (p) m.set(p.id, (m.get(p.id) ?? 0) + 1);
  }
  return m;
}

/** Items set down within `r` m of a point (to find a free place among them). */
function groundNear(world: WorldState, x: number, z: number, r: number): Vec3[] {
  const out: Vec3[] = [];
  for (const c of Object.values(world.cargo)) if ('ground' in c.at && Math.abs(c.at.ground[0] - x) < r && Math.abs(c.at.ground[2] - z) < r) out.push(c.at.ground);
  return out;
}

export function waitingAt(world: WorldState, port: PortDef, crane = false): CargoItem[] {
  return Object.values(world.cargo).filter((c) => c.from !== 'pots' && !isProjectItem(c) && craneOnly(c) === crane && 'ground' in c.at && portAtPoint(c.at.ground[0], c.at.ground[2])?.id === port.id);
}

export function aboard(world: WorldState, vesselId: EntityId): CargoItem[] {
  return Object.values(world.cargo)
    .filter((c) => 'vessel' in c.at && c.at.vessel === vesselId)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Items a player is carrying. */
export function carriedBy(world: WorldState, playerId: EntityId): CargoItem[] {
  return Object.values(world.cargo).filter((c) => 'carriedBy' in c.at && c.at.carriedBy === playerId);
}

/**
 * Add one new item at the port with the fewest waiting (if any port has room). `tally`: the
 * waiting counts, kept up to date by the caller while filling many (stockPorts).
 */
export function spawnCargo(world: WorldState, tally?: Map<string, number>): CargoItem | null {
  const cfg = CONFIG.cargo;
  const waiting = tally ?? waitingCounts(world, false);
  const counts = PORTS.map((p) => waiting.get(p.id) ?? 0);
  const min = Math.min(...counts);
  if (min >= cfg.perPort) return null;
  // Among the emptiest ports, pick one by hash so it isn't always the first.
  const candidates = PORTS.filter((_, i) => counts[i] === min);
  const from = candidates[Math.floor(hash01(world.cargoSeq + 1) * candidates.length)];
  const item = makeCargoAt(world, from);
  if (tally && 'ground' in item.at) {
    const at = portAtPoint(item.at.ground[0], item.at.ground[2]);
    if (at) tally.set(at.id, (tally.get(at.id) ?? 0) + 1);
  }
  return item;
}

/**
 * One new item of hand cargo waiting at a port, in the first free place in its goods row: one
 * of the port's products (PortDef.economy.products), else any trade kind, bound for a port
 * that needs it (else one that takes anything, else any other). `prefer`: bound there
 * instead (a cargo contract's port: cargo/order.ts), if it isn't this one; `kindAsked`: that
 * kind instead (a plain crate, topping up a full load).
 */
export function makeCargoAt(world: WorldState, from: PortDef, prefer?: string, kindAsked?: number): CargoItem {
  const cfg = CONFIG.cargo;
  const n = ++world.cargoSeq;
  const products = (from.economy?.products ?? []).map((name) => cfg.kinds.findIndex((k) => k.name === name)).filter((i) => i >= 0 && i < cfg.tradeKinds);
  const kind = kindAsked ?? (products.length ? products[Math.floor(hash01(n + 0.25) * products.length)] : Math.floor(hash01(n + 0.25) * cfg.tradeKinds)); // trade cargo only (not pots)
  const kindName = cfg.kinds[kind].name;
  const others = PORTS.filter((p) => p.id !== from.id);
  const preferred = others.find((p) => p.id === prefer);
  const needing = others.filter((p) => p.economy?.needs?.includes(kindName));
  const takers = needing.length ? needing : others.filter((p) => !p.economy?.needs?.length);
  const pool = takers.length ? takers : others;
  const to = preferred ?? pool[Math.floor(hash01(n + 0.5) * pool.length)];
  const pos = freeStackSpot(world, from);
  const yaw = (from.cargo.stackYawDeg * Math.PI) / 180 + (hash01(n + 0.75) - 0.5) * 0.3;
  const item: CargoItem = { id: `cargo-${n}`, kind, mass: cfg.kinds[kind].mass, from: from.id, to: (to ?? from).id, at: { ground: pos, yaw } };
  world.cargo[item.id] = item;
  return item;
}

/**
 * Add one crane cargo item (CONFIG.cargo.crane) at the cargo-berth port with the fewest
 * waiting, bound for another, in the first free place along its berth's quay edge.
 */
export function spawnCraneCargo(world: WorldState, tally?: Map<string, number>): CargoItem | null {
  const c = CONFIG.cargo.crane;
  const quays = PORTS.filter((p) => cargoBerth(p));
  if (quays.length < 2 || !c.kinds.length) return null;
  const waiting = tally ?? waitingCounts(world, true);
  // The ports short of their crane cargo with room on the quay, the emptiest first.
  const open = quays.map((p) => ({ p, n: waiting.get(p.id) ?? 0 })).filter((o) => o.n < c.perPort && freeCraneSpot(world, o.p));
  if (!open.length) return null;
  const min = Math.min(...open.map((o) => o.n));
  const candidates = open.filter((o) => o.n === min).map((o) => o.p);
  const from = candidates[Math.floor(hash01(world.cargoSeq + 1) * candidates.length)];
  const item = makeCraneCargoAt(world, from);
  if (item && tally && 'ground' in item.at) {
    const at = portAtPoint(item.at.ground[0], item.at.ground[2]);
    if (at) tally.set(at.id, (tally.get(at.id) ?? 0) + 1);
  }
  return item;
}

/**
 * One crane cargo item waiting at a port with a cargo quay, in the first free place along its
 * quay edge, bound for another cargo quay (`prefer`: that one, if it has one). Null with no
 * cargo quay here, none elsewhere, or no room on the quay edge.
 */
export function makeCraneCargoAt(world: WorldState, from: PortDef, prefer?: string): CargoItem | null {
  const cfg = CONFIG.cargo;
  const c = cfg.crane;
  const b = cargoBerth(from);
  const others = PORTS.filter((p) => p.id !== from.id && cargoBerth(p));
  const pos = freeCraneSpot(world, from);
  if (!b || !others.length || !c.kinds.length || !pos) return null;
  const n = ++world.cargoSeq;
  const to = others.find((p) => p.id === prefer) ?? others[Math.floor(hash01(n + 0.5) * others.length)];
  const kind = cfg.kinds.findIndex((k) => k.name === c.kinds[Math.floor(hash01(n + 0.25) * c.kinds.length)]);
  if (kind < 0) return null;
  const item: CargoItem = { id: `cargo-${n}`, kind, mass: cfg.kinds[kind].mass, from: from.id, to: to.id, at: { ground: pos, yaw: (b.headingDeg * Math.PI) / 180 } };
  world.cargo[item.id] = item;
  return item;
}

/**
 * The first free place in a port's goods row (nothing within half a spacing of it), among the
 * items set down near its stack; the row's last place if none is free.
 */
export function freeStackSpot(world: WorldState, port: PortDef): Vec3 {
  const cfg = CONFIG.cargo;
  const first = stackPoint(port, 0);
  const near = groundNear(world, first[0], first[2], 250);
  let pos = first;
  for (let i = 0; i < Math.max(40, cfg.perPort * 3); i++) {
    pos = stackPoint(port, i);
    const p = pos;
    if (!near.some((g) => Math.hypot(g[0] - p[0], g[2] - p[2]) < cfg.stackSpacing * 0.6)) break;
  }
  return pos;
}

/** A free place along a port's cargo quay for crane cargo (clear of anything set down there), or null. */
export function freeCraneSpot(world: WorldState, port: PortDef): Vec3 | null {
  const c = CONFIG.cargo.crane;
  const b = cargoBerth(port);
  if (!b) return null;
  const near = groundNear(world, b.x, b.z, 150);
  for (let i = 0; i < c.perPort * 3; i++) {
    const p = craneStackPoint(port, i);
    if (p && p[1] > 0 && !near.some((g) => Math.hypot(g[0] - p[0], g[2] - p[2]) < c.spacing * 0.6)) return p;
  }
  return null;
}

/** Fill every port up to its quota: hand cargo at the goods stacks, crane cargo on the cargo quays. */
export function stockPorts(world: WorldState): void {
  // The counts taken once and kept up as items go down (not recounted per item).
  // (Capped, in case an item set down isn't counted as at its port: never a hung start.)
  const cap = PORTS.length * (CONFIG.cargo.perPort + CONFIG.cargo.crane.perPort) * 2 + 10;
  const hand = waitingCounts(world, false);
  for (let i = 0; i < cap && spawnCargo(world, hand); i++) {
    /* keep going */
  }
  const crane = waitingCounts(world, true);
  for (let i = 0; i < cap && spawnCraneCargo(world, crane); i++) {
    /* keep going */
  }
}

/**
 * An item is gone (delivered or lost): remove it and restock somewhere. Delivered, it's
 * paid (the career; `at`: the port it was set down at); lost overboard from a port's
 * stock, it's charged.
 */
function retire(world: WorldState, item: CargoItem, delivered: boolean, at?: string): void {
  // A pot isn't trade cargo: lost overboard, it's just a lost pot (no penalty, no new cargo).
  if (isPot(item)) return potLost(world, item);
  // Nor a construction project's mark buoy: lost, another is put on the quay (career/projects.ts).
  if (isProjectItem(item)) return projectItemLost(world, item);
  delete world.cargo[item.id];
  if (delivered) world.deliveries += 1;
  // A box of fish from the trawl, landed (fishing/fishing.ts).
  if (delivered && item.from === 'trawl' && world.fishing) world.fishing.landed += 1;
  if (delivered && item.salvage) earn(world, 'salvage', { base: item.salvage.value, port: at, text: `Salvage sold at ${portName(at)}: ${item.salvage.name}` });
  else if (delivered && item.from === 'trawl') earn(world, 'fish', { port: at, text: `Fish landed at ${portName(at)}` });
  else if (delivered && item.to === 'any') earn(world, 'crate', { port: at, text: `Lost cargo brought in to ${portName(at)}` });
  else if (delivered) earn(world, 'cargo', { port: item.to, from: item.from, what: kindOf(item)?.name, text: `Cargo ${portName(item.from)} → ${portName(item.to)}` });
  else {
    world.lost = (world.lost ?? 0) + 1;
    cargoLost(world, item.from);
  }
  // (Goods on order, CONFIG.cargo.onDemand: nothing new appears; you order more at a cargo screen.)
  if (CONFIG.cargo.onDemand) return;
  if (craneOnly(item)) spawnCraneCargo(world);
  else spawnCargo(world);
}

/** The anchorage port whose bay the vessel is anchored in (anchor set, nearly stopped). */
export function anchoredAt(v: VesselState): PortDef | null {
  const speed = Math.hypot(v.linearVelocity[0], v.linearVelocity[2]);
  for (const p of PORTS) {
    const a = p.cargo.anchorage;
    if (a && v.anchor.phase === 'set' && speed < CONFIG.cargo.maxSpeed && Math.hypot(v.anchor.x - a.x, v.anchor.z - a.z) < a.radius) return p;
  }
  return null;
}

/** The port the vessel is at (alongside its berth, or anchored in its bay), for the menu. */
export function cargoPortAt(v: VesselState): PortDef | null {
  const anchored = anchoredAt(v);
  if (anchored) return anchored;
  // Landed on a port's slipway (world/slipway.ts): in that port.
  const slip = v.slip?.phase === 'landed' ? SLIPWAYS.find((s) => s.id === v.slip!.id) : undefined;
  if (slip) return PORTS.find((p) => p.id === slip.portId) ?? null;
  for (const p of PORTS) {
    const b = p.cargo.berth;
    if (b && Math.hypot(v.position[0] - b.x, v.position[2] - b.z) < b.radius) return p;
  }
  return null;
}

export function payloadMass(world: WorldState, vesselId: EntityId): number {
  return aboard(world, vesselId).reduce((s, c) => s + c.mass, 0);
}

/** Cargo slots in use aboard a vessel (CONFIG.cargo.kinds[].slots). */
export function slotsUsed(world: WorldState, vesselId: EntityId): number {
  return aboard(world, vesselId).reduce((n, c) => n + kindOf(c).slots, 0);
}

/** Why an item can't be set down aboard this vessel (payload or slot limit), or null. */
export function placeBlocker(world: WorldState, v: VesselState, item: CargoItem): string | null {
  const c = VESSEL_DEFS[v.defId].cargo;
  const others = aboard(world, v.id).filter((o) => o.id !== item.id);
  if (others.reduce((m, o) => m + o.mass, 0) + item.mass > c.maxPayloadKg) return `Over her ${c.maxPayloadKg} kg payload`;
  if (c.slots > 0 && others.reduce((n, o) => n + kindOf(o).slots, 0) + kindOf(item).slots > c.slots) {
    return `She's full: ${c.slots === 2 ? 'two crates or one drum' : `${c.slots} slots`} at a time`;
  }
  return null;
}

/** Why a player can't pick an item up, or null. `world`: to see what's stacked on it (only the top of a stack comes off). */
export function takeBlocker(item: CargoItem, world?: WorldState): string | null {
  if ('carriedBy' in item.at) return 'Someone has it';
  if (world && restingOn(world, item)) return 'Take the one on top first';
  if ('hook' in item.at) return 'It\'s on the crane hook';
  if ('vessel' in item.at && item.at.lashed) return 'Lashed down: undo the lashing first';
  if (craneOnly(item)) return `${kindOf(item).name}, ${item.mass} kg: too heavy to carry. Lift it with a deck crane`;
  return null;
}

export function deckDisc(c: CargoItem): { x: number; z: number; r: number } {
  const at = c.at as Extract<CargoAt, { vessel: string }>;
  const f = footprint(c);
  return { x: at.pos[0], z: at.pos[2], r: Math.max(f.hx, f.hz) };
}

/**
 * Can an item on her deck be lashed where it stands? Anywhere on open deck (owner, Oct 2026:
 * no D-rings to find): clear of her houses, the gear on deck and her bulwarks, as it is
 * wherever cargo can be set down (cargo/deck.ts onOpenDeck).
 */
export function canLash(v: VesselState, item: CargoItem): boolean {
  if (!('vessel' in item.at) || item.at.vessel !== v.id) return false;
  return onOpenDeck(v.defId, footprint(item), item.at.pos[0], item.at.pos[2]);
}

/**
 * Cargo intents. targetId: the vessel (or GROUND for 'cargoPlace' ashore); ref: the item.
 *   cargoTake               pick it up (if free and not lashed)
 *   cargoPlace  args [x, y, z, yaw]   set it down there, in the vessel's axes or the world
 *   cargoLash   value 1/0   strap down / release (where it stands on open deck)
 * The quick jobs ('cargoQuick...', below) and the cargo screen's orders ('cargoOrder...',
 * cargo/order.ts) are handled first.
 */
export function applyCargoIntent(world: WorldState, intent: Intent): void {
  if (applyQuickIntent(world, intent) || applyOrderIntent(world, intent)) return;
  const item = intent.ref ? world.cargo[intent.ref] : undefined;
  if (!item) return;
  const v = world.vessels[intent.targetId];
  switch (intent.control) {
    case 'cargoTake':
      if (!takeBlocker(item, world)) item.at = { carriedBy: intent.playerId };
      break;
    case 'cargoPlace': {
      if (!('carriedBy' in item.at) || item.at.carriedBy !== intent.playerId) break;
      const [x = 0, y = 0, z = 0, yaw = 0] = intent.args ?? [];
      if (v) {
        if (placeBlocker(world, v, item)) break; // full: you keep holding it
        // Over a stack of its kind with room (a pot on the pots): on top of it (cargo/stack.ts).
        const top = stackTopNear(world, item, { vessel: v.id }, x, z);
        if (top) {
          setOnTop(item, top);
          break;
        }
        const others = aboard(world, v.id).map(deckDisc);
        const spot = onOpenDeck(v.defId, footprint(item), x, z) && !others.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 0.2)
          ? { x, z, y: 0 }
          : deckSpot(v.defId, footprint(item), x, z, others);
        if (!spot) break; // nowhere to put it: you keep holding it
        const deckY = deckHeight(v.defId, spot.z);
        item.at = { vessel: v.id, pos: [spot.x, deckY, spot.z], yaw, vel: [0, 0], lashed: false };
        break;
      }
      const g = standingHeight(x, z);
      if (isPot(item) && g < -0.3) {
        shootPot(world, item, x, z); // a pot over the side: shot, its buoy pops up
        break;
      }
      if (g < -0.3 || y < g - 1) {
        retire(world, item, false); // into the sea
        break;
      }
      // Over a stack of its kind ashore: on top of it (then sold or delivered as anywhere there).
      const top = stackTopNear(world, item, 'ground', x, z);
      if (top && 'ground' in top.at) landAshore(world, item, top.at.ground[0], top.at.ground[1] + kindOf(top).size[1], top.at.ground[2], top.at.yaw, top.id);
      else landAshore(world, item, x, g, z, yaw);
      break;
    }
    case 'cargoLash': {
      // A stack is strapped as one: by its bottom item (the rest ride on it: cargo/stack.ts).
      const base = bottomOf(world, item);
      if (v && 'vessel' in base.at && base.at.vessel === v.id) {
        if (intent.value > 0.5 && canLash(v, base)) {
          base.at.lashed = true;
          base.at.vel = [0, 0];
        } else if (intent.value <= 0.5) {
          base.at.lashed = false;
        }
      }
      break;
    }
  }
}

/** Set an item down ashore (by hand or by a deck crane): a pot's catch sold, or cargo delivered. */
function landAshore(world: WorldState, item: CargoItem, x: number, g: number, z: number, yaw: number, on?: string): void {
  item.at = on ? { ground: [x, g, z], yaw, on } : { ground: [x, g, z], yaw };
  const port = portAtPoint(x, z);
  // A pot set down on a harbour quay (by a goods stack, or back by the pot pallet): the
  // fish buyer takes its catch (the bycatch is thrown away) and the pot stays there,
  // empty, for you to take back aboard.
  const buyer = isPot(item) && item.pot ? (port ?? potQuayAt(x, z)) : null;
  if (buyer) {
    sellPotCatch(world, item, buyer.id);
    return;
  }
  // Delivered: at its port, or anywhere for cargo fished out of the sea (to 'any').
  if (port && (port.id === item.to || item.to === 'any')) retire(world, item, true, port.id);
}

// ── The deck crane's hook ─────────────────────────────────────────────────────────────

const qh = new THREE.Quaternion();
/** A point in a vessel's axes, in the world. */
function onWorld(v: VesselState, local: THREE.Vector3): THREE.Vector3 {
  return local.clone().applyQuaternion(qh.fromArray(v.orientation)).add(new THREE.Vector3().fromArray(v.position));
}

/** Where an item's lifting point (the middle of its top) is in the world, or null if it can't be lifted (in hands, on a hook, lashed). */
function liftPoint(world: WorldState, c: CargoItem): THREE.Vector3 | null {
  // Only the top of a stack can be lifted.
  if (restingOn(world, c)) return null;
  const h = kindOf(c).size[1];
  if ('ground' in c.at) return new THREE.Vector3(c.at.ground[0], c.at.ground[1] + h, c.at.ground[2]);
  if ('vessel' in c.at && !c.at.lashed) {
    const v = world.vessels[c.at.vessel];
    return v ? onWorld(v, new THREE.Vector3(c.at.pos[0], c.at.pos[1] + h, c.at.pos[2])) : null;
  }
  return null;
}

/** How far above the surface under it a load may be set down from (m), and how far into it (the hook lowered a little too far). */
const SET_DOWN_ABOVE = 0.8;
const SET_DOWN_BELOW = 0.4;

/**
 * The deck cranes' HOOK presses, after the boats' machinery has run (its sim marks a press,
 * `press`). An empty hook takes the nearest free item whose top is within reach of it and
 * within the crane's safe working load; a loaded hook sets its item down on what's under
 * it, if it's been lowered close enough: her own deck (room and payload allowing), the
 * quay or the shore (delivered at its port), or the sea (lost; a pot is shot). Too high, or
 * no room: it stays on the hook.
 */
export function stepCraneCargo(world: WorldState, dt: number): void {
  for (const v of Object.values(world.vessels)) {
    for (const crane of cranesOf(v)) {
      const s = craneStateOf(v, crane.path);
      if (!s) continue;
      // Motion compensation (an upgrade): her averaged height, and where it holds the hook.
      // It needs the deck hydraulics; without them the hook hangs where the boom leaves it.
      const y = v.position[1];
      s.refY = s.refY === null || s.refY === undefined ? y : s.refY + (y - s.refY) * Math.min(1, dt / crane.config.motionComp.settleS);
      s.hookAt = hasUpgrade(world, 'craneComp') && hydraulicsOn(v) ? compensatedHook(v, crane, s) : null;
      // Its load gone some other way: the hook is free.
      const load = s.hooked ? world.cargo[s.hooked] : undefined;
      if (s.hooked && !(load && 'hook' in load.at)) s.hooked = null;
      // What's on the hook, for its load-moment limiter.
      s.loadKg = s.hooked && load ? load.mass : 0;
      if (!s.press) continue;
      s.press = false;
      const hook = hookOnBoat(v, crane.path);
      if (!hook) continue;
      if (load && s.hooked) {
        if (setDown(world, v, load, hook)) [s.hooked, s.loadKg] = [null, 0];
        continue;
      }
      const hookW = onWorld(v, hook);
      let best: CargoItem | null = null;
      let bestD = crane.config.hookReach;
      // No heavier than it may lift this far out (the boom run out lifts less).
      const canLift = safeLoadAt(crane.config, { luff: s.luff, extend: s.extend ?? 0 });
      for (const c of Object.values(world.cargo)) {
        if (c.mass > canLift) continue;
        const p = liftPoint(world, c);
        const d = p ? p.distanceTo(hookW) : Infinity;
        if (d < bestD) [best, bestD] = [c, d];
      }
      if (best) {
        best.at = { hook: v.id, crane: crane.path };
        s.hooked = best.id;
        s.loadKg = best.mass;
      }
    }
  }
}

/**
 * Why a HOOK press now wouldn't set her cranes' load down, in a few words for whoever pressed
 * (the App shows it on their screen; owner, Oct 2026: "the button to drop them off didn't
 * work", the buoy hanging over the side too high above the water), or null: it would (or
 * there's no load). The same rules as setDown, read only. A project buoy at the water but off
 * its spot is the office's to say (layProjectBuoy).
 */
export function hookNote(world: WorldState, v: VesselState): string | null {
  for (const crane of cranesOf(v)) {
    const s = craneStateOf(v, crane.path);
    const item = s?.hooked ? world.cargo[s.hooked] : undefined;
    const hook = item ? hookOnBoat(v, crane.path) : null;
    if (!item || !hook) continue;
    const base = hook.clone().setY(hook.y - kindOf(item).size[1]);
    const m = (x: number) => `${Math.max(0.1, x).toFixed(1)} m`;
    const spot = deckLanding(world, v, item, base);
    if (spot !== undefined) {
      if (!spot) return 'No room on deck there: move the hook over a clear part of the deck';
      const gap = base.y - deckHeight(v.defId, spot.z);
      if (gap > SET_DOWN_ABOVE) return `Lower it onto the deck: ${m(gap - SET_DOWN_ABOVE)} to go (hoist down)`;
      if (gap < -SET_DOWN_BELOW) return 'Too low: hoist it up a little';
      const full = placeBlocker(world, v, item);
      if (full) return full;
      continue;
    }
    const w = onWorld(v, base);
    const g = standingHeight(w.x, w.z);
    if (g > -0.3) {
      if (w.y - g > SET_DOWN_ABOVE) return `Lower it to the ground: ${m(w.y - g - SET_DOWN_ABOVE)} to go (hoist down)`;
      continue;
    }
    if (w.y > SET_DOWN_ABOVE) return `Lower it right down to the water first: ${m(w.y - SET_DOWN_ABOVE)} to go (hoist down)`;
  }
  return null;
}

/** How far from under the hook a load lowered over her deck may be set down, at the nearest clear spot (m). */
const DECK_NUDGE = 1.2;

/**
 * Where on her deck a load lowered at `base` (her axes) goes: under the hook if it fits there,
 * else the nearest clear spot within DECK_NUDGE (owner, Oct 2026: a 1.1 m buoy lowered over a
 * small working deck, a little off a clear patch, was taken for over the side). Null: over
 * her but no room near; undefined: not over her at all.
 */
function deckLanding(world: WorldState, v: VesselState, item: CargoItem, base: THREE.Vector3): { x: number; z: number } | null | undefined {
  const f = footprint(item);
  if (!overDeck(v.defId, base.x, base.z) && !onOpenDeck(v.defId, f, base.x, base.z)) return undefined;
  const spot = deckSpot(v.defId, f, base.x, base.z, aboard(world, v.id).filter((o) => o.id !== item.id).map(deckDisc));
  return spot && Math.hypot(spot.x - base.x, spot.z - base.z) <= DECK_NUDGE ? spot : null;
}

/** Set a hooked item down under the hook (`hook`: in her axes). False: it stays on the hook. */
function setDown(world: WorldState, v: VesselState, item: CargoItem, hook: THREE.Vector3): boolean {
  const h = kindOf(item).size[1];
  const base = hook.clone().setY(hook.y - h);
  // Her own deck: under the hook, or the nearest clear spot to it.
  const spot = deckLanding(world, v, item, base);
  if (spot !== undefined) {
    if (!spot) return false;
    const deckY = deckHeight(v.defId, spot.z);
    const gap = base.y - deckY;
    if (gap > SET_DOWN_ABOVE || gap < -SET_DOWN_BELOW || placeBlocker(world, v, item)) return false;
    item.at = { vessel: v.id, pos: [spot.x, deckY, spot.z], yaw: 0, vel: [0, 0], lashed: false };
    return true;
  }
  // Over the side: the quay or shore, or the sea.
  const w = onWorld(v, base);
  const g = standingHeight(w.x, w.z);
  if (g > -0.3) {
    const gap = w.y - g;
    if (gap > SET_DOWN_ABOVE || gap < -SET_DOWN_BELOW) return false;
    landAshore(world, item, w.x, g, w.z, 0);
    return true;
  }
  if (w.y > SET_DOWN_ABOVE) return false; // not down to the water yet
  // A project's mark buoy: laid if it's at its spot, else it stays on the hook (career/projects.ts).
  if (isProjectItem(item)) return layProjectBuoy(world, item, w.x, w.z);
  if (isPot(item)) shootPot(world, item, w.x, w.z);
  else retire(world, item, false);
  return true;
}

/**
 * A player left (or the game ended for them) with something in hand: it's set down where
 * they stood - on the deck if aboard, ashore if on land, lost if they were swimming.
 */
export function dropCarried(world: WorldState, playerId: EntityId): void {
  const p = world.players[playerId];
  for (const c of carriedBy(world, playerId)) {
    const v = p?.aboardVesselId ? world.vessels[p.aboardVesselId] : undefined;
    if (p && v) {
      const spot = deckSpot(v.defId, footprint(c), p.position[0], p.position[2], aboard(world, v.id).map(deckDisc));
      if (spot) {
        c.at = { vessel: v.id, pos: [spot.x, deckHeight(v.defId, spot.z), spot.z], yaw: 0, vel: [0, 0], lashed: false };
        continue;
      }
    }
    const g = p ? standingHeight(p.position[0], p.position[2]) : -1;
    if (p && !v && g > -0.3) c.at = { ground: [p.position[0], g, p.position[2]], yaw: 0 };
    else retire(world, c, false);
  }
}

/** A pot's catch sold to the fish buyer at a port (bycatch thrown away); the pot is kept, empty. */
export function sellPotCatch(world: WorldState, item: CargoItem, portId: string): void {
  if (!item.pot) return;
  const { crab, lobster } = item.pot;
  if (crab || lobster) earn(world, 'catch', { port: portId, crab, lobster, text: `${catchText(crab, lobster)} sold at ${portName(portId)}` });
  item.pot = { ...item.pot, crab: 0, lobster: 0, bycatch: null };
}

// ── Quick jobs ──
//
// Every crate and pot job can be done by hand (carried, lashed, set down), or in one click
// from the menu (owner: quick for those who want it, and the way a phone version would
// play). The quick versions follow the same rules - the boat has to be at the port, the
// deck has to have room, the payload limit holds - they just skip the walking.

/** The port a vessel can work cargo at right now: alongside its berth or anchored in its bay, nearly stopped. */
export function quickPort(v: VesselState): PortDef | null {
  if (Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) > CONFIG.cargo.maxSpeed) return null;
  return cargoPortAt(v);
}

/** Items in the order they were made (their ids by number: cargo-9 before cargo-10). */
export function byNumber(a: CargoItem, b: CargoItem): number {
  return a.id.localeCompare(b.id, 'en', { numeric: true });
}

/** Items waiting at the port she's at that could be loaded (bound somewhere else). */
export function quickLoadable(world: WorldState, v: VesselState): CargoItem[] {
  const port = quickPort(v);
  if (!port) return [];
  // (Oldest first, by number: cargo-9 before cargo-10, so goods ordered later go on last.)
  return waitingAt(world, port)
    .filter((c) => c.to !== port.id)
    .sort(byNumber);
}

/** Items aboard that would be landed here (bound for this port, or any harbour), and pots with a catch to sell. */
export function quickUnloadable(world: WorldState, v: VesselState): CargoItem[] {
  const port = quickPort(v);
  if (!port) return [];
  return aboard(world, v.id).filter((c) => (isPot(c) ? !!(c.pot && (c.pot.crab || c.pot.lobster || c.pot.bycatch)) : c.to === port.id || c.to === 'any'));
}

/**
 * Put an item on a vessel's deck in the first free spot near (x, z) (vessel axes), lashed
 * where it stands. False if it won't go (payload, slots, or no room).
 */
export function stowOnDeck(world: WorldState, v: VesselState, item: CargoItem, x: number, z: number): boolean {
  if (placeBlocker(world, v, item)) return false;
  // A pot: on a stack of pots aboard with room first (cargo/stack.ts), else on the deck.
  const top = stackWithRoom(world, item, v.id, x, z);
  if (top) {
    setOnTop(item, top);
    return true;
  }
  const spot = deckSpot(v.defId, footprint(item), x, z, aboard(world, v.id).filter((o) => o.id !== item.id).map(deckDisc));
  if (!spot) return false;
  item.at = { vessel: v.id, pos: [spot.x, deckHeight(v.defId, spot.z), spot.z], yaw: 0, vel: [0, 0], lashed: false };
  if (canLash(v, item)) item.at.lashed = true;
  return true;
}

/** Where quick-loaded cargo goes: the middle of the aft working deck. */
export function quickDeckPoint(v: VesselState): [number, number] {
  return [0, hullPlan(VESSEL_DEFS[v.defId]).transom - 1.2];
}

/**
 * Quick cargo intents (targetId: the vessel):
 *   cargoQuickLoad    everything waiting at this port for elsewhere that fits, onto the deck, lashed
 *   cargoQuickUnload  everything aboard for this port (or any harbour) landed; pots' catch sold
 *   cargoQuickLash    value 1: lash everything on deck that has a D-ring in reach; 0: release all
 */
function applyQuickIntent(world: WorldState, intent: Intent): boolean {
  if (!intent.control.startsWith('cargoQuick')) return false;
  const v = world.vessels[intent.targetId];
  if (!v) return true;
  const port = quickPort(v);
  if (intent.control === 'cargoQuickLoad' && port) {
    const [x, z] = quickDeckPoint(v);
    for (const c of quickLoadable(world, v)) if (!stowOnDeck(world, v, c, x, z)) break;
  } else if (intent.control === 'cargoQuickUnload' && port) {
    for (const c of quickUnloadable(world, v)) {
      if (isPot(c)) sellPotCatch(world, c, port.id);
      else retire(world, c, true, port.id);
    }
  } else if (intent.control === 'cargoQuickLash') {
    for (const c of aboard(world, v.id)) {
      if (!('vessel' in c.at)) continue;
      if (intent.value > 0.5 && canLash(v, c)) {
        c.at.lashed = true;
        c.at.vel = [0, 0];
      } else if (intent.value <= 0.5) c.at.lashed = false;
    }
  }
  return true;
}

/** Is this one of the cargo intents? */
export function isCargoIntent(control: string): boolean {
  return control.startsWith('cargo');
}

/** Deck height (vessel axes) at a station's z, from the hull's deck line. */
export function deckHeightAt(defId: string, z: number): number {
  return deckHeight(defId, z);
}

function deckHeight(defId: string, z: number): number {
  const st = VESSEL_DEFS[defId].hull.stations;
  if (z >= st[0].z) return st[0].polygon[0][1];
  for (let i = 0; i < st.length - 1; i++) {
    if (z <= st[i].z && z >= st[i + 1].z) {
      const t = (st[i].z - z) / (st[i].z - st[i + 1].z);
      return st[i].polygon[0][1] + (st[i + 1].polygon[0][1] - st[i].polygon[0][1]) * t;
    }
  }
  return st[st.length - 1].polygon[0][1];
}

// ── Deck cargo dynamics ───────────────────────────────────────────────────────────────

const qv = new THREE.Quaternion();
const qInv = new THREE.Quaternion();
const r = new THREE.Vector3();
const w = new THREE.Vector3();
const vp = new THREE.Vector3();
const gApp = new THREE.Vector3();

/** World velocity of a point fixed to the vessel (vessel axes `local`): v + ω × r. */
function pointVelocity(v: VesselState, local: Vec3, out: THREE.Vector3): THREE.Vector3 {
  qv.fromArray(v.orientation);
  r.fromArray(local).applyQuaternion(qv);
  w.fromArray(v.angularVelocity);
  return out.fromArray(v.linearVelocity).add(w.cross(r));
}

/** Deck-point velocities of the loose items aboard, taken before the vessel's tick. */
export function deckVelocitiesBefore(world: WorldState, v: VesselState): Map<EntityId, THREE.Vector3> {
  const out = new Map<EntityId, THREE.Vector3>();
  for (const c of aboard(world, v.id)) {
    if ('vessel' in c.at && !c.at.lashed) out.set(c.id, pointVelocity(v, c.at.pos, new THREE.Vector3()));
  }
  return out;
}

/**
 * Slide the loose cargo on a vessel's deck for one tick (after the vessel has moved).
 *
 * The moving-frame part: a crate on deck feels apparent gravity g_app = g − a_P, where a_P
 * is the acceleration of the deck point under it (finite difference of v + ω×r over the
 * tick, so it includes heave, surge, roll and pitch accelerations and the centripetal
 * term). Expressed in the vessel's axes, its component normal to the deck presses the crate
 * down (N per kg), the components along the deck push it sideways. Coulomb friction: it
 * stays stuck while |along| ≤ μN, otherwise slides with a = along − μN·û. (Coriolis on the
 * slow sliding speed is negligible and left out.) Crates bump each other (discs), stop at
 * the bulwarks and the wheelhouse, and go over the rail if pressed against it hard.
 */
export function stepDeckCargo(world: WorldState, v: VesselState, before: Map<EntityId, THREE.Vector3>, dt: number): void {
  if (VESSEL_DEFS[v.defId].cargo.fixed) return; // wedged in her bottom (the skiff)
  const cfg = CONFIG.cargo;
  const g = CONFIG.ocean.gravity;
  qInv.fromArray(v.orientation).invert();
  const items = aboard(world, v.id);
  for (const c of items) {
    const at = c.at as Extract<CargoAt, { vessel: string }>;
    const v0 = before.get(c.id);
    // (What's stacked on another rides on it: cargo/stack.ts followStacks.)
    if (at.lashed || !v0 || at.on) continue;
    pointVelocity(v, at.pos, vp);
    // Apparent gravity in vessel axes: g_app = g − a_P, clipped against contact spikes.
    gApp.copy(vp).sub(v0).divideScalar(dt).negate();
    gApp.y -= g;
    if (gApp.length() > cfg.maxDeckG * g) gApp.setLength(cfg.maxDeckG * g);
    gApp.applyQuaternion(qInv);
    const N = Math.max(0, -gApp.y); // pressing into the deck (m/s² per kg)
    const ax = gApp.x;
    const az = gApp.z;
    let [ux, uz] = at.vel;
    const speed = Math.hypot(ux, uz);
    const mu = cfg.friction * N;
    if (speed < 0.01 && Math.hypot(ax, az) <= mu) {
      ux = 0;
      uz = 0; // stuck
    } else {
      // Kinetic friction opposes the sliding direction (or the push, from rest).
      const dx = speed > 0.01 ? ux / speed : ax / Math.hypot(ax, az);
      const dz = speed > 0.01 ? uz / speed : az / Math.hypot(ax, az);
      ux += (ax - mu * dx) * dt;
      uz += (az - mu * dz) * dt;
      // Friction can stop it but not reverse it within a tick.
      if (speed > 0.01 && ux * dx + uz * dz < 0) {
        ux = 0;
        uz = 0;
      }
    }
    const f = footprint(c);
    let nx = at.pos[0] + ux * dt;
    let nz = at.pos[2] + uz * dt;
    if (!onOpenDeck(v.defId, f, nx, at.pos[2])) {
      // Against a bulwark or the wheelhouse athwartships. Pressed outboard hard enough, it
      // goes over the rail.
      const outboard = Math.sign(at.pos[0]) === Math.sign(ax) && Math.abs(at.pos[0]) > 0.8;
      if (outboard && Math.abs(ax) > cfg.overboardG * g) {
        retire(world, c, false);
        continue;
      }
      nx = at.pos[0];
      ux = 0;
    }
    if (!onOpenDeck(v.defId, f, nx, nz)) {
      // Fore-and-aft: the transom bulwark, or the wheelhouse front/back.
      const aft = uz > 0 && at.pos[2] > 2;
      if (aft && az > cfg.overboardG * g) {
        retire(world, c, false);
        continue;
      }
      nz = at.pos[2];
      uz = 0;
    }
    at.pos = [nx, deckHeight(v.defId, nz), nz];
    at.vel = [ux, uz];
  }
  // Crates bump each other: push overlapping discs apart (lashed ones don't move) and
  // share their closing speed (perfectly inelastic along the line between them).
  const loose = aboard(world, v.id).filter((c) => !isStackedUp(c));
  for (let i = 0; i < loose.length; i++) {
    for (let j = i + 1; j < loose.length; j++) {
      const a = loose[i].at as Extract<CargoAt, { vessel: string }>;
      const b = loose[j].at as Extract<CargoAt, { vessel: string }>;
      const ra = deckDisc(loose[i]).r * 0.9;
      const rb = deckDisc(loose[j]).r * 0.9;
      const dx = b.pos[0] - a.pos[0];
      const dz = b.pos[2] - a.pos[2];
      const d = Math.hypot(dx, dz);
      const overlap = ra + rb - d;
      if (overlap <= 0 || (a.lashed && b.lashed)) continue;
      const nx = d > 1e-6 ? dx / d : 1;
      const nz = d > 1e-6 ? dz / d : 0;
      const ia = a.lashed ? 0 : 1 / loose[i].mass;
      const ib = b.lashed ? 0 : 1 / loose[j].mass;
      const sum = ia + ib;
      const fa = loose[i];
      const fb = loose[j];
      const tryShift = (it: CargoItem, at: Extract<CargoAt, { vessel: string }>, s: number) => {
        const x = at.pos[0] + nx * s;
        const z = at.pos[2] + nz * s;
        if (onOpenDeck(v.defId, footprint(it), x, z)) at.pos = [x, deckHeight(v.defId, z), z];
      };
      tryShift(fa, a, (-overlap * ia) / sum);
      tryShift(fb, b, (overlap * ib) / sum);
      const vn = (b.vel[0] - a.vel[0]) * nx + (b.vel[1] - a.vel[1]) * nz;
      if (vn < 0) {
        a.vel = [a.vel[0] + ((vn * ia) / sum) * nx, a.vel[1] + ((vn * ia) / sum) * nz];
        b.vel = [b.vel[0] - ((vn * ib) / sum) * nx, b.vel[1] - ((vn * ib) / sum) * nz];
      }
    }
  }
}

/**
 * Cargo as point masses (vessel axes) for the physics: items on deck at their centres,
 * and items carried by players standing aboard, at about chest height.
 */
export function payloadOf(world: WorldState, vesselId: EntityId): { mass: number; pos: THREE.Vector3 }[] {
  const out: { mass: number; pos: THREE.Vector3 }[] = [];
  for (const c of Object.values(world.cargo)) {
    if ('vessel' in c.at && c.at.vessel === vesselId) {
      out.push({ mass: c.mass, pos: new THREE.Vector3(c.at.pos[0], c.at.pos[1] + kindOf(c).size[1] / 2, c.at.pos[2]) });
    } else if ('carriedBy' in c.at) {
      const p = world.players[c.at.carriedBy];
      if (p && p.aboardVesselId === vesselId) out.push({ mass: c.mass, pos: new THREE.Vector3(p.position[0], p.position[1] + 1.1, p.position[2]) });
    } else if ('hook' in c.at && c.at.hook === vesselId) {
      // On her crane's hook: its weight bears on her at the hook (it hangs from it).
      const v = world.vessels[vesselId];
      const hook = v && hookOnBoat(v, c.at.crane);
      if (hook) out.push({ mass: c.mass, pos: hook.setY(hook.y - kindOf(c).size[1] / 2) });
    }
  }
  // A log barge's load (voyage/timber.ts).
  for (const l of logPayload(world, vesselId)) out.push({ mass: l.mass, pos: new THREE.Vector3(...l.pos) });
  return out;
}

/** "2 lobsters, 3 crabs" / "empty". */
export function catchText(crab: number, lobster: number): string {
  const parts: string[] = [];
  if (lobster) parts.push(`${lobster} lobster${lobster > 1 ? 's' : ''}`);
  if (crab) parts.push(`${crab} crab${crab > 1 ? 's' : ''}`);
  return parts.join(', ') || 'empty';
}

export function cargoLabel(item: CargoItem): string {
  const k = kindOf(item);
  // A pot: no destination; you shoot it over the side on a potting ground.
  if (isPot(item)) {
    const p = item.pot;
    if (p && (p.crab || p.lobster)) return `Lobster pot: ${catchText(p.crab, p.lobster)}: set it down on a harbour quay to sell`;
    return `Lobster pot ${item.mass} kg, baited: shoot it over the side on a potting ground`;
  }
  if (isProjectBuoy(item)) return `${projectItemName(item)}, ${item.mass} kg: lift it with a deck crane and lower it into the sea at its spot (on your chartplotter)`;
  if (isProjectItem(item)) return `${projectItemName(item)}, ${item.mass} kg: take it out and lie alongside her (on your chartplotter)`;
  const to = item.to === 'any' ? 'any harbour' : portById(item.to)?.name.replace(' (anchorage)', '');
  if (item.salvage) return `Salvage: ${item.salvage.name} ${item.mass} kg (sells in any port)`;
  return `${k.name}${item.species ? ` (${item.species})` : ''} ${item.mass} kg → ${to}${craneOnly(item) ? ` (${CONFIG.cargo.crane.note})` : anchorageOnly(item.to) ? ` (${CONFIG.cargo.anchorageNote})` : ''}`;
}

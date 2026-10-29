/**
 * Goods on order (owner, 29 Oct 2026: "it doesn't make sense to have the cargo crates on the
 * side of the quay all the time ... a mini screen, which allows you to spawn cargo and lobster
 * pots ... it tells you how many slots of cargo your ship has, which is docked at it ... spawn
 * individually or the maximum amount, and the same with lobster pots").
 *
 * With CONFIG.cargo.onDemand the ports keep nothing waiting: each harbour has a cargo screen by
 * its goods row (ui/cargoTerminal.ts), and on it the crew order what they'll carry:
 *
 *   crates       hand cargo, one at a time or a full load (`cargoOrder`, args [0])
 *   crane lifts  crane cargo on the quay edge, at a harbour with a cargo quay (args [1])
 *   pots         lobster pots, up to CONFIG.potting.pots in play (args [2])
 *   send back    what was ordered here and is still on the quay goes away (`cargoOrderReturn`)
 *
 * A full load is what the boat lying there takes, counting what's already waiting for her on
 * the quay: her payload left, her slots left (a boat with a slot limit, like the skiff) and
 * room on her open deck. The deck room is a dry run of quick loading (the same deckSpot), so
 * "room for 6" means 6 really go aboard.
 *
 * Plain data, host-authoritative like the rest: the screen sends the intent, the host makes
 * the goods.
 */
import { CONFIG } from '../config';
import type { EntityId } from '../core/ids';
import type { Intent } from '../core/intents';
import type { WorldState } from '../core/world';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { LAMPS, PORTS, type PortDef } from '../world/archipelago';
import { standingHeight } from '../world/geography';
import { isProjectItem } from '../career/projects';
import { isPot, potKind, potsOwned } from '../potting/potting';
import {
  aboard,
  byNumber,
  cargoBerth,
  cargoPortAt,
  deckDisc,
  freeStackSpot,
  kindOf,
  makeCargoAt,
  makeCraneCargoAt,
  portAtPoint,
  quickDeckPoint,
  quickPort,
  stackPoint,
  waitingAt,
  type CargoItem,
} from './cargo';
import { deckSpot } from './deck';
import { cranesOf } from './craneHook';

/** What's on order: hand cargo (crates, sacks, drums), crane lifts, lobster pots. */
export type OrderWhat = 'crates' | 'crane' | 'pots';
export const ORDER_WHAT: readonly OrderWhat[] = ['crates', 'crane', 'pots'];

// ── Her room: payload, slots and open deck, as a dry run ──

/** What's left aboard her as goods go on (a dry run: nothing in the world moves). */
interface Room {
  defId: string;
  mass: number;
  slots: number;
  discs: { x: number; z: number; r: number }[];
  at: [number, number];
}

function roomOf(world: WorldState, v: VesselState): Room {
  const c = VESSEL_DEFS[v.defId].cargo;
  const on = aboard(world, v.id);
  return {
    defId: v.defId,
    mass: c.maxPayloadKg - on.reduce((m, o) => m + o.mass, 0),
    slots: c.slots > 0 ? c.slots - on.reduce((n, o) => n + kindOf(o).slots, 0) : Infinity,
    discs: on.filter((o) => 'vessel' in o.at).map(deckDisc),
    at: quickDeckPoint(v),
  };
}

/** An item of this kind goes aboard in the dry run (taking its room), or doesn't (nothing taken). */
function take(room: Room, kind: number): boolean {
  const k = CONFIG.cargo.kinds[kind];
  if (k.mass > room.mass || k.slots > room.slots) return false;
  const spot = deckSpot(room.defId, { hx: k.size[0] / 2, hz: k.size[2] / 2 }, room.at[0], room.at[1], room.discs);
  if (!spot) return false;
  room.mass -= k.mass;
  room.slots -= k.slots;
  room.discs.push({ x: spot.x, z: spot.z, r: Math.max(k.size[0], k.size[2]) / 2 });
  return true;
}

/** Goods waiting on this port's quay of a sort (ordered, not yet aboard): trade cargo bound elsewhere, crane lifts, or empty pots. */
export function waitingHere(world: WorldState, port: PortDef, what: OrderWhat): CargoItem[] {
  if (what === 'pots') return Object.values(world.cargo).filter((c) => isPot(c) && 'ground' in c.at && portAtPoint(c.at.ground[0], c.at.ground[2])?.id === port.id);
  return waitingAt(world, port, what === 'crane').filter((c) => c.to !== port.id);
}

/** What waits for her on the quay, in the order quick loading takes it (crates by id, then crane lifts, then pots). */
function waitingInOrder(world: WorldState, port: PortDef): CargoItem[] {
  return ORDER_WHAT.flatMap((what) => waitingHere(world, port, what).sort(byNumber));
}

/** Her room once everything waiting for her on the quay is aboard (what wouldn't go is left out). */
function roomAfterWaiting(world: WorldState, v: VesselState, port: PortDef): Room {
  const room = roomOf(world, v);
  for (const c of waitingInOrder(world, port)) take(room, c.kind);
  return room;
}

/** Does everything waiting for her on the quay go aboard her, packed as quick loading packs it? */
function allGoAboard(world: WorldState, v: VesselState, port: PortDef): boolean {
  const room = roomOf(world, v);
  return waitingInOrder(world, port).every((c) => take(room, c.kind));
}

/** The kind a sort is counted in on the screen: a crate, the heaviest crane lift, a pot. */
function shownKind(what: OrderWhat): number {
  const kinds = CONFIG.cargo.kinds;
  if (what === 'pots') return potKind();
  if (what === 'crane') {
    const names = CONFIG.cargo.crane.kinds;
    return kinds.reduce((best, k, i) => (names.includes(k.name) && (best < 0 || k.mass > kinds[best].mass) ? i : best), -1);
  }
  return kinds.findIndex((k) => k.name === 'Crate');
}

/** Can she take crane lifts at all: a deck crane aboard. */
export function hasCrane(v: VesselState): boolean {
  return cranesOf(v).length > 0;
}

/**
 * How many more of a sort she has room for, after what's already waiting for her on the quay
 * (crates counted as plain crates; crane lifts as the heaviest; pots as pots, no more than are
 * left to order). Counted up to `terminal.countTo`.
 */
export function roomFor(world: WorldState, v: VesselState, port: PortDef, what: OrderWhat): number {
  if (what === 'crane' && !hasCrane(v)) return 0;
  const room = roomAfterWaiting(world, v, port);
  const kind = shownKind(what);
  let n = 0;
  const most = what === 'pots' ? Math.max(0, CONFIG.potting.pots - potsOwned(world)) : CONFIG.cargo.terminal.countTo;
  while (n < most && kind >= 0 && take(room, kind)) n++;
  return n;
}

/** Her cargo capacity as the screen shows it: payload and slots (Infinity: no slot limit), each free and in all. */
export function capacityOf(world: WorldState, v: VesselState): { kg: number; kgFree: number; slots: number; slotsFree: number } {
  const c = VESSEL_DEFS[v.defId].cargo;
  const on = aboard(world, v.id);
  const used = on.reduce((n, o) => n + kindOf(o).slots, 0);
  return {
    kg: c.maxPayloadKg,
    kgFree: Math.max(0, c.maxPayloadKg - on.reduce((m, o) => m + o.mass, 0)),
    slots: c.slots > 0 ? c.slots : Infinity,
    slotsFree: c.slots > 0 ? Math.max(0, c.slots - used) : Infinity,
  };
}

/**
 * The boat a port's screen speaks of: `own` if she's lying there (alongside, anchored in its
 * bay, or on its slip), else the first other boat there that carries cargo. Null: none.
 */
export function boatAtPort(world: WorldState, port: PortDef, own?: EntityId): VesselState | null {
  const there = (v: VesselState | undefined) => !!v && VESSEL_DEFS[v.defId]?.cargo.maxPayloadKg > 0 && cargoPortAt(v)?.id === port.id;
  const mine = own ? world.vessels[own] : undefined;
  if (there(mine)) return mine!;
  return Object.values(world.vessels).find(there) ?? null;
}

// ── Where the screen stands ──

/**
 * Where a port's cargo screen stands (its foot, world) and the way its face looks (a unit
 * vector, world x and z): at the near end of its goods row, `terminal.beforeRow` (m) before
 * the first place, facing the water (away from the rows behind). On dry ground and clear of
 * the quay's lamp posts (`terminal.clearOfLamp`): if not there, a step further along, or at the
 * row's far end. Null if none of those will do.
 */
export function terminalSpot(port: PortDef): { x: number; y: number; z: number; face: [number, number] } | null {
  const c = CONFIG.cargo;
  const s = port.cargo;
  const yaw = (s.stackYawDeg * Math.PI) / 180;
  // Along the row (stackPoint: + along runs (sin yaw, -cos yaw)); back from the water (its rows: stackPoint(row 1) - stackPoint(row 0)).
  const ax = Math.sin(yaw);
  const az = -Math.cos(yaw);
  const p0 = stackPoint(port, 0);
  const p1 = stackPoint(port, c.stackRow);
  const bx = p1[0] - p0[0];
  const bz = p1[2] - p0[2];
  const bl = Math.hypot(bx, bz) || 1;
  const face: [number, number] = [-bx / bl, -bz / bl];
  const t = c.terminal;
  const end = (c.stackRow - 1) * c.stackSpacing;
  for (const along of [-t.beforeRow, -t.beforeRow - 1, -t.beforeRow - 2, end + t.beforeRow, end + t.beforeRow + 1]) {
    const x = s.stackX + ax * along;
    const z = s.stackZ + az * along;
    const y = standingHeight(x, z);
    if (y > t.minGround && !LAMPS.some((l) => Math.hypot(l.x - x, l.z - z) < t.clearOfLamp)) return { x, y, z, face };
  }
  return null;
}

// ── Making the goods ──

/** The port a cargo contract is for, if one's running (crates ordered elsewhere go there). */
function contractPort(world: WorldState): string | undefined {
  const a = world.career?.active;
  return a && a.kind === 'cargo' ? a.port : undefined;
}

/**
 * One new item of a sort waiting at a port, or null (no room on the quay, no cargo quay, pots
 * at their limit). `plain`: hand cargo as a plain crate, not one of the port's goods.
 */
function makeOne(world: WorldState, port: PortDef, what: OrderWhat, plain = false): CargoItem | null {
  const cfg = CONFIG.cargo;
  if (what === 'crane') return makeCraneCargoAt(world, port, contractPort(world));
  if (what === 'pots') {
    if (potsOwned(world) >= CONFIG.potting.pots) return null;
    const p = (world.potting ??= { seq: 0, shot: [], lost: 0 });
    const kind = potKind();
    const id = `pot-${++p.seq}`;
    const item: CargoItem = { id, kind, mass: cfg.kinds[kind].mass, from: 'pots', to: 'none', at: { ground: freeStackSpot(world, port), yaw: (port.cargo.stackYawDeg * Math.PI) / 180 } };
    world.cargo[id] = item;
    return item;
  }
  // Hand cargo: no more than one order's worth waiting on the quay (`terminal.maxOrder`).
  if (waitingHere(world, port, 'crates').length >= cfg.terminal.maxOrder) return null;
  return makeCargoAt(world, port, contractPort(world), plain ? shownKind('crates') : undefined);
}

/** Why a sort can't be ordered at this port at all, or null. */
export function orderBlocker(world: WorldState, port: PortDef, what: OrderWhat): string | null {
  if (what === 'crane' && !cargoBerth(port)) return 'No cargo quay here';
  if (what === 'crane' && PORTS.filter((p) => cargoBerth(p)).length < 2) return 'No other cargo quay to send it to';
  if (what === 'pots' && potsOwned(world) >= CONFIG.potting.pots) return `All ${CONFIG.potting.pots} pots are out`;
  if (what === 'crates' && waitingHere(world, port, 'crates').length >= CONFIG.cargo.terminal.maxOrder) return 'The quay is full';
  if (what === 'crates' && PORTS.length < 2) return 'No other harbour to send it to';
  return null;
}

/**
 * Order goods at a port: `count` of a sort (one, or more), or with `count` 0 as many as the
 * boat lying there (`v`) takes: each new item tried in her dry-run room first, and one that
 * wouldn't go aboard not made. A counted order is made whatever her room (the quay's
 * room and the pots' limit still hold): it's yours to carry, or keep for the next trip.
 * Returns how many were made.
 */
export function orderGoods(world: WorldState, port: PortDef, what: OrderWhat, count: number, v: VesselState | null): number {
  if (orderBlocker(world, port, what)) return 0;
  const fill = count <= 0;
  if (fill && (!v || quickPort(v)?.id !== port.id)) return 0;
  if (what === 'crane' && v && !hasCrane(v) && fill) return 0;
  const most = fill ? CONFIG.cargo.terminal.maxOrder : Math.min(count, CONFIG.cargo.terminal.maxOrder);
  let made = 0;
  let misses = 0;
  while (made < most) {
    // After `fillMisses` of the port's goods wouldn't fit, plain crates (the screen's count)
    // top her up; when one of those won't go either, she's full.
    const plain = misses >= CONFIG.cargo.terminal.fillMisses;
    const item = makeOne(world, port, what, plain);
    if (!item) break;
    // Wouldn't go aboard her (a long timber, a heavy drum): taken back, and another tried.
    if (fill && v && !allGoAboard(world, v, port)) {
      delete world.cargo[item.id];
      if (plain || what !== 'crates') break;
      misses++;
      continue;
    }
    made++;
  }
  return made;
}

/** Send back what was ordered at this port and still waits on its quay (not project goods, salvage or the trawl's fish). Returns how many. */
export function returnGoods(world: WorldState, port: PortDef): number {
  let n = 0;
  for (const c of Object.values(world.cargo)) {
    if (!('ground' in c.at) || isProjectItem(c) || portAtPoint(c.at.ground[0], c.at.ground[2])?.id !== port.id) continue;
    const ours = isPot(c) || (c.from === port.id && c.to !== port.id && !c.salvage);
    if (!ours) continue;
    delete world.cargo[c.id];
    n++;
  }
  return n;
}

/**
 * The cargo screen's intents (targetId: the boat lying there, or anything with no boat; ref:
 * the port's id):
 *   cargoOrder        args [sort: 0 crates, 1 crane lifts, 2 pots]; value: how many (0: a full load for her)
 *   cargoOrderReturn  what was ordered here and still waits on the quay, sent back
 * Returns true if it was one of them.
 */
export function applyOrderIntent(world: WorldState, intent: Intent): boolean {
  if (intent.control !== 'cargoOrder' && intent.control !== 'cargoOrderReturn') return false;
  const port = PORTS.find((p) => p.id === intent.ref);
  if (!port) return true;
  if (intent.control === 'cargoOrderReturn') {
    returnGoods(world, port);
    return true;
  }
  const what = ORDER_WHAT[Math.round(intent.args?.[0] ?? 0)] ?? 'crates';
  orderGoods(world, port, what, Math.max(0, Math.round(intent.value)), world.vessels[intent.targetId] ?? null);
  return true;
}

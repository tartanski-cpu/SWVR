/**
 * Cargo between ports, carried by hand. Plain-data simulation (WorldState.cargo),
 * multiplayer-ready like the rest: players send intents, the simulation checks them.
 *
 *   - Every port keeps CONFIG.cargo.perPort items waiting in a row on its quay or beach,
 *     each bound for another port.
 *   - Pick one up ('cargoTake'), carry it (one hand, or both for the heavy ones), set it
 *     down ('cargoPlace': on a deck, or ashore). Set down ashore near its destination's
 *     goods stack, it's delivered, and a replacement appears somewhere else.
 *   - Dropped in the sea, it's lost (a replacement appears too).
 *   - On deck, unlashed items slide when the apparent gravity along the deck beats friction
 *     (stepDeckCargo below), and can go over the rail. Strapped to a lashing point
 *     ('cargoLash') they stay put.
 *   - At an anchorage there's no quay: launch the workboat's skiff, load her (two crates
 *     or one drum: `cargo.slots`), run her up the beach and carry the goods up to the stack.
 *   - Cargo aboard, and cargo carried by players aboard, is real deadweight: payloadOf()
 *     feeds masses and positions to the vessel physics (mass, CG, inertia), so cargo
 *     shifting to one side gives her a list.
 *
 * New items are chosen with a deterministic hash of a counter in WorldState, so a host and
 * its clients (or a replay) agree.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { EntityId } from '../core/ids';
import type { Intent } from '../core/intents';
import type { Vec3 } from '../core/math';
import type { WorldState } from '../core/world';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { PORTS, type PortDef } from '../world/archipelago';
import { standingHeight } from '../world/geography';
import { deckSpot, onOpenDeck, type DeckFootprint } from './deck';
import { cargoLost, earn, portName } from '../career/career';
import { isPot, potLost, shootPot } from '../potting/potting';

export type CargoAt =
  /** Ashore (world frame): `pos` is the middle of its base. */
  | { ground: Vec3; yaw: number }
  /** On a vessel's deck (vessel axes): base centre, yaw, sliding velocity (x, z) and lashing. */
  | { vessel: EntityId; pos: Vec3; yaw: number; vel: [number, number]; lashed: boolean }
  /** In a player's hands. */
  | { carriedBy: EntityId };

export interface CargoItem {
  id: EntityId;
  /** Index into CONFIG.cargo.kinds. */
  kind: number;
  mass: number;
  from: string;
  to: string;
  at: CargoAt;
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

/** Needs both hands to lift. */
export function isHeavy(item: CargoItem): boolean {
  return item.mass > CONFIG.cargo.twoHandKg;
}

/** Plan footprint of an item (half sizes across and along, in its own axes). */
export function footprint(item: CargoItem): DeckFootprint {
  const [sx, , sz] = kindOf(item).size;
  return { hx: sx / 2, hz: sz / 2 };
}

/** World position of slot `i` in a port's goods row (on the quay or beach). */
export function stackPoint(port: PortDef, i: number): Vec3 {
  const s = port.cargo;
  const yaw = (s.stackYawDeg * Math.PI) / 180;
  const x = s.stackX + Math.sin(yaw) * i * CONFIG.cargo.stackSpacing;
  const z = s.stackZ - Math.cos(yaw) * i * CONFIG.cargo.stackSpacing;
  return [x, standingHeight(x, z), z];
}

/** The port whose goods area (x, z) is in, if any. */
export function portAtPoint(x: number, z: number): PortDef | null {
  for (const p of PORTS) if (Math.hypot(x - p.cargo.stackX, z - p.cargo.stackZ) < CONFIG.cargo.deliveryRadius) return p;
  return null;
}

function waitingAt(world: WorldState, port: PortDef): CargoItem[] {
  return Object.values(world.cargo).filter((c) => c.from !== 'pots' && 'ground' in c.at && portAtPoint(c.at.ground[0], c.at.ground[2])?.id === port.id);
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

/** Add one new item at the port with the fewest waiting (if any port has room). */
export function spawnCargo(world: WorldState): CargoItem | null {
  const cfg = CONFIG.cargo;
  const counts = PORTS.map((p) => waitingAt(world, p).length);
  const min = Math.min(...counts);
  if (min >= cfg.perPort) return null;
  const n = ++world.cargoSeq;
  // Among the emptiest ports, pick one by hash so it isn't always the first.
  const candidates = PORTS.filter((_, i) => counts[i] === min);
  const from = candidates[Math.floor(hash01(n) * candidates.length)];
  const others = PORTS.filter((p) => p.id !== from.id);
  const to = others[Math.floor(hash01(n + 0.5) * others.length)];
  const kind = Math.floor(hash01(n + 0.25) * cfg.tradeKinds); // trade cargo only (not pots)
  // First free place in the row (nothing within half a spacing of it).
  const items = Object.values(world.cargo).filter((c) => 'ground' in c.at);
  let pos = stackPoint(from, 0);
  for (let i = 0; i < 40; i++) {
    pos = stackPoint(from, i);
    const p = pos;
    if (!items.some((c) => 'ground' in c.at && Math.hypot(c.at.ground[0] - p[0], c.at.ground[2] - p[2]) < cfg.stackSpacing * 0.6)) break;
  }
  const yaw = (from.cargo.stackYawDeg * Math.PI) / 180 + (hash01(n + 0.75) - 0.5) * 0.3;
  const item: CargoItem = { id: `cargo-${n}`, kind, mass: cfg.kinds[kind].mass, from: from.id, to: to.id, at: { ground: pos, yaw } };
  world.cargo[item.id] = item;
  return item;
}

/** Fill every port up to its quota. */
export function stockPorts(world: WorldState): void {
  while (spawnCargo(world)) {
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
  delete world.cargo[item.id];
  if (delivered) world.deliveries += 1;
  // A box of fish from the trawl, landed (fishing/fishing.ts).
  if (delivered && item.from === 'trawl' && world.fishing) world.fishing.landed += 1;
  if (delivered && item.from === 'trawl') earn(world, 'fish', { port: at, text: `Fish landed at ${portName(at)}` });
  else if (delivered && item.to === 'any') earn(world, 'crate', { port: at, text: `Lost cargo brought in to ${portName(at)}` });
  else if (delivered) earn(world, 'cargo', { port: item.to, from: item.from, text: `Cargo ${portName(item.from)} → ${portName(item.to)}` });
  else {
    world.lost = (world.lost ?? 0) + 1;
    cargoLost(world, item.from);
  }
  spawnCargo(world);
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

/** Why a player can't pick an item up, or null. */
export function takeBlocker(item: CargoItem): string | null {
  if ('carriedBy' in item.at) return 'Someone has it';
  if ('vessel' in item.at && item.at.lashed) return 'Lashed down: undo the lashing first';
  return null;
}

function deckDisc(c: CargoItem): { x: number; z: number; r: number } {
  const at = c.at as Extract<CargoAt, { vessel: string }>;
  const f = footprint(c);
  return { x: at.pos[0], z: at.pos[2], r: Math.max(f.hx, f.hz) };
}

/** The nearest lashing point within reach of an item on deck (vessel axes), or null. */
export function lashPointFor(v: VesselState, item: CargoItem): [number, number] | null {
  if (!('vessel' in item.at)) return null;
  const [x, , z] = item.at.pos;
  let best: [number, number] | null = null;
  let bestD = VESSEL_DEFS[v.defId].cargo.lashRange;
  for (const p of VESSEL_DEFS[v.defId].cargo.lashPoints) {
    const d = Math.hypot(p[0] - x, p[1] - z);
    if (d < bestD) [best, bestD] = [p, d];
  }
  return best;
}

/**
 * Cargo intents. targetId: the vessel (or GROUND for 'cargoPlace' ashore); ref: the item.
 *   cargoTake               pick it up (if free and not lashed)
 *   cargoPlace  args [x, y, z, yaw]   set it down there, in the vessel's axes or the world
 *   cargoLash   value 1/0   strap down / release (on deck, near a lashing point)
 */
export function applyCargoIntent(world: WorldState, intent: Intent): void {
  const item = intent.ref ? world.cargo[intent.ref] : undefined;
  if (!item) return;
  const v = world.vessels[intent.targetId];
  switch (intent.control) {
    case 'cargoTake':
      if (!takeBlocker(item)) item.at = { carriedBy: intent.playerId };
      break;
    case 'cargoPlace': {
      if (!('carriedBy' in item.at) || item.at.carriedBy !== intent.playerId) break;
      const [x = 0, y = 0, z = 0, yaw = 0] = intent.args ?? [];
      if (v) {
        if (placeBlocker(world, v, item)) break; // full: you keep holding it
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
      item.at = { ground: [x, g, z], yaw };
      const port = portAtPoint(x, z);
      // Delivered: at its port, or anywhere for cargo fished out of the sea (to 'any').
      if (port && (port.id === item.to || item.to === 'any')) retire(world, item, true, port.id);
      break;
    }
    case 'cargoLash':
      if (v && 'vessel' in item.at && item.at.vessel === v.id) {
        if (intent.value > 0.5 && lashPointFor(v, item)) {
          item.at.lashed = true;
          item.at.vel = [0, 0];
        } else if (intent.value <= 0.5) {
          item.at.lashed = false;
        }
      }
      break;
  }
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
    if (at.lashed || !v0) continue;
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
  const loose = aboard(world, v.id);
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
    }
  }
  return out;
}

export function cargoLabel(item: CargoItem): string {
  const k = kindOf(item);
  // A pot: no destination; you shoot it over the side on a potting ground.
  if (isPot(item)) return `Lobster pot ${item.mass} kg: shoot it over the side on a potting ground`;
  const to = item.to === 'any' ? 'any harbour' : portById(item.to)?.name.replace(' (anchorage)', '');
  return `${k.name} ${item.mass} kg → ${to}`;
}

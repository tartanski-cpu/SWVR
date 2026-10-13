/**
 * Cargo between ports. Plain-data simulation (WorldState.cargo), multiplayer-ready like the
 * rest: players send intents ('cargoLoad' / 'cargoUnload' with ref = cargo id), the
 * simulation checks them and moves items.
 *
 *   - Every port keeps CONFIG.cargo.perPort items waiting ashore, each bound for another port.
 *   - Load: alongside the port's cargo berth and nearly stopped (or, at an anchorage, with
 *     the anchor set in the bay), into a free deck slot, within the boat's payload limit.
 *   - Unload: only at the item's destination - that's a delivery. A replacement item then
 *     appears somewhere else, so there is always work.
 *   - Cargo aboard is real deadweight: payloadOf() feeds its masses and positions to the
 *     vessel physics (mass, CG and inertia).
 *
 * New items are chosen with a deterministic hash of a counter in WorldState, so a host and
 * its clients (or a replay) agree.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { EntityId } from '../core/ids';
import type { Intent } from '../core/intents';
import type { WorldState } from '../core/world';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { PORTS, type PortDef } from '../world/archipelago';

export interface CargoItem {
  id: EntityId;
  /** Index into CONFIG.cargo.kinds. */
  kind: number;
  mass: number;
  from: string;
  to: string;
  /** Waiting ashore at a port (stack position), or stowed in a vessel's deck slot. */
  at: { port: string; slot: number } | { vessel: EntityId; slot: number };
}

/** Deterministic pseudo-random number in [0, 1) from an integer. */
function hash01(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export function portById(id: string): PortDef | undefined {
  return PORTS.find((p) => p.id === id);
}

function waitingAt(world: WorldState, portId: string): CargoItem[] {
  return Object.values(world.cargo).filter((c) => 'port' in c.at && c.at.port === portId);
}

export function aboard(world: WorldState, vesselId: EntityId): CargoItem[] {
  return Object.values(world.cargo)
    .filter((c) => 'vessel' in c.at && c.at.vessel === vesselId)
    .sort((a, b) => a.at.slot - b.at.slot);
}

/** Add one new item at the port with the fewest waiting (if any port has room). */
export function spawnCargo(world: WorldState): CargoItem | null {
  const cfg = CONFIG.cargo;
  const counts = PORTS.map((p) => waitingAt(world, p.id).length);
  const min = Math.min(...counts);
  if (min >= cfg.perPort) return null;
  const n = ++world.cargoSeq;
  // Among the emptiest ports, pick one by hash so it isn't always the first.
  const candidates = PORTS.filter((_, i) => counts[i] === min);
  const from = candidates[Math.floor(hash01(n) * candidates.length)];
  const others = PORTS.filter((p) => p.id !== from.id);
  const to = others[Math.floor(hash01(n + 0.5) * others.length)];
  const kind = Math.floor(hash01(n + 0.25) * cfg.kinds.length);
  const used = new Set(waitingAt(world, from.id).map((c) => c.at.slot));
  let slot = 0;
  while (used.has(slot)) slot++;
  const item: CargoItem = { id: `cargo-${n}`, kind, mass: cfg.kinds[kind].mass, from: from.id, to: to.id, at: { port: from.id, slot } };
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
 * The port whose cargo berth the vessel is working right now, or null: alongside the berth
 * and nearly stopped, or at an anchorage with the anchor set inside the bay.
 */
export function cargoPortAt(v: VesselState): PortDef | null {
  const speed = Math.hypot(v.linearVelocity[0], v.linearVelocity[2]);
  for (const p of PORTS) {
    const b = p.cargo.berth;
    if (b && speed < CONFIG.cargo.maxSpeed && Math.hypot(v.position[0] - b.x, v.position[2] - b.z) < b.radius) return p;
    const a = p.cargo.anchorage;
    if (a && v.anchor.phase === 'set' && Math.hypot(v.anchor.x - a.x, v.anchor.z - a.z) < a.radius) return p;
  }
  return null;
}

export function payloadMass(world: WorldState, vesselId: EntityId): number {
  return aboard(world, vesselId).reduce((s, c) => s + c.mass, 0);
}

/** Why an item can't be loaded right now, or null if it can. */
export function loadBlocker(world: WorldState, v: VesselState, item: CargoItem): string | null {
  if (!('port' in item.at)) return 'Already aboard';
  const here = cargoPortAt(v);
  if (!here || here.id !== item.at.port) return `Come alongside the cargo berth at ${portById(item.at.port)?.name} and stop`;
  const def = VESSEL_DEFS[v.defId];
  const items = aboard(world, v.id);
  if (items.length >= def.cargo.slots.length) return 'The deck is full';
  if (payloadMass(world, v.id) + item.mass > def.cargo.maxPayloadKg) return `Over the ${def.cargo.maxPayloadKg / 1000} t payload limit`;
  return null;
}

/** Why an item can't be unloaded right now, or null if it can. */
export function unloadBlocker(v: VesselState, item: CargoItem): string | null {
  if (!('vessel' in item.at) || item.at.vessel !== v.id) return 'Not aboard';
  const here = cargoPortAt(v);
  if (!here || here.id !== item.to) return `Deliver to ${portById(item.to)?.name}`;
  return null;
}

/** 'cargoLoad' / 'cargoUnload' intents (targetId = vessel, ref = cargo id). */
export function applyCargoIntent(world: WorldState, intent: Intent): void {
  const v = world.vessels[intent.targetId];
  const item = intent.ref ? world.cargo[intent.ref] : undefined;
  if (!v || !item) return;
  if (intent.control === 'cargoLoad' && !loadBlocker(world, v, item)) {
    const used = new Set(aboard(world, v.id).map((c) => c.at.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    item.at = { vessel: v.id, slot };
  } else if (intent.control === 'cargoUnload' && !unloadBlocker(v, item)) {
    delete world.cargo[item.id];
    world.deliveries += 1;
    spawnCargo(world);
  }
}

/** Cargo aboard as point masses (vessel axes, at each box's centre) for the physics. */
export function payloadOf(world: WorldState, vesselId: EntityId): { mass: number; pos: THREE.Vector3 }[] {
  const v = world.vessels[vesselId];
  const def = VESSEL_DEFS[v.defId];
  return aboard(world, vesselId).map((c) => {
    const [x, y, z] = def.cargo.slots[c.at.slot];
    return { mass: c.mass, pos: new THREE.Vector3(x, y + CONFIG.cargo.kinds[c.kind].size[1] / 2, z) };
  });
}

export function cargoLabel(item: CargoItem): string {
  const k = CONFIG.cargo.kinds[item.kind];
  return `${k.name} ${(item.mass / 1000).toFixed(1)} t → ${portById(item.to)?.name.replace(' (anchorage)', '')}`;
}

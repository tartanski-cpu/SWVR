import { CONFIG } from '../config';
import type { EntityId } from '../core/ids';
import type { Intent } from '../core/intents';
import { homeVessel, type WorldState } from '../core/world';
import { aboard, deckHeightAt, footprint, type CargoItem } from '../cargo/cargo';
import { deckSpot } from '../cargo/deck';
import { hullPlan } from '../vessel/layout';
import { placeVessel } from '../vessel/vesselControl';
import { TOW_DEFS, VESSEL_DEFS } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { POTTING_GROUNDS, type PottingGround } from '../world/archipelago';
import { standingHeight } from '../world/geography';
import { groundHeight } from '../world/terrain';
import { windVector } from '../environment/weather';
import { sayRadio } from '../rescue/rescue';

/**
 * Lobster and crab potting (owner's feature; milestone 1: pots as cargo, and shooting them).
 *
 *   - The pots wait on a pallet on the Calder Haven quay (CONFIG.potting.pallet). They're
 *     cargo items (kind 'Pot', from 'pots'): carried, stowed and lashed like any cargo.
 *     You have `pots` of them; pots are free for now, so any lost are replaced on the
 *     pallet.
 *   - Shooting: a pot let go over the side into the sea (cargoPlace in the sea, cargo.ts)
 *     becomes a shot pot: a plain record (where, when, whose, which ground, baited) and
 *     no mesh while it soaks. Its marker buoy pops up `sinkTime` s later and stays,
 *     bobbing on the waves (potting/potView.ts: drawn from the records, no physics body).
 *   - Each boat's buoys have their own colour (`buoyColors`, by boat).
 *
 * All of it is plain JSON in WorldState.potting: host-authoritative and shared like the rest.
 * Off unless switched on (the `pottingOn` intent, from Settings → Game → Potting).
 */
export interface ShotPot {
  id: string;
  /** The boat that shot it (its buoys' colour). */
  owner: EntityId;
  x: number;
  z: number;
  /** World time it went in (s). */
  shotAt: number;
  baited: boolean;
  /** The potting ground it's on, or null (shot elsewhere: it'll catch little). */
  ground: string | null;
}

export interface PottingState {
  seq: number;
  shot: ShotPot[];
  /** Pots lost (overboard loose, or never found). */
  lost: number;
  /** When a local potter next comes on the VHF with a tip (world time, s). */
  tipAt?: number;
}

/** Is this cargo item a pot? */
export function isPot(item: CargoItem): boolean {
  return item.from === 'pots';
}

/** The cargo kind index of a pot. */
export function potKind(): number {
  return CONFIG.cargo.kinds.findIndex((k) => k.name === 'Pot');
}

/** The potting ground at a point, if any. */
export function groundAt(x: number, z: number): PottingGround | null {
  return POTTING_GROUNDS.find((g) => Math.hypot(x - g.x, z - g.z) <= g.radius) ?? null;
}

/** The boat pots belong to (the first workboat: the player's boat). */
function potBoat(world: WorldState): VesselState | undefined {
  return homeVessel(world);
}

/** A boat's buoy colour. */
export function buoyColor(world: WorldState, owner: EntityId): number {
  const boats = Object.values(world.vessels)
    // The crews' boats: not a tow adrift, not a ship's boat.
    .filter((v) => !v.tender && !(TOW_DEFS as readonly string[]).includes(v.defId))
    .map((v) => v.id)
    .sort();
  const i = Math.max(0, boats.indexOf(owner));
  const c = CONFIG.potting.buoyColors;
  return c[i % c.length];
}

/** Switch potting on: the state, and the pots on their pallet. */
export function enablePotting(world: WorldState): void {
  world.potting ??= { seq: 0, shot: [], lost: 0 };
  stockPallet(world);
}

/** Pots on the pallet, carried, aboard or in the water: how many we have. */
export function potsOwned(world: WorldState): number {
  const cargo = Object.values(world.cargo).filter(isPot).length;
  return cargo + (world.potting?.shot.length ?? 0);
}

/** Make up the pots to `CONFIG.potting.pots` on the pallet (pots are free for now). */
export function stockPallet(world: WorldState): void {
  const p = world.potting;
  if (!p) return;
  const cfg = CONFIG.potting;
  const kind = potKind();
  const k = CONFIG.cargo.kinds[kind];
  const yaw = (cfg.pallet.yawDeg * Math.PI) / 180;
  // Pallet places: a row of slots along its long side (x along yaw), two high.
  const taken = new Set<number>();
  for (const c of Object.values(world.cargo)) {
    if (!isPot(c) || !('ground' in c.at)) continue;
    const slot = palletSlotAt(c.at.ground[0], c.at.ground[2]);
    if (slot >= 0) taken.add(slot);
  }
  let missing = cfg.pots - potsOwned(world);
  for (let slot = 0; slot < cfg.pots + 4 && missing > 0; slot++) {
    if (taken.has(slot)) continue;
    const [x, y, z] = palletSlot(slot);
    const id = `pot-${++p.seq}`;
    world.cargo[id] = { id, kind, mass: k.mass, from: 'pots', to: 'none', at: { ground: [x, y, z], yaw } };
    missing--;
  }
}

/** Slot `i` on the pallet (world): side by side along it, 0.55 m apart. */
function palletSlot(i: number): [number, number, number] {
  const cfg = CONFIG.potting.pallet;
  const yaw = (cfg.yawDeg * Math.PI) / 180;
  const along = (i - 2) * 0.55;
  // Along the pallet's length: yaw 0 = north (-z), 90 = east (+x).
  const x = cfg.x + Math.sin(yaw) * along;
  const z = cfg.z - Math.cos(yaw) * along;
  return [x, standingHeight(x, z), z]; // on the quay
}

function palletSlotAt(x: number, z: number): number {
  for (let i = 0; i < CONFIG.potting.pots + 4; i++) {
    const [sx, , sz] = palletSlot(i);
    if (Math.hypot(sx - x, sz - z) < 0.25) return i;
  }
  return -1;
}

/**
 * A pot let go into the sea at (x, z): shot. The cargo item goes; a shot-pot record takes
 * its place (if the cap allows; past it the pot is simply lost). Returns the record.
 */
export function shootPot(world: WorldState, item: CargoItem, x: number, z: number): ShotPot | null {
  const p = (world.potting ??= { seq: 0, shot: [], lost: 0 });
  delete world.cargo[item.id];
  if (p.shot.length >= CONFIG.potting.maxShot || groundHeight(x, z) > -1) {
    p.lost += 1; // too many out, or dropped where there's no water to fish
    stockPallet(world);
    return null;
  }
  const boat = potBoat(world);
  const pot: ShotPot = {
    id: item.id,
    owner: boat?.id ?? '',
    x,
    z,
    shotAt: world.time,
    baited: false,
    ground: groundAt(x, z)?.id ?? null,
  };
  p.shot.push(pot);
  return pot;
}

/** A pot gone (overboard loose, sunk without a buoy): counted, and a new one on the pallet. */
export function potLost(world: WorldState, item: CargoItem): void {
  delete world.cargo[item.id];
  if (!world.potting) return;
  world.potting.lost += 1;
  stockPallet(world);
}

/** How long it's been fishing (s): from when it reached the bottom. */
export function soakOf(world: WorldState, pot: ShotPot): number {
  return Math.max(0, world.time - pot.shotAt - CONFIG.potting.sinkTime);
}

/** Soaked long enough to haul (the buoy's flag goes green). */
export function potReady(world: WorldState, pot: ShotPot): boolean {
  return soakOf(world, pot) >= CONFIG.potting.soakReady;
}

/** How far the soak has gone toward its best catch, 0..1 (milestone 3 uses it for the catch). */
export function soakFactor(world: WorldState, pot: ShotPot): number {
  return Math.min(1, soakOf(world, pot) / CONFIG.potting.soakBest);
}

/** Deterministic 0..1 from the state (the same on every peer). */
function rand(n: number): number {
  const s = Math.sin(n * 91.7 + 13.1) * 43758.5453;
  return s - Math.floor(s);
}

const TIP_BOATS = ['Girl Isla', 'Morag', 'Bonnie Jean', 'Silver Spray', 'Kittiwake'];

/**
 * One tick (host): storm drift, and now and then a local potter on the VHF with a tip.
 *   Drift: in wind over `dragFrom`, each pot drags along the bottom downwind, its buoy with
 *   it, at `dragRate` m/s per m/s over; it stops where the water's under 1.5 m. Its ground
 *   follows where it ends up.
 */
export function stepPotting(world: WorldState, dt: number): void {
  const p = world.potting;
  if (!p) return;
  const c = CONFIG.potting;
  const w = world.environment.weather?.now;
  if (w && w.wind > c.dragFrom) {
    const v = windVector(world.environment, { x: 0, z: 0 });
    const len = Math.hypot(v.x, v.z) || 1;
    const step = c.dragRate * (w.wind - c.dragFrom) * dt;
    for (const pot of p.shot) {
      if (!buoyUp(world, pot)) continue;
      const nx = pot.x + (v.x / len) * step;
      const nz = pot.z + (v.z / len) * step;
      if (groundHeight(nx, nz) > -1.5) continue;
      pot.x = nx;
      pot.z = nz;
      pot.ground = groundAt(nx, nz)?.id ?? null;
    }
  }
  p.tipAt ??= world.time + c.tipFirst;
  if (world.time >= p.tipAt) {
    const n = p.seq + Math.floor(world.time);
    p.tipAt = world.time + c.tipEvery[0] + rand(n) * (c.tipEvery[1] - c.tipEvery[0]);
    const g = POTTING_GROUNDS[Math.floor(rand(n + 1) * POTTING_GROUNDS.length)];
    const boat = TIP_BOATS[Math.floor(rand(n + 2) * TIP_BOATS.length)];
    const what = rand(n + 3) < 0.5 ? 'crab' : 'lobster';
    sayRadio(world, 'info', `All stations, ${boat}. Good ground for ${what} off ${g.name} just now, if anyone's potting. ${boat} out.`);
  }
}

/** Its buoy is up (the pot's on the bottom). */
export function buoyUp(world: WorldState, pot: ShotPot): boolean {
  return world.time - pot.shotAt >= CONFIG.potting.sinkTime;
}

/**
 * Potting intents:
 *   pottingOn       switch potting on (Settings → Game → Potting, from the host's player)
 *   potDebugAboard  debug: the pots on the pallet onto the aft deck of the target vessel
 *   potDebugGround  debug: the target vessel to the middle of the nearest potting ground
 *   potDebugReady   debug: every pot in the water soaked enough to haul
 */
export function applyPottingIntent(world: WorldState, intent: Intent): void {
  if (intent.control === 'pottingOn') {
    if (intent.value > 0.5) enablePotting(world);
    return;
  }
  const v = world.vessels[intent.targetId];
  if (!v || !world.potting) return;
  if (intent.control === 'potDebugReady') {
    for (const pot of world.potting.shot) pot.shotAt = Math.min(pot.shotAt, world.time - CONFIG.potting.sinkTime - CONFIG.potting.soakReady);
  } else if (intent.control === 'potDebugAboard') {
    const z0 = hullPlan(VESSEL_DEFS[v.defId]).transom - 1.2;
    for (const c of Object.values(world.cargo)) {
      if (!isPot(c) || !('ground' in c.at)) continue;
      const others = aboard(world, v.id).map((o) => {
        const at = o.at as Extract<CargoItem['at'], { vessel: string }>;
        const fp = footprint(o);
        return { x: at.pos[0], z: at.pos[2], r: Math.max(fp.hx, fp.hz) };
      });
      const spot = deckSpot(v.defId, footprint(c), 0, z0, others);
      if (!spot) break;
      c.at = { vessel: v.id, pos: [spot.x, deckHeightAt(v.defId, spot.z), spot.z], yaw: 0, vel: [0, 0], lashed: false };
    }
  } else if (intent.control === 'potDebugGround') {
    const near = [...POTTING_GROUNDS].sort((a, b) => Math.hypot(a.x - v.position[0], a.z - v.position[2]) - Math.hypot(b.x - v.position[0], b.z - v.position[2]))[0];
    placeVessel(v, near.x, 0, near.z, 0);
    v.controls.lever = 0;
    v.anchor = { phase: 'stowed', x: 0, z: 0, rodeM: 0, tension: 0, dragging: false };
    v.controls.anchor = 0;
    v.mooring = { phase: 'free', berthId: null, reversed: false, t: 0 };
    v.refuelling = false;
  }
}

export function isPottingIntent(control: string): boolean {
  return control === 'pottingOn' || control.startsWith('potDebug');
}

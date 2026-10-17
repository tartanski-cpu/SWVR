import { CONFIG } from '../config';
import type { EntityId } from '../core/ids';
import type { Intent } from '../core/intents';
import { homeVessel, type WorldState } from '../core/world';
import * as THREE from 'three';
import { aboard, deckHeightAt, footprint, quickDeckPoint, quickPort, stowOnDeck, type CargoItem, type PotContents } from '../cargo/cargo';
import { significantWaveHeight } from '../ocean/waves';
import { deckSpot } from '../cargo/deck';
import { hullPlan } from '../vessel/layout';
import { placeVessel } from '../vessel/vesselControl';
import { TOW_DEFS, VESSEL_DEFS } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { PORTS, POTTING_GROUNDS, type PottingGround } from '../world/archipelago';
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
  /**
   * Being hauled (milestone 3):
   *   hooked  its buoy is on someone's boat hook (`by`), being brought alongside
   *   line    the buoy's aboard: the line leads over the gunwale at `lead` (vessel axes) on
   *           `vessel`, `line` m of it still out (the pot's on the bottom until it's under
   *           the depth); hauled in hand over hand, it slips back in a swell if left
   */
  haul?: { by: string; phase: 'hooked' | 'line'; vessel?: string; lead?: [number, number, number]; line?: number; lastPull?: number };
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
    baited: !!item.pot?.baited,
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
  // Hauling: a hooked buoy comes off when its hooker lets go of the hook; a pot on its
  // line is dragged along under the boat, and in a swell the line slips back if left.
  const hs = significantWaveHeight(world.environment.waves);
  for (const pot of [...p.shot]) {
    const h = pot.haul;
    if (!h) continue;
    if (h.phase === 'hooked') {
      if (world.rescue?.hook?.holder !== h.by) pot.haul = undefined;
      continue;
    }
    const v = world.vessels[h.vessel ?? ''];
    if (!v || !h.lead) {
      pot.haul = undefined;
      continue;
    }
    const at = toWorldPt(v, h.lead);
    pot.x = at.x;
    pot.z = at.z;
    const hc = c.haul;
    if (hs > hc.slipFrom && world.time - (h.lastPull ?? 0) > hc.slipAfter) {
      h.line = Math.min(depthAt(pot) + hc.slack, (h.line ?? 0) + hc.slipRate * (hs - hc.slipFrom) * dt);
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

/** The water depth at a pot (m). */
export function depthAt(pot: { x: number; z: number }): number {
  return Math.max(0.5, -groundHeight(pot.x, pot.z));
}

/** A hash of a string to 0..1 (seeds the catch: the same on every peer). */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * What a pot brings up, worked out as it comes aboard (seeded by the pot and when it was
 * shot, so every peer agrees): expected = ground quality x soak (0..1) x bait x weather.
 */
export function catchFor(world: WorldState, pot: ShotPot): PotContents {
  const c = CONFIG.potting.catch;
  const g = POTTING_GROUNDS.find((x) => x.id === pot.ground);
  const quality = g?.quality ?? c.offGround;
  const wind = world.environment.weather?.now.wind ?? 0;
  const expect = quality * soakFactor(world, pot) * (pot.baited ? 1 : c.unbaited) * (wind > c.roughWind ? c.roughFactor : 1);
  const seed = `${pot.id}:${Math.round(pot.shotAt * 10)}`;
  const r = (k: number) => rand(hashStr(seed) * 1000 + k);
  // Each possible animal is there with probability `expect` (so at best, all of them).
  let lobster = 0;
  let crab = 0;
  for (let i = 0; i < c.lobsterMax; i++) if (r(i + 1) < expect * 0.8) lobster++;
  for (let i = 0; i < c.crabMax; i++) if (r(i + 11) < expect) crab++;
  let bycatch: PotContents['bycatch'] = null;
  if (r(30) < c.bycatch) bycatch = r(31) < c.bootChance ? 'boot' : r(32) < 0.55 ? 'fish' : 'starfish';
  return { crab, lobster, bycatch, baited: false };
}

/** The gunwale point (vessel axes) nearest a world point: where a line comes aboard. */
function leadFor(v: VesselState, x: number, z: number): [number, number, number] {
  const def = VESSEL_DEFS[v.defId];
  const plan = hullPlan(def);
  const q = new THREE.Quaternion().fromArray(v.orientation).invert();
  const l = new THREE.Vector3(x - v.position[0], 0, z - v.position[2]).applyQuaternion(q);
  const lz = Math.min(plan.transom - 0.4, Math.max(plan.stem + 1.5, l.z));
  const side = l.x >= 0 ? 1 : -1;
  return [side * (plan.halfBeam(lz) - 0.03), plan.deckY(lz) + def.layout.bulwarkHeight, lz];
}

/** A vessel-axes point in the world. */
function toWorldPt(v: VesselState, p: readonly number[]): THREE.Vector3 {
  return new THREE.Vector3(p[0], p[1], p[2]).applyQuaternion(new THREE.Quaternion().fromArray(v.orientation)).add(new THREE.Vector3().fromArray(v.position));
}

/** How far a world point is from the hull's side (m, 0 alongside). */
function fromHull(v: VesselState, x: number, z: number): number {
  const plan = hullPlan(VESSEL_DEFS[v.defId]);
  const q = new THREE.Quaternion().fromArray(v.orientation).invert();
  const l = new THREE.Vector3(x - v.position[0], 0, z - v.position[2]).applyQuaternion(q);
  const lz = Math.min(plan.transom, Math.max(plan.stem, l.z));
  return Math.hypot(Math.max(0, Math.abs(l.x) - plan.halfBeam(lz)), l.z - lz);
}

/**
 * A buoy moved from (x0, z0) to (x, z) beside a vessel: kept outside her hull, on the side
 * it started (0.25 m off the plating, about half the float and a fender's width).
 */
function outsideHull(v: VesselState, x0: number, z0: number, x: number, z: number): [number, number] {
  const plan = hullPlan(VESSEL_DEFS[v.defId]);
  const q = new THREE.Quaternion().fromArray(v.orientation);
  const qi = q.clone().invert();
  const toLocal = (wx: number, wz: number) => new THREE.Vector3(wx - v.position[0], 0, wz - v.position[2]).applyQuaternion(qi);
  const l = toLocal(x, z);
  if (l.z < plan.stem - 0.3 || l.z > plan.transom + 0.3) return [x, z];
  const lz = Math.min(plan.transom, Math.max(plan.stem, l.z));
  const off = plan.halfBeam(lz) + 0.25;
  if (Math.abs(l.x) >= off) return [x, z];
  const side = toLocal(x0, z0).x >= 0 ? 1 : -1;
  l.x = side * off;
  l.applyQuaternion(q);
  return [l.x + v.position[0], l.z + v.position[2]];
}

/** The pot comes over the gunwale onto the deck: a pot cargo item with its catch. */
function landPot(world: WorldState, pot: ShotPot, v: VesselState): void {
  const p = world.potting!;
  const lead = pot.haul?.lead ?? [0, 1, 3];
  p.shot = p.shot.filter((x) => x.id !== pot.id);
  const kind = potKind();
  const item: CargoItem = { id: pot.id, kind, mass: CONFIG.cargo.kinds[kind].mass, from: 'pots', to: 'none', at: { carriedBy: '' }, pot: catchFor(world, pot) };
  const others = aboard(world, v.id).map((o) => {
    const at = o.at as Extract<CargoItem['at'], { vessel: string }>;
    const fp = footprint(o);
    return { x: at.pos[0], z: at.pos[2], r: Math.max(fp.hx, fp.hz) };
  });
  // Just inboard of where it came over.
  const spot = deckSpot(v.defId, footprint(item), lead[0] * 0.6, lead[2], others);
  if (!spot) {
    // No room on deck: it goes back down (still shot, where it was).
    p.shot.push({ ...pot, haul: undefined });
    return;
  }
  item.at = { vessel: v.id, pos: [spot.x, deckHeightAt(v.defId, spot.z), spot.z], yaw: 0, vel: [0, 0], lashed: false };
  world.cargo[item.id] = item;
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
 *   potDebugReady   debug: every pot in the water soaked enough to haul (value 2: soaked its
 *                   best and baited, for the best catch the ground gives)
 */
export function applyPottingIntent(world: WorldState, intent: Intent): void {
  if (intent.control === 'pottingOn') {
    if (intent.value > 0.5) enablePotting(world);
    return;
  }
  if (applyHaulIntent(world, intent)) return;
  const v = world.vessels[intent.targetId];
  if (!v || !world.potting) return;
  if (intent.control.startsWith('potQuick')) {
    applyQuickPotting(world, v, intent);
    return;
  }
  if (intent.control === 'potDebugReady') {
    const full = intent.value > 1.5;
    for (const pot of world.potting.shot) {
      pot.shotAt = Math.min(pot.shotAt, world.time - CONFIG.potting.sinkTime - (full ? CONFIG.potting.soakBest : CONFIG.potting.soakReady));
      if (full) pot.baited = true;
    }
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
  return control === 'pottingOn' || control.startsWith('potDebug') || control.startsWith('potQuick') || HAUL_INTENTS.has(control);
}

// ── Quick potting (the menu's Potting buttons) ──
// The same jobs as by hand, in a click (see cargo.ts "Quick jobs"): the same rules hold.

/** Pots waiting on the pallet, if the vessel is at the pallet's harbour. */
export function quickPalletPots(world: WorldState, v: VesselState): CargoItem[] {
  const { x, z } = CONFIG.potting.pallet;
  const port = quickPort(v);
  // The pallet's harbour: the port nearest it.
  const home = [...PORTS].sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
  if (!port || port.id !== home?.id) return [];
  return Object.values(world.cargo).filter((c) => isPot(c) && 'ground' in c.at && Math.hypot(c.at.ground[0] - x, c.at.ground[2] - z) < CONFIG.cargo.deliveryRadius);
}

/** The buoy nearest the vessel within `quickHaulRange` (up, not being hauled), or null. */
export function quickHaulable(world: WorldState, v: VesselState): ShotPot | null {
  let best: ShotPot | null = null;
  let bd = CONFIG.potting.quickHaulRange;
  for (const pot of world.potting?.shot ?? []) {
    if (pot.haul || !buoyUp(world, pot)) continue;
    const d = fromHull(v, pot.x, pot.z);
    if (d < bd) [best, bd] = [pot, d];
  }
  return best;
}

/**
 * Quick potting intents (targetId: the vessel):
 *   potQuickLoad   the pallet's pots aboard (at the pallet's harbour), lashed
 *   potQuickBait   every pot aboard not yet baited, baited
 *   potQuickShoot  one pot from the deck over the side (starboard, a few metres off)
 *   potQuickHaul   the nearest buoy within quickHaulRange hauled: its pot on deck with its catch
 */
function applyQuickPotting(world: WorldState, v: VesselState, intent: Intent): void {
  switch (intent.control) {
    case 'potQuickLoad': {
      const [x, z] = quickDeckPoint(v);
      for (const c of quickPalletPots(world, v)) if (!stowOnDeck(world, v, c, x, z)) break;
      break;
    }
    case 'potQuickBait':
      for (const c of aboard(world, v.id)) if (isPot(c) && !c.pot?.baited) c.pot = { crab: 0, lobster: 0, bycatch: null, ...c.pot, baited: true };
      break;
    case 'potQuickShoot': {
      const c = aboard(world, v.id).find(isPot);
      if (!c || !('vessel' in c.at)) break;
      const plan = hullPlan(VESSEL_DEFS[v.defId]);
      const z = c.at.pos[2];
      const at = toWorldPt(v, [plan.halfBeam(Math.min(plan.transom, Math.max(plan.stem, z))) + CONFIG.potting.quickShootOff, 0, z]);
      shootPot(world, c, at.x, at.z);
      break;
    }
    case 'potQuickHaul': {
      const pot = quickHaulable(world, v);
      if (!pot) break;
      pot.haul = { by: intent.playerId, phase: 'line', vessel: v.id, lead: leadFor(v, pot.x, pot.z), line: 0 };
      landPot(world, pot, v);
      break;
    }
  }
}

const HAUL_INTENTS = new Set(['potHook', 'potTow', 'potAboard', 'potHaul', 'potBait']);

/**
 * Hauling and the catch (milestone 3). ref: the pot (a shot pot's id, or the pot cargo item
 * on deck); targetId: the vessel.
 *   potHook    the buoy on your boat hook (your hook tip touching it; you hold the hook)
 *   potTow     args [x, z]: the hooked buoy drawn toward your hook tip (at most 3 m a go)
 *   potAboard  the buoy over the gunwale (within liftRange of the hull): the line leads in there
 *   potHaul    value m: line hauled in; at nothing left the pot comes over onto the deck
 *   potBait    bait from the tub into a pot not yet baited (the catch, if any, stays in it
 *              until it's sold ashore)
 */
function applyHaulIntent(world: WorldState, intent: Intent): boolean {
  if (!HAUL_INTENTS.has(intent.control)) return false;
  const p = world.potting;
  if (!p) return true;
  const who = intent.playerId;
  const shot = p.shot.find((x) => x.id === intent.ref);
  const v = world.vessels[intent.targetId];
  const cfg = CONFIG.potting.haul;
  switch (intent.control) {
    case 'potHook':
      if (shot && buoyUp(world, shot) && !shot.haul && world.rescue?.hook?.holder === who) shot.haul = { by: who, phase: 'hooked' };
      break;
    case 'potTow': {
      const [x, z] = intent.args ?? [];
      if (!shot || shot.haul?.phase !== 'hooked' || shot.haul.by !== who || !Number.isFinite(x) || !Number.isFinite(z)) break;
      const dx = x - shot.x;
      const dz = z - shot.z;
      const d = Math.hypot(dx, dz);
      const k = d > 3 ? 3 / d : 1;
      let nx = shot.x + dx * k;
      let nz = shot.z + dz * k;
      // Not through the boat: it stays outside her side it was on (a hook tip over the deck
      // holds it against the hull).
      if (v) [nx, nz] = outsideHull(v, shot.x, shot.z, nx, nz);
      if (groundHeight(nx, nz) < -0.5) {
        shot.x = nx;
        shot.z = nz;
      }
      break;
    }
    case 'potAboard':
      if (!shot || !v || shot.haul?.phase !== 'hooked' || fromHull(v, shot.x, shot.z) > cfg.liftRange) break;
      shot.haul = { by: who, phase: 'line', vessel: v.id, lead: leadFor(v, shot.x, shot.z), line: depthAt(shot) + cfg.slack, lastPull: world.time };
      break;
    case 'potHaul': {
      if (!shot || shot.haul?.phase !== 'line' || !Number.isFinite(intent.value)) break;
      const hv = world.vessels[shot.haul.vessel ?? ''];
      if (!hv) break;
      shot.haul.line = (shot.haul.line ?? 0) - Math.max(0, Math.min(5, intent.value));
      shot.haul.lastPull = world.time;
      if (shot.haul.line <= 0) landPot(world, shot, hv);
      break;
    }
    case 'potBait': {
      const item = intent.ref ? world.cargo[intent.ref] : undefined;
      const pc = item?.pot;
      if (item && isPot(item) && !pc?.baited) item.pot = { crab: 0, lobster: 0, bycatch: null, ...pc, baited: true };
      break;
    }
  }
  return true;
}

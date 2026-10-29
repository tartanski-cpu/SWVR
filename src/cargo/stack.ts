/**
 * Stacking (owner, 29 Oct 2026: "I'd like the fishing pots to stack on the deck and quayside;
 * they could be square if that helps"): the kinds in CONFIG.cargo.stacking (the square wire
 * pots) stack, up to `high` of them, on a deck or a quay.
 *
 *   on        an item set down on another of its kind is resting on it: its `at.on` is that
 *             item's id, its base on the other's top, square with it (the same yaw).
 *   placed    set down (by hand, by the quick jobs, or ordered on a quay) within `reach` m of
 *             a stack with room, it goes on top; otherwise it's set down as any cargo.
 *   riding    on a deck, a stack moves as one: the bottom item slides (stepDeckCargo), those
 *             above ride on it, and the bottom one's lashing straps the lot.
 *   taken     only the top one: something resting on an item holds it (takeBlocker); a
 *             deck crane takes only the top one too.
 *   falling   if what an item rests on goes anyway (over the rail, shot, sent back, taken onto
 *             another boat), it drops onto the deck or the ground where it is.
 *
 * Plain data like the rest (the link travels in the snapshots with the item).
 */
import { CONFIG } from '../config';
import type { EntityId } from '../core/ids';
import type { WorldState } from '../core/world';
import { standingHeight } from '../world/geography';
import { aboard, deckHeightAt, kindOf, type CargoItem } from './cargo';

type Place = { vessel: EntityId } | 'ground';

/** Does this item's kind stack? */
export function isStackable(item: CargoItem): boolean {
  return CONFIG.cargo.stacking.kinds.includes(kindOf(item)?.name ?? '');
}

/** The item resting on this one, if any (the one above it in its stack, on the same deck or ashore with it). */
export function restingOn(world: WorldState, item: CargoItem): CargoItem | null {
  for (const c of Object.values(world.cargo)) {
    if (!('ground' in c.at || 'vessel' in c.at) || c.at.on !== item.id) continue;
    const same = 'ground' in c.at ? 'ground' in item.at : 'vessel' in item.at && item.at.vessel === c.at.vessel;
    if (same) return c;
  }
  return null;
}

/** The bottom of the stack this item is in (itself, if it stands on the deck or ground). */
export function bottomOf(world: WorldState, item: CargoItem): CargoItem {
  let c = item;
  for (let i = 0; i < CONFIG.cargo.stacking.high && isStackedUp(c); i++) {
    const under = world.cargo[(c.at as { on: string }).on];
    if (!under) break;
    c = under;
  }
  return c;
}

/** How many items high a stack is at this item (1: on the deck or ground itself). */
export function levelOf(world: WorldState, item: CargoItem): number {
  let n = 1;
  let c: CargoItem | undefined = item;
  while (c && ('ground' in c.at || 'vessel' in c.at) && c.at.on && n <= CONFIG.cargo.stacking.high) {
    c = world.cargo[c.at.on];
    n++;
  }
  return n;
}

/** Where an item stands, if it's set down: its base (vessel axes on a deck, world ashore) and yaw. */
function baseOf(c: CargoItem, place: Place): { x: number; y: number; z: number; yaw: number } | null {
  if (place === 'ground') return 'ground' in c.at ? { x: c.at.ground[0], y: c.at.ground[1], z: c.at.ground[2], yaw: c.at.yaw } : null;
  return 'vessel' in c.at && c.at.vessel === place.vessel ? { x: c.at.pos[0], y: c.at.pos[1], z: c.at.pos[2], yaw: c.at.yaw } : null;
}

/**
 * The top of a stack of this kind with room on it, within `stacking.reach` of (x, z) on a
 * vessel's deck (her axes) or ashore (world): the nearest. Null if none (or the kind doesn't stack).
 */
export function stackTopNear(world: WorldState, item: CargoItem, place: Place, x: number, z: number): CargoItem | null {
  if (!isStackable(item)) return null;
  const s = CONFIG.cargo.stacking;
  const pool = place === 'ground' ? Object.values(world.cargo) : aboard(world, place.vessel);
  let best: CargoItem | null = null;
  let bd = s.reach;
  for (const c of pool) {
    if (c.id === item.id || c.kind !== item.kind) continue;
    const b = baseOf(c, place);
    if (!b) continue;
    const d = Math.hypot(b.x - x, b.z - z);
    if (d >= bd || restingOn(world, c) || levelOf(world, c) >= s.high) continue;
    [best, bd] = [c, d];
  }
  return best;
}

/** Any stack aboard with room for this item, the nearest to (x, z) (her axes): its top. Null if none. */
export function stackWithRoom(world: WorldState, item: CargoItem, vessel: EntityId, x: number, z: number): CargoItem | null {
  if (!isStackable(item)) return null;
  let best: CargoItem | null = null;
  let bd = Infinity;
  for (const c of aboard(world, vessel)) {
    if (c.id === item.id || c.kind !== item.kind || !('vessel' in c.at) || restingOn(world, c) || levelOf(world, c) >= CONFIG.cargo.stacking.high) continue;
    const d = Math.hypot(c.at.pos[0] - x, c.at.pos[2] - z);
    if (d < bd) [best, bd] = [c, d];
  }
  return best;
}

/** Put an item on top of another (the top of its stack), square with it. */
export function setOnTop(item: CargoItem, top: CargoItem): void {
  const h = kindOf(top).size[1];
  if ('ground' in top.at) item.at = { ground: [top.at.ground[0], top.at.ground[1] + h, top.at.ground[2]], yaw: top.at.yaw, on: top.id };
  else if ('vessel' in top.at) item.at = { vessel: top.at.vessel, pos: [top.at.pos[0], top.at.pos[1] + h, top.at.pos[2]], yaw: top.at.yaw, vel: [0, 0], lashed: top.at.lashed, on: top.id };
}

/** Is this item resting on another (not the bottom of its stack)? */
export function isStackedUp(item: CargoItem): boolean {
  return ('ground' in item.at || 'vessel' in item.at) && !!item.at.on;
}

/**
 * Each tick: everything resting on something rides on it (its place, yaw, sliding speed and
 * lashing), bottom up; an item whose support has gone (or gone somewhere else) drops onto the
 * deck or the ground where it is.
 */
export function followStacks(world: WorldState): void {
  const up = Object.values(world.cargo).filter(isStackedUp);
  if (!up.length) return;
  // Bottom up: lower items first, so a stack three high follows in one tick.
  up.sort((a, b) => levelOf(world, a) - levelOf(world, b));
  for (const c of up) {
    const at = c.at as Extract<CargoItem['at'], { on?: string }>;
    const under = at.on ? world.cargo[at.on] : undefined;
    const sameDeck = under && 'vessel' in c.at && 'vessel' in under.at && under.at.vessel === c.at.vessel;
    const sameGround = under && 'ground' in c.at && 'ground' in under.at;
    if (under && (sameDeck || sameGround)) {
      setOnTop(c, under);
      continue;
    }
    // Its support's gone: down where it is.
    if ('vessel' in c.at && world.vessels[c.at.vessel]) {
      const p = c.at.pos;
      c.at = { vessel: c.at.vessel, pos: [p[0], deckHeightAt(world.vessels[c.at.vessel].defId, p[2]), p[2]], yaw: c.at.yaw, vel: c.at.vel, lashed: false };
    } else if ('ground' in c.at) {
      const g = c.at.ground;
      c.at = { ground: [g[0], standingHeight(g[0], g[2]), g[2]], yaw: c.at.yaw };
    }
  }
}

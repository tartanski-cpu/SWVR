/**
 * A crew area you can go into (owner, 29 Oct 2026: "a detailed interior for the big tug's crew
 * area, same treatment as the engine room, and it loads as a separate space"; "two decks, if
 * you can make it work"). This works out where one fits in a boat, from her own deckhouse, her
 * hull and her engine room: plain numbers in her axes (x across, + to starboard; y up; z along,
 * + aft), no drawing. Everything follows the Shipyard's house, so a deckhouse made longer or
 * narrower gives a bigger or smaller crew area, never one sticking out of it.
 *
 *   main deck   inside her deckhouse's walls: a level floor at her highest deck under the
 *               house (the deck has sheer: aft, the door's sill and a step up make the
 *               difference), up to the deckhead under the house's top. In by a weathertight
 *               door in its aft face, from her working deck, on the side away from the
 *               outside stair up to the house's top.
 *   lower deck  below her main deck, forward of her engine room's forward bulkhead, back from
 *               her forepeak: a level sole with standing headroom under her lowest deck over
 *               it, as wide as her hull allows at the sole. Only with an engine room (its
 *               bulkhead is the lower deck's aft end) and room for two cabins and a corridor.
 *   the stair   down from the main deck to the lower, on her centreline, its head at the
 *               main deck's aft end of the two decks' overlap, its foot forward, as steep as a
 *               ship's stair may be to fit. No stair, no lower deck.
 *
 * CONFIG.crewArea. A boat whose house doesn't give that (too small, or none) has none.
 */
import { CONFIG } from '../../../config';
import type { HullForm } from '../../../vessel/hullForm';
import { hullPlan } from '../../../vessel/layout';
import type { LayoutConfig } from '../../../vessel/vesselDef';
import { insideHalf, type EngineRoomPlan } from '../plan';

export interface CrewDeck {
  /** Half its width (on her centreline), its ends along her, its floor and its deckhead (m). */
  halfWidth: number;
  z0: number;
  z1: number;
  floor: number;
  deckhead: number;
}

export interface CrewAreaPlan {
  main: CrewDeck;
  /** The weathertight door in the deckhouse's aft face: its middle across (x), the wall's inside face (z), the deck outside's height there. */
  door: { x: number; z: number; deck: number; width: number; height: number };
  /** The lower deck, and the stair down to it; null: the main deck only. */
  lower: CrewDeck | null;
  /** On her centreline (x), `width` wide: from its head at `zTop` (the main floor, `top`) down `steps` steps of `rise`, each `tread` long, its foot at `zFoot` (the lower sole, `foot`). */
  stair: { x: number; width: number; zTop: number; zFoot: number; top: number; foot: number; steps: number; rise: number; tread: number } | null;
}

/**
 * Her crew area, or null where none fits (see above). `room`: her engine room (engineRoom/plan.ts),
 * whose forward bulkhead is the lower deck's aft end.
 */
export function crewAreaPlan(def: { hull: HullForm; layout: LayoutConfig }, room: EngineRoomPlan | null): CrewAreaPlan | null {
  const c = CONFIG.crewArea;
  const dh = def.layout.deckhouse;
  const hull = def.hull;
  if (!dh || dh.well || hull.catamaran) return null;
  const hp = hullPlan(def);
  const loa = hp.transom - hp.stem;
  if (loa < c.minLoaM) return null;
  // ── The main deck: inside the deckhouse's walls, level at her highest deck under it. ──
  const m = c.main;
  let floor = -Infinity;
  for (let z = dh.z0; z <= dh.z1 + 1e-6; z += 0.25) floor = Math.max(floor, hp.deckY(z));
  const deckhead = dh.top - m.deckheadDrop;
  // (A raked front leans in over the floor: the room starts where its foot is clear overhead.)
  const rake = Math.tan(((dh.rakeDeg ?? 0) * Math.PI) / 180) * (dh.top - floor);
  const z0 = dh.z0 + m.wall + Math.max(0, rake);
  const z1 = dh.z1 - m.wall;
  const halfWidth = Math.min(...dh.plan.filter(([z]) => z >= z0 - 0.3 && z <= z1 + 0.3).map(([, w]) => w)) - m.wall;
  if (z1 - z0 < m.minLength || 2 * halfWidth < m.minWidth || deckhead - floor < m.minHeadroom) return null;
  const main: CrewDeck = { halfWidth, z0, z1, floor, deckhead };
  // ── The door: in the aft face, on the side away from the outside stair up to the house's top. ──
  const steps = (dh.walk?.stair ?? []).filter((s) => s.y < dh.top - 0.05);
  const stairSide = steps.length ? Math.sign(steps.reduce((a, s) => a + (s.x0 + s.x1) / 2, 0)) || 1 : 1;
  const doorX = -stairSide * Math.max(0, Math.min(2.2, halfWidth - 0.9));
  const door = { x: doorX, z: z1, deck: hp.deckY(dh.z1 + 0.4), width: c.door.width, height: c.door.height };
  // ── The lower deck: forward of the engine room, back from the forepeak. ──
  const lo = c.lower;
  const lowerOf = (): { lower: CrewDeck; stair: NonNullable<CrewAreaPlan['stair']> } | null => {
    if (!room || def.layout.cabin) return null;
    const lz1 = room.z0 - 0.05;
    let lz0 = hp.stem + lo.forepeakShare * loa;
    if (lz1 - lz0 < lo.minLength) return null;
    // Its deckhead under her lowest deck over it (and under the main deck's floor).
    let deck = floor;
    for (let z = lz0; z <= lz1 + 1e-6; z += 0.25) deck = Math.min(deck, hp.deckY(z));
    const ldh = deck - lo.deckDrop;
    const sole = ldh - lo.headroom;
    // Narrow forward: start it where her hull's wide enough at the sole.
    const half = (z: number) => insideHalf(hull, z, sole + 0.05) - lo.lining;
    while (lz0 < lz1 && half(lz0) < lo.minHalf) lz0 += 0.25;
    if (lz1 - lz0 < lo.minLength) return null;
    let lhw = Infinity;
    for (let z = lz0; z <= lz1 + 1e-6; z += 0.25) lhw = Math.min(lhw, half(z));
    // The stair: its head at the aft end of the two decks' overlap, its foot forward, leaving
    // room forward of it for the corridor across and the rooms beyond (at least 2 m).
    const s = c.stair;
    const zTop = Math.min(z1, lz1) - 0.05;
    const rise = floor - sole;
    const n = Math.ceil(rise / s.maxRise);
    const furthest = Math.max(z0 + 0.05, lz0 + 2.0 + c.rooms.corridor);
    const tread = Math.min(s.tread, (zTop - furthest) / (n - 1));
    if (tread < s.minTread) return null;
    const lower: CrewDeck = { halfWidth: lhw, z0: lz0, z1: lz1, floor: sole, deckhead: ldh };
    return { lower, stair: { x: 0, width: s.width, zTop, zFoot: zTop - (n - 1) * tread, top: floor, foot: sole, steps: n, rise: rise / n, tread } };
  };
  const below = lowerOf();
  return { main, door, lower: below?.lower ?? null, stair: below?.stair ?? null };
}

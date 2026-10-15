/**
 * Walkable areas, in the frame of whatever the player stands on (vessel axes aboard, world
 * axes on the platform). Several floor LEVELS can overlap in plan (deck, wheelhouse floor,
 * wheelhouse roof), and ladders join them. Locomotion asks:
 *
 *   floorsAt(x, z)        heights of the floor surfaces at this point
 *   walkable(x, z, y)     may a body standing at feet height y be here? (only floors within a
 *                         step of y count, so the roof doesn't make the deck below walkable)
 *   ladderAt(x, z)        is there a ladder here? (bottom/top feet heights)
 *   insideSolid(x, y, z)  is the head inside structure? (room-scale: fade to black)
 *
 * The vessel version is derived from the hull stations and the layout block in the config,
 * the same numbers the geometry is built from.
 */
import { CONFIG } from '../config';
import type { VesselDef } from './vesselDef';

export interface Ladder {
  bottom: number;
  top: number;
}

export interface WalkArea {
  floorsAt(x: number, z: number): number[];
  walkable(x: number, z: number, y: number): boolean;
  ladderAt(x: number, z: number): Ladder | null;
  insideSolid(x: number, y: number, z: number): boolean;
}

/** Largest rise you can just step up (door sills, deck sheer) without climbing (m). */
export const STEP_HEIGHT = 0.4;

import type { LayoutConfig } from './vesselDef';
export type { LayoutConfig };

/** Linear interpolation of a per-station quantity at longitudinal position z. */
function stationLerp(def: VesselDef, z: number, get: (i: number) => number): number {
  const st = def.hull.stations; // ordered transom (z max) -> stem (z min)
  if (z >= st[0].z) return get(0);
  for (let i = 0; i < st.length - 1; i++) {
    if (z <= st[i].z && z >= st[i + 1].z) {
      const t = (st[i].z - z) / (st[i].z - st[i + 1].z);
      return get(i) + (get(i + 1) - get(i)) * t;
    }
  }
  return get(st.length - 1);
}

/**
 * The hull in plan, vessel axes: half-beam at deck level and deck height at z, and the
 * transom and stem positions. Used for swimmers (pushed clear of the hull, climbing out).
 */
export function hullPlan(def: VesselDef): { halfBeam(z: number): number; deckY(z: number): number; transom: number; stem: number } {
  const st = def.hull.stations;
  return {
    halfBeam: (z) => stationLerp(def, z, (i) => st[i].halfBeamDeck),
    deckY: (z) => stationLerp(def, z, (i) => st[i].polygon[0][1]),
    transom: st[0].z,
    stem: st[st.length - 1].z,
  };
}

interface Surface {
  height(x: number, z: number): number;
  contains(x: number, z: number): boolean;
}

/** A boat with no wheelhouse (the skiff): just its deck, inside the gunwale. */
function openDeckWalkArea(def: VesselDef, layout: LayoutConfig): WalkArea {
  const st = def.hull.stations;
  const transom = st[0].z;
  const stem = st[st.length - 1].z;
  const deckHalfBeam = (z: number) => stationLerp(def, z, (i) => st[i].halfBeamDeck);
  const deckY = (z: number) => stationLerp(def, z, (i) => st[i].polygon[0][1]);
  const m = layout.deckEdgeMargin;
  const on = (x: number, z: number) => z <= transom - m && z >= stem + 2 * m && Math.abs(x) <= deckHalfBeam(z) - m;
  return {
    floorsAt: (x, z) => (on(x, z) ? [deckY(z)] : []),
    walkable: (x, z, y) => on(x, z) && Math.abs(deckY(z) - y) <= STEP_HEIGHT,
    ladderAt: () => null,
    insideSolid: (x, y, z) => z <= transom && z >= stem && Math.abs(x) <= deckHalfBeam(z) && y < deckY(z) - 0.15,
  };
}

export function vesselWalkArea(def: VesselDef, layout: LayoutConfig): WalkArea {
  if (!layout.wheelhouse || !layout.roof || !layout.ladder) return openDeckWalkArea(def, layout);
  const wh = layout.wheelhouse;
  const r = layout.bodyRadius;
  const st = def.hull.stations;
  const transom = st[0].z;
  const deckHalfBeam = (z: number) => stationLerp(def, z, (i) => st[i].halfBeamDeck);
  const deckY = (z: number) => stationLerp(def, z, (i) => st[i].polygon[0][1]);

  // Wheelhouse boxes (x is symmetric about the centreline).
  const ext = { x: wh.halfWidth, z0: wh.front, z1: wh.aft };
  const int = { x: wh.halfWidth - wh.wall, z0: wh.front + wh.wall, z1: wh.aft - wh.wall };
  const consoleAft = int.z0 + wh.consoleDepth;
  const doorHalf = wh.doorWidth / 2;
  const inHouseFootprint = (x: number, z: number) => Math.abs(x) <= ext.x && z >= ext.z0 && z <= ext.z1;
  // Furniture standing on the wheelhouse floor: the chart table (if she has one).
  const ct = def.chartTable;
  const atTable = (x: number, z: number, pad: number) => !!ct && x >= ct.x0 - pad && x <= ct.x1 + pad && z >= ct.z0 - pad && z <= ct.z1 + pad;

  // Roof (walkable, railed) and the ladder up the aft face of the wheelhouse.
  const roof = layout.roof;
  const roofTop = wh.roofY + roof.thickness;
  const lad = layout.ladder;
  const inLadder = (x: number, z: number) => Math.abs(x - lad.x) <= lad.width / 2 && z >= ext.z1 + 0.02 && z <= ext.z1 + lad.depth;

  const surfaces: Surface[] = [
    {
      // Open deck: inside the bulwarks, aft of the bow, clear of the wheelhouse exterior.
      height: (_x, z) => deckY(z),
      contains: (x, z) => {
        const onDeck = z <= transom - layout.deckEdgeMargin && Math.abs(x) <= deckHalfBeam(z) - layout.deckEdgeMargin;
        const nearHouse = Math.abs(x) < ext.x + r && z > ext.z0 - r && z < ext.z1 + r;
        return onDeck && !nearHouse;
      },
    },
    {
      // Wheelhouse floor, clear of walls and console, plus the aft doorway.
      height: () => wh.floorY,
      contains: (x, z) =>
        (Math.abs(x) <= int.x - r && z >= consoleAft + r && z <= int.z1 - r && !atTable(x, z, r)) ||
        (Math.abs(x) <= doorHalf - r * 0.6 && z > int.z1 - r - 0.02 && z < ext.z1 + r + 0.02),
    },
    {
      // Wheelhouse roof inside its rail, around the mast, plus the landing at the ladder head.
      height: () => roofTop,
      contains: (x, z) => {
        const m = roof.edgeMargin;
        const onRoof = Math.abs(x) <= ext.x + roof.overhang - m && z >= ext.z0 - roof.overhang + m && z <= ext.z1 - m;
        const atMast = Math.abs(x) < 0.25 && Math.abs(z - 0.4) < 0.25;
        const landing = Math.abs(x - lad.x) <= lad.width / 2 && z > ext.z1 - 0.5 && z <= ext.z1 + 0.05;
        return (onRoof && !atMast) || landing;
      },
    },
  ];

  return {
    floorsAt(x, z) {
      return surfaces.filter((s) => s.contains(x, z)).map((s) => s.height(x, z));
    },

    walkable(x, z, y) {
      if (inLadder(x, z)) return true;
      return surfaces.some((s) => s.contains(x, z) && Math.abs(s.height(x, z) - y) <= STEP_HEIGHT);
    },

    ladderAt(x, z) {
      return inLadder(x, z) ? { bottom: deckY(ext.z1 + lad.depth / 2), top: roofTop } : null;
    },

    insideSolid(x, y, z) {
      const ax = Math.abs(x);
      if (!inHouseFootprint(x, z)) {
        // Below the open deck, within the hull.
        return z <= transom && ax <= deckHalfBeam(z) && y < deckY(z) - 0.15;
      }
      if (y < wh.floorY - 0.15) return true; // below the wheelhouse floor
      if (y > roofTop + 0.05) return false; // above the roof
      if (y > wh.roofY - 0.05) return true; // in the roof slab
      const inInterior = ax < int.x && z > int.z0 && z < int.z1;
      if (inInterior) {
        // The helm console across the front, and the chart table.
        if (ct && atTable(x, z, 0) && y < wh.floorY + ct.height) return true;
        return z < consoleAft && y < wh.floorY + wh.consoleHeight;
      }
      // In a wall: the doorway and window band are open.
      const hy = y - wh.floorY;
      if (z >= int.z1 && ax < doorHalf && hy < wh.doorHeight) return false;
      if (hy > wh.windowSill && hy < wh.windowHead) return false;
      return true;
    },
  };
}

/** The pile-mounted test platform (world axes): a square deck with handrails. */
export function platformWalkArea(): WalkArea {
  const half = CONFIG.testScene.platformHalfSize - 0.3;
  const h = CONFIG.testScene.platformDeckHeight;
  const on = (x: number, z: number) => Math.abs(x) <= half && Math.abs(z) <= half;
  return {
    floorsAt: (x, z) => (on(x, z) ? [h] : []),
    walkable: (x, z, y) => on(x, z) && Math.abs(y - h) <= STEP_HEIGHT,
    ladderAt: () => null,
    insideSolid: () => false,
  };
}

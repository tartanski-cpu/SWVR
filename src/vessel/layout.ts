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
  /**
   * Inside the boat's outer edge (the bulwarks, the stem, the transom) in plan: the fence
   * for VR movement, which otherwise ignores walls (owner request: in VR you can't slide off
   * the boat, but you can move through the wheelhouse). Absent: no fence (ashore, swimming).
   */
  inBounds?(x: number, z: number): boolean;
  /** Open or shut the engine hatch in the wheelhouse floor (open: its hole isn't walkable). */
  setHatchOpen?(open: boolean): void;
  /** The chart table's leaf folded against the wall (the floor in front of it is free). */
  setChartLeafFolded?(folded: boolean): void;
}

/** How far inside the deck edge the VR fence stands (m): the bulwark and its rail. */
const FENCE = 0.15;

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

/**
 * Gear standing on the open deck that you can't walk through or stand cargo on (vessel
 * axes): the tender's cradle (with her in it) and the crane's column on the foredeck, the
 * tow winch (with its gearbox housing) and the A-frame's feet on the aft deck. Is (x, z)
 * within `pad` m of any of it?
 */
export function onDeckGear(def: VesselDef, x: number, z: number, pad: number): boolean {
  const tc = def.tenderCrane;
  if (tc) {
    if (Math.abs(x - tc.stow[0]) < tc.cradle.halfWidth + pad && z > tc.cradle.z0 - pad && z < tc.cradle.z1 + pad) return true;
    if (Math.hypot(x - tc.column[0], z - tc.column[1]) < tc.columnRadius + pad) return true;
  }
  const tw = def.towWinch;
  if (tw) {
    // The drum between its cheeks, and the gearbox housing on its starboard end.
    const hw = tw.drumWidth / 2;
    if (x > -hw - 0.12 - pad && x < hw + 0.1 + tw.housing.width + pad && Math.abs(z - tw.z) < 0.25 + pad) return true;
  }
  const af = def.fishing?.aFrame;
  if (af) {
    // The A-frame's feet and its braces' feet on the quarters.
    const plan = hullPlan(def);
    const footZ = plan.transom - af.footFromTransom;
    const x0 = plan.halfBeam(footZ) - af.footInset;
    for (const fz of [footZ, footZ - af.braceForward]) if (Math.hypot(Math.abs(x) - x0, z - fz) < 0.12 + pad) return true;
  }
  return false;
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
    inBounds: (x, z) => z <= transom - FENCE && z >= stem + FENCE && Math.abs(x) <= deckHalfBeam(z) - FENCE,
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
  // Furniture on the wheelhouse floor: the chart table (if she has one), footprint and height
  // above the floor. Its leaf folded down against the wall, only a strip along the wall is
  // taken up.
  const ct = def.chartTable;
  let leafFolded = false;
  // The engine hatch in the floor: open, its hole can't be walked into (you can still stand
  // where you were if it opened under you; you just can't step onto it).
  const hatch = layout.engineHatch;
  let hatchOpen = false;
  const inHatch = (x: number, z: number) => !!hatch && hatchOpen && x > hatch.x0 - r * 0.3 && x < hatch.x1 + r * 0.3 && z > hatch.z0 - r * 0.3 && z < hatch.z1 + r * 0.3;
  const atFurniture = (x: number, z: number, pad: number, y = -Infinity) =>
    !!ct && x >= ct.x0 - pad && x <= (leafFolded ? ct.x0 + 0.1 : ct.x1) + pad && z >= ct.z0 - pad && z <= ct.z1 + pad && y < wh.floorY + ct.height;

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
        return onDeck && !nearHouse && !onDeckGear(def, x, z, r);
      },
    },
    {
      // Wheelhouse floor, clear of walls and console, plus the aft doorway.
      height: () => wh.floorY,
      contains: (x, z) =>
        (Math.abs(x) <= int.x - r && z >= consoleAft + r && z <= int.z1 - r && !atFurniture(x, z, r)) ||
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
      if (inHatch(x, z) && Math.abs(y - wh.floorY) <= STEP_HEIGHT) return false;
      return surfaces.some((s) => s.contains(x, z) && Math.abs(s.height(x, z) - y) <= STEP_HEIGHT);
    },

    setHatchOpen(open) {
      hatchOpen = open;
    },

    setChartLeafFolded(folded) {
      leafFolded = folded;
    },

    ladderAt(x, z) {
      return inLadder(x, z) ? { bottom: deckY(ext.z1 + lad.depth / 2), top: roofTop } : null;
    },

    inBounds(x, z) {
      return z <= transom - FENCE && z >= st[st.length - 1].z + FENCE && Math.abs(x) <= deckHalfBeam(z) - FENCE;
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
        // The helm console across the front, and the furniture.
        if (atFurniture(x, z, 0, y)) return true;
        return z < consoleAft && y < wh.floorY + wh.consoleHeight;
      }
      // In a wall: the doorway and window band are open.
      const hy = y - wh.floorY;
      if (z >= int.z1 && ax < doorHalf && hy < wh.doorHeight) return false;
      // The front's glass starts higher (frontSill, level with the dash top).
      const sillHere = z < int.z0 ? (wh.frontSill ?? wh.windowSill) : wh.windowSill;
      if (hy > sillHere && hy < wh.windowHead) return false;
      return true;
    },
  };
}


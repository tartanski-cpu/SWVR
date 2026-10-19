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
import { inDeckhouse } from './deckhouse';
import { gearOf } from '../boats/sims';
import type { GearFootprint } from '../modular/module';
import type { HullForm } from './hullForm';
import { houseFloorAt, type VesselDef } from './vesselDef';

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
  /** The working-deck gate open (layout.sideGate): you can walk out to the deck edge in it. */
  setGateOpen?(open: boolean): void;
}

/** How far inside the deck edge the VR fence stands (m): the bulwark and its rail. */
const FENCE = 0.15;

/** Largest rise you can just step up (door sills, deck sheer) without climbing (m). */
export const STEP_HEIGHT = 0.4;

import type { LayoutConfig } from './vesselDef';
export type { LayoutConfig };

/** Linear interpolation of a per-station quantity at longitudinal position z. */
function stationLerp(def: { hull: HullForm }, z: number, get: (i: number) => number): number {
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
export function hullPlan(def: { hull: HullForm }): { halfBeam(z: number): number; deckY(z: number): number; transom: number; stem: number } {
  const st = def.hull.stations;
  return {
    halfBeam: (z) => stationLerp(def, z, (i) => st[i].halfBeamDeck),
    deckY: (z) => stationLerp(def, z, (i) => st[i].polygon[0][1]),
    transom: st[0].z,
    stem: st[st.length - 1].z,
  };
}

/**
 * Is (x, z) within `pad` m of any of a boat's gear (its modules' footprints, vessel axes:
 * the tender's cradle and the crane's column, the tow winch, the A-frame's feet, the mast)?
 * With a floor height `y`, only gear standing at that level counts: a footprint blocks
 * floors from a step below its foot up to its top (the mast on the roof leaves the deck
 * below clear).
 */
export function onGear(gear: readonly GearFootprint[], x: number, z: number, pad: number, y?: number): boolean {
  for (const f of gear) {
    if (y !== undefined && !(y < f.top && y >= (f.base ?? -Infinity) - STEP_HEIGHT)) continue;
    if ('r' in f) {
      if (Math.hypot(x - f.x, z - f.z) < f.r + pad) return true;
    } else if (x > f.x0 - pad && x < f.x1 + pad && z > f.z0 - pad && z < f.z1 + pad) return true;
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

/**
 * @param gear  where her gear stands solid (her modules' footprints, boats/sims footprintsOf):
 *              kept clear of on deck and roof
 */
export function vesselWalkArea(def: VesselDef, layout: LayoutConfig, gear: readonly GearFootprint[] = []): WalkArea {
  if (!layout.wheelhouse || !layout.roof) return openDeckWalkArea(def, layout);
  const wh = layout.wheelhouse;
  const r = layout.bodyRadius;
  const st = def.hull.stations;
  const transom = st[0].z;
  const deckHalfBeam = (z: number) => stationLerp(def, z, (i) => st[i].halfBeamDeck);
  const deckY = (z: number) => stationLerp(def, z, (i) => st[i].polygon[0][1]);

  // Wheelhouse boxes (x is symmetric about the centreline). A shaped house's front below the
  // windows leans forward (to the windows' foot): the deck is kept clear of all of it.
  const sh = wh.shape;
  const ahead = sh ? Math.max(0, wh.floorY + (wh.frontSill ?? wh.windowSill) - sh.lowerFromY) * Math.tan((sh.lowerRakeDeg * Math.PI) / 180) : 0;
  const ext = { x: wh.halfWidth, z0: wh.front - ahead, z1: wh.aft };
  const int = { x: wh.halfWidth - wh.wall, z0: wh.front + wh.wall, z1: wh.aft - wh.wall };
  // A faceted front's console wraps round with it (vesselDef.ts HouseShape.facet): its wings
  // set back with the outer panes, so its aft edge is further aft toward the sides.
  const facet = wh.shape?.facet;
  const wrapK = facet ? facet.depth / (wh.halfWidth - facet.centre) : 0;
  const consoleAftAt = (x: number) => int.z0 + (wh.consoleBack ?? 0) + wh.consoleDepth + (facet ? Math.max(0, Math.abs(x) - facet.centre) * wrapK : 0);
  const doorHalf = wh.doorWidth / 2;
  const sd = wh.sideDoor;
  // The floor's height along the house (one level, or several with treads between: levels).
  const floorAt = (z: number) => houseFloorAt(wh, Math.min(Math.max(z, wh.front), wh.aft));
  // Openings in the house floor (a companionway): the floor isn't there, to half a body in.
  const holes = wh.floorHoles ?? [];
  const inHole = (x: number, z: number) => holes.some((o) => x > o.x0 - r * 0.5 && x < o.x1 + r * 0.5 && z > o.z0 - r * 0.5 && z < o.z1 + r * 0.5);
  // Open space below the deck or the floor (the fore cabin, the companionway).
  const hollows = layout.hollows ?? [];
  const inHollow = (x: number, y: number, z: number) => hollows.some((o) => x > o.x0 && x < o.x1 && y > o.y0 && y < o.y1 && z > o.z0 && z < o.z1);
  // The deck cut away forward of the house (a cabin under a trunk cabin there): not deck.
  const op = layout.deckOpening;
  const inOpening = (x: number, z: number) => !!op && z < wh.front + r && z > op.front - r && Math.abs(x) < deckHalfBeam(z) - op.inset + r;
  // A deckhouse under the wheelhouse (vessel/deckhouse.ts): solid, and not walked on, for now.
  const dh = layout.deckhouse;
  const inHouseFootprint = (x: number, z: number) => Math.abs(x) <= ext.x && z >= ext.z0 && z <= ext.z1;
  // A floor sunk more than a step below the deck at the door (a Shipyard design's): steps inside.
  const deepSunk = deckY(ext.z1) - floorAt(ext.z1) > 0.35;
  // Furniture on the wheelhouse floor: the chart table (if she has one: a module, its plan in
  // her axes), footprint and height above the floor. Its leaf folded down against the wall,
  // only a strip along the wall is taken up.
  const ct = gearOf({ defId: def.id }, 'chartTable');
  let leafFolded = false;
  // The engine hatch in the floor: open, its hole can't be walked into (you can still stand
  // where you were if it opened under you; you just can't step onto it).
  const hatch = layout.engineHatch;
  let hatchOpen = false;
  const inHatch = (x: number, z: number) => !!hatch && hatchOpen && x > hatch.x0 - r * 0.3 && x < hatch.x1 + r * 0.3 && z > hatch.z0 - r * 0.3 && z < hatch.z1 + r * 0.3;
  const atFurniture = (x: number, z: number, pad: number, y = -Infinity) =>
    !!ct && x >= ct.x0 - pad && x <= (leafFolded ? ct.x0 + 0.1 : ct.x1) + pad && z >= ct.z0 - pad && z <= ct.z1 + pad && y < wh.floorY + ct.height;

  // The working-deck gate: open, the gateway is walkable right out to the deck edge.
  const gate = layout.sideGate;
  let gateOpen = false;
  const inGateway = (x: number, z: number, edge: number) =>
    !!gate && gateOpen && Math.sign(x) === gate.side && z > gate.z0 + r * 0.6 && z < gate.z1 - r * 0.6 && Math.abs(x) <= deckHalfBeam(z) - edge;

  // Roof (walkable, railed) and the ladder up the aft face of the wheelhouse. A house with
  // no ladder (the Shipyard's) has no way up: its roof isn't walked.
  const roof = layout.roof;
  const roofTop = wh.roofY + roof.thickness;
  const lad = layout.ladder;
  const inLadder = (x: number, z: number) => !!lad && Math.abs(x - lad.x) <= lad.width / 2 && z >= ext.z1 + 0.02 && z <= ext.z1 + lad.depth;

  // Steps at the aft door (a raised floor's outside, a deep sunk floor's inside): solid
  // blocks across the doorway. Under them is neither deck nor cabin floor, so you climb them
  // rather than walk through them at deck height (owner: you passed through them).
  const steps = wh.steps ?? [];
  const stepsZ0 = Math.min(...steps.map((st) => st.z0));
  const stepsZ1 = Math.max(...steps.map((st) => st.z1));
  const inSteps = (x: number, z: number) => steps.length > 0 && Math.abs(x) <= doorHalf + r * 0.5 && z >= stepsZ0 && z <= stepsZ1;

  const surfaces: Surface[] = [
    {
      // Open deck: inside the bulwarks, aft of the bow, clear of the wheelhouse exterior and its door steps.
      height: (_x, z) => deckY(z),
      contains: (x, z) => {
        const onDeck = (z <= transom - layout.deckEdgeMargin && Math.abs(x) <= deckHalfBeam(z) - layout.deckEdgeMargin) || inGateway(x, z, 0.08);
        const nearHouse = Math.abs(x) < ext.x + r && z > ext.z0 - r && z < ext.z1 + r;
        const nearDeckhouse = !!dh && inDeckhouse(dh, x, z, r);
        return onDeck && !nearHouse && !nearDeckhouse && !inOpening(x, z) && !inSteps(x, z) && !onGear(gear, x, z, r, deckY(z));
      },
    },
    {
      // Wheelhouse floor, clear of walls and console, plus the aft doorway (out to the deck;
      // a floor sunk more than a step below the deck stops at the wall: a threshold below).
      height: (_x, z) => floorAt(z),
      contains: (x, z) =>
        (Math.abs(x) <= int.x - r && z >= consoleAftAt(Math.abs(x) + r) + r && z <= int.z1 - r && !atFurniture(x, z, r) && !inSteps(x, z) && !inHole(x, z)) ||
        (Math.abs(x) <= doorHalf - r * 0.6 && z > int.z1 - r - 0.02 && z < (deepSunk ? int.z1 : ext.z1 + r + 0.02)) ||
        // The port side door, out to the side deck.
        (!!sd && x < -int.x + r + 0.02 && x > -ext.x - r - 0.02 && z > sd.z0 + r * 0.6 && z < sd.z1 - r * 0.6),
    },
    {
      // Wheelhouse roof inside its rail, around what stands on it (the mast), plus the
      // landing at the ladder head.
      height: () => roofTop,
      contains: (x, z) => {
        if (!lad) return false;
        const m = roof.edgeMargin;
        const onRoof = Math.abs(x) <= ext.x + roof.overhang - m && z >= ext.z0 - roof.overhang + m && z <= ext.z1 - m;
        const landing = Math.abs(x - lad.x) <= lad.width / 2 && z > ext.z1 - 0.5 && z <= ext.z1 + 0.05;
        return (onRoof && !onGear(gear, x, z, 0, roofTop)) || landing;
      },
    },
    // A deep sunk floor's threshold: the doorway at the deck's height, its steps inside.
    {
      height: (_x, z) => deckY(Math.max(z, ext.z1)),
      contains: (x, z) => deepSunk && Math.abs(x) <= doorHalf - r * 0.6 && z >= int.z1 && z < ext.z1 + r + 0.02,
    },
    // Other floors (the companionway's treads, the fore cabin's sole), a little short of
    // their edges each way so you don't stand half off them.
    ...(layout.extraFloors ?? []).map(
      (f): Surface => ({
        height: () => f.y,
        contains: (x, z) => x >= f.x0 + r * 0.5 && x <= f.x1 - r * 0.5 && z >= f.z0 && z <= f.z1,
      }),
    ),
    // The steps' treads, their full width (and as far out as the deck and floor are kept off
    // them, so their sides are no gap).
    ...steps.map(
      (st): Surface => ({
        height: () => st.y,
        contains: (x, z) => Math.abs(x) <= doorHalf + r * 0.5 && z >= st.z0 && z <= st.z1,
      }),
    ),
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

    setGateOpen(open) {
      gateOpen = open;
    },

    ladderAt(x, z) {
      return lad && inLadder(x, z) ? { bottom: deckY(ext.z1 + lad.depth / 2), top: roofTop } : null;
    },

    inBounds(x, z) {
      if (inGateway(x, z, 0.02)) return true;
      return z <= transom - FENCE && z >= st[st.length - 1].z + FENCE && Math.abs(x) <= deckHalfBeam(z) - FENCE;
    },

    insideSolid(x, y, z) {
      const ax = Math.abs(x);
      if (inHollow(x, y, z)) return false; // the fore cabin, the companionway
      if (!inHouseFootprint(x, z)) {
        // The deckhouse (solid, for now) up to its top.
        if (dh && inDeckhouse(dh, x, z) && y < dh.top) return true;
        // Below the open deck, within the hull.
        return z <= transom && ax <= deckHalfBeam(z) && y < deckY(z) - 0.15;
      }
      if (y < floorAt(z) - 0.15) return true; // below the wheelhouse floor
      if (y > roofTop + 0.05) return false; // above the roof
      if (y > wh.roofY - 0.05) return true; // in the roof slab
      const inInterior = ax < int.x && z > int.z0 && z < int.z1;
      if (inInterior) {
        // The helm console across the front, and the furniture.
        if (atFurniture(x, z, 0, y)) return true;
        return z < consoleAftAt(x) && y < wh.floorY + wh.consoleHeight;
      }
      // In a wall: the doorway and window band are open.
      const hy = y - floorAt(z);
      if (z >= int.z1 && ax < doorHalf && hy < wh.doorHeight) return false;
      if (sd && x < 0 && z > sd.z0 && z < sd.z1 && hy < sd.height) return false; // the port side doorway
      // The front's glass starts higher (frontSill, level with the dash top).
      const raise = wh.sideRaise;
      const sillHere = z < int.z0 ? (wh.frontSill ?? wh.windowSill) : raise && z < raise.z1 ? raise.height : wh.windowSill;
      if (hy > sillHere && hy < wh.windowHead) return false;
      return true;
    },
  };
}


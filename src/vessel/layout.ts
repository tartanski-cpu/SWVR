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
import { deckhouseLadderZone, inDeckhouse, onDeckhouseTop } from './deckhouse';
import { gearOf } from '../boats/sims';
import type { GearFootprint } from '../modular/module';
import type { HullForm } from './hullForm';
import { houseFloorAt, houseRoofAt, houseX, planHalfWidth, wingCurveY, type VesselDef } from './vesselDef';

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

/** One house's walking (P2a: every house in the list has one). */
interface HouseWalk {
  /** The deck is kept clear of it (a body's radius off its walls). */
  near(x: number, z: number): boolean;
  /** Its door steps' blocks (neither deck nor floor under them). */
  inSteps(x: number, z: number): boolean;
  /** Inside its outside walls, in plan. */
  inFootprint(x: number, z: number): boolean;
  /** Its floor, its roof (the helm house's, by its ladder), a deep sunk floor's threshold. */
  floors: Surface[];
  /** Its door steps' treads. */
  steps: Surface[];
  /** Is a point in its footprint solid (walls, roof slab, under the floor, the console, furniture)? */
  solid(x: number, y: number, z: number): boolean;
  /** The helm house only: its roof ladder (on its aft face), and the roof's top. */
  inLadder(x: number, z: number): boolean;
  ladderAt(): Ladder | null;
}

/**
 * One house's floor, roof, walls and steps for walking. `helm`: the helm's house, which alone
 * has the roof ladder (its roof walkable) and the furniture (the chart table).
 */
function houseWalk(
  def: VesselDef,
  layout: LayoutConfig,
  wh: NonNullable<LayoutConfig['wheelhouse']>,
  helm: boolean,
  gear: readonly GearFootprint[],
  deckY: (z: number) => number,
  live: { leafFolded(): boolean },
): HouseWalk {
  const r = layout.bodyRadius;
  // Where the house stands across her (houseX; a Shipyard house can stand off her centreline):
  // its walls, door, steps, console and floor holes are in its own frame, so a point is taken
  // across from its middle (`L`) for those; her gear and the chart table are in her axes.
  const hx = houseX(wh);
  const L = (x: number) => x - hx;
  // House boxes (x is symmetric about the house's middle). A shaped house's front below the
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
  // Faceted aft windows (HouseShape.aftFacet): the floor's aft edge comes forward with the outer panes.
  const aftFacet = wh.shape?.aftFacet;
  const aftK = aftFacet ? aftFacet.depth / (wh.halfWidth - aftFacet.centre) : 0;
  const aftEdgeAt = (x: number) => int.z1 - (aftFacet ? Math.max(0, Math.abs(x) - aftFacet.centre) * aftK : 0);
  // A console cut short (consoleSpan): is x across from it (within `pad`)? Beside it, the floor runs to the front wall.
  const span = wh.consoleSpan;
  const byConsole = (x: number, pad: number) => !span || (x > span.x0 - pad && x < span.x1 + pad);
  const doorHalf = wh.doorWidth / 2;
  const sd = wh.sideDoor;
  // The floor's height along the house (one level, or several with treads between: levels).
  const floorAt = (z: number) => houseFloorAt(wh, Math.min(Math.max(z, wh.front), wh.aft));
  // Openings in the house floor (a companionway): the floor isn't there, to half a body in.
  const holes = wh.floorHoles ?? [];
  const inHole = (x: number, z: number) => holes.some((o) => L(x) > o.x0 - r * 0.5 && L(x) < o.x1 + r * 0.5 && z > o.z0 - r * 0.5 && z < o.z1 + r * 0.5);
  const inFootprint = (x: number, z: number) => Math.abs(L(x)) <= ext.x && z >= ext.z0 && z <= ext.z1;
  // A floor sunk more than a step below the deck at the door (a Shipyard design's): steps inside.
  const deepSunk = deckY(ext.z1) - floorAt(ext.z1) > 0.35;
  // Furniture on the helm house's floor: the chart table (if she has one: a module, its plan
  // in her axes), footprint and height above the floor. Its leaf folded down against the
  // wall, only a strip along the wall is taken up.
  const ct = helm ? gearOf({ defId: def.id }, 'chartTable') : null;
  const atFurniture = (x: number, z: number, pad: number, y = -Infinity) =>
    !!ct && x >= ct.x0 - pad && x <= (live.leafFolded() ? ct.x0 + 0.1 : ct.x1) + pad && z >= ct.z0 - pad && z <= ct.z1 + pad && y < floorAt((ct.z0 + ct.z1) / 2) + ct.height;
  // Roof (walkable, railed) and the ladder up the aft face of the helm's house. A house with
  // no ladder (the Shipyard's, and every further house) has no way up: its roof isn't walked.
  const roof = layout.roof!;
  const roofTop = wh.roofY + roof.thickness;
  const lad = helm ? layout.ladder : undefined;
  const inLadder = (x: number, z: number) => !!lad && Math.abs(x - lad.x) <= lad.width / 2 && z >= ext.z1 + 0.02 && z <= ext.z1 + lad.depth;
  // Steps at the aft door (a raised floor's outside, a deep sunk floor's inside): solid
  // blocks across the doorway. Under them is neither deck nor cabin floor, so you climb them
  // rather than walk through them at deck height (owner: you passed through them).
  const steps = wh.steps ?? [];
  const stepsZ0 = Math.min(...steps.map((st) => st.z0));
  const stepsZ1 = Math.max(...steps.map((st) => st.z1));
  const inSteps = (x: number, z: number) => steps.length > 0 && Math.abs(L(x)) <= doorHalf + r * 0.5 && z >= stepsZ0 && z <= stepsZ1;

  return {
    near: (x, z) => Math.abs(L(x)) < ext.x + r && z > ext.z0 - r && z < ext.z1 + r,
    inSteps,
    inFootprint,
    inLadder,
    ladderAt: () => (lad ? { bottom: deckY(ext.z1 + lad.depth / 2), top: roofTop } : null),
    floors: [
      {
        // The house floor, clear of walls and console, plus the aft doorway (out to the deck;
        // a floor sunk more than a step below the deck stops at the wall: a threshold below).
        height: (_x, z) => floorAt(z),
        contains: (x, z) =>
          // (Clear of her gear standing on it: furniture, a stack's casing; module footprints at this floor's height.)
          (Math.abs(L(x)) <= int.x - r && z >= (byConsole(L(x), r) ? consoleAftAt(Math.abs(L(x)) + r) + r : int.z0 + r) && z <= aftEdgeAt(Math.abs(L(x)) + r) - r && !atFurniture(x, z, r) && !inSteps(x, z) && !inHole(x, z) && !onGear(gear, x, z, r, floorAt(z))) ||
          (Math.abs(L(x)) <= doorHalf - r * 0.6 && z > int.z1 - r - 0.02 && z < (deepSunk ? int.z1 : ext.z1 + r + 0.02)) ||
          // The port side door, out to the side deck.
          (!!sd && L(x) < -int.x + r + 0.02 && L(x) > -ext.x - r - 0.02 && z > sd.z0 + r * 0.6 && z < sd.z1 - r * 0.6),
      },
      {
        // The roof inside its rail, around what stands on it (the mast), plus the landing at
        // the ladder head.
        height: () => roofTop,
        contains: (x, z) => {
          if (!lad) return false;
          const m = roof.edgeMargin;
          const onRoof = Math.abs(L(x)) <= ext.x + roof.overhang - m && z >= ext.z0 - roof.overhang + m && z <= ext.z1 - m;
          const landing = Math.abs(x - lad.x) <= lad.width / 2 && z > ext.z1 - 0.5 && z <= ext.z1 + 0.05;
          return (onRoof && !onGear(gear, x, z, 0, roofTop)) || landing;
        },
      },
      // A deep sunk floor's threshold: the doorway at the deck's height, its steps inside.
      {
        height: (_x, z) => deckY(Math.max(z, ext.z1)),
        contains: (x, z) => deepSunk && Math.abs(L(x)) <= doorHalf - r * 0.6 && z >= int.z1 && z < ext.z1 + r + 0.02,
      },
    ],
    // The steps' treads, their full width (and as far out as the deck and floor are kept off
    // them, so their sides are no gap).
    steps: steps.map(
      (st): Surface => ({
        height: () => st.y,
        contains: (x, z) => Math.abs(L(x)) <= doorHalf + r * 0.5 && z >= st.z0 && z <= st.z1,
      }),
    ),
    solid(x, y, z) {
      const ax = Math.abs(L(x));
      if (y < floorAt(z) - 0.15) return true; // below the house floor
      // (A lower saloon roof aft of its step: houseRoofAt.)
      const under = houseRoofAt(wh, z);
      if (y > under + roof.thickness + 0.05) return false; // above the roof
      if (y > under - 0.05) return true; // in the roof slab
      const inInterior = ax < int.x && z > int.z0 && z < int.z1;
      if (inInterior) {
        // The helm console across the front, and the furniture.
        if (atFurniture(x, z, 0, y)) return true;
        return byConsole(L(x), 0) && z < consoleAftAt(L(x)) && y < wh.floorY + wh.consoleHeight;
      }
      // In a wall: the doorway and window band are open.
      const hy = y - floorAt(z);
      if (z >= int.z1 && ax < doorHalf && hy < wh.doorHeight) return false;
      if (sd && L(x) < 0 && z > sd.z0 && z < sd.z1 && hy < sd.height) return false; // the port side doorway
      // The front's glass starts higher (frontSill, level with the dash top).
      const raise = wh.sideRaise;
      const sillHere = z < int.z0 ? (wh.frontSill ?? wh.windowSill) : raise && z < raise.z1 ? raise.height : wh.windowSill;
      // The window band's head: as far under the roof here as the wheelhouse's is under its own
      // where a lower saloon roof brings its windows down with it; else from the floor here.
      if (hy > sillHere && (wh.saloonRoof ? y < under - (wh.roofY - wh.floorY - wh.windowHead) : hy < wh.windowHead)) return false;
      return true;
    },
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

  // Open space below the deck or the floor (the fore cabin, the companionway).
  const hollows = layout.hollows ?? [];
  const inHollow = (x: number, y: number, z: number) => hollows.some((o) => x > o.x0 && x < o.x1 && y > o.y0 && y < o.y1 && z > o.z0 && z < o.z1);
  // The deck cut away forward of the helm's house (a cabin under a trunk cabin there): not deck.
  const op = layout.deckOpening;
  // (A Shipyard cabin below's: its own plan, P2c.)
  const opPlan = op?.plan;
  const inOpening = (x: number, z: number) =>
    !!op &&
    (opPlan
      ? z > opPlan[0][0] - r && z < opPlan[opPlan.length - 1][0] + r && Math.abs(x) < planHalfWidth(opPlan, Math.min(Math.max(z, opPlan[0][0]), opPlan[opPlan.length - 1][0])) + r
      : z < wh.front + r && z > op.front - r && Math.abs(x) < deckHalfBeam(z) - op.inset + r);
  // A deckhouse under the wheelhouse (vessel/deckhouse.ts): solid; its top walked if it has
  // `walk` (P2b), round the houses standing on it, with a ladder up from the deck.
  const dh = layout.deckhouse;
  const dhLadder = dh ? deckhouseLadderZone(dh) : null;
  const inDhLadder = (x: number, z: number) => !!dhLadder && x >= dhLadder.x0 && x <= dhLadder.x1 && z >= dhLadder.z0 && z <= dhLadder.z1;
  // The ladder's head: a landing on the top from its edge in to the walked part (as the roof's).
  const onDhLanding = (x: number, z: number) => {
    if (!dhLadder || !dh?.walk) return false;
    if (x < dhLadder.x0 || x > dhLadder.x1) return false;
    return dh.walk.ladder.face === 'aft' ? z > dh.z1 - dh.walk.margin - 0.3 && z <= dh.z1 + 0.05 : z >= dh.walk.z0 - 0.05 && z < dh.walk.z0 + dh.walk.margin + 0.3;
  };
  let leafFolded = false;
  // The engine hatch in the helm house's floor (or in the deck, at its `y`): open, its hole
  // can't be walked into (you can still stand where you were if it opened under you; you
  // just can't step onto it).
  const hatch = layout.engineHatch;
  const hatchY = hatch?.y ?? wh?.floorY ?? 0;
  let hatchOpen = false;
  const inHatch = (x: number, z: number) => !!hatch && hatchOpen && x > hatch.x0 - r * 0.3 && x < hatch.x1 + r * 0.3 && z > hatch.z0 - r * 0.3 && z < hatch.z1 + r * 0.3;

  // The working-deck gate: open, the gateway is walkable right out to the deck edge.
  const gate = layout.sideGate;
  let gateOpen = false;
  const inGateway = (x: number, z: number, edge: number) =>
    !!gate && gateOpen && Math.sign(x) === gate.side && z > gate.z0 + r * 0.6 && z < gate.z1 - r * 0.6 && Math.abs(x) <= deckHalfBeam(z) - edge;

  // A cockpit overhead (P2b): its roof slab, and the wing plates along the deck edge each side
  // (solid from the deck up to the roof as far as the knee, then above its sweep).
  const oh = layout.overhead;
  const inWingBand = (x: number, z: number, m: number) => !!oh && z > oh.z0 - m && z < oh.z1 + m && Math.abs(x) > oh.halfWidth - oh.wing - m && Math.abs(x) < oh.halfWidth + m;
  const overheadSolid = (x: number, y: number, z: number): boolean => {
    if (!oh || z < oh.z0 || z > oh.z1 || Math.abs(x) > oh.halfWidth) return false;
    if (y >= oh.y && y <= oh.y + oh.thickness) return true; // the roof
    return inWingBand(x, z, 0) && y >= deckY(z) && y < oh.y && y >= wingCurveY(oh, z); // a wing
  };

  // Her houses (P2a): the helm's, then any more, each walked as its own.
  const live = { leafFolded: () => leafFolded };
  const helmHouse = houseWalk(def, layout, wh, true, gear, deckY, live);
  const others = (layout.houses ?? []).map((h) => houseWalk(def, layout, h, false, gear, deckY, live));
  const houses = [helmHouse, ...others];

  const surfaces: Surface[] = [
    {
      // Open deck: inside the bulwarks, aft of the bow, clear of the houses' outsides and their door steps.
      height: (_x, z) => deckY(z),
      contains: (x, z) => {
        const onDeck = (z <= transom - layout.deckEdgeMargin && Math.abs(x) <= deckHalfBeam(z) - layout.deckEdgeMargin) || inGateway(x, z, 0.08);
        const nearDeckhouse = !!dh && inDeckhouse(dh, x, z, r);
        return onDeck && !houses.some((h) => h.near(x, z) || h.inSteps(x, z)) && !nearDeckhouse && !inOpening(x, z) && !onGear(gear, x, z, r, deckY(z)) && !inWingBand(x, z, r);
      },
    },
    ...helmHouse.floors,
    // The deckhouse's walked top: in from its edge (its rail), clear of the houses on it and of
    // gear standing there; and the landing at the ladder head.
    ...(dh?.walk
      ? [
          {
            height: () => dh.top,
            // (Clear of a house's door steps, too: on a deckhouse run on aft of it, they're on its top.)
            contains: (x: number, z: number) => (onDeckhouseTop(dh, x, z, r * 0.5) && !houses.some((h) => h.near(x, z) || h.inSteps(x, z)) && !onGear(gear, x, z, r, dh.top)) || onDhLanding(x, z),
          },
        ]
      : []),
    // Other floors (the companionway's treads, the fore cabin's sole), a little short of
    // their edges each way so you don't stand half off them.
    ...(layout.extraFloors ?? []).map(
      (f): Surface => ({
        height: () => f.y,
        // (Clear of furniture standing on it: P5.)
        contains: (x, z) => x >= f.x0 + r * 0.5 && x <= f.x1 - r * 0.5 && z >= f.z0 && z <= f.z1 && !onGear(gear, x, z, r, f.y),
      }),
    ),
    ...helmHouse.steps,
    ...others.flatMap((h) => [...h.floors, ...h.steps]),
  ];

  return {
    floorsAt(x, z) {
      return surfaces.filter((s) => s.contains(x, z)).map((s) => s.height(x, z));
    },

    walkable(x, z, y) {
      if (helmHouse.inLadder(x, z) || inDhLadder(x, z)) return true;
      if (inHatch(x, z) && Math.abs(y - hatchY) <= STEP_HEIGHT) return false;
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
      if (helmHouse.inLadder(x, z)) return helmHouse.ladderAt();
      // The deckhouse's ladder: from the deck at its foot to its top.
      if (inDhLadder(x, z)) return { bottom: deckY(dh!.walk!.ladder.face === 'aft' ? dhLadder!.z1 : dhLadder!.z0), top: dh!.top };
      return null;
    },

    inBounds(x, z) {
      if (inGateway(x, z, 0.02)) return true;
      return z <= transom - FENCE && z >= st[st.length - 1].z + FENCE && Math.abs(x) <= deckHalfBeam(z) - FENCE;
    },

    insideSolid(x, y, z) {
      if (inHollow(x, y, z)) return false; // the fore cabin, the companionway
      const house = houses.find((h) => h.inFootprint(x, z));
      if (house) return house.solid(x, y, z);
      // The deckhouse (solid, for now) up to its top.
      if (dh && inDeckhouse(dh, x, z) && y < dh.top) return true;
      if (overheadSolid(x, y, z)) return true;
      // Below the open deck, within the hull.
      return z <= transom && Math.abs(x) <= deckHalfBeam(z) && y < deckY(z) - 0.15;
    },
  };
}

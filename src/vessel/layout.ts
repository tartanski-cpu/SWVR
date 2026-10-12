/**
 * Walkable areas, in the frame of whatever the player stands on (vessel axes aboard, world
 * axes on the platform). Locomotion asks three questions:
 *
 *   walkable(x, z)       may the player's body centre (radius bodyRadius) be here?
 *   floorY(x, z)         floor height under that point (deck sheer, wheelhouse floor)
 *   insideSolid(x,y,z)   is the head inside structure? (room-scale: fade to black)
 *
 * The vessel version is derived from the hull stations and the layout block in the config,
 * the same numbers the wheelhouse geometry is built from.
 */
import { CONFIG } from '../config';
import type { VesselDef } from './vesselDef';

export interface WalkArea {
  walkable(x: number, z: number): boolean;
  floorY(x: number, z: number): number;
  insideSolid(x: number, y: number, z: number): boolean;
}

export type LayoutConfig = typeof CONFIG.vessels.workboat.layout;

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

export function vesselWalkArea(def: VesselDef, layout: LayoutConfig): WalkArea {
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

  return {
    walkable(x, z) {
      // Inside the wheelhouse, clear of walls and the console.
      if (Math.abs(x) <= int.x - r && z >= consoleAft + r && z <= int.z1 - r) return true;
      // Through the aft doorway (a little lenient so it doesn't feel fiddly).
      if (Math.abs(x) <= doorHalf - r * 0.6 && z > int.z1 - r - 0.02 && z < ext.z1 + r + 0.02) return true;
      // On deck: inside the bulwarks, aft of the bow, clear of the wheelhouse exterior.
      const onDeck = z <= transom - layout.deckEdgeMargin && Math.abs(x) <= deckHalfBeam(z) - layout.deckEdgeMargin;
      const nearHouse = Math.abs(x) < ext.x + r && z > ext.z0 - r && z < ext.z1 + r;
      return onDeck && !nearHouse;
    },

    floorY(x, z) {
      return inHouseFootprint(x, z) ? wh.floorY : deckY(z);
    },

    insideSolid(x, y, z) {
      const ax = Math.abs(x);
      // Below the deck / floor, within the hull.
      if (z <= transom && ax <= deckHalfBeam(z) && y < this.floorY(x, z) - 0.15) return true;
      if (!inHouseFootprint(x, z)) return false;
      if (y > wh.roofY + 0.15) return false; // above the roof
      if (y > wh.roofY - 0.05) return true; // in the roof slab
      const inInterior = ax < int.x && z > int.z0 && z < int.z1;
      if (inInterior) {
        // The helm console across the front.
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
  const y = CONFIG.testScene.platformDeckHeight;
  return {
    walkable: (x, z) => Math.abs(x) <= half && Math.abs(z) <= half,
    floorY: () => y,
    insideSolid: () => false,
  };
}

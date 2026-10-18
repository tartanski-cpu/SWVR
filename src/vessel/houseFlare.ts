import type { HouseShape } from './vesselDef';

/**
 * A wheelhouse with its windows raked out all round (owner: a tug's or supply vessel's
 * bridge; HouseShape.flare). Modelled as one smooth deformation of the house as built
 * upright, so the walls, the roof, the front glass and its wipers all move together:
 *
 *   d(y) = tan x (y - sill), 0 below the side windows' sill, held at its value at the
 *          window head above it (the header and the roof move out by the full amount);
 *   x'   = x (1 + d / halfWidth)                 the side walls lean out (x = +-halfWidth
 *                                                goes to +-(halfWidth + d));
 *   z'   = z + d (z - front) / (aft - front)     the aft wall leans aft (z = aft goes to
 *          for z aft of the front, else z       aft + d); the front stays where it is.
 *
 * Both are linear in x and z, so flat walls stay flat; the front panes widen toward the
 * top to meet the leaning sides (as on the real thing). Inside (the floor, the console,
 * anything below the sill) nothing moves, so walking about the house is as before.
 * The doors are kept upright by the builder (hullMesh.ts), closed off to the leaning walls
 * by cheek plates and a soffit under the overhang.
 */
export interface HouseFlare {
  /** The deformed point (vessel axes) of a point of the upright house. */
  at(x: number, y: number, z: number): [number, number, number];
  /** How far out (m) the walls are at height y (0 below the sill). */
  d(y: number): number;
  /** At the window head and above: the full offset (m). */
  D: number;
}

export function houseFlare(
  wh: { halfWidth: number; front: number; aft: number; floorY: number; windowSill: number; windowHead: number; frontSill?: number; shape?: HouseShape },
): HouseFlare | null {
  const f = wh.shape?.flare;
  if (!f || f.tan <= 0) return null;
  // From the side (and aft) windows' sill: the lower of theirs and the front's.
  const sill = wh.floorY + Math.min(wh.windowSill, wh.frontSill ?? wh.windowSill);
  const head = wh.floorY + wh.windowHead;
  const D = f.tan * Math.max(0, head - sill);
  const d = (y: number) => f.tan * Math.min(Math.max(0, y - sill), head - sill);
  const L = wh.aft - wh.front;
  return {
    D,
    d,
    at(x, y, z) {
      const k = d(y);
      return [x * (1 + k / wh.halfWidth), y, z > wh.front ? z + (k * (z - wh.front)) / L : z];
    },
  };
}

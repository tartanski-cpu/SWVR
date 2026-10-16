/**
 * Walking in the world frame (off the boat): the islands, beaches, quays and piers, plus
 * the old test platform. Same WalkArea interface the deck uses, so Locomotion doesn't care
 * where you are.
 *
 *   - Ground is a quay or pier deck where one covers the point, else the terrain.
 *   - You can stand where the ground is no deeper than `wadeDepth` under mean water: beaches
 *     shelve gently, so you wade in and out; a quay edge drops straight into deep water, so
 *     it stops you like a deck edge does (jump to go in).
 *   - Terrain steeper than `maxSlopeNormalY` can't be walked up.
 */
import { CONFIG } from '../config';
import { STEP_HEIGHT, type WalkArea } from '../vessel/layout';
import { blockTop, standingHeight } from './geography';
import { groundNormal } from './terrain';

const n = { x: 0, y: 1, z: 0 };

/** Ground you could stand on at (x, z), or null (deep water or too steep). */
export function landFloor(x: number, z: number): number | null {
  const g = standingHeight(x, z);
  if (g < -CONFIG.body.wadeDepth) return null;
  if (blockTop(x, z) === null) {
    groundNormal(x, z, n);
    if (n.y < CONFIG.body.maxSlopeNormalY) return null;
  }
  return g;
}

export function worldWalkArea(): WalkArea {
  return {
    floorsAt(x, z) {
      const g = landFloor(x, z);
      return g !== null ? [g] : [];
    },
    walkable(x, z, y) {
      const g = landFloor(x, z);
      return g !== null && Math.abs(g - y) <= STEP_HEIGHT;
    },
    ladderAt: () => null,
    insideSolid: () => false,
  };
}

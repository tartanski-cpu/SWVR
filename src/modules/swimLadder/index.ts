/**
 * Module deck.swim-ladder: the swim ladder over the starboard side (modular boats M5b): two
 * stainless rails hooked over the bulwark top, down past the waterline, with flat treads.
 * In the water, grip a rung (or jump near its foot) and you're up it and aboard
 * (player/body.ts climbOut).
 *
 * It gives the boat a swim ladder: its outboard line, foot and head, where you step aboard,
 * how near you must be. Drawn in the boat's axes at its station (`z`) from the hull's beam
 * and bulwark (defaults: CONFIG.vessels.workboat.swimLadder); merged
 * with the boat's fixed parts.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { GearFacts, HullQueries, ModuleDefinition } from '../../modular/module';
import { part } from '../../render/geometryUtils';

export type SwimLadderConfig = typeof CONFIG.vessels.workboat.swimLadder;

/** Where the ladder hangs (the boat's axes), from the hull. */
export function ladderOf(c: SwimLadderConfig, hull: HullQueries): GearFacts['swimLadder'] {
  const hb = hull.halfBeam(c.z);
  return { x: hb + 0.08, z: c.z, bottom: c.bottom, top: hull.bulwarkTop(c.z), deckX: hb - 0.6, range: c.range, width: c.width };
}

export const SWIM_LADDER: ModuleDefinition<SwimLadderConfig> = {
  id: 'deck.swim-ladder',
  version: 1,
  fits: ['deck.fitting'],
  defaults: CONFIG.vessels.workboat.swimLadder,
  validateConfig: (c) => (c.width > 0 && c.range > 0 ? [] : ['the ladder needs a width and a reach']),
  ports: {},
  provides: () => [{ gear: 'swimLadder' }],
  gear: (c, hull) => ({ swimLadder: ladderOf(c, hull) }),
  view: {
    frame: 'boat',
    build({ config, hull }) {
      const lad = ladderOf(config, hull);
      const steel = 0xc8ccd0;
      const len = lad.top - lad.bottom;
      const parts: THREE.BufferGeometry[] = [];
      for (const dz of [-lad.width / 2, lad.width / 2]) {
        parts.push(part(new THREE.CylinderGeometry(0.016, 0.016, len, 6).translate(lad.x, lad.bottom + len / 2, lad.z + dz), steel));
        // The hook over the bulwark top, back to the deck side.
        parts.push(part(new THREE.BoxGeometry(lad.x - lad.deckX - 0.45, 0.03, 0.03).translate((lad.x + lad.deckX + 0.45) / 2, lad.top + 0.02, lad.z + dz), steel));
      }
      for (let y = lad.bottom + 0.15; y < lad.top - 0.1; y += 0.3) {
        parts.push(part(new THREE.BoxGeometry(0.08, 0.025, lad.width).translate(lad.x + 0.02, y, lad.z), 0x9aa0a6));
      }
      return { staticParts: parts, movingParts: [], controls: [], update: () => {} };
    },
  },
};

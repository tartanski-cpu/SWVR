/**
 * Module deck.rod-rack (owner, Oct 2026): the handheld fishing rod's rack on the wheelhouse's
 * aft wall, two clips the rod lies across, and a bucket on deck under it for the catch. A
 * Shipyard fitting (design.rodRack). The rod itself is hand gear (player/handGear.ts: taken
 * off the rack, cast and played in hand; fishing/rodGame.ts); the bucket's fish are drawn by
 * the app (fishing/rodView.ts) from the boat's catch (VesselState.rodCatch).
 *
 * It gives the boat a rod rack: where the rod hangs and where the bucket stands.
 */
import * as THREE from 'three';
import type { ModuleDefinition } from '../../modular/module';
import { part } from '../../render/geometryUtils';

export interface RodRackConfig {
  /** Where the rod hangs (the boat's axes; the rod lies across the wall through this point). */
  stow: [number, number, number];
  /** The bucket on deck (its base's centre). */
  bucket: [number, number, number];
  /** Which side of the house's aft wall (-1 port, 1 starboard). */
  side: -1 | 1;
}

export const ROD_RACK: ModuleDefinition<RodRackConfig> = {
  id: 'deck.rod-rack',
  version: 1,
  fits: ['deck.fitting'],
  defaults: { stow: [-1.1, 2.3, 1.6], bucket: [-1.1, 1.0, 2.0], side: -1 },
  validateConfig: (c) => (c.side === -1 || c.side === 1 ? [] : ['side is -1 (port) or 1 (starboard)']),
  ports: {},
  provides: () => [{ gear: 'rodRack' }],
  gear: (c) => ({ rodRack: { stow: c.stow, bucket: c.bucket, side: c.side } }),
  view: {
    frame: 'boat',
    build({ config: c }) {
      const [x, y, z] = c.stow;
      const [bx, by, bz] = c.bucket;
      const dark = 0x2a2e33;
      return {
        staticParts: [
          // Two clips on the wall, 0.8 m apart, the rod lying across them.
          part(new THREE.BoxGeometry(0.04, 0.08, 0.05).translate(x - 0.4, y, z + 0.03), dark),
          part(new THREE.BoxGeometry(0.04, 0.08, 0.05).translate(x + 0.4, y, z + 0.03), dark),
          // The bucket: a white pail with a dark rim, on deck.
          part(new THREE.CylinderGeometry(0.16, 0.13, 0.3, 12, 1, true).translate(bx, by + 0.15, bz), 0xe8e6e0),
          part(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 12).translate(bx, by + 0.01, bz), 0xd8d6d0),
          part(new THREE.TorusGeometry(0.16, 0.012, 6, 14).rotateX(Math.PI / 2).translate(bx, by + 0.3, bz), dark),
        ],
        movingParts: [],
        controls: [],
        update: () => {},
      };
    },
  },
};

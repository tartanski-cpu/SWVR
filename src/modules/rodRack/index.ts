/**
 * Module deck.rod-rack (owner, Oct 2026): a rack of handheld fishing rods on a wall of the
 * wheelhouse (a Shipyard fitting, design.rodRack: the aft wall or a side wall, port or
 * starboard), the rods standing upright in cups on the deck with a clip higher up, their
 * tips reaching above the roof; a bucket on deck beside them for the catch. Every rod is its
 * own (CONFIG.rod.perRack of them), so the crew fish together.
 *
 * The rods themselves are hand gear (player/handGear.ts: taken off the rack, cast and played
 * in hand; fishing/rodGame.ts); the bucket's fish are drawn by the app (fishing/rodView.ts)
 * from the boat's catch (VesselState.rodCatch).
 *
 * It gives the boat a rod rack: where each rod stands and where the bucket is.
 */
import * as THREE from 'three';
import type { ModuleDefinition } from '../../modular/module';
import { part } from '../../render/geometryUtils';

export interface RodRackConfig {
  /** Each rod's butt (the boat's axes): the cup it stands in. */
  rods: [number, number, number][];
  /** The wall's facing (deg about y: 0 the aft wall facing aft, 90 the starboard wall, -90 the port wall). */
  yawDeg: number;
  /** The bucket on deck (its base's centre). */
  bucket: [number, number, number];
  /** Which side of the boat (-1 port, 1 starboard). */
  side: -1 | 1;
}

export const ROD_RACK: ModuleDefinition<RodRackConfig> = {
  id: 'deck.rod-rack',
  version: 1,
  fits: ['deck.fitting'],
  defaults: { rods: [[-1.1, 1.0, 1.6]], yawDeg: 0, bucket: [-1.1, 1.0, 2.0], side: -1 },
  validateConfig: (c) => [...(c.side === -1 || c.side === 1 ? [] : ['side is -1 (port) or 1 (starboard)']), ...(c.rods.length ? [] : ['a rack needs at least one rod'])],
  ports: {},
  provides: () => [{ gear: 'rodRack' }],
  gear: (c) => ({ rodRack: { rods: c.rods, yawDeg: c.yawDeg, bucket: c.bucket, side: c.side } }),
  view: {
    frame: 'boat',
    build({ config: c }) {
      const dark = 0x2a2e33;
      const yaw = (c.yawDeg * Math.PI) / 180;
      // Into the wall: the facing turned round (the wall is behind the rods).
      const wx = -Math.sin(yaw) * 0.05;
      const wz = -Math.cos(yaw) * 0.05;
      const parts: THREE.BufferGeometry[] = [];
      for (const [x, y, z] of c.rods) {
        parts.push(part(new THREE.CylinderGeometry(0.035, 0.03, 0.12, 8).translate(x, y + 0.06, z), dark)); // the cup
        parts.push(part(new THREE.BoxGeometry(0.05, 0.06, 0.05).rotateY(yaw).translate(x + wx, y + 1.3, z + wz), dark)); // the clip
      }
      // A rail joining the clips to the wall.
      if (c.rods.length > 1) {
        const a = c.rods[0];
        const b = c.rods[c.rods.length - 1];
        const len = Math.hypot(b[0] - a[0], b[2] - a[2]) + 0.1;
        parts.push(part(new THREE.BoxGeometry(len, 0.03, 0.03).rotateY(yaw + Math.PI / 2).translate((a[0] + b[0]) / 2 + wx, a[1] + 1.3, (a[2] + b[2]) / 2 + wz), dark));
      }
      const [bx, by, bz] = c.bucket;
      parts.push(
        part(new THREE.CylinderGeometry(0.16, 0.13, 0.3, 12, 1, true).translate(bx, by + 0.15, bz), 0xe8e6e0),
        part(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 12).translate(bx, by + 0.01, bz), 0xd8d6d0),
        part(new THREE.TorusGeometry(0.16, 0.012, 6, 14).rotateX(Math.PI / 2).translate(bx, by + 0.3, bz), dark),
      );
      return { staticParts: parts, movingParts: [], controls: [], update: () => {} };
    },
  },
};

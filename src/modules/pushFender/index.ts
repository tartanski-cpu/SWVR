/**
 * Module hull.push-fender: the rubber push fender on a tug's square bow (owner: the small
 * tug hull). A thick block of black rubber across her bow plate, from the bulwark top down
 * nearly to the foot of the plate, its outer corners chamfered: what she pushes barges and
 * ships with, and what meets a quay when she noses in.
 *
 * It gives the boat a push fender: its face's points, which meet a quay (and other boats)
 * before her bow plate does, with the fender's own spring and grip (CONFIG.contacts.guards
 * .pushFender; vessel/physics/vesselPhysics.ts and vesselContact.ts). Drawn in the boat's
 * axes from its config (the Shipyard build works it out from her bow); merged with her
 * fixed parts. Its weight is designed into her hull by the build.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';
import { part } from '../../render/geometryUtils';

export interface PushFenderConfig {
  /** Half its width across the bow (m), and its foot and top (m above the DWL). */
  halfWidth: number;
  bottom: number;
  top: number;
  /** Her bow plate's station (z, boat axes): the fender stands on it, reaching forward. */
  z: number;
}

/** Its face's points (the boat's axes): `across` x `up`, on its flat front. */
export function pushFenderProbes(c: PushFenderConfig): [number, number, number][] {
  const f = CONFIG.modules.pushFender;
  const out: [number, number, number][] = [];
  const w = c.halfWidth - f.chamfer;
  for (let i = 0; i < f.across; i++)
    for (let j = 0; j < f.up; j++) {
      const x = -w + (2 * w * i) / (f.across - 1);
      const y = c.bottom + 0.1 + ((c.top - c.bottom - 0.2) * j) / (f.up - 1);
      out.push([x, y, c.z - f.thickness]);
    }
  return out;
}

export const PUSH_FENDER: ModuleDefinition<PushFenderConfig> = {
  id: 'hull.push-fender',
  version: 1,
  fits: ['hull.side'],
  defaults: { halfWidth: 1.6, bottom: 0.5, top: 2.8, z: -6.5 },
  validateConfig: (c) => [...(c.halfWidth > CONFIG.modules.pushFender.chamfer + 0.2 ? [] : ['the push fender is too narrow']), ...(c.top > c.bottom + 0.3 ? [] : ['the push fender has no height'])],
  ports: {},
  provides: () => [{ gear: 'pushFender' }],
  gear: (c) => ({ pushFender: { probes: pushFenderProbes(c) } }),
  view: {
    frame: 'boat',
    build({ config: c }) {
      const f = CONFIG.modules.pushFender;
      const w = c.halfWidth;
      // In plan (x across, forward from the plate), chamfered at its outer corners; drawn
      // as a shape extruded from its foot up to its top, then stood on the plate.
      const plan = new THREE.Shape([
        new THREE.Vector2(-w, 0),
        new THREE.Vector2(w, 0),
        new THREE.Vector2(w, f.thickness - f.chamfer),
        new THREE.Vector2(w - f.chamfer, f.thickness),
        new THREE.Vector2(-w + f.chamfer, f.thickness),
        new THREE.Vector2(-w, f.thickness - f.chamfer),
      ]);
      // Extruded along +z, then turned so that runs up (y) and the plan's forward runs to -z.
      const block = new THREE.ExtrudeGeometry(plan, { depth: c.top - c.bottom, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, c.bottom, c.z);
      return { staticParts: [part(block, 0x1b1c1e)], movingParts: [], controls: [], update: () => {} };
    },
  },
};

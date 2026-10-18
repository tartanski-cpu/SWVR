/**
 * Module hull.push-fender: the push knees on a tug's square bow (owner: the small tug hull).
 * Two vertical columns of black rubber on her bow plate, either side of the centreline, from
 * the bulwark top down nearly to the foot of the plate, their outer corners chamfered (owner:
 * two separate pads rather than one block across): what she pushes barges and ships with,
 * and what meets a quay when she noses in.
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
  /** Half the bow plate's width the knees stand on (m), and their foot and top (m above the DWL). */
  halfWidth: number;
  bottom: number;
  top: number;
  /** Her bow plate's station (z, boat axes): the knees stand on it, reaching forward. */
  z: number;
}

/** Each knee's centre across her (m, + starboard): `knees` of them, spread evenly, the outer ones `kneeAt` of the way out. */
export function kneeCentres(c: PushFenderConfig): number[] {
  const f = CONFIG.modules.pushFender;
  const out = f.kneeAt * c.halfWidth;
  return Array.from({ length: f.knees }, (_, i) => (f.knees === 1 ? 0 : -out + (2 * out * i) / (f.knees - 1)));
}

/** Their faces' points (the boat's axes): `across` x `up` on each knee's flat front. */
export function pushFenderProbes(c: PushFenderConfig): [number, number, number][] {
  const f = CONFIG.modules.pushFender;
  const out: [number, number, number][] = [];
  const w = f.kneeWidth / 2 - f.chamfer;
  for (const xc of kneeCentres(c))
    for (let i = 0; i < f.across; i++)
      for (let j = 0; j < f.up; j++) {
        const x = xc - w + (f.across > 1 ? (2 * w * i) / (f.across - 1) : w);
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
  validateConfig: (c) => [...(CONFIG.modules.pushFender.kneeAt * c.halfWidth + CONFIG.modules.pushFender.kneeWidth / 2 <= c.halfWidth ? [] : ['the bow is too narrow for the push knees']), ...(c.top > c.bottom + 0.3 ? [] : ['the push fender has no height'])],
  ports: {},
  provides: () => [{ gear: 'pushFender' }],
  gear: (c) => ({ pushFender: { probes: pushFenderProbes(c) } }),
  view: {
    frame: 'boat',
    build({ config: c }) {
      const f = CONFIG.modules.pushFender;
      const w = f.kneeWidth / 2;
      // Each knee in plan (x across, forward from the plate), chamfered at its outer corners;
      // drawn as a shape extruded from its foot up to its top, then stood on the plate.
      const plan = new THREE.Shape([
        new THREE.Vector2(-w, 0),
        new THREE.Vector2(w, 0),
        new THREE.Vector2(w, f.thickness - f.chamfer),
        new THREE.Vector2(w - f.chamfer, f.thickness),
        new THREE.Vector2(-w + f.chamfer, f.thickness),
        new THREE.Vector2(-w, f.thickness - f.chamfer),
      ]);
      // Extruded along +z, then turned so that runs up (y) and the plan's forward runs to -z.
      const knee = new THREE.ExtrudeGeometry(plan, { depth: c.top - c.bottom, bevelEnabled: false }).rotateX(-Math.PI / 2);
      const parts = kneeCentres(c).map((x) => part(knee.clone().translate(x, c.bottom, c.z), 0x1b1c1e));
      return { staticParts: parts, movingParts: [], controls: [], update: () => {} };
    },
  },
};

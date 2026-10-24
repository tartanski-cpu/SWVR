/**
 * Module hull.bow-fender: a crew-transfer boat's bow fender (owner, Oct 2026: crew transfer to
 * wind farms). A thick block of black rubber on her bow, its front face plumb, that she pushes
 * against a turbine's boat landing (its two upright tubes) and holds there with her engine
 * while the technicians step across. On a pointed bow it sits round the top of her stem, its
 * back following the stem's rake down; on the catamaran, across the front of her bridge deck
 * between the hulls.
 *
 * It gives the boat a push fender (gear 'pushFender', as the tug's push knees,
 * modules/pushFender): its face's points, which meet a quay, the landing or another boat
 * before her bow does, with the rubber's own spring and grip (CONFIG.contacts.guards
 * .pushFender: a high-friction grip, so she holds on the landing without sliding). Drawn in
 * the boat's axes from its config (the Shipyard build works it out from her bow:
 * parts/trim.ts); merged with her fixed parts. Its weight is designed into her by the build.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';
import { part } from '../../render/geometryUtils';

export interface BowFenderConfig {
  /** Half its width across her (m). */
  halfWidth: number;
  /** Its top and foot (m, the boat's y). */
  top: number;
  bottom: number;
  /** Its front face (z, the boat's axes: forward is -z). */
  front: number;
  /** Its back, where it meets her bow: [y, z] from its foot to its top (the stem's rake, or the bridge deck's front). */
  back: [number, number][];
}

/** Its face's points (the boat's axes): `across` x `up` on its plumb front, in from its edges. */
export function bowFenderProbes(c: BowFenderConfig): [number, number, number][] {
  const f = CONFIG.modules.bowFender;
  const out: [number, number, number][] = [];
  const w = c.halfWidth - f.chamfer;
  for (let i = 0; i < f.across; i++)
    for (let j = 0; j < f.up; j++) {
      const x = f.across > 1 ? -w + (2 * w * i) / (f.across - 1) : 0;
      const y = c.bottom + 0.1 + ((c.top - c.bottom - 0.2) * j) / Math.max(1, f.up - 1);
      out.push([x, y, c.front]);
    }
  return out;
}

export const BOW_FENDER: ModuleDefinition<BowFenderConfig> = {
  id: 'hull.bow-fender',
  version: 1,
  fits: ['hull.side'],
  defaults: { halfWidth: 0.45, top: 2.4, bottom: 1.3, front: -7.4, back: [[1.3, -6.8], [2.4, -7.0]] },
  validateConfig: (c) => [...(c.top > c.bottom + 0.3 ? [] : ['the bow fender has no height']), ...(c.halfWidth > CONFIG.modules.bowFender.chamfer ? [] : ['the bow fender has no width']), ...(c.back.length >= 2 ? [] : ['the bow fender has no back'])],
  ports: {},
  provides: () => [{ gear: 'pushFender' }],
  gear: (c) => ({ pushFender: { probes: bowFenderProbes(c) } }),
  view: {
    frame: 'boat',
    build({ config: c }) {
      const f = CONFIG.modules.bowFender;
      // In profile (z along her, y up): its plumb front, its back along her bow, its top and
      // foot level; extruded across her, then its front corners chamfered in plan by cutting
      // the outer strips back (two narrow blocks either side, set back by the chamfer).
      const profile = (inset: number) => {
        const pts = [new THREE.Vector2(c.front + inset, c.bottom), ...c.back.map(([y, z]) => new THREE.Vector2(z, y)), new THREE.Vector2(c.front + inset, c.top)];
        return new THREE.Shape(pts);
      };
      // Extruded along +z (across her, after the turn), its middle on her centreline.
      const slab = (inset: number, x0: number, x1: number) =>
        new THREE.ExtrudeGeometry(profile(inset), { depth: x1 - x0, bevelEnabled: false })
          // Shape x is her z, shape y her y, the extrusion her x (from x1 back to x0: turned, not mirrored, so its faces stay outward).
          .applyMatrix4(new THREE.Matrix4().set(0, 0, -1, x1, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
      const w = c.halfWidth;
      const k = Math.min(f.chamfer, w / 3);
      const parts = [part(slab(0, -w + k, w - k), f.color), part(slab(k, -w, -w + k), f.color), part(slab(k, w - k, w), f.color)];
      return { staticParts: parts, movingParts: [], controls: [], update: () => {} };
    },
  },
};

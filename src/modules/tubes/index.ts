/**
 * Module hull.tubes: an inflatable's tubes (owner, Oct 2026: the ship's tender as a rubber
 * dinghy). Two tubes along her deck edges, from rounded ends past her transom, joined in a
 * round nose over her bow, as on any inflatable or RIB. CONFIG.modules.tubes.
 *
 * Looks only: the hull under them floats her (at rest a small inflatable floats on her floor
 * and keel, her tubes just clear of the water). Their top is her gunwale, which her layout
 * already says (`bulwarkHeight` = the radius). Drawn in the boat's axes from her hull's
 * shape: each tube's centre on her deck edge, `inset` in from it. Merged with her fixed
 * parts: no draw call of its own.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { HullQueries, ModuleDefinition } from '../../modular/module';
import { part } from '../../render/geometryUtils';

export type TubesConfig = typeof CONFIG.modules.tubes.dinghy;

/**
 * The tubes' centreline (boat axes), from the starboard tube's aft end, forward round her
 * nose, to the port tube's aft end. Along each side: her deck edge, `inset` in; the nose a
 * little aft of her stem on the centreline, a touch higher (an inflatable's nose rises).
 */
export function tubePath(hull: HullQueries, c: TubesConfig): THREE.Vector3[] {
  const SIDE = 7; // points along each side, transom to bow
  const { transom, stem } = hull;
  const fore = stem + 0.3; // the side's last point, where it turns in toward the nose
  const side: THREE.Vector3[] = [];
  for (let i = 0; i <= SIDE; i++) {
    const z = transom + ((fore - transom) * i) / SIDE;
    side.push(new THREE.Vector3(Math.max(hull.halfBeam(z) - c.inset, 0.05), hull.deckY(z), z));
  }
  const end = new THREE.Vector3(side[0].x, side[0].y, transom + c.aft);
  const nose = new THREE.Vector3(0, hull.deckY(stem) + 0.05, stem + 0.02);
  const stbd = [end, ...side];
  return [...stbd, nose, ...[...stbd].reverse().map((p) => new THREE.Vector3(-p.x, p.y, p.z))];
}

/** The tubes' parts (boat axes; the Shipyard draws them on her in the cradle too). */
export function tubeParts(hull: HullQueries, c: TubesConfig): THREE.BufferGeometry[] {
  const path = tubePath(hull, c);
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), c.segments, c.radius, c.round, false);
  // Rounded ends past the transom, as an inflatable's.
  const cap = (p: THREE.Vector3) => new THREE.SphereGeometry(c.radius, c.round, 5).scale(1, 1, 1.3).translate(p.x, p.y, p.z);
  return [part(tube, c.colour), part(cap(path[0]), c.colour), part(cap(path[path.length - 1]), c.colour)];
}

export const TUBES: ModuleDefinition<TubesConfig> = {
  id: 'hull.tubes',
  version: 1,
  fits: ['hull.side'],
  defaults: CONFIG.modules.tubes.dinghy,
  validateConfig: (c) => (c.radius > 0 && c.inset < c.radius ? [] : ['tubes with a radius, their centre within it of her deck edge']),
  ports: {},
  view: {
    frame: 'boat',
    build({ config: c, hull }) {
      return { staticParts: tubeParts(hull, c), movingParts: [], controls: [], update: () => {} };
    },
  },
};

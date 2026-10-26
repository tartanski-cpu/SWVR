/**
 * Module hull.fendering: a harbour tug's heavy rubber fendering (owner, Oct 2026: the harbour
 * tug; hulls/fendering.ts draws it, the hull modifications chat's): D-fender belts along her
 * sides, a cylinder fender round her stern, a cylinder round her bow with block fenders under
 * it for pushing ships. Her hull protection, in place of the strake or tyres.
 *
 * It gives the boat a side guard (as hull.guard's strake, vessel/physics/guards.ts): its outer
 * face's points, which meet a quay or another boat before her plating does, with the strake's
 * spring and grip (CONFIG.contacts.guards.strake). The Shipyard build works out the mesh and
 * its points from her hull form (parts/fendering.ts) and hands them over in the config, so
 * this module needs nothing of her lines; merged with her fixed parts (no draw calls of its own).
 */
import * as THREE from 'three';
import type { ModuleDefinition } from '../../modular/module';
import { part } from '../../render/geometryUtils';

export interface FenderingConfig {
  /** Its mesh's corners, in the boat's axes: x, y, z of each triangle's three in turn. */
  positions: number[];
  /** Its outer face's points to probe (the boat's axes). */
  probes: [number, number, number][];
}

const RUBBER = 0x1b1c1e;

export const FENDERING: ModuleDefinition<FenderingConfig> = {
  id: 'hull.fendering',
  version: 1,
  fits: ['hull.side'],
  defaults: { positions: [], probes: [] },
  validateConfig: (c) => [...(c.positions.length % 9 === 0 ? [] : ['the fendering mesh is cut short']), ...(c.probes.length ? [] : ['the fendering has no points to meet a quay'])],
  ports: {},
  provides: () => [{ gear: 'sideGuard' }],
  gear: (c) => ({ sideGuard: { kind: 'strake', probes: c.probes } }),
  view: {
    frame: 'boat',
    build({ config: c }) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(c.positions, 3));
      g.computeVertexNormals(); // (the boat's other fixed parts have normals: they merge only if all do)
      return { staticParts: c.positions.length ? [part(g, RUBBER)] : [], movingParts: [], controls: [], update: () => {} };
    },
  },
};

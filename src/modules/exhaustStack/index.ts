/**
 * Module fitting.exhaust-stack (owner, Oct 2026: a tug's "exhaust pipe... it comes out the
 * roof... in a corner of the wheelhouse, because it would need to route right through the
 * wheelhouse and into where the engines are... a nice beefy pipe, and of course high enough
 * to keep the smoke out of the way"; CONFIG.shipyard.exhaustStack). Drawing and footprint
 * only: the smoke from its top, and her cooling water from its hole in her side, are her
 * exhaust fitting's (ExhaustFitting `stack`, `water`; vessel/view/exhaustSmoke.ts).
 *
 * In the boat's axes: a pipe from under the cabin floor up through the roof, lagged (a
 * thicker grey sleeve) where it passes through the wheelhouse, a collar where it goes out
 * through the roof, a dark band near its top; and the cooling water's outlet in her side, a
 * short stub. All merged with the boat's fixed parts: no draw calls of its own.
 */
import * as THREE from 'three';
import type { ModuleDefinition } from '../../modular/module';
import { part } from '../../render/geometryUtils';

export interface ExhaustStackConfig {
  /** The pipe's axis (m, the boat's x and z), its radius, and its heights: its foot, the cabin floor, the roof's top, its top. */
  x: number;
  z: number;
  radius: number;
  foot: number;
  floor: number;
  roof: number;
  top: number;
  /** The cooling water's outlet in her side, and which way it points (out of her side). */
  water?: { position: [number, number, number]; direction: [number, number, number] };
}

const PIPE = 0x2b2d30; // the pipe outside: black, sooty
const LAGGING = 0xb9b6ad; // the lagging inside the wheelhouse (keeps its heat off the crew)
const COLLAR = 0x6a6e72;

export const EXHAUST_STACK: ModuleDefinition<ExhaustStackConfig> = {
  id: 'fitting.exhaust-stack',
  version: 1,
  fits: ['deck.fitting'],
  defaults: { x: 0, z: 0, radius: 0.14, foot: 0, floor: 0.5, roof: 2.6, top: 4.5 },
  validateConfig: (c) => (c.top > c.roof && c.roof > c.floor && c.radius > 0 ? [] : ['the stack runs up from its foot through the floor and the roof to its top']),
  ports: {},
  // Solid from the floor to its top: you walk round it, cargo doesn't stand in it.
  footprints: (c) => {
    const r = c.radius + 0.04;
    return [{ x0: c.x - r, x1: c.x + r, z0: c.z - r, z1: c.z + r, base: c.floor - 0.1, top: c.top }];
  },
  view: {
    frame: 'boat',
    build({ config: c }) {
      const r = c.radius;
      const pipe = (r0: number, y0: number, y1: number, colour: number, sides = 14) => part(new THREE.CylinderGeometry(r0, r0, y1 - y0, sides).translate(c.x, (y0 + y1) / 2, c.z), colour);
      const staticParts = [
        // Up from the engine space under the floor, lagged through the wheelhouse.
        pipe(r, c.foot, c.floor, PIPE),
        pipe(r + 0.035, c.floor, c.roof - 0.05, LAGGING),
        // The collar where it goes out through the roof, the pipe on up, a band near its top, its lip.
        pipe(r + 0.07, c.roof - 0.02, c.roof + 0.12, COLLAR),
        pipe(r, c.roof, c.top, PIPE),
        pipe(r + 0.02, c.top - 0.35, c.top - 0.27, COLLAR),
        part(new THREE.TorusGeometry(r, 0.018, 6, 14).rotateX(Math.PI / 2).translate(c.x, c.top, c.z), PIPE),
      ];
      const w = c.water;
      if (w) {
        // The outlet: a short stub out of her side, its mouth dark.
        const at = new THREE.Vector3(...w.position);
        const out = new THREE.Vector3(...w.direction).normalize();
        const stub = new THREE.CylinderGeometry(0.075, 0.075, 0.12, 12);
        stub.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), out));
        stub.translate(at.x - out.x * 0.05, at.y - out.y * 0.05, at.z - out.z * 0.05);
        staticParts.push(part(stub, COLLAR));
        const mouth = new THREE.CircleGeometry(0.055, 12);
        mouth.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), out));
        mouth.translate(at.x + out.x * 0.012, at.y + out.y * 0.012, at.z + out.z * 0.012);
        staticParts.push(part(mouth, 0x0a0a0a));
      }
      return { staticParts, movingParts: [], controls: [], update: () => {} };
    },
  },
};

/**
 * Module fitting.exhaust-stack (owner, Oct 2026: a tug's "exhaust pipe... it comes out the
 * roof... in a corner of the wheelhouse, because it would need to route right through the
 * wheelhouse and into where the engines are... a nice beefy pipe, and of course high enough
 * to keep the smoke out of the way"; then, from a photo of a modern tug's: not "like an old
 * steamship"... "a little bit of angle in them... straight pipes, maybe one or two, depending
 * on the engines"; CONFIG.shipyard.exhaustStack). Drawing and footprint only: the smoke from
 * their tops, and her cooling water from its holes in her sides, are her exhaust fitting's
 * (ExhaustFitting `stack`, `more`, `water`; vessel/view/exhaustSmoke.ts).
 *
 * In the boat's axes, for each pipe (one per engine, each in an aft corner of the wheelhouse):
 * from under the cabin floor up through the wheelhouse in a painted casing, out through the
 * roof at a low collar; over the roof a plain pipe, tapering a little, raked aft (`rakeDeg`;
 * 0: straight up), its top cut on a slant facing aft (`cutDeg`), dark inside. All merged
 * with the boat's fixed parts: no draw calls of its own.
 */
import * as THREE from 'three';
import type { ModuleDefinition } from '../../modular/module';
import { part } from '../../render/geometryUtils';

export interface ExhaustStackConfig {
  /** Each pipe's axis where it leaves the roof (m, the boat's x and z). */
  pipes: { x: number; z: number }[];
  radius: number;
  /** Its foot (in her engine space), the cabin floor, the roof's top (m, heights). */
  foot: number;
  floor: number;
  roof: number;
  /** How high over the roof its top stands (m), its rake aft (deg; 0 straight up), its top's cut (deg), and its taper (top radius / foot's). */
  above: number;
  rakeDeg: number;
  cutDeg: number;
  taper: number;
  /** The pipe outside, and the casing inside the wheelhouse (0xrrggbb). */
  colour: number;
  casing: number;
  /** Her cooling water's outlets in her sides, and which way each points (out of her side). */
  water?: { position: [number, number, number]; direction: [number, number, number] }[];
}

const COLLAR = 0x55595d;
const SOOT = 0x141414;

/** Where a pipe's smoke comes out (the middle of its cut top) and which way it goes (along the pipe), the boat's axes. */
export function stackOutlet(c: Pick<ExhaustStackConfig, 'radius' | 'roof' | 'above' | 'rakeDeg' | 'cutDeg' | 'taper'>, p: { x: number; z: number }): { position: [number, number, number]; direction: [number, number, number] } {
  const rake = (c.rakeDeg * Math.PI) / 180;
  const len = pipeLength(c);
  // The cut's middle: its length less half the drop across the top.
  const mid = len - Math.tan((c.cutDeg * Math.PI) / 180) * c.radius * c.taper;
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return {
    position: [r3(p.x), r3(c.roof + mid * Math.cos(rake)), r3(p.z + mid * Math.sin(rake))],
    direction: [0, r3(Math.cos(rake)), r3(Math.sin(rake))],
  };
}

/** A pipe's length over the roof (along its rake) for its top to stand `above` over the roof. */
function pipeLength(c: Pick<ExhaustStackConfig, 'above' | 'rakeDeg'>): number {
  return c.above / Math.cos((c.rakeDeg * Math.PI) / 180);
}

export const EXHAUST_STACK: ModuleDefinition<ExhaustStackConfig> = {
  id: 'fitting.exhaust-stack',
  version: 2,
  fits: ['deck.fitting'],
  defaults: { pipes: [{ x: 0, z: 0 }], radius: 0.14, foot: 0, floor: 0.5, roof: 2.6, above: 1.9, rakeDeg: 12, cutDeg: 35, taper: 0.88, colour: 0x7a5236, casing: 0xd8d6d0 },
  validateConfig: (c) => [
    ...(c.roof > c.floor && c.floor > c.foot && c.above > 0 && c.radius > 0 ? [] : ['the stack runs up from its foot through the floor and the roof, and on over it']),
    ...(c.pipes.length >= 1 && c.pipes.length <= 2 ? [] : ['one or two pipes']),
    ...(c.rakeDeg >= 0 && c.rakeDeg < 45 && c.cutDeg >= 0 && c.cutDeg < 60 ? [] : ['rake 0 to 45°, cut 0 to 60°']),
  ],
  ports: {},
  // Solid from the floor up through the wheelhouse: you walk round it, cargo doesn't stand in it.
  footprints: (c) => {
    const r = c.radius + 0.07;
    return c.pipes.map((p) => ({ x0: p.x - r, x1: p.x + r, z0: p.z - r, z1: p.z + r, base: c.floor - 0.1, top: c.roof }));
  },
  view: {
    frame: 'boat',
    build({ config: c }) {
      const r = c.radius;
      const rake = (c.rakeDeg * Math.PI) / 180;
      const drop = Math.tan((c.cutDeg * Math.PI) / 180);
      const len = pipeLength(c);
      const rTop = r * c.taper;
      const staticParts: THREE.BufferGeometry[] = [];
      /** The top cut on a slant: each point at the top lowered by how far aft of the pipe's front it is. */
      const cut = (g: THREE.BufferGeometry, top: number, rad: number) => {
        const pos = g.getAttribute('position');
        for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i) - top) < 1e-6) pos.setY(i, top - drop * (pos.getZ(i) + rad));
        g.computeVertexNormals();
        return g;
      };
      for (const p of c.pipes) {
        // Through the wheelhouse, in its casing; and below the floor, the bare pipe.
        staticParts.push(part(new THREE.CylinderGeometry(r, r, c.floor - c.foot, 14).translate(p.x, (c.foot + c.floor) / 2, p.z), c.colour));
        staticParts.push(part(new THREE.CylinderGeometry(r + 0.05, r + 0.05, c.roof - c.floor - 0.05, 14).translate(p.x, (c.floor + c.roof) / 2 - 0.025, p.z), c.casing));
        staticParts.push(part(new THREE.CylinderGeometry(r + 0.06, r + 0.08, 0.07, 14).translate(p.x, c.roof + 0.03, p.z), COLLAR));
        // Over the roof: tapering a little, its top cut on a slant (lower aft), dark inside; raked aft as one.
        const pipe = cut(new THREE.CylinderGeometry(rTop, r, len, 16, 1, true).translate(0, len / 2, 0), len, rTop);
        const mouth = cut(new THREE.CircleGeometry(rTop * 0.94, 16).rotateX(-Math.PI / 2).translate(0, len - 0.04, 0), len - 0.04, rTop);
        for (const [g, colour] of [
          [pipe, c.colour],
          [mouth, SOOT],
        ] as const) {
          g.rotateX(rake).translate(p.x, c.roof, p.z);
          staticParts.push(part(g, colour));
        }
      }
      for (const w of c.water ?? []) {
        // Each outlet: a short stub out of her side, its mouth dark.
        const at = new THREE.Vector3(...w.position);
        const out = new THREE.Vector3(...w.direction).normalize();
        const stub = new THREE.CylinderGeometry(0.075, 0.075, 0.12, 12);
        stub.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), out));
        stub.translate(at.x - out.x * 0.05, at.y - out.y * 0.05, at.z - out.z * 0.05);
        staticParts.push(part(stub, COLLAR));
        const hole = new THREE.CircleGeometry(0.055, 12);
        hole.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), out));
        hole.translate(at.x + out.x * 0.012, at.y + out.y * 0.012, at.z + out.z * 0.012);
        staticParts.push(part(hole, 0x0a0a0a));
      }
      return { staticParts, movingParts: [], controls: [], update: () => {} };
    },
  },
};

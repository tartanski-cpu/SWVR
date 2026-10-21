/**
 * The harbour boats' designs (the settlements brief, Part C; world/harbourBoats.ts): five
 * small craft of the game's own, each one merged, vertex-coloured mesh of a few simple
 * shapes (100-200 triangles), drawn instanced, so a whole harbour of one kind is one draw
 * call. Bow toward -z, the waterline at y = 0, her size from CONFIG.harbourBoats.kinds.
 *
 *   creel    an inshore creel boat: beamy, her wheelhouse forward, the working deck aft
 *            with a stack of creels and a hauler
 *   yacht    a sloop: low coachroof, mast and boom, the mainsail stowed in its cover
 *   cruiser  a motor cruiser: a long cabin with a raked windscreen, a flybridge
 *   rib      a rigid inflatable: grey tubes, a centre console, an outboard
 *   caique   an Aegean caique: a painted wooden hull with a tall stem, a white sheer strake,
 *            a small wheelhouse aft, a short mast forward
 *
 * Each vertex carries `tint`: 1 where the hull's paint is (it takes the boat's own colour,
 * the instance colour), 0 elsewhere (decks, cabins, glass keep their own).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../../config';
import type { HarbourBoatKind } from '../defs';

/** A part in one colour; `tint`: takes the boat's hull colour instead (white here, so the instance colour shows as it is). */
function piece(geo: THREE.BufferGeometry, colour: number, tint = false): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const n = g.attributes.position.count;
  const c = new THREE.Color(tint ? 0xffffff : colour);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(n).fill(tint ? 1 : 0), 1));
  return g;
}

const box = (w: number, h: number, l: number, x: number, y: number, z: number, colour: number, tint = false) => piece(new THREE.BoxGeometry(w, h, l).translate(x, y, z), colour, tint);
const rod = (r: number, h: number, x: number, y: number, z: number, colour: number) => piece(new THREE.CylinderGeometry(r, r, h, 5).translate(x, y + h / 2, z), colour);

/**
 * A hull from her plan, extruded from `bottom` to `top`: a transom `stern` x her beam wide,
 * parallel sides, and the forward `bow` share of her length drawn in to the stem.
 */
function hull(L: number, B: number, bottom: number, top: number, bow: number, stern: number, colour: number, tint = true): THREE.BufferGeometry {
  const s = new THREE.Shape();
  // Shape y = -z (the stem at +y), extruded along +z, which is turned to stand up.
  s.moveTo((-B * stern) / 2, -L / 2);
  s.lineTo((B * stern) / 2, -L / 2);
  s.lineTo(B / 2, -L / 2 + L * 0.3);
  s.lineTo(B / 2, L / 2 - L * bow);
  s.lineTo(B * 0.3, L / 2 - L * bow * 0.35);
  s.lineTo(0, L / 2);
  s.lineTo(-B * 0.3, L / 2 - L * bow * 0.35);
  s.lineTo(-B / 2, L / 2 - L * bow);
  s.lineTo(-B / 2, -L / 2 + L * 0.3);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: top - bottom, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2).translate(0, bottom, 0);
  return piece(g, colour, tint);
}

const WHITE = 0xf2f0ea;
const DECK = 0xb8b2a4;
const GLASS = 0x22303a;
const DARK = 0x2a2a2e;

function creel(L: number, B: number, fb: number): THREE.BufferGeometry[] {
  return [
    hull(L, B, -0.6, fb, 0.32, 0.85, 0x1e2f4a),
    box(B * 0.86, 0.06, L * 0.8, 0, fb - 0.02, L * 0.05, DECK),
    // The wheelhouse forward of midships, her windows, a short mast on its roof.
    box(B * 0.62, 1.9, 2.3, 0, fb + 0.95, -L * 0.12, WHITE),
    box(B * 0.64, 0.45, 2.32, 0, fb + 1.45, -L * 0.12, GLASS),
    box(B * 0.66, 0.08, 2.5, 0, fb + 1.94, -L * 0.12, DARK),
    rod(0.05, 1.8, 0, fb + 1.98, -L * 0.12, DARK),
    // Creels stacked on the after deck, and the hauler by the rail.
    box(1.4, 0.55, 1.6, -0.4, fb + 0.28, L * 0.3, 0x2a6a8a),
    box(1.2, 0.5, 1.2, 0.6, fb + 0.25, L * 0.36, 0xc85a2a),
    box(1.2, 0.45, 1.3, -0.3, fb + 0.78, L * 0.32, 0x2a6a8a),
    box(0.35, 0.8, 0.35, B * 0.32, fb + 0.4, -L * 0.02, 0x8a8a84),
  ];
}

function yacht(L: number, B: number, fb: number): THREE.BufferGeometry[] {
  return [
    hull(L, B, -0.3, fb, 0.42, 0.7, WHITE),
    piece(new THREE.BoxGeometry(0.25, 1.4, L * 0.32).translate(0, -1.0, L * 0.02), DARK), // the fin keel
    box(B * 0.82, 0.05, L * 0.84, 0, fb - 0.02, L * 0.04, 0xd8cfb8),
    box(B * 0.55, 0.5, L * 0.36, 0, fb + 0.25, -L * 0.02, WHITE),
    box(B * 0.57, 0.14, L * 0.3, 0, fb + 0.32, -L * 0.03, GLASS),
    rod(0.07, 13.5, 0, fb, -L * 0.14, 0xb0b4b8),
    // The boom with the mainsail in its blue cover.
    box(0.36, 0.38, L * 0.36, 0, fb + 1.45, L * 0.05, 0x1e3a6a),
  ];
}

function cruiser(L: number, B: number, fb: number): THREE.BufferGeometry[] {
  return [
    hull(L, B, -0.4, fb, 0.36, 0.9, WHITE),
    box(B * 0.86, 0.05, L * 0.84, 0, fb - 0.02, L * 0.04, 0xd8cfb8),
    box(B * 0.78, 1.2, L * 0.48, 0, fb + 0.6, -L * 0.04, WHITE),
    box(B * 0.8, 0.42, L * 0.46, 0, fb + 0.78, -L * 0.04, GLASS),
    box(B * 0.6, 0.6, L * 0.22, 0, fb + 1.5, L * 0.02, WHITE), // the flybridge
    box(B * 0.62, 0.1, L * 0.18, 0, fb + 1.86, L * 0.06, 0x3a3a3e),
  ];
}

function rib(L: number, B: number, fb: number): THREE.BufferGeometry[] {
  const tube = (side: number) => piece(new THREE.CylinderGeometry(0.26, 0.26, L * 0.82, 6).rotateX(Math.PI / 2).translate(side * (B / 2 - 0.26), fb - 0.2, L * 0.04), 0x5a5e62, true);
  return [
    hull(L * 0.95, B * 0.8, -0.35, fb - 0.25, 0.4, 0.85, DARK, false),
    tube(-1),
    tube(1),
    piece(new THREE.ConeGeometry(0.3, L * 0.18, 6).rotateX(-Math.PI / 2).translate(0, fb - 0.2, -L * 0.48), 0x5a5e62, true),
    box(0.8, 0.9, 0.7, 0, fb + 0.2, L * 0.02, WHITE), // the console
    box(0.4, 0.9, 0.45, 0, fb + 0.05, L * 0.5, DARK), // the outboard
  ];
}

function caique(L: number, B: number, fb: number): THREE.BufferGeometry[] {
  return [
    hull(L, B, -0.5, fb, 0.34, 0.75, 0x2a5a9a),
    box(B * 1.01, 0.18, L * 0.7, 0, fb - 0.12, L * 0.05, WHITE), // the white sheer strake
    box(B * 0.84, 0.05, L * 0.84, 0, fb - 0.02, L * 0.04, 0xa8885a),
    // The tall stem post, the wheelhouse aft with her blue roof, the short mast forward.
    box(0.16, 1.1, 0.5, 0, fb + 0.35, -L * 0.48, 0xa8885a),
    box(1.7, 1.7, 1.7, 0, fb + 0.85, L * 0.28, WHITE),
    box(1.75, 0.35, 1.72, 0, fb + 1.2, L * 0.28, GLASS),
    box(1.9, 0.1, 1.9, 0, fb + 1.75, L * 0.28, 0x2a5a9a),
    rod(0.07, 4.5, 0, fb, -L * 0.22, 0xa8885a),
  ];
}

const BUILD: Record<HarbourBoatKind, (L: number, B: number, fb: number) => THREE.BufferGeometry[]> = { creel, yacht, cruiser, rib, caique };

const CACHE = new Map<HarbourBoatKind, THREE.BufferGeometry>();
/** A kind's mesh (built once), to her CONFIG size. */
export function harbourBoatGeometry(kind: HarbourBoatKind): THREE.BufferGeometry {
  let g = CACHE.get(kind);
  if (!g) {
    const k = CONFIG.harbourBoats.kinds[kind];
    g = mergeGeometries(BUILD[kind](k.length, k.beam, k.freeboard))!;
    g.computeVertexNormals();
    g.computeBoundingSphere();
    CACHE.set(kind, g);
  }
  return g;
}

/** Her masthead's height above the waterline (m): where an anchor light hangs. */
export function mastheadHeight(kind: HarbourBoatKind): number {
  const fb = CONFIG.harbourBoats.kinds[kind].freeboard;
  return kind === 'yacht' ? fb + 13.6 : kind === 'caique' ? fb + 4.6 : kind === 'creel' ? fb + 3.8 : kind === 'cruiser' ? fb + 2 : fb + 1;
}

/**
 * The harbour boats' material: flat-shaded, vertex-coloured, the instance colour only where
 * `tint` is 1 (the hull's paint).
 */
export function harbourBoatMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float tint;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\n  vColor.rgb = color * mix(vec3(1.0), instanceColor.rgb, tint);\n#endif');
  };
  return m;
}

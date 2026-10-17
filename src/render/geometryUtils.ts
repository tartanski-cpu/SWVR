import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintIndex, withPixelPaint, type PaintName } from './pixelPaint';

/**
 * Helpers for building flat-shaded, vertex-coloured static geometry that merges into a
 * single draw call. Usage: collect parts with `part()`, then `mergeParts()`.
 */
export function part(geo: THREE.BufferGeometry, color: number, paint?: PaintName): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv'); // the pixel paint's own (paintUv) is made on merging; differing attributes would block it
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('paint', new THREE.BufferAttribute(new Float32Array(n).fill(paintIndex(paint)), 1));
  return g;
}

/**
 * Merge parts and recompute per-face normals (non-indexed -> flat shading). Each face also
 * gets where it falls on its pixel paint (`paintUv`, render/pixelPaint.ts): its corners in
 * metres along the face, seen square-on from the axis it faces most (x, y or z), so a
 * tile's pixels are the same size on every panel. A part without paint gets none.
 */
export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  for (const g of parts) {
    const n = g.attributes.position.count;
    if (!g.attributes.paint) g.setAttribute('paint', new THREE.BufferAttribute(new Float32Array(n), 1));
    // Coordinates already set in the part's own frame (paintLocal, fitPaint) are kept.
    if (!g.userData.paintUvFixed) g.setAttribute('paintUv', new THREE.BufferAttribute(paintUvs(g), 2));
  }
  const merged = mergeGeometries(parts);
  merged.computeVertexNormals();
  return merged;
}

/**
 * Sets a painted part's paint coordinates now, in its own frame, before it's moved and
 * turned into place (a house at 45 degrees still gets level boards, square to its walls).
 * `swap` turns the picture a quarter turn on faces seen from above, for roofs: the courses
 * of slates and the ribs of a sheet run the right way down the slope.
 */
export function paintLocal(g: THREE.BufferGeometry, swap = false): THREE.BufferGeometry {
  g.setAttribute('paintUv', new THREE.BufferAttribute(paintUvs(g, swap), 2));
  g.userData.paintUvFixed = true;
  return g;
}

/**
 * Stretches a whole-picture tile (`crate`, `window`) to fill each face of a part once: its
 * coordinates run 0..1 across the part's extent, seen square-on as usual. Set in the part's
 * own frame, so call it before moving the part into place.
 */
export function fitPaint(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.computeBoundingBox();
  const { min, max } = g.boundingBox!;
  const span = (k: 'x' | 'y' | 'z', v: number) => (v - min[k]) / Math.max(1e-6, max[k] - min[k]);
  g.setAttribute('paintUv', new THREE.BufferAttribute(paintUvs(g, false, span), 2));
  g.userData.paintUvFixed = true;
  return g;
}

/**
 * A non-indexed geometry's paint coordinates, face by face: metres along the face (or, with
 * `fit`, 0..1 across the part), seen square-on from the axis the face looks along most.
 */
function paintUvs(g: THREE.BufferGeometry, swap = false, fit?: (k: 'x' | 'y' | 'z', v: number) => number): Float32Array {
  const pos = g.attributes.position;
  const paint = g.attributes.paint;
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const at = (k: 'x' | 'y' | 'z', v: THREE.Vector3) => (fit ? fit(k, v[k]) : v[k]);
  for (let i = 0; i + 2 < pos.count; i += 3) {
    if (!paint?.getX(i)) continue;
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    const nrm = c.clone().sub(b).cross(a.clone().sub(b));
    const ax = Math.abs(nrm.x);
    const ay = Math.abs(nrm.y);
    const az = Math.abs(nrm.z);
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? a : k === 1 ? b : c;
      // Facing sideways (x): along her (z) and up (y). Facing up (y): across (x) and along (z), or the other way round (swap). Facing fore or aft (z): across and up.
      const [u, w] = ax >= ay && ax >= az ? [at('z', v), at('y', v)] : ay >= az ? (swap ? [at('z', v), at('x', v)] : [at('x', v), at('z', v)]) : [at('x', v), at('y', v)];
      uv[(i + k) * 2] = u;
      uv[(i + k) * 2 + 1] = w;
    }
  }
  return uv;
}

export const flatVertexColorMaterial = (): THREE.MeshLambertMaterial =>
  withPixelPaint(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));

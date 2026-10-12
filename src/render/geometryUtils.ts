import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Helpers for building flat-shaded, vertex-coloured static geometry that merges into a
 * single draw call. Usage: collect parts with `part()`, then `mergeParts()`.
 */
export function part(geo: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv'); // no textures; differing attributes would block merging
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Merge parts and recompute per-face normals (non-indexed -> flat shading). */
export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts);
  merged.computeVertexNormals();
  return merged;
}

export const flatVertexColorMaterial = (): THREE.MeshLambertMaterial =>
  new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

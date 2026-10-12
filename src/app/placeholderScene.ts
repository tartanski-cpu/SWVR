import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Milestone 1 placeholder content so there is something to look at and stand on.
 * Replaced by the ocean (milestone 2) and the vessel (milestone 3+).
 *
 * Demonstrates the static-geometry rule used throughout the project: bake colours into
 * vertex attributes and merge everything that never moves into a single draw call.
 */
export function createPlaceholderScene(): THREE.Object3D {
  const root = new THREE.Group();
  root.name = 'placeholder';

  // Flat "sea" so the horizon reads correctly.
  const sea = new THREE.Mesh(
    new THREE.CircleGeometry(4000, 48).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x1d4f6e }),
  );
  sea.position.y = -0.3;
  root.add(sea);

  const parts: THREE.BufferGeometry[] = [];
  const add = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, ry = 0) => {
    geo.rotateY(ry).translate(x, y, z);
    paint(geo, color);
    parts.push(geo.index ? geo.toNonIndexed() : geo);
  };

  // A 4 x 4 m raft to stand on in room-scale VR.
  add(new THREE.BoxGeometry(4, 0.3, 4), 0x8a6a48, 0, -0.15, 0);
  // Test cube at waist height, 1.5 m in front (-Z is "forward").
  add(new THREE.BoxGeometry(0.3, 0.3, 0.3), 0xe0a020, 0, 1.0, -1.5, Math.PI / 4);
  // A ring of navigation buoys for scale and parallax.
  const buoyColors = [0xd0302a, 0x2a9a40, 0xe8c020, 0xf0f0f0];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = 25 + (i % 3) * 20;
    const x = Math.sin(a) * r;
    const z = -Math.cos(a) * r;
    const color = buoyColors[i % buoyColors.length];
    add(new THREE.CylinderGeometry(0.6, 0.8, 1.2, 8), color, x, 0.3, z);
    add(new THREE.ConeGeometry(0.45, 1.4, 8), color, x, 1.6, z);
  }

  const merged = mergeGeometries(parts);
  merged.computeVertexNormals(); // non-indexed -> per-face normals -> flat shading
  root.add(new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true })));
  return root;
}

/** Bake a flat colour into a `color` vertex attribute (sRGB hex -> linear). */
function paint(geo: THREE.BufferGeometry, hex: number): void {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // UVs are unused (no textures) and would block merging with geometries lacking them.
  geo.deleteAttribute('uv');
}

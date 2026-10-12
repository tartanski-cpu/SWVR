import * as THREE from 'three';
import type { HullForm } from '../hullForm';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';

/** Placeholder livery; the vessel definition will own colours once there are several types. */
const COLORS = {
  bottom: 0x8c2a22, // antifouling
  topsides: 0xd9622b,
  deck: 0x7d8a78,
  house: 0xe6e6df,
  windows: 0x1f2b33,
  roof: 0xb9bdb6,
  mast: 0x3a3f44,
};

/**
 * Lofts the hull stations into flat panels (one quad per polygon edge between adjacent
 * stations), closes the transom, and adds a placeholder wheelhouse block. Everything is
 * merged into one vertex-coloured, flat-shaded mesh: one draw call.
 */
export function buildVesselMesh(form: HullForm): THREE.Mesh {
  const positions: number[] = [];
  const colors: number[] = [];
  const c = new THREE.Color();
  const n = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const centroid = new THREE.Vector3();

  /** Add triangle a-b-c, flipped if needed so its normal points away from `inside`. */
  const tri = (a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3, inside: THREE.Vector3, color: number) => {
    e1.subVectors(b, a);
    e2.subVectors(d, a);
    n.crossVectors(e1, e2);
    if (n.lengthSq() < 1e-10) return; // degenerate (stem)
    centroid.copy(a).add(b).add(d).divideScalar(3).sub(inside);
    const verts = n.dot(centroid) >= 0 ? [a, b, d] : [a, d, b];
    c.set(color);
    for (const v of verts) {
      positions.push(v.x, v.y, v.z);
      colors.push(c.r, c.g, c.b);
    }
  };

  const st = form.stations;
  const P = (i: number, k: number) => new THREE.Vector3(st[i].polygon[k][0], st[i].polygon[k][1], st[i].z);
  const inside = (i: number) => {
    const poly = st[i].polygon;
    return new THREE.Vector3(0, (poly[2][1] + poly[0][1]) / 2, st[i].z);
  };

  for (let i = 0; i < st.length - 1; i++) {
    // Interior reference midway between the two stations.
    const mid = inside(i).add(inside(i + 1)).multiplyScalar(0.5);
    const edges: [number, number, number][] = [
      [0, 1, COLORS.topsides], // port topside
      [1, 2, COLORS.bottom], // port bottom
      [2, 3, COLORS.bottom], // starboard bottom
      [3, 4, COLORS.topsides], // starboard topside
      [4, 0, COLORS.deck], // deck
    ];
    for (const [a, b, color] of edges) {
      const a0 = P(i, a);
      const b0 = P(i, b);
      const a1 = P(i + 1, a);
      const b1 = P(i + 1, b);
      tri(a0, b0, b1, mid, color);
      tri(a0, b1, a1, mid, color);
    }
  }
  // Transom (station 0) as a fan around its centre.
  const tIn = inside(0).add(new THREE.Vector3(0, 0, -1));
  const tC = new THREE.Vector3(0, (st[0].polygon[2][1] + st[0].polygon[0][1]) / 2, st[0].z);
  for (let k = 0; k < 5; k++) tri(tC, P(0, k), P(0, (k + 1) % 5), tIn, COLORS.topsides);

  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  hull.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  hull.computeVertexNormals();

  // Placeholder wheelhouse (replaced by the walkable interior in milestone 5).
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: number) =>
    part(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
  const house = [
    box(2.9, 2.1, 3.4, 0, 2.05, -0.2, COLORS.house),
    box(2.96, 0.7, 3.46, 0, 2.55, -0.2, COLORS.windows), // window band
    box(3.1, 0.12, 3.7, 0, 3.16, -0.2, COLORS.roof),
    box(0.12, 1.6, 0.12, 0, 4.0, 0.4, COLORS.mast),
    box(0.9, 0.08, 0.08, 0, 4.4, 0.4, COLORS.mast),
  ];

  const mesh = new THREE.Mesh(mergeParts([hull, ...house]), flatVertexColorMaterial());
  mesh.name = 'hull';
  return mesh;
}

import * as THREE from 'three';
import { CONFIG } from '../config';

type MeshConfig = typeof CONFIG.ocean.mesh;

/**
 * 1D grid coordinates for the ocean tile, symmetric about 0: uniform `innerSpacing` out
 * to `innerHalfExtent`, then each cell `growth` times larger than the last out to `radius`.
 * Dense where you look closely, coarse towards the horizon where fog hides detail.
 */
export function gridCoordinates(m: MeshConfig = CONFIG.ocean.mesh): number[] {
  const half = [0];
  let x = 0;
  let step = m.innerSpacing;
  while (x < m.innerHalfExtent - 1e-6) {
    x += step;
    half.push(x);
  }
  while (x < m.radius) {
    step *= m.growth;
    x = Math.min(x + step, m.radius);
    half.push(x);
  }
  return [...half.slice(1).reverse().map((v) => -v), ...half];
}

/** Distance from the tile centre at which grid cells first exceed `cellSize` metres. */
export function distanceForCellSize(cellSize: number, m: MeshConfig = CONFIG.ocean.mesh): number {
  if (cellSize <= m.innerSpacing) return m.innerHalfExtent;
  let x = m.innerHalfExtent;
  let step = m.innerSpacing;
  while (step < cellSize && x < m.radius) {
    step *= m.growth;
    x += step;
  }
  return Math.min(x, m.radius);
}

/**
 * Flat grid in the XZ plane (y = 0). The vertex shader displaces it with the wave sum;
 * the mesh itself is moved to follow the viewer, snapped to `innerSpacing` so the dense
 * centre always samples the same world points and does not "swim".
 */
export function createOceanGeometry(m: MeshConfig = CONFIG.ocean.mesh): THREE.BufferGeometry {
  const coords = gridCoordinates(m);
  const n = coords.length;
  const positions = new Float32Array(n * n * 3);
  let p = 0;
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      positions[p++] = coords[ix];
      positions[p++] = 0;
      positions[p++] = coords[iz];
    }
  }
  const indices: number[] = [];
  for (let iz = 0; iz < n - 1; iz++) {
    for (let ix = 0; ix < n - 1; ix++) {
      const a = iz * n + ix;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      // Counter-clockwise when seen from above (+Y).
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return geo;
}

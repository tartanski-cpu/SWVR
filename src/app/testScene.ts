import * as THREE from 'three';
import { CONFIG } from '../config';
import { sampleSurface, type PreparedWave } from '../ocean/waves';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';

/**
 * Milestone 2 test scene, replaced by the vessel from milestone 3 onwards:
 *  - a pile-mounted observation platform to stand on above the waves (fixed to the seabed),
 *  - navigation buoys that float on the CPU wave surface (a second visual check that CPU
 *    and GPU waves agree).
 */
export function createPlatform(): THREE.Mesh {
  const { platformDeckHeight: h, platformHalfSize: s } = CONFIG.testScene;
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, hh: number, d: number, x: number, y: number, z: number, color: number) =>
    parts.push(part(new THREE.BoxGeometry(w, hh, d).translate(x, y, z), color));

  box(2 * s, 0.25, 2 * s, 0, h - 0.125, 0, 0x8a6a48); // deck
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const pileX = x * (s - 0.4);
    const pileZ = z * (s - 0.4);
    parts.push(part(new THREE.CylinderGeometry(0.25, 0.25, h + 8, 8).translate(pileX, (h - 8) / 2 - 0.25, pileZ), 0x4a4f55));
    box(0.08, 1.05, 0.08, x * (s - 0.05), h + 0.525, z * (s - 0.05), 0xd8d8d0); // corner posts
  }
  // Handrails at 1.0 m (top) and 0.5 m (knee rail).
  for (const y of [h + 1.0, h + 0.5]) {
    box(2 * s, 0.05, 0.05, 0, y, -s + 0.05, 0xe0c020);
    box(2 * s, 0.05, 0.05, 0, y, s - 0.05, 0xe0c020);
    box(0.05, 0.05, 2 * s, -s + 0.05, y, 0, 0xe0c020);
    box(0.05, 0.05, 2 * s, s - 0.05, y, 0, 0xe0c020);
  }
  const mesh = new THREE.Mesh(mergeParts(parts), flatVertexColorMaterial());
  mesh.name = 'platform';
  return mesh;
}

/** Floating buoys: one instanced draw call, posed from the CPU wave surface each frame. */
export class Buoys {
  readonly mesh: THREE.InstancedMesh;
  private readonly spots: [number, number][] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly n = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor() {
    // Origin at the waterline. White base geometry; instance colours tint it.
    const geo = mergeParts([
      part(new THREE.CylinderGeometry(0.6, 0.75, 1.4, 8).translate(0, 0, 0), 0xffffff),
      part(new THREE.ConeGeometry(0.45, 1.4, 8).translate(0, 1.4, 0), 0xffffff),
      part(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6).translate(0, 2.3, 0), 0x333333),
    ]);
    const colors = [0xd0302a, 0x2a9a40, 0xe8c020, 0xf0f0f0];
    const count = 10;
    this.mesh = new THREE.InstancedMesh(geo, flatVertexColorMaterial(), count);
    this.mesh.name = 'buoys';
    this.mesh.frustumCulled = false;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.3;
      const r = 18 + (i % 3) * 18;
      this.spots.push([Math.sin(a) * r, -Math.cos(a) * r]);
      this.mesh.setColorAt(i, new THREE.Color(colors[i % colors.length]));
    }
  }

  update(waves: readonly PreparedWave[]): void {
    this.spots.forEach(([x, z], i) => {
      const s = sampleSurface(waves, x, z);
      // Sit on the surface and lean with the local slope (a real buoy lags; good enough here).
      this.n.set(...s.normal);
      this.q.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, this.n);
      this.p.set(x, s.height, z);
      this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.one));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

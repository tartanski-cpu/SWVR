import * as THREE from 'three';
import { CONFIG } from '../config';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';

/**
 * Milestone 2 acceptance check: magenta spheres whose centres are placed at the
 * CPU-computed surface height. If CPU and GPU waves agree, every sphere stays exactly
 * half-submerged as the waves pass. One extra probe follows a point 6 m in front of the
 * viewer so you can sweep it over "any point" by looking around.
 */
export class SurfaceProbes {
  readonly mesh: THREE.InstancedMesh;
  private readonly spots: [number, number][] = [];
  private readonly m = new THREE.Matrix4();
  private readonly fwd = new THREE.Vector3();

  constructor() {
    for (const [radius, count] of [[7, 10], [14, 14]] as const) {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        this.spots.push([Math.sin(a) * radius, Math.cos(a) * radius]);
      }
    }
    this.mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.3, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xff2bd6, fog: false }),
      this.spots.length + 1,
    );
    this.mesh.name = 'surfaceProbes';
    this.mesh.frustumCulled = false;
    this.mesh.visible = CONFIG.debug.surfaceProbesVisibleAtStart;
  }

  toggle(): void {
    this.mesh.visible = !this.mesh.visible;
  }

  update(waves: readonly PreparedWave[], camera: THREE.Camera): void {
    if (!this.mesh.visible) return;
    this.spots.forEach(([x, z], i) => {
      this.mesh.setMatrixAt(i, this.m.makeTranslation(x, surfaceHeight(waves, x, z), z));
    });
    // Cursor probe: 6 m ahead of the viewer, horizontally.
    camera.getWorldDirection(this.fwd);
    this.fwd.y = 0;
    this.fwd.normalize().multiplyScalar(6);
    const cam = camera.getWorldPosition(new THREE.Vector3());
    const x = cam.x + this.fwd.x;
    const z = cam.z + this.fwd.z;
    this.mesh.setMatrixAt(this.spots.length, this.m.makeTranslation(x, surfaceHeight(waves, x, z), z));
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

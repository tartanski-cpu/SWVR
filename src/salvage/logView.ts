import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { groundHeight } from '../world/terrain';

const MAX = 6;

/**
 * The salvage logs (salvage.ts): a bark-brown trunk with paler cut ends, one instanced
 * mesh (one draw call). On the beach it lies on the sand; afloat it rides low in the water,
 * rolling a little with the swell. Each log's length scales a 1 m model.
 */
export class LogView {
  readonly root = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor() {
    this.root.name = 'salvageLogs';
    // Along z, 1 m long, 0.6 m across; slightly tapered, with a stub of a branch.
    const geo = mergeParts([
      part(new THREE.CylinderGeometry(0.28, 0.32, 1, 9, 1, true).rotateX(Math.PI / 2), 0x5e4128),
      part(new THREE.CircleGeometry(0.28, 9).rotateX(Math.PI).translate(0, 0, -0.5), 0xc9a878),
      part(new THREE.CircleGeometry(0.32, 9).translate(0, 0, 0.5), 0xc9a878),
    ]);
    this.mesh = new THREE.InstancedMesh(geo, flatVertexColorMaterial(), MAX);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.name = 'salvageLog';
    this.root.add(this.mesh);
  }

  update(world: WorldState, waves: readonly PreparedWave[], t: number): void {
    const logs = world.salvage?.logs ?? [];
    this.mesh.count = Math.min(MAX, logs.length);
    for (let i = 0; i < this.mesh.count; i++) {
      const l = logs[i];
      const sea = surfaceHeight(waves, l.x, l.z);
      const y = l.afloat ? sea - 0.12 : Math.max(groundHeight(l.x, l.z), sea - 0.1) + 0.28;
      const roll = l.afloat ? 0.15 * Math.sin(t * 0.9 + i) : 0;
      this.p.set(l.x, y, l.z);
      this.q.setFromEuler(this.e.set(0, l.yaw, roll));
      this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s.set(1, 1, l.len)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

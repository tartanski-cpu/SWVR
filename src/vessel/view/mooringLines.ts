import * as THREE from 'three';
import { berthAxis, berthById } from '../physics/mooring';
import type { VesselDef } from '../vesselDef';
import type { VesselState } from '../vesselState';

/**
 * Bow and stern lines from the deck edge on the berth side to bollards on the quay/pier
 * edge, drawn while docking or moored. Thin ropes (not 1-px lines, which all but vanish in
 * a headset): one instanced cylinder draw call, posed each frame in world space.
 */
export class MooringLines {
  readonly mesh: THREE.InstancedMesh;
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly mid = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly toShore = new THREE.Vector3();

  constructor() {
    // Unit-length rope along +Y, centred on the origin.
    const geo = new THREE.CylinderGeometry(0.035, 0.035, 1, 5, 1, true);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xe0d2a0 }), 2);
    this.mesh.name = 'mooringLines';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  update(s: VesselState, def: VesselDef, root: THREE.Object3D): void {
    const berth = s.mooring.phase !== 'free' ? berthById(s.mooring.berthId) : undefined;
    this.mesh.visible = !!berth;
    if (!berth) return;
    const ax = berthAxis(berth, s.mooring.reversed);
    // Which side of the boat faces the quay: the shore direction in vessel axes (x sign).
    root.worldToLocal(this.toShore.set(root.position.x + berth.shoreX, root.position.y, root.position.z + berth.shoreZ));
    const side = Math.sign(this.toShore.x) || 1;
    const L = def.mooring.lineZ;
    const halfBeam = def.hull.params.beamDeck / 2 - 0.15;
    [-L, L].forEach((lz, i) => {
      root.localToWorld(this.a.set(side * halfBeam, def.mooring.lineY + 0.1, lz));
      // Bollard on the quay edge, a few metres further along than the cleat (a lead):
      // the bow line leads forward, the stern line aft.
      const along = lz < 0 ? L + 3 : -L - 3;
      this.b.set(
        berth.x + ax.x * along + berth.shoreX * (berth.shoreDist + 0.5),
        berth.deckY + 0.5,
        berth.z + ax.z * along + berth.shoreZ * (berth.shoreDist + 0.5),
      );
      this.mid.addVectors(this.a, this.b).multiplyScalar(0.5);
      this.dir.subVectors(this.b, this.a);
      const len = this.dir.length();
      this.q.setFromUnitVectors(this.up, this.dir.divideScalar(len || 1));
      this.m.compose(this.mid, this.q, this.s.set(1, len, 1));
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

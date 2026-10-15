import * as THREE from 'three';
import type { VesselDef } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';

type MonitorConfig = NonNullable<VesselDef['fireMonitor']>;

/**
 * The fire monitor on the wheelhouse roof: a red pedestal, a yoke that pans and a barrel
 * that elevates, set every frame from the vessel's controls (monPan, monTilt). Its origin
 * is the nozzle's pivot (CONFIG fireMonitor.position); the barrel points along -z at pan 0.
 */
export class MonitorView {
  readonly root = new THREE.Group();
  private readonly yoke = new THREE.Group();
  private readonly barrel = new THREE.Group();

  constructor(m: MonitorConfig) {
    const red = new THREE.MeshLambertMaterial({ color: 0xc8281a });
    const steel = new THREE.MeshLambertMaterial({ color: 0x8a9096 });
    this.root.name = 'fireMonitor';
    this.root.position.fromArray(m.position);
    // Pedestal from the roof up to the pivot.
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.36, 10).translate(0, -0.2, 0), red);
    // Yoke: a U carrying the barrel's trunnions.
    for (const x of [-0.09, 0.09]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.06).translate(x, 0.02, 0), red);
      this.yoke.add(arm);
    }
    this.yoke.add(new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.03, 0.08).translate(0, -0.06, 0), red));
    // Barrel and nozzle along -z.
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.5, 10).rotateX(Math.PI / 2).translate(0, 0, -0.2), red);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.045, 0.16, 10).rotateX(Math.PI / 2).translate(0, 0, -0.52), steel);
    this.barrel.add(tube, nozzle);
    this.yoke.add(this.barrel);
    this.root.add(post, this.yoke);
  }

  update(s: VesselState): void {
    // Pan: + to starboard (a turn to the right, about -y); elevation about x.
    this.yoke.rotation.y = (-s.controls.monPan * Math.PI) / 180;
    this.barrel.rotation.x = (s.controls.monTilt * Math.PI) / 180;
  }
}

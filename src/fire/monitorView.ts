import * as THREE from 'three';
import type { CONFIG } from '../config';
import { monitorAim } from './fire';

type MonitorConfig = typeof CONFIG.vessels.workboat.fireMonitor;

/**
 * The fire monitor on the wheelhouse roof: a red pedestal, a yoke that pans and a barrel
 * that elevates, set every frame from its pan and elevation (the fire monitor module reads
 * them off the bus, 'monitor.pan' / 'monitor.tilt'). Its origin is the nozzle's pivot
 * (CONFIG fireMonitor.position); the barrel points along -z at pan 0.
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
    this.stabilised = m.stabilised;
  }

  /**
   * @param panDeg, tiltDeg  its aim (+ starboard, + up)
   * @param pumping  the FIRE PUMP is switched on
   */
  update(panDeg: number, tiltDeg: number, pumping: boolean): void {
    let pan = panDeg;
    let tilt = tiltDeg;
    // Stabilised only while the FIRE PUMP is switched on (owner: no need otherwise); off,
    // the monitor rides with the boat. The jet itself (fire.ts) only flows with the pump on.
    if (this.stabilised && pumping && this.root.parent) {
      // Stabilised: where the jet really points (held level against her roll and pitch,
      // fire.ts monitorAim), back in the boat's axes, as she's drawn this frame.
      this.root.parent.getWorldQuaternion(this.q);
      const d = monitorAim(pan, tilt, this.q, true, this.d).applyQuaternion(this.q.invert());
      pan = (Math.atan2(d.x, -d.z) * 180) / Math.PI;
      tilt = (Math.asin(Math.max(-1, Math.min(1, d.y))) * 180) / Math.PI;
    }
    // Pan: + to starboard (a turn to the right, about -y); elevation about x.
    this.yoke.rotation.y = (-pan * Math.PI) / 180;
    this.barrel.rotation.x = (tilt * Math.PI) / 180;
  }

  private readonly stabilised: boolean;
  private readonly q = new THREE.Quaternion();
  private readonly d = new THREE.Vector3();
}

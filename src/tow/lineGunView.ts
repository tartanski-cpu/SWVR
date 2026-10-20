import * as THREE from 'three';
import type { LineGun } from './lineGun';

const PTS = 10;

/**
 * What the line gun shows (owner, Oct 2026): the rocket in flight with the messenger line
 * trailing back to the muzzle; attached, the messenger from the ship's eye back to our
 * stern roller with the hawser (thicker, darker) coming across along it as the ship's crew
 * haul. Two lines and a small mesh.
 */
export class LineGunView {
  readonly root = new THREE.Group();
  private readonly rocket: THREE.Mesh;
  private readonly messenger: THREE.Line;
  private readonly hawser: THREE.Line;
  private readonly pts: THREE.Vector3[] = Array.from({ length: PTS }, () => new THREE.Vector3());
  private readonly hpts: THREE.Vector3[] = Array.from({ length: PTS }, () => new THREE.Vector3());

  constructor() {
    this.root.name = 'lineGun';
    this.rocket = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xe8641a }));
    this.rocket.visible = false;
    this.messenger = new THREE.Line(new THREE.BufferGeometry().setFromPoints(this.pts), new THREE.LineBasicMaterial({ color: 0xf2e8c0 }));
    this.hawser = new THREE.Line(new THREE.BufferGeometry().setFromPoints(this.hpts), new THREE.LineBasicMaterial({ color: 0x5a4a30, linewidth: 2 }));
    this.messenger.frustumCulled = this.hawser.frustumCulled = false;
    this.messenger.visible = this.hawser.visible = false;
    this.root.add(this.rocket, this.messenger, this.hawser);
  }

  /**
   * @param tip   the muzzle (world) while the gun is in hand
   * @param stern our stern roller (world), where the hawser leads from
   */
  update(gun: LineGun, tip: THREE.Vector3 | null, stern: THREE.Vector3): void {
    const flying = gun.phase === 'flying' && !!tip;
    const hauling = gun.phase === 'hauling' && !!gun.target;
    this.rocket.visible = flying;
    this.messenger.visible = flying || hauling;
    this.hawser.visible = hauling;
    if (flying && tip) {
      const r = gun.rocket;
      this.rocket.position.set(r.x, r.y, r.z);
      this.rocket.lookAt(tip);
      this.sag(this.pts, tip, this.rocket.position, 0.6);
      this.messenger.geometry.setFromPoints(this.pts);
    } else if (hauling && gun.target) {
      const eye = gun.target.pos;
      const e = new THREE.Vector3(eye.x, eye.y, eye.z);
      this.sag(this.pts, stern, e, 1.5);
      this.messenger.geometry.setFromPoints(this.pts);
      // The hawser creeps across from our stern toward the eye as they haul.
      const to = stern.clone().lerp(e, gun.haul);
      this.sag(this.hpts, stern, to, 1.2 * gun.haul);
      this.hawser.geometry.setFromPoints(this.hpts);
    }
  }

  private sag(out: THREE.Vector3[], a: THREE.Vector3, b: THREE.Vector3, droop: number): void {
    for (let i = 0; i < PTS; i++) {
      const t = i / (PTS - 1);
      out[i].set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - droop * 4 * t * (1 - t), a.z + (b.z - a.z) * t);
    }
  }
}

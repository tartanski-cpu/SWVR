import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { EnvironmentState } from '../../environment/environmentState';
import { windVector } from '../../environment/weather';
import type { VesselState } from '../vesselState';

/**
 * A wind sock at the masthead: an orange-and-white striped cone on a swivel that streams
 * downwind of the APPARENT wind (true wind minus the boat's way), drooping in light air
 * and standing out straight from about 8 m/s (force 4-5). One mesh, eased so it swings
 * rather than snaps.
 */
export class WindSock {
  readonly root = new THREE.Group();
  private readonly swivel = new THREE.Group();
  private readonly sock = new THREE.Group();
  private yaw = 0;
  private droop = 1.2;
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly wind = { x: 0, z: 0 };

  /** @param top masthead (vessel axes) */
  constructor(top: [number, number, number]) {
    this.root.position.fromArray(top);
    const len = 0.6;
    const bands = 5;
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < bands; i++) {
      const r0 = 0.09 - (0.055 * i) / bands;
      const r1 = 0.09 - (0.055 * (i + 1)) / bands;
      const g = new THREE.CylinderGeometry(r0, r1, len / bands, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, (len / bands) * (i + 0.5)).toNonIndexed();
      const col = new THREE.Color(i % 2 === 0 ? 0xff5a14 : 0xf4f4f0);
      const n = g.attributes.position.count;
      const c = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) col.toArray(c, k * 3);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      parts.push(g);
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.25, 6).translate(0, 0.125, 0), new THREE.MeshLambertMaterial({ color: 0xb8bcc0 }));
    this.sock.add(mesh);
    this.sock.position.y = 0.25;
    this.swivel.add(this.sock);
    this.root.add(pole, this.swivel);
    this.root.name = 'windSock';
  }

  update(s: VesselState, env: EnvironmentState, dt: number): void {
    windVector(env, this.wind);
    // Apparent wind in the boat's axes.
    this.q.fromArray(s.orientation).invert();
    this.v.set(this.wind.x - s.linearVelocity[0], 0, this.wind.z - s.linearVelocity[2]).applyQuaternion(this.q);
    const speed = Math.hypot(this.v.x, this.v.z);
    // The sock streams downwind: its +z (tail) along the apparent wind.
    const yaw = Math.atan2(this.v.x, this.v.z);
    const droop = (1 - Math.min(1, speed / 8)) * 1.2;
    const k = Math.min(1, dt * 2.5);
    this.yaw += (((yaw - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * (speed > 0.3 ? k : 0);
    this.droop += (droop - this.droop) * k;
    this.swivel.rotation.y = this.yaw;
    this.sock.rotation.x = this.droop; // tail down in light air
  }
}

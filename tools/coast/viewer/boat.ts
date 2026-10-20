/**
 * The coast viewer's test boat (pipeline milestone 2): a 10 m workboat stand-in to drive
 * through a region by its marks and check the scale, the shallows and grounding. Not the
 * game's vessel physics (that comes when the region goes into the game): a simple model,
 * speed easing to the throttle's, turning with rudder and way, carried by any current zone,
 * and stopped where the ground under her bow, stern or sides comes within her draft.
 */
import * as THREE from 'three';

export const DRAFT = 1.2;
const LENGTH = 10;
const BEAM = 3.6;
const MAX_KN = 10;
const KN = 0.514444;

export class TestBoat {
  readonly root = new THREE.Group();
  heading = 0; // rad, 0 north, clockwise
  speed = 0; // through the water, m/s
  throttle = 0; // -0.3 .. 1
  rudder = 0; // -1 .. 1
  aground = false;
  depth = 0;
  sog = 0;

  constructor() {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(BEAM, 1.6, LENGTH), new THREE.MeshLambertMaterial({ color: 0xd0582a }));
    hull.position.y = 0.4;
    const bow = new THREE.Mesh(new THREE.ConeGeometry(BEAM / 2, 2.4, 4).rotateX(-Math.PI / 2).rotateZ(Math.PI / 4), new THREE.MeshLambertMaterial({ color: 0xd0582a }));
    bow.position.set(0, 0.4, -LENGTH / 2 - 1.1);
    const house = new THREE.Mesh(new THREE.BoxGeometry(BEAM * 0.75, 2, 3), new THREE.MeshLambertMaterial({ color: 0xf0eee8 }));
    house.position.set(0, 2.2, -0.5);
    this.root.add(hull, bow, house);
  }

  place(x: number, z: number, heading: number): void {
    this.root.position.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.aground = false;
  }

  /**
   * @param groundAt ground height (m above MSL) at a point
   * @param current  the water's velocity there (m/s, x, z)
   */
  step(dt: number, groundAt: (x: number, z: number) => number, current: (x: number, z: number) => [number, number]): void {
    const target = this.throttle * MAX_KN * KN;
    this.speed += (target - this.speed) * Math.min(1, dt / 3);
    this.heading += this.rudder * 0.25 * (this.speed / (MAX_KN * KN) + 0.15 * Math.sign(this.speed || 1)) * dt;
    const p = this.root.position;
    const fx = Math.sin(this.heading);
    const fz = -Math.cos(this.heading);
    const [cx, cz] = current(p.x, p.z);
    const vx = fx * this.speed + cx;
    const vz = fz * this.speed + cz;
    const nx = p.x + vx * dt;
    const nz = p.z + vz * dt;
    // Her bow, stern and sides at the new place: any within her draft of the ground and she's aground.
    const probes: [number, number][] = [
      [0, LENGTH / 2 + 1],
      [0, -LENGTH / 2],
      [BEAM / 2, 0],
      [-BEAM / 2, 0],
    ];
    const hit = probes.some(([s, a]) => groundAt(nx + fx * a - fz * s, nz + fz * a + fx * s) > -DRAFT);
    if (hit) {
      this.aground = true;
      this.speed = 0;
      this.sog = 0;
    } else {
      this.aground = false;
      p.x = nx;
      p.z = nz;
      this.sog = Math.hypot(vx, vz);
    }
    this.depth = -groundAt(p.x, p.z);
    this.root.rotation.y = -this.heading;
  }
}

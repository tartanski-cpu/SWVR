import * as THREE from 'three';

/**
 * A laser pointer's beam: a thin red line from the hand (or the eyes, on desktop) to where
 * it hits, with a bright dot there that stays a readable size at any distance. Used for
 * our own pointer and, inside each avatar, for the crewmates' (they arrive in the poses).
 * Unlit, no fog on the dot: a laser dot shows through haze.
 */
export class LaserBeam {
  readonly root = new THREE.Group();
  private readonly line: THREE.Line;
  private readonly dot: THREE.Mesh;

  constructor(color = 0xff2a1a) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75, toneMapped: false }));
    this.line.frustumCulled = false;
    this.dot = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color, fog: false, toneMapped: false }));
    this.root.add(this.line, this.dot);
    this.root.name = 'laser';
    this.root.visible = false;
  }

  /** Show the beam from `a` to `b` (in the root's parent frame); `hit`: draw the dot. */
  set(a: THREE.Vector3, b: THREE.Vector3, hit: boolean): void {
    const pos = this.line.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, a.x, a.y, a.z);
    pos.setXYZ(1, b.x, b.y, b.z);
    pos.needsUpdate = true;
    this.dot.visible = hit;
    this.dot.position.copy(b);
    this.dot.scale.setScalar(Math.max(0.012, a.distanceTo(b) * 0.004));
    this.root.visible = true;
  }

  hide(): void {
    this.root.visible = false;
  }
}

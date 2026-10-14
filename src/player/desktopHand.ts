import * as THREE from 'three';

/**
 * Your own hand on the desktop: when the mouse holds something (a control, a crate), a hand
 * shoots out from just below-right of your view and grips it on a stretchy arm, and follows
 * it as it moves; let go and it's gone. Purely visual (others see the same on your avatar).
 */
export class DesktopHand {
  readonly root = new THREE.Group();
  private readonly hand: THREE.Mesh;
  private readonly arm: THREE.Mesh;
  private readonly shoulder = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private out = false;

  constructor(color = 0xd8582a) {
    const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
    this.hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat);
    this.arm = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 1, 7).translate(0, 0.5, 0), mat);
    this.root.add(this.hand, this.arm);
    this.root.visible = false;
    this.root.name = 'desktopHand';
  }

  setColor(color: number): void {
    (this.hand.material as THREE.MeshLambertMaterial).color.setHex(color);
  }

  /** @param target world point the hand grips, or null (nothing held) */
  update(camera: THREE.Camera, target: THREE.Vector3 | null, dt: number): void {
    camera.updateMatrixWorld();
    this.shoulder.set(0.2, -0.32, -0.15).applyMatrix4(camera.matrixWorld);
    if (!target) {
      this.root.visible = false;
      this.out = false;
      return;
    }
    if (!this.out) {
      // Start from the shoulder and shoot out to the grip (the "magnet").
      this.hand.position.copy(this.shoulder);
      this.out = true;
    }
    this.root.visible = true;
    this.hand.position.lerp(target, Math.min(1, dt * 18));
    const len = this.dir.copy(this.hand.position).sub(this.shoulder).length();
    this.arm.position.copy(this.shoulder);
    this.arm.quaternion.setFromUnitVectors(this.up, this.dir.normalize());
    const w = Math.max(0.4, Math.min(1, 0.6 / Math.max(0.01, len)));
    this.arm.scale.set(w, Math.max(0.01, len), w);
  }
}

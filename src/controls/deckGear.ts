/**
 * Small gear the crew handles on transit jobs (duties):
 *   FenderBasket  a basket of fenders on the aft deck; a press puts all six out over the
 *                 side or takes them in (`fenders`). FendersView draws them (one instanced
 *                 draw call): hanging outside the hull when out, lying along the bulwark in.
 *   Dipstick      in the engine hatch in the wheelhouse floor: a press pulls it and reads
 *                 the oil (`dipstick`; the App says what it shows).
 *   OilCan        by the hatch: a press tops the sump up (`oilTopUp`).
 */
import * as THREE from 'three';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import type { VesselState } from '../vessel/vesselState';
import { Control } from './Control';

export class FenderBasket extends Control {
  readonly kind = 'press' as const;
  readonly label = 'Fenders: out / in';
  private out = false;

  constructor() {
    super('fenders', 'fenders');
    const basket = this.fixed(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.35, 10, 1, true).translate(0, 0.175, 0), new THREE.MeshLambertMaterial({ color: 0x3a3f44, side: THREE.DoubleSide })));
    // A couple of fenders poking out of it (while they're in).
    const f = new THREE.Mesh(
      mergeParts([part(new THREE.CapsuleGeometry(0.09, 0.3, 4, 8).translate(-0.06, 0.4, 0), 0x1a3a6a), part(new THREE.CapsuleGeometry(0.09, 0.3, 4, 8).rotateZ(0.3).translate(0.07, 0.38, 0.04), 0x1a3a6a)]),
      flatVertexColorMaterial(),
    );
    this.root.add(basket, f);
    this.hitObjects.push(f, basket);
    this.show(false);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(new THREE.Vector3(0, 0.3, 0));
  }

  pressStart(): void {
    this.show(!this.out);
    this.ctx?.haptic(0.5, 40);
    this.ctx?.emit(this.channel, this.out ? 1 : 0);
  }

  private show(out: boolean): void {
    this.out = out;
    // The fenders in the basket are hidden while they're over the side.
    (this.root.children[1] as THREE.Object3D).visible = !out;
  }

  sync(state: VesselState): void {
    const out = state.controls.fenders > 0;
    if (out !== this.out) this.show(out);
  }
}

/** The six fenders, out over the side or stowed along the bulwark (one instanced draw call). */
export class FendersView {
  readonly mesh: THREE.InstancedMesh;
  private shown = -1;
  private readonly spots: { z: number; side: number; halfBeam: number; deckY: number }[] = [];

  constructor(zs: readonly number[], plan: { halfBeam(z: number): number; deckY(z: number): number }) {
    // The fender and its line up to the rail (visible from on board; laid out on deck when stowed).
    const geo = mergeParts([part(new THREE.CapsuleGeometry(0.12, 0.45, 4, 8), 0x1a3a6a), part(new THREE.CylinderGeometry(0.008, 0.008, 0.95).translate(0, 0.8, 0), 0xe8e0c8)]);
    for (const side of [-1, 1]) for (const z of zs) this.spots.push({ z, side, halfBeam: plan.halfBeam(z), deckY: plan.deckY(z) });
    this.mesh = new THREE.InstancedMesh(geo, flatVertexColorMaterial(), this.spots.length);
    this.mesh.name = 'fenders';
  }

  update(state: VesselState): void {
    const out = state.controls.fenders > 0 ? 1 : 0;
    if (out === this.shown) return;
    this.shown = out;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    this.spots.forEach((s, i) => {
      if (out) {
        // Hanging on their lines just outside the hull, below the sheer.
        m.compose(new THREE.Vector3(s.side * (s.halfBeam + 0.13), s.deckY - 0.55, s.z), q.identity(), one);
      } else {
        // Lying fore-and-aft on deck against the bulwark.
        q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
        m.compose(new THREE.Vector3(s.side * (s.halfBeam - 0.25), s.deckY + 0.12, s.z), q, one);
      }
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Dipstick extends Control {
  readonly kind = 'press' as const;
  readonly label = 'Dipstick: check the oil';
  private readonly stick = new THREE.Group();
  private pulled = 0;

  constructor() {
    super('dipstick', 'dipstick');
    const tube = this.fixed(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12).translate(0, 0.06, 0), new THREE.MeshLambertMaterial({ color: 0x2a2e32 })));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12), this.material(0xe8c020));
    ring.position.y = 0.16;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.3).translate(0, -0.02, 0), this.material(0xb0b4b8));
    this.stick.add(ring, rod);
    this.root.add(tube, this.stick);
    this.hitObjects.push(ring, tube);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(new THREE.Vector3(0, 0.16, 0));
  }

  pressStart(): void {
    this.pulled = 1.2; // out for a moment to read, then back in
    this.ctx?.haptic(0.4, 40);
    this.ctx?.emit(this.channel, 1);
  }

  sync(): void {}

  tick(dt: number): void {
    super.tick(dt);
    this.pulled = Math.max(0, this.pulled - dt);
    this.stick.position.y = this.pulled > 0 ? 0.22 : 0;
  }
}

export class OilCan extends Control {
  readonly kind = 'press' as const;
  readonly label = 'Oil can: top up the engine oil';

  constructor() {
    super('oilTopUp', 'oilTopUp');
    const can = new THREE.Mesh(
      mergeParts([part(new THREE.BoxGeometry(0.16, 0.24, 0.1).translate(0, 0.12, 0), 0xc0281c), part(new THREE.CylinderGeometry(0.02, 0.02, 0.05).translate(0.04, 0.265, 0), 0xe8c020), part(new THREE.BoxGeometry(0.03, 0.06, 0.08).translate(-0.05, 0.27, 0), 0x2a2a2a)]),
      flatVertexColorMaterial(),
    );
    this.root.add(can);
    this.hitObjects.push(can);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(new THREE.Vector3(0, 0.15, 0));
  }

  pressStart(): void {
    this.ctx?.haptic(0.4, 60);
    this.ctx?.emit(this.channel, 1);
  }

  sync(): void {}
}

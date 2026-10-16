import * as THREE from 'three';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import type { VesselState } from '../vessel/vesselState';

/**
 * The gate in the working-deck bulwark (layout.sideGate): the section of bulwark plate and
 * rail between the two gateposts, hinged on the forward post, swinging inboard. Not itself
 * a control: the push buttons on the aft post (`DoorButton` with key 'sideGate') open and
 * shut it. It swings over about half a second. One mesh.
 * Its root sits at the hinge, on the deck edge; the gate runs from there to `end` (the aft
 * post), both in the vessel's axes.
 */
export class SideGate {
  readonly root = new THREE.Group();
  private open = 0;
  private target = 0;

  constructor(
    hinge: THREE.Vector3,
    end: THREE.Vector3,
    bulwarkHeight: number,
    railHeight: number,
    private readonly side: number,
    private readonly openRad: number,
  ) {
    this.root.name = 'sideGate';
    this.root.position.copy(hinge);
    const d = end.clone().sub(hinge);
    const L = Math.hypot(d.x, d.z) - 0.06; // clear of the posts
    const z0 = 0.03;
    const bh = bulwarkHeight;
    const rh = railHeight;
    const plate = 0xd9622b; // as the bulwark (hullMesh COLORS.topsides)
    const rail = 0xe8e4d8;
    const gate = new THREE.Mesh(
      mergeParts([
        part(new THREE.BoxGeometry(0.05, bh, L).translate(0, bh / 2, z0 + L / 2), plate),
        part(new THREE.BoxGeometry(0.05, 0.05, L).translate(0, rh, z0 + L / 2), rail), // top rail
        part(new THREE.BoxGeometry(0.035, 0.035, L).translate(0, (bh + rh) / 2, z0 + L / 2), rail), // middle rail
        part(new THREE.BoxGeometry(0.04, rh - bh, 0.04).translate(0, (bh + rh) / 2, z0 + L - 0.02), rail), // its free end
        part(new THREE.BoxGeometry(0.04, rh - bh, 0.04).translate(0, (bh + rh) / 2, z0 + 0.02), rail), // its hinge end
        ...[0.2, rh - 0.12].map((y) => part(new THREE.CylinderGeometry(0.025, 0.025, 0.08, 8).translate(0, y, 0), 0x6a7076)), // hinges
        part(new THREE.BoxGeometry(0.06, 0.04, 0.08).translate(0, rh - 0.06, z0 + L + 0.02), 0x6a7076), // the latch
      ]),
      flatVertexColorMaterial(),
    );
    // Line the gate up with the deck edge between the posts (the hull's plan curve).
    gate.rotation.y = Math.atan2(d.x, d.z);
    this.root.add(gate);
    this.place();
  }

  sync(state: VesselState): void {
    this.target = (state.controls.sideGate ?? 0) > 0.5 ? 1 : 0;
  }

  /** Swing toward open / shut (call every frame). */
  tick(dt: number): void {
    if (this.open === this.target) return;
    this.open += Math.sign(this.target - this.open) * Math.min(Math.abs(this.target - this.open), dt * 2);
    this.place();
  }

  private place(): void {
    // Eased, so it starts and stops gently. Inboard: toward -x on the starboard side.
    const e = this.open * this.open * (3 - 2 * this.open);
    this.root.rotation.y = -this.side * e * this.openRad;
  }
}

import * as THREE from 'three';
import type { VesselState } from '../vessel/vesselState';
import { Control } from './Control';

/**
 * The forepeak hatch on the foredeck: a low coaming and a lid hinged on its aft edge. A
 * press opens / closes it (`hatch` 1 / 0). Open in the rain, water gets below (bilge.ts).
 */
export class Hatch extends Control {
  readonly kind = 'press' as const;
  readonly label = 'Forepeak hatch: open / close';
  private readonly lid = new THREE.Group();
  private open = false;

  constructor(size: number) {
    super('hatch', 'hatch');
    const s = size;
    const coaming = this.fixed(new THREE.Mesh(new THREE.BoxGeometry(s + 0.08, 0.1, s + 0.08), new THREE.MeshLambertMaterial({ color: 0xd8d4c8 })));
    coaming.position.y = 0.05;
    // The dark opening, seen when the lid is up.
    const hole = this.fixed(new THREE.Mesh(new THREE.BoxGeometry(s - 0.04, 0.004, s - 0.04), new THREE.MeshLambertMaterial({ color: 0x101214 })));
    hole.position.y = 0.101;
    // Lid: hinged at its aft edge (+z), swinging up and back (you see it standing from the wheelhouse).
    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(s + 0.04, 0.04, s + 0.04).translate(0, 0.02, -s / 2 - 0.02), this.material(0xe8e4d8));
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.03).translate(0, 0.055, -s + 0.06), this.material(0x8a9096));
    this.lid.add(lidMesh, handle);
    this.lid.position.set(0, 0.1, s / 2 + 0.02);
    this.root.add(coaming, hole, this.lid);
    this.hitObjects.push(lidMesh, handle, coaming);
    this.show(false);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(new THREE.Vector3(0, 0.15, 0));
  }

  pressStart(): void {
    this.show(!this.open);
    this.ctx?.haptic(0.6, 40);
    this.ctx?.emit(this.channel, this.open ? 1 : 0);
  }

  private show(open: boolean): void {
    this.open = open;
    this.lid.rotation.x = open ? 1.9 : 0; // up, a little past vertical, resting aft
  }

  sync(state: VesselState): void {
    const open = state.controls.hatch > 0;
    if (open !== this.open) this.show(open);
  }
}

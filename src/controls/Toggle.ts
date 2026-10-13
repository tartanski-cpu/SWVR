import * as THREE from 'three';
import type { VesselState } from '../vessel/vesselState';
import { Control } from './Control';

/**
 * Two-position toggle switch (e.g. navigation lights). A press flips it; the bat lever
 * tilts forward (on) or aft (off). The authoritative position comes from the vessel state.
 */
export class Toggle extends Control {
  readonly kind = 'press' as const;
  private readonly bat = new THREE.Group();
  private on = false;

  constructor(
    id: string,
    channel: string,
    readonly label: string,
    private readonly read: (s: VesselState) => number,
  ) {
    super(id, channel);
    const plate = this.fixed(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.09), new THREE.MeshLambertMaterial({ color: 0x23282c })));
    plate.position.y = 0.006;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.05, 8), this.material(0xd8dadc));
    stick.position.y = 0.025;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), this.material(0xd8dadc));
    tip.position.y = 0.05;
    this.bat.position.y = 0.012;
    this.bat.add(stick, tip);
    this.root.add(plate, this.bat);
    this.hitObjects.push(stick, tip, plate);
    this.show(false);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(new THREE.Vector3(0, 0.04, 0));
  }

  pressStart(): void {
    this.show(!this.on);
    this.ctx?.haptic(0.5, 30);
    this.ctx?.emit(this.channel, this.on ? 1 : 0);
  }

  private show(on: boolean): void {
    this.on = on;
    this.bat.rotation.x = on ? -0.45 : 0.45; // forward = on
  }

  sync(state: VesselState): void {
    const on = this.read(state) > 0.5;
    if (on !== this.on) this.show(on);
  }
}

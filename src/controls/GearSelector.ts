import * as THREE from 'three';
import { clamp } from '../core/math';
import type { VesselState } from '../vessel/vesselState';
import { Control, type Pointer } from './Control';

/**
 * The outboard's gear lever, on the side of the motor: FORWARD / NEUTRAL / REVERSE with
 * firm detents, like a real outboard's shift lever. Grab it and push it forward (toward
 * the bow) for forward, pull it back for reverse; it snaps to the nearest gear. Desktop:
 * drag it the same way.
 *
 * Sends `<vesselId>:obGear` = +1 / 0 / -1 when the gear changes (the simulation closes the
 * throttle on a shift).
 */
export class GearSelector extends Control {
  readonly kind = 'grab' as const;
  readonly label = 'Gear: forward / neutral / reverse';
  private readonly arm = new THREE.Group();
  private readonly knob: THREE.Mesh;
  private readonly length = 0.09;
  private readonly max = 0.6;
  private theta = 0;
  private grabTheta = 0;
  private grabZ = 0;
  private gear = 0;

  constructor(readonly vesselId: string) {
    super(`gear:${vesselId}`, `${vesselId}:obGear`);
    // Gate plate with green (forward) and red (reverse) ends.
    const plate = this.fixed(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.1), new THREE.MeshLambertMaterial({ color: 0x15181a })));
    const fwd = this.fixed(new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.032, 0.025), new THREE.MeshLambertMaterial({ color: 0x2f8f3a })));
    fwd.position.z = -0.04;
    const rev = this.fixed(new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.032, 0.025), new THREE.MeshLambertMaterial({ color: 0xa8402a })));
    rev.position.z = 0.04;
    this.root.add(plate, fwd, rev);
    // Lever sticking out sideways (+x), pivoting about x.
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, this.length, 8).rotateZ(-Math.PI / 2).translate(this.length / 2, 0, 0), this.material(0xb8bcc0));
    this.knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), this.material(0xe0b020));
    this.knob.position.x = this.length;
    this.arm.add(rod, this.knob);
    this.root.add(this.arm);
    // Generous invisible grab volume around the knob (the pointer ray ignores visibility).
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.14), new THREE.MeshBasicMaterial());
    hit.position.x = this.length * 0.8;
    hit.visible = false;
    this.arm.add(hit);
    this.hitObjects.push(this.knob, rod, hit);
  }

  grabPoint(out: THREE.Vector3): THREE.Vector3 {
    return this.knob.getWorldPosition(out);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.knob.getWorldPosition(new THREE.Vector3()).distanceTo(world);
  }

  grabStart(p: Pointer): void {
    this.held = true;
    this.grabTheta = this.theta;
    this.grabZ = this.toLocal(p.position).z;
  }

  grabMove(p: Pointer): void {
    // Hand travel fore-aft swings the lever; past half way it drops into the next gear.
    const dz = this.toLocal(p.position).z - this.grabZ;
    this.theta = clamp(this.grabTheta + dz / 0.08, -1, 1);
    const g = this.theta < -0.5 ? 1 : this.theta > 0.5 ? -1 : 0;
    if (g !== this.gear) {
      this.gear = g;
      this.ctx?.haptic(0.7, 40);
      this.ctx?.emit(`${this.vesselId}:obGear`, g);
    }
    this.show(this.theta);
  }

  grabEnd(_p: Pointer): void {
    this.held = false;
    this.theta = -this.gear; // snap into the detent
    this.show(this.theta);
  }

  sync(state: VesselState): void {
    if (this.held) return;
    this.gear = state.controls.obGear;
    this.theta = -this.gear;
    this.show(this.theta);
  }

  /** Current gear as a word, for hints. */
  get gearName(): string {
    return this.gear > 0 ? 'FORWARD' : this.gear < 0 ? 'REVERSE' : 'NEUTRAL';
  }

  private show(t: number): void {
    // Forward (t = -1) tips the knob toward the bow.
    this.arm.rotation.x = t * this.max;
  }
}

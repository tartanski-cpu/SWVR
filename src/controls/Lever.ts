import * as THREE from 'three';
import { clamp } from '../core/math';
import type { VesselState } from '../vessel/vesselState';
import { Control, type Pointer } from './Control';

/**
 * Single-lever throttle/gear control. Pivots about its local X axis (athwartships):
 * pushed forward (toward the bow, -Z) = ahead, pulled back = astern, upright = neutral.
 *
 * Grab maths, in the lever's local frame: the hand's angle about the pivot in the Y-Z plane
 * is theta_hand = atan2(z, y). At grab start we remember the offset to the lever's current
 * angle, so grabbing anywhere on the handle doesn't make it jump; afterwards
 * theta = clamp(theta_hand - offset). A magnetic detent holds it in neutral, with a click.
 *
 * Value convention: -1 (full astern) .. +1 (full ahead); value = -theta / maxAngle.
 */
export class Lever extends Control {
  readonly kind = 'grab' as const;
  readonly label = 'Throttle / gear lever';
  private readonly arm = new THREE.Group();
  private readonly knob: THREE.Mesh;
  private readonly max: number;
  private readonly length: number;
  private theta = 0;
  private offset = 0;
  private lastSent = 0; // matches the initial (neutral / amidships) state
  private inDetent = true;

  constructor(id: string, opts: { maxAngleDeg: number; length: number }, private readonly detent = 0.06) {
    super(id, 'lever');
    this.max = (opts.maxAngleDeg * Math.PI) / 180;
    this.length = opts.length;

    // Quadrant base (static part of the control) with ahead/astern colour marks.
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.16), this.material(0x2a2f33));
    base.position.y = 0.025;
    const ahead = new THREE.Mesh(new THREE.BoxGeometry(0.104, 0.006, 0.05), new THREE.MeshLambertMaterial({ color: 0x2f8f3a }));
    ahead.position.set(0, 0.051, -0.05);
    const astern = new THREE.Mesh(new THREE.BoxGeometry(0.104, 0.006, 0.05), new THREE.MeshLambertMaterial({ color: 0xa8402a }));
    astern.position.set(0, 0.051, 0.05);
    this.root.add(base, ahead, astern);

    // Arm + knob rotate about the pivot (local origin, slightly above the base).
    this.arm.position.y = 0.04;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, this.length, 8), this.material(0xb8bcc0));
    rod.position.y = this.length / 2;
    this.knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), this.material(0xd23c2a));
    this.knob.position.y = this.length;
    this.arm.add(rod, this.knob);
    this.root.add(this.arm);
    this.hitObjects.push(rod, this.knob, base);
  }

  distanceTo(world: THREE.Vector3): number {
    // Anywhere along the upper half of the handle counts.
    const p = this.toLocal(world).sub(this.arm.position);
    const dir = new THREE.Vector3(0, Math.cos(this.theta), Math.sin(this.theta));
    const t = clamp(p.dot(dir), this.length * 0.4, this.length);
    return p.distanceTo(dir.multiplyScalar(t));
  }

  get value(): number {
    return this.theta === 0 ? 0 : -this.theta / this.max;
  }

  private handAngle(p: Pointer): number {
    const l = this.pointerOnPlane(p, new THREE.Vector3(1, 0, 0)).sub(this.arm.position);
    return Math.atan2(l.z, l.y);
  }

  grabStart(p: Pointer): void {
    this.held = true;
    this.offset = this.handAngle(p) - this.theta;
  }

  grabMove(p: Pointer): void {
    this.setTheta(this.handAngle(p) - this.offset);
  }

  grabEnd(_p: Pointer): void {
    this.held = false;
  }

  /** Extra drag travel absorbed while sitting in the neutral notch (desktop). */
  private notchHold = 0;

  nudge(_dx: number, dy: number): void {
    // Mouse up = push the lever forward (ahead). A drag stops in the neutral notch and needs
    // a little deliberate extra movement to go through it, like the real lever's gate.
    const step = dy * 0.004;
    let next = this.theta + step;
    if (this.theta !== 0 && Math.sign(next) !== Math.sign(this.theta)) {
      next = 0;
      this.notchHold = 0;
    } else if (this.theta === 0 && step !== 0) {
      this.notchHold += Math.abs(step);
      if (this.notchHold < 0.25) {
        next = 0; // ~60 px of extra drag needed
      } else {
        // Through the gate: land just clear of the magnetic detent so it doesn't recapture.
        this.notchHold = 0;
        next = Math.sign(step) * this.max * (this.detent + 0.01);
      }
    }
    this.setTheta(next);
  }

  private setTheta(raw: number): void {
    let theta = clamp(raw, -this.max, this.max);
    // Magnetic neutral detent.
    const v = -theta / this.max;
    const inDetent = Math.abs(v) < this.detent;
    if (inDetent) theta = 0;
    if (inDetent !== this.inDetent) this.ctx?.haptic(inDetent ? 0.5 : 0.25, inDetent ? 35 : 15);
    this.inDetent = inDetent;
    this.theta = theta;
    this.arm.rotation.x = theta;
    const value = this.value;
    if (Math.abs(value - this.lastSent) > 0.004 || (value === 0 && this.lastSent !== 0)) {
      this.lastSent = value;
      this.ctx?.emit(this.channel, value);
    }
  }

  sync(state: VesselState): void {
    if (this.held) return;
    this.theta = -state.controls.lever * this.max;
    this.arm.rotation.x = this.theta;
    this.lastSent = state.controls.lever;
    this.inDetent = Math.abs(state.controls.lever) < this.detent;
  }
}

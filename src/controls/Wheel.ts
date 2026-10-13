import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp } from '../core/math';
import type { VesselState } from '../vessel/vesselState';
import { Control, type Pointer } from './Control';

/**
 * Steering wheel (hydraulic steering: it stays where you leave it, the rudder follows at
 * the steering gear's rate). The wheel turns about its local Z axis, which points at the
 * helmsman; the rim lies in the local X-Y plane.
 *
 * Grab maths, in the wheel's local frame: each grabbing hand's angle around the hub is
 * phi = atan2(y, x). Every frame the wheel turns by the change in phi (wrapped to +-pi),
 * averaged over the hands holding it, so it can be turned through several revolutions
 * hand-over-hand and two-handed. Limited to +-half the lock-to-lock turns.
 *
 * Value: helm -1 (hard a-port) .. +1 (hard a-starboard). Turning clockwise as the
 * helmsman sees it (a negative rotation about +Z) is starboard.
 */
export class Wheel extends Control {
  readonly kind = 'grab' as const;
  readonly label = 'Wheel';
  readonly multiGrab = true;
  private readonly spinner = new THREE.Group();
  private readonly radius: number;
  private readonly maxAngle: number;
  private angle = 0;
  private readonly prev = new Map<Pointer['position'], number>();
  private grabs = 0;
  private lastSent = 0; // matches the initial (neutral / amidships) state
  private clickAccum = 0;

  constructor(id: string, opts: { radius: number; turnsLockToLock: number }) {
    super(id, 'helm');
    this.radius = opts.radius;
    this.maxAngle = opts.turnsLockToLock * Math.PI; // half the lock-to-lock travel, in rad

    const R = this.radius;
    const parts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(R, 0.017, 6, 28)];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spoke = new THREE.CylinderGeometry(0.008, 0.008, R, 6);
      spoke.translate(0, R / 2, 0).rotateZ(a);
      parts.push(spoke);
    }
    parts.push(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 10).rotateX(Math.PI / 2));
    const wheel = new THREE.Mesh(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map(stripUv)), this.material(0x5b3a22));
    // Marker knob at the top so you can see where amidships is.
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), this.material(0xe8d06a));
    marker.position.set(0, R, 0.01);
    this.spinner.add(wheel, marker);
    // Shaft back into the console.
    const shaft = this.fixed(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3c4248 })));
    shaft.position.z = -0.06;
    this.root.add(this.spinner, shaft);
    this.hitObjects.push(wheel, marker);
  }

  distanceTo(world: THREE.Vector3): number {
    const l = this.toLocal(world);
    const inPlane = Math.hypot(l.x, l.y);
    // Distance to the rim (a circle), so hands anywhere on the rim count.
    return Math.hypot(inPlane - this.radius, l.z);
  }

  private handAngle(p: Pointer): number {
    const l = this.pointerOnPlane(p, new THREE.Vector3(0, 0, 1));
    return Math.atan2(l.y, l.x);
  }

  grabStart(p: Pointer): void {
    this.held = true;
    this.grabs++;
    this.prev.set(p.position, this.handAngle(p));
  }

  grabMove(p: Pointer): void {
    const phi = this.handAngle(p);
    const before = this.prev.get(p.position) ?? phi;
    this.prev.set(p.position, phi);
    let d = phi - before;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    // Two hands: each contributes half.
    this.turn(d / Math.max(1, this.grabs));
  }

  grabEnd(p: Pointer): void {
    this.prev.delete(p.position);
    this.grabs = Math.max(0, this.grabs - 1);
    if (this.grabs === 0) {
      this.held = false;
      this.prev.clear();
    }
  }

  nudge(dx: number): void {
    // Mouse right = clockwise = starboard.
    this.turn(-dx * 0.012);
  }

  private turn(d: number): void {
    const next = clamp(this.angle + d, -this.maxAngle, this.maxAngle);
    const moved = next - this.angle;
    if (next !== this.angle && Math.abs(next) === this.maxAngle) this.ctx?.haptic(0.7, 40); // hard over
    this.angle = next;
    this.spinner.rotation.z = this.angle;
    // A light tick every 30 degrees of wheel (the spokes going past your hand).
    this.clickAccum += Math.abs(moved);
    if (this.clickAccum > Math.PI / 6) {
      this.clickAccum = 0;
      this.ctx?.haptic(0.2, 12);
    }
    const helm = -this.angle / this.maxAngle;
    if (Math.abs(helm - this.lastSent) > 0.003) {
      this.lastSent = helm;
      this.ctx?.emit(this.channel, helm);
    }
  }

  sync(state: VesselState): void {
    if (this.held) return;
    this.angle = -state.controls.helm * this.maxAngle;
    this.spinner.rotation.z = this.angle;
    this.lastSent = state.controls.helm;
  }
}

function stripUv(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.deleteAttribute('uv');
  return g;
}

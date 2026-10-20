import * as THREE from 'three';
import { clamp } from '../core/math';
import type { VesselState } from '../vessel/vesselState';
import { Control, type Pointer } from './Control';

/**
 * The helm joystick (owner, Oct 2026; pod drives' vector mode, modules/pods): a short
 * spring-centred stick with three ways to move: sideways, fore and aft, and twisted about
 * its own axis. Unlike the searchlight's joystick it drives nothing at a rate: it sends where
 * it is (each way -1..1), and 0 when let go, as it springs back. What she does with it is the
 * pods' (physics/podAllocation.ts): sideways she crabs, fore and aft she creeps, twisted she
 * turns on the spot.
 *
 * VR: grab the knob and move your hand: the stick leans with the hand's offset from where you
 * grabbed it, and turns with your wrist (the hand's turn about the stick's axis since the grab).
 * Desktop: click it, then W A S D lean it and Q / E twist it (its `keyExtras`), while the mouse
 * looks around; click again to let go. Or drag it with the mouse.
 */
export class HelmJoystick extends Control {
  readonly kind = 'grab' as const;
  readonly label: string;
  private readonly stick = new THREE.Group();
  private readonly knob: THREE.Group;
  /** Hand travel (m) for full lean; the stick's lean at full (rad); the wrist's turn for full twist (rad). */
  private readonly travel = 0.06;
  private readonly maxLean = 0.35;
  private readonly fullTwist = 0.6;
  private readonly knobTwist = 0.5;
  private x = 0;
  private y = 0;
  private r = 0;
  private sent = { x: 0, y: 0, r: 0 };
  private readonly grabAt = new THREE.Vector3();
  private grabYaw = 0;
  /** The desktop's twist keys, held (-1, 0, +1), and the desktop drag's lean. */
  private keyTwist = 0;
  private dragX = 0;
  private dragY = 0;

  constructor(
    id: string,
    private readonly channels: { x: string; y: string; r: string },
    label: string,
    private readonly read: (s: VesselState) => { x: number; y: number; r: number },
  ) {
    super(id, channels.x);
    this.label = label;
    // The base: a black housing with a bright ring round its boot (it stands out by night).
    const base = this.fixed(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.062, 0.03, 16), new THREE.MeshLambertMaterial({ color: 0x15171a })));
    base.position.y = 0.015;
    const ring = this.fixed(new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.004, 6, 20).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xb9bec3 })));
    ring.position.y = 0.031;
    const boot = this.fixed(new THREE.Mesh(new THREE.SphereGeometry(0.034, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x0c0d0f })));
    boot.position.y = 0.03;
    this.stick.position.y = 0.035;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.07, 8), this.material(0x2a2d31));
    rod.position.y = 0.035;
    // The knob: a fat black grip, flattened a little fore and aft so its twist shows, a grey
    // thumb pad on top with a white mark pointing ahead.
    this.knob = new THREE.Group();
    this.knob.position.y = 0.09;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.055, 14).scale(1.15, 1, 0.9), this.material(0x101214));
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.15, 0.5, 0.9), this.material(0x3a3e43));
    pad.position.y = 0.0275;
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.003, 0.018), this.material(0xf0f0f0));
    mark.position.set(0, 0.04, -0.01);
    this.knob.add(grip, pad, mark);
    this.stick.add(rod, this.knob);
    this.root.add(base, ring, boot, this.stick);
    this.hitObjects.push(grip, pad, rod, base);
  }

  grabPoint(out: THREE.Vector3): THREE.Vector3 {
    return this.knob.getWorldPosition(out);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(this.toLocal(this.knob.getWorldPosition(new THREE.Vector3())));
  }

  /** The hand's turn about the stick's axis (rad, + anticlockwise seen from above), from its forward. */
  private yawOf(p: Pointer): number {
    if (!p.quaternion) return 0;
    const q = this.root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(p.quaternion);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    return Math.atan2(-f.x, -f.z);
  }

  grabStart(p: Pointer): void {
    this.held = true;
    this.toLocal(p.position, this.grabAt);
    this.grabYaw = this.yawOf(p);
  }

  grabMove(p: Pointer): void {
    const h = this.toLocal(p.position);
    let turn = this.yawOf(p) - this.grabYaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    // Twisted clockwise (seen from above: a negative turn about up) is + (bow to starboard).
    this.set((h.x - this.grabAt.x) / this.travel, -(h.z - this.grabAt.z) / this.travel, -turn / this.fullTwist);
  }

  grabEnd(_p: Pointer): void {
    this.held = false;
    this.keyTwist = this.dragX = this.dragY = 0;
    this.set(0, 0, 0);
  }

  readonly keySteerable = true;

  /** Desktop keys: W A S D lean it (Q / E twist it: `twistKey`). */
  keySteer(x: number, y: number): void {
    this.held = true;
    this.set(x, y, this.keyTwist);
  }

  /** Desktop: Q (-1) or E (+1) held, or let go (0). */
  twistKey(dir: number): void {
    this.keyTwist = dir;
    this.set(this.x, this.y, dir);
  }

  /** Desktop drag: lean it with the mouse (pixels); it springs back on release. */
  nudge(dx: number, dy: number): void {
    this.dragX = clamp(this.dragX + dx / 80, -1, 1);
    this.dragY = clamp(this.dragY - dy / 80, -1, 1);
    this.set(this.dragX, this.dragY, this.r);
  }

  sync(state: VesselState): void {
    if (this.held) return;
    // Someone else's hand on it (multiplayer): show where they have it.
    const v = this.read(state);
    this.x = v.x;
    this.y = v.y;
    this.r = v.r;
    this.sent = { ...v };
    this.show();
  }

  private set(x: number, y: number, r: number): void {
    this.x = clamp(x, -1, 1);
    this.y = clamp(y, -1, 1);
    this.r = clamp(r, -1, 1);
    // Sent when it moves a little, and always on coming back to centre.
    for (const k of ['x', 'y', 'r'] as const) {
      const v = Math.round(this[k] * 100) / 100;
      if (Math.abs(v - this.sent[k]) > 0.015 || (v === 0 && this.sent[k] !== 0)) {
        this.ctx?.emit(this.channels[k], v);
        this.sent[k] = v;
      }
    }
    this.show();
  }

  private show(): void {
    this.stick.rotation.set(-this.y * this.maxLean, 0, -this.x * this.maxLean);
    this.knob.rotation.y = -this.r * this.knobTwist;
  }
}

/**
 * A desktop key's stand-in (the helm joystick's Q and E): no part of the scene, just a
 * Control the interaction system can press and release while it steers the joystick.
 */
export class TwistKey extends Control {
  readonly kind = 'press' as const;
  readonly label = 'Twist';
  constructor(
    private readonly stick: HelmJoystick,
    private readonly dir: number,
  ) {
    super(`${stick.id}Twist${dir > 0 ? 'Cw' : 'Ccw'}`, stick.channel);
  }
  distanceTo(): number {
    return Infinity;
  }
  sync(): void {}
  pressStart(): void {
    this.stick.twistKey(this.dir);
  }
  pressEnd(): void {
    this.stick.twistKey(0);
  }
}

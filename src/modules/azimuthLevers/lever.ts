/**
 * One azimuth drive's lever, twist and throttle (owner, Oct 2026: "a realistic approach with a
 * twist and throttle ... at either side of the operator ... one hand each"), as an ASD tug's
 * combined lever: a turntable that turns right round, an arrow on it pointing the way its drive
 * pushes (0 ahead, + to starboard, round to astern), and on it a power lever that tilts forward
 * along the arrow, from idle upright (a small `detent` near upright reads idle) to full at
 * `maxTiltDeg`. Both stay where they're left, as a real lever's friction holds them.
 *
 * VR: grab the grip. Twist your wrist (turn the hand about the upright, as a door knob) and the
 * turntable turns with it, `twistGain` degrees a degree; let go and grab again to turn further.
 * Push the hand forward along the arrow for power, back toward upright for less. Desktop: drag
 * it (sideways twists it, up and down sets the power), or click it and steer with the keys
 * (A / D twist it, W / S more or less power). It sends its direction (deg) and power (0..1) as
 * two intents while it moves (absolute values, so a late or repeated one is harmless).
 */
import * as THREE from 'three';
import { clamp } from '../../core/math';
import { Control, type Pointer } from '../../controls/Control';
import type { VesselState } from '../../vessel/vesselState';

export interface AzimuthLeverOptions {
  length: number;
  maxTiltDeg: number;
  detent: number;
  twistGain: number;
  turntableRadius: number;
  colour: number;
  rodColour: number;
  baseColour: number;
}

const RAD = Math.PI / 180;
/** Desktop: how fast the keys twist it (deg/s) and set the power (per s). */
const KEY_TURN = 90;
const KEY_LEAN = 0.5;

export class AzimuthLever extends Control {
  readonly kind = 'grab' as const;
  readonly label: string;
  readonly keySteerable = true;
  /** The turntable (turns with the angle) and the power lever on it (tilts with the power). */
  private readonly table = new THREE.Group();
  private readonly arm = new THREE.Group();
  private readonly grip: THREE.Mesh;
  /** Its direction (deg, 0 ahead, + to starboard) and power (0..1), as it stands. */
  angle = 0;
  power = 0;
  private sentAngle = NaN;
  private sentPower = NaN;
  /** Grabbed: the grip's offset from the hand, and the hand's twist and the angle at the grab. */
  private readonly offset = new THREE.Vector3();
  private twist0 = NaN;
  private angle0 = 0;
  private keys = { x: 0, y: 0 };
  private readonly pivotY: number;

  constructor(
    id: string,
    private readonly opts: AzimuthLeverOptions,
    private readonly channels: { angle: string; power: string },
    private readonly read: { angle: (s: VesselState) => number; power: (s: VesselState) => number },
    label: string,
  ) {
    super(id, channels.power);
    this.label = label;
    const r = opts.turntableRadius;
    const dark = new THREE.MeshLambertMaterial({ color: opts.baseColour });
    // The fixed housing, with its ring of marks: ahead (white), abeam and astern.
    const base = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.012, r + 0.018, 0.03, 20), dark);
    base.position.y = 0.015;
    const marks = new THREE.MeshLambertMaterial({ color: 0x8a9096 });
    const root: THREE.Mesh[] = [base];
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.004, 0.014), k === 0 ? new THREE.MeshLambertMaterial({ color: 0xffffff }) : marks);
      const a = (k * Math.PI) / 2;
      m.position.set(Math.sin(a) * (r + 0.006), 0.031, -Math.cos(a) * (r + 0.006));
      m.rotation.y = -a;
      root.push(m);
    }
    // The turntable: a disc with an arrow (the way the drive pushes) and the lever's fork.
    this.table.position.y = 0.03;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.012, 20).translate(0, 0.006, 0), this.material(opts.baseColour));
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.03, 3).rotateX(-Math.PI / 2).translate(0, 0.014, -r + 0.016), new THREE.MeshLambertMaterial({ color: opts.colour }));
    const fork = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02).translate(0, 0.025, 0), new THREE.MeshLambertMaterial({ color: 0x15181a }));
    this.pivotY = 0.03 + 0.03;
    this.arm.position.y = 0.03;
    // The power lever, and its grip: a fat upright handle to twist.
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, opts.length, 8).translate(0, opts.length / 2, 0), this.material(opts.rodColour));
    this.grip = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.022, 0.075, 12).translate(0, opts.length + 0.03, 0), this.material(opts.colour));
    this.arm.add(rod, this.grip);
    this.table.add(disc, arrow, fork, this.arm);
    this.root.add(...root, this.table);
    this.hitObjects.push(rod, this.grip, disc);
    this.show();
  }

  grabPoint(out: THREE.Vector3): THREE.Vector3 {
    return this.grip.localToWorld(out.set(0, this.opts.length + 0.03, 0));
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(this.toLocal(this.grabPoint(new THREE.Vector3())));
  }

  grabStart(p: Pointer): void {
    this.held = true;
    this.offset.copy(this.toLocal(this.grabPoint(new THREE.Vector3()))).sub(this.toLocal(p.position));
    this.twist0 = this.handTwist(p);
    this.angle0 = this.angle;
  }

  grabMove(p: Pointer): void {
    // Twist: the hand's turn about the upright since the grab turns the turntable.
    const t = this.handTwist(p);
    const angle = Number.isNaN(t) || Number.isNaN(this.twist0) ? this.angle : this.angle0 + wrapDeg(t - this.twist0) * this.opts.twistGain;
    // Throttle: how far the grip is pushed along the arrow, as the lever's lean from upright.
    const v = this.toLocal(p.position).add(this.offset);
    v.y -= this.pivotY;
    const a = angle * RAD;
    const along = v.x * Math.sin(a) - v.z * Math.cos(a);
    const lean = Math.atan2(along, Math.max(0.005, v.y));
    this.set(angle, lean / (this.opts.maxTiltDeg * RAD));
  }

  grabEnd(_p: Pointer): void {
    this.held = false;
    this.twist0 = NaN;
    this.markPending();
  }

  /** Desktop drag: sideways twists it, up and down sets the power. */
  nudge(dx: number, dy: number): void {
    this.set(this.angle + dx * 0.6, this.power - dy * 0.004);
    this.markPending();
  }

  /** Desktop keys: A / D twist it, W / S more or less power (tick() runs it). */
  keySteer(x: number, y: number): void {
    this.held = x !== 0 || y !== 0;
    this.keys = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
    if (!this.held) this.markPending();
  }

  tick(dt: number): void {
    if (this.keys.x === 0 && this.keys.y === 0) return;
    this.set(this.angle + this.keys.x * KEY_TURN * dt, this.power + this.keys.y * KEY_LEAN * dt);
  }

  sync(state: VesselState): void {
    if (this.held) return;
    const angle = this.read.angle(state);
    const power = this.read.power(state);
    if (this.awaiting(Math.abs(power - this.power) < 0.01 && Math.abs(wrapDeg(angle - this.angle)) < 0.5)) return;
    this.angle = angle;
    this.power = power;
    this.sentAngle = angle;
    this.sentPower = power;
    this.show();
  }

  /** Set it to `angle` (deg) and `power` (0..1, idle within the detent), send what changed. */
  set(angle: number, power: number): void {
    this.angle = wrapDeg(angle);
    const p = clamp(power, 0, 1);
    this.power = p < this.opts.detent ? 0 : p;
    if (!(Math.abs(wrapDeg(this.angle - this.sentAngle)) < 0.2)) {
      this.ctx?.emit(this.channels.angle, Math.round(this.angle * 10) / 10);
      this.sentAngle = this.angle;
    }
    if (!(Math.abs(this.power - this.sentPower) < 0.005)) {
      // (A click into idle and out of it, as a gear lever's detent.)
      if ((this.power === 0) !== (this.sentPower === 0)) this.ctx?.haptic(0.4, 25);
      this.ctx?.emit(this.channels.power, Math.round(this.power * 1000) / 1000);
      this.sentPower = this.power;
    }
    this.show();
  }

  /**
   * The hand's turn about the lever's upright (deg, as the lever's angles), from its
   * orientation: the way the controller points, or across its knuckles if it points up or
   * down. NaN without one (the desktop's mouse).
   */
  private handTwist(p: Pointer): number {
    if (!p.quaternion) return NaN;
    const q = this.root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(p.quaternion);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    if (Math.hypot(fwd.x, fwd.z) > 0.3) return Math.atan2(fwd.x, -fwd.z) / RAD;
    const across = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    return Math.atan2(-across.z, across.x) / RAD;
  }

  private show(): void {
    this.table.rotation.y = -this.angle * RAD;
    this.arm.rotation.x = -this.power * this.opts.maxTiltDeg * RAD;
  }
}

/** Degrees brought into (-180, 180]. */
export const wrapDeg = (d: number) => d - 360 * Math.round(d / 360);

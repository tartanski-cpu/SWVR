/**
 * One lean-to-point lever for an azimuth drive (owner, Oct 2026: "lean-to-point levers"): a
 * stick on a ball that leans any way round. The way it leans is the way its drive pushes (0
 * ahead, + to starboard, round to astern); how far it leans is the power, from idle upright
 * (a small `detent` round upright reads idle) to full at `maxTiltDeg`. It stays where it's left,
 * as a real azimuth lever's friction holds it.
 *
 * VR: grab the knob and move it where you want it: the stick leans toward the hand. Desktop:
 * drag it (sideways turns it round, up and down leans it more or less), or click it and steer
 * with the keys (A / D turn it round, W / S lean it more or less). It sends its direction (deg)
 * and power (0..1) as two intents while it moves (absolute values, so a late or repeated one
 * is harmless, as every control's).
 */
import * as THREE from 'three';
import { clamp } from '../../core/math';
import { Control, type Pointer } from '../../controls/Control';
import type { VesselState } from '../../vessel/vesselState';

export interface AzimuthLeverOptions {
  length: number;
  maxTiltDeg: number;
  detent: number;
  knobRadius: number;
  colour: number;
  rodColour: number;
  baseColour: number;
}

const RAD = Math.PI / 180;
/** Desktop: how fast the keys turn it round (deg/s) and lean it (power per s). */
const KEY_TURN = 90;
const KEY_LEAN = 0.5;

export class AzimuthLever extends Control {
  readonly kind = 'grab' as const;
  readonly label: string;
  readonly keySteerable = true;
  private readonly stick = new THREE.Group();
  private readonly knob: THREE.Mesh;
  /** Its direction (deg, 0 ahead, + to starboard) and power (0..1), as it stands. */
  angle = 0;
  power = 0;
  private sentAngle = NaN;
  private sentPower = NaN;
  /** Grabbed: the knob's offset from the hand (so it doesn't jump to the hand's centre). */
  private readonly offset = new THREE.Vector3();
  private keys = { x: 0, y: 0 };
  private readonly pivotY: number;
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(
    id: string,
    private readonly opts: AzimuthLeverOptions,
    private readonly channels: { angle: string; power: string },
    private readonly read: { angle: (s: VesselState) => number; power: (s: VesselState) => number },
    label: string,
  ) {
    super(id, channels.power);
    this.label = label;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.03, 16), new THREE.MeshLambertMaterial({ color: opts.baseColour }));
    base.position.y = 0.015;
    // A ring of ticks round the base: ahead, abeam and astern marks.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.004, 4, 24).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8a9096 }));
    ring.position.y = 0.031;
    const ahead = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 0.018), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    ahead.position.set(0, 0.033, -0.058);
    this.pivotY = 0.04;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), new THREE.MeshLambertMaterial({ color: 0x15181a }));
    ball.position.y = this.pivotY;
    this.stick.position.y = this.pivotY;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, opts.length, 8).translate(0, opts.length / 2, 0), this.material(opts.rodColour));
    this.knob = new THREE.Mesh(new THREE.SphereGeometry(opts.knobRadius, 14, 10), this.material(opts.colour));
    this.knob.position.y = opts.length;
    this.stick.add(rod, this.knob);
    this.root.add(base, ring, ahead, ball, this.stick);
    this.hitObjects.push(rod, this.knob, base);
    this.show();
  }

  grabPoint(out: THREE.Vector3): THREE.Vector3 {
    return this.knob.getWorldPosition(out);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(this.toLocal(this.knob.getWorldPosition(new THREE.Vector3())));
  }

  grabStart(p: Pointer): void {
    this.held = true;
    this.offset.copy(this.toLocal(this.knob.getWorldPosition(new THREE.Vector3()))).sub(this.toLocal(p.position));
  }

  grabMove(p: Pointer): void {
    // Where the knob is asked to be (the hand, and the offset it was grabbed at), from the pivot.
    const v = this.toLocal(p.position).add(this.offset);
    v.y -= this.pivotY;
    const across = Math.hypot(v.x, v.z);
    const lean = Math.atan2(across, Math.max(0.005, v.y));
    // (Near upright the direction is the hand's jitter: it keeps its last way round.)
    const angle = across > 0.012 ? Math.atan2(v.x, -v.z) / RAD : this.angle;
    this.set(angle, lean / (this.opts.maxTiltDeg * RAD));
  }

  grabEnd(_p: Pointer): void {
    this.held = false;
    this.markPending();
  }

  /** Desktop drag: sideways turns it round, up and down leans it more or less. */
  nudge(dx: number, dy: number): void {
    this.set(this.angle + dx * 0.6, this.power - dy * 0.004);
    this.markPending();
  }

  /** Desktop keys: A / D turn it round, W / S lean it more or less (tick() runs it). */
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

  /** Lean it to `angle` (deg) and `power` (0..1, idle within the detent), send what changed. */
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

  private show(): void {
    const lean = this.power * this.opts.maxTiltDeg * RAD;
    const a = this.angle * RAD;
    const tip = new THREE.Vector3(Math.sin(lean) * Math.sin(a), Math.cos(lean), -Math.sin(lean) * Math.cos(a));
    this.stick.quaternion.setFromUnitVectors(this.up, tip);
  }
}

/** Degrees brought into (-180, 180]. */
export const wrapDeg = (d: number) => d - 360 * Math.round(d / 360);

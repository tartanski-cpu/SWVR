/**
 * Module control.twin-throttle (owner, Oct 2026: "a twin engine control ... easy to use in VR
 * that you can grab the left or the right engine control independently. And it's got to be
 * super easy to grab both of them ... visually kind of grab place for both of them, even
 * though you don't have that in real life").
 *
 * Two throttle / gear levers side by side, `spacing` apart, the port engine's on the left
 * ('throttle.demand') and the starboard's on the right ('throttle.demand2'): each the single
 * lever's own control (controls/Lever.ts: its grab, its neutral notch, its desktop drag), so
 * grabbing either knob works that engine alone. Between the two knobs, a bright grip: with the
 * levers together it reads as one wide handle, knob, grip, knob. Grab the grip and both levers
 * come together under the hand (to where the grip was, halfway between them) and move as one;
 * splitting them again is done by grabbing one knob. The keys and the gamepad work both
 * (the 'lever' intent; vessel/vesselControl.ts).
 *
 * It's for twin engines worked separately (the diesel's `twin.split`): each lever drives one
 * engine (modules/dieselInboard).
 *
 * Draw calls: each lever's quadrant is baked into the boat's merged mesh, as the single lever's
 * is; each arm and knob, and the grip, are drawn on their own (five, against the single lever's
 * two).
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { clamp } from '../../core/math';
import { Control, type Pointer } from '../../controls/Control';
import { Lever } from '../../controls/Lever';
import { busOf } from '../../modular/bus';
import type { ModuleDefinition } from '../../modular/module';

/** Each lever as the single throttle lever's (CONFIG.modules.throttleLever), and the two together. */
export interface TwinThrottleConfig {
  maxAngleDeg: number;
  length: number;
  detent: number;
  detentHold: number;
  click: { strength: number; ms: number };
  release: { strength: number; ms: number };
  engrave: string;
  /** Between the two levers (m). */
  spacing: number;
  /** The grip between the knobs: its radius (m) and colour. */
  grip: { radius: number; colour: number };
}

/**
 * The grip between the two knobs: grabbing it works both levers as one. It stands where the
 * knobs are, halfway between their angles, in the gap between them.
 */
export class TwinGrip extends Control {
  readonly kind = 'grab' as const;
  readonly label = 'Both engines: throttle / gear';
  private readonly arm = new THREE.Group();
  private readonly bar: THREE.Mesh;
  private readonly half: number;
  private grabTheta = 0;
  private grabZ = 0;
  private notchHold = 0;

  /**
   * @param levers  the port and starboard levers, `spacing` apart either side of this one's middle
   * @param length  pivot to knob (m), as theirs
   */
  constructor(
    private readonly levers: [Lever, Lever],
    private readonly length: number,
    spacing: number,
    grip: { radius: number; colour: number },
    knobR = 0.03,
  ) {
    super('leverBoth', levers[0].channel);
    // Filling the gap between the knobs, its rounded ends just into each.
    this.half = spacing / 2 - knobR * 0.6;
    this.bar = new THREE.Mesh(new THREE.CapsuleGeometry(grip.radius, 2 * this.half - 2 * grip.radius, 4, 10).rotateZ(Math.PI / 2), this.material(grip.colour));
    this.bar.position.y = length;
    this.arm.position.y = 0.04; // the levers' pivot, over their quadrants
    this.arm.add(this.bar);
    this.root.add(this.arm);
    this.hitObjects.push(this.bar);
  }

  /** Halfway between the two levers' angles. */
  private mean(): number {
    return (this.levers[0].angle + this.levers[1].angle) / 2;
  }

  grabPoint(out: THREE.Vector3): THREE.Vector3 {
    return this.bar.getWorldPosition(out);
  }

  distanceTo(world: THREE.Vector3): number {
    // To the grip's length between the knobs (each knob is its own lever's).
    const p = this.toLocal(world).sub(this.arm.position);
    const th = this.arm.rotation.x;
    const c = new THREE.Vector3(0, Math.cos(th) * this.length, Math.sin(th) * this.length);
    const d = p.sub(c);
    const x = clamp(d.x, -this.half, this.half);
    return Math.hypot(d.x - x, d.y, d.z);
  }

  grabStart(p: Pointer): void {
    this.held = true;
    // Both levers brought together to where the grip is (halfway between them), and held.
    this.grabTheta = this.mean();
    this.grabZ = this.toLocal(p.position).z;
    for (const l of this.levers) {
      l.heldBy(true);
      l.follow(this.grabTheta);
    }
  }

  grabMove(p: Pointer): void {
    const dz = this.toLocal(p.position).z - this.grabZ;
    this.drive(this.grabTheta + dz / this.length);
  }

  grabEnd(_p: Pointer): void {
    this.held = false;
    for (const l of this.levers) l.heldBy(false);
    this.markPending();
  }

  /** Desktop drag on the grip: both levers together, through the neutral notch as one lever's drag is. */
  nudge(_dx: number, dy: number): void {
    const [a, b] = this.levers;
    // (First brought together, at the port lever's angle.)
    if (a.angle !== b.angle) b.follow(a.angle);
    const step = dy * 0.004;
    const theta = a.angle;
    let next = theta + step;
    if (theta !== 0 && Math.sign(next) !== Math.sign(theta)) {
      next = 0;
      this.notchHold = 0;
    } else if (theta === 0 && step !== 0) {
      this.notchHold += Math.abs(step);
      if (this.notchHold < 0.25) next = 0;
      else {
        this.notchHold = 0;
        const c = CONFIG.modules.throttleLever;
        next = Math.sign(step) * a.thetaOf(-(c.detent + c.detentHold + 0.01));
      }
    }
    this.drive(next);
  }

  private drive(theta: number): void {
    for (const l of this.levers) l.follow(theta);
    this.arm.rotation.x = this.mean();
  }

  sync(): void {
    // Where the levers are (they read the state themselves).
    this.arm.rotation.x = this.mean();
  }

  tick(dt: number): void {
    super.tick(dt);
    this.arm.rotation.x = this.mean();
  }
}

export const TWIN_THROTTLE: ModuleDefinition<TwinThrottleConfig> = {
  id: 'control.twin-throttle',
  version: 1,
  fits: ['panel.slot'],
  defaults: { ...CONFIG.modules.throttleLever, ...CONFIG.modules.twinThrottle },
  validateConfig: (c) => [
    ...(c.maxAngleDeg > 0 && c.maxAngleDeg <= 80 ? [] : ['maxAngleDeg should be between 0 and 80']),
    ...(c.length > 0 ? [] : ['length should be more than 0']),
    ...(c.spacing >= 0.1 ? [] : ['spacing should be at least 0.1 m (room for a hand on each knob)']),
  ],
  ports: {
    demand: { dir: 'write', key: 'throttle.demand' },
    demand2: { dir: 'write', key: 'throttle.demand2' },
  },
  view: {
    build(ctx) {
      const c = ctx.config;
      const { demand, demand2 } = ctx.keys;
      const feel = { hold: c.detentHold, click: c.click, release: c.release };
      // The port lever keeps the single lever's id ('lever': seen through the wheelhouse windows, held as 'lever').
      const port = new Lever('lever', { ...c, label: 'Port engine: throttle / gear' }, c.detent, { channel: demand, read: (s) => busOf(s).num(demand) }, feel);
      const stbd = new Lever('lever2', { ...c, label: 'Starboard engine: throttle / gear' }, c.detent, { channel: demand2, read: (s) => busOf(s).num(demand2) }, feel);
      port.root.position.x = -c.spacing / 2;
      stbd.root.position.x = c.spacing / 2;
      const grip = new TwinGrip([port, stbd], c.length, c.spacing, c.grip);
      return {
        staticParts: [],
        movingParts: [],
        controls: [port, stbd, grip],
        labels: [
          { text: 'PORT', at: [-c.spacing / 2, 0, 0] },
          { text: 'STBD', at: [c.spacing / 2, 0, 0] },
        ],
        update: () => {},
      };
    },
  },
};

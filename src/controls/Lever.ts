import * as THREE from 'three';
import { clamp } from '../core/math';
import type { VesselState } from '../vessel/vesselState';
import { Control, type Pointer, type Wiring } from './Control';

/**
 * Single-lever throttle/gear control. Pivots about its local X axis (athwartships):
 * pushed forward (toward the bow, -Z) = ahead, pulled back = astern, upright = neutral.
 *
 * Grab maths, in the lever's local frame: the lever follows the hand's fore-aft travel
 * since the grab, as arc length at the knob: theta = theta0 + (z - z0) / length. That is
 * independent of where on the handle (or how close to the pivot) you grabbed, so it feels
 * like pushing the knob directly. A magnetic detent holds it in neutral, with a click.
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
  private grabTheta = 0;
  private grabZ = 0;
  private lastSent = 0; // matches the initial (neutral / amidships) state
  private inDetent = true;

  /** Reads the authoritative position, -1..1 (default: today's `controls.lever`). */
  private readonly read: (s: VesselState) => number;

  /**
   * @param wiring  which channel it sends (default 'lever'; a module sends its bus key,
   *                'throttle.demand') and how it reads its position back from the state
   */
  /**
   * @param detent  the neutral notch (fraction of travel either side); `hold`, how much
   *                further it must be pushed to leave it; `click` / `release`, the haptic
   *                pulses going in and out (CONFIG.modules.throttleLever)
   */
  constructor(
    id: string,
    opts: { maxAngleDeg: number; length: number; style?: 'standard' | 'black' },
    private readonly detent = 0.15,
    wiring: Wiring = {},
    private readonly feel: { hold: number; click: { strength: number; ms: number }; release: { strength: number; ms: number } } = {
      hold: 0.06,
      click: { strength: 1, ms: 70 },
      release: { strength: 0.4, ms: 25 },
    },
  ) {
    super(id, wiring.channel ?? 'lever');
    this.read = wiring.read ?? ((s) => s.controls.lever);
    this.max = (opts.maxAngleDeg * Math.PI) / 180;
    this.length = opts.length;

    // Quadrant base (static part of the control) with ahead/astern colour marks.
    // 'black' (owner, Oct 2026: the pod drives' "more cool looking black throttle"): a
    // satin-black quadrant with a bright inlay, a black arm, and a broad black grip in place
    // of the red ball, its top a slim bright cap.
    const black = opts.style === 'black';
    const base = this.fixed(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.16), new THREE.MeshLambertMaterial({ color: black ? 0x121416 : 0x2a2f33 })));
    base.position.y = 0.025;
    const ahead = this.fixed(new THREE.Mesh(new THREE.BoxGeometry(0.104, 0.006, 0.05), new THREE.MeshLambertMaterial({ color: 0x2f8f3a })));
    ahead.position.set(0, 0.051, -0.05);
    const astern = this.fixed(new THREE.Mesh(new THREE.BoxGeometry(0.104, 0.006, 0.05), new THREE.MeshLambertMaterial({ color: 0xa8402a })));
    astern.position.set(0, 0.051, 0.05);
    this.root.add(base, ahead, astern);
    if (black) {
      // The bright inlay round the quadrant's top, and its slot.
      const inlay = this.fixed(new THREE.Mesh(new THREE.BoxGeometry(0.106, 0.004, 0.164), new THREE.MeshLambertMaterial({ color: 0xb9bec3 })));
      inlay.position.y = 0.047;
      const slot = this.fixed(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.008, 0.13), new THREE.MeshLambertMaterial({ color: 0x050506 })));
      slot.position.y = 0.052;
      this.root.add(inlay, slot);
    }

    // Arm + knob rotate about the pivot (local origin, slightly above the base).
    this.arm.position.y = 0.04;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, this.length, 8), this.material(black ? 0x1b1d20 : 0xb8bcc0));
    rod.position.y = this.length / 2;
    if (black) {
      // A grip across the top, as wide as a hand, rounded at its ends, with a bright cap.
      this.knob = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.07, 4, 10).rotateZ(Math.PI / 2), this.material(0x0e0f11));
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.006, 0.012), this.material(0xc8ccd0));
      cap.position.y = 0.02;
      this.knob.add(cap);
    } else this.knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), this.material(0xd23c2a));
    this.knob.position.y = this.length;
    this.arm.add(rod, this.knob);
    this.root.add(this.arm);
    this.hitObjects.push(rod, this.knob, base);
  }

  grabPoint(out: THREE.Vector3): THREE.Vector3 {
    return this.knob.getWorldPosition(out);
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

  grabStart(p: Pointer): void {
    this.held = true;
    this.grabTheta = this.theta;
    this.grabZ = this.toLocal(p.position).z;
  }

  grabMove(p: Pointer): void {
    const dz = this.toLocal(p.position).z - this.grabZ;
    this.setTheta(this.grabTheta + dz / this.length);
  }

  grabEnd(_p: Pointer): void {
    this.held = false;
    this.markPending();
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
        next = Math.sign(step) * this.max * (this.detent + this.feel.hold + 0.01);
      }
    }
    this.setTheta(next);
  }

  private setTheta(raw: number): void {
    let theta = clamp(raw, -this.max, this.max);
    // Magnetic neutral detent: it catches the lever inside `detent`, and once caught holds it
    // till pushed `hold` further (so it's easy to find and doesn't slip out). Going in gives
    // a firm click in the hand, coming out a light one.
    const v = -theta / this.max;
    const inDetent = Math.abs(v) < this.detent + (this.inDetent ? this.feel.hold : 0);
    if (inDetent) theta = 0;
    if (inDetent !== this.inDetent) {
      const p = inDetent ? this.feel.click : this.feel.release;
      this.ctx?.haptic(p.strength, p.ms);
    }
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
    const v = this.read(state);
    if (this.awaiting(Math.abs(v - this.value) < 0.01)) return;
    this.theta = -v * this.max;
    this.arm.rotation.x = this.theta;
    this.lastSent = v;
    this.inDetent = Math.abs(v) < this.detent;
  }
}

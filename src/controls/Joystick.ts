import * as THREE from 'three';
import { clamp } from '../core/math';
import type { VesselState } from '../vessel/vesselState';
import { Control, type Pointer } from './Control';

/**
 * Searchlight joystick: a short spring-centred stick. Grab it and move your hand: the
 * stick tilts with the hand's offset from where you grabbed, and the deflection drives the
 * searchlight at a RATE (sideways = pan, fore-aft = tilt; push forward to raise the beam),
 * like a real searchlight joystick. Let go and it springs back to centre; the light stays.
 *
 * It sends ABSOLUTE pan/tilt angles (degrees) as intents while it moves the light, so a
 * late or repeated intent is harmless (same rule as every control). Desktop: click it to
 * steer with WASD while looking around with the mouse (click again to let go), or
 * click-and-drag to move the light directly.
 */
export class Joystick extends Control {
  readonly kind = 'grab' as const;
  readonly label = 'Searchlight joystick';
  private readonly stick = new THREE.Group();
  private readonly knob: THREE.Mesh;
  /** Hand travel (m) for full deflection, and the stick's tilt at full deflection (rad). */
  private readonly travel = 0.06;
  private readonly maxTilt = 0.4;
  private defl = { x: 0, y: 0 };
  private readonly grabAt = new THREE.Vector3();
  private pan = 0;
  private tilt = 0;
  private lastPan = 0;
  private lastTilt = 0;

  constructor(
    id: string,
    private readonly opts: { panRateDeg: number; tiltRateDeg: number; panLimitDeg: number; tiltMinDeg: number; tiltMaxDeg: number },
  ) {
    super(id, 'spotPan');
    const base = this.fixed(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.03, 12), new THREE.MeshLambertMaterial({ color: 0x23282c })));
    base.position.y = 0.015;
    const boot = this.fixed(new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x15181a })));
    boot.position.y = 0.03;
    this.stick.position.y = 0.035;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.1, 8), this.material(0x9aa0a6));
    rod.position.y = 0.05;
    this.knob = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 8), this.material(0xe0b020));
    this.knob.position.y = 0.105;
    this.stick.add(rod, this.knob);
    this.root.add(base, boot, this.stick);
    this.hitObjects.push(rod, this.knob, base);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(this.toLocal(this.knob.getWorldPosition(new THREE.Vector3())));
  }

  grabStart(p: Pointer): void {
    this.held = true;
    this.toLocal(p.position, this.grabAt);
  }

  grabMove(p: Pointer): void {
    const h = this.toLocal(p.position);
    this.defl.x = clamp((h.x - this.grabAt.x) / this.travel, -1, 1);
    this.defl.y = clamp(-(h.z - this.grabAt.z) / this.travel, -1, 1); // forward (-z) = +
    this.showStick();
  }

  grabEnd(_p: Pointer): void {
    this.held = false;
    this.defl = { x: 0, y: 0 };
    this.showStick();
  }

  readonly keySteerable = true;

  /** Desktop keys: deflect the stick as a hand would (tick() turns it into rates). */
  keySteer(x: number, y: number): void {
    this.held = true;
    this.defl = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
    this.showStick();
  }

  /** Desktop drag: move the light directly (degrees per pixel). */
  nudge(dx: number, dy: number): void {
    this.setAngles(this.pan + dx * 0.15, this.tilt - dy * 0.1);
  }

  /** Called every frame: integrate the deflection into pan/tilt rates. */
  tick(dt: number): void {
    if (!this.held || (this.defl.x === 0 && this.defl.y === 0)) return;
    // Squared response: fine control near centre, full speed at the stops.
    const shape = (v: number) => Math.sign(v) * v * v;
    this.setAngles(this.pan + shape(this.defl.x) * this.opts.panRateDeg * dt, this.tilt + shape(this.defl.y) * this.opts.tiltRateDeg * dt);
  }

  sync(state: VesselState): void {
    if (this.held) return;
    this.pan = state.controls.spotPan;
    this.tilt = state.controls.spotTilt;
    this.lastPan = this.pan;
    this.lastTilt = this.tilt;
  }

  private setAngles(pan: number, tilt: number): void {
    const o = this.opts;
    this.pan = clamp(pan, -o.panLimitDeg, o.panLimitDeg);
    this.tilt = clamp(tilt, o.tiltMinDeg, o.tiltMaxDeg);
    if (Math.abs(this.pan - this.lastPan) > 0.05) {
      this.ctx?.emit('spotPan', this.pan);
      this.lastPan = this.pan;
    }
    if (Math.abs(this.tilt - this.lastTilt) > 0.05) {
      this.ctx?.emit('spotTilt', this.tilt);
      this.lastTilt = this.tilt;
    }
  }

  private showStick(): void {
    this.stick.rotation.set(-this.defl.y * this.maxTilt, 0, -this.defl.x * this.maxTilt);
  }
}

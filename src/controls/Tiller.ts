import * as THREE from 'three';
import { clamp } from '../core/math';
import type { OutboardConfig } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { Button } from './Button';
import { Control, type Pointer } from './Control';
import { GearSelector } from './GearSelector';

/** Desktop keys: throttle change per second (W / S held), tiller swing per second (A / D). */
const KEY_THROTTLE_RATE = 0.6;
const KEY_HELM_RATE = 2.0;
/** Trigger travel ignored at the start (a resting finger), and the throttle's slew rate (1/s). */
const TRIGGER_DEADZONE = 0.06;
const TRIGGER_SLEW = 2.5;
/** Largest believable hand movement between frames (m); more is a tracking glitch. */
const MAX_HAND_STEP = 0.25;

/**
 * The outboard's tiller, and the motor it swings: a handle reaching forward over the
 * transom from the motor's pivot, with a rubber grip on its end.
 *
 * VR: grab the handle (grip) to take control, and swing it sideways to steer - like any
 * outboard, tiller to port turns the bow to starboard (`helm` +1). The TRIGGER of that hand
 * is the throttle: squeeze for more, ease off for less, let go to idle (a dead-man, like a
 * jet-ski or e-foil trigger). Letting go of the tiller closes the throttle too. Direction is
 * the gear lever's, so neither a trigger nor a tracking dropout can put her astern.
 * Desktop: click it, then W / S open and close the throttle (through neutral, shifting for
 * you), A / D swing the tiller (it springs back to the middle when you let go of the keys),
 * and the mouse still looks around; click again to let go.
 *
 * It sends absolute values on the helm and throttle keys (the tiller module's ports), the
 * gear and the motor's button on their own channels; its boat view routes them all to the
 * skiff, not the workboat (Control.route).
 * The motor's battery charge shows as five green-to-red bars on its cowl.
 */
export class Tiller extends Control {
  readonly kind = 'grab' as const;
  /** The gear lever and the on/off button on the motor (they swing with it). */
  readonly gearLever: GearSelector;
  readonly power: Button;
  /** This control and the ones on the motor, for the interaction system. */
  readonly parts: Control[];
  private motorOn = false;
  /** Swings with the steering: the motor and the handle. */
  private readonly arm = new THREE.Group();
  private readonly grip: THREE.Mesh;
  private readonly bars: THREE.MeshBasicMaterial[] = [];
  private helm = 0;
  private throttle = 0;
  private sentHelm = 0;
  private sentThrottle = 0;
  /** Last hand position (control frame) while held, to reject tracking jumps. */
  private readonly lastHand = new THREE.Vector3();
  private hasHand = false;
  /** Held by a VR hand (trigger throttle) rather than the desktop mouse. */
  private vrHeld = false;
  private readonly keys = { x: 0, y: 0 };
  private keySteering = false;
  private readonly maxSteer: number;
  private gear = 0;

  /**
   * @param ob     the outboard: its pivot, its leg down to the propeller, its tiller, how far it swings
   * @param wiring the helm and throttle channels (bus keys)
   */
  constructor(
    ob: OutboardConfig,
    private readonly wiring: { helm: string; throttle: string },
  ) {
    super('tiller', wiring.helm);
    this.maxSteer = (ob.maxSteerDeg * Math.PI) / 180;
    const t = ob.tiller;
    this.root.position.fromArray(t.pivot);
    // The motor, hanging from the pivot: cowl on top, leg down to the propeller.
    const m = (color: number) => new THREE.MeshLambertMaterial({ color });
    const prop = new THREE.Vector3().fromArray(ob.position).sub(this.root.position);
    const cowl = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.34), m(0x2b2f33));
    cowl.position.set(0, 0.02, 0.1);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, Math.abs(prop.y) + 0.05, 0.12), m(0x1c1f22));
    leg.position.set(0, prop.y / 2, prop.z);
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.24, 10).rotateX(Math.PI / 2), m(0x1c1f22));
    pod.position.set(0, prop.y, prop.z);
    const blades = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.02), m(0x9aa0a6));
    blades.position.set(0, prop.y, prop.z + 0.13);
    // Handle: forward and a little up from the pivot, with the rubber grip on its end.
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, t.length, 8).rotateX(Math.PI / 2 - 0.12), m(0x3a3f44));
    handle.position.set(0, 0.03 + Math.sin(0.12) * (t.length / 2), -t.length / 2);
    this.grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.13, 10).rotateX(Math.PI / 2 - 0.12), this.material(0xd8582a));
    this.grip.position.set(0, 0.03 + Math.sin(0.12) * (t.length - 0.06), -t.length + 0.06);
    this.arm.add(cowl, leg, pod, blades, handle, this.grip);
    // Battery gauge on the cowl's top, facing up and aft (readable from the tiller).
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x222222 });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.05), mat);
      bar.position.set(-0.08 + i * 0.04, 0.135, 0.12);
      this.bars.push(mat);
      this.arm.add(bar);
    }
    // An invisible, generous box around the handle: easy to click on the desktop and to
    // find with a hand (the pointer ray ignores visibility).
    // Only the outer part of the handle, so it doesn't hide the controls on the motor.
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, t.length * 0.55), new THREE.MeshBasicMaterial());
    hit.position.set(0, this.grip.position.y, -t.length * 0.725);
    hit.visible = false;
    this.arm.add(hit);
    // On the motor: the gear lever on its starboard side, the on/off button on top, aft.
    this.gearLever = new GearSelector();
    this.gearLever.root.position.set(0.138, 0.0, 0.08);
    this.power = new Button('outboardPower', 'obPower', 'Motor on / off', 'pulse', 0xd03020, (st) => st.controls.obOn > 0);
    this.power.root.position.set(0, 0.13, 0.22);
    this.arm.add(this.gearLever.root, this.power.root);
    this.root.add(this.arm);
    // The gear lever's gate and the button's housing swing with the motor: never baked into
    // the boat's fixed mesh.
    this.arm.traverse((o) => delete o.userData.fixed);
    this.hitObjects.push(this.grip, handle, hit);
    this.parts = [this, this.gearLever, this.power];
    // Desktop: a click on the gear lever takes the whole outboard (W/S work the gear too).
    this.gearLever.steerOwner = this;
  }

  grabPoint(out: THREE.Vector3): THREE.Vector3 {
    return this.grip.getWorldPosition(out);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.grip.getWorldPosition(new THREE.Vector3()).distanceTo(world);
  }

  get label(): string {
    if (!this.motorOn) return 'Outboard tiller (motor OFF: red button on the motor)';
    return `Outboard tiller (${this.gearLever.gearName}; VR: grip to hold, trigger = throttle)`;
  }

  grabStart(p: Pointer): void {
    this.held = true;
    this.hasHand = false;
    this.vrHeld = p.trigger !== undefined;
  }

  grabMove(p: Pointer): void {
    // Steering: where the hand is around the pivot (handle points forward, -z). A jump
    // bigger than a hand can move in a frame is the controller losing tracking: hold course.
    const h = this.toLocal(p.position);
    const jumped = this.hasHand && h.distanceTo(this.lastHand) > MAX_HAND_STEP;
    this.lastHand.copy(h);
    this.hasHand = true;
    if (!jumped) {
      const angle = Math.atan2(-h.x, -h.z); // tiller angle, + to port
      this.setHelm(clamp(angle / this.maxSteer, -1, 1));
    }
    // Throttle: the trigger of the hand on the tiller, eased a little so it isn't twitchy.
    if (p.trigger !== undefined) {
      const want = clamp((p.trigger - TRIGGER_DEADZONE) / (1 - 2 * TRIGGER_DEADZONE), 0, 1);
      const step = TRIGGER_SLEW / 72; // per frame at the Quest's 72 Hz; only a smoothing
      const next = this.throttle + clamp(want - this.throttle, -step, step);
      if (next >= 1 && this.throttle < 1) this.ctx?.haptic(0.3, 20); // full throttle stop
      this.setThrottle(want === 0 ? 0 : next);
    }
  }

  grabEnd(_p: Pointer): void {
    this.held = false;
    this.keySteering = false;
    // Dead-man: letting go of the tiller in VR closes the throttle.
    if (this.vrHeld) this.setThrottle(0);
    this.vrHeld = false;
  }

  readonly keySteerable = true;

  /** Desktop keys (x: A/D, y: W/S); tick() turns them into rates. */
  keySteer(x: number, y: number): void {
    this.held = true;
    this.keySteering = true;
    this.keys.x = clamp(x, -1, 1);
    this.keys.y = clamp(y, -1, 1);
  }

  /** (The gear lever and the button are ticked and synced as controls of their own.) */
  tick(dt: number): void {
    if (!this.keySteering) return;
    // W / S: one signed command through neutral (forward -> neutral -> reverse), sent as the
    // gear lever and the trigger would send it.
    if (this.keys.y !== 0) {
      const before = this.gear * this.throttle;
      let c = clamp(before + this.keys.y * KEY_THROTTLE_RATE * dt, -1, 1);
      if (Math.sign(c) !== Math.sign(before) && before !== 0) c = 0; // stop in neutral on the way through
      const g = c > 0 ? 1 : c < 0 ? -1 : 0;
      if (g !== this.gear) {
        this.gear = g;
        this.ctx?.emit(this.gearLever.channel, g);
      }
      this.setThrottle(Math.abs(c));
    }
    // A (x -1) turns the bow to port: helm -1. Springs back to the middle with no key.
    const want = this.keys.x;
    const step = KEY_HELM_RATE * dt;
    this.setHelm(this.helm + clamp(want - this.helm, -step, step));
  }

  /** From the authoritative state (another crew member may be steering), unless held here. */
  sync(state: VesselState): void {
    this.motorOn = state.controls.obOn > 0;
    this.gear = state.controls.obGear;
    if (!this.held) {
      this.helm = state.controls.helm;
      this.throttle = state.controls.lever;
      this.sentHelm = this.helm;
      this.sentThrottle = this.throttle;
    }
    // Tiller to port (+ angle) for helm +1.
    this.arm.rotation.y = this.helm * this.maxSteer;
    const charge = state.battery ?? 0;
    this.bars.forEach((m, i) => m.color.setHex(charge > (i + 0.5) / 5 ? (charge > 0.4 ? 0x3ad06a : charge > 0.2 ? 0xe0b020 : 0xe04020) : 0x222222));
  }

  private setHelm(v: number): void {
    this.helm = v;
    this.arm.rotation.y = this.helm * this.maxSteer;
    if (Math.abs(v - this.sentHelm) > 0.01) {
      this.ctx?.emit(this.channel, v);
      this.sentHelm = v;
    }
  }

  private setThrottle(v: number): void {
    // Closing: shut below a few percent, with a tick (opening passes through freely).
    const t = v < 0.04 && v <= this.throttle ? 0 : v;
    if (t === 0 && this.throttle !== 0) this.ctx?.haptic(0.4, 25);
    this.throttle = t;
    if (Math.abs(t - this.sentThrottle) > 0.01 || (t === 0 && this.sentThrottle !== 0)) {
      this.ctx?.emit(this.wiring.throttle, t);
      this.sentThrottle = t;
    }
  }
}

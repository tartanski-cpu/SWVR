/**
 * Connects hands (VR) and the reticle (desktop) to bridge controls.
 *
 * Per VR hand, every frame:
 *   1. If holding a grab control: keep feeding it the hand while the grip is held.
 *   2. Otherwise find what the hand is on:
 *        direct - grip within grabRadius of a lever/wheel, or controller tip within
 *                 touchRadius of a button/switch;
 *        ray    - else, for buttons/switches only, the short pointer ray (fallback for
 *                 ones just out of reach). Levers and the wheel are grabbed by hand only,
 *                 and follow the hand's position - never where the controller points.
 *   3. Grip on a grab control -> grab it. Trigger on a press control -> press it
 *      (release on trigger release).
 * A hand that is holding or hovering a grab control is "busy": its grip must not also
 * drive grab-the-world locomotion.
 *
 * Desktop: the screen-centre reticle ray picks the control; mouse button presses buttons
 * and switches, or click-and-drag nudges levers and the wheel (camera look is frozen
 * while dragging).
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Handedness } from '../player/xrInput';
import type { Control, ControlContext, Pointer } from './Control';

export interface HandFrame {
  tracked: boolean;
  /** Grip (palm) world position. Must be the same object every frame. */
  grip: THREE.Vector3;
  /** Pointer ray from the controller tip (world). */
  ray: THREE.Ray;
  /** Grip orientation (world). Optional. */
  quat?: THREE.Quaternion;
  /** Analog trigger pull 0..1 (0 while the trigger belongs to a menu). */
  trigger?: number;
  gripDown: boolean;
  gripPressed: boolean;
  triggerDown: boolean;
  triggerPressed: boolean;
}

interface HandState {
  held: Control | null;
  pressing: Control | null;
  hover: Control | null;
  hoverByRay: boolean;
  rayLine: THREE.Line;
}

/** Multiplayer: who may hold what (see VesselState.holds). */
export interface HoldRules {
  /** Someone else has a hand on this control. */
  lockedByOther(c: Control): boolean;
  /** A local hand (or the desktop mouse) took hold of / let go of a control. */
  holdChanged(c: Control, held: boolean): void;
}

const NO_RULES: HoldRules = { lockedByOther: () => false, holdChanged: () => {} };

export class InteractionSystem {
  /** Grab controls a local hand or the mouse holds, as last reported to `rules`. */
  private readonly localHolds = new Set<Control>();
  private readonly owner = new Map<THREE.Object3D, Control>();
  private readonly hitObjects: THREE.Object3D[] = [];
  /** VR pointer-ray targets: buttons and switches only. Levers and the wheel are hand-only. */
  private readonly pressHitObjects: THREE.Object3D[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly hands: Record<Handedness, HandState>;
  private readonly pointers: Record<Handedness, Pointer>;
  // Desktop
  private dragging: Control | null = null;
  /** Desktop: a rate control clicked into keyboard steering (WASD), until clicked again. */
  steering: Control | null = null;
  /** The last desktop click was used to start or stop steering (nothing else should take it). */
  pressConsumed = false;
  private deskPressing: Control | null = null;
  private deskHover: Control | null = null;
  private readonly deskPointer: Pointer = { position: new THREE.Vector3() };

  constructor(
    private readonly controls: Control[],
    private readonly emit: (channel: string, value: number) => void,
    private readonly pulse: (hand: Handedness, intensity: number, ms: number) => void,
    private readonly rules: HoldRules = NO_RULES,
  ) {
    for (const c of controls) {
      for (const o of c.hitObjects) {
        this.owner.set(o, c);
        this.hitObjects.push(o);
        if (c.kind === 'press') this.pressHitObjects.push(o);
      }
    }
    const line = () => {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
      const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.8 }));
      l.visible = false;
      l.frustumCulled = false;
      return l;
    };
    this.hands = {
      left: { held: null, pressing: null, hover: null, hoverByRay: false, rayLine: line() },
      right: { held: null, pressing: null, hover: null, hoverByRay: false, rayLine: line() },
    };
    // Hands are points only: grab controls follow where the HAND is, never where it points.
    this.pointers = {
      left: { position: new THREE.Vector3() },
      right: { position: new THREE.Vector3() },
    };
  }

  /** The visible pointer-ray line for a hand (add it to the scene / rig once). */
  rayLine(hand: Handedness): THREE.Line {
    return this.hands[hand].rayLine;
  }

  private context(hand: Handedness | null): ControlContext {
    return {
      emit: this.emit,
      haptic: (i, ms) => {
        if (hand) this.pulse(hand, i, ms);
      },
    };
  }

  /**
   * VR update. Returns, per hand, whether its grip belongs to a control this frame
   * (so locomotion must ignore it).
   */
  updateXR(frames: Record<Handedness, HandFrame>): Record<Handedness, boolean> {
    const cfg = CONFIG.interaction;
    this.stopSteering(); // desktop-only mode
    const busy = { left: false, right: false };
    for (const hand of ['left', 'right'] as const) {
      const f = frames[hand];
      const h = this.hands[hand];
      const p = this.pointers[hand];
      p.position = f.grip;
      p.quaternion = f.quat;
      p.trigger = f.trigger ?? (f.triggerDown ? 1 : 0);

      if (!f.tracked) {
        this.releaseHand(hand);
        continue;
      }

      // 1. Holding something (grip held). If another player turns out to have grabbed it
      // first (both grabbed within one network round trip), theirs wins: let go.
      if (h.held && this.rules.lockedByOther(h.held)) {
        h.held.grabEnd(p);
        h.held = null;
        this.pulse(hand, 0.8, 80);
      }
      if (h.held) {
        if (f.gripDown) {
          h.held.grabMove(p);
        } else {
          h.held.grabEnd(p);
          h.held = null;
        }
        busy[hand] = true;
        this.showRay(h, f, null);
        continue;
      }
      if (h.pressing && !f.triggerDown) {
        h.pressing.pressEnd();
        h.pressing = null;
      }

      // 2. What is the hand on?
      let best: Control | null = null;
      let bestScore = 1;
      for (const c of this.controls) {
        if (c.kind === 'grab') {
          if (c.held && !c.multiGrab) continue;
          const s = c.distanceTo(f.grip) / cfg.grabRadius;
          if (s < bestScore) [best, bestScore] = [c, s];
        } else {
          const s = c.distanceTo(f.ray.origin) / cfg.touchRadius;
          if (s < bestScore) [best, bestScore] = [c, s];
        }
      }
      let byRay = false;
      let rayHit: THREE.Vector3 | null = null;
      if (!best) {
        this.raycaster.set(f.ray.origin, f.ray.direction);
        this.raycaster.far = cfg.rayLength;
        const hit = this.raycaster.intersectObjects(this.pressHitObjects, false)[0];
        if (hit) {
          best = this.owner.get(hit.object) ?? null;
          byRay = true;
          rayHit = hit.point;
        }
      }
      if (best !== h.hover) {
        if (best && !byRay) this.pulse(hand, 0.12, 10); // touched something
        h.hover = best;
      }
      h.hoverByRay = byRay;
      this.showRay(h, f, rayHit);

      // 3. Act on it.
      if (best?.kind === 'grab') {
        busy[hand] = true; // grip on a nearby control is the control's, not locomotion's
        if (f.gripPressed && this.rules.lockedByOther(best)) {
          this.pulse(hand, 0.8, 80); // someone else has it: a firm bump, no grab
        } else if (f.gripPressed) {
          best.bind(this.context(hand));
          best.grabStart(p);
          h.held = best;
          this.pulse(hand, 0.4, 25);
        }
      } else if (best?.kind === 'press' && f.triggerPressed && !h.pressing) {
        best.bind(this.context(hand));
        best.pressStart();
        h.pressing = best;
      }
    }
    this.refreshHover();
    this.syncHolds();
    return busy;
  }

  /** Tell the rules about holds that started or ended this frame. */
  private syncHolds(): void {
    const now = new Set<Control>();
    for (const h of Object.values(this.hands)) if (h.held) now.add(h.held);
    if (this.dragging) now.add(this.dragging);
    if (this.steering) now.add(this.steering);
    for (const c of now) if (!this.localHolds.has(c)) this.rules.holdChanged(c, true);
    for (const c of this.localHolds) if (!now.has(c)) this.rules.holdChanged(c, false);
    this.localHolds.clear();
    for (const c of now) this.localHolds.add(c);
  }

  private showRay(h: HandState, f: HandFrame, hit: THREE.Vector3 | null): void {
    const l = h.rayLine;
    l.visible = !!hit;
    if (!hit) return;
    const pos = l.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, f.ray.origin.x, f.ray.origin.y, f.ray.origin.z);
    pos.setXYZ(1, hit.x, hit.y, hit.z);
    pos.needsUpdate = true;
  }

  private releaseHand(hand: Handedness): void {
    const h = this.hands[hand];
    if (h.held) h.held.grabEnd(this.pointers[hand]);
    if (h.pressing) h.pressing.pressEnd();
    h.held = null;
    h.pressing = null;
    h.hover = null;
    h.rayLine.visible = false;
  }

  /**
   * Desktop update with the screen-centre ray.
   * @returns true while dragging a control (freeze mouse-look).
   */
  updateDesktop(ray: THREE.Ray | null, down: boolean, pressed: boolean, released: boolean, dx: number, dy: number): boolean {
    // Continue an existing drag (unless someone else turned out to have it first).
    if (this.dragging && this.rules.lockedByOther(this.dragging)) {
      this.dragging.grabEnd(this.deskPointer);
      this.dragging.held = false;
      this.dragging = null;
    }
    if (this.dragging) this.dragging.nudge(dx, dy);

    let hover: Control | null = null;
    if (ray && !this.dragging) {
      this.raycaster.set(ray.origin, ray.direction);
      this.raycaster.far = CONFIG.interaction.desktopReach;
      const hit = this.raycaster.intersectObjects(this.hitObjects, false)[0];
      hover = hit ? (this.owner.get(hit.object) ?? null) : null;
      // Aim help, only when the ray hits nothing (a direct hit always wins): keep what we
      // were on while the reticle is still near it, else take the nearest control just
      // missed (see CONFIG.interaction.desktopStickyDeg / desktopAssistDeg).
      const prev = this.deskHover;
      if (!hover && prev && this.offAim(prev, ray) < CONFIG.interaction.desktopStickyDeg) hover = prev;
      if (!hover) {
        let best = CONFIG.interaction.desktopAssistDeg;
        for (const c of this.controls) {
          const off = this.offAim(c, ray);
          if (off < best) [hover, best] = [c, off];
        }
      }
    }

    // Keyboard steering: any click lets go; a crew-mate grabbing it first also ends it.
    this.pressConsumed = false;
    if (this.steering && pressed) this.pressConsumed = true;
    if (this.steering && (pressed || this.rules.lockedByOther(this.steering))) {
      this.stopSteering();
      pressed = false;
    }
    const steer = hover?.keySteerable ? hover : hover?.steerOwner;
    if (pressed && steer?.keySteerable && !this.rules.lockedByOther(steer)) {
      steer.bind(this.context(null));
      steer.keySteer(0, 0);
      this.steering = steer;
      this.pressConsumed = true;
      pressed = false;
    }
    // Press before release: on a slow frame both can arrive together (a quick click).
    if (pressed && hover && !(hover.kind === 'grab' && this.rules.lockedByOther(hover))) {
      hover.bind(this.context(null));
      if (hover.kind === 'grab') {
        hover.held = true;
        this.dragging = hover;
        hover.nudge(dx, dy);
      } else {
        hover.pressStart();
        this.deskPressing = hover;
      }
    }
    if (released || !down) {
      if (this.deskPressing) {
        this.deskPressing.pressEnd();
        this.deskPressing = null;
      }
      if (this.dragging) {
        this.dragging.grabEnd(this.deskPointer);
        this.dragging.held = false;
        this.dragging = null;
      }
    }
    this.deskHover = this.dragging ?? hover;
    this.refreshHover();
    this.syncHolds();
    return this.dragging !== null;
  }

  private readonly sphere = new THREE.Sphere();
  private readonly toCentre = new THREE.Vector3();

  /**
   * How far off the ray a control is (degrees from the edge of its nearest hit part's
   * bounding sphere; 0 on it), or Infinity if it's out of desktop reach. Hidden parts
   * count, as they do for the ray (baked fixed parts are hidden; see Control.fixed).
   */
  private offAim(c: Control, ray: THREE.Ray): number {
    let best = Infinity;
    for (const o of c.hitObjects) {
      const mesh = o as THREE.Mesh;
      if (!mesh.geometry) continue;
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      this.sphere.copy(mesh.geometry.boundingSphere!).applyMatrix4(o.matrixWorld);
      this.toCentre.subVectors(this.sphere.center, ray.origin);
      const dist = this.toCentre.length();
      if (dist > CONFIG.interaction.desktopReach || dist < 1e-3) continue;
      const angle = this.toCentre.angleTo(ray.direction) - Math.asin(Math.min(1, this.sphere.radius / dist));
      best = Math.min(best, Math.max(0, angle) * THREE.MathUtils.RAD2DEG);
    }
    return best;
  }

  /** The desktop reticle is on, dragging or steering a control. */
  get desktopActive(): boolean {
    return !!(this.deskHover || this.dragging || this.steering);
  }

  /** The control the desktop mouse holds right now (dragging or keyboard-steering), if any. */
  get desktopHeld(): Control | null {
    return this.dragging ?? this.steering;
  }

  /** Desktop keyboard steering of the clicked rate control (x right, y forward). */
  steerKeys(x: number, y: number): void {
    this.steering?.keySteer(x, y);
  }

  private stopSteering(): void {
    const c = this.steering;
    if (!c) return;
    c.grabEnd(this.deskPointer);
    c.held = false;
    this.steering = null;
  }

  /** Name of whatever the desktop reticle is on (for a hint), or null. */
  get desktopHoverLabel(): string | null {
    if (this.steering) return `${this.steering.label}: W A S D to steer · click to let go`;
    const c = this.deskHover;
    if (!c) return null;
    return c.kind === 'grab' && this.rules.lockedByOther(c) ? `${c.label} (crew-mate has it)` : c.label;
  }

  private refreshHover(): void {
    const hovered = new Set<Control>();
    for (const h of Object.values(this.hands)) {
      if (h.hover) hovered.add(h.hover);
      if (h.held) hovered.add(h.held);
    }
    if (this.deskHover) hovered.add(this.deskHover);
    if (this.steering) hovered.add(this.steering);
    for (const c of this.controls) c.setHover(hovered.has(c), c.kind === 'grab' && this.rules.lockedByOther(c));
  }
}

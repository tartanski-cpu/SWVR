/**
 * Base class for physical bridge controls (levers, wheels, buttons, switches).
 *
 * A control is a little Three.js object tree living in the VESSEL's frame (child of the
 * vessel root), so it rides the boat exactly; all interaction maths is done in the
 * control's own local frame, which the boat's motion cannot jolt.
 *
 * Data flow (multiplayer-ready):
 *   - user input moves the control -> control calls ctx.emit(channel, absoluteValue)
 *     -> App turns that into an Intent -> simulation -> VesselState
 *   - every frame `sync(state)` sets the visual from the authoritative state, EXCEPT while
 *     a local hand is holding the control (then the hand wins, so it never lags or fights).
 *
 * Two interaction kinds:
 *   'grab'  (Lever, Wheel): grip to grab, the handle follows the hand constrained to its
 *           axis and limits; desktop: click-and-drag (nudge).
 *   'press' (Button, Toggle): trigger while the controller touches it, or click.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { VesselState } from '../vessel/vesselState';

export interface ControlContext {
  /** Send an intent for this control's channel with an absolute value. */
  emit(channel: string, value: number): void;
  /** Haptic pulse on the hand interacting with the control (no-op on desktop). */
  haptic(intensity: number, durationMs: number): void;
}

/**
 * Which channel a control sends and how it reads its value back from the state. Today's
 * bridge uses the defaults (the old channel names, `controls.*`); a module wires a control
 * to its bus keys (modular boats).
 */
export interface Wiring {
  channel?: string;
  read?: (s: VesselState) => number;
}

/** A hand (or the desktop mouse) as seen by a control: a point and, optionally, a ray. */
export interface Pointer {
  /** World position of the hand (grip) or controller tip. */
  position: THREE.Vector3;
  /** World ray (for ray-grabs: the control intersects it with its own plane). */
  ray?: THREE.Ray;
  /** World orientation of the hand (VR). */
  quaternion?: THREE.Quaternion;
  /** How far the hand's trigger is pulled, 0..1 (VR only; the tiller's throttle). */
  trigger?: number;
}

export abstract class Control {
  readonly root = new THREE.Group();
  abstract readonly kind: 'grab' | 'press';
  /** Objects the pointer ray / desktop reticle can hit. */
  readonly hitObjects: THREE.Object3D[] = [];
  hovered = false;
  /**
   * Off: nobody can touch, point at or click it (the skiff's tiller and the crane remote
   * while she's covered in her cradle). Hidden controls otherwise stay usable on purpose:
   * three's Raycaster ignores `visible` (the wheelhouse's small parts seen through a window).
   */
  enabled = true;
  /**
   * The boat this control works (her vessel id), or null for the home boat. Set by her
   * boat view (app/boatView.ts): the interaction system sends its intents to that boat
   * (`<vesselId>:<channel>`).
   */
  route: string | null = null;
  /**
   * Where it was last pressed (world), when the interaction system knows: the pointer ray's
   * hit (VR at a distance, the desktop's click), else the controller's tip (VR, touching);
   * null when the press came some other way. Set just before `pressStart` (the planning
   * table's chart reads it: voyage/planTable.ts).
   */
  pressPoint: THREE.Vector3 | null = null;
  private lockedShown = false;
  held = false;
  /** Whether two hands may hold it at once (the wheel). */
  readonly multiGrab: boolean = false;
  /** Short label for hover feedback. */
  abstract readonly label: string;
  protected ctx: ControlContext | null = null;
  private readonly highlightMaterials: THREE.MeshLambertMaterial[] = [];

  constructor(
    readonly id: string,
    /** Intent channel this control drives, e.g. 'lever', 'helm', 'horn'. */
    readonly channel: string,
  ) {
    this.root.name = `control:${id}`;
  }

  private pendingUntil = 0;

  /**
   * We just set this control ourselves. A crew-mate joining sees the host's state about a
   * round trip later, so for `interaction.pendingMs` `sync` must not snap the control back
   * to the old value (a switch would flick on, off, on - and get clicked again).
   */
  protected markPending(): void {
    this.pendingUntil = performance.now() + CONFIG.interaction.pendingMs;
  }

  /**
   * In `sync`: true while our own change is still on its way and the state doesn't show it
   * yet (skip the sync). Once the state agrees, the wait is over.
   */
  protected awaiting(agrees: boolean): boolean {
    if (agrees) this.pendingUntil = 0;
    return !agrees && performance.now() < this.pendingUntil;
  }

  /** Called by the interaction system with the context of whoever is using it. */
  bind(ctx: ControlContext): void {
    this.ctx = ctx;
  }

  /**
   * Distance (m) from a world point to the part you'd grab or press - used to pick the
   * nearest control within reach of a hand.
   */
  abstract distanceTo(world: THREE.Vector3): number;

  /**
   * Where a hand holds this control (world), for desktop players' rubber-band hands: the
   * first hit object by default; levers and the joystick use their knob, the wheel its rim.
   */
  grabPoint(out: THREE.Vector3): THREE.Vector3 {
    return (this.hitObjects[0] ?? this.root).getWorldPosition(out);
  }

  /** Visual from authoritative state (skipped by subclasses while held). */
  abstract sync(state: VesselState): void;

  // ── grab controls ──
  grabStart(_p: Pointer): void {}
  grabMove(_p: Pointer): void {}
  grabEnd(_p: Pointer): void {}
  /** Desktop drag: mouse movement in pixels. */
  nudge(_dx: number, _dy: number): void {}
  /** Every frame (for rate controls such as the searchlight joystick). */
  tick(_dt: number): void {}
  /**
   * Desktop keyboard steering (rate controls): click the control once, then WASD deflect
   * it (x right, y forward, -1..1) while the mouse still looks around. Controls that
   * support it set `keySteerable`.
   */
  readonly keySteerable: boolean = false;
  keySteer(_x: number, _y: number): void {}
  /**
   * Desktop: while this control is keyboard-steered, these keys work its companion buttons
   * (held down, the button is held: the deck crane's hoist, boom and hook). Those keys do
   * nothing else meanwhile (Keyboard.claim).
   */
  keyExtras: readonly KeyExtra[] = [];
  /**
   * Desktop: a part of a keyboard-steered control (the skiff's gear lever on her tiller):
   * clicking it starts steering that control instead (WASD does the gear and throttle).
   */
  steerOwner: Control | null = null;

  // ── press controls ──
  pressStart(): void {}
  pressEnd(): void {}

  /** Hover glow: green, or red if another player has their hand on it (multiplayer). */
  setHover(on: boolean, locked = false): void {
    if (on === this.hovered && locked === this.lockedShown) return;
    this.hovered = on;
    this.lockedShown = locked;
    for (const m of this.highlightMaterials) m.emissive.setHex(!on ? 0x000000 : locked ? 0x662222 : 0x335533);
  }

  /** Make a flat-shaded material that lights up when the control is hovered. */
  protected material(color: number): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    this.highlightMaterials.push(m);
    return m;
  }

  /**
   * Mark a part that never moves relative to the boat (a base, housing or plate). Her boat
   * view (app/boatView.ts) bakes all such parts into one draw call and hides the originals, which stay
   * in the scene (invisible) so the pointer ray can still hit them.
   */
  protected fixed<T extends THREE.Mesh>(mesh: T): T {
    mesh.userData.fixed = true;
    return mesh;
  }

  /** Point (world) -> this control's local frame. */
  protected toLocal(world: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    return this.root.worldToLocal(out.copy(world));
  }

  /**
   * For ray grabs: where the pointer's ray crosses a plane of this control (given in local
   * axes by its normal, through the local origin). Falls back to the pointer position.
   */
  protected pointerOnPlane(p: Pointer, localNormal: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    if (p.ray) {
      const n = localNormal.clone().transformDirection(this.root.matrixWorld);
      const origin = this.root.getWorldPosition(new THREE.Vector3());
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, origin);
      const hit = p.ray.intersectPlane(plane, new THREE.Vector3());
      if (hit) return this.toLocal(hit, out);
    }
    return this.toLocal(p.position, out);
  }
}

/** A key that works a companion button while a control is keyboard-steered (Control.keyExtras). */
export interface KeyExtra {
  /** The physical key (KeyboardEvent.code). */
  code: string;
  /** How to show it ('R', 'Space'), and what it does ('hoist up'). */
  key: string;
  does: string;
  target: Control;
}

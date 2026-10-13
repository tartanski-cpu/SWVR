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
import type { VesselState } from '../vessel/vesselState';

export interface ControlContext {
  /** Send an intent for this control's channel with an absolute value. */
  emit(channel: string, value: number): void;
  /** Haptic pulse on the hand interacting with the control (no-op on desktop). */
  haptic(intensity: number, durationMs: number): void;
}

/** A hand (or the desktop mouse) as seen by a control: a point and, optionally, a ray. */
export interface Pointer {
  /** World position of the hand (grip) or controller tip. */
  position: THREE.Vector3;
  /** World ray (for ray-grabs: the control intersects it with its own plane). */
  ray?: THREE.Ray;
}

export abstract class Control {
  readonly root = new THREE.Group();
  abstract readonly kind: 'grab' | 'press';
  /** Objects the pointer ray / desktop reticle can hit. */
  readonly hitObjects: THREE.Object3D[] = [];
  hovered = false;
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

  /** Called by the interaction system with the context of whoever is using it. */
  bind(ctx: ControlContext): void {
    this.ctx = ctx;
  }

  /**
   * Distance (m) from a world point to the part you'd grab or press - used to pick the
   * nearest control within reach of a hand.
   */
  abstract distanceTo(world: THREE.Vector3): number;

  /** Visual from authoritative state (skipped by subclasses while held). */
  abstract sync(state: VesselState): void;

  // ── grab controls ──
  grabStart(_p: Pointer): void {}
  grabMove(_p: Pointer): void {}
  grabEnd(_p: Pointer): void {}
  /** Desktop drag: mouse movement in pixels. */
  nudge(_dx: number, _dy: number): void {}

  // ── press controls ──
  pressStart(): void {}
  pressEnd(): void {}

  setHover(on: boolean): void {
    if (on === this.hovered) return;
    this.hovered = on;
    for (const m of this.highlightMaterials) m.emissive.setHex(on ? 0x335533 : 0x000000);
  }

  /** Make a flat-shaded material that lights up when the control is hovered. */
  protected material(color: number): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    this.highlightMaterials.push(m);
    return m;
  }

  /**
   * Mark a part that never moves relative to the boat (a base, housing or plate). The
   * Bridge bakes all such parts into one draw call and hides the originals, which stay
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

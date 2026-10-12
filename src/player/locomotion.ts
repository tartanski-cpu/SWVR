/**
 * Player movement in the frame of whatever the player stands on (vessel axes aboard).
 * Everything here moves PlayerState.position (feet) and PlayerState.yaw; the rig follows.
 *
 * Because positions live in the vessel's frame, walking is relative to the deck: the boat
 * can roll, pitch and surge underneath without the player sliding or jittering, and the
 * moving-frame maths reduces to plain 2D movement on the deck plan.
 *
 * Collision works on the HEAD position (where the player's body actually is in room-scale
 * VR), against the WalkArea: blocked moves slide along walls by trying each axis alone.
 *
 * Methods:
 *  - grab-the-world (default): squeeze a grip and pull - the world moves with your hand.
 *    Two hands: pull and twist to turn. Precise and nausea-free in tight spaces.
 *  - smooth stick movement (optional), head-relative.
 *  - snap turn about the head.
 *  - desktop walking (WASD) through the same collision.
 *
 * Player pose is client-authoritative (see PROGRESS.md: multiplayer notes), so the local
 * client writes it directly rather than via intents.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WalkArea } from '../vessel/layout';
import type { PlayerState } from './playerState';
import type { Handedness } from './xrInput';

export interface LocomotionInput {
  dt: number;
  /** The object PlayerState.position is expressed in (vessel root or scene). */
  frame: THREE.Object3D;
  area: WalkArea;
  /** Head world position (camera). */
  head: THREE.Vector3;
  /** Head forward direction, world. */
  headForward: THREE.Vector3;
  /** Grip world positions for hands currently squeezing their grip, else null. */
  grabbing: Record<Handedness, THREE.Vector3 | null>;
  /** Smooth movement stick (x right, y forward, -1..1). */
  moveStick: [number, number];
  /** Snap-turn stick x (-1..1). */
  turnStick: number;
  /** Desktop walking displacement already in the frame's axes (m), or null. */
  desktopDelta: { x: number; z: number } | null;
}

const headL = new THREE.Vector3();
const fwdL = new THREE.Vector3();

export class Locomotion {
  private anchors: Record<Handedness, THREE.Vector3 | null> = { left: null, right: null };
  private twoHandAngle = 0;
  private snapArmed = true;
  private snapFlash = 0;
  /** True on the frame a grab starts (for haptics). */
  readonly grabStarted: Record<Handedness, boolean> = { left: false, right: false };

  /** Returns 0..1 "how much artificial motion" this frame, for the comfort vignette. */
  update(p: PlayerState, inp: LocomotionInput): number {
    const cfg = CONFIG.locomotion;
    const { frame, area, dt } = inp;
    frame.worldToLocal(headL.copy(inp.head));
    let moved = 0;

    // ── Grab the world ──
    const handsL: Record<Handedness, THREE.Vector3 | null> = { left: null, right: null };
    for (const h of ['left', 'right'] as const) {
      const g = inp.grabbing[h];
      handsL[h] = g ? frame.worldToLocal(g.clone()) : null;
      this.grabStarted[h] = false;
    }
    const setChanged = (['left', 'right'] as const).some((h) => !!handsL[h] !== !!this.anchors[h]);
    if (setChanged) {
      // Re-anchor every gripping hand whenever the set of gripping hands changes.
      for (const h of ['left', 'right'] as const) {
        if (handsL[h] && !this.anchors[h]) this.grabStarted[h] = true;
        this.anchors[h] = handsL[h] ? handsL[h]!.clone() : null;
      }
      if (handsL.left && handsL.right) this.twoHandAngle = angleXZ(handsL.right, handsL.left);
    } else if (handsL.left && handsL.right && this.anchors.left && this.anchors.right) {
      // Two hands: turn about the midpoint so the hand-to-hand line keeps its heading,
      // then translate so the midpoint stays where it was grabbed.
      const now = angleXZ(handsL.right, handsL.left);
      const turn = wrapPi(this.twoHandAngle - now);
      const mid = handsL.left.clone().add(handsL.right).multiplyScalar(0.5);
      if (Math.abs(turn) > 1e-4) this.rotateAbout(p, turn, mid.x, mid.z, area, headL);
      // The rotation pivots on the hands' midpoint, so the midpoint itself hasn't moved.
      const anchorMid = this.anchors.left.clone().add(this.anchors.right).multiplyScalar(0.5);
      moved += this.tryMove(p, area, headL, anchorMid.x - mid.x, anchorMid.z - mid.z);
    } else {
      for (const h of ['left', 'right'] as const) {
        const a = this.anchors[h];
        const c = handsL[h];
        if (a && c) moved += this.tryMove(p, area, headL, a.x - c.x, a.z - c.z);
      }
    }

    // ── Smooth stick movement (head-relative) ──
    const [mx, my] = inp.moveStick;
    if (cfg.smoothEnabled && Math.hypot(mx, my) > 0.15) {
      frame.worldToLocal(fwdL.copy(inp.head).add(inp.headForward)).sub(headL);
      fwdL.y = 0;
      if (fwdL.lengthSq() > 1e-6) {
        fwdL.normalize();
        const rx = -fwdL.z; // right = forward rotated -90° about Y
        const rz = fwdL.x;
        const step = cfg.smoothSpeed * dt;
        moved += this.tryMove(p, area, headL, (fwdL.x * my + rx * mx) * step, (fwdL.z * my + rz * mx) * step);
      }
    }

    // ── Desktop walking ──
    if (inp.desktopDelta) moved += this.tryMove(p, area, headL, inp.desktopDelta.x, inp.desktopDelta.z);

    // ── Snap turn about the head ──
    const t = inp.turnStick;
    if (this.snapArmed && Math.abs(t) > cfg.snapThreshold) {
      this.snapArmed = false;
      this.rotateAbout(p, (-Math.sign(t) * cfg.snapTurnDeg * Math.PI) / 180, headL.x, headL.z, area, headL, true);
      this.snapFlash = 0.12;
    } else if (Math.abs(t) < cfg.snapThreshold * 0.5) {
      this.snapArmed = true;
    }
    this.snapFlash = Math.max(0, this.snapFlash - dt);

    // ── Follow the floor under the head (smoothed, e.g. over the doorway sill) ──
    const floor = area.floorY(headL.x, headL.z);
    p.position[1] += (floor - p.position[1]) * Math.min(1, dt / cfg.floorSmoothing);

    const speed = dt > 0 ? moved / dt : 0;
    return Math.max(Math.min(1, speed / cfg.smoothSpeed), this.snapFlash > 0 ? 1 : 0);
  }

  /** Move the player by (dx, dz) if the head ends up somewhere walkable; slide along walls. */
  private tryMove(p: PlayerState, area: WalkArea, head: THREE.Vector3, dx: number, dz: number): number {
    if (dx === 0 && dz === 0) return 0;
    // If the head is already somewhere unwalkable (room-scale), allow any move to get out.
    const free = !area.walkable(head.x, head.z);
    let mx = 0;
    let mz = 0;
    if (free || area.walkable(head.x + dx, head.z + dz)) {
      mx = dx;
      mz = dz;
    } else if (area.walkable(head.x + dx, head.z)) {
      mx = dx;
    } else if (area.walkable(head.x, head.z + dz)) {
      mz = dz;
    }
    p.position[0] += mx;
    p.position[2] += mz;
    head.x += mx;
    head.z += mz;
    return Math.hypot(mx, mz);
  }

  /** Rotate the player by `angle` (rad, about +Y) around the point (cx, cz) of the frame. */
  private rotateAbout(
    p: PlayerState,
    angle: number,
    cx: number,
    cz: number,
    area: WalkArea,
    head: THREE.Vector3,
    force = false,
  ): void {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const px = p.position[0] - cx;
    const pz = p.position[2] - cz;
    const hx = head.x - cx;
    const hz = head.z - cz;
    const nhx = cx + hx * c + hz * s;
    const nhz = cz - hx * s + hz * c;
    if (!force && area.walkable(head.x, head.z) && !area.walkable(nhx, nhz)) return;
    p.position[0] = cx + px * c + pz * s;
    p.position[2] = cz - px * s + pz * c;
    p.yaw += angle;
    head.x = nhx;
    head.z = nhz;
  }
}

/** Heading angle of the vector a - b in the XZ plane, consistent with rotation about +Y. */
function angleXZ(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.atan2(a.x - b.x, a.z - b.z);
}

function wrapPi(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

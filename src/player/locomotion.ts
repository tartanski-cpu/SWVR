/**
 * Player movement in the frame of whatever the player stands on (vessel axes aboard).
 * Everything here moves PlayerState.position (feet) and PlayerState.yaw; the rig follows.
 *
 * Because positions live in the vessel's frame, walking is relative to the deck: the boat
 * can roll, pitch and surge underneath without the player sliding or jittering, and the
 * moving-frame maths reduces to plain 2D movement on the deck plan.
 *
 * Desktop walking collides on the FEET against the WalkArea (walls, furniture, the deck
 * edge): blocked moves slide along walls by trying each axis alone. (It used to test the
 * camera, which can sit a little off the feet: past an edge, the "let me out" escape then
 * let you walk through anything.) Swimming strokes collide on the head (room-scale VR).
 * VR on foot moves through walls but is fenced in at the boat's edge (WalkArea.inBounds).
 *
 * Methods:
 *  - grab-the-world (VR, default): squeeze a grip and pull - the world moves with your
 *    hand, in all three directions, through walls (owner request): pull yourself up, down
 *    or through the wheelhouse - but not out over the side (the fence at the boat's edge,
 *    owner request: you can't slip off her). Two hands: pull and twist to turn.
 *    Once you've grabbed you are "free": the height you pulled yourself to stays (no
 *    settling onto the floor), which also squares seated and standing play without a
 *    crouch button. Being put somewhere else (teleport, boarding, landing a jump, climbing
 *    out) ends it: then the floor holds you again, settling onto the highest floor within
 *    a step below your feet - which is how stairs and sills work. While swimming, grab
 *    strokes stay horizontal (the swim code keeps you at the surface).
 *  - smooth stick movement (VR, optional), head-relative: through walls, fenced at the edge.
 *  - snap turn about the head.
 *  - desktop walking (WASD) with wall collision and ladders.
 *
 * Player pose is client-authoritative (see PROGRESS.md: multiplayer notes), so the local
 * client writes it directly rather than via intents.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import { userSettings } from './userSettings';
import { STEP_HEIGHT, type WalkArea } from '../vessel/layout';
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
  /** Desktop walking displacement already in the frame's axes (m), or null. y = climbing. */
  desktopDelta: { x: number; y?: number; z: number } | null;
  /** VR on foot: grabs move in 3D and the stick ignores walls, fenced at the edge (false: swimming, desktop). */
  fly: boolean;
}

const headL = new THREE.Vector3();
const feetL = new THREE.Vector3();
const fwdL = new THREE.Vector3();

export class Locomotion {
  private anchors: Record<Handedness, THREE.Vector3 | null> = { left: null, right: null };
  private twoHandAngle = 0;
  private snapArmed = true;
  private snapFlash = 0;
  /** True on the frame a grab starts (for haptics). */
  readonly grabStarted: Record<Handedness, boolean> = { left: false, right: false };
  /**
   * Pulled ourselves somewhere with grab-the-world: no floor settling until we're put
   * somewhere else. `left` is where we left the feet last frame (in `frame`), to notice that.
   */
  private free = false;
  private left: { frame: THREE.Object3D; x: number; y: number; z: number } | null = null;

  /** Returns 0..1 "how much artificial motion" this frame, for the comfort vignette. */
  update(p: PlayerState, inp: LocomotionInput): number {
    const cfg = CONFIG.locomotion;
    const { frame, area, dt } = inp;
    frame.worldToLocal(headL.copy(inp.head));
    let moved = 0;
    // Teleported, boarded, landed, climbed out, swimming: the floor has us again.
    const l = this.left;
    const jumped = !l || l.frame !== frame || Math.hypot(p.position[0] - l.x, p.position[1] - l.y, p.position[2] - l.z) > 0.3;
    if (!inp.fly || jumped) this.free = false;
    // A grab move: free in 3D (fly) or along the floor with collisions (swimming).
    const grabMove = (dx: number, dy: number, dz: number) => {
      if (!inp.fly) return this.tryMove(p, area, headL, dx, dz) + this.climb(p, area, headL, dy);
      this.free = true;
      return this.moveFenced(p, area, headL, dx, dy, dz);
    };

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
      if (Math.abs(turn) > 1e-4) this.rotateAbout(p, turn, mid.x, mid.z, area, headL, false, inp.fly);
      // The rotation pivots on the hands' midpoint, so the midpoint itself hasn't moved.
      const anchorMid = this.anchors.left.clone().add(this.anchors.right).multiplyScalar(0.5);
      moved += grabMove(anchorMid.x - mid.x, anchorMid.y - mid.y, anchorMid.z - mid.z);
    } else {
      for (const h of ['left', 'right'] as const) {
        const a = this.anchors[h];
        const c = handsL[h];
        if (a && c) moved += grabMove(a.x - c.x, a.y - c.y, a.z - c.z);
      }
    }

    // ── Smooth stick movement (head-relative) ──
    const [mx, my] = inp.moveStick;
    if (userSettings.smoothWalk && Math.hypot(mx, my) > 0.15) {
      frame.worldToLocal(fwdL.copy(inp.head).add(inp.headForward)).sub(headL);
      fwdL.y = 0;
      if (fwdL.lengthSq() > 1e-6) {
        fwdL.normalize();
        const rx = -fwdL.z; // right = forward rotated -90° about Y
        const rz = fwdL.x;
        const step = cfg.smoothSpeed * dt;
        const dx = (fwdL.x * my + rx * mx) * step;
        const dz = (fwdL.z * my + rz * mx) * step;
        moved += inp.fly ? this.moveFenced(p, area, headL, dx, 0, dz) : this.tryMove(p, area, headL, dx, dz);
      }
    }

    // ── Desktop walking ──
    if (inp.desktopDelta) {
      // On the feet (the head moves with them).
      const fx = p.position[0];
      const fz = p.position[2];
      moved += this.tryMove(p, area, feetL.set(fx, p.position[1], fz), inp.desktopDelta.x, inp.desktopDelta.z);
      headL.x += p.position[0] - fx;
      headL.z += p.position[2] - fz;
      moved += this.climb(p, area, headL, inp.desktopDelta.y ?? 0);
    }

    // ── Snap turn about the head ──
    const t = inp.turnStick;
    if (this.snapArmed && Math.abs(t) > cfg.snapThreshold) {
      this.snapArmed = false;
      this.rotateAbout(p, (-Math.sign(t) * userSettings.snapTurnDeg * Math.PI) / 180, headL.x, headL.z, area, headL, true);
      this.snapFlash = 0.12;
    } else if (Math.abs(t) < cfg.snapThreshold * 0.5) {
      this.snapArmed = true;
    }
    this.snapFlash = Math.max(0, this.snapFlash - dt);

    // ── Ladder or floor ──
    const ladder = area.ladderAt(headL.x, headL.z);
    const y = p.position[1];
    if (this.free) {
      // Pulled ourselves here: stay at this height.
    } else if (ladder && y > ladder.bottom + 0.03) {
      // Holding on to the ladder: stay at this height.
      p.position[1] = Math.min(y, ladder.top);
    } else {
      // Settle onto the highest floor within a step below the feet (smoothed: sills, stairs,
      // stepping off the ladder). With no floor under the head (leaning out), stay put.
      const floors = area.floorsAt(headL.x, headL.z).filter((f) => f <= y + STEP_HEIGHT);
      if (floors.length) {
        const target = Math.max(...floors);
        p.position[1] += (target - y) * Math.min(1, dt / cfg.floorSmoothing);
      }
    }

    this.left = { frame, x: p.position[0], y: p.position[1], z: p.position[2] };
    const speed = dt > 0 ? moved / dt : 0;
    return Math.max(Math.min(1, speed / cfg.smoothSpeed), this.snapFlash > 0 ? 1 : 0);
  }

  /** Move the player by (dx, dz) if the head ends up somewhere walkable; slide along walls. */
  private tryMove(p: PlayerState, area: WalkArea, head: THREE.Vector3, dx: number, dz: number): number {
    if (dx === 0 && dz === 0) return 0;
    const y = p.position[1];
    // If the head is already somewhere unwalkable (room-scale), allow any move to get out.
    const free = !area.walkable(head.x, head.z, y);
    let mx = 0;
    let mz = 0;
    if (free || area.walkable(head.x + dx, head.z + dz, y)) {
      mx = dx;
      mz = dz;
    } else if (area.walkable(head.x + dx, head.z, y)) {
      mx = dx;
    } else if (area.walkable(head.x, head.z + dz, y)) {
      mz = dz;
    }
    p.position[0] += mx;
    p.position[2] += mz;
    head.x += mx;
    head.z += mz;
    return Math.hypot(mx, mz);
  }

  /**
   * VR on foot (grab-the-world, the stick): move by (dx, dy, dz) through walls, but keep the
   * head inside the boat's edge (area.inBounds): a move that would cross it goes as far as
   * the edge, and what's left of it slides along the edge (each axis alone). Already
   * outside it (leaning out, put there): any move, so you can always get back in.
   */
  private moveFenced(p: PlayerState, area: WalkArea, head: THREE.Vector3, dx: number, dy: number, dz: number): number {
    const fence = area.inBounds?.bind(area);
    if (fence && fence(head.x, head.z) && !fence(head.x + dx, head.z + dz)) {
      // How far along (dx, dz) we can go and stay inside (bisection: the fence is convex enough).
      const reach = (ax: number, az: number) => {
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 12; i++) {
          const m = (lo + hi) / 2;
          if (fence(head.x + ax * m, head.z + az * m)) lo = m;
          else hi = m;
        }
        return lo;
      };
      const f = reach(dx, dz);
      const [rx, rz] = [dx * (1 - f), dz * (1 - f)];
      const sx = head.x + dx * f;
      const sz = head.z + dz * f;
      // Slide: the rest along whichever axis stays inside.
      const slideX = fence(sx + rx, sz) ? rx : 0;
      const slideZ = !slideX && fence(sx, sz + rz) ? rz : 0;
      dx = dx * f + slideX;
      dz = dz * f + slideZ;
    }
    p.position[0] += dx;
    p.position[1] += dy;
    p.position[2] += dz;
    head.x += dx;
    head.y += dy;
    head.z += dz;
    return Math.hypot(dx, dy, dz);
  }

  /** Climb by dy (m) if the head is at a ladder; clamped to the ladder's ends. */
  private climb(p: PlayerState, area: WalkArea, head: THREE.Vector3, dy: number): number {
    if (Math.abs(dy) < 1e-6) return 0;
    const ladder = area.ladderAt(head.x, head.z);
    if (!ladder) return 0;
    const before = p.position[1];
    p.position[1] = Math.min(ladder.top, Math.max(ladder.bottom, before + dy));
    head.y += p.position[1] - before;
    return Math.abs(p.position[1] - before);
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
    /** VR: only the edge fence applies (not the walls). */
    fenced = false,
  ): void {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const px = p.position[0] - cx;
    const pz = p.position[2] - cz;
    const hx = head.x - cx;
    const hz = head.z - cz;
    const nhx = cx + hx * c + hz * s;
    const nhz = cz - hx * s + hz * c;
    const y = p.position[1];
    if (fenced) {
      if (area.inBounds && area.inBounds(head.x, head.z) && !area.inBounds(nhx, nhz)) return;
    } else if (!force && area.walkable(head.x, head.z, y) && !area.walkable(nhx, nhz, y)) return;
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

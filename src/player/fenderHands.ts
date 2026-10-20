import * as THREE from 'three';
import { CONFIG } from '../config';
import type { HandFrame } from '../controls/InteractionSystem';
import type { WorldState } from '../core/world';
import { distanceToHull } from '../rescue/recovery';
import { hullPlan } from '../vessel/layout';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { canWalkFender } from '../vessel/walkFender';
import { blockTop } from '../world/geography';
import { groundHeight } from '../world/terrain';
import type { Handedness } from './xrInput';

/**
 * Hanging the roving fender (vessel/walkFender.ts; owner request): the deckhand's job
 * coming alongside. With the fenders out, stand at the rail where she's going to touch,
 * look at the quay (or the boat alongside), and press with an empty hand:
 *
 *   desktop  the reticle on the quayside within reach: the label says so; click.
 *   VR       point a free hand (no hook, no gear) at it and press its trigger.
 *
 * The fender goes at your own station (where you stand along her), on the side you're
 * looking at. "Looking at the quay" is a march along the ray out to `rayLength` m until it
 * meets something solid: a quay or pier (inside its plan, below its top), the shore, or
 * another boat's hull; and that point must be within `reach` of her side. Local: it reads
 * the world and sends the `fenderWalk` intent; the host hangs it.
 */
export interface FenderHandsContext {
  world: WorldState;
  vesselId: string;
  vesselRoot: THREE.Object3D | undefined;
  /** The boat hook is in your hand: no fender work (the owner: never push off with it, hang a fender). */
  hookInHand: boolean;
  push: (control: string, value: number, args?: number[]) => void;
  notify: (text: string) => void;
  pulse: (h: Handedness, intensity: number, ms: number) => void;
}

export interface FenderAim {
  side: -1 | 1;
  z: number;
  /** What the ray met (world). */
  point: THREE.Vector3;
  /** 'quay' | 'shore' | 'boat' */
  what: string;
}

export class FenderHands {
  private readonly p = new THREE.Vector3();
  private readonly l = new THREE.Vector3();
  private readonly here = new THREE.Vector3();
  private lastPlaced = 0;

  /** Is a fender wanted here: fenders out, no hook in hand, and the ray on something solid alongside? */
  aim(ctx: FenderHandsContext, origin: THREE.Vector3, dir: THREE.Vector3, out: FenderAim = { side: 1, z: 0, point: new THREE.Vector3(), what: '' }): FenderAim | null {
    const v = ctx.world.vessels[ctx.vesselId];
    const root = ctx.vesselRoot;
    if (!v || !root || ctx.hookInHand || !canWalkFender(v)) return null;
    const c = CONFIG.fenderWalk;
    const plan = hullPlan(VESSEL_DEFS[v.defId]);
    const step = 0.2;
    for (let d = 0.3; d <= c.rayLength; d += step) {
      this.p.copy(origin).addScaledVector(dir, d);
      const what = this.solidAt(ctx, v.id, this.p);
      if (!what) continue;
      // Only something alongside counts: the point near her side, outboard of it.
      root.worldToLocal(this.l.copy(this.p));
      const lz = Math.min(plan.transom, Math.max(plan.stem, this.l.z));
      const hb = plan.halfBeam(lz);
      const gap = Math.abs(this.l.x) - hb;
      if (gap > c.reach || this.l.z < plan.stem - c.reach || this.l.z > plan.transom + c.reach) return null;
      // At your own station, on that side.
      root.worldToLocal(this.here.copy(origin));
      out.side = this.l.x < 0 ? -1 : 1;
      out.z = Math.min(plan.transom - c.endClear, Math.max(plan.stem + c.endClear, this.here.z));
      out.point.copy(this.p);
      out.what = what;
      return out;
    }
    return null;
  }

  /** A quay or pier (inside its plan, below its top), the shore, or another boat's hull. */
  private solidAt(ctx: FenderHandsContext, ownId: string, p: THREE.Vector3): string | null {
    const top = blockTop(p.x, p.z);
    if (top !== null && p.y < top + 0.3) return 'quay';
    if (groundHeight(p.x, p.z) > p.y - 0.1) return 'shore';
    for (const o of Object.values(ctx.world.vessels)) {
      if (o.id === ownId) continue;
      if (distanceToHull(o, p.x, p.z) < 0.15 && p.y < o.position[1] + 2.5) return 'boat';
    }
    return null;
  }

  private hang(ctx: FenderHandsContext, a: FenderAim, hand: Handedness | 'desk'): void {
    const v = ctx.world.vessels[ctx.vesselId];
    const now = performance.now();
    if (now - this.lastPlaced < 300) return;
    this.lastPlaced = now;
    const moved = !!v?.walkFender;
    ctx.push('fenderWalk', 1, [a.side, a.z]);
    const where = a.what === 'boat' ? 'between her and the other boat' : 'between her and the quay';
    ctx.notify(`${moved ? 'Fender moved' : 'Fender hung'} ${where}, ${a.side < 0 ? 'port' : 'starboard'} side`);
    if (hand !== 'desk') ctx.pulse(hand, 0.5, 40);
  }

  /** Desktop: the label under the reticle when a fender is wanted there. */
  updateDesktop(ctx: FenderHandsContext, ray: THREE.Ray | null): string | null {
    if (!ray) return null;
    const a = this.aim(ctx, ray.origin, ray.direction);
    if (!a) return null;
    const v = ctx.world.vessels[ctx.vesselId];
    const what = a.what === 'boat' ? 'the boat alongside' : a.what === 'shore' ? 'the shore' : 'the quay';
    return `${what}\nclick to ${v?.walkFender ? 'move the fender here' : 'hang a fender here'}`;
  }

  /** Desktop: a click with the reticle on the quayside hangs the fender. Returns whether it did. */
  desktopClick(ctx: FenderHandsContext, ray: THREE.Ray | null): boolean {
    if (!ray) return false;
    const a = this.aim(ctx, ray.origin, ray.direction);
    if (!a) return false;
    this.hang(ctx, a, 'desk');
    return true;
  }

  /** VR: a free hand's trigger, pointed at the quayside. Returns the hands it used this frame. */
  updateXR(ctx: FenderHandsContext, hands: Record<Handedness, HandFrame>, busy: Record<Handedness, boolean>): Record<Handedness, boolean> {
    const used = { left: false, right: false };
    for (const h of ['right', 'left'] as const) {
      const f = hands[h];
      if (!f.tracked || busy[h] || !f.triggerPressed) continue;
      const a = this.aim(ctx, f.ray.origin, f.ray.direction);
      if (!a) continue;
      this.hang(ctx, a, h);
      used[h] = true;
    }
    return used;
  }
}

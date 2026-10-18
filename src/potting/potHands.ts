import * as THREE from 'three';
import { CONFIG } from '../config';
import type { HandFrame } from '../controls/InteractionSystem';
import type { WorldState } from '../core/world';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import type { Handedness } from '../player/xrInput';
import type { RescueHands } from '../rescue/rescueHands';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { hullPlan } from '../vessel/layout';
import { buoyUp, type ShotPot } from './potting';

/**
 * Hauling pots and working the catch, by hand (milestone 3). Local input only: everything
 * goes out as potting intents (potting.ts), so the crew sees the same.
 *
 *   hook     with the boat hook in hand (rescueHands), touch a buoy with its tip: hooked.
 *            It follows the hook tip in, like a crate. Desktop: click the buoy.
 *   aboard   once it's alongside, reach over it with your other hand and grip (desktop:
 *            click again): the buoy comes aboard, the line leading in over the gunwale.
 *   haul     grip the line (VR) and pull it in toward you, hand over hand, as the life
 *            ring's line; desktop: click on it. At the end the pot comes over onto the deck.
 *   the pot  lands on deck with its catch inside, in sight through the netting; it stays
 *            there until the pot is set down on a harbour quay and sold (cargo.ts).
 *            Every pot is baited (owner, Oct 2026: no bait tub, to keep the loop simple).
 */
export interface PotHandsContext {
  world: WorldState;
  playerId: string;
  vesselId: string;
  vesselRoot: THREE.Object3D | undefined;
  waves: readonly PreparedWave[];
  rescue: RescueHands;
  /** Intent to the boat (ref: the pot). */
  push(control: string, ref: string | undefined, value: number, args?: number[]): void;
  notify(text: string): void;
  pulse(hand: Handedness, intensity: number, ms: number): void;
  /** Put the boat hook back in its clips (desktop, once the buoy is aboard). */
  stowHook(): void;
}

const GRAB_LINE = 0.45;
const PULL_CHUNK = 0.15;
const DESK_REACH = 3.2;

export class PotHands {
  private line: { hand: Handedness; pot: string; last: THREE.Vector3; acc: number } | null = null;
  private towT = 0;
  /** The pot we're hauling: told what's in it when it lands. */
  private landing: string | null = null;
  private hinted = '';
  private hoverWas: Record<Handedness, boolean> = { left: false, right: false };
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  /** A hand is on (or over) a pot line: the line shows lit. */
  lineHover = false;

  // ── Where things are ──

  private myHooked(ctx: PotHandsContext): ShotPot | null {
    return ctx.world.potting?.shot.find((p) => p.haul?.phase === 'hooked' && p.haul.by === ctx.playerId) ?? null;
  }

  /** A buoy's float on the water (world). */
  private buoyAt(ctx: PotHandsContext, p: ShotPot, out: THREE.Vector3): THREE.Vector3 {
    return out.set(p.x, surfaceHeight(ctx.waves, p.x, p.z) + 0.05, p.z);
  }

  /** Pots on a line led aboard our boat: the line's two ends (lead on the gunwale, where it meets the water). */
  linesAboard(ctx: PotHandsContext): { pot: ShotPot; lead: THREE.Vector3; water: THREE.Vector3 }[] {
    const root = ctx.vesselRoot;
    const out: { pot: ShotPot; lead: THREE.Vector3; water: THREE.Vector3 }[] = [];
    if (!root) return out;
    for (const p of ctx.world.potting?.shot ?? []) {
      const h = p.haul;
      if (h?.phase !== 'line' || h.vessel !== ctx.vesselId || !h.lead) continue;
      const lead = root.localToWorld(new THREE.Vector3(...h.lead));
      const outward = root.localToWorld(new THREE.Vector3(h.lead[0] + Math.sign(h.lead[0]) * 0.6, 0, h.lead[2]));
      outward.y = surfaceHeight(ctx.waves, outward.x, outward.z);
      out.push({ pot: p, lead, water: outward });
    }
    return out;
  }

  private distToSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
    const ab = this.tmp2.copy(b).sub(a);
    const t = Math.max(0, Math.min(1, this.tmp.copy(p).sub(a).dot(ab) / Math.max(1e-6, ab.lengthSq())));
    return this.tmp.copy(a).addScaledVector(ab, t).distanceTo(p);
  }

  private hullDistance(ctx: PotHandsContext, x: number, z: number): number {
    const root = ctx.vesselRoot;
    const v = ctx.world.vessels[ctx.vesselId];
    if (!root || !v) return Infinity;
    const plan = hullPlan(VESSEL_DEFS[v.defId]);
    const l = root.worldToLocal(this.tmp.set(x, 0, z));
    const lz = Math.min(plan.transom, Math.max(plan.stem, l.z));
    return Math.hypot(Math.max(0, Math.abs(l.x) - plan.halfBeam(lz)), l.z - lz);
  }

  /** A pot we hauled has come aboard: say what's in it (once). */
  private announceLanded(ctx: PotHandsContext): void {
    if (!this.landing) return;
    const c = ctx.world.cargo[this.landing];
    if (!c) {
      if (!ctx.world.potting?.shot.some((p) => p.id === this.landing)) this.landing = null;
      return;
    }
    this.landing = null;
    const p = c.pot;
    if (!p) return;
    const extra = p.bycatch === 'boot' ? 'an old boot' : p.bycatch === 'fish' ? 'a little fish' : p.bycatch === 'starfish' ? 'a starfish' : '';
    const catchText = [p.lobster ? `${p.lobster} lobster${p.lobster > 1 ? 's' : ''}` : '', p.crab ? `${p.crab} crab${p.crab > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ');
    ctx.notify(catchText ? `Pot aboard: ${catchText}${extra ? ` and ${extra}` : ''}` : extra ? `Pot aboard: nothing but ${extra}` : 'Pot aboard: empty. Shoot it again');
  }

  // ── VR ──

  /** Hands working pots this frame (their grips are ours). */
  updateXR(ctx: PotHandsContext, hands: Record<Handedness, HandFrame>, busy: Record<Handedness, boolean>, dt: number): Record<Handedness, boolean> {
    const used = { left: false, right: false };
    const cfg = CONFIG.potting.haul;
    this.announceLanded(ctx);
    // Hook: the boat hook's tip on a buoy.
    const hooked = this.myHooked(ctx);
    if (ctx.rescue.holdingHook && !hooked) {
      const tip = ctx.rescue.hookTip;
      for (const p of ctx.world.potting?.shot ?? []) {
        if (p.haul || !buoyUp(ctx.world, p)) continue;
        if (this.buoyAt(ctx, p, this.a).distanceTo(tip) < cfg.hookReach) {
          ctx.push('potHook', p.id, 1);
          ctx.notify('Buoy hooked: bring it alongside');
          break;
        }
      }
    }
    if (hooked) this.towHooked(ctx, hooked, dt);
    // Hauling: the hand on the line pulls it in toward you; let go and you can take a new hold.
    const lines = this.linesAboard(ctx);
    if (this.line) {
      const f = hands[this.line.hand];
      const l = lines.find((x) => x.pot.id === this.line!.pot);
      if (!l || !f.tracked || !f.gripDown) {
        // Let go: what's left of the stroke still counts.
        if (l && this.line.acc > 0.03) ctx.push('potHaul', l.pot.id, this.line.acc * cfg.pullScale);
        this.line = null;
      }
      else {
        used[this.line.hand] = true;
        // Any stroke away from where the line leaves the water (up, in, or both) counts in full.
        const away = this.tmp.copy(f.grip).sub(l.water).normalize();
        const step = this.tmp2.copy(f.grip).sub(this.line.last);
        const len = step.length();
        if (len > 0 && step.dot(away) > 0.3 * len) this.line.acc += len;
        this.line.last.copy(f.grip);
        if (this.line.acc >= PULL_CHUNK) {
          ctx.push('potHaul', l.pot.id, this.line.acc * cfg.pullScale);
          this.landing = l.pot.id;
          ctx.pulse(this.line.hand, 0.25, 15);
          this.line.acc = 0;
        }
      }
    }
    this.lineHover = false;
    for (const h of ['left', 'right'] as const) {
      const f = hands[h];
      const free = f.tracked && !busy[h] && !ctx.rescue.busy(h) && this.line?.hand !== h;
      if (!free) continue;
      // The other hand over the hooked buoy alongside: grip brings it aboard.
      const myHook = this.myHooked(ctx);
      if (myHook && this.hullDistance(ctx, myHook.x, myHook.z) <= cfg.liftRange) {
        const b = this.buoyAt(ctx, myHook, this.a);
        const above = f.grip.y - b.y;
        if (Math.hypot(f.grip.x - b.x, f.grip.z - b.z) < 1.0 && above > -0.5 && above < 2.8 && f.gripPressed) {
          ctx.push('potAboard', myHook.id, 1);
          ctx.pulse(h, 0.6, 60);
          ctx.notify('Buoy aboard: haul the line in, hand over hand');
          used[h] = true;
          continue;
        }
      }
      // On a pot line?
      const near = lines.find((l) => l.lead.distanceTo(f.grip) < 0.6 || this.distToSegment(f.grip, l.lead, l.water) < GRAB_LINE);
      if (near && !this.hoverWas[h]) ctx.pulse(h, 0.25, 20);
      this.hoverWas[h] = !!near;
      if (near) this.lineHover = true;
      if (near && f.gripPressed) {
        this.line = { hand: h, pot: near.pot.id, last: f.grip.clone(), acc: 0 };
        ctx.pulse(h, 0.5, 40);
        used[h] = true;
      }
    }
    return used;
  }

  /** The hooked buoy follows the hook tip in (sent every 0.1 s, as crates are). */
  private towHooked(ctx: PotHandsContext, p: ShotPot, dt: number): void {
    if (!ctx.rescue.holdingHook) return;
    this.towT -= dt;
    if (this.towT <= 0) {
      this.towT = 0.1;
      ctx.push('potTow', p.id, 1, [ctx.rescue.hookTip.x, ctx.rescue.hookTip.z]);
    }
    if (this.hinted !== p.id && this.hullDistance(ctx, p.x, p.z) <= CONFIG.potting.haul.liftRange) {
      this.hinted = p.id;
      ctx.notify(ctx.rescue.deskBusy ? 'Buoy alongside: click to bring it aboard' : 'Buoy alongside: reach over it and grip with your other hand to bring it aboard');
    }
  }

  // ── Desktop ──

  /** Reticle label for pot work (or null: nothing here for us). */
  updateDesktop(ctx: PotHandsContext, ray: THREE.Ray | null, dt: number): string | null {
    const hooked = this.myHooked(ctx);
    if (hooked) this.towHooked(ctx, hooked, dt);
    this.announceLanded(ctx);
    this.lineHover = false;
    if (!ray) return null;
    if (ctx.rescue.deskBusy && !ctx.rescue.holdingRing) {
      if (hooked) return this.hullDistance(ctx, hooked.x, hooked.z) <= CONFIG.potting.haul.liftRange ? 'buoy alongside\nclick to bring it aboard' : 'buoy on the hook\nbring it alongside';
      if (this.buoyOnRay(ctx, ray)) return 'pot buoy\nclick to hook it';
      return null;
    }
    if (this.lineOnRay(ctx, ray)) {
      this.lineHover = true;
      return 'pot line\nclick to haul it in';
    }
    return null;
  }

  /** Desktop click: true if it was pot work. */
  desktopClick(ctx: PotHandsContext, ray: THREE.Ray | null): boolean {
    if (!ray) return false;
    if (ctx.rescue.deskBusy && !ctx.rescue.holdingRing) {
      const hooked = this.myHooked(ctx);
      if (hooked) {
        if (this.hullDistance(ctx, hooked.x, hooked.z) <= CONFIG.potting.haul.liftRange) {
          ctx.push('potAboard', hooked.id, 1);
          ctx.stowHook();
          ctx.notify('Buoy aboard: click the line to haul it in');
        } else ctx.notify('Bring the buoy alongside first');
        return true;
      }
      const b = this.buoyOnRay(ctx, ray);
      if (b) {
        ctx.push('potHook', b.id, 1);
        ctx.notify('Buoy hooked: bring it alongside');
        return true;
      }
      return false;
    }
    const l = this.lineOnRay(ctx, ray);
    if (l) {
      ctx.push('potHaul', l.pot.id, CONFIG.potting.haul.deskPull);
      this.landing = l.pot.id;
      return true;
    }
    return false;
  }

  private buoyOnRay(ctx: PotHandsContext, ray: THREE.Ray): ShotPot | null {
    let best: ShotPot | null = null;
    let bd = Infinity;
    for (const p of ctx.world.potting?.shot ?? []) {
      if (p.haul || !buoyUp(ctx.world, p)) continue;
      const c = this.buoyAt(ctx, p, this.a);
      const along = this.tmp.copy(c).sub(ray.origin).dot(ray.direction);
      if (along < 0 || along > CONFIG.rescue.hookLength + DESK_REACH) continue;
      const off = ray.distanceToPoint(c);
      if (off < 0.6 && along < bd) [best, bd] = [p, along];
    }
    return best;
  }

  private lineOnRay(ctx: PotHandsContext, ray: THREE.Ray): { pot: ShotPot } | null {
    for (const l of this.linesAboard(ctx)) {
      ray.distanceSqToSegment(l.lead, l.water, this.a, this.b);
      if (this.a.distanceTo(this.b) < 0.3 && this.b.distanceTo(ray.origin) < DESK_REACH) return l;
    }
    return null;
  }

  /** Busy hands (their grips are ours). */
  busy(h: Handedness): boolean {
    return this.line?.hand === h;
  }
}

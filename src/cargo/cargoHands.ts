/**
 * Picking up, carrying, setting down and lashing cargo with your hands (or the desktop
 * reticle). Purely the local player's input side: every change goes to the simulation as
 * an intent ('cargoTake', 'cargoPlace', 'cargoLash'), which checks it. While an intent is
 * on its way (a network round trip when you're crew in someone else's game), the item is
 * drawn where your hands put it, so nothing jumps.
 *
 * VR: grip on an item to pick it up; heavy ones (over CONFIG.cargo.twoHandKg) need both
 * grips on them. It follows your hand(s), upright. Let go to set it down: on the deck if
 * it's over the boat, on the quay or beach if it's over land, in the sea otherwise.
 * Trigger with a hand on an item on deck straps it to the nearest D-ring (or releases it).
 * Desktop: click an item to pick it up (it's carried in front of you), click again to set
 * it down; Q on an item on deck lashes / releases it.
 */
import * as THREE from 'three';
import type { HandFrame } from '../controls/InteractionSystem';
import type { WorldState } from '../core/world';
import type { Handedness } from '../player/xrInput';
import { hullPlan } from '../vessel/layout';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { standingHeight } from '../world/geography';
import { groundAt, isPot } from '../potting/potting';
import { groundHeight } from '../world/terrain';
import { CONFIG } from '../config';
import { GROUND, canLash, cargoLabel, footprint, isHeavy, kindOf, placeBlocker, takeBlocker, type CargoItem } from './cargo';

export interface CargoHandsContext {
  world: WorldState;
  playerId: string;
  /** What the player stands in (vessel root, or the scene). */
  frame: THREE.Object3D;
  vesselRoots: Map<string, THREE.Object3D>;
  push(control: string, targetId: string, ref: string, value: number, args?: number[]): void;
  notify(text: string): void;
  pulse(hand: Handedness, intensity: number, ms: number): void;
  /** Something was set down on a deck (the "snap" sound). */
  placedOnDeck?(): void;
}

interface Carry {
  id: string;
  hands: Handedness[];
  /** Base-centre offset from the hands (midpoint), in the player's frame axes. */
  offset: THREE.Vector3;
  /** Item yaw in the player's frame. */
  yaw: number;
  /** Setting it down was refused (the skiff is full): held until gripped again. */
  refused?: boolean;
}

const MARGIN = 0.12;
const DESK_REACH = 2.6;

export class CargoHands {
  private carry: Carry | null = null;
  /** One hand on a heavy item, waiting for the other. */
  private heavyWait: { id: string; hand: Handedness } | null = null;
  /** Items just set down, drawn there until the simulation agrees (or 1.5 s). */
  private readonly placed = new Map<string, { pos: THREE.Vector3; quat: THREE.Quaternion; until: number }>();
  private clock = 0;
  /** An adopted carry (see adopt) may wait this long for the simulation to create the item. */
  private adoptUntil = 0;
  hovered: string | null = null;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly qf = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly m = new THREE.Matrix4();
  private readonly inv = new THREE.Matrix4();
  /** Last drawn pose of the carried item (world). */
  private readonly carryPos = new THREE.Vector3();
  private readonly carryQuat = new THREE.Quaternion();
  private readonly ray = new THREE.Ray();

  /** Is the local player carrying something (in hand, not yet set down)? */
  get carrying(): boolean {
    return this.carry !== null;
  }

  /** Where a desktop player's hand holds the carried item (world): on its top. */
  handPoint(out: THREE.Vector3): THREE.Vector3 | null {
    return this.carry ? out.copy(this.carryPos).add(this.tmp2.set(0, 0.35, 0)) : null;
  }

  /** Hands holding the carried item: their grips belong to it, not to locomotion. */
  busy(hand: Handedness): boolean {
    return !!this.carry?.hands.includes(hand) || this.heavyWait?.hand === hand;
  }

  // ── Where items are drawn ──

  /** World base-centre pose of an item as it sits (ashore / on deck), for hit tests. */
  private restPose(c: CargoItem, ctx: CargoHandsContext, pos: THREE.Vector3, quat: THREE.Quaternion): boolean {
    if ('ground' in c.at) {
      pos.fromArray(c.at.ground);
      quat.setFromAxisAngle(this.up, c.at.yaw);
      return true;
    }
    if ('vessel' in c.at) {
      const root = ctx.vesselRoots.get(c.at.vessel);
      if (!root) return false;
      root.localToWorld(pos.fromArray(c.at.pos));
      root.getWorldQuaternion(quat).multiply(this.q.setFromAxisAngle(this.up, c.at.yaw));
      return true;
    }
    return false;
  }

  /** Pose for an item the local player has in hand or just set down, or null. */
  localPose(c: CargoItem): { pos: THREE.Vector3; quat: THREE.Quaternion } | null {
    const p = this.placed.get(c.id);
    if (p) return p;
    if (this.carry?.id === c.id) return { pos: this.carryPos, quat: this.carryQuat };
    return null;
  }

  // ── Hit tests ──

  /** Is a world point on (or within a few cm of) the item? */
  private touches(c: CargoItem, ctx: CargoHandsContext, point: THREE.Vector3): boolean {
    if (!this.restPose(c, ctx, this.tmp, this.q)) return false;
    const [sx, sy, sz] = kindOf(c).size;
    this.m.compose(this.tmp, this.q, this.tmp2.set(1, 1, 1));
    const l = this.tmp2.copy(point).applyMatrix4(this.inv.copy(this.m).invert());
    if (l.y < -MARGIN || l.y > sy + MARGIN) return false;
    if (kindOf(c).shape === 'drum') return Math.hypot(l.x, l.z) <= sx / 2 + MARGIN;
    return Math.abs(l.x) <= sx / 2 + MARGIN && Math.abs(l.z) <= sz / 2 + MARGIN;
  }

  /** Item under a hand, if any (not carried, nearest first is good enough: first found). */
  private itemAt(ctx: CargoHandsContext, point: THREE.Vector3): CargoItem | null {
    for (const c of Object.values(ctx.world.cargo)) {
      if ('carriedBy' in c.at || this.placed.has(c.id)) continue;
      if (this.touches(c, ctx, point)) return c;
    }
    return null;
  }

  /** Nearest item hit by a ray within `far` (box test in the item's axes). */
  private itemOnRay(ctx: CargoHandsContext, ray: THREE.Ray, far: number): CargoItem | null {
    let best: CargoItem | null = null;
    let bestT = far;
    for (const c of Object.values(ctx.world.cargo)) {
      if ('carriedBy' in c.at || this.placed.has(c.id)) continue;
      if (!this.restPose(c, ctx, this.tmp, this.q)) continue;
      const [sx, sy, sz] = kindOf(c).size;
      this.m.compose(this.tmp, this.q, this.tmp2.set(1, 1, 1));
      this.inv.copy(this.m).invert();
      this.ray.copy(ray).applyMatrix4(this.inv);
      const box = new THREE.Box3(new THREE.Vector3(-sx / 2, 0, -sz / 2), new THREE.Vector3(sx / 2, sy, sz / 2));
      const hit = this.ray.intersectBox(box, this.tmp2);
      if (!hit) continue;
      const t = hit.distanceTo(this.ray.origin);
      if (t < bestT) [best, bestT] = [c, t];
    }
    return best;
  }

  // ── Per frame ──

  /** Every frame, VR or desktop: settle items set down, and notice lost races (MP). */
  tick(ctx: CargoHandsContext, dt: number): void {
    this.clock += dt;
    for (const [id, p] of this.placed) {
      const c = ctx.world.cargo[id];
      // The simulation has it somewhere other than our hands (or it's gone): stop faking.
      if (!c || !('carriedBy' in c.at) || this.clock > p.until) this.placed.delete(id);
    }
    // We think we're carrying it, but the simulation gave it to someone else (MP race).
    if (this.carry) {
      const c = ctx.world.cargo[this.carry.id];
      if (c ? 'carriedBy' in c.at && c.at.carriedBy !== ctx.playerId : this.clock > this.adoptUntil) this.carry = null;
    }
  }

  private frameQuat(ctx: CargoHandsContext, out: THREE.Quaternion): THREE.Quaternion {
    return ctx.frame.getWorldQuaternion(out);
  }

  private startCarry(ctx: CargoHandsContext, c: CargoItem, hands: Handedness[], handsMid: THREE.Vector3): void {
    if (!this.restPose(c, ctx, this.tmp, this.q)) return;
    const fq = this.frameQuat(ctx, this.qf);
    const fqInv = fq.clone().invert();
    const offset = this.tmp.clone().sub(handsMid).applyQuaternion(fqInv);
    // Yaw in the player's frame: the item's world orientation relative to the frame.
    const rel = fqInv.multiply(this.q);
    const yaw = 2 * Math.atan2(rel.y, rel.w);
    this.carry = { id: c.id, hands, offset, yaw };
    this.heavyWait = null;
    ctx.push('cargoTake', c.at && 'vessel' in c.at ? c.at.vessel : GROUND, c.id, 1);
    for (const h of hands) ctx.pulse(h, 0.5, 40);
  }

  /**
   * Start carrying an item the simulation is about to put in our hands (a crate lifted
   * out of the sea with 'crateLift'): drawn at the hand(s) from now on, the item hanging
   * below them. It may not exist yet; it has a moment to appear.
   */
  adopt(id: string, hands: Handedness[], drop = 0.3): void {
    this.carry = { id, hands, offset: new THREE.Vector3(0, -drop, 0), yaw: 0 };
    this.heavyWait = null;
    this.adoptUntil = this.clock + 1.5;
  }

  private updateCarryPose(ctx: CargoHandsContext, handsMid: THREE.Vector3): void {
    if (!this.carry) return;
    const fq = this.frameQuat(ctx, this.qf);
    this.carryPos.copy(this.carry.offset).applyQuaternion(fq).add(handsMid);
    this.carryQuat.copy(fq).multiply(this.q.setFromAxisAngle(this.up, this.carry.yaw));
  }

  /**
   * Set the carried item down where it is: on a deck if it's over a hull (it slides off
   * the hand onto the deck), else ashore, else into the sea.
   */
  putDown(ctx: CargoHandsContext, throwDir?: THREE.Vector3): void {
    const carry = this.carry;
    if (!carry) return;
    const c = ctx.world.cargo[carry.id];
    this.carry = null;
    if (!c) return;
    const pos = this.carryPos.clone();
    const quat = this.carryQuat.clone();
    // Desktop, a pot: it's thrown a little way out the way you look, so you can shoot it
    // over the side from the rail (in VR you hold it out over the side and let go).
    if (throwDir && isPot(c)) {
      const out = pos.clone().addScaledVector(this.tmp.set(throwDir.x, 0, throwDir.z).normalize(), CONFIG.potting.deskThrow);
      if (!this.overHull(ctx, out) && standingHeight(out.x, out.z) < -0.3) pos.copy(out);
    }
    // Over a hull: the one whose deck is nearest below. Not the skiff under her tarpaulin
    // in the cradle (it goes on the foredeck around her, or not at all).
    let best: { vid: string; root: THREE.Object3D; l: THREE.Vector3; plan: ReturnType<typeof hullPlan>; gap: number } | null = null;
    for (const [vid, root] of ctx.vesselRoots) {
      const v = ctx.world.vessels[vid];
      if (!v || v.tender?.phase === 'stowed') continue;
      const l = root.worldToLocal(pos.clone());
      const plan = hullPlan(VESSEL_DEFS[v.defId]);
      if (l.z < plan.stem || l.z > plan.transom + 0.3 || Math.abs(l.x) > plan.halfBeam(Math.min(l.z, plan.transom)) + 0.3) continue;
      if (l.y > plan.deckY(l.z) + 4 || l.y < plan.deckY(l.z) - 1.5) continue;
      const gap = Math.abs(l.y - plan.deckY(l.z));
      if (!best || gap < best.gap) best = { vid, root, l, plan, gap };
    }
    if (best) {
      const { vid, root, l, plan } = best;
      const v = ctx.world.vessels[vid];
      const why = placeBlocker(ctx.world, v, c);
      if (why) {
        // Full: it stays in your hands (VR: until you grip it again and let go elsewhere).
        this.carry = { ...carry, refused: true };
        ctx.notify(why);
        return;
      }
      const rq = root.getWorldQuaternion(this.q).invert().multiply(quat);
      const yaw = 2 * Math.atan2(rq.y, rq.w);
      ctx.push('cargoPlace', vid, c.id, 1, [l.x, l.y, l.z, yaw]);
      ctx.placedOnDeck?.();
      this.placed.set(c.id, { pos: root.localToWorld(this.tmp.set(l.x, plan.deckY(l.z), l.z)).clone(), quat, until: this.clock + 1.5 });
      return;
    }
    const g = standingHeight(pos.x, pos.z);
    const yaw = 2 * Math.atan2(quat.y, quat.w);
    ctx.push('cargoPlace', GROUND, c.id, 1, [pos.x, pos.y, pos.z, yaw]);
    if (g > -0.3) this.placed.set(c.id, { pos: new THREE.Vector3(pos.x, g, pos.z), quat, until: this.clock + 1.5 });
    else if (isPot(c)) {
      const ground = groundAt(pos.x, pos.z);
      ctx.notify(groundHeight(pos.x, pos.z) > -1 ? 'Pot lost: no water to fish there' : ground ? `Pot away on ${ground.name}: its buoy will pop up` : 'Pot away (not on a potting ground: it will catch little)');
    } else ctx.notify(`${kindOf(c).name} lost in the sea`);
  }

  /** Is this world point over a hull's deck (where a set-down lands on that deck)? */
  private overHull(ctx: CargoHandsContext, pos: THREE.Vector3): boolean {
    for (const [vid, root] of ctx.vesselRoots) {
      const v = ctx.world.vessels[vid];
      if (!v || v.tender?.phase === 'stowed') continue;
      const l = root.worldToLocal(pos.clone());
      const plan = hullPlan(VESSEL_DEFS[v.defId]);
      if (l.z < plan.stem || l.z > plan.transom + 0.3 || Math.abs(l.x) > plan.halfBeam(Math.min(l.z, plan.transom)) + 0.3) continue;
      if (l.y > plan.deckY(l.z) + 4 || l.y < plan.deckY(l.z) - 1.5) continue;
      return true;
    }
    return false;
  }

  /** Toggle the lashing of an item on deck. */
  private toggleLash(ctx: CargoHandsContext, c: CargoItem, hand: Handedness | null): void {
    if (!('vessel' in c.at)) return;
    const v = ctx.world.vessels[c.at.vessel];
    if (!v) return;
    if (c.at.lashed) {
      ctx.push('cargoLash', v.id, c.id, 0);
      ctx.notify('Lashing released');
    } else if (canLash(v, c)) {
      ctx.push('cargoLash', v.id, c.id, 1);
      ctx.notify('Lashed down');
    } else {
      ctx.notify('Not on open deck: set it down clear of the gear and the house to lash it');
      if (hand) ctx.pulse(hand, 0.8, 60);
      return;
    }
    if (hand) ctx.pulse(hand, 0.6, 50);
  }

  /** VR frame. `busy` hands are on a control or the menu. */
  updateXR(ctx: CargoHandsContext, hands: Record<Handedness, HandFrame>, busy: Record<Handedness, boolean>): void {
    this.hovered = null;
    // Carrying: follow the hand(s); let go of any carrying grip to put it down.
    if (this.carry) {
      const hs = this.carry.hands;
      if (this.carry.refused && hs.every((h) => hands[h].gripDown)) this.carry.refused = false;
      if (!this.carry.refused && hs.some((h) => !hands[h].tracked || !hands[h].gripDown)) {
        this.putDown(ctx);
        for (const h of hs) ctx.pulse(h, 0.3, 30);
      } else {
        const mid = this.tmp2.set(0, 0, 0);
        for (const h of hs) mid.add(hands[h].grip);
        this.updateCarryPose(ctx, mid.multiplyScalar(1 / hs.length));
      }
      return;
    }
    if (this.heavyWait && !hands[this.heavyWait.hand].gripDown) this.heavyWait = null;
    for (const h of ['left', 'right'] as const) {
      const f = hands[h];
      if (!f.tracked || busy[h]) continue;
      const c = this.itemAt(ctx, f.grip);
      if (!c) continue;
      this.hovered = c.id;
      if (f.triggerPressed && 'vessel' in c.at) {
        this.toggleLash(ctx, c, h);
        continue;
      }
      if (!f.gripPressed) continue;
      const why = takeBlocker(c, ctx.world);
      if (why) {
        ctx.notify(why);
        ctx.pulse(h, 0.8, 60);
        continue;
      }
      if (!isHeavy(c)) {
        this.startCarry(ctx, c, [h], f.grip);
        return;
      }
      const other: Handedness = h === 'left' ? 'right' : 'left';
      if (this.heavyWait && this.heavyWait.id === c.id && this.heavyWait.hand === other && hands[other].gripDown) {
        const mid = this.tmp2.copy(f.grip).add(hands[other].grip).multiplyScalar(0.5);
        this.startCarry(ctx, c, ['left', 'right'], mid);
        return;
      }
      this.heavyWait = { id: c.id, hand: h };
      ctx.pulse(h, 0.25, 30);
      ctx.notify(`${kindOf(c).name}, ${c.mass} kg: grab it with both hands`);
    }
  }

  /**
   * Desktop frame with the reticle ray (null when the pointer isn't captured).
   * Returns the label to show under the reticle, if any.
   */
  updateDesktop(ctx: CargoHandsContext, ray: THREE.Ray | null, eye: THREE.Vector3, forward: THREE.Vector3): string | null {
    this.hovered = null;
    if (this.carry) {
      // Carried in front of you, at about waist-to-chest height.
      const f = this.tmp.set(forward.x, 0, forward.z);
      if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
      f.normalize();
      const c = ctx.world.cargo[this.carry.id];
      const r = c ? Math.max(footprint(c).hx, footprint(c).hz) : 0.3;
      // Carried low, at arm's length: you can see over it.
      const mid = this.tmp2.copy(eye).addScaledVector(f, 0.75 + r);
      mid.y -= 1.3;
      this.carry.offset.set(0, 0, 0);
      this.updateCarryPose(ctx, mid);
      return c ? `carrying ${cargoLabel(c)}\nclick to set down` : null;
    }
    if (!ray) return null;
    const c = this.itemOnRay(ctx, ray, DESK_REACH);
    if (!c) return null;
    this.hovered = c.id;
    const lashed = 'vessel' in c.at && c.at.lashed;
    return `${cargoLabel(c)}${lashed ? '  (lashed)' : ''}\n${lashed ? 'Q: release lashing' : 'click: pick up' + ('vessel' in c.at ? ' · Q: lash down' : '')}`;
  }

  /** Desktop click (not on a control or the menu): pick up the item under the reticle, or set down. */
  desktopClick(ctx: CargoHandsContext, ray: THREE.Ray | null): boolean {
    if (this.carry) {
      this.putDown(ctx, ray?.direction);
      return true;
    }
    if (!ray) return false;
    const c = this.itemOnRay(ctx, ray, DESK_REACH);
    if (!c) return false;
    const why = takeBlocker(c, ctx.world);
    if (why) {
      ctx.notify(why);
      return true;
    }
    if (!this.restPose(c, ctx, this.tmp, this.q)) return false;
    this.startCarry(ctx, c, [], this.tmp);
    return true;
  }

  /** Desktop Q: lash / release the item under the reticle. */
  desktopLash(ctx: CargoHandsContext, ray: THREE.Ray | null): void {
    if (!ray || this.carry) return;
    const c = this.itemOnRay(ctx, ray, DESK_REACH);
    if (c) this.toggleLash(ctx, c, null);
  }

  /** You fell or jumped into the sea holding something: it's gone. */
  dropInSea(ctx: CargoHandsContext): void {
    if (this.carry) this.putDown(ctx);
  }
}


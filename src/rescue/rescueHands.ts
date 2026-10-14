/**
 * The local player's hands on the rescue gear: the life ring, its line and the boat hook.
 * Like CargoHands, this is input only: every change goes to the simulation as an intent
 * (ringTake / ringThrow / ringPull / hookTake / crateHook / crateTow / crateLift ...),
 * which checks it (see recovery.ts). While something is in our hand it's drawn from here
 * (ringPos, hookBase / hookTip), so it never lags a network round trip behind the hand.
 *
 * VR
 *   - Grip the ring on the wheelhouse aft wall to take it; swing and let go to throw it
 *     (the hand's speed sets the throw; a gentle release just hangs it back up).
 *   - Ring in the water: grip the line near the quarter cleat (or anywhere along it) and
 *     pull, hand over hand - every pull shortens the line by the distance your hand moved
 *     (times CONFIG.rescue.reelScale).
 *   - Grip the boat hook on the port bulwark to take it; it points along your controller.
 *     Touch a floating crate with the tip to hook it; it follows the tip. Bring it alongside
 *     and grip it with your other hand to lift it aboard (then it's an ordinary carried
 *     crate: set it down on deck). Let go of the hook to put it back (anything on it floats
 *     off).
 * Desktop
 *   - Click the ring to take it, click again to throw it where you look.
 *   - Click the line or the cleat to pull a length in.
 *   - Click the hook to take it; it reaches where you look on the water. Click a crate to
 *     hook it, click again once it's alongside to lift it aboard. Click open water to put
 *     the hook back.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { HandFrame } from '../controls/InteractionSystem';
import type { WorldState } from '../core/world';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import type { Handedness } from '../player/xrInput';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import type { CargoHands } from '../cargo/cargoHands';
import { distanceToHull } from './recovery';
import type { RescueTarget } from './rescue';

export interface RescueHandsContext {
  world: WorldState;
  playerId: string;
  vesselId: string;
  vesselRoot: THREE.Object3D | undefined;
  waves: readonly PreparedWave[];
  cargoHands: CargoHands;
  push(control: string, ref: string | undefined, value: number, args?: number[]): void;
  notify(text: string): void;
  pulse(hand: Handedness, intensity: number, ms: number): void;
}

/** How close a hand must be to the gear to grab it (m). */
const GRAB = 0.3;
/** Desktop reach to the ring, hook and line (m). */
const DESK_REACH = 3.2;
/** Seconds to wait for the simulation to agree we're holding something. */
const GRACE = 1.5;
/** Pull the line in in chunks of this much hand travel (m) per intent. */
const PULL_CHUNK = 0.15;

type Holder = Handedness | 'desk';

export class RescueHands {
  /** Who's holding the ring / hook / line here (a hand, the desktop mouse) or null. */
  private ring: Holder | null = null;
  private hook: Holder | null = null;
  private line: { hand: Handedness; last: THREE.Vector3; acc: number } | null = null;
  private ringSince = 0;
  private hookSince = 0;
  private clock = 0;
  private towT = 0;
  /** Recent grip positions of the ring hand, for the throw speed. */
  private readonly trail: { t: number; p: THREE.Vector3 }[] = [];
  /** World pose of the gear in our hands (valid while held). */
  readonly ringPos = new THREE.Vector3();
  readonly hookBase = new THREE.Vector3();
  readonly hookTip = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly closest = new THREE.Vector3();

  get holdingRing(): boolean {
    return this.ring !== null;
  }
  get holdingHook(): boolean {
    return this.hook !== null;
  }
  /** Is the mouse busy with rescue gear (so a click is ours, not the cargo's)? */
  get deskBusy(): boolean {
    return this.ring === 'desk' || this.hook === 'desk';
  }

  /** Hands holding the gear: their grips belong to it, not to locomotion. */
  busy(hand: Handedness): boolean {
    return this.ring === hand || this.hook === hand || this.line?.hand === hand;
  }

  // ── Where the gear is ──

  private gear(ctx: RescueHandsContext) {
    const v = ctx.world.vessels[ctx.vesselId];
    return v ? VESSEL_DEFS[v.defId].rescueGear : null;
  }

  private ringStowW(ctx: RescueHandsContext, out: THREE.Vector3): THREE.Vector3 | null {
    const g = this.gear(ctx);
    return g && ctx.vesselRoot ? ctx.vesselRoot.localToWorld(out.fromArray(g.ringStow)) : null;
  }

  private cleatW(ctx: RescueHandsContext, out: THREE.Vector3): THREE.Vector3 | null {
    const g = this.gear(ctx);
    return g && ctx.vesselRoot ? ctx.vesselRoot.localToWorld(out.fromArray(g.ringCleat)) : null;
  }

  /** The stowed hook's pole, as a segment (world). */
  private hookStowW(ctx: RescueHandsContext): THREE.Line3 | null {
    const g = this.gear(ctx);
    if (!g || !ctx.vesselRoot) return null;
    const [x, y, z0, z1] = g.hookStow;
    return new THREE.Line3(ctx.vesselRoot.localToWorld(new THREE.Vector3(x, y, z0)), ctx.vesselRoot.localToWorld(new THREE.Vector3(x, y, z1)));
  }

  /** Distance from a point to the line between the cleat and the ring in the water (m). */
  private lineDistance(ctx: RescueHandsContext, p: THREE.Vector3): number {
    const r = ctx.world.rescue?.ring;
    if (!r || r.state !== 'water' || !this.cleatW(ctx, this.tmp2)) return Infinity;
    const seg = new THREE.Line3(this.tmp2.clone(), new THREE.Vector3().fromArray(r.pos));
    // Only the first few metres from the cleat are in reach from the deck anyway.
    return seg.closestPointToPoint(p, true, this.closest).distanceTo(p);
  }

  private floatingCrates(ctx: RescueHandsContext): RescueTarget[] {
    const inc = ctx.world.rescue?.active;
    if (!inc || inc.phase !== 'accepted') return [];
    return inc.targets.filter((t) => t.kind === 'crate' && (!t.phase || t.phase === 'floating'));
  }

  private hookedCrate(ctx: RescueHandsContext): RescueTarget | undefined {
    return ctx.world.rescue?.active?.targets.find((t) => t.phase === 'hooked' && t.hookedBy === ctx.playerId);
  }

  private crateCentre(ctx: RescueHandsContext, t: RescueTarget, out: THREE.Vector3): THREE.Vector3 {
    return out.set(t.x, surfaceHeight(ctx.waves, t.x, t.z) + 0.1, t.z);
  }

  // ── Per frame ──

  /** Every frame, VR or desktop: notice when the simulation disagrees (MP races). */
  tick(ctx: RescueHandsContext, dt: number): void {
    this.clock += dt;
    const r = ctx.world.rescue;
    if (this.ring && this.clock - this.ringSince > GRACE && !(r?.ring?.state === 'held' && r.ring.holder === ctx.playerId)) this.ring = null;
    if (this.hook && this.clock - this.hookSince > GRACE && r?.hook?.holder !== ctx.playerId) this.hook = null;
    if (this.line && r?.ring?.state !== 'water') this.line = null;
  }

  private takeRing(ctx: RescueHandsContext, who: Holder): void {
    this.ring = who;
    this.ringSince = this.clock;
    this.trail.length = 0;
    ctx.push('ringTake', undefined, 1);
  }

  private takeHook(ctx: RescueHandsContext, who: Holder): void {
    this.hook = who;
    this.hookSince = this.clock;
    ctx.push('hookTake', undefined, 1);
  }

  private stowHook(ctx: RescueHandsContext): void {
    this.hook = null;
    ctx.push('hookStow', undefined, 1);
  }

  /** Throw the ring from `pos` at `vel` (world), or hang it back up if it's too gentle. */
  private release(ctx: RescueHandsContext, pos: THREE.Vector3, vel: THREE.Vector3): void {
    this.ring = null;
    const v = ctx.world.vessels[ctx.vesselId];
    const rel = v ? this.tmp.copy(vel).sub(this.tmp2.fromArray(v.linearVelocity)).length() : vel.length();
    if (rel < CONFIG.rescue.minThrowSpeed) {
      ctx.push('ringStow', undefined, 1);
      return;
    }
    ctx.push('ringThrow', undefined, 1, [pos.x, pos.y, pos.z, vel.x, vel.y, vel.z]);
  }

  /** Lift the hooked crate aboard with this hand (or the desktop mouse). */
  private lift(ctx: RescueHandsContext, t: RescueTarget, hands: Handedness[]): boolean {
    const v = ctx.world.vessels[ctx.vesselId];
    if (!v) return false;
    if (distanceToHull(v, t.x, t.z) > CONFIG.rescue.liftRange) {
      ctx.notify('Bring it alongside first');
      return false;
    }
    ctx.push('crateLift', t.id, 1);
    ctx.cargoHands.adopt(`rescued-${t.id}`, hands);
    return true;
  }

  /** VR frame. `busy` hands are on a control, the menu or cargo. */
  updateXR(ctx: RescueHandsContext, hands: Record<Handedness, HandFrame>, busy: Record<Handedness, boolean>, dt: number): void {
    const cfg = CONFIG.rescue;
    const rs = ctx.world.rescue;
    // Holding the ring: track the hand; let go to throw.
    if (this.ring && this.ring !== 'desk') {
      const f = hands[this.ring];
      this.ringPos.copy(f.grip);
      this.trail.push({ t: this.clock, p: f.grip.clone() });
      while (this.trail.length > 2 && this.clock - this.trail[0].t > 0.1) this.trail.shift();
      if (!f.tracked || !f.gripDown) {
        const a = this.trail[0];
        const dtT = this.clock - a.t;
        // Hand speed over the last ~0.1 s; only the throw relative to the boat is boosted
        // by throwScale (the boat's own speed is carried as it is).
        const v = ctx.world.vessels[ctx.vesselId];
        const boat = this.tmp2.set(0, 0, 0);
        if (v) boat.fromArray(v.linearVelocity);
        const vel = dtT > 1e-3 ? this.tmp.copy(f.grip).sub(a.p).divideScalar(dtT) : this.tmp.copy(boat);
        vel.sub(boat).multiplyScalar(cfg.throwScale).add(boat);
        const h = this.ring;
        this.release(ctx, f.grip.clone(), vel.clone());
        ctx.pulse(h, 0.4, 40);
      }
    }
    // Pulling the line: hand travel away from the ring shortens it.
    if (this.line) {
      const f = hands[this.line.hand];
      if (!f.tracked || !f.gripDown || !rs?.ring || rs.ring.state !== 'water') this.line = null;
      else {
        const away = this.tmp.set(f.grip.x - rs.ring.pos[0], 0, f.grip.z - rs.ring.pos[2]).normalize();
        const moved = this.tmp2.copy(f.grip).sub(this.line.last).dot(away);
        this.line.last.copy(f.grip);
        if (moved > 0) this.line.acc += moved;
        if (this.line.acc >= PULL_CHUNK) {
          ctx.push('ringPull', undefined, this.line.acc * cfg.reelScale);
          ctx.pulse(this.line.hand, 0.35, 25);
          this.line.acc = 0;
        }
      }
    }
    // Holding the hook: it points along the controller.
    if (this.hook && this.hook !== 'desk') {
      const f = hands[this.hook];
      if (!f.tracked || !f.gripDown) {
        ctx.pulse(this.hook, 0.3, 30);
        this.stowHook(ctx);
      } else {
        this.hookBase.copy(f.grip);
        this.hookTip.copy(f.grip).addScaledVector(f.ray.direction, cfg.hookLength);
        this.useHook(ctx, dt, this.hook);
      }
    }
    // Free hands: grab the gear (or, with the hook in the other hand, the crate on it).
    for (const h of ['left', 'right'] as const) {
      const f = hands[h];
      if (!f.tracked || busy[h] || this.busy(h) || !f.gripPressed || ctx.cargoHands.busy(h)) continue;
      const hooked = this.hookedCrate(ctx);
      if (hooked && this.hook && this.hook !== h && this.crateCentre(ctx, hooked, this.tmp).distanceTo(f.grip) < 0.6) {
        if (this.lift(ctx, hooked, [h])) ctx.pulse(h, 0.6, 60);
        continue;
      }
      const stow = this.ringStowW(ctx, this.tmp);
      if (!this.ring && rs?.ring?.state === 'stowed' && stow && stow.distanceTo(f.grip) < GRAB) {
        this.takeRing(ctx, h);
        ctx.pulse(h, 0.5, 40);
        continue;
      }
      const pole = this.hookStowW(ctx);
      if (!this.hook && !rs?.hook?.holder && pole && pole.closestPointToPoint(f.grip, true, this.closest).distanceTo(f.grip) < GRAB) {
        this.takeHook(ctx, h);
        ctx.pulse(h, 0.5, 40);
        continue;
      }
      const cleat = this.cleatW(ctx, this.tmp);
      if (rs?.ring?.state === 'water' && cleat && (cleat.distanceTo(f.grip) < 0.5 || this.lineDistance(ctx, f.grip) < GRAB)) {
        this.line = { hand: h, last: f.grip.clone(), acc: 0 };
        ctx.pulse(h, 0.4, 30);
      }
    }
  }

  /** The hook in hand: hook a crate the tip touches; tow the one on it. */
  private useHook(ctx: RescueHandsContext, dt: number, hand: Holder): void {
    const cfg = CONFIG.rescue;
    const on = this.hookedCrate(ctx);
    if (on) {
      this.towT -= dt;
      if (this.towT <= 0) {
        this.towT = 0.1;
        ctx.push('crateTow', on.id, 1, [this.hookTip.x, this.hookTip.z]);
      }
      return;
    }
    if (hand === 'desk') return; // the desktop hooks by clicking
    for (const t of this.floatingCrates(ctx)) {
      if (this.crateCentre(ctx, t, this.tmp).distanceTo(this.hookTip) < cfg.hookReach + 0.35) {
        ctx.push('crateHook', t.id, 1);
        ctx.pulse(hand, 0.7, 60);
        return;
      }
    }
  }

  /**
   * Desktop frame with the reticle ray (null when the pointer isn't captured): poses the
   * gear in hand and returns a label for the reticle, if the gear has anything to say.
   */
  updateDesktop(ctx: RescueHandsContext, ray: THREE.Ray | null, eye: THREE.Vector3, forward: THREE.Vector3, dt: number): string | null {
    const rs = ctx.world.rescue;
    const right = this.tmp2.set(-forward.z, 0, forward.x).normalize();
    if (this.ring === 'desk') {
      // Held low at your right side, out of the way of the view.
      this.ringPos.copy(eye).addScaledVector(forward, 0.5).addScaledVector(right, 0.5);
      this.ringPos.y -= 0.6;
      return 'life ring\nclick to throw it where you look';
    }
    if (this.hook === 'desk') {
      this.hookBase.copy(eye).addScaledVector(right, 0.25);
      this.hookBase.y -= 0.45;
      this.deskHookTip(ctx, eye, forward);
      this.useHook(ctx, dt, 'desk');
      const on = this.hookedCrate(ctx);
      if (on) {
        const v = ctx.world.vessels[ctx.vesselId];
        const near = v && distanceToHull(v, on.x, on.z) <= CONFIG.rescue.liftRange;
        return near ? 'crate alongside\nclick to lift it aboard' : 'crate on the hook\nlook along the hull to bring it alongside';
      }
      return this.crateOnRay(ctx, ray) ? 'crate\nclick to hook it' : 'boat hook\nclick a crate to hook it · click open water to put it back';
    }
    if (!ray) return null;
    const target = this.deskTarget(ctx, ray);
    if (target === 'ring') return 'life ring\nclick to take it';
    if (target === 'hook') return 'boat hook\nclick to take it';
    if (target === 'line') return rs?.active?.targets.some((t) => t.phase === 'onLine') ? 'line: survivor on it!\nclick to pull in' : 'life ring line\nclick to pull in';
    return null;
  }

  /** The desktop hook reaches toward where you look on the water, no further than its length. */
  private deskHookTip(ctx: RescueHandsContext, eye: THREE.Vector3, forward: THREE.Vector3): void {
    const L = CONFIG.rescue.hookLength;
    const water = surfaceHeight(ctx.waves, eye.x, eye.z);
    let t = L + 1;
    if (forward.y < -0.05) t = Math.min(t, (eye.y - water) / -forward.y);
    const tip = this.hookTip.copy(eye).addScaledVector(forward, t);
    // Keep the pole its length.
    const d = this.tmp.copy(tip).sub(this.hookBase);
    if (d.length() > L) tip.copy(this.hookBase).addScaledVector(d.normalize(), L);
  }

  private crateOnRay(ctx: RescueHandsContext, ray: THREE.Ray | null): RescueTarget | null {
    if (!ray) return null;
    for (const t of this.floatingCrates(ctx)) {
      const c = this.crateCentre(ctx, t, this.tmp);
      if (c.distanceTo(ray.origin) < CONFIG.rescue.hookLength + 2.5 && ray.distanceToPoint(c) < 0.6) return t;
    }
    return null;
  }

  /** What the reticle is on, among the gear (within reach). */
  private deskTarget(ctx: RescueHandsContext, ray: THREE.Ray): 'ring' | 'hook' | 'line' | null {
    const rs = ctx.world.rescue;
    const stow = this.ringStowW(ctx, this.tmp);
    if (rs?.ring?.state === 'stowed' && stow && stow.distanceTo(ray.origin) < DESK_REACH && ray.distanceToPoint(stow) < 0.35) return 'ring';
    const pole = this.hookStowW(ctx);
    if (!rs?.hook?.holder && pole) {
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      ray.distanceSqToSegment(pole.start, pole.end, a, b);
      if (a.distanceTo(b) < 0.15 && b.distanceTo(ray.origin) < DESK_REACH) return 'hook';
    }
    const cleat = this.cleatW(ctx, this.tmp);
    if (rs?.ring?.state === 'water' && cleat && cleat.distanceTo(ray.origin) < DESK_REACH + 2) {
      if (ray.distanceToPoint(cleat) < 0.4) return 'line';
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      ray.distanceSqToSegment(cleat, new THREE.Vector3().fromArray(rs.ring.pos), a, b);
      if (a.distanceTo(b) < 0.25 && b.distanceTo(ray.origin) < DESK_REACH + 2) return 'line';
    }
    return null;
  }

  /** Desktop click: returns true if the rescue gear took it. */
  desktopClick(ctx: RescueHandsContext, ray: THREE.Ray | null, forward: THREE.Vector3): boolean {
    const cfg = CONFIG.rescue;
    if (this.ring === 'desk') {
      // Throw to where you look on the water: launched at 35 degrees from the hand, at the
      // speed that lands it there, no further than the line reaches (looking at the sky
      // throws as far as the line goes). Range R from height h at angle a needs
      //   v^2 = g R^2 / (2 cos^2 a (R tan a + h)).
      const from = this.ringPos;
      const eye = ray?.origin ?? this.ringPos;
      const water = surfaceHeight(ctx.waves, eye.x, eye.z);
      let dist = cfg.maxLine * 0.9;
      if (forward.y < -0.02) dist = Math.min(dist, ((eye.y - water) / -forward.y) * Math.hypot(forward.x, forward.z));
      dist = Math.max(3, dist);
      const angle = (35 * Math.PI) / 180;
      const h0 = Math.max(0, from.y - water);
      const cos = Math.cos(angle);
      const speed = Math.min(cfg.desktopThrowSpeed, Math.sqrt((CONFIG.ocean.gravity * dist * dist) / (2 * cos * cos * (dist * Math.tan(angle) + h0))));
      const h = this.tmp2.set(forward.x, 0, forward.z).normalize();
      const vel = this.tmp.set(h.x * Math.cos(angle), Math.sin(angle), h.z * Math.cos(angle)).multiplyScalar(speed);
      const v = ctx.world.vessels[ctx.vesselId];
      if (v) vel.add(this.tmp2.fromArray(v.linearVelocity));
      this.release(ctx, from.clone(), vel.clone());
      return true;
    }
    if (this.hook === 'desk') {
      const on = this.hookedCrate(ctx);
      if (on) {
        // Lifted: the hook goes back in its clips, the crate is in your hands.
        if (this.lift(ctx, on, [])) this.stowHook(ctx);
        return true;
      }
      const t = this.crateOnRay(ctx, ray);
      if (t) ctx.push('crateHook', t.id, 1);
      else this.stowHook(ctx);
      return true;
    }
    if (!ray || ctx.cargoHands.carrying) return false;
    const target = this.deskTarget(ctx, ray);
    if (target === 'ring') this.takeRing(ctx, 'desk');
    else if (target === 'hook') this.takeHook(ctx, 'desk');
    else if (target === 'line') ctx.push('ringPull', undefined, cfg.desktopPull);
    return target !== null;
  }

  /** Fell in or left the boat: let go of everything (a held ring just goes back). */
  dropAll(ctx: RescueHandsContext): void {
    if (this.ring) ctx.push('ringStow', undefined, 1);
    if (this.hook) ctx.push('hookStow', undefined, 1);
    this.ring = this.hook = null;
    this.line = null;
  }
}

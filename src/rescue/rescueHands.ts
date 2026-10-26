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
 *   - Grip the boat hook on the port bulwark to take it: it stays in that hand (no need to
 *     keep gripping) and points along your controller. Touch a floating crate with the tip
 *     to hook it; it follows the tip. Bring it alongside and grip it with your other hand to
 *     lift it aboard (then it's an ordinary carried crate: set it down on deck). Grip again
 *     with the hook hand to put it down: back in its clips if you're at them, else on the
 *     deck, to be picked up again (anything on it floats off).
 * Desktop
 *   - Click the ring to take it, click again to throw it where you look.
 *   - Click the line or the cleat to pull a length in.
 *   - Click the hook to take it; it reaches where you look on the water. Click a crate to
 *     hook it, click again once it's alongside to lift it aboard. Click open water to put
 *     the hook back.
 * Pushing off (owner, Oct 2026): the hook's tip on a quay, a pier or the shore, press the
 * trigger (VR) or click (desktop): a shove along the hook, away from it, at the hand
 * ('hookPush', recovery.ts). Press again to push more; a heavy boat takes many.
 * Towing: with the hook, touch (VR) or click (desktop) the bow eye of any boat afloat (a
 * tow's orange eye, our own skiff's stem) or a piece of drifting debris to make the
 * towline fast over our stern roller (towMake ref=<target>; the simulation checks the
 * range); the same again on what's on the line casts it off (towCast). In VR each touch
 * counts once: take the tip away and touch again to toggle back.
 * Auto-extend (menu option, on by default): point the hook at a floating crate or a bow
 * eye up to CONFIG.rescue.hookAutoReach away and it telescopes out to it, so the tip
 * touches it (VR hooks it straight away; desktop: click). With a crate on it, it slides
 * back to its own length, bringing the crate in.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { HandFrame } from '../controls/InteractionSystem';
import type { WorldState } from '../core/world';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import type { Handedness } from '../player/xrInput';
import { hullPlan } from '../vessel/layout';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { gearOf } from '../boats/sims';
import type { GearFacts } from '../modular/module';
import type { CargoHands } from '../cargo/cargoHands';
import { userSettings } from '../player/userSettings';
import { distanceToHull, hookIn, ringIn } from './recovery';
import { lineFor, lineOf, towName, towPoint, towReach, towTargets } from '../tow/tow';
import { ropePoints, ROPE_POINTS } from './rescueGearView';
import { blockTop } from '../world/geography';
import { groundHeight } from '../world/terrain';
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

/** How close a hand must be to the gear to grab it (m); the line, more forgiving. */
const GRAB = 0.3;
const GRAB_LINE = 0.45;
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
  /** A free hand is within reach of the line (it's drawn highlighted, the hand ticks). */
  lineHover = false;
  private readonly hoverWas = { left: false, right: false };
  private readonly liftWas = { left: false, right: false };
  /** The hooked crate we've already said "lift it" about. */
  private liftHinted: string | null = null;
  private readonly rope = new Float32Array(ROPE_POINTS * 3);
  private ringSince = 0;
  private hookSince = 0;
  private clock = 0;
  private towT = 0;
  /** Last push off a quay with the hook (s). */
  private pushAt = -1;
  /** Last time we asked to make a towline fast (s), so a hook resting on the eye asks once a second. */
  private towAsk = -9;
  /** The VR hook tip was on the bow eye last frame (a touch toggles once, on arrival). */
  private eyeTouch = false;
  /** How far the hook reaches right now (m): its own length, or telescoped out (auto-extend). */
  private reach: number = CONFIG.rescue.hookLength;
  /** Recent grip positions of the ring hand, for the throw speed. */
  private readonly trail: { t: number; p: THREE.Vector3 }[] = [];
  /** World pose of the gear in our hands (valid while held). */
  readonly ringPos = new THREE.Vector3();
  readonly hookBase = new THREE.Vector3();
  readonly hookTip = new THREE.Vector3();
  /** The hook's pole, butt to tip (a hand on it can lift the crate on it). */
  private readonly pole = new THREE.Line3();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly closest = new THREE.Vector3();

  get holdingRing(): boolean {
    return this.ring !== null;
  }
  get holdingHook(): boolean {
    return this.hook !== null;
  }
  /** Is a hand on the line, pulling? */
  get pulling(): boolean {
    return this.line !== null;
  }
  /** Is the mouse busy with rescue gear (so a click is ours, not the cargo's)? */
  /** The boat hook is in a hand (yours): no fender work with it (owner: never push off with it). */
  get hookInHand(): boolean {
    return this.hook !== null;
  }

  get deskBusy(): boolean {
    return this.ring === 'desk' || this.hook === 'desk';
  }

  /** Hands holding the gear: their grips belong to it, not to locomotion. */
  busy(hand: Handedness): boolean {
    return this.ring === hand || this.hook === hand || this.line?.hand === hand;
  }

  // ── Where the gear is ──

  /** Her life ring station and boat-hook rack (modules; null where she has none). */
  private gear(ctx: RescueHandsContext): { ring: GearFacts['lifeRing'] | null; hook: GearFacts['boatHook'] | null } | null {
    const v = ctx.world.vessels[ctx.vesselId];
    return v ? { ring: gearOf(v, 'lifeRing'), hook: gearOf(v, 'boatHook') } : null;
  }

  /**
   * Auto-extend: the reach (m) along `dir` from `base` this frame. Out to the nearest
   * crate or bow eye close to the line of the pole (within ~0.6 m, a little more further
   * out) and within hookAutoReach; back to the hook's own length otherwise, slowly while
   * something is on it (that brings it in), quickly when not.
   */
  private extend(ctx: RescueHandsContext, base: THREE.Vector3, dir: THREE.Vector3, dt: number): number {
    const cfg = CONFIG.rescue;
    let want = cfg.hookLength;
    const loaded = !!this.hookedCrate(ctx);
    if (userSettings.hookAutoExtend && !loaded) {
      let best = Infinity;
      const consider = (c: THREE.Vector3) => {
        const t = this.tmp2.copy(c).sub(base).dot(dir);
        if (t < cfg.hookLength * 0.5 || t > cfg.hookAutoReach || t >= best) return;
        const off = this.tmp2.copy(base).addScaledVector(dir, t).distanceTo(c);
        if (off < 0.6 + 0.05 * t) best = t;
      };
      for (const t of this.floatingCrates(ctx)) consider(this.crateCentre(ctx, t, this.tmp));
      for (const e of this.towEyes(ctx)) consider(e.p);
      if (best < Infinity) want = Math.max(cfg.hookLength, best);
    }
    const rate = want > this.reach ? cfg.hookExtendSpeed : loaded ? cfg.hookRetractSpeed : cfg.hookExtendSpeed;
    this.reach += Math.sign(want - this.reach) * Math.min(Math.abs(want - this.reach), rate * dt);
    return this.reach;
  }

  private readonly eyes: { key: string; p: THREE.Vector3 }[] = [];

  /**
   * Tow points within hook's reach of our boat (world): bow eyes of boats afloat, debris.
   * While the line is fast, only what it's on (that's what the hook can cast off).
   */
  private towEyes(ctx: RescueHandsContext): { key: string; p: THREE.Vector3 }[] {
    const v = ctx.world.vessels[ctx.vesselId];
    // Our boat's line (each boat has her own: multi-boat towing).
    const line = lineOf(ctx.world, ctx.vesselId);
    const keys = line ? [line.target] : v ? towTargets(ctx.world, ctx.vesselId) : [];
    let n = 0;
    for (const key of keys) {
      const e = (this.eyes[n] ??= { key, p: new THREE.Vector3() });
      if (!towPoint(ctx.world, key, e.p, ctx.vesselId) || !v || Math.hypot(e.p.x - v.position[0], e.p.z - v.position[2]) > 40) continue;
      e.key = key;
      // Debris floats at the drawn surface.
      if (key.startsWith('d:')) e.p.setY(surfaceHeight(ctx.waves, e.p.x, e.p.z) + 0.15);
      n++;
    }
    this.eyes.length = n;
    return this.eyes;
  }

  /** The hook on a tow point: make the towline fast, or cast it off if it is (once a second at most). */
  private makeFast(ctx: RescueHandsContext, hand: Holder, key: string): void {
    if (this.clock - this.towAsk < 1) return;
    this.towAsk = this.clock;
    if (lineOf(ctx.world, ctx.vesselId)) {
      ctx.push('towCast', undefined, 1);
      if (hand !== 'desk') ctx.pulse(hand, 0.6, 60);
      ctx.notify('Towline cast off.');
      return;
    }
    // The line runs over our stern roller: what we tow must be near enough our stern.
    if (towReach(ctx.world, key, ctx.vesselId, undefined, true) > lineFor(key).attach) {
      ctx.notify(`Too far from our stern: bring the stern roller within ${lineFor(key).attach} m of it.`);
      return;
    }
    ctx.push('towMake', key, 1);
    if (hand !== 'desk') ctx.pulse(hand, 0.8, 80);
    const job = ctx.world.tow?.job;
    ctx.notify(
      job?.phase === 'accepted' && key === `v:${job.vesselId}`
        ? 'Towline made fast. Tow her into any harbour - easy on the throttle at first.'
        : key.startsWith('d:')
          ? 'Towline made fast to the debris. Tow it into a harbour to clear it.'
          : key.startsWith('l:')
            ? 'Line made fast round the log. Ease ahead and pull it off the beach, then tow it into any harbour.'
          : `Towline made fast to ${towName(ctx.world, key)}. Easy on the throttle.`,
    );
  }

  private ringStowW(ctx: RescueHandsContext, out: THREE.Vector3): THREE.Vector3 | null {
    const g = this.gear(ctx)?.ring;
    return g && ctx.vesselRoot ? ctx.vesselRoot.localToWorld(out.fromArray(g.stow)) : null;
  }

  private cleatW(ctx: RescueHandsContext, out: THREE.Vector3): THREE.Vector3 | null {
    const g = this.gear(ctx)?.ring;
    return g && ctx.vesselRoot ? ctx.vesselRoot.localToWorld(out.fromArray(g.cleat)) : null;
  }

  /** The resting hook's pole (in its clips, or laid on deck), as a segment (world). */
  private hookRestW(ctx: RescueHandsContext): THREE.Line3 | null {
    const g = this.gear(ctx)?.hook;
    if (!g || !ctx.vesselRoot) return null;
    const deck = hookIn(ctx.world, ctx.vesselId)?.deck;
    if (deck) {
      const [x, y, z, yaw] = deck;
      const L = CONFIG.rescue.hookLength;
      return new THREE.Line3(
        ctx.vesselRoot.localToWorld(new THREE.Vector3(x, y, z)),
        ctx.vesselRoot.localToWorld(new THREE.Vector3(x + Math.sin(yaw) * L, y, z + Math.cos(yaw) * L)),
      );
    }
    const [x, y, z0, z1] = g.stow;
    return new THREE.Line3(ctx.vesselRoot.localToWorld(new THREE.Vector3(x, y, z0)), ctx.vesselRoot.localToWorld(new THREE.Vector3(x, y, z1)));
  }

  /** The clips' segment (world), whether the hook is in them or not. */
  private clipsW(ctx: RescueHandsContext): THREE.Line3 | null {
    const g = this.gear(ctx)?.hook;
    if (!g || !ctx.vesselRoot) return null;
    const [x, y, z0, z1] = g.stow;
    return new THREE.Line3(ctx.vesselRoot.localToWorld(new THREE.Vector3(x, y, z0)), ctx.vesselRoot.localToWorld(new THREE.Vector3(x, y, z1)));
  }

  /** Distance from a point to the line from the cleat to the ring in the water, as drawn (m). */
  private lineDistance(ctx: RescueHandsContext, p: THREE.Vector3): number {
    const r = ringIn(ctx.world, ctx.vesselId);
    if (!r || r.state !== 'water' || !this.cleatW(ctx, this.tmp2)) return Infinity;
    ropePoints(this.tmp2, this.closest.fromArray(r.pos), r.line, true, ctx.waves, this.rope);
    let best = Infinity;
    const seg = new THREE.Line3();
    for (let i = 0; i + 1 < ROPE_POINTS; i++) {
      seg.start.fromArray(this.rope, i * 3);
      seg.end.fromArray(this.rope, i * 3 + 3);
      best = Math.min(best, seg.closestPointToPoint(p, true, this.closest).distanceTo(p));
    }
    return best;
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
    if (this.ring && this.clock - this.ringSince > GRACE && !(ringIn(ctx.world, ctx.vesselId)?.state === 'held' && ringIn(ctx.world, ctx.vesselId)!.holder === ctx.playerId)) this.ring = null;
    if (this.hook && this.clock - this.hookSince > GRACE && r?.hook?.holder !== ctx.playerId) this.hook = null;
    if (this.line && ringIn(ctx.world, ctx.vesselId)?.state !== 'water') this.line = null;
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
    this.reach = CONFIG.rescue.hookLength;
    ctx.push('hookTake', undefined, 1);
  }

  stowHook(ctx: RescueHandsContext): void {
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
      if (!f.tracked || !f.gripDown || !ringIn(ctx.world, ctx.vesselId) || ringIn(ctx.world, ctx.vesselId)!.state !== 'water') this.line = null;
      else {
        const away = this.tmp.set(f.grip.x - ringIn(ctx.world, ctx.vesselId)!.pos[0], 0, f.grip.z - ringIn(ctx.world, ctx.vesselId)!.pos[2]).normalize();
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
    // Holding the hook: it stays in the hand (no need to keep gripping) and points along the
    // controller. Grip again to put it down: in its clips if you're at them, else on deck.
    if (this.hook && this.hook !== 'desk') {
      const h = this.hook;
      const f = hands[h];
      if (f.tracked && f.gripPressed && this.clock - this.hookSince > 0.3) {
        ctx.pulse(h, 0.4, 40);
        const clips = this.clipsW(ctx);
        if (clips && clips.closestPointToPoint(f.grip, true, this.closest).distanceTo(f.grip) < 0.5) this.stowHook(ctx);
        else this.layHook(ctx, f.grip, f.ray.direction);
      } else if (f.tracked) {
        this.hookBase.copy(f.grip);
        this.hookTip.copy(f.grip).addScaledVector(f.ray.direction, this.extend(ctx, f.grip, f.ray.direction, dt));
        this.useHook(ctx, dt, h, f.triggerPressed);
      }
    }
    // Free hands: grab the gear (or, with the hook in the other hand, the crate on it).
    // A hand within reach of the line lights it up and ticks once, so you can find it.
    this.lineHover = false;
    for (const h of ['left', 'right'] as const) {
      const f = hands[h];
      const free = f.tracked && !busy[h] && !this.busy(h) && !ctx.cargoHands.busy(h);
      const near = free && ringIn(ctx.world, ctx.vesselId)?.state === 'water' && this.nearLine(ctx, f.grip);
      if (near && !this.hoverWas[h]) ctx.pulse(h, 0.25, 20);
      this.hoverWas[h] = !!near;
      if (near) this.lineHover = true;
      // The other hand over a hooked crate alongside: it ticks, and a grip lifts it.
      const hooked = this.hookedCrate(ctx);
      const canLift = free && !!hooked && !!this.hook && this.hook !== h && this.inLiftReach(ctx, hooked, f.grip);
      if (canLift && !this.liftWas[h]) ctx.pulse(h, 0.35, 25);
      this.liftWas[h] = canLift;
      if (!free || !f.gripPressed) continue;
      if (canLift) {
        if (this.lift(ctx, hooked!, [h])) ctx.pulse(h, 0.6, 60);
        continue;
      }
      const stow = this.ringStowW(ctx, this.tmp);
      if (!this.ring && ringIn(ctx.world, ctx.vesselId)?.state === 'stowed' && stow && stow.distanceTo(f.grip) < GRAB) {
        this.takeRing(ctx, h);
        ctx.pulse(h, 0.5, 40);
        continue;
      }
      const pole = this.hookRestW(ctx);
      if (!this.hook && !rs?.hook?.holder && pole && pole.closestPointToPoint(f.grip, true, this.closest).distanceTo(f.grip) < GRAB) {
        this.takeHook(ctx, h);
        ctx.pulse(h, 0.5, 40);
        continue;
      }
      if (near) {
        this.line = { hand: h, last: f.grip.clone(), acc: 0 };
        ctx.pulse(h, 0.5, 40);
      }
    }
  }

  /**
   * Can this hand take the hooked crate aboard? The crate must be alongside. It floats at
   * the waterline, a metre or more below the rail, at the end of the hook's pole: out of
   * reach of a hand on deck. So either the hand takes hold of the pole (hand over hand, to
   * haul it up), or it reaches over the side towards it: within `liftHandReach` of it
   * horizontally, and above it.
   */
  private inLiftReach(ctx: RescueHandsContext, t: RescueTarget, grip: THREE.Vector3): boolean {
    const v = ctx.world.vessels[ctx.vesselId];
    if (!v || distanceToHull(v, t.x, t.z) > CONFIG.rescue.liftRange) return false;
    if (this.pole.set(this.hookBase, this.hookTip).closestPointToPoint(grip, true, this.closest).distanceTo(grip) < GRAB) return true;
    const c = this.crateCentre(ctx, t, this.tmp2);
    const above = grip.y - c.y;
    return Math.hypot(grip.x - c.x, grip.z - c.z) < CONFIG.rescue.liftHandReach && above > -0.5 && above < 3;
  }

  /** Is a hand at the cleat or on the line? */
  private nearLine(ctx: RescueHandsContext, p: THREE.Vector3): boolean {
    const cleat = this.cleatW(ctx, this.tmp);
    return !!cleat && (cleat.distanceTo(p) < 0.6 || this.lineDistance(ctx, p) < GRAB_LINE);
  }

  /** Lay the hook down on deck, butt at the hand, lying the way it pointed. */
  private layHook(ctx: RescueHandsContext, grip: THREE.Vector3, dir: THREE.Vector3): void {
    const v = ctx.world.vessels[ctx.vesselId];
    const root = ctx.vesselRoot;
    this.hook = null;
    if (!v || !root) {
      ctx.push('hookStow', undefined, 1);
      return;
    }
    const l = root.worldToLocal(this.tmp.copy(grip));
    const d = this.tmp2.copy(dir).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()).invert());
    const plan = hullPlan(VESSEL_DEFS[v.defId]);
    ctx.push('hookDrop', undefined, 1, [l.x, plan.deckY(l.z), l.z, Math.atan2(d.x, d.z)]);
  }

  /** The hook in hand: hook a crate the tip touches; tow the one on it. */
  /** Is the hook's tip on something solid: inside a quay or pier's plan below its deck, or in the ground? */
  private tipOnSolid(): boolean {
    const t = this.hookTip;
    const top = blockTop(t.x, t.z);
    if (top !== null && t.y < top + 0.3) return true;
    return groundHeight(t.x, t.z) > t.y - 0.1;
  }

  /** A shove off whatever the tip is on: along the pole from tip to hand, level, at the hand. */
  private pushOff(ctx: RescueHandsContext, hand: Holder): void {
    if (this.clock - this.pushAt < CONFIG.rescue.hookPush.every) return;
    this.pushAt = this.clock;
    const d = this.tmp.copy(this.hookBase).sub(this.hookTip);
    d.y = 0;
    if (d.lengthSq() < 1e-6) return;
    d.normalize();
    ctx.push('hookPush', undefined, 1, [d.x, d.z, this.hookBase.x, this.hookBase.y, this.hookBase.z]);
    if (hand !== 'desk') ctx.pulse(hand, 0.7, 70);
  }

  private useHook(ctx: RescueHandsContext, dt: number, hand: Holder, press = false): void {
    const cfg = CONFIG.rescue;
    const on = this.hookedCrate(ctx);
    // The tip on a quay or the shore: a press shoves us off it.
    if (!on && press && this.tipOnSolid()) {
      this.pushOff(ctx, hand);
      return;
    }
    if (on) {
      const v = ctx.world.vessels[ctx.vesselId];
      if (hand !== 'desk' && v && this.liftHinted !== on.id && distanceToHull(v, on.x, on.z) <= cfg.liftRange) {
        this.liftHinted = on.id;
        ctx.notify('Crate alongside: grip the hook\'s pole with your other hand, or reach over the side towards it, to lift it aboard.');
      }
      this.towT -= dt;
      if (this.towT <= 0) {
        this.towT = 0.1;
        ctx.push('crateTow', on.id, 1, [this.hookTip.x, this.hookTip.z]);
      }
      return;
    }
    if (hand === 'desk') return; // the desktop hooks by clicking
    const eye = this.towEyes(ctx).find((e) => e.p.distanceTo(this.hookTip) < cfg.hookReach + (e.key.startsWith('d:') ? 0.8 : 0.3));
    const touching = !!eye;
    if (eye && !this.eyeTouch) this.makeFast(ctx, hand, eye.key);
    this.eyeTouch = touching;
    if (touching) return;
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
      // Auto-extend: telescoped out to the crate or bow eye under the reticle.
      if (userSettings.hookAutoExtend && !this.hookedCrate(ctx)) {
        // (Not out to a log on the beach: the line is thrown there, the hook stays its length.)
        const eyeT = this.towEyeOnRay(ctx, ray);
        const target = (eyeT && !eyeT.key.startsWith('l:') ? eyeT.p : null) ?? (this.crateOnRay(ctx, ray) && this.crateCentre(ctx, this.crateOnRay(ctx, ray)!, this.tmp2));
        if (target) this.hookTip.copy(target);
      }
      this.useHook(ctx, dt, 'desk');
      const on = this.hookedCrate(ctx);
      if (on) {
        const v = ctx.world.vessels[ctx.vesselId];
        const near = v && distanceToHull(v, on.x, on.z) <= CONFIG.rescue.liftRange;
        return near ? 'crate alongside\nclick to lift it aboard' : 'crate on the hook\nlook along the hull to bring it alongside';
      }
      const eyeOn = this.towEyeOnRay(ctx, ray);
      if (eyeOn) {
        const what = eyeOn.key.startsWith('d:') ? 'debris' : eyeOn.key.startsWith('l:') ? 'log' : 'bow eye';
        return lineOf(ctx.world, ctx.vesselId) ? `${what}\nclick to cast off the towline` : `${what}\nclick to make the towline fast`;
      }
      if (this.tipOnSolid()) return 'boat hook on the quay\nclick to push off (again to push more)';
      return this.crateOnRay(ctx, ray) ? 'crate\nclick to hook it' : 'boat hook\nclick a crate to hook it · click open water to put it back';
    }
    if (!ray) return null;
    const target = this.deskTarget(ctx, ray);
    if (target === 'ring') return 'life ring\nclick to take it';
    if (target === 'hook') return 'boat hook\nclick to take it';
    if (target === 'line') {
      if (ringIn(ctx.world, ctx.vesselId)?.player) return 'line: your crew-mate is on it!\nclick to pull in';
      return rs?.active?.targets.some((t) => t.phase === 'onLine') ? 'line: survivor on it!\nclick to pull in' : 'life ring line\nclick to pull in';
    }
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

  /** Desktop: how far from the eye the hook reaches a crate or bow eye (auto-extend: further). */
  private deskReach(): number {
    const cfg = CONFIG.rescue;
    return userSettings.hookAutoExtend ? Math.max(cfg.hookAutoReach + 1, cfg.hookLength + 2.5) : cfg.hookLength + 2.5;
  }

  /** Desktop: is the reticle on a waiting tow's bow eye, within the hook's reach? */
  /**
   * The tow point the reticle is on, within the hook's reach (debris is a bigger target).
   * A log on a beach can be clicked from further off: the line is thrown to it (the boat
   * can't come close in the shallows); the simulation checks the line's reach.
   */
  private towEyeOnRay(ctx: RescueHandsContext, ray: THREE.Ray | null): { key: string; p: THREE.Vector3 } | null {
    if (!ray) return null;
    for (const e of this.towEyes(ctx)) {
      const log = e.key.startsWith('l:');
      const reach = log ? lineFor(e.key).attach + 5 : this.deskReach();
      if (e.p.distanceTo(ray.origin) < reach && ray.distanceToPoint(e.p) < (log ? 1.8 : e.key.startsWith('d:') ? 1.2 : 0.5)) return e;
    }
    return null;
  }

  private crateOnRay(ctx: RescueHandsContext, ray: THREE.Ray | null): RescueTarget | null {
    if (!ray) return null;
    for (const t of this.floatingCrates(ctx)) {
      const c = this.crateCentre(ctx, t, this.tmp);
      if (c.distanceTo(ray.origin) < this.deskReach() && ray.distanceToPoint(c) < 0.6) return t;
    }
    return null;
  }

  /** What the reticle is on, among the gear (within reach). */
  private deskTarget(ctx: RescueHandsContext, ray: THREE.Ray): 'ring' | 'hook' | 'line' | null {
    const rs = ctx.world.rescue;
    const stow = this.ringStowW(ctx, this.tmp);
    if (ringIn(ctx.world, ctx.vesselId)?.state === 'stowed' && stow && stow.distanceTo(ray.origin) < DESK_REACH && ray.distanceToPoint(stow) < 0.35) return 'ring';
    const pole = this.hookRestW(ctx);
    if (!rs?.hook?.holder && pole) {
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      ray.distanceSqToSegment(pole.start, pole.end, a, b);
      if (a.distanceTo(b) < 0.15 && b.distanceTo(ray.origin) < DESK_REACH) return 'hook';
    }
    const cleat = this.cleatW(ctx, this.tmp);
    if (ringIn(ctx.world, ctx.vesselId)?.state === 'water' && cleat && cleat.distanceTo(ray.origin) < DESK_REACH + 2) {
      if (ray.distanceToPoint(cleat) < 0.4) return 'line';
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      ray.distanceSqToSegment(cleat, new THREE.Vector3().fromArray(ringIn(ctx.world, ctx.vesselId)!.pos), a, b);
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
      const eyeOn = this.towEyeOnRay(ctx, ray);
      if (eyeOn) {
        this.makeFast(ctx, 'desk', eyeOn.key);
        return true;
      }
      if (this.tipOnSolid()) {
        this.pushOff(ctx, 'desk');
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

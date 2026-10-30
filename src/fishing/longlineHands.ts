import * as THREE from 'three';
import { CONFIG } from '../config';
import type { HandFrame } from '../controls/InteractionSystem';
import type { WorldState } from '../core/world';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import type { Handedness } from '../player/xrInput';
import type { RescueHands } from '../rescue/rescueHands';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { hullPlan } from '../vessel/layout';
import { groundHeight } from '../world/terrain';
import { gearOf } from '../boats/sims';
import { hydraulicsOn } from '../vessel/electrics';
import { FISH_HANG, groundOf, haulSummary, nextStretch, offTheLine, sizeWord, type LineFish, type Longline } from './longline';

/**
 * Working a longline by hand (fishing/longline.ts), as the pots are worked (potting/potHands.ts).
 * Local input only: everything goes out as longline intents, so the crew sees the same.
 *
 *   hook     with the boat hook in hand, touch a dan buoy with its tip: hooked; it follows the tip
 *            in (on its buoy rope). Desktop: click the buoy.
 *   aboard   alongside, reach over it with your other hand and grip (desktop: click again): the
 *            line leads in over her gunwale.
 *   haul     grip the line and pull it in toward you, hand over hand (desktop: click on it). The
 *            next hook comes up with each good pull. Keep her up along the line.
 *   a fish   at the rail on its hook, called out (its species, weight and how good it is): grip
 *            it (desktop: click) to take it off, into the fish box on deck, or back over the side
 *            if it's undersize. The line won't come while a fish is on.
 *   the end  told the whole line's catch when it's in, or that it's parted.
 */
export interface LonglineHandsContext {
  world: WorldState;
  playerId: string;
  vesselId: string;
  vesselRoot: THREE.Object3D | undefined;
  waves: readonly PreparedWave[];
  rescue: RescueHands;
  push(control: string, ref: string | undefined, value: number, args?: number[]): void;
  notify(text: string, seconds?: number): void;
  pulse(hand: Handedness, intensity: number, ms: number): void;
  stowHook(): void;
}

const GRAB_LINE = 0.45;
const GRAB_FISH = 0.4;
const PULL_CHUNK = 0.15;
const DESK_REACH = 3.2;

/** A line led aboard our boat: its two ends (the lead on the gunwale, where it meets the water), and the fish on the hook there. */
export interface LineAboard {
  line: Longline;
  lead: THREE.Vector3;
  water: THREE.Vector3;
  fishAt: THREE.Vector3;
}

export class LonglineHands {
  private hold: { hand: Handedness; line: string; last: THREE.Vector3; acc: number } | null = null;
  private towT = 0;
  private hinted = '';
  private hoverWas: Record<Handedness, boolean> = { left: false, right: false };
  /** The fish we last called out, by line (so each is called once); the hauls we've told of. */
  private called = new Map<string, LineFish | null>();
  private told = -1;
  /** Our lines in the water and shooting, as last seen (to tell each one set, or lost, once): null until first seen. */
  private seenLines: Set<string> | null = null;
  private seenShooting = new Set<string>();
  private offToldAt = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  /** A hand is on (or over) a longline: it shows lit. */
  lineHover = false;

  private myHooked(ctx: LonglineHandsContext): Longline | null {
    return ctx.world.longline?.lines.find((l) => l.haul?.phase === 'hooked' && l.haul.by === ctx.playerId) ?? null;
  }

  /** A dan buoy's float on the water (world). */
  private buoyAt(ctx: LonglineHandsContext, b: [number, number], out: THREE.Vector3): THREE.Vector3 {
    return out.set(b[0], surfaceHeight(ctx.waves, b[0], b[1]) + 0.1, b[1]);
  }

  /** Lines led aboard our boat: the lead, where it meets the water (toward the line's next stretch), and the hook's fish below the lead. */
  linesAboard(ctx: LonglineHandsContext): LineAboard[] {
    const root = ctx.vesselRoot;
    const out: LineAboard[] = [];
    if (!root) return out;
    for (const line of ctx.world.longline?.lines ?? []) {
      const h = line.haul;
      if (h?.phase !== 'line' || h.vessel !== ctx.vesselId || !h.lead) continue;
      const lead = root.localToWorld(new THREE.Vector3(...h.lead));
      const [nx, nz] = nextStretch(line);
      const dir = this.tmp.set(nx - lead.x, 0, nz - lead.z);
      if (dir.lengthSq() < 1e-6) dir.set(Math.sign(h.lead[0]) || 1, 0, 0);
      dir.normalize();
      const water = new THREE.Vector3(lead.x + dir.x * 0.8, 0, lead.z + dir.z * 0.8);
      water.y = surfaceHeight(ctx.waves, water.x, water.z);
      // The fish swung up to the rail (FISH_HANG): grip it by the head, just below its mouth.
      const fishAt = new THREE.Vector3(lead.x + dir.x * FISH_HANG.out, lead.y + FISH_HANG.up - 0.2, lead.z + dir.z * FISH_HANG.out);
      out.push({ line, lead, water, fishAt });
    }
    return out;
  }

  private distToSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
    const ab = this.tmp2.copy(b).sub(a);
    const t = Math.max(0, Math.min(1, this.tmp.copy(p).sub(a).dot(ab) / Math.max(1e-6, ab.lengthSq())));
    return this.tmp.copy(a).addScaledVector(ab, t).distanceTo(p);
  }

  private hullDistance(ctx: LonglineHandsContext, x: number, z: number): number {
    const root = ctx.vesselRoot;
    const v = ctx.world.vessels[ctx.vesselId];
    if (!root || !v) return Infinity;
    const plan = hullPlan(VESSEL_DEFS[v.defId]);
    const l = root.worldToLocal(this.tmp.set(x, 0, z));
    const lz = Math.min(plan.transom, Math.max(plan.stem, l.z));
    return Math.hypot(Math.max(0, Math.abs(l.x) - plan.halfBeam(lz)), l.z - lz);
  }

  /**
   * Each line of ours told once (owner, 29 Oct 2026: let go over the side "it says you've lost
   * the reel in the water ... It should say line set"): shooting, set (its length and ground,
   * or that it's off any ground and will catch little), or lost (stopped too soon).
   */
  private announceSetting(ctx: LonglineHandsContext): void {
    const s = ctx.world.longline;
    const lines = (s?.lines ?? []).filter((l) => l.owner === ctx.vesselId);
    const shooting = (s?.shooting ?? []).filter((x) => x.vessel === ctx.vesselId);
    // (Lines already out when we came are history: not told.)
    if (!this.seenLines) this.seenLines = new Set(lines.map((l) => l.id));
    for (const sh of shooting) {
      if (this.seenShooting.has(sh.line)) continue;
      ctx.notify('Line going out over the stern: keep her straight, 3 to 8 knots, until the far buoy goes in (stop to end it short)', 5);
    }
    for (const l of lines) {
      if (this.seenLines.has(l.id)) continue;
      const g = groundOf(l);
      const m = Math.round(Math.min(l.hooks * CONFIG.longline.hookSpacingM, CONFIG.longline.lengthM));
      ctx.notify(`Line set: ${m} m, ${l.hooks} hooks, ${g ? `on ${g.name}` : 'off any fishing ground (it will catch little)'}. Let it soak about ${Math.round(CONFIG.longline.soakReady / 60)} minutes`, 6);
    }
    // A shooting gone with no line of its id: stopped too soon, lost.
    for (const id of this.seenShooting) if (!shooting.some((x) => x.line === id) && !lines.some((l) => l.id === id)) ctx.notify(`Line lost: she stopped before ${CONFIG.longline.minM} m were out`, 5);
    this.seenLines = new Set(lines.map((l) => l.id));
    this.seenShooting = new Set(shooting.map((x) => x.line));
  }

  /** Call out each new fish at the rail, and each haul's end, once. */
  private announce(ctx: LonglineHandsContext): void {
    this.announceSetting(ctx);
    for (const l of this.linesAboard(ctx)) {
      const f = l.line.haul?.fish ?? null;
      const was = this.called.get(l.line.id);
      if (f && f !== was && (!was || was.kg !== f.kg || was.species !== f.species)) {
        const w = sizeWord(f);
        const word = w === 'undersize' ? 'undersize: back it goes when you take it off' : w === 'big' ? 'a big one!' : w === 'good' ? 'a good one' : w === 'fair' ? 'a fair one' : 'a small one';
        ctx.notify(`${f.species}, ${f.kg.toFixed(1)} kg: ${word}`, 3);
      }
      this.called.set(l.line.id, f);
    }
    const done = ctx.world.longline?.done ?? [];
    const mine = done.filter((d) => d.vessel === ctx.vesselId);
    // (The hauls before we came are history: not told.)
    if (this.told < 0) this.told = mine.length;
    if (mine.length > this.told) {
      const d = mine[mine.length - 1];
      ctx.notify(d.parted ? `The line's parted! Haul the rest from its other buoy. This end: ${haulSummary(d.fish)}` : `Line aboard: ${haulSummary(d.fish)}`, 7);
    }
    this.told = mine.length;
    this.haulerNotes(ctx);
  }

  /** Her line hauler: brought in at the roller and the line round it, why it isn't turning (now and then). */
  private haulerNotes(ctx: LonglineHandsContext): void {
    const v = ctx.world.vessels[ctx.vesselId];
    const h = v?.hauler;
    if (!v || !h?.line) return;
    const line = this.linesAboard(ctx).find((l) => l.line.haul?.hauler)?.line;
    if (!line || line.haul?.fish) return;
    if ((v.controls.haulerValve ?? 0) > 0 && !hydraulicsOn(v)) {
      if (performance.now() - this.offToldAt > 6000) {
        this.offToldAt = performance.now();
        ctx.notify('No pressure for the hauler: the engine running, and DECK HYD on the breaker panel');
      }
    } else if (h.held) this.offLine(ctx, line);
  }

  /** What to say once the dan buoy's aboard: round her hauler if she has one, else hand over hand. */
  private aboardWords(ctx: LonglineHandsContext, desk: boolean): string {
    const v = ctx.world.vessels[ctx.vesselId];
    if (v && gearOf(v, 'lineHauler')) return 'Dan buoy aboard: the line\'s round the hauler. Set its valve to SLOW or FAST, and keep her up along the line';
    return desk ? 'Dan buoy aboard: click the line to haul it in. Keep her up along it' : 'Dan buoy aboard: haul the line in, hand over hand. Keep her up along it';
  }

  /** Off the line (the haul won't come): said now and then while you try. */
  private offLine(ctx: LonglineHandsContext, line: Longline): boolean {
    const v = ctx.world.vessels[ctx.vesselId];
    if (!v) return false;
    const [x, z] = nextStretch(line);
    const off = offTheLine(line, v) > Math.max(2, -groundHeight(x, z)) + CONFIG.longline.leadSlackM;
    if (off && performance.now() - this.offToldAt > 4000) {
      this.offToldAt = performance.now();
      ctx.notify('She’s off the line: bring her up along it, slowly');
    }
    return off;
  }

  // ── VR ──

  updateXR(ctx: LonglineHandsContext, hands: Record<Handedness, HandFrame>, busy: Record<Handedness, boolean>, dt: number): Record<Handedness, boolean> {
    const used = { left: false, right: false };
    const c = CONFIG.longline;
    this.announce(ctx);
    const hooked = this.myHooked(ctx);
    // Hook: the boat hook's tip on a dan buoy.
    if (ctx.rescue.holdingHook && !hooked) {
      const tip = ctx.rescue.hookTip;
      for (const line of ctx.world.longline?.lines ?? []) {
        if (line.haul) continue;
        const end = ([0, 1] as const).find((e) => line.buoys[e] && this.buoyAt(ctx, line.buoys[e]!, this.a).distanceTo(tip) < c.hookReach);
        if (end === undefined) continue;
        ctx.push('llHook', line.id, 1, [end]);
        ctx.notify('Dan buoy hooked: bring it alongside');
        break;
      }
    }
    if (hooked) this.towHooked(ctx, hooked, dt);
    const lines = this.linesAboard(ctx);
    // Hauling: the hand on the line pulls it in toward you.
    if (this.hold) {
      const f = hands[this.hold.hand];
      const l = lines.find((x) => x.line.id === this.hold!.line);
      if (!l || !f.tracked || !f.gripDown) this.hold = null;
      else {
        used[this.hold.hand] = true;
        const away = this.tmp.copy(f.grip).sub(l.water).normalize();
        const step = this.tmp2.copy(f.grip).sub(this.hold.last);
        const len = step.length();
        if (len > 0 && step.dot(away) > 0.3 * len) this.hold.acc += len;
        this.hold.last.copy(f.grip);
        if (this.hold.acc >= PULL_CHUNK) {
          if (!l.line.haul?.fish && !this.offLine(ctx, l.line)) {
            ctx.push('llHaul', l.line.id, this.hold.acc * c.pullScale);
            ctx.pulse(this.hold.hand, 0.25, 15);
          }
          this.hold.acc = 0;
        }
      }
    }
    this.lineHover = false;
    for (const h of ['left', 'right'] as const) {
      const f = hands[h];
      const free = f.tracked && !busy[h] && !ctx.rescue.busy(h) && this.hold?.hand !== h;
      if (!free) continue;
      // The other hand over the hooked buoy alongside: grip brings it aboard.
      const myHook = this.myHooked(ctx);
      const b = myHook?.haul ? myHook.buoys[myHook.haul.end] : null;
      if (myHook && b && this.hullDistance(ctx, b[0], b[1]) <= c.liftRange) {
        const at = this.buoyAt(ctx, b, this.a);
        const above = f.grip.y - at.y;
        if (Math.hypot(f.grip.x - at.x, f.grip.z - at.z) < 1.0 && above > -0.5 && above < 2.8 && f.gripPressed) {
          ctx.push('llAboard', myHook.id, 1);
          ctx.pulse(h, 0.6, 60);
          ctx.notify(this.aboardWords(ctx, false));
          used[h] = true;
          continue;
        }
      }
      // A fish at the rail: grip it to take it off.
      const fishLine = lines.find((l) => l.line.haul?.fish && l.fishAt.distanceTo(f.grip) < GRAB_FISH);
      if (fishLine && f.gripPressed) {
        ctx.push('llTake', fishLine.line.id, 1);
        ctx.pulse(h, 0.5, 40);
        used[h] = true;
        continue;
      }
      // On a line?
      const near = lines.find((l) => l.lead.distanceTo(f.grip) < 0.6 || this.distToSegment(f.grip, l.lead, l.water) < GRAB_LINE);
      if (near && !this.hoverWas[h]) ctx.pulse(h, 0.25, 20);
      this.hoverWas[h] = !!near;
      if (near) this.lineHover = true;
      if (near && f.gripPressed && near.line.haul?.hauler) {
        ctx.notify('The line\'s round the hauler: its valve hauls it (aft of its post)');
        used[h] = true;
        continue;
      }
      if (near && f.gripPressed) {
        if (near.line.haul?.fish) ctx.notify('A fish on the hook: take it off first');
        this.hold = { hand: h, line: near.line.id, last: f.grip.clone(), acc: 0 };
        ctx.pulse(h, 0.5, 40);
        used[h] = true;
      }
    }
    return used;
  }

  /** The hooked dan buoy follows the hook tip in (sent every 0.1 s). */
  private towHooked(ctx: LonglineHandsContext, line: Longline, dt: number): void {
    if (!ctx.rescue.holdingHook) return;
    this.towT -= dt;
    if (this.towT <= 0) {
      this.towT = 0.1;
      ctx.push('llTow', line.id, 1, [ctx.rescue.hookTip.x, ctx.rescue.hookTip.z]);
    }
    const b = line.haul ? line.buoys[line.haul.end] : null;
    if (b && this.hinted !== line.id && this.hullDistance(ctx, b[0], b[1]) <= CONFIG.longline.liftRange) {
      this.hinted = line.id;
      ctx.notify(ctx.rescue.deskBusy ? 'Dan buoy alongside: click to bring it aboard' : 'Dan buoy alongside: reach over it and grip with your other hand to bring it aboard');
    }
  }

  // ── Desktop ──

  updateDesktop(ctx: LonglineHandsContext, ray: THREE.Ray | null, dt: number): string | null {
    const hooked = this.myHooked(ctx);
    if (hooked) this.towHooked(ctx, hooked, dt);
    this.announce(ctx);
    this.lineHover = false;
    if (!ray) return null;
    if (ctx.rescue.deskBusy && !ctx.rescue.holdingRing) {
      if (hooked) {
        const b = hooked.haul ? hooked.buoys[hooked.haul.end] : null;
        return b && this.hullDistance(ctx, b[0], b[1]) <= CONFIG.longline.liftRange ? 'dan buoy alongside\nclick to bring it aboard' : 'dan buoy on the hook\nbring it alongside';
      }
      if (this.buoyOnRay(ctx, ray)) return 'longline dan buoy\nclick to hook it';
      return null;
    }
    const fish = this.fishOnRay(ctx, ray);
    if (fish) return `${fish.line.haul!.fish!.species} ${fish.line.haul!.fish!.kg.toFixed(1)} kg on the hook\nclick to take it off`;
    if (this.lineOnRay(ctx, ray)) {
      this.lineHover = true;
      return this.lineOnRay(ctx, ray)?.line.haul?.hauler ? 'longline, round the hauler\nits valve hauls it' : 'longline\nclick to haul it in';
    }
    return null;
  }

  desktopClick(ctx: LonglineHandsContext, ray: THREE.Ray | null): boolean {
    if (!ray) return false;
    if (ctx.rescue.deskBusy && !ctx.rescue.holdingRing) {
      const hooked = this.myHooked(ctx);
      if (hooked) {
        const b = hooked.haul ? hooked.buoys[hooked.haul.end] : null;
        if (b && this.hullDistance(ctx, b[0], b[1]) <= CONFIG.longline.liftRange) {
          ctx.push('llAboard', hooked.id, 1);
          ctx.stowHook();
          ctx.notify(this.aboardWords(ctx, true));
        } else ctx.notify('Bring the dan buoy alongside first');
        return true;
      }
      const hit = this.buoyOnRay(ctx, ray);
      if (hit) {
        ctx.push('llHook', hit.line.id, 1, [hit.end]);
        ctx.notify('Dan buoy hooked: bring it alongside');
        return true;
      }
      return false;
    }
    const fish = this.fishOnRay(ctx, ray);
    if (fish) {
      ctx.push('llTake', fish.line.id, 1);
      return true;
    }
    const l = this.lineOnRay(ctx, ray);
    if (l) {
      if (l.line.haul?.fish) ctx.notify('A fish on the hook: take it off first');
      else if (l.line.haul?.hauler) ctx.notify('The line\'s round the hauler: click its valve (aft of its post) for SLOW or FAST');
      else if (!this.offLine(ctx, l.line)) ctx.push('llHaul', l.line.id, CONFIG.longline.deskPull);
      return true;
    }
    return false;
  }

  private buoyOnRay(ctx: LonglineHandsContext, ray: THREE.Ray): { line: Longline; end: 0 | 1 } | null {
    let best: { line: Longline; end: 0 | 1 } | null = null;
    let bd = Infinity;
    for (const line of ctx.world.longline?.lines ?? []) {
      if (line.haul) continue;
      for (const end of [0, 1] as const) {
        const b = line.buoys[end];
        if (!b) continue;
        const c = this.buoyAt(ctx, b, this.a);
        const along = this.tmp.copy(c).sub(ray.origin).dot(ray.direction);
        if (along < 0 || along > CONFIG.rescue.hookLength + DESK_REACH) continue;
        if (ray.distanceToPoint(c) < 0.7 && along < bd) [best, bd] = [{ line, end }, along];
      }
    }
    return best;
  }

  private lineOnRay(ctx: LonglineHandsContext, ray: THREE.Ray): LineAboard | null {
    for (const l of this.linesAboard(ctx)) {
      ray.distanceSqToSegment(l.lead, l.water, this.a, this.b);
      if (this.a.distanceTo(this.b) < 0.3 && this.b.distanceTo(ray.origin) < DESK_REACH) return l;
    }
    return null;
  }

  private fishOnRay(ctx: LonglineHandsContext, ray: THREE.Ray): LineAboard | null {
    for (const l of this.linesAboard(ctx)) {
      if (!l.line.haul?.fish) continue;
      if (ray.distanceToPoint(l.fishAt) < 0.35 && l.fishAt.distanceTo(ray.origin) < DESK_REACH) return l;
    }
    return null;
  }

  busy(h: Handedness): boolean {
    return this.hold?.hand === h;
  }
}

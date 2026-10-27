import * as THREE from 'three';
import { CONFIG } from '../config';
import type { HandFrame } from '../controls/InteractionSystem';
import type { WorldState } from '../core/world';
import type { Handedness } from '../player/xrInput';
import { canRefuel } from '../vessel/vesselControl';
import { fits, nozzleWorld, stationById, stationPoint, stations, type Station } from './fuelHose';
import { hoseAt, type FuelView } from './fuelView';
import { fuelTankL } from '../vessel/fuelTank';

/**
 * Refuelling by hand (fuel/fuelHose.ts): local input only, sent as fuel intents, so the
 * crew see the same.
 *
 *   VR       grip the nozzle (on the pump, on the quay, or in a filler) to take it; it rides
 *            in your hand. Near a filler its green ring lights: let go there, or pull the
 *            trigger, and it's in. Let go by the pump's holster and it hangs up; anywhere
 *            else it's put down. START and STOP on the pump: touch with a hand and grip or
 *            pull the trigger.
 *   desktop  click the nozzle to take it (it rides in front of you); click a filler to plug
 *            it in, the pump to hang it up, anywhere else to put it down; click START / STOP.
 * A charger's cable (fuel/fuelHose.ts stations) the same way: its plug into an electric
 * boat's charging socket, and she charges at once (no START).
 */
export interface FuelHandsContext {
  world: WorldState;
  playerId: string;
  view: FuelView;
  roots: Map<string, THREE.Object3D>;
  push(control: string, ref: string, args?: number[], targetId?: string): void;
  notify(text: string): void;
  pulse(hand: Handedness, intensity: number, ms: number): void;
  /** Desktop: where the nozzle rides (in front of the eyes). */
  deskHand(out: THREE.Vector3): THREE.Vector3;
}

type Holder = Handedness | 'desk';

export class FuelHands {
  /** The nozzle we hold: its pump, which hand, where it is. */
  private hold: { port: string; by: Holder; pos: THREE.Vector3; since: number } | null = null;
  private moveT = 0;
  /** The filler the nozzle in our hand would go into (its ring lit). */
  hot: { vessel: string; side: number; pos: THREE.Vector3 } | null = null;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly f = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private hoverWas: Record<Handedness, boolean> = { left: false, right: false };

  /** The nozzle we're holding, for the view (drawn in the hand at once). */
  held(): { port: string; pos: THREE.Vector3 } | null {
    return this.hold;
  }

  busy(h: Handedness): boolean {
    return this.hold?.by === h;
  }

  // ── Where things are ──

  private nozzle(ctx: FuelHandsContext, st: Station, out: THREE.Vector3): THREE.Vector3 {
    const hose = hoseAt(ctx.world, st.id);
    if (hose.at.kind === 'filler' && ctx.view.fillerAt(ctx.roots, ctx.world, hose.at.vessel, hose.at.side, out)) return out;
    return nozzleWorld(ctx.world, hose, out);
  }

  /** The nearest filler (or, for a charger's plug, socket) to `p` within `r` (from the boats as drawn). */
  private fillerNear(ctx: FuelHandsContext, st: Station, p: THREE.Vector3, r: number): { vessel: string; side: number; pos: THREE.Vector3 } | null {
    let best: { vessel: string; side: number; pos: THREE.Vector3 } | null = null;
    let bd = r;
    for (const v of Object.values(ctx.world.vessels)) {
      if (!fits(st, v)) continue;
      for (const side of [0, 1]) {
        if (!ctx.view.fillerAt(ctx.roots, ctx.world, v.id, side, this.f)) continue;
        const d = this.f.distanceTo(p);
        if (d < bd) {
          bd = d;
          best = { vessel: v.id, side, pos: this.f.clone() };
        }
      }
    }
    return best;
  }

  /** Is the hose of this station in someone else's hand? */
  private takenByOther(ctx: FuelHandsContext, st: Station): boolean {
    const at = hoseAt(ctx.world, st.id).at;
    return at.kind === 'hand' && at.player !== ctx.playerId;
  }

  // ── Doing things ──

  private take(ctx: FuelHandsContext, st: Station, by: Holder): void {
    const wasIn = hoseAt(ctx.world, st.id).at.kind === 'filler';
    ctx.push('hoseTake', st.id);
    this.hold = { port: st.id, by, pos: this.nozzle(ctx, st, new THREE.Vector3()), since: ctx.world.time };
    if (st.kind === 'charger') ctx.notify(wasIn ? 'Unplugged: hang the plug back on the charger' : `Charging cable (${st.ratedKw} kW): take it to her charging socket, on her side deck aft of the wheelhouse`);
    else ctx.notify(wasIn ? 'Nozzle out: hang it back on the pump' : 'Fuel nozzle: take it to her filler, on her side deck aft of the wheelhouse');
  }

  /** Let go of the nozzle where it is: into a filler, onto the pump, or down on the quay. */
  private letGo(ctx: FuelHandsContext): void {
    const h = this.hold!;
    const st = stationById(h.port)!;
    if (this.hot) {
      ctx.push('hoseMove', h.port, [h.pos.x, h.pos.y, h.pos.z]);
      ctx.push('hosePlug', h.port, [this.hot.side], this.hot.vessel);
      ctx.notify(st.kind === 'charger' ? `Plugged in: charging at ${st.ratedKw} kW (SOLAR screen); take the plug out when you're done` : 'Nozzle in her filler: press START on the pump');
    } else if (stationPoint(st, st.holster, this.tmp).distanceTo(h.pos) < CONFIG.fuelHose.plug) {
      ctx.push('hoseStow', h.port);
      ctx.notify(st.kind === 'charger' ? 'Plug hung up' : 'Nozzle hung up');
    } else ctx.push('hoseDrop', h.port, [h.pos.x, h.pos.y, h.pos.z]);
    this.hold = null;
    this.hot = null;
  }

  /** START or STOP: the reason why not, if it won't. */
  private press(ctx: FuelHandsContext, st: Station, start: boolean): void {
    const at = hoseAt(ctx.world, st.id).at;
    if (!start) {
      ctx.push('pumpStop', st.id);
      return;
    }
    if (at.kind !== 'filler') return ctx.notify('Put the nozzle in her filler first (on her side deck)');
    const v = ctx.world.vessels[at.vessel];
    const tank = v && fuelTankL(v);
    if (!v || !tank) return;
    if (v.engine.fuelL >= tank - 0.5) return ctx.notify("She's full");
    if (!canRefuel(v)) return ctx.notify('Bring her alongside the fuel berth and let her settle');
    ctx.push('pumpStart', st.id);
    ctx.notify('Fuelling: STOP when you have what you want; it stops when she is full');
  }

  /** Our hold, checked against the world: dropped if the host gave the nozzle to someone else. */
  private checkHold(ctx: FuelHandsContext): void {
    if (!this.hold) return;
    const at = hoseAt(ctx.world, this.hold.port).at;
    if (ctx.world.time - this.hold.since > 1 && !(at.kind === 'hand' && at.player === ctx.playerId)) this.hold = null;
  }

  /** The nozzle in hand: where it is, the filler it would go into, sent to the host every 0.1 s. */
  private carry(ctx: FuelHandsContext, pos: THREE.Vector3, dt: number): void {
    const h = this.hold!;
    // It goes no further than the hose: held at its end (as the host keeps it).
    const st = stationById(h.port)!;
    const o = stationPoint(st, st.outlet, this.tmp2);
    const dx = pos.x - o.x;
    const dz = pos.z - o.z;
    const d = Math.hypot(dx, dz);
    const r = CONFIG.fuelHose.reach;
    h.pos.set(d <= r ? pos.x : o.x + (dx / d) * r, pos.y, d <= r ? pos.z : o.z + (dz / d) * r);
    this.hot = this.fillerNear(ctx, st, h.pos, CONFIG.fuelHose.plug);
    this.moveT -= dt;
    if (this.moveT <= 0) {
      this.moveT = 0.1;
      ctx.push('hoseMove', h.port, [h.pos.x, h.pos.y, h.pos.z]);
    }
  }

  // ── VR ──

  updateXR(ctx: FuelHandsContext, hands: Record<Handedness, HandFrame>, busy: Record<Handedness, boolean>, dt: number): Record<Handedness, boolean> {
    const used = { left: false, right: false };
    this.checkHold(ctx);
    if (this.hold && this.hold.by !== 'desk') {
      const h = this.hold.by;
      const f = hands[h];
      used[h] = true;
      const wasHot = !!this.hot;
      if (f.tracked) this.carry(ctx, f.grip, dt);
      if (this.hot && !wasHot) ctx.pulse(h, 0.4, 30);
      // Let go (or the trigger at a filler): in, hung up, or put down.
      if (!f.tracked || !f.gripDown || (f.triggerPressed && this.hot)) {
        this.letGo(ctx);
        ctx.pulse(h, 0.5, 40);
      }
      return used;
    }
    this.hot = null;
    for (const h of ['left', 'right'] as const) {
      const f = hands[h];
      if (!f.tracked || busy[h]) continue;
      // A nozzle in reach of this hand (a tick when the hand comes to one).
      const nearPort = stations().find((st) => !this.takenByOther(ctx, st) && this.nozzle(ctx, st, this.tmp).distanceTo(f.grip) < CONFIG.fuelHose.grab);
      if (nearPort && !this.hoverWas[h]) ctx.pulse(h, 0.2, 15);
      this.hoverWas[h] = !!nearPort;
      if (nearPort && f.gripPressed) {
        this.take(ctx, nearPort, h);
        ctx.pulse(h, 0.5, 40);
        used[h] = true;
        continue;
      }
      for (const st of stations()) {
        // START / STOP (a pump's).
        if ((f.gripPressed || f.triggerPressed) && st.start && st.stop) {
          for (const [start, at] of [
            [true, st.start],
            [false, st.stop],
          ] as const) {
            if (stationPoint(st, [at[0], at[1], at[2] + 0.02], this.tmp).distanceTo(f.grip) < CONFIG.fuelHose.button) {
              this.press(ctx, st, start);
              ctx.pulse(h, 0.6, 50);
              used[h] = true;
            }
          }
        }
      }
    }
    return used;
  }

  // ── Desktop ──

  /** What's under the reticle (and, holding the nozzle, carry it in front of us). */
  label(ctx: FuelHandsContext, ray: THREE.Ray | null, dt: number): string | null {
    this.checkHold(ctx);
    if (this.hold?.by === 'desk') {
      this.carry(ctx, ctx.deskHand(this.tmp), dt);
      // A filler under the reticle counts too, not only one right by the nozzle.
      const st = stationById(this.hold.port)!;
      const charger = st.kind === 'charger';
      if (!this.hot && ray) this.hot = this.fillerOnRay(ctx, st, ray);
      if (this.hot) return charger ? 'charging socket\nclick to plug in' : 'fuel filler\nclick to put the nozzle in';
      if (ray && this.onRay(ray, stationPoint(st, st.holster, this.tmp2), 0.35)) return charger ? 'charger\nclick to hang the plug up' : 'fuel pump\nclick to hang the nozzle up';
      return charger ? 'charging plug in hand\nclick to put it down' : 'fuel nozzle in hand\nclick to put it down';
    }
    if (this.hold) return null;
    this.hot = null;
    if (!ray) return null;
    for (const st of stations()) {
      if (!this.takenByOther(ctx, st) && this.onRay(ray, this.nozzle(ctx, st, this.tmp), 0.2)) {
        const isIn = hoseAt(ctx.world, st.id).at.kind === 'filler';
        if (st.kind === 'charger') return isIn ? `charging plug (in her socket)\nclick to unplug` : `charging cable, ${st.ratedKw} kW\nclick to take it`;
        return isIn ? 'fuel nozzle (in her filler)\nclick to take it out' : 'fuel nozzle\nclick to take it';
      }
      if (st.start && this.onRay(ray, stationPoint(st, st.start, this.tmp), 0.07)) return 'START\nclick to start the fuel';
      if (st.stop && this.onRay(ray, stationPoint(st, st.stop, this.tmp), 0.07)) return 'STOP\nclick to stop the fuel';
    }
    return null;
  }

  /** Desktop click: true if it was fuel work. */
  click(ctx: FuelHandsContext, ray: THREE.Ray | null): boolean {
    if (this.hold?.by === 'desk') {
      this.letGo(ctx);
      return true;
    }
    if (this.hold || !ray) return false;
    for (const st of stations()) {
      if (!this.takenByOther(ctx, st) && this.onRay(ray, this.nozzle(ctx, st, this.tmp), 0.2)) {
        this.take(ctx, st, 'desk');
        return true;
      }
      if (st.start && this.onRay(ray, stationPoint(st, st.start, this.tmp), 0.07)) {
        this.press(ctx, st, true);
        return true;
      }
      if (st.stop && this.onRay(ray, stationPoint(st, st.stop, this.tmp), 0.07)) {
        this.press(ctx, st, false);
        return true;
      }
    }
    return false;
  }

  /** Does the ray pass within `r` of `p`, within desktop reach? */
  private onRay(ray: THREE.Ray, p: THREE.Vector3, r: number): boolean {
    const along = this.s.copy(p).sub(ray.origin).dot(ray.direction);
    return along > 0 && along < CONFIG.fuelHose.desk.reach && ray.distanceSqToPoint(p) < r * r;
  }

  private fillerOnRay(ctx: FuelHandsContext, st: Station, ray: THREE.Ray): { vessel: string; side: number; pos: THREE.Vector3 } | null {
    for (const v of Object.values(ctx.world.vessels)) {
      if (!fits(st, v)) continue;
      for (const side of [0, 1]) {
        if (ctx.view.fillerAt(ctx.roots, ctx.world, v.id, side, this.f) && this.onRay(ray, this.f, 0.25)) return { vessel: v.id, side, pos: this.f.clone() };
      }
    }
    return null;
  }
}

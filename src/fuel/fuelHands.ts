import * as THREE from 'three';
import { CONFIG } from '../config';
import type { HandFrame } from '../controls/InteractionSystem';
import type { WorldState } from '../core/world';
import type { Handedness } from '../player/xrInput';
import { canRefuel } from '../vessel/vesselControl';
import type { PortDef } from '../world/archipelago';
import { fuelPorts, hasFiller, nozzleWorld, pumpPoint } from './fuelHose';
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

  private nozzle(ctx: FuelHandsContext, port: PortDef, out: THREE.Vector3): THREE.Vector3 {
    const hose = hoseAt(ctx.world, port.id);
    if (hose.at.kind === 'filler' && ctx.view.fillerAt(ctx.roots, ctx.world, hose.at.vessel, hose.at.side, out)) return out;
    return nozzleWorld(ctx.world, hose, out);
  }

  /** The nearest filler to `p` within `r` (from the boats as drawn). */
  private fillerNear(ctx: FuelHandsContext, p: THREE.Vector3, r: number): { vessel: string; side: number; pos: THREE.Vector3 } | null {
    let best: { vessel: string; side: number; pos: THREE.Vector3 } | null = null;
    let bd = r;
    for (const v of Object.values(ctx.world.vessels)) {
      if (!hasFiller(v)) continue;
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

  /** Is the hose of this port in someone else's hand? */
  private takenByOther(ctx: FuelHandsContext, port: PortDef): boolean {
    const at = hoseAt(ctx.world, port.id).at;
    return at.kind === 'hand' && at.player !== ctx.playerId;
  }

  // ── Doing things ──

  private take(ctx: FuelHandsContext, port: PortDef, by: Holder): void {
    ctx.push('hoseTake', port.id);
    this.hold = { port: port.id, by, pos: this.nozzle(ctx, port, new THREE.Vector3()), since: ctx.world.time };
    ctx.notify(hoseAt(ctx.world, port.id).at.kind === 'filler' ? 'Nozzle out: hang it back on the pump' : 'Fuel nozzle: take it to her filler, on her side deck aft of the wheelhouse');
  }

  /** Let go of the nozzle where it is: into a filler, onto the pump, or down on the quay. */
  private letGo(ctx: FuelHandsContext): void {
    const h = this.hold!;
    const port = fuelPorts().find((p) => p.id === h.port)!;
    if (this.hot) {
      ctx.push('hoseMove', h.port, [h.pos.x, h.pos.y, h.pos.z]);
      ctx.push('hosePlug', h.port, [this.hot.side], this.hot.vessel);
      ctx.notify('Nozzle in her filler: press START on the pump');
    } else if (pumpPoint(port, CONFIG.fuelHose.pump.holster, this.tmp).distanceTo(h.pos) < CONFIG.fuelHose.plug) {
      ctx.push('hoseStow', h.port);
      ctx.notify('Nozzle hung up');
    } else ctx.push('hoseDrop', h.port, [h.pos.x, h.pos.y, h.pos.z]);
    this.hold = null;
    this.hot = null;
  }

  /** START or STOP: the reason why not, if it won't. */
  private press(ctx: FuelHandsContext, port: PortDef, start: boolean): void {
    const at = hoseAt(ctx.world, port.id).at;
    if (!start) {
      ctx.push('pumpStop', port.id);
      return;
    }
    if (at.kind !== 'filler') return ctx.notify('Put the nozzle in her filler first (on her side deck)');
    const v = ctx.world.vessels[at.vessel];
    const tank = v && fuelTankL(v);
    if (!v || !tank) return;
    if (v.engine.fuelL >= tank - 0.5) return ctx.notify("She's full");
    if (!canRefuel(v)) return ctx.notify('Bring her alongside the fuel berth and let her settle');
    ctx.push('pumpStart', port.id);
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
    const port = fuelPorts().find((p) => p.id === h.port)!;
    const o = pumpPoint(port, CONFIG.fuelHose.pump.outlet, this.tmp2);
    const dx = pos.x - o.x;
    const dz = pos.z - o.z;
    const d = Math.hypot(dx, dz);
    const r = CONFIG.fuelHose.reach;
    h.pos.set(d <= r ? pos.x : o.x + (dx / d) * r, pos.y, d <= r ? pos.z : o.z + (dz / d) * r);
    this.hot = this.fillerNear(ctx, h.pos, CONFIG.fuelHose.plug);
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
      const nearPort = fuelPorts().find((port) => !this.takenByOther(ctx, port) && this.nozzle(ctx, port, this.tmp).distanceTo(f.grip) < CONFIG.fuelHose.grab);
      if (nearPort && !this.hoverWas[h]) ctx.pulse(h, 0.2, 15);
      this.hoverWas[h] = !!nearPort;
      if (nearPort && f.gripPressed) {
        this.take(ctx, nearPort, h);
        ctx.pulse(h, 0.5, 40);
        used[h] = true;
        continue;
      }
      for (const port of fuelPorts()) {
        // START / STOP.
        if (f.gripPressed || f.triggerPressed) {
          for (const [start, at] of [
            [true, CONFIG.fuelHose.pump.start],
            [false, CONFIG.fuelHose.pump.stop],
          ] as const) {
            if (pumpPoint(port, [at[0], at[1], at[2] + 0.02], this.tmp).distanceTo(f.grip) < CONFIG.fuelHose.button) {
              this.press(ctx, port, start);
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
      if (!this.hot && ray) this.hot = this.fillerOnRay(ctx, ray);
      if (this.hot) return 'fuel filler\nclick to put the nozzle in';
      const port = fuelPorts().find((p) => p.id === this.hold!.port)!;
      if (ray && this.onRay(ray, pumpPoint(port, CONFIG.fuelHose.pump.holster, this.tmp2), 0.35)) return 'fuel pump\nclick to hang the nozzle up';
      return 'fuel nozzle in hand\nclick to put it down';
    }
    if (this.hold) return null;
    this.hot = null;
    if (!ray) return null;
    for (const port of fuelPorts()) {
      if (!this.takenByOther(ctx, port) && this.onRay(ray, this.nozzle(ctx, port, this.tmp), 0.2)) {
        return hoseAt(ctx.world, port.id).at.kind === 'filler' ? 'fuel nozzle (in her filler)\nclick to take it out' : 'fuel nozzle\nclick to take it';
      }
      if (this.onRay(ray, pumpPoint(port, CONFIG.fuelHose.pump.start, this.tmp), 0.07)) return 'START\nclick to start the fuel';
      if (this.onRay(ray, pumpPoint(port, CONFIG.fuelHose.pump.stop, this.tmp), 0.07)) return 'STOP\nclick to stop the fuel';
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
    for (const port of fuelPorts()) {
      if (!this.takenByOther(ctx, port) && this.onRay(ray, this.nozzle(ctx, port, this.tmp), 0.2)) {
        this.take(ctx, port, 'desk');
        return true;
      }
      if (this.onRay(ray, pumpPoint(port, CONFIG.fuelHose.pump.start, this.tmp), 0.07)) {
        this.press(ctx, port, true);
        return true;
      }
      if (this.onRay(ray, pumpPoint(port, CONFIG.fuelHose.pump.stop, this.tmp), 0.07)) {
        this.press(ctx, port, false);
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

  private fillerOnRay(ctx: FuelHandsContext, ray: THREE.Ray): { vessel: string; side: number; pos: THREE.Vector3 } | null {
    for (const v of Object.values(ctx.world.vessels)) {
      if (!hasFiller(v)) continue;
      for (const side of [0, 1]) {
        if (ctx.view.fillerAt(ctx.roots, ctx.world, v.id, side, this.f) && this.onRay(ray, this.f, 0.25)) return { vessel: v.id, side, pos: this.f.clone() };
      }
    }
    return null;
  }
}

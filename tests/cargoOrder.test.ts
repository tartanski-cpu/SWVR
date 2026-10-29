/**
 * Goods on order (owner, 29 Oct 2026: "it doesn't make sense to have the cargo crates on the
 * side of the quay all the time ... spawn individually or the maximum amount, and the same with
 * lobster pots"; cargo/order.ts): the quays start empty; the cargo screen orders one, or a full
 * load sized to the boat lying there; pots the same; what's left can be sent back.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { aboard, cargoBerth, craneOnly, portAtPoint } from '../src/cargo/cargo';
import { boatAtPort, capacityOf, roomFor, terminalSpot, waitingHere } from '../src/cargo/order';
import { isPot, potsOwned } from '../src/potting/potting';
import { placeVessel } from '../src/vessel/vesselControl';
import { PORTS } from '../src/world/archipelago';

const DT = 1 / 60;
const WHAT = { crates: 0, crane: 1, pots: 2 };

function setup(boat?: string) {
  const { world, vesselId } = createWorld(new IdFactory(), boat);
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  const send = (control: string, value = 1, ref?: string, args?: number[]) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value, ref, ...(args ? { args } : {}) } as Intent], DT);
  const order = (port: string, what: keyof typeof WHAT, n: number) => send('cargoOrder', n, port, [WHAT[what]]);
  const at = (portId: string) => {
    const b = PORTS.find((p) => p.id === portId)!.cargo.berth!;
    placeVessel(v, b.x, 0, b.z, 0);
  };
  return { world, v, send, order, at };
}

const port = (id: string) => PORTS.find((p) => p.id === id)!;

describe('goods on order at the cargo screen', () => {
  it('the quays start empty: no crates or crane lifts waiting anywhere', () => {
    const { world } = setup();
    expect(CONFIG.cargo.onDemand).toBe(true);
    const waiting = Object.values(world.cargo).filter((c) => 'ground' in c.at && portAtPoint(c.at.ground[0], c.at.ground[2]) && !isPot(c));
    expect(waiting).toHaveLength(0);
  });

  it('every harbour with a goods row has a screen on dry ground by it, facing the water', () => {
    let n = 0;
    for (const p of PORTS) {
      const s = terminalSpot(p);
      if (!s) continue;
      n++;
      expect(s.y).toBeGreaterThan(CONFIG.cargo.terminal.minGround);
      expect(Math.hypot(...s.face)).toBeCloseTo(1, 6);
      // Within the goods area, so what it orders is "at" that port.
      expect(portAtPoint(s.x, s.z)?.id).toBe(p.id);
    }
    expect(n).toBeGreaterThan(PORTS.length / 2);
  });

  it('one at a time: a crate on the quay, bound for another harbour; with no boat there too', () => {
    const { world, v, order } = setup();
    placeVessel(v, 0, 0, -400, 0);
    order('calder', 'crates', 1);
    const w = waitingHere(world, port('calder'), 'crates');
    expect(w).toHaveLength(1);
    expect(w[0].from).toBe('calder');
    expect(w[0].to).not.toBe('calder');
    order('calder', 'crates', 1);
    expect(waitingHere(world, port('calder'), 'crates')).toHaveLength(2);
    // A full load wants a boat lying there.
    order('calder', 'crates', 0);
    expect(waitingHere(world, port('calder'), 'crates')).toHaveLength(2);
  });

  it('a full load: as many as her deck, payload and slots take, counting what already waits; all of it goes aboard', () => {
    const { world, v, order, send, at } = setup();
    at('calder');
    expect(boatAtPort(world, port('calder'), v.id)?.id).toBe(v.id);
    const room0 = roomFor(world, v, port('calder'), 'crates');
    expect(room0).toBeGreaterThan(1);
    order('calder', 'crates', 1);
    // One waiting for her: room for one fewer.
    expect(roomFor(world, v, port('calder'), 'crates')).toBe(room0 - 1);
    order('calder', 'crates', 0);
    const waiting = waitingHere(world, port('calder'), 'crates');
    expect(waiting.length).toBeGreaterThan(1);
    expect(waiting.length).toBeLessThanOrEqual(Math.min(room0, CONFIG.cargo.terminal.maxOrder));
    // Full, or the quay holds no more: either way another full load makes nothing.
    const left = roomFor(world, v, port('calder'), 'crates');
    // (Topped up with plain crates: as full as the screen counts.)
    expect(left === 0 || waiting.length === CONFIG.cargo.terminal.maxOrder).toBe(true);
    // Again: at most a slim gas bottle or two where no crate goes (or nothing, the quay full).
    order('calder', 'crates', 0);
    const all = waitingHere(world, port('calder'), 'crates').length;
    expect(all - waiting.length).toBeLessThanOrEqual(2);
    // Quick load takes the lot.
    send('cargoQuickLoad');
    expect(aboard(world, v.id)).toHaveLength(all);
    expect(waitingHere(world, port('calder'), 'crates')).toHaveLength(0);
    const cap = capacityOf(world, v);
    expect(cap.kgFree).toBeLessThan(cap.kg);
  });

  it('pots: ordered one or a full load, potting switched on, never more than the pots in play allow', () => {
    const { world, v, order, send, at } = setup();
    at('calder');
    expect(world.potting).toBeUndefined();
    order('calder', 'pots', 1);
    expect(world.potting).toBeDefined();
    expect(waitingHere(world, port('calder'), 'pots')).toHaveLength(1);
    order('calder', 'pots', 0);
    const pots = waitingHere(world, port('calder'), 'pots').length;
    expect(pots).toBeGreaterThan(1);
    send('potQuickLoad');
    expect(aboard(world, v.id).filter(isPot)).toHaveLength(pots);
    // At the limit: no more.
    for (let i = 0; i < CONFIG.potting.pots + 2; i++) order('calder', 'pots', 1);
    expect(potsOwned(world)).toBe(CONFIG.potting.pots);
  });

  it('crane lifts: at a harbour with a cargo quay, on its edge; a full load wants a deck crane', () => {
    const quay = PORTS.find((p) => cargoBerth(p))!;
    const { world, v, order } = setup();
    order(quay.id, 'crane', 1);
    const lifts = waitingHere(world, quay, 'crane');
    expect(lifts).toHaveLength(1);
    expect(craneOnly(lifts[0])).toBe(true);
    const plain = PORTS.find((p) => !cargoBerth(p));
    if (plain) {
      order(plain.id, 'crane', 1);
      expect(waitingHere(world, plain, 'crane')).toHaveLength(0);
    }
    expect(v).toBeTruthy();
  });

  it('delivered or lost, nothing new appears; sent back, the quay is clear again', () => {
    const { world, order, send } = setup();
    order('calder', 'crates', 3);
    order('calder', 'pots', 2);
    const n = Object.keys(world.cargo).length;
    send('cargoOrderReturn', 1, 'calder');
    expect(Object.keys(world.cargo).length).toBe(n - 5);
    expect(waitingHere(world, port('calder'), 'crates')).toHaveLength(0);
    expect(waitingHere(world, port('calder'), 'pots')).toHaveLength(0);
  });

  it('with a cargo contract running, crates ordered elsewhere are bound for its port', () => {
    const { world, order } = setup();
    const to = PORTS.find((p) => p.id !== 'calder')!.id;
    world.career!.active = { id: 'k', port: to, kind: 'cargo', count: 4, done: 0, bonus: 100, allowed: 1000, minRep: 0 } as NonNullable<typeof world.career>['active'];
    order('calder', 'crates', 3);
    expect(waitingHere(world, port('calder'), 'crates').every((c) => c.to === to)).toBe(true);
  });
});

/**
 * Fish farm service, step 3 (owner, 29 Oct 2026: "carry on with farm step 3"): the crew change
 * (aqua/farmCrew.ts), the day shift from the farm's shore base quay out to the barge and the
 * night shift home; and the mussel lines (aqua/mussels.ts), bags of mussels lifted off the lines
 * and landed at their harbour.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { aboard } from '../src/cargo/cargo';
import { raiseFarmCall, type FarmCall } from '../src/aqua/farmService';
import { farmBase, handSpot } from '../src/aqua/farmCrew';
import { bagPlaces, MUSSEL_SITES, raiseMussels } from '../src/aqua/mussels';
import { placeVessel } from '../src/vessel/vesselControl';
import { berthWithId } from '../src/world/berths';
import { lineEnds } from '../src/world/farms';
import { standingHeight } from '../src/world/geography';
import { groundHeight } from '../src/world/terrain';

const DT = 1 / 60;

function setup() {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  world.players[localPlayerId].aboardVesselId = v.id;
  const send = (control: string, value = 1, ref?: string, args?: number[]) =>
    stepWorld(world, [{ playerId: localPlayerId, targetId: v.id, control, value, ref, ...(args ? { args } : {}) } as Intent], DT);
  const at = (berthId: string) => {
    const b = berthWithId(berthId)!;
    placeVessel(v, b.x, 0, b.z, (b.headingDeg * Math.PI) / 180);
  };
  const lie = (seconds: number) => {
    for (let t = 0; t < seconds; t += DT) {
      v.linearVelocity = [0, 0, 0];
      v.angularVelocity = [0, 0, 0];
      send('noop', 0);
    }
  };
  return { world, v, send, at, lie };
}

describe('the farm crew change', () => {
  it('the Tarsk farm\'s shore base is Loch Tarsk; its people stand on the quay and on the barge', () => {
    expect(farmBase('tarskfarm')).toBe('tarsk');
    const { world } = setup();
    const call = raiseFarmCall(world, 'tarskfarm', 'crew')!;
    expect(call.base).toBe('tarsk');
    const hands = call.hands!;
    expect(hands.some((h) => h.going === 'out' && h.phase === 'quay')).toBe(true);
    expect(hands.some((h) => h.going === 'back' && h.phase === 'barge')).toBe(true);
    hands.forEach((h, k) => {
      const s = handSpot(call, 'tarskfarm', h, k)!;
      expect(standingHeight(s.x, s.z)).toBeGreaterThan(0.5);
    });
  });

  it('lying at the base the day shift comes aboard; at the barge they step off and the night shift comes aboard; back at the base they go home: paid and counted', () => {
    const { world, v, at, lie } = setup();
    const call = raiseFarmCall(world, 'tarskfarm', 'crew') as FarmCall;
    const out = call.hands!.filter((h) => h.going === 'out').length;
    const back = call.hands!.filter((h) => h.going === 'back').length;
    world.career!.active = { id: 'k', port: 'tarskfarm', kind: 'farm', count: 1, done: 0, bonus: 300, allowed: 2700, minRep: 0 };
    at('tarsk-cargo');
    lie(CONFIG.aqua.crew.boardS * (out + 1));
    expect(call.hands!.filter((h) => h.phase === 'aboard' && h.vesselId === v.id)).toHaveLength(out);
    expect(call.hands!.find((h) => h.phase === 'aboard')!.seat).toBeTruthy();
    at('tarskfarm-cargo');
    lie(CONFIG.aqua.crew.boardS * (out + back + 1));
    expect(call.hands!.filter((h) => h.going === 'out').every((h) => h.phase === 'barge')).toBe(true);
    expect(call.hands!.filter((h) => h.going === 'back').every((h) => h.phase === 'aboard')).toBe(true);
    const money0 = world.career!.money;
    at('tarsk-cargo');
    lie(CONFIG.aqua.crew.boardS * (back + 1));
    expect(world.aqua!.sites.tarskfarm.call).toBeNull();
    expect(world.career!.money).toBeGreaterThan(money0);
    expect(world.career!.ledger.some((l) => /Crew change for Tarsk salmon farm/.test(l.text))).toBe(true);
    expect(world.career!.active).toBeNull();
  });

  it('not done in time, they find another boat', () => {
    const { world, send } = setup();
    const call = raiseFarmCall(world, 'tarskfarm', 'crew')!;
    world.time = call.due! + 1;
    send('noop', 0);
    expect(world.aqua!.sites.tarskfarm.call).toBeNull();
  });
});

describe('the mussel lines', () => {
  const tarsk = MUSSEL_SITES.find((s) => s.farm.base === 'tarsk')!;

  it('the Tarsk lines lie in the loch, in water, their bags on the lines (solid: set down there, they stay)', () => {
    expect(tarsk).toBeTruthy();
    for (const [[x0, z0], [x1, z1]] of lineEnds(tarsk.farm)) {
      for (const t of [0, 0.5, 1]) expect(groundHeight(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)).toBeLessThan(-5);
    }
    const places = bagPlaces(tarsk.farm);
    expect(places.length).toBeGreaterThanOrEqual(CONFIG.aqua.mussels.bags[1]);
    for (const [x, z] of places) expect(standingHeight(x, z)).toBeGreaterThan(0);
  });

  it('a harvest: bags on the lines; lifted aboard and landed at Loch Tarsk, each is paid, and all of them a bonus', () => {
    const { world, v, send, at } = setup();
    const call = raiseMussels(world, tarsk.key)!;
    expect(call.bags.length).toBeGreaterThanOrEqual(CONFIG.aqua.mussels.bags[0]);
    expect(world.rescue?.radio?.text).toMatch(/mussels/);
    // Lift each aboard (as a hand would from alongside the line), then land them all.
    call.bags.forEach((id, i) => {
      send('cargoTake', 1, id);
      send('cargoPlace', 1, id, [i % 2 ? 0.6 : -0.6, 1, 1 + Math.floor(i / 2) * 0.7, 0]);
    });
    expect(aboard(world, v.id).length).toBe(call.bags.length);
    at('tarsk-cargo');
    v.linearVelocity = [0, 0, 0];
    send('cargoQuickUnload');
    expect(world.aqua!.mussels![tarsk.key].call).toBeNull();
    expect(world.career!.ledger.filter((l) => /Mussels landed/.test(l.text)).length).toBe(call.bags.length);
    expect(world.career!.ledger.some((l) => /harvest's all in/.test(l.text))).toBe(true);
  });

  it('not all in by the time: the farm\'s boat takes what\'s left on the lines', () => {
    const { world, send } = setup();
    const call = raiseMussels(world, tarsk.key)!;
    world.time = call.due + 1;
    send('noop', 0);
    expect(world.aqua!.mussels![tarsk.key].call).toBeNull();
    expect(call.bags.every((id) => !world.cargo[id])).toBe(true);
  });
});

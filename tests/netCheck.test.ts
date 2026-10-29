/**
 * Fish farm service, milestone 2 (owner, 29 Oct 2026: "carry on with farm step 2"; aqua/netCheck.ts):
 * the net check. Hold her alongside each cage ring and it's checked (crew aboard checks quicker);
 * a torn net is found on its ring and mended with a net patch from the barge; a bag of morts on a
 * ring is landed on the barge; all of it done pays a bonus and counts toward a farm contract.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { GROUND } from '../src/cargo/cargo';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { aboard, kindOf } from '../src/cargo/cargo';
import { waitingHere } from '../src/cargo/order';
import { farmAt, raiseFarmCall } from '../src/aqua/farmService';
import { checkDone, ringPoint } from '../src/aqua/netCheck';
import { placeVessel } from '../src/vessel/vesselControl';
import { PORTS } from '../src/world/archipelago';
import { ringCentres } from '../src/world/farms';
import { standingHeight } from '../src/world/geography';
import { berthWithId } from '../src/world/berths';
import type { FarmCall } from '../src/aqua/farmService';

const DT = 1 / 60;
const farmPort = PORTS.find((p) => p.id === 'tarskfarm')!;
const farm = farmAt('tarskfarm')!.farm;

function setup() {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  world.players[localPlayerId].aboardVesselId = v.id;
  const send = (control: string, value = 1, ref?: string, args?: number[], target = v.id) =>
    stepWorld(world, [{ playerId: localPlayerId, targetId: target, control, value, ref, ...(args ? { args } : {}) } as Intent], DT);
  // Her side against a ring, on its outward diagonal (where its bag and flag are), lying across it, stopped.
  const alongside = (ring: number) => {
    const [cx, cz] = ringCentres(farm)[ring];
    const [px, pz] = ringPoint(farm, ring);
    const d = Math.hypot(px - cx, pz - cz);
    const [ox, oz] = [(px - cx) / d, (pz - cz) / d];
    placeVessel(v, cx + ox * (farm.ringRadius + 3.2), 0, cz + oz * (farm.ringRadius + 3.2), Math.atan2(-oz, ox));
  };
  const hold = (seconds: number) => {
    for (let t = 0; t < seconds; t += DT) {
      v.linearVelocity = [0, 0, 0];
      v.angularVelocity = [0, 0, 0];
      send('noop', 0);
    }
  };
  const call = () => world.aqua!.sites.tarskfarm.call as FarmCall;
  const raise = () => {
    raiseFarmCall(world, 'tarskfarm', 'check');
    return call();
  };
  const atBerth = () => {
    const b = berthWithId('tarskfarm-cargo')!;
    placeVessel(v, b.x, 0, b.z, (b.headingDeg * Math.PI) / 180);
    v.linearVelocity = [0, 0, 0];
  };
  return { world, v, send, alongside, hold, call, raise, atBerth, me: localPlayerId };
}

describe('the net check', () => {
  it('a ring\'s bag and flag are on its outer pipe, over solid ring (set down there, it stays)', () => {
    ringCentres(farm).forEach(([cx, cz], i) => {
      const [x, z] = ringPoint(farm, i);
      expect(Math.hypot(x - cx, z - cz)).toBeCloseTo(farm.ringRadius + CONFIG.aqua.check.onRingOut, 6);
      expect(standingHeight(x, z)).toBeGreaterThan(0);
    });
  });

  it('held alongside a ring for its time, barely moving, the ring is checked and paid; crew aboard checks quicker', () => {
    const { world, alongside, hold, raise, call } = setup();
    raise();
    expect(call().checked).toHaveLength(ringCentres(farm).length);
    const money0 = world.career!.money;
    alongside(0);
    hold(CONFIG.aqua.check.holdS * 0.6);
    expect(call().checked![0]).toBe(false);
    hold(CONFIG.aqua.check.holdS * 0.5);
    expect(call().checked![0]).toBe(true);
    expect(world.career!.money).toBeGreaterThan(money0);
    // A second hand aboard: 1.5 times the pace, so the next ring takes two thirds of the time.
    world.players.mate = { ...world.players[Object.keys(world.players)[0]], id: 'mate' };
    alongside(1);
    hold((CONFIG.aqua.check.holdS / (1 + CONFIG.aqua.check.crewRate)) * 1.05);
    expect(call().checked![1]).toBe(true);
  });

  it('a torn net is found when its ring is checked; a net patch from the barge set on the ring by its flag mends it', () => {
    const { world, v, send, alongside, hold, raise, call, atBerth } = setup();
    raise();
    call().hole = { ring: 2, found: false, mended: false };
    alongside(2);
    hold(CONFIG.aqua.check.holdS * 1.1);
    expect(call().hole!.found).toBe(true);
    expect(world.rescue?.radio?.text).toMatch(/hole in the net on cage 3/);
    // At the barge, Crates are net patches.
    atBerth();
    send('cargoOrder', 1, 'tarskfarm', [0]);
    const patch = waitingHere(world, farmPort, 'crates')[0];
    expect(kindOf(patch).name).toBe('Net patch');
    send('cargoQuickLoad');
    expect(aboard(world, v.id).map((c) => c.id)).toContain(patch.id);
    // Back alongside cage 3: take the patch off the deck and set it on the ring by the flag.
    alongside(2);
    send('cargoLash', 0, patch.id); // (quick loading lashed it down)
    send('cargoTake', 1, patch.id);
    const [x, z] = ringPoint(farm, 2);
    send('cargoPlace', 1, patch.id, [x + 0.5, CONFIG.aqua.check.ringTop, z - 0.4, 0], GROUND);
    expect(call().hole!.mended).toBe(true);
    expect(world.cargo[patch.id]).toBeUndefined();
    expect(world.career!.ledger[0].text).toMatch(/Net mended/);
  });

  it('the bag of morts on a ring, lifted aboard and landed on the barge, is paid; with every ring checked the check is done, paid and counted toward a farm contract', () => {
    const { world, v, send, alongside, hold, raise, atBerth } = setup();
    const c = raise();
    delete c.hole;
    if (!c.mort) {
      // (This call drew no morts: put a bag on cage 1 as the farm would.)
      const kind = CONFIG.cargo.kinds.findIndex((k) => k.name === 'Mort bag');
      const [x, z] = ringPoint(farm, 0);
      world.cargo.m1 = { id: 'm1', kind, mass: 70, from: 'tarskfarm', to: 'tarskfarm', at: { ground: [x, CONFIG.aqua.check.ringTop, z], yaw: 0 } };
      c.mort = { ring: 0, id: 'm1', landed: false };
    }
    const mort = world.cargo[c.mort.id];
    // A farm contract running at the barge: one call seen through.
    world.career!.active = { id: 'k', port: 'tarskfarm', kind: 'farm', count: 1, done: 0, bonus: 300, allowed: 2700, minRep: 0 };
    alongside(c.mort.ring);
    send('cargoTake', 1, mort.id);
    expect('carriedBy' in mort.at).toBe(true);
    send('cargoPlace', 1, mort.id, [0, 1, 1.5, 0]);
    expect('vessel' in mort.at).toBe(true);
    // Every ring checked but one; that one held.
    c.checked = c.checked!.map((_, i) => i !== 5);
    alongside(5);
    hold(CONFIG.aqua.check.holdS * 1.1);
    expect(c.checked![5]).toBe(true);
    expect(checkDone(c)).toBe(false); // the morts are still aboard
    atBerth();
    send('cargoQuickUnload');
    expect(c.mort.landed).toBe(true);
    expect(world.aqua!.sites.tarskfarm.call).toBeNull();
    expect(world.career!.ledger.some((l) => /Morts brought in/.test(l.text))).toBe(true);
    expect(world.career!.ledger.some((l) => /Net check done/.test(l.text))).toBe(true);
    expect(world.career!.active).toBeNull();
    expect(world.career!.ledger.some((l) => /Contract done/.test(l.text))).toBe(true);
    expect(aboard(world, v.id)).toHaveLength(0);
  });

  it('not done in time, the farm\'s own crew see to it: the call goes, and its morts with it', () => {
    const { world, send, raise, call } = setup();
    raise();
    const id = call().mort?.id;
    world.time = call().due! + 1;
    send('noop', 0);
    expect(world.aqua!.sites.tarskfarm.call).toBeNull();
    if (id) expect(world.cargo[id]).toBeUndefined();
  });

  it('the feed barge offers only farm service contracts', () => {
    const { world } = setup();
    world.career!.offersAt = -1;
    world.time = 1;
    stepWorld(world, [], DT);
    const offers = world.career!.offers.filter((o) => o.port === 'tarskfarm');
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((o) => o.kind === 'farm')).toBe(true);
    expect(world.career!.offers.filter((o) => o.port === 'calder').every((o) => o.kind !== 'farm')).toBe(true);
  });
});

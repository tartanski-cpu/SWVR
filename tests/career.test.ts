import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { GROUND, stackPoint, type CargoItem } from '../src/cargo/cargo';
import { buyBlocker, hasUpgrade, money, officeAt, parseCareer, repOf, serializeCareer } from '../src/career/career';
import { placeVessel } from '../src/vessel/vesselControl';
import { fuelTankL } from '../src/vessel/fuelTank';
import { gearOf } from '../src/boats/sims';
import { engineAlarms } from '../src/vessel/physics/engineThermal';
import { PORTS } from '../src/world/archipelago';

const DT = 1 / 60;

function setup() {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  const send = (control: string, value = 1, ref?: string, targetId: string = v.id, args?: number[]) =>
    stepWorld(world, [{ playerId: localPlayerId, targetId, control, value, ref, args } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  /** Carry a cargo item from `from` to `to` and set it down at the destination's stack. */
  const deliver = (from: string, to: string, n = 1) => {
    for (let i = 0; i < n; i++) {
      const id = `test-${from}-${to}-${i}-${world.tick}`;
      const item: CargoItem = { id, kind: 0, mass: 40, from, to, at: { carriedBy: localPlayerId } };
      world.cargo[id] = item;
      const [x, y, z] = stackPoint(PORTS.find((p) => p.id === to)!, 0);
      send('cargoPlace', 1, id, GROUND, [x, y, z, 0]);
    }
  };
  return { world, v, send, run, deliver, localPlayerId };
}

describe('career', { timeout: 30000 }, () => {
  it('cargo pays by distance and builds reputation at its port, which raises the pay there', () => {
    const { world, deliver } = setup();
    const c = world.career!;
    const start = c.money;
    deliver('calder', 'brannock');
    const first = c.money - start;
    const a = PORTS.find((p) => p.id === 'calder')!;
    const b = PORTS.find((p) => p.id === 'brannock')!;
    const km = Math.hypot(a.x - b.x, a.z - b.z) / 1000;
    expect(first).toBe(Math.round(CONFIG.career.pay.cargoBase + CONFIG.career.pay.cargoPerKm * km));
    expect(repOf(c, 'brannock')).toBe(CONFIG.career.rep.cargo);
    expect(c.ledger[0].text).toMatch(/Calder Haven → Brannock Pier/);
    c.rep.brannock = 100;
    const before = c.money;
    deliver('calder', 'brannock');
    expect(Math.abs(c.money - before - first * (1 + CONFIG.career.repPayBonus))).toBeLessThanOrEqual(1);
  });

  it('fuel taken at the berth is billed when the hose comes off; a can of oil costs; lost cargo costs', () => {
    const { world, v, send, run } = setup();
    const c = world.career!;
    send('teleportToPort', 1, 'calder');
    // Lie at the fuel berth.
    const berth = { x: 708.5, z: 625 };
    placeVessel(v, berth.x, 0, berth.z, 0);
    run(1);
    v.engine.fuelL = 300;
    const m0 = c.money;
    send('refuel', 1);
    run(10);
    send('refuel', 0);
    run(0.1);
    const taken = c.ledger.find((e) => e.text.startsWith('Fuel'));
    expect(taken).toBeDefined();
    expect(c.money).toBeLessThan(m0);
    expect(Math.abs(taken!.amount)).toBeCloseTo(Math.round(parseInt(taken!.text.match(/(\d+) L/)![1], 10) * CONFIG.career.costs.fuelPerL), -1);
    v.engine.oil = 0.3;
    run(0.1);
    const m1 = c.money;
    send('oilTopUp');
    run(0.1);
    expect(m1 - c.money).toBe(CONFIG.career.costs.oil);
    // Cargo from a port's stock dropped in the sea.
    const m2 = c.money;
    const id = 'lost-1';
    world.cargo[id] = { id, kind: 0, mass: 40, from: 'selkie', to: 'calder', at: { carriedBy: Object.keys(world.players)[0] } };
    send('cargoPlace', 1, id, GROUND, [0, -5, -300, 0]);
    expect(m2 - c.money).toBe(CONFIG.career.costs.lostCargo);
  });

  it('a contract: taken at its port, done by the work it asks for, paid a bonus; one too late is failed', () => {
    const { world, send, run, deliver } = setup();
    const c = world.career!;
    run(0.1);
    expect(c.offers.length).toBe(PORTS.length * CONFIG.career.contracts.perPort);
    // A cargo contract for Brannock (made up, tier 0).
    const k = { id: 'kx', port: 'brannock', kind: 'cargo' as const, count: 2, done: 0, bonus: 180, allowed: 900, minRep: 0 };
    c.offers.push(k);
    send('careerAccept', 1, 'kx', 'env');
    expect(c.active).toBeNull(); // not at Brannock
    send('teleportToPort', 1, 'brannock');
    run(0.5);
    expect(officeAt(world)).toBe('brannock');
    send('careerAccept', 1, 'kx', 'env');
    expect(c.active?.id).toBe('kx');
    deliver('calder', 'selkie'); // not for Brannock: doesn't count
    expect(c.active?.done).toBe(0);
    deliver('calder', 'brannock', 2);
    expect(c.active).toBeNull();
    expect(c.contractsDone).toBe(1);
    expect(c.ledger.some((e) => e.text.startsWith('Contract done') && e.amount === 180)).toBe(true);
    // Another, left too long.
    c.offers.push({ ...k, id: 'ky', allowed: 2 });
    send('careerAccept', 1, 'ky', 'env');
    const rep = repOf(c, 'brannock');
    run(3);
    expect(c.active).toBeNull();
    expect(repOf(c, 'brannock')).toBe(rep + CONFIG.career.rep.contractFail);
  });

  it('upgrades: in port, with the money and the reputation; then they work', () => {
    const { world, send, run } = setup();
    const c = world.career!;
    expect(buyBlocker(world, 'radar')).toBe('Bring her into a boatyard');
    send('teleportToPort', 1, 'brannock');
    run(0.5);
    expect(buyBlocker(world, 'radar')).toBe('Bring her into a boatyard'); // no yard at the pier
    send('teleportToPort', 1, 'calder');
    run(0.5);
    // The radar is fitted at Loch Tarsk's yard only (regions); the ice machine at either.
    expect(buyBlocker(world, 'radar')).toBe('Fitted at Loch Tarsk');
    send('teleportToPort', 1, 'tarsk');
    run(0.5);
    expect(buyBlocker(world, 'radar')).toMatch(/reputation/);
    expect(buyBlocker(world, 'ice')).toBe('Not enough money');
    send('careerDebugCash', 1, undefined, 'env');
    expect(buyBlocker(world, 'radar')).toBeNull();
    const m = c.money;
    send('careerBuy', 1, 'radar', 'env');
    expect(hasUpgrade(world, 'radar')).toBe(true);
    expect(m - c.money).toBe(CONFIG.career.upgrades.find((u) => u.id === 'radar')!.price);
    expect(buyBlocker(world, 'radar')).toBe('Fitted');
    // Iced fish fetch more.
    send('careerBuy', 1, 'ice', 'env');
    expect(hasUpgrade(world, 'ice')).toBe(true);
  });

  it('the bigger fuel tank: 60 % more fuel to the gauge, the fill and the low-fuel lamp; AIS puts ships on the plotter', () => {
    const { world, v, send, run } = setup();
    const base = fuelTankL(v);
    expect(base).toBe(gearOf(v, 'diesel')!.engine.fuel.tankL);
    send('teleportToPort', 1, 'calder');
    run(0.5);
    send('careerDebugCash', 1, undefined, 'env');
    send('careerBuy', 1, 'bigTank', 'env');
    run(0.1);
    expect(fuelTankL(v)).toBe(Math.round(base * CONFIG.career.bigTankFactor));
    send('debugFuel', 10000);
    expect(v.engine.fuelL).toBe(fuelTankL(v)); // filled to the new size
    expect(engineAlarms(v, gearOf(v, 'diesel')!).lowFuel).toBe(false);
    // AIS: a passing ship drawn on the plotter only with the receiver.
    expect(buyBlocker(world, 'ais')).toBeNull();
    send('careerBuy', 1, 'ais', 'env');
    expect(hasUpgrade(world, 'ais')).toBe(true);
  });

  it('money reads like money (thousands, minus, rounding)', () => {
    expect(money(1234567)).toBe('£1,234,567');
    expect(money(-80)).toBe('-£80');
    expect(money(999.6)).toBe('£1,000');
    expect(money(0)).toBe('£0');
  });

  it('saved and loaded: money, ledger, reputation, upgrades (junk is ignored)', () => {
    const { world, deliver } = setup();
    deliver('calder', 'selkie');
    world.career!.upgrades.push('ice');
    const back = parseCareer(serializeCareer(world.career!))!;
    expect(back.money).toBe(world.career!.money);
    expect(back.rep.selkie).toBe(CONFIG.career.rep.cargo);
    expect(back.upgrades).toEqual(['ice']);
    expect(back.ledger[0].text).toMatch(/Selkie/);
    expect(parseCareer('{"money":"lots"}')).toBeNull();
    expect(parseCareer('not json')).toBeNull();
  });
});

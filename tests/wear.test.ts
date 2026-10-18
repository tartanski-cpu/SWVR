import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { parseCareer, repairBlocker, repairCost, serializeCareer } from '../src/career/career';
import { stepWear, wearRackCap } from '../src/vessel/wear';
import { placeVessel } from '../src/vessel/vesselControl';
import { BERTHS, FISHING_GROUNDS } from '../src/world/archipelago';

const DT = 1 / 60;

function setup() {
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  const send = (control: string, value = 1, ref?: string, targetId: string = v.id) =>
    stepWorld(world, [{ playerId: 'player-1', targetId, control, value, ref } as Intent], DT);
  const run = (s: number, each?: () => void) => {
    for (let i = 0; i < s / DT; i++) {
      stepWorld(world, [], DT);
      each?.();
    }
  };
  return { world, v, send, run };
}

describe('damage and wear (phase 2)', { timeout: 60000 }, () => {
  it('routine work does no damage: the start, going to a berth, docking', () => {
    const { v, send, run } = setup();
    run(10); // the start (she settles from her drop)
    send('teleportToPort', 1, 'calder');
    run(2);
    send('dock');
    run(20);
    expect(v.mooring.phase).toBe('moored');
    expect(v.damage).toBe(0);
  });

  it('ramming the quay at 3 m/s holes her; she leaks, and the water is weight', () => {
    const { world, v, run } = setup();
    const berth = BERTHS.find((b) => b.id === 'calder-cargo')!;
    // Head-on to the quay face (east), 12 m off, at 3 m/s.
    placeVessel(v, berth.x - 14, 0, berth.z, 90);
    run(1);
    v.linearVelocity = [3, 0, 0];
    run(6);
    expect(v.damage!).toBeGreaterThan(0.05);
    expect(v.damage!).toBeLessThan(0.8);
    // It leaks (pump off).
    v.electrics!.breakers.bilge = 0;
    const b0 = v.bilge!;
    run(10);
    expect(v.bilge!).toBeGreaterThan(b0);
    // A full bilge: she sits deeper (3 t of water low in her).
    placeVessel(v, 0, 0, -600, 0);
    v.bilge = 0;
    v.damage = 0;
    run(15);
    const dry = v.position[1];
    v.bilge = 1;
    run(15);
    expect(dry - v.position[1]).toBeGreaterThan(0.08);
    void world;
  });

  it('impacts and grinding by the numbers; a hot or dry engine wears and loses power', () => {
    const { v } = setup();
    v.damage = 0;
    v.contact = { force: 0, slide: 0, impact: 2 };
    stepWear(v, DT);
    expect(v.damage).toBeCloseTo((2 - CONFIG.wear.impactSafe) ** 2 * CONFIG.wear.impactDamage, 6);
    v.contact = { force: 0, slide: 0, impact: 0.8 }; // docking speed: nothing
    stepWear(v, DT);
    expect(v.damage).toBeCloseTo((2 - CONFIG.wear.impactSafe) ** 2 * CONFIG.wear.impactDamage, 6);
    v.engine.phase = 'running';
    v.engine.coolantC = 110;
    v.engine.wear = 0;
    for (let i = 0; i < 60 * 60; i++) stepWear(v, DT);
    expect(v.engine.wear!).toBeCloseTo(60 * (110 - CONFIG.wear.hotC) * CONFIG.wear.hotWear, 3);
    expect(wearRackCap(v)).toBeLessThan(1);
    v.engine.coolantC = 85;
    v.engine.oil = 0.05;
    const w0 = v.engine.wear!;
    stepWear(v, 1);
    expect(v.engine.wear! - w0).toBeCloseTo(CONFIG.wear.dryWear, 6);
  });

  it('repaired in port for money (the engine stopped for an overhaul); condition is saved with the career', () => {
    const { world, v, send, run } = setup();
    v.damage = 0.25;
    v.engine.wear = 0.2;
    v.bilge = 0.5;
    expect(repairBlocker(world, 'hull')).toBe('Bring her into Calder Haven');
    // The boatyard is at Calder Haven: not at Brannock.
    send('teleportToPort', 1, 'brannock');
    run(1);
    expect(repairBlocker(world, 'hull')).toBe('Bring her into Calder Haven');
    send('teleportToPort', 1, 'calder');
    run(1);
    const cost = repairCost(world, 'hull');
    expect(cost).toBe(25 * CONFIG.career.repairs.hullPerPercent);
    const m = world.career!.money;
    send('careerRepair', 1, 'hull', 'env');
    expect(v.damage).toBe(0);
    expect(v.bilge).toBe(0);
    expect(m - world.career!.money).toBe(cost);
    v.engine.phase = 'running';
    expect(repairBlocker(world, 'engine')).toMatch(/Stop the engine/);
    v.engine.phase = 'off';
    send('careerRepair', 1, 'engine', 'env');
    expect(v.engine.wear).toBe(0);
    // Kept with the career.
    v.damage = 0.4;
    run(0.1);
    expect(parseCareer(serializeCareer(world.career!))!.boat?.damage).toBeCloseTo(0.4, 2);
  });

  it('heavy weather: no fishing in a big sea; rescues, tows and fires pay danger money', async () => {
    const { earn } = await import('../src/career/career');
    const { world, v, send } = setup();
    const { startEngine } = await import('./helpers/engine');
    startEngine(world, v); // the net drum is hydraulic
    const g = FISHING_GROUNDS[1];
    placeVessel(v, g.x, 0, g.z, 0);
    send('trawl', 1);
    for (let i = 0; i < (CONFIG.fishing.shootTime + 1) / DT; i++) {
      v.linearVelocity = [0, 0, -1.5];
      stepWorld(world, [], DT);
    }
    // A big sea (Hs = 4 x the rms of one component, a/sqrt(2): ~3.4 m).
    world.environment.waves = [{ amplitude: 1.2, period: 8, directionDeg: 0, steepness: 0.3, phase: 0 }];
    for (let i = 0; i < 1 / DT; i++) {
      v.linearVelocity = [0, 0, -1.5];
      stepWorld(world, [], DT);
    }
    expect(world.fishing!.status).toBe('rough');
    const m = world.career!.money;
    earn(world, 'tow', { port: null, what: 'barge', text: 'Tow' });
    expect(world.career!.money - m).toBe(Math.round(CONFIG.career.pay.tow.barge * (1 + CONFIG.career.stormBonus)));
    expect(world.career!.ledger[0].text).toMatch(/heavy weather/);
  });
});

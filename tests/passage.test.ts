/**
 * Passages (owner, 29 Oct 2026: a World tab in the career where "you can teleport to the
 * sheltered harbour with the pier in any one of the regions, and it only costs you time and the
 * fuel"; career/passage.ts): one harbour a region; the time and fuel at her measured cruise; the
 * clock and the time played go on, the fuel's burnt, and she lies at the harbour's cargo berth.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { cargoPortAt } from '../src/cargo/cargo';
import { PASSAGE_PORTS, passageBlocker, passageTime, planPassage } from '../src/career/passage';
import { measureCruise } from '../src/vessel/seaTrials';
import { placeVessel } from '../src/vessel/vesselControl';

const DT = 1 / 60;
const tarsk = PASSAGE_PORTS.find((p) => p.port.id === 'tarsk')!.port;

function setup() {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), 'starterBoat');
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  const go = (seconds: number, litres: number, ref = 'tarsk') =>
    stepWorld(world, [{ playerId: localPlayerId, targetId: v.id, control: 'passageToPort', value: 1, ref, args: [seconds, litres] } as Intent], DT);
  return { world, v, go };
}

describe('passages to the regions\' harbours', () => {
  it('one sheltered harbour in each region of the career', () => {
    expect(PASSAGE_PORTS.map((p) => p.port.id)).toEqual(['calder', 'tarsk', 'kvassvik', 'ashby']);
    expect(PASSAGE_PORTS.every((p) => p.port.kind === 'harbour' && !!p.port.cargo.berth)).toBe(true);
  });

  it('her cruise is measured on her: a speed and a fuel burn', () => {
    const c = measureCruise('starterBoat', CONFIG.passage.lever);
    expect(c.knots).toBeGreaterThan(3);
    expect(c.knots).toBeLessThan(15);
    expect(c.fuelLph).toBeGreaterThan(1);
  });

  it('a passage is the way round at her cruise: so far, so long, so much fuel', () => {
    const { v } = setup();
    const cruise = { knots: 7, fuelLph: 18 };
    const p = planPassage(v, tarsk, cruise);
    const b = tarsk.cargo.berth!;
    const nm = (Math.hypot(b.x - v.position[0], b.z - v.position[2]) * CONFIG.passage.routeFactor) / 1852;
    expect(p.nm).toBeCloseTo(nm, 6);
    expect(p.seconds).toBeCloseTo((nm / 7) * 3600, 3);
    expect(p.litres).toBeCloseTo((nm / 7) * 18, 3);
    expect(passageTime(25 * 60)).toBe('25 min');
    expect(passageTime(70 * 60)).toBe('1 h 10 min');
  });

  it('made, the clock and the time played go on, the fuel is burnt, and she lies at the harbour\'s cargo berth', () => {
    const { world, v, go } = setup();
    const fuel0 = v.engine.fuelL;
    const t0 = world.time;
    const tod0 = world.environment.timeOfDay;
    go(1800, 20);
    expect(v.engine.fuelL).toBeCloseTo(fuel0 - 20, 6);
    expect(world.time).toBeGreaterThanOrEqual(t0 + 1800);
    expect(((world.environment.timeOfDay - tod0 + 24) % 24)).toBeCloseTo(0.5, 1);
    expect(cargoPortAt(v)?.id).toBe('tarsk');
    expect(v.controls.lever).toBe(0);
  });

  it('not without the fuel, not with a tow fast, not to where she is', () => {
    const { world, v, go } = setup();
    const at = [...v.position];
    const t0 = world.time;
    go(600, v.engine.fuelL + 1);
    expect(Math.hypot(v.position[0] - at[0], v.position[2] - at[2])).toBeLessThan(0.5);
    expect(world.time).toBeLessThan(t0 + 1);
    expect(passageBlocker(world, v, tarsk, { nm: 1, seconds: 600, litres: v.engine.fuelL + 1 }, { knots: 7, fuelLph: 1 })).toMatch(/Not enough fuel/);
    world.tow!.lines = { [v.id]: { target: 'd:x', tension: 0 } };
    expect(passageBlocker(world, v, tarsk, null, null)).toMatch(/Cast off the tow/);
    world.tow!.lines = {};
    // Lying in Calder Haven (a test's world starts her out at sea): it's where she is.
    const calder = PASSAGE_PORTS[0].port;
    placeVessel(v, calder.cargo.berth!.x, 0, calder.cargo.berth!.z, 0);
    expect(passageBlocker(world, v, calder, null, null)).toMatch(/here/);
  });
});

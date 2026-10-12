import { describe, expect, it } from 'vitest';
import { ENVIRONMENT_ID, IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { sunDirection, sunElevationDeg } from '../src/environment/timeOfDay';

describe('headless simulation', () => {
  it('runs 60 s in Node with no DOM or WebGL', () => {
    const { world } = createWorld(new IdFactory());
    for (let i = 0; i < 3600; i++) stepWorld(world, [], 1 / 60);
    expect(world.tick).toBe(3600);
    expect(world.time).toBeCloseTo(60, 9);
  });

  it('world state survives a JSON round trip unchanged (snapshot-ready)', () => {
    const { world } = createWorld(new IdFactory());
    stepWorld(world, [], 1 / 60);
    expect(JSON.parse(JSON.stringify(world))).toEqual(world);
  });

  it('applies intents on the next tick', () => {
    const { world, localPlayerId } = createWorld(new IdFactory());
    const before = world.environment.timeOfDay;
    stepWorld(world, [{ playerId: localPlayerId, targetId: ENVIRONMENT_ID, control: 'timeOfDayDelta', value: 23 }], 1 / 60);
    expect(world.environment.timeOfDay).toBeCloseTo((before + 23) % 24, 9);
  });
});

describe('sun model', () => {
  it('is due south at local noon with elevation 90 - lat + dec', () => {
    const d = sunDirection(12, 50, 12);
    expect(d[0]).toBeCloseTo(0, 9); // no east component
    expect(d[2]).toBeGreaterThan(0); // +Z is south
    expect(sunElevationDeg(d)).toBeCloseTo(52, 6);
  });

  it('rises in the east and is below the horizon at midnight', () => {
    expect(sunDirection(8, 50, 12)[0]).toBeGreaterThan(0);
    expect(sunElevationDeg(sunDirection(0, 50, 12))).toBeLessThan(0);
  });
});

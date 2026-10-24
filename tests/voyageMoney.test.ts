import { describe, expect, it } from 'vitest';
import { createCareer, earn } from '../src/career/career';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';

// Voyage (owner, Oct 2026): no career, but this session's money, and damage only from a
// real crash, never at the start.
describe('Voyage: session money, damage', () => {
  const make = (voyage: boolean) => createWorld(new IdFactory(), undefined, { tows: true, fires: true, voyage });

  it('marks the world as Voyage only when asked', () => {
    expect(make(true).world.voyage).toBe(true);
    expect(make(false).world.voyage).toBeUndefined();
  });

  it('earns money in Voyage', () => {
    const { world } = make(true);
    world.career = createCareer();
    const before = world.career.money;
    earn(world, 'cargo', { port: null, text: 'A delivery' });
    expect(world.career.money).toBeGreaterThan(before);
  });

  it('a boat settles for spawnGraceS from her first tick, undamaged', () => {
    const { world, vesselId } = make(true);
    const v = world.vessels[vesselId];
    stepWorld(world, [], 1 / 60);
    expect(v.settleUntil).toBeCloseTo(world.time - 1 / 60 + CONFIG.wear.spawnGraceS, 3);
    expect(v.damage).toBe(0);
  });
});

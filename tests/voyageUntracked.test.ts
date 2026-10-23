import { describe, expect, it } from 'vitest';
import { createCareer, earn, hasUpgrade, spend, stepCareer } from '../src/career/career';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';

// Voyage mode (owner, Oct 2026): the jobs, calls and cargo go on, but nothing is tracked:
// no money, no upgrades to buy, no hull damage or engine wear.
describe('Voyage: nothing tracked', () => {
  const make = (voyage: boolean) => createWorld(new IdFactory(), undefined, { tows: true, fires: true, voyage });

  it('marks the world as Voyage only when asked', () => {
    expect(make(true).world.voyage).toBe(true);
    expect(make(false).world.voyage).toBeUndefined();
  });

  it('pays and charges nothing, and has every upgrade fitted', () => {
    const { world } = make(true);
    world.career = createCareer();
    const before = world.career.money;
    earn(world, 'cargo', { port: null, text: 'A delivery' });
    spend(world, 500, 'Fuel');
    expect(world.career.money).toBe(before);
    expect(hasUpgrade(world, 'bigTank')).toBe(true);
    stepCareer(world);
    expect(world.career.money).toBe(before);
  });

  it('a boat never carries damage or engine wear', () => {
    const { world, vesselId } = make(true);
    const v = world.vessels[vesselId];
    expect(v.damage).toBe(0);
    v.damage = 0.4; // as if a saved career's damage had come with her
    if (v.engine.wear !== undefined) v.engine.wear = 0.4;
    stepWorld(world, [], 1 / 60);
    expect(v.damage).toBe(0);
    expect(v.engine.wear ?? 0).toBe(0);
  });

});

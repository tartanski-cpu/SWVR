/**
 * The rod's catch in the world (owner, Oct 2026): the bucket on deck, sold when she ties up.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { rodBite } from '../src/fishing/rod';
import { placeVessel } from '../src/vessel/vesselControl';
import { BERTHS, FISHING_GROUNDS } from '../src/world/archipelago';

const DT = 1 / 60;

describe("the rod's bucket", () => {
  it('fills by intent up to its size, is sold tied up at a port by weight, and empties', () => {
    const { world, vesselId } = createWorld(new IdFactory());
    world.environment.waves = [];
    const v = world.vessels[vesselId];
    placeVessel(v, 0, 0, -600, 0);
    const send = (control: string, value: number, ref?: string) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value, ref } as Intent], DT);
    send('rodCatch', 1.2, 'mackerel');
    send('rodCatch', 0.8, 'pollack');
    expect(v.rodCatch).toEqual({ count: 2, kg: 2, last: 'pollack' });
    for (let i = 0; i < CONFIG.rod.bucketMax + 3; i++) send('rodCatch', 0.5);
    expect(v.rodCatch!.count).toBe(CONFIG.rod.bucketMax);
    const kg = v.rodCatch!.kg;
    // Not sold at sea, nor alongside with the lines off; tied up at Calder it goes.
    stepWorld(world, [], DT);
    expect(v.rodCatch!.count).toBe(CONFIG.rod.bucketMax);
    const b = BERTHS.find((x) => x.id === 'calder-cargo')!;
    placeVessel(v, b.x, 0, b.z, b.headingDeg);
    const money = world.career!.money;
    stepWorld(world, [], DT);
    expect(v.rodCatch!.count).toBe(CONFIG.rod.bucketMax);
    v.mooring.phase = 'moored';
    v.mooring.berthId = b.id;
    stepWorld(world, [], DT);
    expect(v.rodCatch).toEqual({ count: 0, kg: 0 });
    expect(world.career!.money - money).toBe(Math.round(kg * CONFIG.rod.pricePerKg));
    expect(world.career!.ledger[0].text).toMatch(/Rod fish sold at Calder/);
  });

  it("what bites: a fishing ground's own species in it, the coast's mix elsewhere, by weight", () => {
    const g = FISHING_GROUNDS.find((x) => x.species)!;
    for (let i = 0; i < 20; i++) {
      const r = rodBite(g.x, g.z, Math.random);
      expect(r.species).toBe(g.species);
      const [lo, hi] = CONFIG.rod.species.kg[g.species!];
      expect(r.kg).toBeGreaterThanOrEqual(lo);
      expect(r.kg).toBeLessThanOrEqual(hi);
    }
    const open = rodBite(0, -600, () => 0.3);
    expect(CONFIG.rod.species.coast).toContain(open.species);
  });
});

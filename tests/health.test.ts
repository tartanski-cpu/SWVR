/**
 * The player's health (player/health.ts; owner, Oct 2026: a berth heals; cold water, a
 * propeller, falls, and fire and smoke hurt; and sleeping in a berth passes time).
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import type { WorldState } from '../src/core/world';
import { fallHarm, fireExposure, isNight, sleepHours, stepHealth, wakeNow } from '../src/player/health';

const calm = { swimming: false, fire: 0, smoke: 0, resting: false };
/** A world with a boat fire at the origin and the wind from the north (blowing toward +z) at `wind` m/s. */
const burning = (wind: number, intensity = 1) =>
  ({ fire: { job: { kind: 'boat', x: 0, z: 0, y: 0, intensity, phase: 'accepted' } }, environment: { weather: { now: { windFrom: 0, wind } } }, players: {} }) as unknown as WorldState;
/** Run `s` seconds in 0.1 s steps. */
const run = (h: number, e: typeof calm, s: number) => {
  for (let t = 0; t < s; t += 0.1) h = stepHealth(h, e, 0.1);
  return h;
};

describe('health', () => {
  it('the cold takes a full-health swimmer in coldMinutes; out of the water, nothing', () => {
    const c = CONFIG.health;
    expect(run(1, { ...calm, swimming: true }, c.coldMinutes * 60 * 0.5)).toBeCloseTo(0.5, 2);
    expect(run(1, { ...calm, swimming: true }, c.coldMinutes * 60 + 1)).toBe(0);
    expect(run(0.7, calm, 60)).toBe(0.7);
  });

  it('a berth heals from nothing in restFullS, but not while something is hurting', () => {
    expect(run(0, { ...calm, resting: true }, CONFIG.health.restFullS / 2)).toBeCloseTo(0.5, 2);
    expect(run(0, { ...calm, resting: true }, CONFIG.health.restFullS + 1)).toBe(1);
    expect(run(0.5, { ...calm, resting: true, smoke: 1 }, 5)).toBeLessThan(0.5);
  });

  it('a fall hurts only past the safe height, more the further', () => {
    const speed = (h: number) => Math.sqrt(2 * CONFIG.body.gravity * h);
    expect(fallHarm(speed(1.5))).toBe(0);
    expect(fallHarm(speed(CONFIG.health.safeFall))).toBeCloseTo(0, 6);
    expect(fallHarm(speed(CONFIG.health.safeFall + 2))).toBeCloseTo(2 * CONFIG.health.fallPerM, 6);
  });

  it('flames inside the fire; smoke downwind, thinning; none upwind; none when it is out', () => {
    const w = burning(8);
    expect(fireExposure(w, [2, 1, 0])).toEqual({ fire: 1, smoke: 0 });
    const near = fireExposure(w, [0, 1, 10]).smoke;
    const far = fireExposure(w, [0, 1, 30]).smoke;
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    expect(fireExposure(w, [0, 1, -15])).toEqual({ fire: 0, smoke: 0 });
    expect(fireExposure(w, [30, 1, 10]).smoke).toBe(0);
    expect(fireExposure(burning(8, 0), [2, 1, 0])).toEqual({ fire: 0, smoke: 0 });
    // A calm: the smoke rises all round it.
    expect(fireExposure(burning(0), [0, 1, -8]).smoke).toBeGreaterThan(0);
  });

  it('sleep: the clock runs on only with everyone in a berth; up again when well by day, or at the morning', () => {
    const world = (rest: boolean[]) => ({ players: Object.fromEntries(rest.map((r, i) => [`p${i}`, { avatar: { resting: r } }])) }) as unknown as WorldState;
    expect(sleepHours(world([true]), 2)).toBeCloseTo(2 * CONFIG.health.sleepHoursPerS, 9);
    expect(sleepHours(world([true, false]), 2)).toBe(0);
    expect(sleepHours(world([]), 2)).toBe(0);
    expect(isNight(23)).toBe(true);
    expect(isNight(3)).toBe(true);
    expect(isNight(12)).toBe(false);
    // Lain down hurt: up once well, by day; at night, asleep on.
    expect(wakeNow(1, true, 12, 12.01)).toBe(true);
    expect(wakeNow(0.8, true, 12, 12.01)).toBe(false);
    expect(wakeNow(1, true, 2, 2.01)).toBe(false);
    // Asleep to pass the time: up when the clock comes round to the wake hour, not before.
    const w = CONFIG.health.wakeHour;
    expect(wakeNow(1, false, 12, 12.01)).toBe(false);
    expect(wakeNow(1, false, w - 0.01, w + 0.01)).toBe(true);
    expect(wakeNow(1, false, 23.9, 0.2)).toBe(false);
    expect(wakeNow(1, false, w - 0.2, w - 0.1)).toBe(false);
  });
});

describe('berths to rest in', () => {
  it('a Shipyard berth and the cabin below’s V-berth each have the press to lie down (the berthRest channel)', async () => {
    const { FURNITURE, REST_SPOT } = await import('../src/modules/furniture');
    const { fakeCanvas } = await import('./modular/fakes');
    fakeCanvas();
    const berth = FURNITURE.view!.build({ config: { kind: 'berth', length: 1.9, depth: 0.7, height: 0.6 }, keys: { door: 'furniture.headDoor' } } as never);
    expect(berth.controls.map((c) => c.channel)).toEqual(['berthRest']);
    const settee = FURNITURE.view!.build({ config: { kind: 'settee', length: 1.4, depth: 0.6, height: 0.9 }, keys: { door: 'furniture.headDoor' } } as never);
    expect(settee.controls).toEqual([]);
    expect(REST_SPOT.view!.build({ config: { length: 1.8, width: 1.2, top: 0 }, keys: {} } as never).controls[0].channel).toBe('berthRest');
    // A Shipyard boat with a cabin below: her V-berth is a place to rest, and her recipe holds.
    const { useDesign } = await import('../src/boats/sims');
    const { DESIGN_HULLS } = await import('../src/shipyard/build');
    const { DEFAULT_DESIGN } = await import('../src/shipyard/design');
    const { LIBRARY, RECIPES } = await import('../src/boats/library');
    const { validateRecipe } = await import('../src/modular/recipe');
    const { VESSEL_DEFS } = await import('../src/vessel/vesselDef');
    useDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[1].defaults, hull: 1, housePos: 0.6, fcLength: 9, outboards: 1, foreCabin: 1 });
    expect(VESSEL_DEFS.design.layout.cabin?.berth).toBeDefined();
    expect(RECIPES.design.modules.filter((m) => m.module === 'furniture.restSpot')).toHaveLength(1);
    expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
    useDesign(DEFAULT_DESIGN);
  });
});

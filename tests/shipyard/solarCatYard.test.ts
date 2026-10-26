/**
 * The solar catamaran in the Shipyard (owner, 26 Oct 2026: "a bit of a one-off build ... the
 * only thing that should be options are the number of batteries"; the hull modifications chat's
 * `solarCat` lines): all fixed but her battery; foam and plywood; twin electric pod motors;
 * a solar roof; her battery's weight, range and wet-deck clearance in her figures.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { validateRecipe } from '../../src/modular/recipe';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { BATTERY_STEPS, DEFAULT_DESIGN, batteryKWh, type ShipDesign } from '../../src/shipyard/design';
import { designToken, readDesign, shortCode } from '../../src/shipyard/designDoc';
import { SOLAR_CAT, SOLAR_MOTOR } from '../../src/shipyard/parts/catalog';
import { hullCards } from '../../src/shipyard/hullCards';

afterAll(() => useDesign(DEFAULT_DESIGN));

const cat: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[SOLAR_CAT].defaults, hull: SOLAR_CAT };

describe('the solar catamaran in the Shipyard', () => {
  it('builds clean: 16 x 5.2 m of foam and plywood, about 10.7-11 t, floating near her 0.86 m lines, very stiff', () => {
    expect(DESIGN_HULLS[SOLAR_CAT].name).toMatch(/^Solar catamaran/);
    const b = useDesign(cat);
    expect(b.warnings).toEqual([]);
    expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
    expect(b.figures.lengthM).toBeCloseTo(16, 1);
    expect(b.figures.beamM).toBeCloseTo(5.2, 1);
    expect(b.figures.material).toBe('foam and plywood');
    expect(b.figures.massT).toBeGreaterThan(10.3);
    expect(b.figures.massT).toBeLessThan(11.3);
    expect(b.figures.draughtM).toBeGreaterThan(0.8);
    expect(b.figures.draughtM).toBeLessThan(0.95);
    expect(b.figures.gmM).toBeGreaterThan(4);
    expect(b.figures.engine).toMatch(/^Twin 25 kW electric pod motor, on pod drives/);
    // Her battery and solar roof weighed in; no diesel's tanks and exhaust.
    const names = b.weights.items.map((i) => i.name);
    expect(names).toContain('Battery (100 kWh)');
    expect(names).toContain('Solar roof: panels, frames, wing hinges');
    expect(names.some((n) => /exhaust/.test(n))).toBe(false);
  });

  it('her pods, her solar roof (roof, two wings, the foredeck rack) and her basic interior', () => {
    const b = buildDesign(cat);
    const mods = b.recipe.modules.map((m) => m.module);
    expect(mods).toContain('propulsion.pods');
    expect(mods).not.toContain('control.rudder');
    const roof = b.recipe.modules.find((m) => m.module === 'deck.solar-roof')!.config as { wings: unknown[]; rack: unknown };
    expect(roof.wings).toHaveLength(2);
    expect(roof.rack).toBeTruthy();
    for (const k of ['setteeAt', 'setteeAt2', 'galleyAt', 'berthAt', 'headAt'] as const) expect(b.placed[k]?.moved).toBe(false);
  });

  it('everything fixed but her battery, whatever the design says', () => {
    const as = buildDesign(cat);
    const tried = buildDesign({ ...cat, length: 0, houseLength: 3, engine: 0, twin: 0, pods: 0, paint: 0, deckCrane: 1, setteeAt: 0, gear: 9 });
    expect(tried.figures).toEqual(as.figures);
  });

  it('her battery: more is heavier, deeper, less under her wet deck, and further on a charge', () => {
    const at = (battery: number) => buildDesign({ ...cat, battery }).figures;
    const small = at(0);
    const big = at(BATTERY_STEPS - 1);
    expect(small.solar!.batteryKWh).toBe(20);
    expect(big.solar!.batteryKWh).toBe(200);
    expect(big.massT - small.massT).toBeCloseTo((180 * 7) / 1000, 1);
    expect(big.draughtM).toBeGreaterThan(small.draughtM);
    expect(big.solar!.wetDeckM).toBeLessThan(small.solar!.wetDeckM);
    expect(big.solar!.rangeNm).toBeGreaterThan(5 * small.solar!.rangeNm);
    // 100 kWh: about 7 kn on 10 kW, 9 hours, 60-odd miles (the hull chat's 66 on all of it).
    const mid = at(8).solar!;
    expect(batteryKWh(8)).toBe(100);
    expect(mid.cruiseKn).toBeGreaterThan(6.5);
    expect(mid.cruiseKn).toBeLessThan(7.5);
    expect(mid.rangeNm).toBeGreaterThan(55);
    expect(mid.rangeNm).toBeLessThan(70);
    expect(mid.wetDeckM).toBeGreaterThan(0.9);
  });

  it('her motors are hers alone: on another hull they are the 150 kW, saying so', () => {
    const b = buildDesign({ ...DEFAULT_DESIGN, engine: SOLAR_MOTOR });
    expect(b.figures.engine).toMatch(/150 kW/);
    expect(b.warnings[0]).toMatch(/solar catamaran's own/);
  });

  it('on her own card, and she travels as a link or file, her battery with her', () => {
    expect(hullCards().some((c) => c.hull === SOLAR_CAT && /Solar catamaran/.test(c.title))).toBe(true);
    const d = { ...cat, battery: 15 };
    expect(shortCode(d)).toBeNull();
    const back = readDesign(designToken(d));
    expect('design' in back && back.design.battery).toBe(15);
  });
});

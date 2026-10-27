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

  it('her pods, her solar roof (roof, two wings, the panels on her sloped front) and her basic interior', () => {
    const b = buildDesign(cat);
    const mods = b.recipe.modules.map((m) => m.module);
    expect(mods).toContain('propulsion.pods');
    expect(mods).not.toContain('control.rudder');
    const roof = b.recipe.modules.find((m) => m.module === 'deck.solar-roof')!.config as { wings: unknown[]; slope?: unknown };
    expect(roof.wings).toHaveLength(2);
    expect(roof.slope).toBeTruthy();
    for (const k of ['setteeAt', 'setteeAt2', 'galleyAt', 'berthAt', 'headAt'] as const) expect(b.placed[k], k).toBeTruthy();
  });

  it('her hull, motors and deck fixed, whatever the design says', () => {
    const as = buildDesign(cat);
    const tried = buildDesign({ ...cat, length: 0, engine: 0, twin: 0, pods: 0, deckCrane: 1, gear: 9, markings: 1, foreCabin: 1 });
    expect(tried.figures).toEqual(as.figures);
    expect(tried.recipe.modules.some((m) => m.module === 'hull.markings')).toBe(false);
  });

  it('her wheelhouse, controls and furniture are the player’s (owner, 27 Oct 2026: "I want to use the sliders")', () => {
    const fixed = DESIGN_HULLS[SOLAR_CAT].fixed!;
    for (const k of ['housePos', 'houseLength', 'houseWidth', 'headroom', 'windowRake', 'kick', 'saloon', 'overhead', 'dhLength', 'controls', 'touch', 'setteeAt', 'headAt', 'seatAt', 'dashSpeed'] as const) expect(k in fixed, k).toBe(false);
    // Moved and resized, the house (and its solar roof, which follows it) builds clean.
    const variants: Partial<ShipDesign>[] = [{ houseLength: 3 }, { housePos: 0.8, saloon: 0, overhead: 0 }, { windowRake: 0, kick: 0 }, { headroom: 2.2 }, { houseWidth: 0.7 }, { dhLength: 2, dhHeight: 0.8 }, { touch: 1 }];
    for (const v of variants) {
      const b = buildDesign({ ...cat, ...v });
      expect(b.recipe.modules.some((m) => m.module === 'deck.solar-roof'), JSON.stringify(v)).toBe(true);
      expect(b.figures.lengthM, JSON.stringify(v)).toBeCloseTo(16, 1);
    }
    expect(buildDesign({ ...cat, houseLength: 3 }).figures.massT).toBeLessThan(buildDesign(cat).figures.massT);
    // Her furniture moves, and comes off.
    const moved = buildDesign({ ...cat, setteeAt: 0 });
    expect(moved.recipe.modules.filter((m) => m.module === 'furniture.piece').length).toBe(buildDesign(cat).recipe.modules.filter((m) => m.module === 'furniture.piece').length - 1);
  });

  it('her head keeps clear of the breaker panel (owner: "it\'s overlapping with the switch panel for the breakers")', () => {
    const b = buildDesign(cat);
    expect(b.warnings).toEqual([]);
    const head = b.placed.headAt!;
    const breakers = b.hull.sockets.find((s) => s.id === 'breakerPanel')!.transform.position!;
    // Not on the breakers' wall within the panel's width and the room to stand at it.
    const sameWall = Math.sign(head.x) === Math.sign(breakers[0]);
    expect(!sameWall || Math.abs(head.z - breakers[2]) > 0.27 + 0.3, JSON.stringify({ head, breakers })).toBe(true);
  });

  it('her paint is the player\'s (owner: "the paint options as well"), black as she comes', () => {
    expect(cat.paint).toBe(5);
    const fixed = DESIGN_HULLS[SOLAR_CAT].fixed!;
    for (const k of ['paint', 'houseColour', 'frames', 'roofPaint', 'roofTop', 'finish'] as const) expect(k in fixed, k).toBe(false);
    const white = useDesign({ ...cat, paint: 4, finish: 0 });
    expect(white.warnings).toEqual([]);
    expect(white.figures.massT).toBeCloseTo(buildDesign(cat).figures.massT, 6);
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
    // 100 kWh: about 6 kn on 10 kW, 9 hours, 50-odd miles (as she does in the game on her
    // electric drives: solarCatDrive.test.ts; the hull chat's 66 was on all of it, with a better
    // propulsive efficiency than the game gives her).
    const mid = at(8).solar!;
    expect(batteryKWh(8)).toBe(100);
    expect(mid.cruiseKn).toBeGreaterThan(5.4);
    expect(mid.cruiseKn).toBeLessThan(6.3);
    expect(mid.rangeNm).toBeGreaterThan(46);
    expect(mid.rangeNm).toBeLessThan(58);
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

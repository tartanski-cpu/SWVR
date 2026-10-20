/**
 * A tug's dry exhaust stack (owner, Oct 2026): a beefy pipe up through a corner of the
 * wheelhouse and out of the roof, the smoke from its top; her cooling water out of a hole in
 * her side near the waterline. Other boats keep their wet exhaust in the transom.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { LIBRARY, RECIPES } from '../src/boats/library';
import { FLEET } from '../src/boats/fleet';
import { useDesign } from '../src/boats/sims';
import { CONFIG } from '../src/config';
import { validateRecipe } from '../src/modular/recipe';
import { buildDesign, DESIGN_HULLS } from '../src/shipyard/build';
import { DEFAULT_DESIGN } from '../src/shipyard/design';
import { wetOutlet } from '../src/vessel/vesselDef';

afterAll(() => useDesign(DEFAULT_DESIGN));

const tug = FLEET.find((f) => f.id === 'smallTug')!.design;

describe("a tug's exhaust stack", () => {
  it('stands in the aft starboard corner of her wheelhouse, from under the floor to well over the roof', () => {
    const b = buildDesign(tug);
    const m = b.recipe.modules.find((x) => x.module === 'fitting.exhaust-stack')!;
    expect(m).toBeTruthy();
    const c = m.config as { x: number; z: number; radius: number; foot: number; floor: number; roof: number; top: number };
    const wh = b.hull.layout.wheelhouse!;
    expect(c.x + c.radius).toBeLessThan(wh.halfWidth);
    expect(c.x).toBeGreaterThan(wh.halfWidth - 0.4);
    expect(c.z + c.radius).toBeLessThan(wh.aft);
    expect(c.z).toBeGreaterThan(wh.aft - 0.4);
    expect(c.foot).toBeLessThan(wh.floorY);
    expect(c.top - c.roof).toBeCloseTo(CONFIG.shipyard.exhaustStack.aboveRoof, 2);
    expect(c.radius).toBeGreaterThanOrEqual(0.12); // beefy
    useDesign(tug);
    expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
  });

  it('the smoke comes out of its top, going up; no outlet in the transom', () => {
    const b = buildDesign(tug);
    const ex = b.hull.fittings!.exhaust!;
    const c = b.recipe.modules.find((x) => x.module === 'fitting.exhaust-stack')!.config as { x: number; z: number; top: number };
    expect(ex.stack).toBe(true);
    expect(ex.position[1]).toBeGreaterThan(c.top);
    expect(ex.position[0]).toBeCloseTo(c.x, 3);
    expect(ex.direction).toEqual([0, 1, 0]);
    expect(wetOutlet(ex ? { exhaust: ex } : {})).toBeUndefined();
  });

  it('her cooling water leaves by a hole in her starboard side, just over the waterline', () => {
    const b = buildDesign(tug);
    const w = b.hull.fittings!.exhaust!.water!;
    expect(w.position[1]).toBeCloseTo(CONFIG.shipyard.exhaustStack.waterAbove, 3);
    expect(w.position[0]).toBeGreaterThan(1); // out at her side, not inboard
    expect(w.direction[0]).toBeGreaterThan(0); // pointing out to starboard
  });

  it('only on a tug: the other hull types keep the wet exhaust in the transom', () => {
    for (const hull of [0, 1, 3]) {
      const b = buildDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull });
      expect(b.recipe.modules.some((x) => x.module === 'fitting.exhaust-stack'), `hull ${hull}`).toBe(false);
      expect(b.hull.fittings!.exhaust!.stack).toBeFalsy();
    }
  });
});

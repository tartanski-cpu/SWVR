/**
 * A tug's dry exhaust stacks (owner, Oct 2026): beefy pipes up through the aft corners of the
 * wheelhouse and out of the roof, one per engine, raked aft (their tops cut on a slant) or
 * straight; the smoke from their tops; her cooling water out of holes in her sides near the
 * waterline. Other boats keep their wet exhaust in the transom.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { LIBRARY, RECIPES } from '../src/boats/library';
import { FLEET } from '../src/boats/fleet';
import { useDesign } from '../src/boats/sims';
import { CONFIG } from '../src/config';
import { validateRecipe } from '../src/modular/recipe';
import type { ExhaustStackConfig } from '../src/modules/exhaustStack';
import { buildDesign, DESIGN_HULLS } from '../src/shipyard/build';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, type ShipDesign } from '../src/shipyard/design';
import { wetOutlet } from '../src/vessel/vesselDef';

afterAll(() => useDesign(DEFAULT_DESIGN));

const tug = FLEET.find((f) => f.id === 'smallTug')!.design;
const stackOf = (d: ShipDesign) => {
  const b = buildDesign(d);
  return { b, c: b.recipe.modules.find((x) => x.module === 'fitting.exhaust-stack')?.config as ExhaustStackConfig | undefined };
};

describe("a tug's exhaust stacks", () => {
  it('one, in the aft starboard corner of her wheelhouse, from under the floor to well over the roof, raked aft', () => {
    const { b, c } = stackOf(tug);
    expect(c!.pipes).toHaveLength(1);
    const [p] = c!.pipes;
    const wh = b.hull.layout.wheelhouse!;
    expect(p.x + c!.radius).toBeLessThan(wh.halfWidth);
    expect(p.x).toBeGreaterThan(wh.halfWidth - 0.4);
    expect(p.z + c!.radius).toBeLessThan(wh.aft);
    expect(p.z).toBeGreaterThan(wh.aft - 0.4);
    expect(c!.foot).toBeLessThan(wh.floorY);
    expect(c!.above).toBe(CONFIG.shipyard.exhaustStack.aboveRoof);
    expect(c!.rakeDeg).toBe(CONFIG.shipyard.exhaustStack.rakeDeg);
    expect(c!.radius).toBeGreaterThanOrEqual(0.12); // beefy
    useDesign(tug);
    expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
  });

  it('the smoke comes out of its top, leaning aft with it; no outlet in the transom', () => {
    const { b, c } = stackOf(tug);
    const ex = b.hull.fittings!.exhaust!;
    expect(ex.stack).toBe(true);
    expect(ex.position[1]).toBeGreaterThan(c!.roof + c!.above - 0.4);
    expect(ex.position[2]).toBeGreaterThan(c!.pipes[0].z); // carried aft by the rake
    expect(ex.direction[1]).toBeGreaterThan(0.9);
    expect(ex.direction[2]).toBeGreaterThan(0.1);
    expect(wetOutlet({ exhaust: ex })).toBeUndefined();
  });

  it('straight: upright, its top square, the smoke straight up', () => {
    const { b, c } = stackOf({ ...tug, stackStyle: 1 });
    expect(c!.rakeDeg).toBe(0);
    expect(c!.cutDeg).toBe(0);
    const ex = b.hull.fittings!.exhaust!;
    expect(ex.direction).toEqual([0, 1, 0]);
    expect(ex.position[1]).toBeCloseTo(c!.roof + c!.above, 3);
  });

  it('twin engines: two stacks, one in each aft corner, smoke from both, a water hole each side', () => {
    const { b, c } = stackOf({ ...tug, engine: 2, twin: 1 });
    expect(c!.pipes).toHaveLength(2);
    expect(c!.pipes[0].x).toBeCloseTo(-c!.pipes[1].x, 6);
    const ex = b.hull.fittings!.exhaust!;
    expect(ex.more).toHaveLength(1);
    expect(ex.more![0][0]).toBeCloseTo(-ex.position[0], 3);
    expect(ex.water!.map((w) => Math.sign(w.position[0])).sort()).toEqual([-1, 1]);
    // The hand gear on the aft wall stands clear of the port stack.
    const port = c!.pipes.find((p) => p.x < 0)!;
    expect(b.hull.fittings!.stowage!.extinguisher![0]).toBeGreaterThan(port.x + c!.radius + 0.1);
    useDesign({ ...tug, engine: 2, twin: 1 });
    expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
  });

  it('her cooling water leaves by a hole in her side, just over the waterline, pointing out', () => {
    const { b } = stackOf(tug);
    const [w] = b.hull.fittings!.exhaust!.water!;
    expect(w.position[1]).toBeCloseTo(CONFIG.shipyard.exhaustStack.waterAbove, 3);
    expect(w.position[0]).toBeGreaterThan(1);
    expect(w.direction[0]).toBeGreaterThan(0);
  });

  it('the style is in the code (version 29); older codes read as raked', () => {
    // (A plain tug as she comes: the fleet's has gear that travels only as a link or file.)
    const plain: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[4].defaults, hull: 4 };
    const back = decodeDesign(encodeDesign({ ...plain, stackStyle: 1 }));
    expect('design' in back && back.design.stackStyle).toBe(1);
    const old = decodeDesign(encodeDesign({ ...plain, stackStyle: 0 }));
    expect('design' in old && old.design.stackStyle).toBe(0);
  });

  it('only on a tug: the other hull types keep the wet exhaust in the transom', () => {
    for (const hull of [0, 1, 3]) {
      const { b, c } = stackOf({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull });
      expect(c, `hull ${hull}`).toBeUndefined();
      expect(b.hull.fittings!.exhaust!.stack).toBeFalsy();
    }
  });
});

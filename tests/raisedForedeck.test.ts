/**
 * A raised foredeck on the fishing boat (owner, Oct 2026, from a photo of a trawler; build.ts
 * raisedForedeck, CONFIG.shipyard.foredeck): her deck stepped up forward of a break, steps up to it.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { LIBRARY, RECIPES } from '../src/boats/library';
import { useDesign } from '../src/boats/sims';
import { validateRecipe } from '../src/modular/recipe';
import { DESIGN_HULLS } from '../src/shipyard/build';
import { DEFAULT_DESIGN, encodeDesign, SCALES, type ShipDesign } from '../src/shipyard/design';
import { hullPlan, STEP_HEIGHT, vesselWalkArea } from '../src/vessel/layout';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';

afterAll(() => useDesign(DEFAULT_DESIGN));

const netter: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[1].defaults, hull: 1 };

describe('a raised foredeck', () => {
  it('her deck steps up forward of the break by its height; aft of it, as before', () => {
    const flat = useDesign(netter);
    const flatPlan = hullPlan(VESSEL_DEFS.design);
    const b = useDesign({ ...netter, fcLength: 5, fcHeight: 2 });
    const plan = hullPlan(VESSEL_DEFS.design);
    const steps = VESSEL_DEFS.design.layout.deckSteps!;
    expect(steps.length).toBeGreaterThan(0);
    const zb = Math.min(...steps.map((s) => s.z0)); // the break
    expect(plan.deckY(zb - 0.2) - flatPlan.deckY(zb - 0.2)).toBeCloseTo(SCALES.fcHeight(2), 1);
    expect(plan.deckY(zb + 0.5)).toBeCloseTo(flatPlan.deckY(zb + 0.5), 1); // (within a cm or two: the break's extra stations)
    expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
    expect(b.figures.lengthM).toBeCloseTo(flat.figures.lengthM, 2);
  });

  it('you walk up it: every tread within a stride of the next, from her deck to the raised one; the break itself is a wall', () => {
    useDesign({ ...netter, fcLength: 5, fcHeight: 3 });
    const def = VESSEL_DEFS.design;
    const plan = hullPlan(def);
    const steps = [...def.layout.deckSteps!].sort((a, b) => b.z0 - a.z0); // from the lowest (aft)
    const zb = Math.min(...steps.map((s) => s.z0));
    const ys = [plan.deckY(steps[0].z1 + 0.05), ...steps.map((s) => s.y), plan.deckY(zb - 0.05)];
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i] - ys[i - 1], `rise ${i}`).toBeGreaterThan(0);
      expect(ys[i] - ys[i - 1], `rise ${i}`).toBeLessThan(STEP_HEIGHT);
    }
    const walk = vesselWalkArea(def, def.layout);
    // On each tread you can stand; at the side of the break, off the steps, the step up is too much.
    for (const s of steps) expect(walk.walkable(0, (s.z0 + s.z1) / 2, s.y)).toBe(true);
    const side = (plan.halfBeam(zb + 0.3) - 0.6) * 0.8;
    expect(walk.walkable(side, zb - 0.2, plan.deckY(zb + 0.2))).toBe(false);
    expect(STEP_HEIGHT).toBeGreaterThan(CONFIG.shipyard.foredeck.stepRise);
  });

  it('never under the wheelhouse: run on aft past it, the house standing on it', () => {
    const b = useDesign({ ...netter, housePos: 1, fcLength: 6 });
    const wh = VESSEL_DEFS.design.layout.wheelhouse!;
    const steps = VESSEL_DEFS.design.layout.deckSteps;
    if (steps) {
      const zb = Math.min(...steps.map((s) => s.z0));
      expect(zb <= wh.front - 0.3 || zb >= wh.aft).toBe(true);
    }
    expect(b.warnings.join(' ')).not.toMatch(/undefined/);
  });

  it('only the fishing boat offers it; not in the code', () => {
    const tug: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[4].defaults, hull: 4 };
    useDesign({ ...tug, fcLength: 5 });
    expect(VESSEL_DEFS.design.layout.deckSteps).toBeUndefined();
    expect(() => encodeDesign({ ...netter, fcLength: 5 })).toThrow(/foredeck/);
  });
});

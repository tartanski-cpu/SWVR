/**
 * The front windows swept back to 60° (owner, 27 Oct 2026, for the solar catamaran: "the
 * windows probably need to rake back more than 30 degrees. It's probably more like 60 ... it
 * would be good to have that slider work more like that"): design.windowRake down to -60 on
 * any hull, the console set back under the glass, a link or file past the old -30.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { validateRecipe } from '../../src/modular/recipe';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, MEASURES, onMeasure, type ShipDesign } from '../../src/shipyard/design';
import { designToken, readDesign, shortCode } from '../../src/shipyard/designDoc';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';

afterAll(() => useDesign(DEFAULT_DESIGN));

describe('the front swept back to 60°', () => {
  it('the slider goes to 60° back (and still 30° reverse)', () => {
    expect(MEASURES.windowRake.min).toBe(-60);
    expect(MEASURES.windowRake.max).toBe(30);
    expect(onMeasure('windowRake', -75)).toBe(-60);
  });

  it('on every hull type that takes it: a sound boat, the console further back under the glass the more it sweeps', () => {
    for (const [hull, t] of DESIGN_HULLS.entries()) {
      if (t.retired || 'windowRake' in (t.fixed ?? {})) continue;
      const at = (windowRake: number) => {
        const b = useDesign({ ...DEFAULT_DESIGN, ...t.defaults, hull, windowRake, flare: 0 } as ShipDesign);
        expect(validateRecipe(RECIPES.design, LIBRARY), `${t.name} ${windowRake}`).toEqual([]);
        const wh = VESSEL_DEFS.design.layout.wheelhouse!;
        expect(wh.frontRakeDeg, t.name).toBe(windowRake);
        return { back: wh.consoleBack ?? 0, warnings: b.warnings };
      };
      const upright = at(0);
      const swept = at(-60);
      expect(swept.back, t.name).toBeGreaterThan(upright.back);
      expect(swept.warnings, t.name).toEqual(upright.warnings);
    }
  });

  it('the solar catamaran is swept 60°; past 30° a design travels as a link or file', () => {
    const cat = DESIGN_HULLS.findIndex((h) => h.name.startsWith('Solar catamaran'));
    expect(DESIGN_HULLS[cat].fixed!.windowRake).toBe(-60);
    const d = { ...DEFAULT_DESIGN, windowRake: -45 };
    expect(shortCode(d)).toBeNull();
    const back = readDesign(designToken(d));
    expect('design' in back && back.design.windowRake).toBe(-45);
  });
});

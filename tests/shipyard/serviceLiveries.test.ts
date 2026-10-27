/**
 * Service liveries (owner, 26 Oct 2026: "liveries for the pilot boat and the fast landing
 * craft, probably police, fire, and rescue. And Coast Guard"): design.markings, her colours
 * for the service and its markings on her topsides (parts/markings.ts, modules/markings).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { validateRecipe } from '../../src/modular/recipe';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, MARKING_STEPS, type ShipDesign } from '../../src/shipyard/design';
import { designToken, readDesign, shortCode } from '../../src/shipyard/designDoc';
import { MARKING_NAMES, SERVICE_LIVERIES } from '../../src/shipyard/parts/markings';
import type { MarkingsConfig } from '../../src/modules/markings';

afterAll(() => useDesign(DEFAULT_DESIGN));

const hull = (name: string) => DESIGN_HULLS.findIndex((h) => h.name.startsWith(name));
const of = (name: string, more: Partial<ShipDesign> = {}): ShipDesign => {
  const i = hull(name);
  return { ...DEFAULT_DESIGN, ...DESIGN_HULLS[i].defaults, hull: i, ...more };
};
const markingsOf = (d: ShipDesign) => buildDesign(d).recipe.modules.find((m) => m.module === 'hull.markings')?.config as MarkingsConfig | undefined;

describe('service liveries', () => {
  it('police, fire, rescue and coastguard, after none', () => {
    expect(MARKING_NAMES).toEqual(['None', 'Police', 'Fire', 'Rescue', 'Coastguard']);
    expect(MARKING_STEPS).toBe(SERVICE_LIVERIES.length + 1);
  });

  for (const boat of ['Pilot boat', 'Landing craft']) {
    it(`on the ${boat.toLowerCase()}: each one's markings on both her sides, proud of her plating, the recipe sound, her figures unchanged`, () => {
      const plain = buildDesign(of(boat));
      for (let m = 1; m < MARKING_STEPS; m++) {
        const d = of(boat, { markings: m, ...SERVICE_LIVERIES[m - 1].colours });
        const b = useDesign(d);
        expect(b.warnings).toEqual([]);
        expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
        const c = markingsOf(d)!;
        expect(c.text.word).toBe(SERVICE_LIVERIES[m - 1].text.word);
        const xs = c.positions.filter((_, i) => i % 3 === 0);
        expect(Math.min(...xs)).toBeLessThan(-1);
        expect(Math.max(...xs)).toBeGreaterThan(1);
        // Every corner over her side, none on her centreline.
        expect(Math.min(...xs.map(Math.abs))).toBeGreaterThan(0.2);
        expect(c.uvs.every((v) => v >= 0 && v <= 1)).toBe(true);
        expect(c.depthM).toBeGreaterThan(0.3);
        // Paint: no weight, no change to how she floats or goes.
        expect(b.figures.gmM).toBeCloseTo(plain.figures.gmM, 6);
        expect(b.figures.draughtM).toBeCloseTo(plain.figures.draughtM, 6);
      }
    });
  }

  it('on the landing craft, up her bulwark: the markings start under her bulwark’s top, so higher with a higher bulwark', () => {
    const top = (d: ShipDesign) => Math.max(...markingsOf(d)!.positions.filter((_, i) => i % 3 === 1));
    // (Bulwark steps 0.3 m and 1.0 m.)
    expect(top(of('Landing craft', { markings: 1, bulwark: 7 }))).toBeGreaterThan(top(of('Landing craft', { markings: 1, bulwark: 0 })) + 0.6);
  });

  it('none on the catamaran (two hulls), saying so; her colours still hers', () => {
    const d = of('Fast catamaran', { markings: 2 });
    expect(markingsOf(d)).toBeUndefined();
    expect(buildDesign(d).warnings.some((w) => /markings go on a monohull/.test(w))).toBe(true);
  });

  it('marked, she travels as a link or file, and comes back marked', () => {
    const d = of('Pilot boat', { markings: 3 });
    expect(shortCode(d)).toBeNull();
    const back = readDesign(designToken(d));
    expect('design' in back && back.design.markings).toBe(3);
  });
});

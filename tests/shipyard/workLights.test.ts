/** The advanced interior's working lights on a Shipyard design (owner): the overhead switch panel and the deck floods. */
import { beforeAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { flattenMounts, validateRecipe } from '../../src/modular/recipe';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';
import { fakeCanvas } from '../modular/fakes';

beforeAll(fakeCanvas);

const BASE: ShipDesign = { ...DEFAULT_DESIGN, guard: 0 };
const ids = () => flattenMounts(RECIPES.design, LIBRARY.hulls, LIBRARY.modules).mounted.map((m) => m.def.id);
const typeOf = (hull: number, controls: number, facets = 0): ShipDesign => ({ ...BASE, hull, ...DESIGN_HULLS[hull].defaults, controls, facets });

describe('the working lights', () => {
  it('advanced: every hull type has the overhead panel (two switches), both floods, no rail lights (owner: not for now); the recipe checks out', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++)
      for (const facets of DESIGN_HULLS[hull].open ? [] : [0, 1]) {
        // (Not an open boat: no roof for the panel and floods.)
        useDesign(typeOf(hull, 1, facets));
        expect(validateRecipe(RECIPES.design, LIBRARY), `${hull}`).toEqual([]);
        const got = ids();
        expect(got.filter((i) => i === 'light.flood'), `${hull}`).toHaveLength(2);
        expect(got, `${hull}`).not.toContain('light.rail');
        const panel = RECIPES.design.modules.find((m) => m.socket === 'overhead')!;
        expect(panel.module).toBe('panel.overhead');
        expect(panel.modules!.map((m) => m.bind?.value)).toEqual(['lights.deckFore', 'lights.deckAft']);
        // The floods stand on her roof, inside its edges, and aim down at her decks.
        const floods = RECIPES.design.modules.filter((m) => m.module === 'light.flood');
        for (const f of floods) {
          const c = f.config as { end: 'fore' | 'aft'; lamps: Record<string, { position: number[]; target: number[] }> };
          const l = c.lamps[c.end];
          expect(l.target[1], `${hull}`).toBeLessThan(l.position[1] - 0.5);
          expect(Math.sign(l.target[2] - l.position[2]), `${hull} ${c.end}`).toBe(c.end === 'fore' ? -1 : 1);
        }
      }
  });

  it('basic: none of them', () => {
    useDesign(typeOf(0, 0));
    const got = ids();
    expect(got).not.toContain('light.flood');
    expect(got).not.toContain('light.rail');
    expect(got).not.toContain('panel.overhead');
  });
});

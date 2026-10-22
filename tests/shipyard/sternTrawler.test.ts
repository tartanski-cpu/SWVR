/**
 * The stern trawler (owner, Oct 2026: step 3 toward a trawler like the 24 m reference GA): the
 * Shipyard's sixth hull type. A 20 m hard-chine steel hull with a whaleback forward, the house
 * forward of a long working deck, and the trawl gear (A-frame, net drum, trawl winches) and
 * fish hold fitted as she comes. Beyond the short code's hull types, so she travels as a link
 * or file; every earlier code is unchanged.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { useDesign } from '../../src/boats/sims';
import { validateRecipe } from '../../src/modular/recipe';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, encodeDesign, HULL_TYPES, type ShipDesign } from '../../src/shipyard/design';
import { designToken, readDesign, shortCode } from '../../src/shipyard/designDoc';
import { TYPE_FACTS } from '../../src/shipyard/typeFit';
import { uprightHydrostatics } from '../../src/vessel/hydrostatics';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';

afterAll(() => useDesign(DEFAULT_DESIGN));

const ST = DESIGN_HULLS.findIndex((h) => h.name.startsWith('Stern trawler'));
const trawler = (more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[ST].defaults, hull: ST, ...more });
const has = (id: string) => RECIPES.design.modules.some((m) => m.module === id);

describe('the stern trawler: a sixth hull type', () => {
  it('is in the lists; travels as a link or file, not the short code; the earlier types still code', () => {
    expect(ST).toBe(HULL_TYPES - 1);
    expect(TYPE_FACTS).toHaveLength(HULL_TYPES);
    expect(TYPE_FACTS[ST].goodFor).toContain('trawl');
    expect(shortCode(trawler())).toBeNull();
    expect(() => encodeDesign(trawler())).toThrow(/link or file/);
    expect(readDesign(designToken(trawler()))).toMatchObject({ design: trawler(), warnings: [] });
    for (let hull = 0; hull < ST; hull++) expect(() => encodeDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull })).not.toThrow();
  });

  it('builds as she comes: steel, about 20 m, heavy and deep, level on her lines, stable, no warnings; the trawl gear and fish hold fitted, her recipe holding', () => {
    const boat = useDesign(trawler());
    expect(boat.warnings).toEqual([]);
    expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
    const f = boat.figures;
    expect(f.material).toBe('steel');
    expect(f.lengthM).toBeGreaterThan(18);
    expect(f.lengthM).toBeLessThan(22);
    expect(f.massT).toBeGreaterThan(90);
    expect(f.draughtM).toBeGreaterThan(1.8);
    expect(f.freeboardM).toBeGreaterThan(1.2);
    expect(f.gmM).toBeGreaterThan(1);
    const h = uprightHydrostatics(VESSEL_DEFS.design);
    expect(Math.abs(h.sinkage)).toBeLessThan(0.03);
    for (const id of ['deck.a-frame', 'deck.net-drum', 'deck.trawl-winches', 'hold.fish']) expect(has(id), id).toBe(true);
  });

  it('every length on her slider builds without warnings', () => {
    for (const length of [0, 8, 15]) {
      const boat = useDesign(trawler({ length }));
      expect(boat.warnings, `length step ${length}`).toEqual([]);
      expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
    }
  });
});

/** A three-facet wheelhouse front (owner: a tug's pilot house): its code, its shape, the helm aft of its corners. */
import { describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { validateRecipe } from '../../src/modular/recipe';
import { CONFIG } from '../../src/config';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, type ShipDesign } from '../../src/shipyard/design';
import { facetDz } from '../../src/vessel/view/hullMesh';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';

const BASE: ShipDesign = { ...DEFAULT_DESIGN, guard: 0 };
const typeOf = (hull: number): ShipDesign => ({ ...BASE, hull, ...DESIGN_HULLS[hull].defaults });

describe('a three-facet front', () => {
  it('flat keeps the code as it was; facets read back with the rest', () => {
    expect(encodeDesign(BASE).replace(/-/g, '')).toHaveLength(17);
    const d = { ...BASE, facets: 1, skiff: 3, noAnchor: 1, rails: 1, guard: 4, dhLength: 2, dhHeight: 1, dhWidth: 0, dhRake: 0, dhNarrow: 1 };
    expect(decodeDesign(encodeDesign(d))).toEqual({ design: d });
    expect(decodeDesign(encodeDesign({ ...d, facets: 0 }))).toEqual({ design: { ...d, facets: 0 } });
    // With the later hull types (the small tug) too.
    const tug = { ...d, hull: 4 };
    expect(decodeDesign(encodeDesign(tug))).toEqual({ design: tug });
  });

  it('the middle pane square across, the outer two angled back to the sides; the console and helm that much further aft', () => {
    for (const hull of [2, 3]) {
      const flat = useDesign(typeOf(hull));
      const flatStand = flat.hull.helm.stand[2];
      const b = useDesign({ ...typeOf(hull), facets: 1 });
      expect(b.warnings, `${hull}`).toEqual([]);
      expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
      const wh = VESSEL_DEFS.design.layout.wheelhouse!;
      const f = wh.shape!.facet!;
      expect(f.centre).toBe(0.5);
      expect(f.depth).toBeCloseTo((wh.halfWidth - 0.5) * Math.tan((CONFIG.shipyard.facetDeg * Math.PI) / 180), 2);
      const dz = facetDz(wh);
      expect(dz(0)).toBe(0);
      expect(dz(0.5)).toBe(0);
      expect(dz(wh.halfWidth)).toBeCloseTo(f.depth, 6);
      expect(b.hull.helm.stand[2]).toBeCloseTo(flatStand + f.depth, 6);
      expect(flat.warnings).toEqual([]);
    }
  });

  it('a house too short for it stays flat, saying why', () => {
    const b = useDesign({ ...typeOf(2), houseLength: 0, facets: 1 });
    expect(b.warnings.join(' ')).toMatch(/too short for a faceted front/);
    expect(VESSEL_DEFS.design.layout.wheelhouse!.shape!.facet).toBeUndefined();
  });
});

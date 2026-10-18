/** A three-facet wheelhouse front (owner: a tug's pilot house): its code, its shape, the helm aft of its corners. */
import { describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { validateRecipe } from '../../src/modular/recipe';
import { CONFIG } from '../../src/config';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, type ShipDesign } from '../../src/shipyard/design';
import { facetDz } from '../../src/vessel/view/hullMesh';
import { CONSOLE, type ConsoleConfig } from '../../src/modules/console';
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

  it('the middle pane square across, the outer two angled back to the sides; the dash wraps round with them, the helm where it was', () => {
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
      expect(b.hull.helm.stand[2]).toBeCloseTo(flatStand, 6);
      // The console's wings: set back as the windows are, their slots turned along them.
      const helm = RECIPES.design.modules.find((m) => m.socket === 'helm')!;
      const cc = helm.config as ConsoleConfig;
      expect(cc.wrap!.centre).toBe(0.5);
      expect(cc.wrap!.k).toBeCloseTo(f.depth / (wh.halfWidth - 0.5), 3);
      const flatSlots = Object.fromEntries(CONSOLE.sockets!({ ...cc, wrap: undefined }).map((s) => [s.id, s.transform]));
      let wings = 0;
      for (const s of CONSOLE.sockets!(cc)) {
        const [x, , z] = s.transform.position;
        const flatZ = flatSlots[s.id].position[2];
        if (Math.abs(x) <= 0.5) expect(z, s.id).toBeCloseTo(flatZ, 6);
        else {
          wings++;
          expect(z, s.id).toBeCloseTo(flatZ + (Math.abs(x) - 0.5) * cc.wrap!.k, 6);
          expect(Math.sign(s.transform.rotationDeg![1]), s.id).toBe(x < 0 ? 1 : -1);
        }
      }
      expect(wings).toBeGreaterThan(3);
      expect(flat.warnings).toEqual([]);
    }
  });

  it('a house too short for it stays flat, saying why', () => {
    const b = useDesign({ ...typeOf(2), houseLength: 0, facets: 1 });
    expect(b.warnings.join(' ')).toMatch(/too short for a faceted front/);
    expect(VESSEL_DEFS.design.layout.wheelhouse!.shape!.facet).toBeUndefined();
  });
});

describe('a deckhouse under a faceted house', () => {
  it('is faceted too: its front square across the middle, its corners cut back at the same angle; always wider than the house over it', () => {
    for (const dhNarrow of [0, 1]) {
      useDesign({ ...typeOf(3), facets: 1, dhLength: 4, dhHeight: 1, dhWidth: 0, dhRake: 0, dhNarrow });
      const l = VESSEL_DEFS.design.layout;
      const dh = l.deckhouse!;
      const wh = l.wheelhouse!;
      const tan = Math.tan((CONFIG.shipyard.facetDeg * Math.PI) / 180);
      // At its front, the middle only; along the cut, the angle.
      expect(dh.plan[0][1]).toBeCloseTo(0.5, 2);
      for (const [z, w] of dh.plan) expect(w).toBeLessThanOrEqual(0.5 + (z - dh.z0) / tan + 0.01);
      // Under the house: at least as wide as its faceted outline.
      const dz = facetDz(wh);
      for (const [z, w] of dh.plan) if (z >= wh.front) for (let x = 0; x <= wh.halfWidth; x += 0.1) if (z >= wh.front + dz(x)) expect(w, `${dhNarrow} ${z}`).toBeGreaterThanOrEqual(Math.min(x, wh.halfWidth) - 0.01);
    }
  });
});

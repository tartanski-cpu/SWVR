/**
 * More front windows on a wide wheelhouse (owner, Oct 2026: "as you stretch, the windows
 * should multiply"; CONFIG.shipyard.frontWindows, build.ts frontMullions).
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { buildDesign, DESIGN_HULLS, facetCentre, frontMullions } from '../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../src/shipyard/design';

const fw = CONFIG.shipyard.frontWindows;
/** The panes' widths for a house `hw` half wide (walls 0.05), flat or faceted. */
const panes = (hw: number, centre?: number) => {
  const xs = [-(hw - 0.05), ...frontMullions(hw, 0.05, centre), hw - 0.05];
  return xs.slice(1).map((b, i) => b - xs[i]);
};

describe('front windows on a wide wheelhouse', () => {
  it('a usual house keeps its three panes, mullions at +-0.5 m', () => {
    expect(frontMullions(1.2, 0.05)).toEqual([-0.5, 0.5]);
    expect(frontMullions(0.5 + 0.05 + fw.paneMax, 0.05)).toEqual([-0.5, 0.5]);
  });

  it('wider: an odd number of equal panes, none wider than the most, a pane in front of the helm', () => {
    for (const hw of [1.8, 2.2, 2.6, 3.0]) {
      const p = panes(hw);
      expect(p.length % 2, `hw ${hw}`).toBe(1);
      expect(p.length).toBeGreaterThan(3);
      expect(p.length).toBeLessThanOrEqual(fw.maxPanes);
      for (const w of p) expect(w).toBeCloseTo(p[0], 2);
      expect(Math.max(...p)).toBeLessThanOrEqual(fw.paneMax + 1e-6);
    }
  });

  it('faceted: the side facets kept short, the middle facet split into panes', () => {
    expect(facetCentre(1.0)).toBe(0.5); // a narrow house: as before
    const hw = 2.4;
    const c = facetCentre(hw);
    expect(hw - c).toBeCloseTo(fw.sideFacet, 6);
    const m = frontMullions(hw, 0.05, c);
    expect(m[0]).toBe(-c);
    expect(m[m.length - 1]).toBe(c);
    expect(m.length).toBeGreaterThan(2);
  });

  it("the Shipyard's wide houses carry their mullions; a usual one doesn't", () => {
    const tug: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[4].defaults, hull: 4 };
    const narrow = buildDesign({ ...tug, houseWidth: 0.5 }).hull.layout.wheelhouse!;
    const wide = buildDesign({ ...tug, houseWidth: 1 }).hull.layout.wheelhouse!;
    if (wide.halfWidth - 0.5 - wide.wall > fw.paneMax) expect(wide.frontMullions!.length).toBeGreaterThan(2);
    if (narrow.halfWidth - 0.5 - narrow.wall <= fw.paneMax) expect(narrow.frontMullions).toBeUndefined();
  });
});

/**
 * Faceted aft windows (owner, Oct 2026: "an additional option that you can have rear windows
 * faceted in the same way" as the three-facet front): the house shape (HouseShape.aftFacet), what
 * stands in the aft corners brought inside them (hullDef.ts intoFacets), the floor walked cut
 * back to them (layout.ts), when it's left flat, and the code.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, encodeDesign, type ShipDesign } from '../../src/shipyard/design';
import { placeFurniture } from '../../src/shipyard/furnishing';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { vesselWalkArea } from '../../src/vessel/layout';

afterAll(() => useDesign(DEFAULT_DESIGN));
const typeOf = (hull: number, more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, aftFacets: 1, ...more });

describe('faceted aft windows', () => {
  it('every hull type: faceted as the front is, and everything inside the house stays inside the angled corners', () => {
    for (const [hull, t] of DESIGN_HULLS.entries()) {
      if (t.retired) continue;
      for (const more of [{}, { twin: 1, sideDoor: 1 }, { saloon: 6, controls: 1 }]) {
        let d = typeOf(hull, more);
        useDesign(d);
        let wh = VESSEL_DEFS.design.layout.wheelhouse!;
        // A locker and a berth put in the aft corners.
        const F = wh.floorY;
        const hx = wh.x ?? 0;
        const transom = VESSEL_DEFS.design.hull.stations[0].z;
        d = { ...d, ...placeFurniture('lockerAt', [hx + wh.halfWidth - 0.4, F, wh.aft - 0.3], transom), ...placeFurniture('berthAt', [hx - wh.halfWidth + 0.5, F, wh.aft - 0.4], transom) };
        const b = buildDesign(d);
        useDesign(d);
        wh = VESSEL_DEFS.design.layout.wheelhouse!;
        const f = wh.shape!.aftFacet!;
        expect(f, t.name).toBeTruthy();
        expect(f.depth).toBeCloseTo(wh.shape!.facet ? wh.shape!.facet.depth : f.depth, 6);
        const k = f.depth / (wh.halfWidth - f.centre);
        const inner = (x: number) => wh.aft - wh.wall - Math.max(0, Math.abs(x - hx) - f.centre) * k;
        const stow = Object.entries(b.hull.fittings?.stowage ?? {}).map(([id, v]) => [id, Array.isArray(v) ? v : (v as { at: number[] }).at] as const);
        const pts = [...b.hull.sockets.filter((s) => s.id !== 'doorOut').map((s) => [s.id, s.transform?.position] as const), ...stow];
        for (const [id, p] of pts) {
          if (!p || Math.abs(p[0] - hx) >= wh.halfWidth || p[2] <= wh.front || p[2] >= wh.aft + 0.05 || p[1] < F - 0.3) continue;
          expect(p[2], `${t.name} ${JSON.stringify(more)}: ${id}`).toBeLessThanOrEqual(inner(p[0]) + 0.02);
        }
      }
    }
  });

  it('the floor walked stops at the angled walls: the aft corner is off it, the doorway still on', () => {
    const d = typeOf(3);
    useDesign(d);
    const def = VESSEL_DEFS.design;
    const wh = def.layout.wheelhouse!;
    const walk = vesselWalkArea(def, def.layout);
    const hx = wh.x ?? 0;
    const corner = { x: hx + wh.halfWidth - 0.35, z: wh.aft - 0.35 };
    expect(walk.walkable(corner.x, corner.z, wh.floorY)).toBe(false);
    expect(walk.walkable(hx, wh.aft - 0.45, wh.floorY)).toBe(true);
    useDesign({ ...d, aftFacets: 0 });
    const flat = VESSEL_DEFS.design;
    expect(vesselWalkArea(flat, flat.layout).walkable(corner.x, corner.z, flat.layout.wheelhouse!.floorY)).toBe(true);
  });

  it('left flat with a cockpit overhead or a house too narrow; travels as a link or file', () => {
    const flat = (more: Partial<ShipDesign>) => {
      const b = buildDesign(typeOf(3, more));
      useDesign(typeOf(3, more));
      return { b, f: VESSEL_DEFS.design.layout.wheelhouse!.shape?.aftFacet };
    };
    expect(flat({ overhead: 6 }).f).toBeUndefined();
    expect(flat({ houseWidth: 0.4 }).f).toBeUndefined();
    expect(() => encodeDesign(typeOf(3))).toThrow(/faceted aft windows/);
  });

  it('with windows raked out all round too (owner: "a proper wheelhouse"): faceted, and they lean out with the rest', () => {
    for (const hull of [3, 4]) {
      const d = typeOf(hull, { flare: 1, facets: 1 });
      const b = buildDesign(d);
      useDesign(d);
      const sh = VESSEL_DEFS.design.layout.wheelhouse!.shape!;
      expect(sh.aftFacet).toBeTruthy();
      expect(sh.flare).toBeTruthy();
      expect(b.warnings.join(' ')).not.toMatch(/aft windows/);
    }
  });
});

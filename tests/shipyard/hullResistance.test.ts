/**
 * Each type's resistance and the catamaran's weight (owner, Oct 2026, through the hull chat):
 * the tug and the trawler, displacement hulls, on a curve that keeps climbing past their hull
 * speed (vessel/displacementHull.ts); the others as before; the cat's plating lighter
 * (CONFIG.shipyard.catamaran.scantlings), so she weighs what real work cats of her length do.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';

afterAll(() => useDesign(DEFAULT_DESIGN));
const as = (hull: number, more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, ...more });

describe('hull resistance by type', () => {
  it('the tug and the trawler take the displacement hull curve; the planing types do not', () => {
    for (const [hull, t] of DESIGN_HULLS.entries()) {
      // (A catamaran's resistance is her two slim hulls': vessel/catamaran.ts.)
      if (t.retired || t.catamaran) continue;
      useDesign(as(hull));
      const r = VESSEL_DEFS.design.resistance;
      if (t.regime === 'displacement') expect(r.waveCap, t.name).toBe(CONFIG.displacementHull.resistance.waveCap);
      else expect(r.waveCap, t.name).not.toBe(CONFIG.displacementHull.resistance.waveCap);
    }
  });

  it('the catamaran is about 12.5 to 14 t light at her standard size, twin 400 kW as she comes (real work cats of her length: 11 to 13 t)', () => {
    const d = as(6);
    expect(d.engine).toBe(2);
    const b = buildDesign(d);
    const light = b.weights.items.filter((i) => !/^(Fuel|Crew)/.test(i.name)).reduce((a, i) => a + i.kg, 0) / 1000;
    expect(light).toBeGreaterThan(11);
    expect(light).toBeLessThan(14);
  });
});

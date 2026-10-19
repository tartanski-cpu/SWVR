/**
 * Shipyard boats float at what they weigh (owner, Oct 2026): built of steel or aluminium, her
 * parts weighed (hull, houses, machinery, gear, fit-out, load), her lines raised or lowered
 * until she displaces that weight.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { buildDesign, DESIGN_HULLS, materialOf } from '../../src/shipyard/build';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, type ShipDesign } from '../../src/shipyard/design';
import { matchGear } from '../../src/shipyard/trial';
import { uprightHydrostatics } from '../../src/vessel/hydrostatics';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';

afterAll(() => useDesign(DEFAULT_DESIGN));

const type = (hull: number, more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, ...more });

describe('what she is built of, and what she weighs', () => {
  it('each hull type is its own material, the workboat either', () => {
    expect([0, 1, 3, 4].map((h) => materialOf(type(h, { material: 1 })))).toEqual(['aluminium', 'steel', 'aluminium', 'steel']);
    expect([0, 1, 3, 4].map((h) => materialOf(type(h, { material: 0 })))).toEqual(['aluminium', 'steel', 'aluminium', 'steel']);
    expect(materialOf(type(2, { material: 0 }))).toBe('aluminium');
    expect(materialOf(type(2, { material: 1 }))).toBe('steel');
    // In her code (version 21), both ways.
    const steel = type(2, { material: 1 });
    expect(decodeDesign(encodeDesign(steel))).toEqual({ design: steel });
  });

  it('every hull type floats level at what her parts weigh, stable, with freeboard', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++) {
      const boat = useDesign(type(hull));
      const w = boat.weights;
      expect(w.massKg, `hull ${hull}`).toBe(w.items.reduce((a, it) => a + it.kg, 0));
      expect(VESSEL_DEFS.design.mass, `hull ${hull}`).toBe(w.massKg);
      const h = uprightHydrostatics(VESSEL_DEFS.design);
      expect(Math.abs(h.sinkage), `hull ${hull} sinkage`).toBeLessThan(0.02);
      expect(Math.abs(h.lcgMinusLcb), `hull ${hull} trim`).toBeLessThan(0.02);
      expect(h.gmt, `hull ${hull} GM`).toBeGreaterThan(0.5);
      expect(boat.figures.freeboardM, `hull ${hull}`).toBeGreaterThan(0.6);
      expect(boat.warnings, `hull ${hull}`).toEqual([]);
    }
  });

  it('the workboat in steel: heavier, deeper, cheaper, carries less and goes slower than in aluminium', () => {
    const al = buildDesign(type(2, { material: 0 }));
    const fe = buildDesign(type(2, { material: 1 }));
    expect(fe.figures.massT).toBeGreaterThan(1.5 * al.figures.massT);
    expect(fe.figures.draughtM).toBeGreaterThan(al.figures.draughtM + 0.15);
    expect(fe.figures.freeboardM).toBeLessThan(al.figures.freeboardM);
    expect(fe.figures.price).toBeLessThan(al.figures.price);
    expect(fe.hull.cargo.maxPayloadKg).toBeLessThan(al.hull.cargo.maxPayloadKg);
    expect(matchGear(type(2, { material: 1 })).knots).toBeLessThan(0.8 * matchGear(type(2, { material: 0 })).knots);
  });

  it('her houses count: a deckhouse adds its weight and she floats deeper for it', () => {
    const plain = buildDesign(type(3, { dhLength: 0 }));
    const dh = buildDesign(type(3, { dhLength: 5, dhHeight: 2 }));
    const kg = dh.weights.items.find((it) => it.name === 'Deckhouse')!.kg;
    expect(kg).toBeGreaterThan(300);
    expect(dh.weights.massKg).toBeCloseTo(plain.weights.massKg + kg, -2);
    expect(dh.figures.draughtM).toBeGreaterThan(plain.figures.draughtM);
  });
});

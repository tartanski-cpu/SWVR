/**
 * Her hull's finish (owner, Oct 2026: "pre-configure a boat to look used or new"): as new,
 * worked or well used, how much the weathering tile shows on her topsides; well used as every
 * boat looked before; not in the short code.
 */
import * as THREE from 'three';
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { DESIGN_HULLS, liveryOf } from '../../src/shipyard/parts/catalog';
import { DEFAULT_DESIGN, encodeDesign, FINISHES, type ShipDesign } from '../../src/shipyard/design';
import { designToken, readDesign, shortCode } from '../../src/shipyard/designDoc';
import { VESSEL_DEFS, wetOutlet } from '../../src/vessel/vesselDef';
import { buildVesselMeshParts } from '../../src/vessel/view/hullMesh';

afterAll(() => useDesign(DEFAULT_DESIGN));

const plain: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[1].defaults, hull: 1 };
const asNew = FINISHES.indexOf('As new');
const worked = FINISHES.indexOf('Worked');

describe('her finish', () => {
  it('well used as before, worked half, as new plain paint', () => {
    expect(FINISHES.length).toBe(CONFIG.shipyard.finish.length);
    expect(DEFAULT_DESIGN.finish).toBe(0);
    expect(liveryOf(plain).weathering).toBe(CONFIG.pixelPaint.weathering.strength);
    expect(liveryOf({ ...plain, finish: worked }).weathering).toBe(0.5);
    expect(liveryOf({ ...plain, finish: asNew }).weathering).toBe(0);
  });

  it('her hull is drawn with it', () => {
    for (const finish of [0, worked, asNew]) {
      useDesign({ ...plain, finish });
      const def = VESSEL_DEFS.design;
      const m = buildVesselMeshParts(def.hull, def.layout, wetOutlet(def), def.livery).hull.material as THREE.Material;
      expect((m.userData.paintWeathering as { value: number }).value).toBe(CONFIG.shipyard.finish[finish]);
    }
  });

  it('well used keeps her short code; another finish travels as a link or file, and comes back', () => {
    expect(shortCode(plain)).not.toBeNull();
    const d = { ...plain, finish: asNew };
    expect(() => encodeDesign(d)).toThrow(/link or file/);
    expect(readDesign(designToken(d))).toMatchObject({ design: { finish: asNew } });
  });
});

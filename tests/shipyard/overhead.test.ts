/**
 * Parametric boats P2b, third stop (owner): a cockpit overhead with wings. The house's aft roof
 * carried on aft over the working deck (design.overhead), on a wing each side just inside the
 * bulwarks: full height from the house to a knee on the deck, then sweeping up to the roof's
 * aft edge. It's fitted round the deck gear, walked under, solid where it is, and drawn.
 */
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, SCALES, type ShipDesign } from '../../src/shipyard/design';
import { designToken, readDesign, shortCode } from '../../src/shipyard/designDoc';
import { vesselWalkArea } from '../../src/vessel/layout';
import { houseRoofAt, VESSEL_DEFS, wingCurveY } from '../../src/vessel/vesselDef';
import { buildVesselMeshParts } from '../../src/vessel/view/hullMesh';
import { fakeCanvas } from '../modular/fakes';

beforeAll(fakeCanvas);
afterAll(() => useDesign(DEFAULT_DESIGN));

const PILOT = 3;
const type = (hull: number, more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, ...more });
const pilot = type(PILOT, { overhead: 8 }); // 2 m

describe('the cockpit overhead', () => {
  it('travels as a link or file (not in the short code); none is as before', () => {
    expect(DEFAULT_DESIGN.overhead).toBe(0);
    expect(shortCode(pilot)).toBeNull();
    expect(readDesign(designToken(pilot))).toMatchObject({ design: pilot, warnings: [] });
    expect(buildDesign(type(PILOT)).hull.layout.overhead).toBeUndefined();
  });

  it('the house’s aft roof carried on aft as far as asked, the deck’s width, its weight and price counted', () => {
    const plain = buildDesign(type(PILOT));
    const b = buildDesign(pilot);
    const wh = b.hull.layout.wheelhouse!;
    const oh = b.hull.layout.overhead!;
    expect(b.warnings).toEqual([]);
    expect(oh.z0).toBeCloseTo(wh.aft, 3);
    expect(oh.z1 - oh.z0).toBeCloseTo(SCALES.overhead(8), 3);
    expect(oh.y).toBeCloseTo(houseRoofAt(wh, wh.aft - 0.01), 3);
    expect(oh.halfWidth).toBeGreaterThan(wh.halfWidth);
    expect(oh.kneeZ).toBeGreaterThan(oh.z0);
    expect(oh.kneeZ).toBeLessThan(oh.z1);
    expect(oh.y - oh.deckY).toBeGreaterThan(CONFIG.shipyard.overhead.minHeadroom);
    expect(b.weights.massKg).toBeGreaterThan(plain.weights.massKg);
    expect(b.figures.price).toBeGreaterThan(plain.figures.price);
  });

  it('fitted round the deck gear: short of the transom and a pole, not over a deck crane’s aft deck', () => {
    const lc = buildDesign(type(0, { overhead: 16 }));
    const st = lc.hull.form;
    expect(lc.hull.layout.overhead).toBeDefined();
    expect(lc.warnings.join(' ')).toMatch(/stops short of the transom/);
    expect(st).toBeDefined();
    const crane = buildDesign(type(PILOT, { overhead: 8, deckCrane: 2 }));
    expect(crane.hull.layout.overhead).toBeUndefined();
    expect(crane.warnings.join(' ')).toMatch(/deck crane works her aft deck/);
  });

  it('is walked under, and solid where it is: the roof, and the wings along the deck edge', () => {
    useDesign(pilot);
    const def = VESSEL_DEFS.design;
    const oh = def.layout.overhead!;
    const area = vesselWalkArea(def, def.layout, []);
    const zMid = (oh.z0 + oh.z1) / 2;
    // Standing under it on the deck: open air, a step under it the deck's walkable.
    expect(area.insideSolid(0, oh.deckY + 1.6, zMid)).toBe(false);
    expect(area.walkable(0, zMid + 0.2, area.floorsAt(0, zMid + 0.2)[0])).toBe(true);
    // Its roof.
    expect(area.insideSolid(0, oh.y + oh.thickness / 2, zMid)).toBe(true);
    expect(area.insideSolid(0, oh.y + oh.thickness + 0.1, zMid)).toBe(false);
    // A wing: solid full height forward of its knee; aft of it, above its sweep only.
    const xw = oh.halfWidth - oh.wing / 2;
    expect(area.insideSolid(xw, oh.deckY + 1.0, (oh.z0 + oh.kneeZ) / 2)).toBe(true);
    const zAft = oh.z1 - 0.1;
    expect(area.insideSolid(xw, wingCurveY(oh, zAft) + 0.05, zAft)).toBe(true);
    expect(area.insideSolid(xw, oh.deckY + 0.3, zAft)).toBe(false);
    // Off the wing, inboard of it: open.
    expect(area.insideSolid(xw - 0.3, oh.deckY + 1.0, (oh.z0 + oh.kneeZ) / 2)).toBe(false);
  });

  it('is drawn: the roof slab over the deck aft of the house, and a wing each side', () => {
    useDesign(pilot);
    const def = VESSEL_DEFS.design;
    const oh = def.layout.overhead!;
    const house = buildVesselMeshParts(def.hull, def.layout, def.exhaust?.position, def.livery).house!;
    const pos = house.geometry.getAttribute('position');
    let roofTop = -Infinity;
    let wingOut = 0;
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      if (v.z > oh.z0 + 0.3 && v.z <= oh.z1 + 1e-6) {
        roofTop = Math.max(roofTop, v.y);
        if (v.y < oh.deckY + 0.2 && Math.abs(Math.abs(v.x) - oh.halfWidth) < 1e-3) wingOut++;
      }
    }
    expect(roofTop).toBeCloseTo(oh.y + oh.thickness, 2);
    expect(wingOut).toBeGreaterThan(0);
  });
});

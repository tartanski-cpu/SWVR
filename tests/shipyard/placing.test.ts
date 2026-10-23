/**
 * Placing by pointing (owner, Oct 2026: "an easy way to place and move equipment"): placing.ts
 * previewPlace says, from the builder itself, whether a piece stands where it's pointed, where,
 * and why not.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';
import { equipmentOf } from '../../src/shipyard/pinGear';
import { previewPlace, type Target } from '../../src/shipyard/placing';
import { hullPlan } from '../../src/vessel/layout';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';

afterAll(() => useDesign(DEFAULT_DESIGN));

const netter: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[1].defaults, hull: 1 };
const setUp = (d: ShipDesign) => {
  const b = useDesign(d);
  const wh = b.hull.layout.wheelhouse!;
  const plan = hullPlan(VESSEL_DEFS.design);
  return { b, wh, plan, house: { front: wh.front, aft: wh.aft, halfWidth: wh.halfWidth, x: wh.x } };
};
const gear = (id: string): Target => ({ kind: 'gear', eq: equipmentOf(id)! });

describe('placing by pointing', () => {
  it('the deck crane: green on clear deck, put right there; red over the wheelhouse, saying why', () => {
    const { wh, plan, house } = setUp(netter);
    const z = (wh.aft + plan.transom) / 2;
    const on = previewPlace(netter, gear('deckCrane'), [1, plan.deckY(z), z], house, plan.transom, buildDesign);
    expect(on.ok).toBe(true);
    expect(on.at[0]).toBeCloseTo(1, 1);
    expect(on.at[2]).toBeCloseTo(z, 0);
    expect(buildDesign({ ...netter, ...on.patch }).placed.craneAt).toBeTruthy();
    const zh = (wh.front + wh.aft) / 2;
    const off = previewPlace(netter, gear('deckCrane'), [0, wh.roofY, zh], house, plan.transom, buildDesign);
    expect(off.ok).toBe(false);
    expect(off.words).toMatch(/wheelhouse/);
  });

  it('over her side: red, "over her side"', () => {
    const { wh, plan, house } = setUp(netter);
    const z = (wh.aft + plan.transom) / 2;
    const p = previewPlace(netter, gear('towWinch'), [plan.halfBeam(z) + 0.4, plan.deckY(z), z], house, plan.transom, buildDesign);
    // (Within a metre of a cell that stands, it's moved there; else red with the reason.)
    if (p.ok) expect(p.words).toMatch(/moved/);
    else expect(p.words).toMatch(/side|gear|transom/);
  });

  it('a berth: green inside the wheelhouse, red outside it', () => {
    const { wh, plan, house } = setUp(netter);
    const t: Target = { kind: 'furniture', key: 'berthAt' };
    const inside = previewPlace(netter, t, [-(wh.halfWidth - 0.4), wh.floorY, (wh.front + wh.aft) / 2 + 0.3], house, plan.transom, buildDesign);
    expect(inside.ok, inside.words).toBe(true);
    const z = (wh.aft + plan.transom) / 2;
    const outside = previewPlace(netter, t, [0, plan.deckY(z), z], house, plan.transom, buildDesign);
    expect(outside.ok).toBe(false);
    expect(outside.words).toMatch(/not inside/);
  });
});

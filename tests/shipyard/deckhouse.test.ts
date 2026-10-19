/** A deckhouse under the wheelhouse (pilot and rescue boats): built, walked round, weighed, coded. */
import { describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { deckRoom } from '../../src/shipyard/deckRoom';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, placeValue, SCALES } from '../../src/shipyard/design';
import { deckhouseHalfWidth } from '../../src/vessel/deckhouse';
import { hullPlan, vesselWalkArea } from '../../src/vessel/layout';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { footprintsOf } from '../../src/boats/sims';

const PILOT = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[3].defaults, hull: 3, guard: 0 };
const WITH = { ...PILOT, dhLength: 5, dhHeight: 2, dhWidth: 0, dhRake: 1 };

describe('the deckhouse', () => {
  it('codes: none keeps the code as it was; one adds a couple of characters and reads back', () => {
    expect(encodeDesign(PILOT).replace(/-/g, '')).toHaveLength(17);
    const code = encodeDesign(WITH);
    expect(code.replace(/-/g, '').length).toBeGreaterThan(17);
    expect(code.replace(/-/g, '').length).toBeLessThanOrEqual(20);
    expect(decodeDesign(code)).toEqual({ design: WITH });
    // With gear placed by hand too.
    const both = { ...WITH, towWinch: 1, winchAt: placeValue('winchAt', 0, 1, 2) };
    expect(decodeDesign(encodeDesign(both))).toEqual({ design: both });
  });

  it('stands from the wheelhouse’s aft wall forward, out to her sides; the wheelhouse on top, steps up to its door', () => {
    const b = useDesign(WITH);
    const def = VESSEL_DEFS.design;
    const dh = def.layout.deckhouse!;
    const wh = def.layout.wheelhouse!;
    const plan = hullPlan(def);
    expect(dh.z1).toBeCloseTo(wh.aft - 0.02, 6);
    expect(dh.z0).toBeCloseTo(wh.front - SCALES.dhLength(5), 6);
    // Full width: just inside her deck edge, never narrower than the house over it.
    const mid = (wh.front + wh.aft) / 2;
    expect(deckhouseHalfWidth(dh, mid)).toBeCloseTo(plan.halfBeam(mid) - 0.12, 2);
    expect(deckhouseHalfWidth(dh, mid)).toBeGreaterThanOrEqual(wh.halfWidth);
    expect(wh.floorY).toBeCloseTo(dh.top + 0.02, 6);
    expect(dh.top - plan.deckY(wh.aft)).toBeGreaterThan(0.99);
    expect(dh.well).toBeUndefined();
    expect(wh.steps!.length).toBeGreaterThanOrEqual(2);
    expect(b.warnings.filter((w) => /left off|cut/.test(w))).toEqual([]);
  });

  it('set in, it leaves side decks; the deck under it isn’t walked, and it’s solid', () => {
    useDesign({ ...WITH, dhWidth: 3 });
    const def = VESSEL_DEFS.design;
    const dh = def.layout.deckhouse!;
    const plan = hullPlan(def);
    const z = dh.z0 + 0.5;
    expect(plan.halfBeam(z) - deckhouseHalfWidth(dh, z)).toBeCloseTo(0.7, 2);
    const walk = vesselWalkArea(def, def.layout, footprintsOf({ defId: 'design' }));
    expect(walk.walkable(0, z, plan.deckY(z))).toBe(false); // under it
    expect(walk.walkable(plan.halfBeam(z) - 0.45, z, plan.deckY(z))).toBe(true); // the side deck beside it
    expect(walk.insideSolid(0, plan.deckY(z) + 0.5, z)).toBe(true);
  });

  it('weighs high up (GM drops a little), costs, and takes deck room', () => {
    const a = useDesign(PILOT);
    const roomA = deckRoom();
    const b = useDesign(WITH);
    const roomB = deckRoom();
    expect(b.figures.gmM).toBeLessThan(a.figures.gmM);
    expect(a.figures.gmM - b.figures.gmM).toBeLessThan(0.5); // the house lifted onto it, and its own plate
    expect(b.figures.gmM).toBeGreaterThan(0.5);
    expect(b.figures.price).toBeGreaterThan(a.figures.price);
    expect(roomB.crateRoom).toBeLessThan(roomA.crateRoom);
  });

  it('heights for small boats and big: 0.5 to 1.5 m', () => {
    expect([0, 1, 2, 3, 4].map((i) => SCALES.dhHeight(i))).toEqual([0.5, 0.8, 1.0, 1.2, 1.5]);
  });

  it('the floor height counts from its top: sunk into it, the top is open over the cabin, and the floor is walked', () => {
    // (Its top over her deck at the transom: sunk into it, its top is open over the cabin, so
    // she's a little lighter and floats a few mm higher.)
    const overDeck = () => VESSEL_DEFS.design.layout.deckhouse!.top - VESSEL_DEFS.design.hull.stations[0].polygon[0][1];
    const level = useDesign({ ...WITH, floor: 3 });
    const top = overDeck();
    expect(level.figures.floorOnDeckhouseM).toBeCloseTo(0, 6);
    const sunk = useDesign({ ...WITH, floor: 1 }); // 0.4 m down
    const def = VESSEL_DEFS.design;
    const dh = def.layout.deckhouse!;
    const wh = def.layout.wheelhouse!;
    expect(overDeck()).toBeCloseTo(top, 6);
    expect(sunk.figures.floorOnDeckhouseM).toBeCloseTo(-0.4, 6);
    expect(wh.floorY).toBeCloseTo(dh.top + 0.02 - 0.4, 6);
    expect(dh.well).toBeDefined();
    expect(dh.well!.halfWidth).toBeLessThan(wh.halfWidth);
    const walk = vesselWalkArea(def, def.layout, footprintsOf({ defId: 'design' }));
    const z = (wh.front + wh.aft) / 2 + 0.3;
    expect(walk.walkable(0, z, wh.floorY)).toBe(true);
    expect(walk.insideSolid(0, wh.floorY + 0.5, z)).toBe(false);
    // Raised, it stands higher on it.
    useDesign({ ...WITH, floor: 4 });
    expect(VESSEL_DEFS.design.layout.wheelhouse!.floorY - VESSEL_DEFS.design.hull.stations[0].polygon[0][1]).toBeCloseTo(top + 0.22, 6);
  });

  it('the side door is left off with one (it would open onto its top), saying why', () => {
    expect(useDesign({ ...WITH, sideDoor: 1 }).warnings.join(' ')).toMatch(/deckhouse’s top/);
  });
});

describe('a deckhouse as wide as the wheelhouse', () => {
  const NARROW = { ...WITH, dhNarrow: 1, dhHeight: 0 };
  it('codes: none keeps codes as they were; it reads back, with rails, protection and placed gear', () => {
    expect(decodeDesign(encodeDesign(NARROW))).toEqual({ design: NARROW });
    const more = { ...NARROW, rails: 1, guard: 4, towWinch: 1, winchAt: placeValue('winchAt', 0, 1, 2) };
    expect(decodeDesign(encodeDesign(more))).toEqual({ design: more });
    expect(decodeDesign(encodeDesign({ ...more, dhNarrow: 0 }))).toEqual({ design: { ...more, dhNarrow: 0 } });
  });

  it('stands forward of the house only, no wider; the house on it; a side door onto the side deck (no steps: jumped)', () => {
    const b = useDesign({ ...NARROW, houseWidth: 3, sideDoor: 1 });
    const def = VESSEL_DEFS.design;
    const dh = def.layout.deckhouse!;
    const wh = def.layout.wheelhouse!;
    const plan = hullPlan(def);
    expect(dh.z1).toBeLessThan(wh.front + 0.1);
    for (const [, w] of dh.plan) expect(w).toBeLessThanOrEqual(wh.halfWidth + 0.001);
    expect(wh.floorY).toBeCloseTo(dh.top + 0.02, 6);
    expect(b.warnings.join(' ')).not.toMatch(/side door/);
    expect(wh.sideDoor).toBeDefined();
    // The side deck alongside the house is clear of the deckhouse.
    const walk = vesselWalkArea(def, def.layout, footprintsOf({ defId: 'design' }));
    const z = (wh.sideDoor!.z0 + wh.sideDoor!.z1) / 2;
    expect(walk.insideSolid(-wh.halfWidth - 0.3, plan.deckY(z) + 0.3, z)).toBe(false);
  });

  it('full width still leaves the side door off, saying how to have one', () => {
    expect(useDesign({ ...WITH, sideDoor: 1 }).warnings.join(' ')).toMatch(/as wide as the wheelhouse/);
  });
});

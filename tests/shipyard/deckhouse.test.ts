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
    expect(dh.top - plan.deckY(wh.aft)).toBeGreaterThan(1.0);
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

  it('the side door is left off with one (it would open onto its top), saying why', () => {
    expect(useDesign({ ...WITH, sideDoor: 1 }).warnings.join(' ')).toMatch(/deckhouse’s top/);
  });
});

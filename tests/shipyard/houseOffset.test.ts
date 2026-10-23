/**
 * A wheelhouse offset across her (owner, Oct 2026: on the landing craft, "the ability to offset
 * the wheelhouse when it's narrow enough ... to the port or starboard"; design.houseX): the house
 * and everything in and on it moved across, where you walk with it, the deck it leaves clear.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { useDesign } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { validateRecipe } from '../../src/modular/recipe';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, encodeDesign, type ShipDesign } from '../../src/shipyard/design';
import { hullPlan, vesselWalkArea } from '../../src/vessel/layout';
import { houseFloorAt, VESSEL_DEFS } from '../../src/vessel/vesselDef';

afterAll(() => useDesign(DEFAULT_DESIGN));

const lander = (more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[0].defaults, hull: 0, houseWidth: 0.4, ...more });
let built: ReturnType<typeof useDesign>;
const socketX = (id: string) => built.hull.sockets.find((s) => s.id === id)?.transform?.position?.[0];

describe('a wheelhouse offset across her', () => {
  it('to port as far as her deck allows, its wall inside her deck edge; everything of the house with it', () => {
    const centred = (built = useDesign(lander()));
    const helm0 = socketX('helm')!;
    const b = (built = useDesign(lander({ houseX: 0 })));
    const wh = b.hull.layout.wheelhouse!;
    const hx = wh.x ?? 0;
    expect(hx).toBeLessThan(-0.3);
    expect(b.warnings.join(' ')).toMatch(/can go only .* to port/);
    // Its outer wall inside her deck edge all along it.
    const plan = hullPlan(VESSEL_DEFS.design);
    for (let z = wh.front; z <= wh.aft; z += 0.25) expect(-hx + wh.halfWidth).toBeLessThanOrEqual(plan.halfBeam(z) - CONFIG.shipyard.offsetEdge + 1e-6);
    // The helm, the door's buttons, the cabin light moved across with it.
    expect(socketX('helm')!).toBeCloseTo(helm0 + hx, 2);
    expect(socketX('doorIn')!).toBeCloseTo(0.45 + hx, 2);
    expect(socketX('cabinLight')!).toBeCloseTo(hx, 2);
    expect(centred.hull.layout.wheelhouse!.x).toBeUndefined();
    expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
  });

  it('walked where it stands: its floor inside, its walls solid, the deck on her far side clear', () => {
    const b = useDesign(lander({ houseX: 40 }));
    const def = VESSEL_DEFS.design;
    const wh = b.hull.layout.wheelhouse!;
    const hx = wh.x!;
    expect(hx).toBeGreaterThan(0.3);
    const walk = vesselWalkArea(def, def.layout);
    const plan = hullPlan(def);
    const zMid = wh.aft - 0.6;
    const floor = houseFloorAt(wh, zMid);
    // In the house, across from its middle: its floor.
    expect(walk.walkable(hx, zMid, floor)).toBe(true);
    // Its port wall, where the centreline house's floor was: solid at chest height.
    expect(walk.insideSolid(hx - wh.halfWidth + wh.wall / 2, floor + 0.6, zMid)).toBe(true);
    // Her port side deck, beside it: wide and walked at the deck's height.
    const xDeck = hx - wh.halfWidth - 0.5;
    expect(walk.walkable(xDeck, zMid, plan.deckY(zMid))).toBe(true);
    // Out of its aft door onto the deck behind it.
    expect(walk.walkable(hx, wh.aft + 0.3, plan.deckY(wh.aft + 0.3))).toBe(true);
  });

  it('only on the landing craft, not with a deckhouse; not in the code', () => {
    const tug = useDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[4].defaults, hull: 4, houseX: 0 });
    expect(tug.hull.layout.wheelhouse!.x).toBeUndefined();
    const dh = useDesign(lander({ houseX: 0, dhLength: 1.5 }));
    expect(dh.hull.layout.wheelhouse!.x).toBeUndefined();
    expect(dh.warnings.join(' ')).toMatch(/stays on her centreline/);
    expect(() => encodeDesign({ ...DEFAULT_DESIGN, houseX: 10 })).toThrow(/offset/);
  });
});

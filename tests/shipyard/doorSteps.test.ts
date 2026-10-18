/** The steps at a Shipyard wheelhouse's aft door: climbed, not walked through (owner: in desktop mode you passed through them). */
import { describe, expect, it } from 'vitest';
import { footprintsOf, useDesign } from '../../src/boats/sims';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN } from '../../src/shipyard/design';
import { hullPlan, vesselWalkArea } from '../../src/vessel/layout';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';

const area = () => vesselWalkArea(VESSEL_DEFS.design, VESSEL_DEFS.design.layout, footprintsOf({ defId: 'design' }));

describe('door steps', () => {
  it('outside a raised floor: across their whole width the only floor is the tread, never the deck under it', () => {
    // The pilot boat on a deckhouse: her floor well above the deck, several steps up.
    useDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[3].defaults, hull: 3, dhLength: 4, dhHeight: 2, dhWidth: 0, dhRake: 0 });
    const def = VESSEL_DEFS.design;
    const wh = def.layout.wheelhouse!;
    const steps = wh.steps!;
    expect(steps.length).toBeGreaterThanOrEqual(2);
    const w = area();
    const deck = hullPlan(def).deckY(wh.aft + 0.2);
    for (const st of steps)
      for (const x of [0, 0.2, 0.3, -0.33]) {
        const floors = w.floorsAt(x, (st.z0 + st.z1) / 2);
        // The tread (and at the top one, the doorway's floor a step above: into the cabin).
        expect(floors, `${x} ${st.y}`).toContain(st.y);
        expect(floors.every((f) => f >= st.y - 1e-9), `${x} ${st.y}`).toBe(true);
        expect(floors.some((f) => Math.abs(f - deck) < 0.05)).toBe(false);
      }
    // Each a step up from the one below (or the deck), so they're climbed.
    const ys = [deck, ...steps.map((st) => st.y).sort((a, b) => a - b), wh.floorY];
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeLessThanOrEqual(0.4);
    // Beside them, the deck as before.
    const st = steps[0];
    expect(w.floorsAt(0.9, (st.z0 + st.z1) / 2)).toEqual([hullPlan(def).deckY((st.z0 + st.z1) / 2)]);
  });

  it('inside a deep sunk floor too: no cabin floor under its steps', () => {
    useDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[2].defaults, hull: 2, floor: 0 });
    const wh = VESSEL_DEFS.design.layout.wheelhouse!;
    const steps = wh.steps ?? [];
    if (!steps.length) return; // (a hull too fine there raises it: then there's nothing to check)
    const w = area();
    for (const st of steps)
      for (const x of [0, 0.3]) {
        const floors = w.floorsAt(x, (st.z0 + st.z1) / 2);
        expect(floors, `${x}`).toContain(st.y);
        expect(floors.some((f) => Math.abs(f - wh.floorY) < 1e-6), `${x}`).toBe(false);
      }
  });
});

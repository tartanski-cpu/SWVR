/**
 * More sheer (owner, Oct 2026: "this bow has got quite a lot of sheer. The default one is quite
 * flat"; Shipyard, Hull step; build.ts withSheer).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { LIBRARY, RECIPES } from '../src/boats/library';
import { useDesign } from '../src/boats/sims';
import { validateRecipe } from '../src/modular/recipe';
import { DESIGN_HULLS, withSheer } from '../src/shipyard/build';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import type { Station } from '../src/vessel/hullForm';
import { DEFAULT_DESIGN, encodeDesign, SCALES, type ShipDesign } from '../src/shipyard/design';

afterAll(() => useDesign(DEFAULT_DESIGN));

describe('more sheer', () => {
  it('the deck line: as drawn aft of where it starts, the whole rise at the stem, fair between', () => {
    const line: [number, number][] = [
      [0, 1],
      [1, 1.5],
    ];
    const s = withSheer(line, 0.6);
    const at = (t: number) => s.find(([u]) => Math.abs(u - t) < 1e-9)![1];
    expect(at(0)).toBe(1);
    expect(at(CONFIG.shipyard.sheer.from)).toBeCloseTo(1 + 0.5 * CONFIG.shipyard.sheer.from, 3);
    expect(at(1)).toBeCloseTo(2.1, 3);
    // Rising faster toward the bow (the square of the distance forward).
    expect(at(0.9) - at(0.8)).toBeGreaterThan(at(0.6) - at(0.5));
    expect(withSheer(line, 0)).toBe(line);
  });

  it('on every hull type: her deck at the bow higher by about the rise, amidships the same; she still builds clean', () => {
    const steps = 6;
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++) {
      if (DESIGN_HULLS[hull].retired) continue;
      const d: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull };
      const stationsOf = (x: ShipDesign) => {
        useDesign(x);
        return VESSEL_DEFS.design.hull.stations;
      };
      const flat = stationsOf(d);
      const swept = stationsOf({ ...d, sheer: steps });
      // Her deck edge at the station nearest z: the top of its section.
      const deckAt = (st: Station[], z: number) => Math.max(...st.reduce((a, b) => (Math.abs(b.z - z) < Math.abs(a.z - z) ? b : a)).polygon.map((p) => p[1]));
      const stem = Math.min(...flat.map((s) => s.z));
      const mid = (Math.max(...flat.map((s) => s.z)) + stem) / 2;
      expect(deckAt(swept, mid) - deckAt(flat, mid), `hull ${hull} amidships`).toBeLessThan(0.05);
      expect(deckAt(swept, stem + 0.3) - deckAt(flat, stem + 0.3), `hull ${hull} at the bow`).toBeGreaterThan(SCALES.sheer(steps) * 0.7);
      expect(validateRecipe(RECIPES.design, LIBRARY), `hull ${hull}`).toEqual([]);
    }
  });

  it("isn't in the code: a boat with it travels as a link or file", () => {
    const d: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[1].defaults, hull: 1 };
    expect(() => encodeDesign({ ...d, sheer: 2 })).toThrow(/sheer/);
  });
});

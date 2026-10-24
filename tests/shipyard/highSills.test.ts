/**
 * High window sills (owner, Oct 2026: "a third option for the windowsills on the wheelhouse to
 * have them higher ... standing up, you should be able to see through the windows"): level
 * with the dash top (CONFIG.shipyard.windowSills.high), the console as with standard sills
 * (its upright panel on, not the low sills' screens on stalks); not in the short code.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, type ShipDesign } from '../../src/shipyard/design';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';

afterAll(() => useDesign(DEFAULT_DESIGN));
const pilot = (sills: number): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[3].defaults, hull: 3, sills });
const wheelhouse = (d: ShipDesign) => {
  useDesign(d);
  return VESSEL_DEFS.design.layout.wheelhouse!;
};

describe('high window sills', () => {
  it('stand level with the dash top, chest height, under a standing helmsman’s eyes', () => {
    const wh = wheelhouse(pilot(2));
    expect(wh.windowSill).toBe(CONFIG.shipyard.windowSills.high);
    expect(CONFIG.shipyard.windowSills.high).toBeGreaterThan(CONFIG.shipyard.windowSills.standard);
    expect(CONFIG.shipyard.windowSills.high).toBeCloseTo(0.9 + CONFIG.modules.helmConsole.dash.top, 1);
    expect(CONFIG.shipyard.windowSills.high).toBeLessThan(1.6 - 0.2);
    expect(wh.windowHead - wh.windowSill).toBeGreaterThan(0.5);
  });

  it('keep the standard console (its view over the dash), unlike the low sills', () => {
    expect(wheelhouse(pilot(2)).viewSill).toBe(wheelhouse(pilot(0)).viewSill);
    expect(wheelhouse(pilot(1)).viewSill).toBe(0.9);
    expect(wheelhouse(pilot(1)).windowSill).toBe(CONFIG.shipyard.windowSills.low);
  });

  it('travel as a link or file; the code still holds standard and low as before', () => {
    expect(() => encodeDesign(pilot(2))).toThrow(/high window sills/);
    for (const s of [0, 1]) {
      const back = decodeDesign(encodeDesign(pilot(s)));
      expect('design' in back && back.design.sills).toBe(s);
    }
  });
});

/** No handrails (owner): a Shipyard design's bulwarks with or without rails over them; its codes (old ones unchanged). */
import { describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, placeValue, RAILS, type ShipDesign } from '../../src/shipyard/design';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';

const BASE: ShipDesign = { ...DEFAULT_DESIGN, guard: 0 };

describe('no handrails', () => {
  it('handrails (as every boat had) keep the code as it was; none reads back, with protection, a deckhouse and placed gear too', () => {
    expect(RAILS).toEqual(['Handrails', 'None']);
    expect(DEFAULT_DESIGN.rails).toBe(0);
    expect(encodeDesign(BASE).replace(/-/g, '')).toHaveLength(17);
    const none = { ...BASE, rails: 1 };
    expect(encodeDesign(none).replace(/-/g, '').length).toBeGreaterThan(17);
    expect(decodeDesign(encodeDesign(none))).toEqual({ design: none });
    for (const guard of [0, 1, 4]) {
      const more = { ...none, guard, dhLength: 3, dhHeight: 2, dhWidth: 1, dhRake: 1, deckCrane: 2, craneAt: placeValue('craneAt', -1, 2.5, 1) };
      expect(decodeDesign(encodeDesign(more))).toEqual({ design: more });
      // And with handrails, unchanged from before.
      expect(decodeDesign(encodeDesign({ ...more, rails: 0 }))).toEqual({ design: { ...more, rails: 0 } });
    }
  });

  it('builds with rails over the bulwarks, or bulwarks only', () => {
    const d = { ...BASE, hull: 2, ...DESIGN_HULLS[2].defaults };
    useDesign(d);
    const with_ = VESSEL_DEFS.design.layout;
    expect(with_.railHeight).toBeCloseTo(with_.bulwarkHeight + 0.4, 6);
    const b = useDesign({ ...d, rails: 1 });
    expect(VESSEL_DEFS.design.layout.railHeight).toBe(0);
    expect(b.warnings).toEqual(useDesign(d).warnings);
  });
});

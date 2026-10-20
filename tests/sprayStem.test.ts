/**
 * The bow spray comes off where her stem meets the water (owner, Oct 2026: with a raked stem
 * it came off thin air ahead of her, put at a fixed 46 % of her length forward of amidships).
 */
import { describe, expect, it } from 'vitest';
import { FLEET } from '../src/boats/fleet';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { stemAtWaterline, waterlineHalf } from '../src/vessel/view/spray';

describe('where the bow spray comes off', () => {
  it('a section’s half-breadth at the waterline', () => {
    // A V section, chines at ±1 m 0.5 m up, keel 0.5 m down: 0.5 m out at the waterline.
    expect(waterlineHalf([[0, -0.5], [1, 0.5], [1, 1], [-1, 1], [-1, 0.5]])).toBeCloseTo(0.5, 6);
    expect(waterlineHalf([[0, 0.2], [1, 1], [-1, 1]])).toBe(0);
  });

  it('is at the stem’s waterline on every fleet boat: in the water, aft of her forward end', () => {
    for (const f of FLEET) {
      const hull = VESSEL_DEFS[f.id].hull;
      const st = [...hull.stations].sort((a, b) => a.z - b.z);
      const z = stemAtWaterline(st);
      const L = hull.params.length;
      console.log(f.id, 'stem at the waterline', z.toFixed(2), 'm; the old fixed point', (-0.46 * L).toFixed(2));
      expect(z).toBeGreaterThanOrEqual(st[0].z);
      // A section just aft of it is in the water, one just forward of it isn't.
      const below = st.find((s) => s.z > z + 0.05)!;
      expect(Math.min(...below.polygon.map(([, y]) => y))).toBeLessThan(0);
      const ahead = [...st].reverse().find((s) => s.z < z - 0.05);
      if (ahead) expect(Math.min(...ahead.polygon.map(([, y]) => y))).toBeGreaterThanOrEqual(0);
    }
  });
});

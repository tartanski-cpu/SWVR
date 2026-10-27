/**
 * The EFFICIENCY screen's arithmetic (owner, 27 Oct 2026: "litres per nautical mile, so that
 * basically we can find the sweet spot"; controls/efficiency.ts).
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { litresPerNm, newEfficiencyLog, rangeNm, record, sweetSpot } from '../src/controls/efficiency';
import { SCREENS, TOUCH_PAGES } from '../src/controls/instruments';

describe('the efficiency screen', () => {
  it('litres a mile: fuel flow over speed through the water; none when she is barely moving', () => {
    expect(litresPerNm(30, 10)).toBeCloseTo(3, 6);
    expect(litresPerNm(5, CONFIG.efficiency.minKn / 2)).toBeNull();
    expect(rangeNm(300, 3)).toBeCloseTo(100, 6);
    expect(rangeNm(300, null)).toBeNull();
  });

  it('gathers steady readings into speed bins and finds the sweet spot', () => {
    const log = newEfficiencyLog();
    // A displacement boat: cheap per mile at 7 kn, dear at 4 (slow, the engine idling) and 10 (past her hull speed).
    const curve: [number, number][] = [[4, 12], [7, 14], [10, 60]];
    let t = 0;
    for (const [kn, lph] of curve)
      for (let i = 0; i < 10; i++) {
        t += 1;
        record(log, t, kn, lph);
      }
    const best = sweetSpot(log)!;
    expect(best.knots).toBeCloseTo(7.25, 6);
    expect(best.lpnm).toBeCloseTo(2, 3);
  });

  it('takes no reading while she is speeding up, nor faster than it samples', () => {
    const log = newEfficiencyLog();
    expect(record(log, 0, 5, 10)).toBe(false); // (the first: nothing to compare with)
    expect(record(log, 0.1, 5, 10)).toBe(false); // (too soon)
    expect(record(log, 1, 6, 10)).toBe(false); // (speeding up)
    expect(record(log, 2, 6.05, 10)).toBe(true);
    expect(sweetSpot(log)!.lpnm).toBeCloseTo(10 / 6.05, 6);
  });

  it('a screen of its own, and a page on the touchscreens', () => {
    expect(SCREENS.efficiency).toBeDefined();
    expect(TOUCH_PAGES).toContain('efficiency');
  });
});

import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { formatSeaTrials, runSeaTrials } from '../src/vessel/seaTrials';

describe('sea trials (calm water)', () => {
  const r = runSeaTrials();
  const L = CONFIG.vessels.workboat.hull.length;
  console.log(formatSeaTrials(r, L));

  it('top speed is that of a displacement workboat (~9-10 kn)', () => {
    expect(r.topSpeedKn).toBeGreaterThan(8.8);
    expect(r.topSpeedKn).toBeLessThan(10.5);
  });

  it('speed rises with lever and RPM', () => {
    for (let i = 1; i < r.speedTable.length; i++) expect(r.speedTable[i].knots).toBeGreaterThan(r.speedTable[i - 1].knots);
  });

  it('feels heavy but responsive: 90 % of top speed in 10-40 s', () => {
    expect(r.timeTo90Pct).toBeGreaterThan(10);
    expect(r.timeTo90Pct).toBeLessThan(40);
  });

  it('turns to starboard on starboard helm, tactical diameter 2-5 L', () => {
    expect(r.transfer).toBeGreaterThan(0);
    expect(r.tacticalDiameter / L).toBeGreaterThan(2);
    expect(r.tacticalDiameter / L).toBeLessThan(5);
  });

  it('crash-stops within 1.2-5 L', () => {
    expect(r.crashStopDistance / L).toBeGreaterThan(1.2);
    expect(r.crashStopDistance / L).toBeLessThan(5);
  });

  it('goes astern slower than ahead', () => {
    expect(r.asternSpeedKn).toBeGreaterThan(3);
    expect(r.asternSpeedKn).toBeLessThan(r.topSpeedKn);
  });
});

/**
 * The career's Shipyard signs (ui/shipyardDoor.ts careerShipyardSpots; owner, Oct 2026: the
 * Shipyard button "should be in career mode too", at any harbour): one on the quay at every
 * harbour of the career world, on level ground.
 */
import { describe, expect, it } from 'vitest';
import { careerShipyardSpots } from '../src/ui/shipyardDoor';
import { PORTS } from '../src/world/archipelago';
import { REGIONS } from '../src/world/regions';

describe('career Shipyard signs', () => {
  it('stands one at every harbour with a berth, ashore', () => {
    const spots = careerShipyardSpots();
    const withBerth = PORTS.filter((p) => REGIONS.some((r) => r.berths.some((b) => b.portId === p.id)));
    expect(withBerth.length).toBeGreaterThan(3);
    expect(spots.length).toBe(withBerth.length);
    for (const s of spots) {
      expect(s.y).toBeGreaterThan(0.2); // on the quay, not in the water
      expect(Number.isFinite(s.farHeading)).toBe(true);
    }
  });
});

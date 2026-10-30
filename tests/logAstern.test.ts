/**
 * The speed log going astern (owner, 30 Oct 2026: hard to tell ahead from astern on a
 * computer): her way through the water along her heading, + ahead, - astern; ASTERN only past
 * CONFIG.interaction.asternKn of sternway, so it doesn't flicker at rest.
 */
import { describe, expect, it } from 'vitest';
import '../src/boats/library';
import { CONFIG } from '../src/config';
import { aheadLogKnots, goingAstern } from '../src/controls/instruments';
import { createVesselState } from '../src/vessel/vesselState';
import { placeVessel } from '../src/vessel/vesselControl';

const KN = 1852 / 3600;

describe('speed log astern', () => {
  it('tells ahead from astern whichever way she heads', () => {
    for (const hdg of [0, 90, 200, 315]) {
      const v = createVesselState('v', 'fishingBoat');
      placeVessel(v, 0, 0, 0, hdg);
      const h = (hdg * Math.PI) / 180;
      // 2 kn along her heading (bow along +x sin h, -z cos h), then 2 kn the other way.
      v.linearVelocity = [Math.sin(h) * 2 * KN, 0, -Math.cos(h) * 2 * KN];
      expect(aheadLogKnots(v), `${hdg}`).toBeCloseTo(2, 3);
      expect(goingAstern(v)).toBe(false);
      v.linearVelocity = [-Math.sin(h) * 2 * KN, 0, Math.cos(h) * 2 * KN];
      expect(aheadLogKnots(v)).toBeCloseTo(-2, 3);
      expect(goingAstern(v)).toBe(true);
      // A crawl astern under the threshold counts as stopped; sideways drift is neither.
      const crawl = CONFIG.interaction.asternKn * 0.5 * KN;
      v.linearVelocity = [-Math.sin(h) * crawl, 0, Math.cos(h) * crawl];
      expect(goingAstern(v)).toBe(false);
      v.linearVelocity = [Math.cos(h) * 2 * KN, 0, Math.sin(h) * 2 * KN];
      expect(goingAstern(v)).toBe(false);
    }
  });
});

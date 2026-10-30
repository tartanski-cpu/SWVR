/**
 * Every Shipyard boat has a boat hook (owner, 29 Oct 2026: "the trawler doesn't have a boat hook,
 * so I couldn't retrieve the line"): in its clips on her bulwark aft, beside the life ring if she
 * has one, else to port. The life ring (and with it the rescue calls) stays a choice of its own.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { gearOf, useDesign } from '../src/boats/sims';
import { DESIGN_HULLS } from '../src/shipyard/build';
import { DEFAULT_DESIGN } from '../src/shipyard/design';
import { withFixed } from '../src/shipyard/parts/catalog';
import { createVesselState } from '../src/vessel/vesselState';

afterAll(() => useDesign(DEFAULT_DESIGN));

describe('the boat hook', () => {
  it('every hull type has one, with or without the life ring; the ring only where chosen or built in', () => {
    DESIGN_HULLS.forEach((h, i) => {
      if (h.retired) return;
      for (const lifeRing of [0, 2]) {
        const d = withFixed({ ...DEFAULT_DESIGN, ...(h.defaults ?? {}), hull: i, lifeRing });
        useDesign(d);
        const v = createVesselState('v', 'design');
        const hook = gearOf(v, 'boatHook');
        expect(hook, `${h.name.split(':')[0]}, life ring ${lifeRing}`).toBeTruthy();
        // On her bulwark (out near her side), aft of amidships: to port without a ring, else on the ring's side.
        expect(Math.sign(hook!.stow[0]), h.name).toBe(d.lifeRing === 2 ? 1 : -1);
        // Some types have their ring built in (`fixed`); otherwise it is there only when chosen.
        expect(!!gearOf(v, 'lifeRing')).toBe(d.lifeRing > 0);
      }
    });
  });
});

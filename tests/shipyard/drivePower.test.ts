/**
 * Deck hydraulics and the fire pump with outboards or stern drives (owner, Oct 2026: "The
 * Shipyard could not start ... hydraulics.pto-pump needs the engine's power take-off, and
 * nothing on this boat gives it", a big landing craft put on outboards with a crane on deck).
 * Every drive runs them: an inboard and a stern drive's engine off its power take-off,
 * outboards standing for the power pack that runs with them.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { useDesign } from '../../src/boats/sims';
import { validateRecipe } from '../../src/modular/recipe';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';

afterAll(() => useDesign(DEFAULT_DESIGN));

describe('hydraulic deck gear and the fire monitor, on every drive', () => {
  it('a crane, winch, skiff and fire monitor go on her with outboards or stern drives, and her recipe holds', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++)
      for (const drive of [{}, { outboards: 1 }, { outboards: 3 }, { sternDrive: 1 }] as Partial<ShipDesign>[]) {
        const d = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, length: 15, deckCrane: 1, towWinch: 1, fireMonitor: 1, skiff: 3, ...drive };
        useDesign(d);
        expect(validateRecipe(RECIPES.design, LIBRARY), `hull ${hull} ${JSON.stringify(drive)}`).toEqual([]);
      }
  });
});

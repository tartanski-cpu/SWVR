/** The Deck gear step's menu (gearMenu.ts): every piece of equipment once, in a group, with an icon and a line; placed or fitted by what it is. */
import { describe, expect, it } from 'vitest';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN } from '../../src/shipyard/design';
import { GEAR_ABOUT, GEAR_GROUPS, GEAR_ICONS, gearKind } from '../../src/shipyard/gearMenu';
import { EQUIPMENT, equipmentOf, fitted, placeGear } from '../../src/shipyard/pinGear';

describe('the deck gear menu', () => {
  it('has every piece of equipment once, each with an icon and a line on what it does', () => {
    const ids = GEAR_GROUPS.flatMap((g) => g.items);
    expect([...ids].sort()).toEqual(EQUIPMENT.map((e) => e.id).sort());
    for (const id of ids) {
      expect(GEAR_ICONS[id], id).toMatch(/^<svg/);
      expect(GEAR_ABOUT[id], id).toBeTruthy();
    }
  });

  it('gear with one place on any boat is fitted, not placed: the anchor, stern roller, A-frame (and its net drum and trawl winches), side door', () => {
    const fit = EQUIPMENT.filter((e) => gearKind(e) === 'fit').map((e) => e.id);
    expect(fit.sort()).toEqual(['aFrame', 'anchor', 'netDrum', 'sideDoor', 'sternRoller', 'trawlWinches']);
    // Fitting needs no point on her.
    for (const id of fit) expect(fitted(equipmentOf(id)!, { ...DEFAULT_DESIGN, noAnchor: 1, ...placeGear(equipmentOf(id)!, [0, 0, 0], undefined, 0).patch })).toBe(true);
  });

  it('every hull type comes with her anchor fitted', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++) {
      const d = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull };
      expect(fitted(equipmentOf('anchor')!, d), `hull ${hull}`).toBe(true);
      expect(buildDesign(d).warnings.some((w) => /anchor/i.test(w)), `hull ${hull}`).toBe(false);
    }
  });
});

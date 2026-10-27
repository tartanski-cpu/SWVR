/**
 * The front below the windows sloped back from its foot (owner, 27 Oct 2026, the solar
 * catamaran: "kicked out at quite a steep angle in front of the windows. And then the solar
 * panels are on top of that sloped part ... it needs to work with the deck house that it may sit
 * upon"): design.kick, any hull; the console behind the slope, the floor under it not walked;
 * from a deckhouse's top when the house stands on one; her panels on it.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { validateRecipe } from '../../src/modular/recipe';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, kickDeg, KICK_STEPS, type ShipDesign } from '../../src/shipyard/design';
import { designToken, readDesign, shortCode } from '../../src/shipyard/designDoc';
import { HARBOUR_TUG, SOLAR_CAT } from '../../src/shipyard/parts/catalog';
import { vesselWalkArea } from '../../src/vessel/layout';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';

afterAll(() => useDesign(DEFAULT_DESIGN));
const typeOf = (hull: number, more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, ...more });

describe('the front kicked out below the windows', () => {
  it('upright to 75° in fives', () => {
    expect(KICK_STEPS).toBe(16);
    expect(kickDeg(KICK_STEPS - 1)).toBe(75);
    expect(DEFAULT_DESIGN.kick).toBe(0);
  });

  it('on the pilot boat: the glass foot and the console aft by the slope, the floor under it not walked', () => {
    const at = (kick: number) => {
      const b = useDesign(typeOf(3, { kick }));
      expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
      expect(b.warnings).toEqual([]);
      const wh = VESSEL_DEFS.design.layout.wheelhouse!;
      const area = vesselWalkArea(VESSEL_DEFS.design, VESSEL_DEFS.design.layout);
      return { wh, walk: (x: number, z: number) => area.walkable(x, z, wh.floorY) };
    };
    const up = at(0);
    const kicked = at(8);
    expect(kicked.wh.shape!.lowerRakeDeg).toBe(-40);
    expect(kicked.wh.consoleBack! - (up.wh.consoleBack ?? 0)).toBeGreaterThan(0.5);
    // Just inside the front wall, beside the console: walked upright, not under the slope.
    const x = kicked.wh.halfWidth - 0.35;
    const z = kicked.wh.front + 0.35;
    expect(up.walk(x, z) || up.walk(-x, z)).toBe(true);
    expect(kicked.walk(x, z) || kicked.walk(-x, z)).toBe(false);
  });

  it('on a house standing on a deckhouse (the harbour tug), the slope rises from the deckhouse top', () => {
    useDesign(typeOf(HARBOUR_TUG, { kick: 6 }));
    const wh = VESSEL_DEFS.design.layout.wheelhouse!;
    const dh = buildDesign(typeOf(HARBOUR_TUG, { kick: 6 }));
    expect(dh.warnings).toEqual([]);
    expect(wh.shape!.lowerFromY).toBeGreaterThan(wh.floorY - 0.1);
  });

  it('the solar catamaran: kicked out 60°, her panels on the slope in place of the foredeck rack', () => {
    const b = buildDesign(typeOf(SOLAR_CAT));
    expect(b.warnings).toEqual([]);
    const roof = b.recipe.modules.find((m) => m.module === 'deck.solar-roof')!.config as { slope?: { z0: number; z1: number; y0: number; y1: number }; rack: unknown };
    expect(roof.rack).toBeNull();
    const s = roof.slope!;
    expect(s.z1 - s.z0).toBeGreaterThan(1);
    expect(s.y1).toBeGreaterThan(s.y0);
    expect(Math.atan2(s.z1 - s.z0, s.y1 - s.y0) * (180 / Math.PI)).toBeCloseTo(60, 0);
  });

  it('kicked, she travels as a link or file', () => {
    const d = typeOf(3, { kick: 4 });
    expect(shortCode(d)).toBeNull();
    const back = readDesign(designToken(d));
    expect('design' in back && back.design.kick).toBe(4);
  });
});

/**
 * A dash laid out by hand never crashes the builder (review, 24 Oct 2026: a screen with no room
 * came off the console but was still looked up there for the shortest console, recipe.ts): every
 * dash screen pinned to every column, at every controls level, builds.
 */
import { describe, expect, it } from 'vitest';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DASH_COLS_MAX, DASH_SLOTS, DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';

describe('a dash laid out by hand', () => {
  it('builds whatever is pinned where, at every controls level', () => {
    for (const hull of [0, 3]) {
      const base: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull };
      for (const controls of [0, 1, 2, 3])
        for (const key of Object.values(DASH_SLOTS))
          for (const v of [1, 2, DASH_COLS_MAX, 2 * DASH_COLS_MAX]) {
            const d = { ...base, controls, [key]: v } as ShipDesign;
            expect(() => buildDesign(d), `${DESIGN_HULLS[hull].name.split(':')[0]}, controls ${controls}, ${key} ${v}`).not.toThrow();
          }
    }
  }, 300000);
});

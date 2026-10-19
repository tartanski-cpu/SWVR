/** The slow-revving tug diesel (owner): a fourth engine in the code, and how it's built. */
import { beforeAll, describe, expect, it } from 'vitest';
import { gearOf, useDesign } from '../../src/boats/sims';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { validateRecipe } from '../../src/modular/recipe';
import { DESIGN_HULLS, ENGINES } from '../../src/shipyard/build';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, ENGINE_TYPES, type ShipDesign } from '../../src/shipyard/design';
import { fakeCanvas } from '../modular/fakes';

beforeAll(fakeCanvas);

const BASE: ShipDesign = { ...DEFAULT_DESIGN, guard: 0 };
const TUG = DESIGN_HULLS.length - 1;
const tug = (engine: number, twin = 0): ShipDesign => ({ ...BASE, hull: TUG, ...DESIGN_HULLS[TUG].defaults, engine, twin });

describe('the tug engine: codes', () => {
  it('every engine reads back; the first three keep their 17-character codes as before', () => {
    expect(ENGINE_TYPES).toBe(ENGINES.length);
    for (let engine = 0; engine < ENGINE_TYPES; engine++)
      for (const hull of [0, TUG]) {
        const d = { ...BASE, hull, engine };
        expect(decodeDesign(encodeDesign(d)), `${engine} ${hull}`).toEqual({ design: d });
        if (engine < 3 && hull < 4) expect(encodeDesign(d).replace(/-/g, '')).toHaveLength(17);
      }
    const all = { ...BASE, engine: 3, hull: TUG, facets: 1, skiff: 2, rails: 1, guard: 2, dhLength: 3, dhHeight: 1, dhWidth: 0, dhRake: 0 };
    expect(decodeDesign(encodeDesign(all))).toEqual({ design: all });
  });
});

describe('the tug engine: built', () => {
  it('rated at 1000 rpm, idling at 450 (its own: usual for its kind); more torque than the 400 kW V8 for its power; a bigger propeller and a lower gearbox; the recipe checks out', () => {
    const v8 = useDesign(tug(2));
    const v8Torque = Math.max(...gearOf({ defId: 'design' }, 'diesel')!.engine.torqueCurve.map(([, t]) => t));
    const slow = useDesign(tug(3));
    expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
    const e = gearOf({ defId: 'design' }, 'diesel')!.engine;
    expect(e.ratedRpm).toBe(1000);
    expect(e.idleRpm).toBe(450);
    expect(e.powerKw).toBe(450);
    expect(Math.max(...e.torqueCurve.map(([, t]) => t))).toBeGreaterThan(1.7 * v8Torque);
    expect(Math.max(...e.torqueCurve.map(([r]) => r))).toBeLessThanOrEqual(1100);
    expect(slow.figures.propellerM).toBeGreaterThan(v8.figures.propellerM);
    expect(slow.warnings).toEqual([]);
  });

  it('goes in singly only: a twin choice is built with one engine, and says so', () => {
    const b = useDesign(tug(3, 1));
    expect(gearOf({ defId: 'design' }, 'diesel')!.twin).toBeFalsy();
    expect(b.figures.engine).not.toMatch(/^Twin/);
    expect(b.warnings.join(' ')).toMatch(/goes in singly/);
  });
});

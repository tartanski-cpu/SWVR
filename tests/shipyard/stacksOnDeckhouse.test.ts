/**
 * Exhaust stacks as a part of their own (owner, Oct 2026: "split these exhaust pipes out as
 * something that you can control ... move the twin exhaust pipes forward and aft on this deck
 * house and choose whether they've got like a circular or a square kind of box around them"):
 * on the deckhouse, each in a casing, moved along it, clear of the wheelhouse; or, as before,
 * up through the wheelhouse.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, STACK_POS_STEPS, type ShipDesign } from '../../src/shipyard/design';
import { designToken, readDesign, shortCode } from '../../src/shipyard/designDoc';
import { HARBOUR_TUG, TUG_HULL } from '../../src/shipyard/parts/catalog';
import { stackOutlet, type ExhaustStackConfig } from '../../src/modules/exhaustStack';

afterAll(() => useDesign(DEFAULT_DESIGN));

const tug: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[HARBOUR_TUG].defaults, hull: HARBOUR_TUG };
const stackOf = (d: ShipDesign) => buildDesign(d).recipe.modules.find((m) => m.module === 'fitting.exhaust-stack')?.config as ExhaustStackConfig | undefined;

describe('exhaust stacks on the deckhouse', () => {
  it('the harbour tug’s: on her deckhouse at its aft end, two, each in a square casing out near its side, the pipes out of their tops', () => {
    const b = buildDesign(tug);
    expect(b.warnings).toEqual([]);
    const c = stackOf(tug)!;
    expect(c.outer?.shape).toBe('square');
    expect(c.pipes).toHaveLength(2);
    const dh = b.hull.layout.deckhouse!;
    expect(c.roof).toBeCloseTo(dh.top, 2);
    for (const p of c.pipes) {
      expect(p.z).toBeLessThan(dh.z1);
      expect(p.z).toBeGreaterThan(dh.z1 - 1.5);
      expect(stackOutlet(c, p).position[1]).toBeGreaterThan(c.outer!.top);
    }
    expect(c.pipes[0].x).toBeCloseTo(-c.pipes[1].x, 3);
  });

  it('moved along it, forward of her wheelhouse at the front, never standing in the wheelhouse; round casings', () => {
    const aft = stackOf(tug)!;
    const fwd = stackOf({ ...tug, stackPos: STACK_POS_STEPS - 1, stackCasing: 0 })!;
    expect(fwd.outer?.shape).toBe('round');
    expect(fwd.pipes[0].z).toBeLessThan(aft.pipes[0].z - 3);
    for (let stackPos = 0; stackPos < STACK_POS_STEPS; stackPos += 2) {
      const b = buildDesign({ ...tug, stackPos });
      const wh = b.hull.layout.wheelhouse!;
      const c = stackOf({ ...tug, stackPos })!;
      for (const p of c.pipes) {
        const inPlan = p.z > wh.front && p.z < wh.aft && Math.abs(p.x) - c.outer!.half < wh.halfWidth;
        expect(inPlan, `stackPos ${stackPos}`).toBe(false);
      }
    }
  });

  it('through the wheelhouse as before when chosen, or with no deckhouse to stand on (saying so)', () => {
    expect(stackOf({ ...tug, stackMount: 0 })!.outer).toBeUndefined();
    const small: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[TUG_HULL].defaults, hull: TUG_HULL, stackMount: 1, dhLength: 0 };
    const b = buildDesign(small);
    expect(stackOf(small)!.outer).toBeUndefined();
    expect(b.warnings.some((w) => /no deckhouse|she has none/.test(w))).toBe(true);
  });

  it('travels as a link or file, and comes back', () => {
    const d = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[TUG_HULL].defaults, hull: TUG_HULL, stackMount: 1, stackPos: 5, stackCasing: 1 };
    expect(shortCode(d)).toBeNull();
    expect(readDesign(designToken(d))).toMatchObject({ design: { stackMount: 1, stackPos: 5, stackCasing: 1 } });
  });
});

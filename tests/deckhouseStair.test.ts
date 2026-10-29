/**
 * A deckhouse's outside stair (vessel/layout.ts: walked as one slope, then its landing): walked
 * as the game walks you (player/locomotion.ts: small steps, half a step where a whole one is
 * stopped, your height easing onto the floor), up from the deck, across the landing onto the
 * deckhouse top, and back down (owner, 29 Oct 2026: "I walk up the stairs and I get stuck before
 * the platform"; the landing's last 15 cm by the stair's head weren't floor). Every boat with one.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN } from '../src/shipyard/design';
import { DESIGN_HULLS, withFixed } from '../src/shipyard/parts/catalog';
import { designToken } from '../src/shipyard/designDoc';
import { boatType } from '../src/boats/library';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { STEP_HEIGHT, vesselWalkArea } from '../src/vessel/layout';
import { FLEET_IDS } from '../src/boats/fleet';
import { footprintsOf, useDesign } from '../src/boats/sims';
import type { VesselDef } from '../src/vessel/vesselDef';
import type { GearFootprint } from '../src/modular/module';

const ids = [...FLEET_IDS, ...DESIGN_HULLS.flatMap((h, i) => (h.retired ? [] : [boatType(designToken(withFixed({ ...DEFAULT_DESIGN, ...(h.defaults ?? {}), hull: i })))!]))];
const withStair = ids.filter((id) => (VESSEL_DEFS[id]?.layout.deckhouse?.walk?.stair?.length ?? 0) > 1);

/** Up the stair, across the landing onto the deckhouse top, and down again; throws where it holds you. */
function walkStair(def: VesselDef, gear: readonly GearFootprint[]): void {
  const dh = def.layout.deckhouse!;
  const w = vesselWalkArea(def, def.layout, gear);
  const [landing, ...treads] = dh.walk!.stair!;
  const low = treads[treads.length - 1];
  const up = Math.sign((landing.x0 + landing.x1) / 2 - (low.x0 + low.x1) / 2);
  const zStair = (low.z0 + low.z1) / 2;
  let x = up > 0 ? low.x0 - 0.3 : low.x1 + 0.3;
  let z = zStair;
  let y = Math.max(...w.floorsAt(x, z));
  const deck = y;
  const step = 1.4 / 60;
  const go = (dx: number, dz: number, done: () => boolean, what: string) => {
    for (let i = 0; i < 3000 && !done(); i++) {
      if (w.walkable(x + dx, z + dz, y)) [x, z] = [x + dx, z + dz];
      else if (w.walkable(x + dx / 2, z + dz / 2, y)) [x, z] = [x + dx / 2, z + dz / 2];
      else throw new Error(`held ${what} at x ${x.toFixed(2)}, z ${z.toFixed(2)}, y ${y.toFixed(2)}`);
      const f = w.floorsAt(x, z).filter((h) => h <= y + STEP_HEIGHT);
      if (f.length) y += (Math.max(...f) - y) * Math.min(1, 1 / 60 / 0.12);
    }
  };
  const mid = (landing.x0 + landing.x1) / 2;
  const fwd = Math.sign((dh.z0 + dh.z1) / 2 - (landing.z0 + landing.z1) / 2) || -1;
  go(step * up, 0, () => Math.abs(x - mid) < step, 'going up the stair');
  go(0, step * fwd, () => (fwd < 0 ? z < landing.z0 - 1 : z > landing.z1 + 1), 'stepping off the landing');
  // (On the top, or through the house's aft door onto its floor: standing on a floor either way.)
  expect(w.floorsAt(x, z).some((f) => Math.abs(f - y) < 0.05), `on a floor past the landing (y ${y.toFixed(2)})`).toBe(true);
  go(0, -step * fwd, () => Math.abs(z - zStair) < step, 'back onto the landing');
  go(-step * up, 0, () => (up > 0 ? x < low.x0 - 0.3 : x > low.x1 + 0.3), 'going down the stair');
  expect(Math.abs(y - deck)).toBeLessThan(0.05);
}

afterAll(() => useDesign(DEFAULT_DESIGN));

describe("a deckhouse's outside stair", () => {
  it('some boat has one (the harbour tug)', () => expect(withStair.length).toBeGreaterThan(0));
  for (const id of withStair) {
    it(`${id}: up the stair, across the landing onto the top, and down again, never held`, () => walkStair(VESSEL_DEFS[id], footprintsOf({ defId: id })));
  }
  it('every hull type with a deckhouse run on aft of the wheelhouse (its stair across the aft face): the same', () => {
    let tried = 0;
    DESIGN_HULLS.forEach((h, i) => {
      if (h.retired || h.fixed) return;
      for (const dhAft of [3, 6]) {
        useDesign(withFixed({ ...DEFAULT_DESIGN, ...(h.defaults ?? {}), hull: i, dhLength: 4, dhAft }));
        const def = VESSEL_DEFS.design;
        if ((def.layout.deckhouse?.walk?.stair?.length ?? 0) < 2) continue;
        tried++;
        try {
          walkStair(def, footprintsOf({ defId: 'design' }));
        } catch (e) {
          throw new Error(`${h.name.split(':')[0]}, run on aft ${dhAft / 2} m: ${(e as Error).message}`);
        }
      }
    });
    expect(tried).toBeGreaterThan(2);
  });
});

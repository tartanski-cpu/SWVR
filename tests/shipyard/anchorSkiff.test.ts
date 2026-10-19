/** The anchor and the skiff with her crane on a Shipyard design (owner): codes, where they go, the helm's controls, pins. */
import { beforeAll, describe, expect, it } from 'vitest';
import { gearOf, useDesign } from '../../src/boats/sims';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { flattenMounts, validateRecipe } from '../../src/modular/recipe';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, placeValue, SKIFFS, type ShipDesign, fromSteps } from '../../src/shipyard/design';
import { EQUIPMENT, fitted, placeGear, removeGear } from '../../src/shipyard/pinGear';
import { hullPlan } from '../../src/vessel/layout';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { cleatLocal } from '../../src/vessel/physics/painter';
import { fakeCanvas } from '../modular/fakes';

beforeAll(fakeCanvas);

const BASE: ShipDesign = { ...DEFAULT_DESIGN, guard: 0 };
const mounted = () => flattenMounts(RECIPES.design, LIBRARY.hulls, LIBRARY.modules).mounted;
const typeOf = (hull: number): ShipDesign => ({ ...BASE, hull, ...DESIGN_HULLS[hull].defaults });

describe('the anchor and the skiff: codes', () => {
  it('an anchor and no skiff keep the code as it was (older designs read with an anchor); the rest read back', () => {
    expect(BASE.noAnchor).toBe(0);
    expect(BASE.skiff).toBe(0);
    expect(encodeDesign(BASE).replace(/-/g, '')).toHaveLength(17);
    for (let skiff = 0; skiff < SKIFFS.length; skiff++)
      for (const noAnchor of [0, 1]) {
        const d = { ...BASE, skiff, noAnchor, rails: 1, guard: 2, ...fromSteps({ dhLength: 3, dhHeight: 1, dhWidth: 0, dhRake: 0 }), dhNarrow: 1, deckCrane: 2, craneAt: placeValue('craneAt', -1, 2.5, 1) };
        expect(decodeDesign(encodeDesign(d))).toEqual({ design: d });
      }
  });
});

describe('the anchor', () => {
  it('every hull type carries one: at the bow roller on the centreline, or a kedge at the transom facing aft on the ramp-bow boat; its ANCHOR switch at the helm', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++) {
      const b = useDesign(typeOf(hull));
      expect(validateRecipe(RECIPES.design, LIBRARY), `${hull}`).toEqual([]);
      expect(b.warnings, `${hull}`).toEqual([]);
      const m = mounted().find((x) => x.def.id === 'deck.anchor-windlass')!;
      expect(m, `${hull}`).toBeDefined();
      const plan = hullPlan(VESSEL_DEFS.design);
      const [x, , z] = m.socket.transform.position;
      if (DESIGN_HULLS[hull].ramp) {
        expect(z).toBeGreaterThan(plan.transom - 0.2);
        expect(m.socket.transform.rotationDeg?.[1]).toBe(180);
      } else {
        expect(x).toBe(0);
        expect(z).toBeLessThan(plan.stem + 0.6);
      }
      expect(gearOf({ defId: 'design' }, 'anchor')).toBeTruthy();
      const helm = RECIPES.design.modules.find((x) => x.socket === 'helm')!;
      expect(helm.modules!.some((x) => x.socket === 'anchor' && x.bind?.value === 'anchor.letGo'), `${hull}`).toBe(true);
    }
    // Taken off: none, and no switch.
    useDesign({ ...typeOf(2), noAnchor: 1 });
    expect(mounted().some((x) => x.def.id === 'deck.anchor-windlass')).toBe(false);
  });
});

describe('the skiff and her crane', () => {
  it('fits on the workboat type\'s foredeck (her house right aft) and aft deck (right forward), either side: the crane, its pump, its helm button; she carries the skiff', () => {
    for (let skiff = 1; skiff < SKIFFS.length; skiff++) {
      const b = useDesign({ ...typeOf(2), skiff, housePos: skiff <= 2 ? 0 : 1 });
      expect(b.warnings, SKIFFS[skiff]).toEqual([]);
      expect(validateRecipe(RECIPES.design, LIBRARY), SKIFFS[skiff]).toEqual([]);
      const ids = mounted().map((x) => x.def.id);
      expect(ids).toContain('deck.tender-crane');
      expect(ids).toContain('hydraulics.pto-pump');
      const crane = RECIPES.design.modules.find((x) => x.socket === 'tenderCrane')!;
      expect((crane.config as { consoleButton: number[] }).consoleButton).toHaveLength(3);
      const g = gearOf({ defId: 'design' }, 'tenderCrane')!;
      // The column on the side chosen, the cradle forward of it, on the deck chosen.
      const wh = VESSEL_DEFS.design.layout.wheelhouse!;
      expect(Math.sign(g.column[0]), SKIFFS[skiff]).toBe(skiff % 2 === 1 ? 1 : -1);
      if (skiff <= 2) expect(g.column[1]).toBeLessThan(wh.front);
      else expect(g.column[1]).toBeGreaterThan(wh.aft);
      expect(g.cradle.z0).toBeLessThan(g.column[1]);
    }
  });

  it('with her, two midship cleats for her painter (owner): on the bulwark tops at the house end of her deck, inside the mooring cleats; none without her', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++)
      for (let skiff = 0; skiff < SKIFFS.length; skiff++) {
        useDesign({ ...typeOf(hull), skiff });
        const has = mounted().some((x) => x.def.id === 'deck.tender-crane');
        const mids = RECIPES.design.modules.filter((m) => m.module === 'deck.cleat' && (m.config as { end: string }).end === 'midship');
        expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
        if (!has) {
          expect(mids, `${hull}/${skiff}`).toHaveLength(0);
          expect(gearOf({ defId: 'design' }, 'midCleat')).toBeNull();
          continue;
        }
        expect(mids.map((m) => (m.config as { side: number }).side).sort(), `${hull}/${skiff}`).toEqual([-1, 1]);
        const mid = gearOf({ defId: 'design' }, 'midCleat')!;
        const bow = gearOf({ defId: 'design' }, 'bowCleat')!;
        const stern = gearOf({ defId: 'design' }, 'sternCleat')!;
        expect(mid.z, `${hull}/${skiff}`).toBeGreaterThan(bow.z);
        expect(mid.z, `${hull}/${skiff}`).toBeLessThan(stern.z);
        // At the house's end of the skiff's deck: off the house, on her side of it.
        const wh = VESSEL_DEFS.design.layout.wheelhouse!;
        if (skiff <= 2) expect(mid.z, `${hull}/${skiff}`).toBeLessThan(wh.front);
        else expect(mid.z, `${hull}/${skiff}`).toBeGreaterThan(wh.aft);
        // The painter has somewhere to go: cleats 4 and 5.
        expect(cleatLocal(VESSEL_DEFS.design, 4)![0]).toBeLessThan(0);
        expect(cleatLocal(VESSEL_DEFS.design, 5)![0]).toBeGreaterThan(0);
      }
  });

  it('every hull type either fits it or says there is no room', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++)
      for (let skiff = 1; skiff < SKIFFS.length; skiff++) {
        const b = useDesign({ ...typeOf(hull), skiff });
        expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
        const has = mounted().some((x) => x.def.id === 'deck.tender-crane');
        if (!has) expect(b.warnings.join(' '), `${hull}/${skiff}`).toMatch(/skiff's cradle.*move the wheelhouse/);
      }
  });
});

describe('pins', () => {
  it('a pin puts the skiff on the deck and side it is on; the anchor back on; taking them off', () => {
    const house = { front: -1, aft: 2, halfWidth: 1.2 };
    const skiff = EQUIPMENT.find((e) => e.id === 'skiff')!;
    const anchor = EQUIPMENT.find((e) => e.id === 'anchor')!;
    expect(placeGear(skiff, [1, 1, -3], house, 5).patch).toEqual({ skiff: 1 });
    expect(placeGear(skiff, [-1, 1, -3], house, 5).patch).toEqual({ skiff: 2 });
    expect(placeGear(skiff, [1, 1, 4], house, 5).patch).toEqual({ skiff: 3 });
    expect(placeGear(skiff, [-1, 1, 4], house, 5).patch).toEqual({ skiff: 4 });
    expect(placeGear(anchor, [0, 1, -4], house, 5).patch).toEqual({ noAnchor: 0 });
    expect(removeGear(anchor)).toEqual({ noAnchor: 1 });
    expect(removeGear(skiff)).toEqual({ skiff: 0 });
    expect(fitted(anchor, BASE)).toBe(true);
    expect(fitted(anchor, { ...BASE, noAnchor: 1 })).toBe(false);
    expect(fitted(skiff, BASE)).toBe(false);
  });
});

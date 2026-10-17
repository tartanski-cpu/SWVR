/**
 * The Shipyard's boat builder: any design builds a valid boat that floats level on her
 * lines, her machinery and controls are the packages chosen, and her gearbox matches by trial.
 */
import { describe, expect, it } from 'vitest';
import { gearOf, useDesign } from '../../src/boats/sims';
import { RECIPES } from '../../src/boats/library';
import { validateRecipe } from '../../src/modular/recipe';
import { LIBRARY } from '../../src/boats/library';
import { DESIGN_HULLS, ENGINES } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, FIELDS, type ShipDesign } from '../../src/shipyard/design';
import { fullAhead, matchGear } from '../../src/shipyard/trial';
import { uprightHydrostatics } from '../../src/vessel/hydrostatics';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { flattenMounts } from '../../src/modular/recipe';

const all = (pick: (steps: number) => number) => Object.fromEntries(FIELDS.map((f) => [f.key, pick(f.steps)])) as unknown as ShipDesign;

describe('Shipyard: the boats it builds', () => {
  it('every base hull with every engine floats level on her lines, stable, with a valid recipe', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++)
      for (let engine = 0; engine < ENGINES.length; engine++) {
        const boat = useDesign({ ...DEFAULT_DESIGN, hull, engine });
        expect(validateRecipe(RECIPES.design, LIBRARY), `${hull}/${engine}`).toEqual([]);
        const h = uprightHydrostatics(VESSEL_DEFS.design);
        expect(Math.abs(h.sinkage), `${hull}/${engine} sinkage`).toBeLessThan(0.02);
        expect(Math.abs(h.lcgMinusLcb), `${hull}/${engine} trim`).toBeLessThan(0.02);
        expect(h.gmt, `${hull}/${engine} GM`).toBeGreaterThan(0.5);
        expect(gearOf({ defId: 'design' }, 'diesel')!.engine.powerKw).toBe(ENGINES[engine].kw);
        expect(boat.warnings, `${hull}/${engine}`).toEqual([]);
      }
  });

  it('the slider ends build too (every choice at its least and its most), each hull', () => {
    for (const ends of [all(() => 0), all((n) => n - 1)])
      for (let hull = 0; hull < DESIGN_HULLS.length; hull++) {
        useDesign({ ...ends, hull, engine: Math.min(ends.engine, ENGINES.length - 1) });
        expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
        expect(VESSEL_DEFS.design.mass).toBeGreaterThan(1000);
      }
  });

  it('basic controls are the wheel, throttle, starting, speed and depth, rpm; advanced adds the rest', () => {
    const ids = (controls: number) => {
      useDesign({ ...DEFAULT_DESIGN, controls });
      return flattenMounts(RECIPES.design, LIBRARY.hulls, LIBRARY.modules).mounted.map((m) => m.def.id);
    };
    const basic = ids(0);
    const advanced = ids(1);
    for (const id of ['control.wheel', 'control.throttle-lever', 'control.key-switch', 'propulsion.diesel-inboard']) expect(basic).toContain(id);
    expect(basic.filter((id) => id === 'instrument.screen').length).toBe(2);
    for (const id of ['radio.vhf', 'deck.searchlight', 'light.navigation']) {
      expect(basic).not.toContain(id);
      expect(advanced).toContain(id);
    }
  });

  it('the bow choice: plumb to well raked, each hull; a more raked bow cuts away her forefoot (less displacement, a shorter waterline)', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++) {
      const mass: number[] = [];
      const lwl: number[] = [];
      for (let bow = 0; bow < 5; bow++) {
        useDesign({ ...DEFAULT_DESIGN, hull, bow });
        expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
        const h = uprightHydrostatics(VESSEL_DEFS.design);
        expect(Math.abs(h.lcgMinusLcb), `${hull}/${bow} trim`).toBeLessThan(0.02);
        mass.push(VESSEL_DEFS.design.mass);
        lwl.push(VESSEL_DEFS.design.resistance.lwl);
      }
      for (let i = 1; i < 5; i++) {
        expect(mass[i], `hull ${hull} bow ${i}`).toBeLessThanOrEqual(mass[i - 1]);
        expect(lwl[i], `hull ${hull} bow ${i}`).toBeLessThanOrEqual(lwl[i - 1] + 1e-9);
      }
      expect(mass[4], `hull ${hull}`).toBeLessThan(mass[0]);
    }
    // As designed, she's exactly the hull she was: the landing craft's 7.85 t.
    useDesign({ ...DEFAULT_DESIGN, bow: 2 });
    expect(VESSEL_DEFS.design.mass).toBe(VESSEL_DEFS.landingCraft.mass);
  });

  it('only the landing craft hull has the bow ramp', () => {
    expect(useDesign({ ...DEFAULT_DESIGN, hull: 0 }).hull.layout.bowRamp).toBeDefined();
    expect(useDesign({ ...DEFAULT_DESIGN, hull: 1 }).hull.layout.bowRamp).toBeUndefined();
  });

  it('her gearbox is matched by trial: flat out just under rated rpm, and she drives', () => {
    const m = matchGear(DEFAULT_DESIGN);
    expect(m.rpm).toBeGreaterThan(1600);
    expect(m.rpm).toBeLessThan(1800);
    expect(m.knots).toBeGreaterThan(15);
    // One step lower and she can't reach it: the lowest that does.
    if (m.gear > 0) expect(fullAhead({ ...DEFAULT_DESIGN, gear: m.gear - 1 }).rpm).toBeLessThan(m.rpm);
  });
});

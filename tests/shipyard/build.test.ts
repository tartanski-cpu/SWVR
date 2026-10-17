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

  it('the bow choice, a stem raked 0 (plumb) to 50 deg, each hull: more rake cuts away more forefoot, but only near the stem', () => {
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
      // Even at 50 deg the keel is at full depth from 75 % of her length aft (owner: the
      // forefoot isn't cut away far back).
      const at = (t: number) => {
        const st = VESSEL_DEFS.design.hull.stations;
        const z = st[0].z - t * (st[0].z - st[st.length - 1].z);
        return st.reduce((a, b) => (Math.abs(b.z - z) < Math.abs(a.z - z) ? b : a));
      };
      useDesign({ ...DEFAULT_DESIGN, hull, bow: 0 });
      const plumbKeel = at(0.7).polygon[2][1];
      useDesign({ ...DEFAULT_DESIGN, hull, bow: 4 });
      expect(at(0.7).polygon[2][1], `hull ${hull}`).toBeCloseTo(plumbKeel, 6);
    }
  });

  it('each hull type\'s own starting layout builds cleanly (no warnings), floating level', () => {
    for (const h of DESIGN_HULLS) {
      const boat = useDesign({ ...DEFAULT_DESIGN, ...h.defaults, hull: DESIGN_HULLS.indexOf(h) });
      expect(boat.warnings, h.name).toEqual([]);
      expect(Math.abs(uprightHydrostatics(VESSEL_DEFS.design).lcgMinusLcb), h.name).toBeLessThan(0.02);
    }
  });

  it('twin engines: two engines\' weight and power, a propeller each side, and more speed than one', () => {
    const single = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[3].defaults, hull: 3, twin: 0 };
    const twin = { ...single, twin: 1 };
    useDesign(single);
    const m1 = VESSEL_DEFS.design.mass;
    const boat = useDesign(twin);
    expect(VESSEL_DEFS.design.mass).toBe(m1); // she floats on her lines either way: her lightship gives way
    const diesel = gearOf({ defId: 'design' }, 'diesel')!;
    expect(diesel.twin).toBe(true);
    expect(boat.figures.engine).toMatch(/^Twin /);
    const one = matchGear(single);
    const two = matchGear(twin);
    expect(two.knots).toBeGreaterThan(one.knots + 2);
  });

  it('the pilot boat\'s spray chine is drawn on her topsides, above her chine, but her sections (buoyancy) keep one chine', () => {
    useDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[3].defaults, hull: 3 });
    const mid = VESSEL_DEFS.design.hull.stations.filter((s) => s.halfBeamDeck > 1);
    expect(mid.length).toBeGreaterThan(5);
    for (const s of mid) {
      expect(s.polygon.length).toBe(5);
      const [x, y] = s.spray!;
      expect(y).toBeGreaterThan(s.polygon[3][1]);
      expect(y).toBeLessThan(s.polygon[4][1]);
      expect(x).toBeGreaterThan(s.polygon[3][0]);
    }
    useDesign({ ...DEFAULT_DESIGN, hull: 2 });
    expect(VESSEL_DEFS.design.hull.stations.some((s) => s.spray)).toBe(false);
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

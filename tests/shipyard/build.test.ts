/**
 * The Shipyard's boat builder: any design builds a valid boat that floats level on her
 * lines, her machinery and controls are the packages chosen, and her gearbox matches by trial.
 */
import { describe, expect, it } from 'vitest';
import { footprintsOf, gearOf, useDesign } from '../../src/boats/sims';
import { RECIPES } from '../../src/boats/library';
import { validateRecipe } from '../../src/modular/recipe';
import { LIBRARY } from '../../src/boats/library';
import { DESIGN_HULLS, ENGINES } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, FIELDS, type ShipDesign } from '../../src/shipyard/design';
import { fullAhead, matchGear } from '../../src/shipyard/trial';
import { uprightHydrostatics } from '../../src/vessel/hydrostatics';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { flattenMounts } from '../../src/modular/recipe';
import { vesselWalkArea } from '../../src/vessel/layout';
import { hullPlan } from '../../src/vessel/layout';

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

  it('every floor height, each hull: no step over 0.35 m from the deck at the door to the floor, and the walk area takes you in', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++)
      for (let floor = 0; floor < 8; floor++) {
        useDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, floor });
        const def = VESSEL_DEFS.design;
        const wh = def.layout.wheelhouse!;
        const deck = hullPlan(def).deckY(wh.aft + 0.15);
        const levels = [deck, ...(wh.steps ?? []).map((s) => s.y), wh.floorY].sort((a, b) => a - b);
        for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1], `hull ${hull} floor ${floor}`).toBeLessThanOrEqual(0.351);
        // Walking in at the door, along the centreline: each spot's floor within a step of the last.
        const walk = vesselWalkArea(def, def.layout);
        let y = deck;
        for (let z = wh.aft + 0.65; z > wh.aft - 0.9; z -= 0.05) {
          const here = walk.floorsAt(0, z).filter((f) => Math.abs(f - y) <= 0.4);
          expect(here.length, `hull ${hull} floor ${floor} at z ${z.toFixed(2)}`).toBeGreaterThan(0);
          y = here.reduce((a, f) => (Math.abs(f - wh.floorY) < Math.abs(a - wh.floorY) ? f : a));
        }
        expect(y).toBeCloseTo(wh.floorY, 6);
      }
  });

  it('the house\'s shape at its extremes builds cleanly: windows raked either way, the front below leaning, the visor, the roof\'s thickness and edge', () => {
    for (const hull of [0, 3])
      for (const windowRake of [0, 8])
        for (const [lowerFront, visor, roofThickness, roofEdge] of [[0, 0, 0, 1], [4, 4, 2, 3], [4, 0, 2, 3]]) {
          const boat = useDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, windowRake, lowerFront, visor, roofThickness, roofEdge });
          const wh = boat.hull.layout.wheelhouse!;
          expect(wh.shape).toBeDefined();
          expect(boat.hull.layout.ladder).toBeUndefined();
          expect(wh.windowHead).toBeGreaterThan(wh.frontSill! + 0.4);
          expect(wh.doorHeight).toBeGreaterThan(1.7);
        }
  });

  it('the deck crane goes on the foredeck or the aft deck of each hull, with a hydraulic pump, and the walk area keeps clear of it', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++)
      for (const deckCrane of [1, 2]) {
        const boat = useDesign({ ...DEFAULT_DESIGN, hull, deckCrane });
        expect(validateRecipe(RECIPES.design, LIBRARY), `${hull}/${deckCrane}`).toEqual([]);
        const ids = flattenMounts(RECIPES.design, LIBRARY.hulls, LIBRARY.modules).mounted.map((m) => m.def.id);
        expect(ids, `${hull}/${deckCrane}`).toContain('deck.crane');
        expect(ids, `${hull}/${deckCrane}`).toContain('hydraulics.pto-pump');
        expect(boat.warnings, `${hull}/${deckCrane}`).toEqual([]);
        // Still floats level with the crane's weight.
        const h = uprightHydrostatics(VESSEL_DEFS.design);
        expect(Math.abs(h.lcgMinusLcb), `${hull}/${deckCrane} trim`).toBeLessThan(0.02);
        // Nobody walks through its column.
        const crane = flattenMounts(RECIPES.design, LIBRARY.hulls, LIBRARY.modules).mounted.find((m) => m.def.id === 'deck.crane')!;
        const [cx, , cz] = crane.socket.transform.position;
        const def = VESSEL_DEFS.design;
        const walk = vesselWalkArea(def, def.layout, footprintsOf({ defId: 'design' }));
        expect(walk.walkable(cx, cz, hullPlan(def).deckY(cz)), `${hull}/${deckCrane} walk`).toBe(false);
        const beside = [[0, -0.8], [0, 0.8], [-0.8, 0], [0.8, 0]].some(([dx, dz]) => walk.walkable(cx + dx, cz + dz, hullPlan(def).deckY(cz + dz)));
        expect(beside, `${hull}/${deckCrane} beside`).toBe(true);
      }
    useDesign(DEFAULT_DESIGN);
    expect(flattenMounts(RECIPES.design, LIBRARY.hulls, LIBRARY.modules).mounted.map((m) => m.def.id)).not.toContain('deck.crane');
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

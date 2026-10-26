/**
 * The Shipyard's boat builder: any design builds a valid boat that floats level on her
 * lines, her machinery and controls are the packages chosen, and her gearbox matches by trial.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cranesOf } from '../../src/cargo/craneHook';
import { footprintsOf, gearOf, useDesign } from '../../src/boats/sims';
import { RECIPES } from '../../src/boats/library';
import { validateRecipe } from '../../src/modular/recipe';
import { LIBRARY } from '../../src/boats/library';
import { DESIGN_HULLS, ENGINES } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, FIELDS, placeValue, type ShipDesign, fromSteps } from '../../src/shipyard/design';
import { fullAhead, matchGear } from '../../src/shipyard/trial';
import { uprightHydrostatics } from '../../src/vessel/hydrostatics';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { flattenMounts } from '../../src/modular/recipe';
import { vesselWalkArea } from '../../src/vessel/layout';
import { hullPlan } from '../../src/vessel/layout';

const all = (pick: (steps: number) => number) => Object.fromEntries(FIELDS.map((f) => [f.key, pick(f.steps)])) as unknown as ShipDesign;

describe('Shipyard: the boats it builds', () => {
  it('every base hull with every engine floats level on her lines, stable, with a valid recipe', () => {
    // (Not the harbour tug, a one-off with her own engine fixed, nor her engine on another: tests/shipyard/harbourTug.test.ts.)
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++)
      for (let engine = 0; engine < ENGINES.length; engine++) {
        if (DESIGN_HULLS[hull].fixed || (ENGINES[engine] as { only?: readonly number[] }).only) continue;
        const boat = useDesign({ ...DEFAULT_DESIGN, hull, engine });
        expect(validateRecipe(RECIPES.design, LIBRARY), `${hull}/${engine}`).toEqual([]);
        const h = uprightHydrostatics(VESSEL_DEFS.design);
        expect(Math.abs(h.sinkage), `${hull}/${engine} sinkage`).toBeLessThan(0.02);
        expect(Math.abs(h.lcgMinusLcb), `${hull}/${engine} trim`).toBeLessThan(0.02);
        // Stable; a tender one (a heavy engine high in a light hull) is told so. (The 750 kW
        // diesel, nearly 5 t, makes the smallest hulls tender: still stable, and told.)
        expect(h.gmt, `${hull}/${engine} GM`).toBeGreaterThan(engine === 4 ? 0.1 : 0.3);
        if (h.gmt < 0.5) expect(boat.warnings.some((w) => w.startsWith('Her stability is low')), `${hull}/${engine}`).toBe(true);
        expect(gearOf({ defId: 'design' }, 'diesel')!.engine.powerKw).toBe(ENGINES[engine].kw);
        // The tall tug diesel and the 750 kW don't fit under a shallow hull's floor
        // (machinery.ts): said so, and nothing else. (They fit the tug and the trawler, below.)
        if (engine >= 3) expect(boat.warnings.filter((w) => !/^The (450|750) kW .* doesn(’|')t fit/.test(w) && !w.startsWith('Her stability is low')), `${hull}/${engine}`).toEqual([]);
        else expect(boat.warnings, `${hull}/${engine}`).toEqual([]);
      }
  });

  it('every hull type as it comes has room for its engines', () => {
    for (const [hull, t] of DESIGN_HULLS.entries()) expect(useDesign({ ...DEFAULT_DESIGN, ...t.defaults, hull }).figures.engineShortM, t.name).toBe(0);
  });

  it('the tug diesel fits the small tug as she comes, not the landing craft', () => {
    expect(useDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[4].defaults, hull: 4 }).figures.engineShortM).toBe(0);
    expect(useDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[0].defaults, hull: 0, engine: 3 }).figures.engineShortM).toBeGreaterThan(0.1);
  });

  it('the slider ends build too (every choice at its least and its most), each hull', () => {
    for (const ends of [all(() => 0), all((n) => n - 1)])
      for (let hull = 0; hull < DESIGN_HULLS.length; hull++) {
        useDesign({ ...ends, hull, engine: Math.min(ends.engine, ENGINES.length - 1) });
        expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
        expect(VESSEL_DEFS.design.mass).toBeGreaterThan(1000);
      }
  });

  it('basic controls are the wheel, throttle, starting, nav lights, speed and depth, rpm and the VHF; advanced adds the rest', () => {
    const ids = (controls: number) => {
      useDesign({ ...DEFAULT_DESIGN, controls, searchlight: 0 });
      return flattenMounts(RECIPES.design, LIBRARY.hulls, LIBRARY.modules).mounted.map((m) => m.def.id);
    };
    const basic = ids(0);
    const advanced = ids(1);
    for (const id of ['control.wheel', 'control.throttle-lever', 'control.key-switch', 'propulsion.diesel-inboard']) expect(basic).toContain(id);
    // Speed and rpm, the ANCHOR quarter screen (she has an anchor), and the clock (CS5).
    expect(basic.filter((id) => id === 'instrument.screen').length).toBe(4);
    // Every boat has a VHF (owner, Oct 2026): she answers calls, hears the forecasts.
    expect(basic).toContain('radio.vhf');
    for (const id of ['radio.fm', 'nav.chartplotter', 'furniture.whiteboard', 'furniture.duty-board']) {
      expect(basic).not.toContain(id);
      expect(advanced).toContain(id);
    }
    // Navigation lights, and their switch at the helm, in every tier (owner, Oct 2026).
    for (const patch of [{ controls: 0, oldSchool: 1 }, { controls: 0, oldSchool: 0 }, { controls: 1 }]) {
      useDesign({ ...DEFAULT_DESIGN, searchlight: 0, ...patch });
      const mounted = flattenMounts(RECIPES.design, LIBRARY.hulls, LIBRARY.modules).mounted;
      expect(mounted.some((m) => m.def.id === 'light.navigation'), JSON.stringify(patch)).toBe(true);
      expect(mounted.some((m) => m.path === 'helm/navLights'), JSON.stringify(patch)).toBe(true);
    }
  });

  it('three tiers (owner, Oct 2026): old school swaps the basic screens for round analogue gauges; advanced ignores it', () => {
    const screens = (patch: Partial<ShipDesign>) => {
      useDesign({ ...DEFAULT_DESIGN, searchlight: 0, ...patch });
      expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
      const mods = flattenMounts(RECIPES.design, LIBRARY.hulls, LIBRARY.modules).mounted;
      return mods.filter((m) => m.def.id === 'instrument.screen').map((m) => (m.config as { screen: string }).screen).sort();
    };
    const old = screens({ controls: 0, oldSchool: 1 });
    // She has an anchor, so a chain counter too.
    expect(old).toEqual(['dialChain', 'dialClock', 'dialCompass', 'dialDepth', 'dialFuel', 'dialRpm', 'dialSpeed', 'dialTemp']);
    expect(screens({ controls: 0, oldSchool: 0 })).toEqual(['anchor', 'clock', 'rpm', 'speed']);
    // The advanced tier keeps its screens whatever the old-school flag says.
    expect(screens({ controls: 1, oldSchool: 1 })).toEqual(screens({ controls: 1, oldSchool: 0 }));
  });

  it('touchscreens (CS5): with the advanced controls, one or two in place of her screens, a tab for each page she has; the basic ignore it', () => {
    const touch = (patch: Partial<ShipDesign>) => {
      useDesign({ ...DEFAULT_DESIGN, searchlight: 0, ...patch });
      expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
      const flat = flattenMounts(RECIPES.design, LIBRARY.hulls, LIBRARY.modules).mounted;
      const screens = flat.filter((m) => m.def.id === 'instrument.screen' && m.path.includes('helm'));
      return { screens: screens.map((m) => m.config as { screen: string; pages?: string[]; channel?: string; first?: number }) };
    };
    const one = touch({ controls: 1, touch: 1 });
    expect(one.screens.map((c) => c.screen)).toEqual(['touch']);
    // She has an anchor: its page; no tow point on the default boat: no TOW page.
    expect(one.screens[0].pages).toEqual(['speed', 'heading', 'rpm', 'engineMonitor', 'anchor', 'nav']);
    const two = touch({ controls: 1, touch: 2 });
    expect(two.screens.map((c) => [c.channel, c.first])).toEqual([['touchPage1', 0], ['touchPage2', 2]]);
    // A tow point (her stern roller): the TOW page too.
    expect(touch({ controls: 1, touch: 1, sternRoller: 1 }).screens[0].pages).toContain('towline');
    // The basic controls: no touchscreen, whatever the field says.
    expect(touch({ controls: 0, touch: 2 }).screens.map((c) => c.screen)).not.toContain('touch');
  });

  it('the bow choice, a stem raked 0 (plumb) to 50 deg, each hull: more rake cuts away more forefoot, but only near the stem (not a push bow or a landing bow)', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++) {
      // (Not a one-off, the harbour tug: her bow is fixed.)
      if (DESIGN_HULLS[hull].fixed) continue;
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
      // A tug's push bow and a landing craft's landing bow are their own: the bow choice leaves them as they are.
      if (DESIGN_HULLS[hull].pushBow || DESIGN_HULLS[hull].landingBow) {
        expect(new Set(mass).size, `hull ${hull}`).toBe(1);
        continue;
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
      // (Her keel's depth under her deck: she floats a little higher or lower with each bow, at what she weighs.)
      const keelDepth = () => at(0.7).polygon[0][1] - at(0.7).polygon[2][1];
      const plumbKeel = keelDepth();
      useDesign({ ...DEFAULT_DESIGN, hull, bow: 4 });
      expect(keelDepth(), `hull ${hull}`).toBeCloseTo(plumbKeel, 6);
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
    // Heavier by the second engine and its shafting, propeller and rudder (she floats deeper for it).
    expect(VESSEL_DEFS.design.mass).toBeGreaterThan(m1 + ENGINES[single.engine].kg);
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
    // (Not a one-off, the harbour tug: her floor is fixed, her bridge up on her deckhouse.)
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++)
      for (let floor = 0; floor < (DESIGN_HULLS[hull].fixed ? 0 : 8); floor++) {
        useDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, ...fromSteps({ floor }) });
        const def = VESSEL_DEFS.design;
        const wh = def.layout.wheelhouse!;
        // Walking in from the deck aft of the door's steps (with a high floor they run more than 0.65 m aft of it).
        const start = Math.max(wh.aft + 0.65, ...(wh.steps ?? []).map((s) => s.z1 + 0.1));
        const deck = hullPlan(def).deckY(wh.aft + 0.15);
        const levels = [deck, ...(wh.steps ?? []).map((s) => s.y), wh.floorY].sort((a, b) => a - b);
        for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1], `hull ${hull} floor ${floor}`).toBeLessThanOrEqual(0.351);
        // Walking in at the door, along the centreline: each spot's floor within a step of the last.
        const walk = vesselWalkArea(def, def.layout);
        let y = deck;
        for (let z = start; z > wh.aft - 0.9; z -= 0.05) {
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
          const boat = useDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, ...fromSteps({ windowRake, roofThickness, roofEdge }), lowerFront, visor });
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
        // It stands at a deck edge, clear of the middle of the working deck (owner), and
        // nobody walks through its column.
        const [cx, , cz] = new THREE.Vector3().setFromMatrixPosition(cranesOf({ defId: 'design' })[0].place).toArray();
        expect(Math.abs(cx), `${hull}/${deckCrane} at the side`).toBeGreaterThan(0.4);
        const def = VESSEL_DEFS.design;
        const walk = vesselWalkArea(def, def.layout, footprintsOf({ defId: 'design' }));
        expect(walk.walkable(cx, cz, hullPlan(def).deckY(cz)), `${hull}/${deckCrane} walk`).toBe(false);
        const beside = [[0, -0.8], [0, 0.8], [-0.8, 0], [0.8, 0]].some(([dx, dz]) => walk.walkable(cx + dx, cz + dz, hullPlan(def).deckY(cz + dz)));
        expect(beside, `${hull}/${deckCrane} beside`).toBe(true);
      }
    useDesign(DEFAULT_DESIGN);
    expect(flattenMounts(RECIPES.design, LIBRARY.hulls, LIBRARY.modules).mounted.map((m) => m.def.id)).not.toContain('deck.crane');
  });

  it('the searchlight and fire monitor go on the roof or on a deck pole, on every hull and with the crane anywhere; poles keep clear of walking', () => {
    const left: string[] = [];
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++)
      for (const deckCrane of [0, 1, 2])
        for (let searchlight = 0; searchlight < 4; searchlight++)
          for (let fireMonitor = 0; fireMonitor < 4; fireMonitor++) {
            const tag = `hull ${hull} crane ${deckCrane} lamp ${searchlight} monitor ${fireMonitor}`;
            const boat = useDesign({ ...DEFAULT_DESIGN, hull, deckCrane, searchlight, fireMonitor });
            expect(validateRecipe(RECIPES.design, LIBRARY), tag).toEqual([]);
            if (boat.warnings.length) left.push(`${tag}: ${boat.warnings.join(' ')}`);
            const mounted = flattenMounts(RECIPES.design, LIBRARY.hulls, LIBRARY.modules).mounted;
            const def = VESSEL_DEFS.design;
            const walk = vesselWalkArea(def, def.layout, footprintsOf({ defId: 'design' }));
            for (const [id, choice] of [['deck.searchlight', searchlight], ['deck.fire-monitor', fireMonitor]] as const) {
              const m = mounted.find((x) => x.def.id === id);
              if (!choice) {
                expect(m, tag).toBeUndefined();
                continue;
              }
              if (!m) continue; // left off for want of room (warned)
              const c = m.config as { position: [number, number, number]; pole: { deckY: number } | null };
              expect(!!c.pole, tag).toBe(choice >= 2);
              if (!c.pole) continue;
              // The pole stands on deck, the unit high above it, and you can't walk through it but can stand aft of its box.
              const [x, y, z] = c.position;
              expect(c.pole.deckY, tag).toBeCloseTo(hullPlan(def).deckY(z), 2);
              expect(y - c.pole.deckY, tag).toBeGreaterThan(2);
              expect(walk.walkable(x, z, c.pole.deckY), `${tag} ${id} pole`).toBe(false);
              expect(walk.walkable(x, z + 0.42, c.pole.deckY), `${tag} ${id} stand`).toBe(true);
            }
          }
    // Every hull finds room for both poles on either deck, with or without a crane; only the
    // shortest aft decks can't take the aft crane and both poles too (and say so).
    for (const l of left) expect(l).toMatch(/^hull [01] crane 2 lamp 3 monitor 3: There's no room on her aft deck for the fire monitor's pole/);
  }, 120000); // Room: about 14 s here, twice that on GitHub's publishing machine, past the 20 s default.

  it('a unit on the roof is worked from the helm; one on a pole has its own controls, and the helm\'s too with the advanced controls', () => {
    const helm = (d: Partial<ShipDesign>) => {
      useDesign({ ...DEFAULT_DESIGN, ...d });
      const mounted = flattenMounts(RECIPES.design, LIBRARY.hulls, LIBRARY.modules).mounted;
      return mounted.filter((m) => m.path.startsWith('helm/')).map((m) => m.socket.id);
    };
    for (const controls of [0, 1]) {
      expect(helm({ controls, searchlight: 1, fireMonitor: 1 })).toEqual(expect.arrayContaining(['spotlight', 'spotJoystick', 'firePump', 'monJoystick']));
      const onPoles = helm({ controls, searchlight: 2, fireMonitor: 3 });
      for (const id of ['spotlight', 'spotJoystick', 'firePump', 'monJoystick']) expect(onPoles.includes(id), `${controls} ${id}`).toBe(!!controls);
      const none = helm({ controls, searchlight: 0, fireMonitor: 0 });
      for (const id of ['spotlight', 'spotJoystick', 'firePump', 'monJoystick']) expect(none).not.toContain(id);
    }
  });

  it('the advanced instruments (chartplotter, NAV / WIND screen, task board, whiteboard) on every hull; the chart table its own choice, with room to walk past it', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++) {
      const boat = useDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, controls: 1, chartTable: 1 });
      expect(validateRecipe(RECIPES.design, LIBRARY), `${hull}`).toEqual([]);
      const mounted = flattenMounts(RECIPES.design, LIBRARY.hulls, LIBRARY.modules).mounted;
      const ids = mounted.map((m) => m.def.id);
      for (const id of ['nav.chartplotter', 'furniture.whiteboard', 'furniture.duty-board']) expect(ids, `${hull} ${id}`).toContain(id);
      expect(mounted.some((m) => m.def.id === 'instrument.screen' && (m.config as { screen: string }).screen === 'nav'), `${hull} nav`).toBe(true);
      const table = mounted.find((m) => m.def.id === 'furniture.chart-table');
      if (!table) {
        expect(boat.warnings.join(' '), `${hull}`).toMatch(/too (narrow|short) for the chart table/);
        continue;
      }
      // You can still walk past it: the house's centreline beside it is free.
      const def = VESSEL_DEFS.design;
      const [, , z0] = table.socket.transform.position;
      const walk = vesselWalkArea(def, def.layout, footprintsOf({ defId: 'design' }));
      expect(walk.walkable(0, z0 + 0.5, def.layout.wheelhouse!.floorY), `${hull} past the table`).toBe(true);
    }
    useDesign({ ...DEFAULT_DESIGN, chartTable: 0 });
    expect(flattenMounts(RECIPES.design, LIBRARY.hulls, LIBRARY.modules).mounted.map((m) => m.def.id)).not.toContain('furniture.chart-table');
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

  it('the crane at the deck edge: the builder plans it there, so a pole never lands on it and she floats upright', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++)
      for (const deckCrane of [1, 2]) {
        useDesign({ ...DEFAULT_DESIGN, hull, deckCrane, searchlight: deckCrane + 1, fireMonitor: deckCrane + 1 });
        const crane = cranesOf({ defId: 'design' })[0];
        if (!crane) continue; // no room for it on this deck: left off, with a warning
        const c = new THREE.Vector3().setFromMatrixPosition(crane.place);
        // Its socket is where the column stands: the module keeps it there.
        const socket = flattenMounts(RECIPES.design, LIBRARY.hulls, LIBRARY.modules).mounted.find((m) => m.def.id === 'deck.crane')!.socket.transform.position;
        expect(Math.abs(socket[0] - c.x), `hull ${hull} crane ${deckCrane} socket`).toBeLessThan(0.01);
        // The poles on the same deck stand clear of its plinth.
        for (const m of flattenMounts(RECIPES.design, LIBRARY.hulls, LIBRARY.modules).mounted.filter((x) => x.def.id === 'deck.searchlight' || x.def.id === 'deck.fire-monitor')) {
          const [px, , pz] = m.socket.transform.position;
          expect(Math.hypot(px - c.x, pz - c.z), `hull ${hull} crane ${deckCrane} ${m.def.id}`).toBeGreaterThan(0.5);
        }
        expect(Math.abs(VESSEL_DEFS.design.cg[0]), `hull ${hull} crane ${deckCrane} list`).toBeLessThan(0.002);
      }
  });

  it('gear placed by hand stands on its pinned 25 cm cell: on deck, on the roof, turned; nudged off a clash; else its usual place', () => {
    const wb = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[2].defaults, hull: 2 };
    const sockOf = (id: string) => LIBRARY.hulls.get(RECIPES.design.hull)!.sockets.find((x) => x.id === id)!;
    const transom = () => hullPlan(VESSEL_DEFS.design).transom;
    // The crane on the aft deck, 1.5 m from the transom and 0.75 m to port, turned to face starboard.
    let b = useDesign({ ...wb, deckCrane: 2, craneAt: placeValue('craneAt', -0.75, 1.5, 1) });
    expect(b.placed.craneAt).toMatchObject({ x: -0.75, moved: false });
    expect(b.placed.craneAt!.z).toBeCloseTo(transom() - 1.5, 6);
    const crane = sockOf('deckCrane');
    expect(crane.transform.position[0]).toBeCloseTo(-0.75, 6);
    expect(crane.transform.rotationDeg).toEqual([0, -90, 0]);
    expect(new THREE.Vector3().setFromMatrixPosition(cranesOf({ defId: 'design' })[0].place).x).toBeCloseTo(-0.75, 6); // the module keeps it there
    expect(Math.abs(VESSEL_DEFS.design.cg[0])).toBeLessThan(0.002); // still upright
    // The searchlight pinned on the roof: mounted there, worked from the helm.
    const wh = () => VESSEL_DEFS.design.layout.wheelhouse!;
    useDesign(wb);
    const roofZ = (wh().front + wh().aft) / 2 + 0.5;
    b = useDesign({ ...wb, searchlight: 2, lampAt: placeValue('lampAt', 0.5, transom() - roofZ) });
    expect(b.placed.lampAt).toMatchObject({ onRoof: true, x: 0.5 });
    expect(sockOf('searchlight').type).toBe('roof.mount');
    expect(sockOf('searchlight').transform.position[0]).toBeCloseTo(0.5, 6);
    // The monitor on a pole on the foredeck, where pinned.
    const foreZ = wh().front - 1.5;
    b = useDesign({ ...wb, fireMonitor: 1, monitorAt: placeValue('monitorAt', 0.5, transom() - foreZ) });
    expect(b.placed.monitorAt).toMatchObject({ onRoof: false, moved: false });
    expect(sockOf('fireMonitor').type).toBe('deck.equipment');
    // Pinned on the house's side (a pole can't stand in the house): nudged to the nearest cell that's clear.
    b = useDesign({ ...wb, fireMonitor: 1, monitorAt: placeValue('monitorAt', wh().halfWidth + 0.1, transom() - wh().front - 0.4) });
    expect(b.placed.monitorAt === null || b.placed.monitorAt!.moved).toBe(true);
    // Pinned in the sea, far off her side: its usual place, with a warning.
    b = useDesign({ ...wb, towWinch: 1, winchAt: placeValue('winchAt', 3, 0.25) });
    expect(b.placed.winchAt).toBeNull();
    expect(b.warnings.join(' ')).toMatch(/tow winch won't stand where it's pinned/);
    expect(sockOf('towWinch').transform.position[0]).toBe(0); // its usual place on the centreline
    // Two pieces pinned on the same cell: the second moves off the first.
    b = useDesign({ ...wb, towWinch: 1, fireMonitor: 1, winchAt: placeValue('winchAt', 0, 2), monitorAt: placeValue('monitorAt', 0, 2) });
    expect(b.placed.winchAt!.moved).toBe(false);
    expect(b.placed.monitorAt === null || b.placed.monitorAt!.moved).toBe(true);
  });

  it('the working deck gear: winch, stern roller, A-frame and trawl, life ring and boat hook, side door; she tows and trawls', () => {
    const wb = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[2].defaults, hull: 2 };
    // A narrower house than her usual, for a side deck outside the side door.
    const b = useDesign({ ...wb, houseWidth: 0.8, towWinch: 1, sternRoller: 1, aFrame: 1, lifeRing: 2, sideDoor: 1 });
    expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
    expect(b.warnings.filter((w) => /left off/.test(w))).toEqual([]);
    for (const k of ['towWinch', 'towPoint', 'trawlGantry', 'trawl', 'lifeRing', 'boatHook'] as const) expect(gearOf({ defId: 'design' }, k), k).toBeTruthy();
    expect(gearOf({ defId: 'design' }, 'lifeRing')!.stow[0]).toBeGreaterThan(0); // starboard
    expect(VESSEL_DEFS.design.layout.wheelhouse!.sideDoor).toBeTruthy();
    expect(VESSEL_DEFS.design.layout.fairleadGap).toBeGreaterThan(0); // the notch for the roller
    // And priced in.
    expect(b.figures.price).toBeGreaterThan(useDesign({ ...wb, houseWidth: 0.8 }).figures.price + 30_000);
    // Without room for a side deck, the door's left off and says why.
    expect(useDesign({ ...wb, sideDoor: 1 }).warnings.join(' ')).toMatch(/narrower house/);
  });
});

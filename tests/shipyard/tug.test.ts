/**
 * The small tug (owner): the Shipyard's fifth hull type, from a reference render. A short,
 * deep, beamy hull with a square push bow faced with a rubber push fender. Her code (the
 * fifth type rides in the extension: every earlier code unchanged), her bow, and her fender
 * meeting a quay and another boat before her bow plate does.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { gearOf, useDesign } from '../../src/boats/sims';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { CONFIG } from '../../src/config';
import { IdFactory } from '../../src/core/ids';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { assembleView } from '../../src/modular/assemble';
import { flattenMounts, validateRecipe } from '../../src/modular/recipe';
import { mergeParts } from '../../src/render/geometryUtils';
import { bareHull } from '../../src/shipyard/brief';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, HULL_TYPES, placeValue, type ShipDesign } from '../../src/shipyard/design';
import { TYPE_FACTS } from '../../src/shipyard/typeFit';
import { hullPlan } from '../../src/vessel/layout';
import { uprightHydrostatics } from '../../src/vessel/hydrostatics';
import { vesselContacts } from '../../src/vessel/physics/vesselContact';
import { placeVessel } from '../../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { createVesselState } from '../../src/vessel/vesselState';
import { BERTHS } from '../../src/world/archipelago';
import { fakeCanvas } from '../modular/fakes';

beforeAll(fakeCanvas);

const TUG = 4;
const tug = (more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...bareHull(TUG, (i) => DESIGN_HULLS[i].defaults), ...more });

describe('the small tug: a fifth hull type', () => {
  it('is in the lists: the hull types, the code\'s scale, the brief\'s measured facts', () => {
    expect(DESIGN_HULLS).toHaveLength(HULL_TYPES);
    expect(DESIGN_HULLS[TUG].pushBow).toBe(true);
    expect(TYPE_FACTS).toHaveLength(HULL_TYPES);
    expect(TYPE_FACTS[TUG].goodFor).toContain('towing');
  });

  it('her code reads back as her, with any of the extension\'s other choices; the first four types\' codes are as they were', () => {
    for (const d of [tug(), tug({ guard: 0 }), tug({ guard: 3, rails: 1, skiff: 2, noAnchor: 1 }), tug({ dhLength: 2, dhHeight: 1, deckCrane: 2, craneAt: placeValue('craneAt', -1, 2.5, 1) })]) {
      const code = encodeDesign(d);
      expect(decodeDesign(code)).toEqual({ design: d });
    }
    // Hull 0 .. 3 with nothing in the extension: still 17 characters (no room taken by the tug).
    for (let hull = 0; hull < 4; hull++) expect(encodeDesign({ ...DEFAULT_DESIGN, hull, guard: 0 }).replace(/-/g, '')).toHaveLength(17);
    expect(() => encodeDesign({ ...DEFAULT_DESIGN, hull: HULL_TYPES })).toThrow();
  });

  it('builds as her reference: short, beamy and deep, level on her lines, stable, twin screws, a strake, no warnings', () => {
    const boat = useDesign(tug());
    expect(boat.warnings).toEqual([]);
    expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
    const f = boat.figures;
    expect(f.lengthM / f.beamM).toBeGreaterThan(2.2);
    expect(f.lengthM / f.beamM).toBeLessThan(2.7);
    expect(f.draughtM).toBeGreaterThan(1.4);
    expect(f.gmM).toBeGreaterThan(0.8);
    expect(f.engine).toMatch(/^Twin/);
    const h = uprightHydrostatics(VESSEL_DEFS.design);
    expect(Math.abs(h.sinkage)).toBeLessThan(0.02);
    expect(Math.abs(h.lcgMinusLcb)).toBeLessThan(0.02);
    expect(gearOf({ defId: 'design' }, 'sideGuard')?.kind).toBe('strake');
    // Her bow: square (a push plate about two thirds of her beam), her sheer rising to it.
    const plan = hullPlan(VESSEL_DEFS.design);
    expect((2 * plan.halfBeam(plan.stem)) / f.beamM).toBeGreaterThan(0.55);
    expect(plan.deckY(plan.stem)).toBeGreaterThan(plan.deckY(plan.transom) + 0.6);
  });

  it('her push knees: two on her bow plate, either side of the centreline, from the bulwark top down near its foot, standing proud of it; no draw calls of their own', () => {
    useDesign(tug());
    const def = VESSEL_DEFS.design;
    const plan = hullPlan(def);
    const m = flattenMounts(RECIPES.design, LIBRARY.hulls, LIBRARY.modules).mounted.find((x) => x.def.id === 'hull.push-fender')!;
    expect(m).toBeDefined();
    const c = m.config as { halfWidth: number; bottom: number; top: number; z: number };
    expect(c.z).toBeCloseTo(plan.stem, 3);
    expect(c.halfWidth).toBeGreaterThan(plan.halfBeam(plan.stem) - 0.1);
    expect(c.top).toBeCloseTo(plan.deckY(plan.stem) + def.layout.bulwarkHeight, 3);
    expect(c.bottom).toBeLessThan(plan.deckY(plan.stem) - 1);
    const probes = gearOf({ defId: 'design' }, 'pushFender')!.probes;
    const pf = CONFIG.modules.pushFender;
    expect(probes).toHaveLength(pf.knees * pf.across * pf.up);
    // Two separate knees, either side of the centreline: the bow plate clear between them.
    expect(pf.knees).toBe(2);
    expect(probes.filter(([x]) => x < 0)).toHaveLength(pf.across * pf.up);
    expect(Math.min(...probes.map(([x]) => Math.abs(x)))).toBeGreaterThan(0.3);
    for (const [x] of probes) expect(Math.abs(x)).toBeLessThan(c.halfWidth);
    for (const [, , z] of probes) expect(z).toBeCloseTo(plan.stem - CONFIG.modules.pushFender.thickness, 6);
    const view = assembleView(RECIPES.design, def, LIBRARY);
    const fv = view.modules.find((x) => x.id === 'hull.push-fender')!;
    let meshes = 0;
    fv.root.traverse((o) => void ((o as { isMesh?: boolean }).isMesh && meshes++));
    expect(meshes).toBe(0);
    expect(mergeParts(view.staticParts)).not.toBeNull();
    // Only the push bow has one.
    for (let hull = 0; hull < TUG; hull++) {
      useDesign({ ...DEFAULT_DESIGN, hull });
      expect(gearOf({ defId: 'design' }, 'pushFender')).toBeNull();
    }
  });
});

describe('the small tug: her push fender at work', { timeout: 120000 }, () => {
  it('nosing into a quay at 2 m/s: the push fender takes it, her hull isn\'t damaged; a workboat hull is', () => {
    const ram = (d: ShipDesign) => {
      useDesign(d);
      const { world, vesselId } = createWorld(new IdFactory(), 'design');
      world.environment.waves = [];
      const v = world.vessels[vesselId];
      const plan = hullPlan(VESSEL_DEFS.design);
      const berth = BERTHS.find((b) => b.id === 'calder-cargo')!;
      // Bow east toward Calder Haven's quay face (2.5 m east of the berth line), a metre off.
      const face = berth.x + 2.5;
      placeVessel(v, face + plan.stem - CONFIG.modules.pushFender.thickness - 1.0, 0, berth.z, 90);
      const DT = 1 / 60;
      for (let i = 0; i < 2 / DT; i++) stepWorld(world, [], DT);
      v.damage = 0;
      v.linearVelocity = [2, 0, 0];
      v.angularVelocity = [0, 0, 0];
      let push = 0;
      for (let i = 0; i < 4 / DT; i++) {
        stepWorld(world, [], DT);
        push = Math.max(push, v.contact.force);
      }
      return { damage: v.damage!, push, stopped: v.linearVelocity[0] < 0.3 };
    };
    const t = ram(tug());
    // She hit it (hard: tens of kN) and was stopped, with no damage.
    expect(t.push).toBeGreaterThan(20000);
    expect(t.stopped).toBe(true);
    expect(t.damage).toBe(0);
    expect(ram({ ...DEFAULT_DESIGN, hull: 2, ...DESIGN_HULLS[2].defaults, guard: 0 }).damage).toBeGreaterThan(0);
  });

  it('pushing another boat: her fender meets it before her bow plate would', () => {
    useDesign(tug());
    const plan = hullPlan(VESSEL_DEFS.design);
    const t = createVesselState('tug', 'design');
    const wb = createVesselState('wb', 'workboat');
    // The tug bow north at the origin; the workboat broadside across her bow, her side 0.15 m
    // ahead of the tug's bow plate: inside the push fender's face, clear of her plate.
    placeVessel(t, 0, 0, 0, 0);
    const wbHalf = hullPlan(VESSEL_DEFS.workboat).halfBeam(0);
    placeVessel(wb, 0, 0, plan.stem - 0.15 - wbHalf, 90);
    const forces = vesselContacts([t, wb], (s) => VESSEL_DEFS[s.defId]);
    const onTug = forces.get('tug') ?? [];
    expect(onTug.length).toBeGreaterThan(0);
    // Pushed back (aft, +z) at her fender's face.
    expect(onTug.reduce((a, f) => a + f.force.z, 0)).toBeGreaterThan(0);
    for (const f of onTug) expect(f.point.z).toBeLessThan(plan.stem);
  });
});

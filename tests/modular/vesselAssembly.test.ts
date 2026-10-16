/**
 * Modular boats M6a: every boat is built from her recipe (a hull plus modules). The vessel
 * definitions must be the ones the vessel configs gave before, field for field; the mass
 * properties to rounding (the workboat's are summed from her lightship, engine and
 * batteries).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { HULLS, LIBRARY, RECIPES } from '../../src/boats/library';
import { setVesselRecipe, vesselRuntime } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { validateRecipe, type Recipe } from '../../src/modular/recipe';
import { vesselDefFrom } from '../../src/modular/vesselAssembly';
import { placeVessel } from '../../src/vessel/vesselControl';
import { fromConfig, VESSEL_DEFS, VESSEL_IDS, type VesselConfig } from '../../src/vessel/vesselDef';

const DT = 1 / 60;
afterEach(() => setVesselRecipe('skiff', null));

const relClose = (got: number, want: number) => expect(Math.abs(got - want)).toBeLessThan(1e-9 * Math.max(1, Math.abs(want)));

describe('every boat from her recipe', () => {
  it('there is a valid recipe on a known hull for every vessel type', () => {
    for (const id of VESSEL_IDS) {
      const r = RECIPES[id];
      expect(r, id).toBeDefined();
      expect(HULLS.get(r.hull), id).toBeDefined();
      expect(validateRecipe(r, LIBRARY), id).toEqual([]);
    }
  });

  it('each vessel definition is the one her config gave before (mass properties to rounding)', () => {
    for (const id of VESSEL_IDS) {
      const old = fromConfig(id, (CONFIG.vessels as Record<string, VesselConfig>)[id]);
      const now = VESSEL_DEFS[id];
      const { mass, cg, inertia, designVolume, ...rest } = now;
      const { mass: m0, cg: cg0, inertia: i0, designVolume: v0, ...rest0 } = old;
      expect(rest, id).toEqual(rest0);
      relClose(mass, m0);
      relClose(designVolume, v0);
      cg.forEach((x, i) => relClose(x, cg0[i]));
      inertia.forEach((x, i) => relClose(x, i0[i]));
    }
  });

  it('the tows are hulls with no modules; the skiff has her outboard', () => {
    for (const id of ['derelict', 'logRaft', 'barge']) expect(RECIPES[id].modules, id).toEqual([]);
    expect(RECIPES.skiff.modules.map((m) => m.module)).toEqual(['propulsion.electric-outboard']);
  });

  it('a heavier battery bank makes a heavier workboat, her CG drawn toward it', () => {
    const r: Recipe = JSON.parse(JSON.stringify(RECIPES.workboat));
    const bank = r.modules.find((m) => m.socket === 'batteries')!;
    bank.config = { ...bank.config, massKg: 128 };
    const heavy = vesselDefFrom('workboat', r, LIBRARY);
    const base = VESSEL_DEFS.workboat;
    relClose(heavy.mass, base.mass + 2 * (128 - CONFIG.modules.batteryBank.massKg));
    const at = LIBRARY.hulls.get(r.hull)!.sockets.find((s) => s.id === 'batteries')!.transform.position;
    // Each CG coordinate moves toward the bank's.
    for (let i = 0; i < 3; i++) if (Math.abs(at[i] - base.cg[i]) > 1e-6) expect(Math.sign(heavy.cg[i] - base.cg[i])).toBe(Math.sign(at[i] - base.cg[i]));
  });
});

describe('the skiff\'s outboard is her module', () => {
  function skiffRun(recipe: Recipe | null) {
    setVesselRecipe('skiff', recipe);
    const { world } = createWorld(new IdFactory(), 'skiff');
    world.environment.waves = [];
    world.geography = 'openSea';
    const v = Object.values(world.vessels).find((x) => x.defId === 'skiff')!;
    placeVessel(v, 0, 0, 0, 0);
    const send = (control: string, value: number) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value } as Intent], DT);
    send('outboard.on', 1);
    send('outboard.gear', 1);
    send('throttle.demand', 1);
    for (let i = 0; i < 10 / DT; i++) stepWorld(world, [], DT);
    return { speed: Math.hypot(v.linearVelocity[0], v.linearVelocity[2]), battery: v.battery ?? 0, runtime: vesselRuntime(v)! };
  }

  it('with it she drives and draws her battery; without it, nothing', () => {
    const fitted = skiffRun(null);
    expect(fitted.runtime.sim.mounts.map((m) => m.def.id)).toEqual(['propulsion.electric-outboard']);
    expect(fitted.speed).toBeGreaterThan(1.5);
    expect(fitted.battery).toBeLessThan(1);
    const bare = skiffRun({ ...RECIPES.skiff, modules: [] });
    expect(bare.speed).toBeLessThan(0.05);
    expect(bare.battery).toBe(1);
  });
});

/**
 * Modular boats M7: the landing craft, the second boat built from modules: the hull study's
 * design lofted into stations, her hull definition, her recipe. The test of the
 * architecture: she's a hull, a recipe and (7b) one new module, and she floats, drives and
 * can be walked and worked like the workboat. (Her hydrostatics and sea trials are in
 * seaTrials.test.ts, which runs every vessel type.)
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HULLS, LIBRARY, RECIPES } from '../src/boats/library';
import { footprintsOf, gearOf } from '../src/boats/sims';
import { CONFIG } from '../src/config';
import { BowRamp } from '../src/controls/BowRamp';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { fits } from '../src/modular/socket';
import { validateRecipe } from '../src/modular/recipe';
import { hullPlan, STEP_HEIGHT, vesselWalkArea } from '../src/vessel/layout';
import { sunkenHouse } from '../src/vessel/view/hullMesh';
import { placeVessel } from '../src/vessel/vesselControl';
import { hasWheelhouse, VESSEL_DEFS } from '../src/vessel/vesselDef';

const DT = 1 / 60;
const def = VESSEL_DEFS.landingCraft;
const lc = CONFIG.vessels.landingCraft;
const hull = HULLS.get('hull.landing-craft-9m')!;

describe('the landing craft: her hull', () => {
  it('her stations run transom to bow, the deck +-length/2, and she has a wheelhouse (her cabin)', () => {
    const st = def.hull.stations;
    for (let i = 1; i < st.length; i++) expect(st[i].z).toBeLessThan(st[i - 1].z);
    expect(st[0].z).toBeCloseTo(def.hull.params.length / 2, 6);
    expect(st[st.length - 1].z).toBeCloseTo(-def.hull.params.length / 2, 6);
    // A square landing bow: still 2 m wide at the stem.
    expect(st[st.length - 1].halfBeamDeck).toBeGreaterThan(1);
    expect(hasWheelhouse(def)).toBe(true);
  });

  it('her cabin is a step down from the deck (for headroom), over her engine space; the workboat\'s isn\'t', () => {
    const wh = lc.layout.wheelhouse;
    const plan = hullPlan(def);
    for (const z of [wh.front, (wh.front + wh.aft) / 2, wh.aft]) {
      const step = plan.deckY(z) - wh.floorY;
      expect(step).toBeGreaterThan(0.1);
      expect(step).toBeLessThan(STEP_HEIGHT);
    }
    expect(wh.roofY - wh.floorY).toBeGreaterThan(2.1);
    // The engine space's floor is still inside the hull, above her bottom there.
    const pit = wh.floorY - lc.layout.engineHatch.pitDepth;
    const z = (lc.layout.engineHatch.z0 + lc.layout.engineHatch.z1) / 2;
    const st = def.hull.stations.reduce((a, b) => (Math.abs(b.z - z) < Math.abs(a.z - z) ? b : a));
    expect(pit).toBeGreaterThan(st.polygon[3][1]);
    // The deck is cut away over her cabin, not over the workboat's.
    expect(sunkenHouse(def.hull, def.layout)).not.toBeNull();
    expect(sunkenHouse(VESSEL_DEFS.workboat.hull, VESSEL_DEFS.workboat.layout)).toBeNull();
  });

  it('assembled from her recipe she weighs what she displaces at her waterline, her engine and batteries in', () => {
    expect(def.mass).toBeCloseTo(lc.mass, 6);
    expect(def.cg[2]).toBeCloseTo(lc.cg[2], 6);
  });
});

describe('the landing craft: her recipe', () => {
  it('is valid, and reuses the workboat\'s modules: one new hull, no new module yet', () => {
    expect(validateRecipe(RECIPES.landingCraft, LIBRARY)).toEqual([]);
    const used = new Set<string>();
    const walk = (ms: typeof RECIPES.landingCraft.modules) => ms.forEach((m) => (used.add(m.module), walk(m.modules ?? [])));
    walk(RECIPES.landingCraft.modules);
    const workboat = new Set<string>();
    const walkW = (ms: typeof RECIPES.workboat.modules) => ms.forEach((m) => (workboat.add(m.module), walkW(m.modules ?? [])));
    walkW(RECIPES.workboat.modules);
    expect([...used].filter((id) => !workboat.has(id))).toEqual([]);
  });

  it('the workboat\'s console doesn\'t fit her cabin (and says why); her compact one does', () => {
    const helm = hull.sockets.find((s) => s.id === 'helm')!;
    const console = LIBRARY.modules.get('console.standard')!;
    const standard = fits(console, helm, console.defaults);
    expect(standard.ok).toBe(false);
    expect(!standard.ok && standard.why).toMatch(/doesn't fit the space/);
    const hers = RECIPES.landingCraft.modules.find((m) => m.socket === 'helm')!;
    expect(fits(console, helm, { ...(console.defaults as Record<string, unknown>), ...(hers.config as Record<string, unknown>) }).ok).toBe(true);
  });

  it('her machinery: a 280 kW diesel, its rudder, her batteries; no crane, no tow point, no fire monitor', () => {
    const v = { defId: 'landingCraft' };
    expect(gearOf(v, 'diesel')!.engine.powerKw).toBe(280);
    // Her own engine sound (a turbo V8); the workboat keeps her straight six.
    expect(gearOf(v, 'diesel')!.voice).toBe('v8');
    expect(gearOf({ defId: 'workboat' }, 'diesel')!.voice).toBeUndefined();
    expect(CONFIG.engineVoices.v8.cylinders).toBe(8);
    expect(gearOf(v, 'rudder')).not.toBeNull();
    expect(gearOf(v, 'batteries')).not.toBeNull();
    for (const k of ['tenderCrane', 'towPoint', 'fireMonitor', 'trawl'] as const) expect(gearOf(v, k), k).toBeNull();
  });
});

describe('the landing craft: aboard', () => {
  const area = vesselWalkArea(def, def.layout, footprintsOf({ defId: 'landingCraft' }));
  const wh = lc.layout.wheelhouse;

  it('you can stand at her helm, on her foredeck and in her cockpit; not through the cabin walls', () => {
    const [hx, hy, hz] = lc.boardingSpot;
    expect(area.walkable(hx, hz, hy)).toBe(true);
    const deckAt = (z: number) => Math.max(...area.floorsAt(0, z).filter((y) => y < wh.floorY + 0.5));
    expect(area.walkable(0, -2.5, deckAt(-2.5))).toBe(true);
    expect(area.walkable(0, 4.2, deckAt(4.2))).toBe(true);
    // Down the step from the cockpit, through the door, to the helm: each pace a step at most.
    let y = deckAt(4.2);
    for (let z = 4.2; z >= hz; z -= 0.1) {
      const floors = area.floorsAt(0, z).filter((f) => Math.abs(f - y) <= STEP_HEIGHT);
      expect(floors.length, `z ${z.toFixed(1)}`).toBeGreaterThan(0);
      y = floors.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a));
    }
    expect(y).toBeCloseTo(wh.floorY, 6);
    // The cabin's side wall, from the side deck.
    expect(area.walkable(wh.halfWidth, (wh.front + wh.aft) / 2, deckAt(2))).toBe(false);
  });

  it('a game started in her has no skiff, and no fire or timber calls for gear she hasn\'t got', () => {
    const { world, vesselId } = createWorld(new IdFactory(), 'landingCraft', { tender: true, fires: true, logs: true, tows: true });
    expect(Object.values(world.vessels).map((v) => v.defId)).toEqual(['landingCraft']);
    const v = world.vessels[vesselId];
    placeVessel(v, 0, 0, 0, 0);
    world.environment.waves = [];
    world.geography = 'openSea';
    for (let i = 0; i < 30 / DT; i++) stepWorld(world, [], DT);
    expect(world.fire?.job ?? null).toBeNull();
    expect(world.salvage?.logs.length ?? 0).toBe(0);
  });

  it('she starts and drives on her own machinery, to about 20 kn', () => {
    const { world, vesselId } = createWorld(new IdFactory(), 'landingCraft');
    const v = world.vessels[vesselId];
    placeVessel(v, 0, 0, 0, 0);
    world.environment.waves = [];
    world.geography = 'openSea';
    const send = (control: string, value: number) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value } as Intent], DT);
    send('engineStartStop', 1);
    for (let i = 0; i < 4 / DT; i++) stepWorld(world, [], DT);
    expect(v.engine.phase).toBe('running');
    send('lever', 1);
    for (let i = 0; i < 60 / DT; i++) stepWorld(world, [], DT);
    expect(Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) / 0.5144).toBeGreaterThan(19);
  });
});

describe('the landing craft: her paint and her bow ramp', () => {
  it('she is painted in the study\'s aluminium grey; the workboat keeps her orange', () => {
    expect(def.livery?.topsides).toBe(0xb9bec2);
    expect(def.livery?.bottom).toBe(0x2f3438);
    expect(VESSEL_DEFS.workboat.livery).toBeUndefined();
  });

  it('two door buttons work it, on its own key; it starts raised and goes down and up', () => {
    const buttons = RECIPES.landingCraft.modules.filter((m) => m.bind?.door === 'ramp.bow.down');
    expect(buttons.map((m) => m.socket).sort()).toEqual(['rampBow', 'rampCabin']);
    expect(hull.features?.find((f) => f.id === 'ramp.bow')?.openKey).toBe('ramp.bow.down');
    const { world, vesselId } = createWorld(new IdFactory(), 'landingCraft');
    const v = world.vessels[vesselId];
    expect(v.controls.bowRamp ?? 0).toBe(0);
    const press = (value: number) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control: 'ramp.bow.down', value } as Intent], DT);
    press(1);
    expect(v.controls.bowRamp).toBe(1);
    press(0);
    expect(v.controls.bowRamp).toBe(0);
  });

  it('its rams reach from raised to lowered without coming apart, and swing it all the way', () => {
    const plan = hullPlan(def);
    const br = lc.layout.bowRamp;
    const ramp = new BowRamp(new THREE.Vector3(0, plan.deckY(plan.stem), plan.stem), plan.deckY(plan.stem + br.ram.aft), br, { plate: 0, grip: 0, fittings: 0 });
    const [shortest, longest] = ramp.ramSpan();
    expect(longest).toBeGreaterThan(shortest);
    // Each half (cylinder, rod) is shorter than the shortest span and together they reach the longest.
    const cyl = ramp.root.children[1] as THREE.Mesh;
    cyl.geometry.computeBoundingBox();
    const each = cyl.geometry.boundingBox!.max.z - cyl.geometry.boundingBox!.min.z;
    expect(each).toBeLessThan(shortest);
    expect(2 * each).toBeGreaterThan(longest);
    ramp.sync({ controls: { bowRamp: 1 } } as never);
    for (let i = 0; i < (br.travelSec + 1) / DT; i++) ramp.tick(DT);
    expect(ramp.lowered).toBe(1);
  });
});


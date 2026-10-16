/**
 * Modular boats M5b: the searchlight, the fire monitor (with its console gauge), the mast,
 * the four cleats, the fenders, the swim ladder, the life ring station and the boat-hook
 * rack are modules, and what you can't walk through on deck and roof comes from the
 * modules' footprints. These tests check the gear's facts and the footprints are where
 * v1.0 had them, and that taking a module out takes its job with it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { RECIPES } from '../../src/boats/library';
import { footprintsOf, gearOf, setVesselRecipe, vesselRuntime } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { jetOn } from '../../src/fire/fire';
import type { Recipe } from '../../src/modular/recipe';
import { swimLadderOf } from '../../src/player/body';
import { hullPlan, onGear, STEP_HEIGHT, vesselWalkArea } from '../../src/vessel/layout';
import { berthAxis } from '../../src/vessel/physics/mooring';
import { placeVessel } from '../../src/vessel/vesselControl';
import { BERTHS } from '../../src/world/archipelago';
import { asWorkboat, VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { startEngine } from '../helpers/engine';

const DT = 1 / 60;
const def = asWorkboat(VESSEL_DEFS.workboat);
const plan = hullPlan(def);
const boat = { defId: 'workboat' };
const berth = BERTHS.find((b) => b.id === 'calder-cargo')!;

/** The starter recipe without the modules on these sockets. */
const without = (...sockets: string[]): Recipe => ({ ...RECIPES.workboat, modules: RECIPES.workboat.modules.filter((m) => !sockets.includes(m.socket)) });

function setup() {
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  const send = (control: string, value = 1) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  return { world, v, send, run };
}

afterEach(() => setVesselRecipe('workboat', null));

/** v1.0's deck gear check (vessel/layout.ts onDeckGear, as it was). */
function v10OnDeckGear(x: number, z: number, pad: number): boolean {
  const tc = def.tenderCrane!;
  if (Math.abs(x - tc.stow[0]) < tc.cradle.halfWidth + pad && z > tc.cradle.z0 - pad && z < tc.cradle.z1 + pad) return true;
  if (Math.hypot(x - tc.column[0], z - tc.column[1]) < tc.columnRadius + pad) return true;
  const tw = def.towWinch!;
  const hw = tw.drumWidth / 2;
  if (x > -hw - 0.12 - pad && x < hw + 0.1 + tw.housing.width + pad && Math.abs(z - tw.z) < 0.25 + pad) return true;
  const af = def.fishing!.aFrame;
  const footZ = plan.transom - af.footFromTransom;
  const x0 = plan.halfBeam(footZ) - af.footInset;
  for (const fz of [footZ, footZ - af.braceForward]) if (Math.hypot(Math.abs(x) - x0, z - fz) < 0.12 + pad) return true;
  return false;
}

describe('footprints: what you walk round comes from the modules', () => {
  it('on deck, the crane and cradle, the winch and the A-frame\'s feet are exactly where v1.0 kept you out', () => {
    const gear = footprintsOf(boat);
    let checked = 0;
    for (let z = plan.stem; z <= plan.transom; z += 0.05) {
      for (let x = -2.5; x <= 2.5; x += 0.05) {
        for (const pad of [0.05, def.layout.bodyRadius]) {
          // (A point exactly on an edge could differ by a rounding; the grid steers clear of them.)
          expect(onGear(gear, x + 1e-4, z + 1e-4, pad, plan.deckY(z)), `(${x.toFixed(2)}, ${z.toFixed(2)}) pad ${pad}`).toBe(v10OnDeckGear(x + 1e-4, z + 1e-4, pad));
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(40000);
  });

  it('on the roof, the mast\'s foot is kept clear as it was; the mast doesn\'t block the deck or the floor below it', () => {
    const roofTop = def.layout.wheelhouse!.roofY + def.layout.roof!.thickness;
    const gear = footprintsOf(boat);
    for (let z = -1.5; z <= 1.5; z += 0.02) {
      for (let x = -0.6; x <= 0.6; x += 0.02) {
        const v10AtMast = Math.abs(x) < 0.25 && Math.abs(z - 0.4) < 0.25;
        expect(onGear(gear, x + 1e-4, z + 1e-4, 0, roofTop)).toBe(Math.abs(x + 1e-4) < 0.25 && Math.abs(z + 1e-4 - 0.4) < 0.25);
        if (v10AtMast) expect(onGear(gear, x, z, 0, def.layout.wheelhouse!.floorY)).toBe(false);
      }
    }
    // A floor a step below the mast's foot is still clear (the levels go by STEP_HEIGHT).
    expect(onGear(gear, 0, 0.4, 0, roofTop - STEP_HEIGHT - 0.01)).toBe(false);
  });

  it('the walk area follows her recipe: without the mast you can walk where it stood', () => {
    const roofTop = def.layout.wheelhouse!.roofY + def.layout.roof!.thickness;
    expect(vesselWalkArea(def, def.layout, footprintsOf(boat)).walkable(0, 0.4, roofTop)).toBe(false);
    setVesselRecipe('workboat', without('mast'));
    expect(vesselWalkArea(def, def.layout, footprintsOf(boat)).walkable(0, 0.4, roofTop)).toBe(true);
  });
});

describe('the gear\'s facts are where v1.0 had them', () => {
  it('the searchlight and the fire monitor: the vessel\'s own figures', () => {
    expect(gearOf(boat, 'searchlight')).toMatchObject(def.spotlight);
    expect(gearOf(boat, 'fireMonitor')).toEqual(def.fireMonitor);
  });

  it('the cleats: the bow and stern lines\' stations and height', () => {
    expect(gearOf(boat, 'bowCleat')).toEqual({ z: def.mooring.cleatFwdZ, lineY: def.mooring.lineY });
    expect(gearOf(boat, 'sternCleat')).toEqual({ z: def.mooring.cleatAftZ, lineY: def.mooring.lineY });
  });

  it('the swim ladder, the life ring and the boat hook', () => {
    const c = def.swimLadder!;
    const hb = plan.halfBeam(c.z);
    expect(gearOf(boat, 'swimLadder')).toEqual({ x: hb + 0.08, z: c.z, bottom: c.bottom, top: plan.deckY(c.z) + def.layout.bulwarkHeight, deckX: hb - 0.6, range: c.range, width: c.width });
    expect(gearOf(boat, 'lifeRing')).toEqual({ stow: def.rescueGear.ringStow, cleat: def.rescueGear.ringCleat });
    expect(gearOf(boat, 'boatHook')).toEqual({ stow: def.rescueGear.hookStow });
    expect(gearOf(boat, 'fenders')).toEqual({});
  });

  it('the navigation lights hang on the mast\'s masthead socket', () => {
    const { v } = setup();
    const lights = vesselRuntime(v)!.sim.mounts.find((m) => m.path === 'mast/masthead')!;
    expect(lights.def.id).toBe('electrical.consumer');
    expect(lights.socket.transform.position).toEqual(def.navLights.masthead);
  });
});

describe('take a module out and its job goes with it', { timeout: 30000 }, () => {
  it('without the cleats she can\'t moor: neither the menu\'s Dock nor a cleat makes a line fast', () => {
    const alongside = (recipe: Recipe | null, how: 'dock' | 'cleat') => {
      setVesselRecipe('workboat', recipe);
      const { v, send, run } = setup();
      // In Calder Haven's cargo berth's hot spot, slow and lined up.
      const a = berthAxis(berth, false);
      placeVessel(v, berth.x - berth.shoreX * 7 + a.x * -5, 0, berth.z - berth.shoreZ * 7 + a.z * -5, berth.headingDeg + 12);
      run(1);
      if (how === 'dock') send('dock');
      else send('cleat', 1);
      return v.mooring.phase;
    };
    const none = without('cleatFwdPort', 'cleatFwdStbd', 'cleatAftPort', 'cleatAftStbd');
    expect(alongside(null, 'dock')).toBe('docking');
    expect(alongside(null, 'cleat')).toBe('docking');
    expect(alongside(none, 'dock')).toBe('free');
    expect(alongside(none, 'cleat')).toBe('free');
  });

  it('without the swim ladder there is none to climb', () => {
    expect(swimLadderOf({ state: { defId: 'workboat' } as never })).not.toBeNull();
    setVesselRecipe('workboat', without('swimLadder'));
    expect(swimLadderOf({ state: { defId: 'workboat' } as never })).toBeNull();
  });

  it('without the life ring station there\'s no ring to take; without the rack, no hook', () => {
    const take = (recipe: Recipe | null) => {
      setVesselRecipe('workboat', recipe);
      const { world, v, send } = setup();
      placeVessel(v, 0, 0, -400, 0);
      send('rescueDebugNear');
      send('ringTake');
      send('hookTake');
      return { ring: world.rescue!.ring!.state, hook: world.rescue!.hook!.holder };
    };
    expect(take(null)).toEqual({ ring: 'held', hook: 'p' });
    expect(take(without('lifeRing', 'boatHook'))).toEqual({ ring: 'stowed', hook: null });
  });

  it('without the searchlight there is none, and switching it on draws nothing', () => {
    const { v, send } = setup();
    send('searchlight.on', 1);
    const lit = vesselRuntime(v)!.loadAmps();
    setVesselRecipe('workboat', without('searchlight'));
    expect(gearOf(boat, 'searchlight')).toBeNull();
    expect(lit - vesselRuntime(v)!.loadAmps()).toBeCloseTo(CONFIG.modules.searchlight.amps, 9);
    // Its old control name is clamped to the lamp's limits; with no lamp it does nothing.
    send('spotPan', 60);
    expect(v.controls.spotPan).not.toBe(60);
  });

  it('without the fire monitor no water comes out, pump on and engine running', () => {
    const jet = (recipe: Recipe | null) => {
      setVesselRecipe('workboat', recipe);
      const { world, v, send } = setup();
      startEngine(world, v);
      send('firePump.on', 1);
      return jetOn(v);
    };
    expect(jet(null)).toBe(true);
    expect(jet(without('fireMonitor'))).toBe(false);
  });

  it('without the fenders there are none to put out (no fenders duty)', () => {
    expect(gearOf(boat, 'fenders')).not.toBeNull();
    setVesselRecipe('workboat', without('fenders'));
    expect(gearOf(boat, 'fenders')).toBeNull();
  });
});

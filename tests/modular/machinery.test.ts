/**
 * Modular boats M4a: the engine, propeller, rudder, fuel tank, batteries, hydraulic and
 * bilge pumps and the 12 V devices are modules, simulated from the recipe; the energy
 * network sums what they declare. The boat must behave exactly as before (the golden runs
 * and the sea trials check that); these tests check the pieces, and that they really are
 * separate: take one out of the recipe and only its part goes.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { RECIPES } from '../../src/boats/library';
import { setVesselRecipe, vesselRuntime } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import type { Recipe } from '../../src/modular/recipe';
import { placeVessel } from '../../src/vessel/vesselControl';
import { BREAKERS, type BreakerName, type VesselState } from '../../src/vessel/vesselState';

const DT = 1 / 60;

function boat() {
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, 0, 0);
  const send = (control: string, value: number) => stepWorld(world, [{ playerId: 't', targetId: v.id, control, value } as Intent], DT);
  const run = (seconds: number) => {
    for (let i = 0; i < seconds / DT; i++) stepWorld(world, [], DT);
  };
  return { world, v, send, run };
}

/** The starter recipe without the module on `socket`. */
const without = (socket: string): Recipe => ({ ...RECIPES.workboat, modules: RECIPES.workboat.modules.filter((m) => m.socket !== socket) });

afterEach(() => setVesselRecipe('workboat', null));

describe('the machinery, as modules', () => {
  it('the recipe mounts the engine, rudder, tank, batteries, pumps and devices; engine before rudder', () => {
    const { v } = boat();
    const sim = vesselRuntime(v)!.sim;
    const ids = sim.mounts.map((m) => m.def.id);
    for (const id of ['propulsion.diesel-inboard', 'steering.rudder', 'electrical.battery-bank', 'hydraulics.pto-pump', 'pump.bilge', 'electrical.consumer']) expect(ids).toContain(id);
    // The rudder needs this tick's thrust: it pushes after the engine.
    const pushing = sim.mounts.filter((m) => m.def.sim?.physics).map((m) => m.path);
    expect(pushing).toEqual(['engine', 'rudder']);
    // The navigation lights, floods, rail lights, cabin lamp, horn and wiper motor (the
    // searchlight is its own module since M5b; the nav lights hang on the mast).
    expect(sim.mounts.filter((m) => m.def.id === 'electrical.consumer')).toHaveLength(7);
    expect(sim.mounts.find((m) => m.path === 'mast/masthead')?.def.id).toBe('electrical.consumer');
  });

  it('the battery module and the vessel\'s battery config agree (isPowered reads the latter until M6)', () => {
    const { v } = boat();
    const store = vesselRuntime(v)!.store!;
    const el = CONFIG.vessels.workboat.electrics;
    expect([store.ah, store.restVolts, store.internalOhm, store.chargeVolts, store.cutoffSoc]).toEqual([el.batteryAh, el.restVolts, el.internalOhm, el.chargeVolts, el.cutoffSoc]);
  });
});

describe('the energy network', () => {
  /** v1.0's load list, its figures as they were (A; the windlass aside: it runs only while the anchor moves, and it's stowed here; tests/modular/deckGear.test.ts checks its draw). */
  function v10Loads(s: VesselState): number {
    const c = s.controls;
    const b = s.electrics!.breakers;
    const on = (k: BreakerName) => b[k] > 0;
    let a = 0.4;
    if (on('instruments')) a += 2.5 + (c.wipers > 0 ? 4 : 0);
    if (on('chart')) a += 2.0;
    if (on('radio')) a += 1.5 + (c.fmOn > 0 ? 1.0 : 0);
    if (on('navLights') && c.navLights > 0) a += 2.0;
    if (on('deckLights')) a += (c.deckFore > 0 ? 8 : 0) + (c.deckAft > 0 ? 8 : 0) + (c.railLights > 0 ? 1 : 0) + (c.cabinLight > 0 ? 1 : 0) + (c.chartLamp > 0 ? 0.5 : 0) + (c.spotlight > 0 ? 12 : 0);
    if (on('bilge') && (s.bilge ?? 0) > 0.01) a += 3;
    if (s.engine.phase === 'running' && on('hydraulics')) a += 4;
    if (c.horn > 0) a += 10;
    if (s.engine.phase === 'cranking') a += 180;
    if (s.engine.key > 0 && c.heat > 0) a += 35;
    return a;
  }

  it('every load is declared by a module, and they add up to v1.0\'s list, switch by switch', () => {
    const { v } = boat();
    const net = vesselRuntime(v)!;
    // 200 boats' worth of switches, breakers and engine states (a fixed pseudo-random walk).
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const bit = () => (rnd() < 0.5 ? 0 : 1);
    for (let i = 0; i < 200; i++) {
      for (const k of BREAKERS) v.electrics!.breakers[k] = bit();
      Object.assign(v.controls, { wipers: bit(), fmOn: bit(), navLights: bit(), deckFore: bit(), deckAft: bit(), railLights: bit(), cabinLight: Math.floor(rnd() * 3), chartLamp: bit(), spotlight: bit(), horn: bit(), heat: bit() });
      v.bilge = rnd() < 0.5 ? 0 : 0.3;
      v.engine.key = bit();
      v.engine.phase = (['off', 'cranking', 'running'] as const)[Math.floor(rnd() * 3)];
      expect(net.loadAmps(), `case ${i}`).toBeCloseTo(v10Loads(v), 9);
    }
  });

  it('the alternator is the engine\'s: full output from 600 rpm', () => {
    const { v } = boat();
    const net = vesselRuntime(v)!;
    v.engine.phase = 'running';
    v.engine.rpm = 300;
    expect(net.sourceAmps()).toBeCloseTo(30, 9);
    v.engine.rpm = 1500;
    expect(net.sourceAmps()).toBeCloseTo(60, 9);
    v.engine.phase = 'off';
    expect(net.sourceAmps()).toBe(0);
  });
});

describe('separate parts: take one out of the recipe and only its part goes', () => {
  it('without the searchlight module, switching the searchlight on draws nothing', () => {
    const { v } = boat();
    v.controls.spotlight = 0;
    const off = vesselRuntime(v)!.loadAmps();
    v.controls.spotlight = 1;
    expect(vesselRuntime(v)!.loadAmps()).toBeCloseTo(off + 12, 9);
    setVesselRecipe('workboat', without('searchlight'));
    expect(vesselRuntime(v)!.loadAmps()).toBeCloseTo(off, 9);
  });

  it('without the rudder she still drives ahead, but the wheel does nothing', () => {
    const turn = (recipe: Recipe | null) => {
      setVesselRecipe('workboat', recipe);
      const { v, send, run } = boat();
      send('engineStartStop', 1);
      run(3);
      send('lever', 0.8);
      send('helm', 1);
      run(30);
      return { speed: Math.hypot(v.linearVelocity[0], v.linearVelocity[2]), yawRate: Math.abs(v.angularVelocity[1]) };
    };
    const withRudder = turn(null);
    const bare = turn(without('rudder'));
    expect(bare.speed).toBeGreaterThan(3); // under way...
    expect(withRudder.yawRate).toBeGreaterThan(0.05); // turning hard with a rudder...
    expect(bare.yawRate).toBeLessThan(withRudder.yawRate / 5); // ...barely without one (prop walk only)
  });

  it('without the engine (and the hydraulic pump on its power take-off, and the deck gear it drives), the lever does nothing', () => {
    const r = without('engine');
    const hydraulic = ['hydraulicPump', 'tenderCrane', 'towWinch', 'trawl', 'fireMonitor']; // (the fire pump is on the take-off too)
    setVesselRecipe('workboat', { ...r, modules: r.modules.filter((m) => !hydraulic.includes(m.socket)) });
    const { v, send, run } = boat();
    send('lever', 1);
    run(10);
    expect(v.thrust).toBe(0);
    expect(Math.hypot(v.linearVelocity[0], v.linearVelocity[2])).toBeLessThan(0.05);
  });

  it('a recipe with the engine but no fuel tank is refused, in words', () => {
    expect(() => setVesselRecipe('workboat', without('fuelTank'))).toThrow(/engine: propulsion.diesel-inboard needs diesel fuel, and nothing on this boat gives it/);
  });
});

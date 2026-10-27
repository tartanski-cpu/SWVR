/**
 * The solar catamaran's electric drives (owner, 27 Oct 2026: "it looks like we need to
 * implement the electric drives"; vessel/physics/electricMotor.ts through modules/pods
 * `electric`): her motors on her battery, no fuel, smoke or oil; the screens' battery and kW;
 * the fuel berth's charger standing in for the quayside ones.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { gearOf, useDesign } from '../../src/boats/sims';
import { RECIPES } from '../../src/boats/library';
import { CONFIG } from '../../src/config';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';
import { SOLAR_CAT } from '../../src/shipyard/parts/catalog';
import { motorStep, type MotorSpec } from '../../src/vessel/physics/electricMotor';
import { engineAlarms } from '../../src/vessel/physics/engineThermal';
import { placeVessel, stepRefuelling } from '../../src/vessel/vesselControl';
import { stepShorePower } from '../../src/vessel/shorePower';
import { createVesselState, type EngineState } from '../../src/vessel/vesselState';
import { PORTS } from '../../src/world/archipelago';

afterAll(() => useDesign(DEFAULT_DESIGN));

const cat: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[SOLAR_CAT].defaults, hull: SOLAR_CAT };
const DT = 1 / 60;
const knots = (v: { linearVelocity: number[] }) => Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) / 0.5144;

/** Her out on calm open water, the motors switched on. */
function afloat() {
  useDesign(cat);
  const { world, vesselId } = createWorld(new IdFactory(), 'design');
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, 0, 0);
  world.environment.waves = [];
  world.geography = 'openSea';
  const send = (control: string, value: number) => stepWorld(world, [{ playerId: 't', targetId: v.id, control, value } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  send('quickStart', 1);
  run(1);
  return { world, v, send, run };
}

describe('an electric motor (physics/electricMotor.ts)', () => {
  const def = { engine: { ...CONFIG.vessels.workboat.engine, powerKw: 25, ratedRpm: 1800, gearRatio: 3, neutralBand: 0.08 }, propeller: { ...CONFIG.vessels.workboat.propeller, diameter: 0.7, inertia: 0.4 } };
  const m: MotorSpec = { usableKWh: 90, efficiency: 0.93, inertia: 0.05, responseS: 0.4 };
  const fresh = (): EngineState => ({ phase: 'off', crank: 0, rpm: 0, rack: 0, gear: 0, shift: 0, fuelL: 0, fuelFlowLph: 0, coolantC: 15, oilC: 15, coolingFault: false, key: 1, glow: 0 });
  const used = { kWh: 0 };
  const spin = (e: EngineState, lever: number, s: number, charge = 1, speed = 0) => {
    let T = 0;
    let kWh = 0;
    for (let i = 0; i < s / DT; i++) {
      T = motorStep(e, def, m, { lever, on: true, charge }, speed, 1, DT, used);
      kWh += used.kWh;
    }
    return { T, kWh };
  };

  it('stands still in neutral, turns from rest either way with no clutch, and holds the speed asked for', () => {
    const e = fresh();
    expect(spin(e, 0, 1).T).toBe(0);
    expect(e.phase).toBe('running');
    expect(e.rpm).toBe(0);
    // Half lever: about half its rated speed (lightly loaded at rest, it isn't torque-bound).
    spin(e, 0.54, 3);
    expect(e.gear).toBe(1);
    expect(e.rpm).toBeGreaterThan(850);
    expect(e.rpm).toBeLessThan(950);
    // Straight to astern: it brakes the propeller and runs it the other way within a couple of seconds.
    const r = spin(e, -0.54, 2);
    expect(e.gear).toBe(-1);
    expect(e.rpm).toBeGreaterThan(800);
    expect(r.T).toBeLessThan(0);
  });

  it('gives no more than its full torque, draws its power over its efficiency and gives some back braking', () => {
    const e = fresh();
    // Flat out against a standing propeller's load: torque-bound, at most its rated power.
    const r = spin(e, 1, 4);
    expect(e.rack).toBeCloseTo(1, 2);
    expect(e.powerKw!).toBeGreaterThan(0);
    expect(e.powerKw!).toBeLessThanOrEqual(25 / m.efficiency + 0.01);
    expect(r.kWh).toBeGreaterThan(0);
    // Lever back to neutral: the propeller's own load slows it, the motor easing off; at rest within two seconds.
    spin(e, 0, 2);
    expect(e.rpm).toBe(0);
    // Held slow with her going 10 kn: the water drives her propeller round faster than asked,
    // so the motor brakes it, giving that energy back to the battery.
    const slow = spin(e, 0.3, 4, 1, 5);
    expect(e.gear).toBe(1);
    expect(e.powerKw!).toBeLessThan(0);
    expect(slow.kWh).toBeLessThan(0);
  });

  it('stops with a flat battery or switched off', () => {
    const e = fresh();
    spin(e, 1, 2);
    expect(spin(e, 1, 5, 0).T).toBe(0);
    expect(e.phase).toBe('off');
    expect(e.rpm).toBe(0);
    expect(e.powerKw).toBe(0);
  });
});

describe('the solar catamaran on her electric drives', () => {
  it('has her motors in her pods on her battery: no diesel, no dipstick or oil can', () => {
    useDesign(cat);
    const pods = RECIPES.design.modules.find((x) => x.module === 'propulsion.pods')!;
    const electric = (pods.config as { electric?: MotorSpec }).electric!;
    expect(electric.usableKWh).toBeCloseTo(100 * CONFIG.shipyard.solarCat.usableShare, 5);
    expect(RECIPES.design.modules.some((x) => x.module === 'tool.dipstick' || x.module === 'tool.oil-can')).toBe(false);
    const v = createVesselState('v', 'design');
    expect(gearOf(v, 'diesel')?.electric).toBeTruthy();
    expect(gearOf(v, 'diesel')?.voice).toBe('electric');
    expect(v.battery).toBe(1);
  });

  it('makes about 10 kn flat out on about 50 kW from her battery, burns no fuel, and stops when the key goes off', () => {
    const { v, send, run } = afloat();
    expect(v.engine.phase).toBe('running');
    const fuel = v.engine.fuelL;
    send('lever', 1);
    run(90);
    expect(knots(v)).toBeGreaterThan(9.3);
    expect(knots(v)).toBeLessThan(10.7);
    // Both motors near their rated speed and full torque (her pods' reduction matched for them).
    expect(v.engine.rpm).toBeGreaterThan(CONFIG.shipyard.matchRpm * 1800);
    expect(v.engine.powerKw!).toBeGreaterThan(45);
    expect(v.engine.powerKw!).toBeLessThan(55);
    expect(v.engine.fuelL).toBe(fuel);
    expect(v.engine.fuelFlowLph).toBe(0);
    // About 90 s at that power: a little over 1 kWh of her 90 usable.
    expect(v.battery!).toBeLessThan(0.99);
    expect(v.battery!).toBeGreaterThan(0.97);
    send('key', 0);
    run(1);
    expect(v.engine.phase).toBe('off');
    expect(v.engine.powerKw).toBe(0);
    // (Her propellers drag as she slows: a little thrust astern.)
    expect(v.thrust).toBeLessThanOrEqual(0);
  });

  it('cruises easy on a few kW and backs off quickly astern', () => {
    const { v, send, run } = afloat();
    send('lever', 0.5);
    run(90);
    expect(knots(v)).toBeGreaterThan(4);
    expect(v.engine.powerKw!).toBeLessThan(10);
    send('lever', -1);
    run(3);
    expect(v.engine.gear).toBe(-1);
    expect(v.thrust).toBeLessThan(0);
  });

  it('warns LOW BATT under the low mark, and the menu’s Refuel at a fuel berth puts her on its fast charger', () => {
    useDesign(cat);
    const v = createVesselState('v', 'design');
    const diesel = gearOf(v, 'diesel')!;
    v.battery = diesel.engine.fuel.lowFraction / 2;
    expect(engineAlarms(v, diesel).lowFuel).toBe(true);
    const port = PORTS.find((p) => p.fuel)!;
    placeVessel(v, port.fuel!.x, 0, port.fuel!.z, 0);
    v.refuelling = true;
    const tick = () => {
      stepRefuelling(v, DT, true);
      stepShorePower(v, CONFIG.environment.timeScale * DT);
    };
    // A minute on the fast charger (150 kW on the game's clock, x12): 28.5 kWh of her 90.
    const was = v.battery!;
    for (let i = 0; i < 60 / DT; i++) tick();
    expect(v.shore?.ratedKw).toBe(CONFIG.charger.fastKw);
    expect(v.battery!).toBeCloseTo(was + (150 * CONFIG.charger.chargeEff * 60 * CONFIG.environment.timeScale) / 90, 2);
    // Slowing above 90 %, then full: it stops, and she's unplugged.
    for (let i = 0; i < 900 / DT && v.refuelling; i++) tick();
    expect(v.battery).toBe(1);
    expect(v.refuelling).toBe(false);
    expect(v.shore).toBeUndefined();
  });
});

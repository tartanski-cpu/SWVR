import { describe, expect, it } from 'vitest';
import type { Intent } from '../src/core/intents';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { engineAlarms } from '../src/vessel/physics/engineThermal';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';

const DT = 1 / 60;

function boat() {
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, 0, 0);
  const def = VESSEL_DEFS[v.defId];
  const send = (control: string, value: number) => {
    const intent: Intent = { playerId: 't', targetId: v.id, control, value };
    stepWorld(world, [intent], DT);
  };
  const run = (seconds: number) => {
    for (let i = 0; i < seconds / DT; i++) stepWorld(world, [], DT);
  };
  const start = () => {
    send('lever', 0);
    send('engineStartStop', 1);
    run(3);
  };
  return { world, v, def, send, run, start };
}

describe('fuel', () => {
  it('burns about 1-3 L/h at idle and 40-60 L/h flat out', () => {
    const b = boat();
    b.start();
    b.run(5);
    expect(b.v.engine.fuelFlowLph).toBeGreaterThan(1);
    expect(b.v.engine.fuelFlowLph).toBeLessThan(3);
    b.send('lever', 1);
    b.run(60);
    expect(b.v.engine.fuelFlowLph).toBeGreaterThan(40);
    expect(b.v.engine.fuelFlowLph).toBeLessThan(60);
  });

  it('the tank drains by the integrated flow', () => {
    const b = boat();
    b.start();
    b.send('lever', 1);
    b.run(30);
    const f0 = b.v.engine.fuelL;
    const flow = b.v.engine.fuelFlowLph;
    b.run(60);
    expect(f0 - b.v.engine.fuelL).toBeCloseTo((flow * 60) / 3600, 1);
  });

  it('runs dry and stops, and will not start again until refuelled', () => {
    const b = boat();
    b.start();
    b.send('debugFuel', 0.01);
    b.send('lever', 1);
    b.run(10);
    expect(b.v.engine.phase).toBe('off');
    expect(engineAlarms(b.v, b.def).lowFuel).toBe(true);
    b.send('lever', 0);
    b.run(2);
    b.send('engineStartStop', 1);
    b.run(4);
    expect(b.v.engine.phase).not.toBe('running');
    b.send('engineStartStop', 1); // stop cranking
    b.send('debugFuel', 100);
    b.start();
    expect(b.v.engine.phase).toBe('running');
  });
});

describe('engine temperature', () => {
  it('starts cold, warms up under way within a few minutes, and the thermostat holds it', () => {
    const b = boat();
    const e = b.v.engine;
    expect(e.coolantC).toBeLessThan(20);
    b.start();
    b.send('lever', 0.6);
    b.run(240);
    expect(e.coolantC).toBeGreaterThan(75);
    b.send('lever', 1);
    b.run(600);
    const th = b.def.engine.thermal;
    expect(e.coolantC).toBeGreaterThan(th.thermostatOpenC - 2);
    expect(e.coolantC).toBeLessThan(th.alarmC);
    expect(e.oilC).toBeGreaterThan(e.coolantC); // oil runs hotter under load
  });

  it('a raw-water pump failure overheats it under load: alarm, derate, but idling saves it', () => {
    const b = boat();
    const e = b.v.engine;
    e.coolantC = 85;
    e.oilC = 85;
    b.start();
    b.send('debugCoolingFault', 1);
    b.send('lever', 1);
    let alarmAt = -1;
    for (let t = 0; t < 300 && alarmAt < 0; t += 1) {
      b.run(1);
      if (engineAlarms(b.v, b.def).highTemp) alarmAt = t;
    }
    expect(alarmAt).toBeGreaterThan(0);
    // Keep going flat out: the governor derates, temperature climbs towards shutdown.
    b.run(20);
    expect(e.rack).toBeLessThanOrEqual(1);
    const hot = e.coolantC;
    expect(hot).toBeGreaterThan(b.def.engine.thermal.derateStartC - 5);
    // Back to idle in neutral: it cools.
    b.send('lever', 0);
    b.run(240);
    expect(e.coolantC).toBeLessThan(hot);
  });

  it('protection stops the engine if it overheats far enough', () => {
    const b = boat();
    b.start();
    b.v.engine.coolantC = b.def.engine.thermal.shutdownC + 1;
    b.run(0.5);
    expect(b.v.engine.phase).toBe('off');
  });
});

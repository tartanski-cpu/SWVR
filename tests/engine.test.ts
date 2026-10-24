import { gearOf } from '../src/boats/sims';
import { describe, expect, it } from 'vitest';
import type { Intent } from '../src/core/intents';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { engineAlarms } from '../src/vessel/physics/engineThermal';
import { placeVessel } from '../src/vessel/vesselControl';
import { CONFIG } from '../src/config';

const DT = 1 / 60;

function boat() {
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, 0, 0);
  const def = gearOf(v, 'diesel')!;
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
  it('burns about 1-3 L/h at idle and 70-110 L/h flat out (400 kW)', () => {
    const b = boat();
    b.start();
    b.run(5);
    expect(b.v.engine.fuelFlowLph).toBeGreaterThan(1);
    expect(b.v.engine.fuelFlowLph).toBeLessThan(3);
    b.send('lever', 1);
    b.run(60);
    expect(b.v.engine.fuelFlowLph).toBeGreaterThan(70);
    expect(b.v.engine.fuelFlowLph).toBeLessThan(110);
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

// (A long simulation: about 20 s here, and a GitHub runner can take twice that or more, so it's given room.)
describe('engine temperature', { timeout: 120000 }, () => {
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

  it('flat out and free-running she keeps cool; held on a tow at full throttle she overheats and derates; easing off saves her (owner)', () => {
    const b = boat();
    const e = b.v.engine;
    const th = b.def.engine.thermal;
    b.world.geography = 'openSea';
    b.start();
    b.send('lever', 1);
    b.run(600);
    // Free-running at her top speed: near rated revs, the pump at full flow, the fuel eased.
    expect(e.coolantC).toBeLessThan(th.alarmC);
    expect(e.coolantC).toBeGreaterThan(th.thermostatOpenC - 2);
    // Made fast and pulling (a towline, a tow she can't move): the revs held down, the rack full.
    const pos = [...b.v.position];
    for (let i = 0; i < 480 / DT; i++) {
      b.v.position[0] = pos[0];
      b.v.position[2] = pos[2];
      b.v.linearVelocity[0] = 0;
      b.v.linearVelocity[2] = 0;
      stepWorld(b.world, [], DT);
    }
    expect(e.rpm).toBeLessThan(b.def.engine.ratedRpm * 0.85);
    expect(engineAlarms(b.v, b.def).highTemp).toBe(true);
    expect(e.coolantC).toBeGreaterThan(th.alarmC);
    expect(e.coolantC).toBeLessThan(th.shutdownC); // the governor's derate would hold it short of the shutdown
    expect(e.phase).toBe('running');
    // Half throttle on the tow: it comes back under the alarm.
    b.send('lever', 0.5);
    for (let i = 0; i < 300 / DT; i++) {
      b.v.linearVelocity[0] = 0;
      b.v.linearVelocity[2] = 0;
      stepWorld(b.world, [], DT);
    }
    expect(engineAlarms(b.v, b.def).highTemp).toBe(false);
  });

  it('protection stops the engine if it overheats far enough', () => {
    const b = boat();
    b.start();
    b.v.engine.coolantC = b.def.engine.thermal.shutdownC + 1;
    b.run(0.5);
    expect(b.v.engine.phase).toBe('off');
  });
});

describe('steering', () => {
  it('coasting in neutral she still answers the helm, better than with the bare rudder', () => {
    const turnRate = (coastSteer: number) => {
      const cfg = CONFIG.vessels.workboat.rudder;
      const was = cfg.coastSteer;
      (cfg as { coastSteer: number }).coastSteer = coastSteer;
      const b = boat();
      b.start();
      b.send('lever', 0.7);
      b.run(30); // up to speed
      b.send('lever', 0); // neutral: coasting
      b.send('helm', 1);
      // Heading change over 6 s, unwrapped (sampled every 0.1 s).
      let last = heading(b.v.orientation);
      let turned = 0;
      for (let i = 0; i < 60; i++) {
        b.run(0.1);
        const h = heading(b.v.orientation);
        turned += ((h - last + 540) % 360) - 180;
        last = h;
      }
      (cfg as { coastSteer: number }).coastSteer = was;
      return Math.abs(turned);
    };
    const bare = turnRate(1);
    const now = turnRate(CONFIG.vessels.workboat.rudder.coastSteer);
    expect(now).toBeGreaterThan(bare * 1.2);
  });
});

/** Heading (deg) from an orientation quaternion. */
function heading(q: number[]): number {
  const [x, y, z, w] = q;
  return (Math.atan2(-2 * (x * z + w * y), -(1 - 2 * (x * x + y * y))) * 180) / Math.PI;
}

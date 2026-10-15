import { describe, expect, it } from 'vitest';
import { CONFIG, type WeatherPresetName } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { forecastText } from '../src/environment/forecast';
import { loadAmps } from '../src/vessel/electrics';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';

const DT = 1 / 60;
const EL = VESSEL_DEFS.workboat.electrics!;

/** A warm boat, dynamic weather fixed at `preset` (instant), flat water. */
function setup(preset: WeatherPresetName = 'Clear') {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), undefined, { weather: true });
  world.geography = 'openSea';
  const env = world.environment;
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, -400, 0);
  const intent = (targetId: string, control: string, value: number, args?: number[]) => stepWorld(world, [{ playerId: localPlayerId, targetId, control, value, args } as Intent], DT);
  const send = (control: string, value: number) => intent(v.id, control, value);
  const weather = (p: WeatherPresetName) => intent('env', 'weatherForce', Object.keys(CONFIG.weather.presets).indexOf(p), [1]);
  intent('env', 'weatherFixed', 1);
  weather(preset);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) {
      stepWorld(world, [], DT);
      env.waves = [];
    }
  };
  const duty = (kind: string) => world.duties?.items.find((d) => d.kind === kind && d.doneAt === undefined);
  return { world, env, v, send, weather, run, duty };
}

describe('weather and the crew', () => {
  it('the shipping forecast is heard only with the radio on, and describes the next change', () => {
    const { world, env, v, send, run } = setup('Clear');
    const w = env.weather!;
    w.fixed = false; // the director's plan, with its time
    w.next = { preset: 'Rain', at: world.time + 600 };
    send('brk_radio', 0);
    w.forecastAt = world.time;
    run(0.1);
    expect(world.forecast).toBeUndefined(); // missed: nobody listening
    send('brk_radio', 1);
    w.forecastAt = world.time;
    run(0.1);
    expect(world.forecast?.text).toMatch(/Becoming rain in about 10 minutes/);
    expect(world.forecast?.next).toBe('Rain');
    expect(world.forecast?.seq).toBe(1);
    expect(v).toBeTruthy();
    // The next one comes on schedule.
    run(CONFIG.weather.forecast.every + 1);
    expect(world.forecast?.seq).toBe(2);
  });

  it('a forecast follows soon after the weather turns; squalls bring a gale warning', () => {
    const { world, weather, run } = setup('Clear');
    run(130); // past the first one
    const seq = world.forecast?.seq ?? 0;
    weather('Squall');
    run(CONFIG.weather.forecast.afterChange + 1);
    expect(world.forecast!.seq).toBe(seq + 1);
    expect(world.forecast!.text).toMatch(/^Gale warning\./);
    expect(forecastText(world.environment.weather!, world.time)).toMatch(/Visibility very poor/);
  });

  it('lightning only in a squall', () => {
    const { env, weather, run } = setup('Rain');
    run(60);
    expect(env.weather!.lightning.seq).toBe(0);
    weather('Squall');
    run(90);
    expect(env.weather!.lightning.seq).toBeGreaterThanOrEqual(2);
    const L = env.weather!.lightning;
    expect(L.dist).toBeGreaterThanOrEqual(CONFIG.weather.lightning.dist[0]);
  });

  it('an open hatch in the rain fills the bilge; the pump (float switch) empties it', () => {
    const { v, send, run } = setup('Rain');
    send('brk_bilge', 0);
    expect(v.controls.hatch).toBe(1); // starts open
    expect(loadAmps(v, EL)).toBeGreaterThan(0);
    const dry = loadAmps(v, EL);
    run(60);
    expect(v.bilge!).toBeGreaterThan(0.05);
    send('hatch', 0);
    const level = v.bilge!;
    run(30);
    expect(v.bilge!).toBeCloseTo(level, 5); // shut: no more water in
    send('brk_bilge', 1);
    run(0.1);
    expect(loadAmps(v, EL)).toBeCloseTo(dry + EL.loads.bilge, 5); // the pump runs...
    run(60);
    expect(v.bilge!).toBeLessThan(0.011); // down to the float switch
    expect(loadAmps(v, EL)).toBeCloseTo(dry, 5); // ...and stops
  });

  it('bilge alarm: a duty to pump her dry', () => {
    const { v, send, run, duty } = setup('Clear');
    send('brk_bilge', 0);
    send('debugBilge', 0.6);
    run(0.1);
    const d = duty('bilge')!;
    expect(d).toBeTruthy();
    expect(d.steps[0].done).toBe(false);
    send('brk_bilge', 1);
    run(60);
    expect(v.bilge!).toBeLessThan(0.02);
    expect(d.doneAt).toBeDefined();
  });

  it('rain forecast: a duty to secure the boat - hatch shut, cargo lashed', () => {
    const { world, env, send, run, duty } = setup('Clear');
    env.weather!.next = { preset: 'Rain', at: world.time + 300 };
    env.weather!.forecastAt = world.time;
    run(0.2);
    const d = duty('secure')!;
    expect(d).toBeTruthy();
    expect(d.title).toMatch(/Rain coming/);
    expect(d.steps[0].done).toBe(false);
    send('hatch', 0);
    run(0.1);
    expect(d.steps[0].done).toBe(true);
    expect(d.doneAt).toBeDefined(); // no cargo aboard: lashed by default
  });

  it('fog under way: nav lights and a prolonged blast every two minutes', () => {
    const { v, send, weather, run, duty } = setup('Clear');
    send('quickStart', 1);
    run(10);
    expect(v.engine.phase).toBe('running');
    weather('Fog');
    run(0.1);
    const d = duty('fogSignal')!;
    expect(d).toBeTruthy();
    send('navLights', 1);
    send('horn', 1);
    run(2);
    send('horn', 0); // too short
    run(0.1);
    expect(d.steps[0].done).toBe(true);
    expect(d.steps[1].done).toBe(false);
    send('horn', 1);
    run(CONFIG.duties.blastMin + 0.2);
    send('horn', 0);
    run(0.1);
    expect(d.steps[1].done).toBe(true);
    expect(d.doneAt).toBeUndefined(); // stays up while it's foggy
    run(CONFIG.duties.blastEvery);
    expect(d.steps[1].done).toBe(false); // the next blast is due
    weather('Clear');
    run(0.1);
    expect(d.doneAt).toBeDefined(); // cleared, signal was kept: done
  });

  it('wipers draw current on the Instruments breaker', () => {
    const { v, send } = setup('Rain');
    const before = loadAmps(v, EL);
    send('wipers', 1);
    expect(loadAmps(v, EL)).toBeCloseTo(before + EL.loads.wipers, 5);
    send('brk_instruments', 0);
    expect(loadAmps(v, EL)).toBeCloseTo(before - EL.loads.instruments, 5);
  });
});

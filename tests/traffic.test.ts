import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { LOG_TYPES, POINTS, pointOf, seaWord } from '../src/log/log';
import { bearingTo, SHIP_NAMES, spawnShip } from '../src/traffic/traffic';
import { placeVessel } from '../src/vessel/vesselControl';
import { groundHeight } from '../src/world/terrain';

const DT = 1 / 60;

function setup(x = 0, z = -2600) {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), undefined, { weather: true });
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  placeVessel(v, x, 0, z, 0);
  const env = (control: string, value: number, args?: number[]) => stepWorld(world, [{ playerId: localPlayerId, targetId: 'env', control, value, args } as Intent], DT);
  const send = (control: string, value: number) => stepWorld(world, [{ playerId: localPlayerId, targetId: v.id, control, value } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) {
      stepWorld(world, [], DT);
      world.environment.waves = [];
    }
  };
  env('weatherFixed', 1);
  const write = (type: (typeof LOG_TYPES)[number], picks: Record<string, string>) => {
    env('logBegin', LOG_TYPES.indexOf(type), [LOG_TYPES.indexOf(type)]);
    for (const [k, val] of Object.entries(picks)) {
      const table: Record<string, string[]> = { ship: Object.values(SHIP_NAMES), dir: [...POINTS], hazard: ['Debris', 'Rocks', 'Buoy'], sea: ['Calm', 'Moderate', 'Rough'], vis: ['Good', 'Poor'], fuel: ['Full', '¾', '½', '¼'] };
      const opts = table[k];
      stepWorld(world, [{ playerId: localPlayerId, targetId: 'env', control: 'logPick', value: 1, ref: k, args: [opts.indexOf(val)] } as Intent], DT);
    }
    env('logSign', 1);
    const vy = world.log!.voyages.at(-1)!;
    return vy.entries.at(-1)!;
  };
  return { world, v, env, send, run, write };
}

describe('passing ships and hazards', { timeout: 30000 }, () => {
  it('out at sea a ship comes by on a clear course, is sighted and logged; type and direction are checked', () => {
    const { world, v, run, write } = setup();
    run(CONFIG.traffic.firstShip + 1);
    const first = world.traffic!.ships[0];
    expect(first).toBeTruthy();
    const x0 = first.x;
    run(10);
    expect(Math.abs(first.x - x0) + 0).toBeGreaterThan(0); // under way
    // Run until one is sighted (they cross ahead of us).
    for (let i = 0; i < 600 && !world.traffic!.ships.some((s) => s.sighted); i++) run(1);
    const ship = world.traffic!.ships.find((s) => s.sighted)!;
    expect(ship).toBeTruthy();
    const ev = world.log!.events.find((e) => e.type === 'vessel')!;
    expect(ev.truth!.ship).toBe(SHIP_NAMES[ship.type]);
    expect(world.duties!.items.some((d) => d.title.startsWith('Log'))).toBe(false); // the log is optional
    const right = write('vessel', { ship: SHIP_NAMES[ship.type], dir: pointOf(ev.bearing!) });
    expect(right.fields.every((f) => f.correct)).toBe(true);
    // Next ship, logged wrongly (opposite direction).
    const s2 = spawnShip(world, world.traffic!, v, true)!;
    for (let i = 0; i < 300 && !s2.sighted; i++) run(1);
    const ev2 = world.log!.events.find((e) => e.type === 'vessel' && !e.logged)!;
    const wrong = write('vessel', { ship: SHIP_NAMES[s2.type], dir: pointOf(ev2.bearing! + 180) });
    expect(wrong.fields.find((f) => f.key === 'dir')!.correct).toBe(false);
  });

  it('a ship far off and opening goes; four are kept about; near a harbour they keep to deep water', () => {
    const { world, v, run } = setup();
    const s = spawnShip(world, world.traffic ?? (run(0.1), world.traffic!), v)!;
    s.x = v.position[0] + Math.sin(s.course) * (CONFIG.traffic.despawn + 100);
    s.z = v.position[2] - Math.cos(s.course) * (CONFIG.traffic.despawn + 100);
    run(0.1);
    expect(world.traffic!.ships.includes(s)).toBe(false);
    // Spawns due one after another: it fills up to four, and no more.
    for (let i = 0; i < 12; i++) {
      world.traffic!.nextShipAt = world.time;
      run(0.1);
    }
    expect(world.traffic!.ships).toHaveLength(CONFIG.traffic.maxShips);
    expect(CONFIG.traffic.maxShips).toBe(4);
    const h = setup(570, 646); // Calder Haven
    h.run(0.1);
    for (let i = 0; i < 8; i++) {
      h.world.traffic!.nextShipAt = h.world.time;
      h.run(0.1);
    }
    for (const sh of h.world.traffic!.ships) expect(groundHeight(sh.x, sh.z)).toBeLessThan(-8);
  });

  it('hazards: debris close by and the rocks are logged with their true type', () => {
    const { world, run, env, write } = setup();
    run(0.1);
    env('trafficSpawn', 1);
    const d = world.traffic!.debris[0];
    expect(d).toBeTruthy();
    run(0.2);
    const ev = world.log!.events.find((e) => e.type === 'hazard')!;
    expect(ev.truth!.hazard).toBe('Debris');
    expect(write('hazard', { hazard: 'Debris' }).fields[0].correct).toBe(true);
    // Sailing past the Skerry.
    const r = setup(-470, -540);
    r.run(0.2);
    expect(r.world.log!.events.some((e) => e.type === 'hazard' && e.truth!.hazard === 'Rocks')).toBe(true);
  });

  it('in fog ships sound a prolonged blast every two minutes, and answer ours', () => {
    const { world, v, env, send, run } = setup();
    run(0.1);
    env('trafficSpawn', 0);
    env('weatherForce', Object.keys(CONFIG.weather.presets).indexOf('Fog'), [1]);
    const seq0 = world.traffic!.hornSeq;
    run(125);
    expect(world.traffic!.hornSeq).toBeGreaterThan(seq0);
    // Under way in fog: our signal, and an answer straight back.
    send('quickStart', 1);
    run(10);
    send('navLights', 1);
    const before = world.traffic!.hornSeq;
    send('horn', 1);
    run(CONFIG.duties.blastMin + 0.5);
    send('horn', 0);
    run(0.1);
    expect(world.traffic!.hornSeq).toBe(before + 1);
    expect(v).toBeTruthy();
  });

  it('weather changes and finished rescues become log events; weather is checked against the sea and visibility', () => {
    const { world, env, run, write } = setup();
    run(0.1);
    env('weatherForce', Object.keys(CONFIG.weather.presets).indexOf('Fog'), [1]);
    run(0.1);
    expect(world.log!.events.some((e) => e.type === 'weather')).toBe(true);
    const e = write('weather', { sea: seaWord(world), vis: 'Poor' });
    expect(e.fields.every((f) => f.correct)).toBe(true);
    world.rescue!.completed += 1;
    world.rescue!.lastDone = 'Man overboard: 1 person recovered, landed at Calder Haven.';
    run(0.1);
    const re = write('rescue', {});
    expect(re.remarks).toMatch(/Man overboard/);
    expect(bearingTo(0, 0, 0, -100)).toBeCloseTo(0, 5);
  });
});

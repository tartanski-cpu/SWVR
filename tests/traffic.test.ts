import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { bearingTo, spawnShip } from '../src/traffic/traffic';
import { placeVessel } from '../src/vessel/vesselControl';
import { groundHeight } from '../src/world/terrain';

const DT = 1 / 60;

// Open sea south of home (north of it, where this used to be, is the Sounds now).
function setup(x = 0, z = 3600) {
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
  return { world, v, env, send, run };
}

describe('passing ships', { timeout: 30000 }, () => {
  it('out at sea a ship comes by on a clear course and is sighted; sightings are spaced out', () => {
    const { world, v, run } = setup();
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
    // The next ship isn't called until `sightEvery` has passed since the last sighting.
    const s2 = spawnShip(world, world.traffic!, v, true)!;
    const t0 = world.traffic!.sightAt!;
    for (let i = 0; i < 400 && !s2.sighted; i++) run(1);
    expect(s2.sighted).toBe(true);
    expect(world.traffic!.sightAt! - t0).toBeGreaterThanOrEqual(CONFIG.traffic.sightEvery);
    expect(bearingTo(0, 0, 0, -100)).toBeCloseTo(0, 5);
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

});

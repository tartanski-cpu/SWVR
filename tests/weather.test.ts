import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG, type WeatherPresetName } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { prepareWaves, surfaceHeight } from '../src/ocean/waves';
import { visibilityAt, windVector } from '../src/environment/weather';
import { placeVessel } from '../src/vessel/vesselControl';
import type { Incident } from '../src/rescue/rescue';

const DT = 1 / 60;

function setup(preset?: WeatherPresetName) {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), undefined, { weather: true, tender: true });
  world.geography = 'openSea';
  const env = world.environment;
  const send = (control: string, value: number, args?: number[]) => stepWorld(world, [{ playerId: localPlayerId, targetId: 'env', control, value, args } as Intent], DT);
  const run = (s: number, each?: () => void) => {
    for (let i = 0; i < s / DT; i++) {
      stepWorld(world, [], DT);
      each?.();
    }
  };
  if (preset) send('weatherForce', Object.keys(CONFIG.weather.presets).indexOf(preset), [1]);
  return { world, env, v: world.vessels[vesselId], send, run };
}

describe('dynamic weather', () => {
  it('starts in the configured preset with a matching sea', () => {
    const { env } = setup();
    expect(env.weather!.preset).toBe(CONFIG.weather.startPreset);
    expect(env.seaScale).toBeGreaterThan(0);
    expect(env.waves.length).toBeGreaterThan(0);
  });

  it('the director moves on only to presets allowed to follow - never clear straight to a squall', () => {
    const { env, send, run } = setup('Clear');
    send('weatherSpeed', 60);
    const seen: string[] = [env.weather!.preset];
    run(240, () => {
      const p = env.weather!.preset;
      if (p !== seen[seen.length - 1]) seen.push(p);
    });
    expect(seen.length).toBeGreaterThan(2);
    for (let i = 1; i < seen.length; i++) {
      const allowed = Object.keys((CONFIG.weather.next as Record<string, Record<string, number>>)[seen[i - 1]]);
      expect(allowed).toContain(seen[i]);
    }
  });

  it('transitions are smooth, and the sea builds after the wind', () => {
    const { env, send, run } = setup('Clear');
    send('weatherFixed', 1);
    send('weatherForce', Object.keys(CONFIG.weather.presets).indexOf('Squall'));
    let lastWind = env.weather!.now.wind;
    let maxStep = 0;
    run(30, () => {
      maxStep = Math.max(maxStep, Math.abs(env.weather!.now.wind - lastWind));
      lastWind = env.weather!.now.wind;
    });
    expect(maxStep).toBeLessThan(0.05); // no jumps
    // After 30 s the wind is well on its way; the sea has hardly started.
    const windFrac = (env.weather!.now.wind - 5) / (17 - 5);
    const seaFrac = (env.seaScale - 5 * CONFIG.weather.seaPerWind) / ((17 - 5) * CONFIG.weather.seaPerWind);
    expect(windFrac).toBeGreaterThan(0.3);
    expect(seaFrac).toBeLessThan(windFrac);
  });

  it('the water surface stays continuous when the waves are rebuilt', () => {
    const { world, env, send, run } = setup('Clear');
    send('weatherFixed', 1);
    send('weatherForce', Object.keys(CONFIG.weather.presets).indexOf('Rain'));
    run(20);
    let last = surfaceHeight(prepareWaves(env.waves, world.time), 13, -7);
    let maxJump = 0;
    run(5, () => {
      const h = surfaceHeight(prepareWaves(env.waves, world.time), 13, -7);
      maxJump = Math.max(maxJump, Math.abs(h - last));
      last = h;
    });
    expect(maxJump).toBeLessThan(0.08); // one tick's natural motion, no seam
  });

  it('fog: visibility drops, and fog banks thin it further', () => {
    const { env, send, run } = setup('Clear');
    send('weatherFixed', 1);
    expect(visibilityAt(env, 0, 0)).toBeGreaterThan(5000);
    const bank = CONFIG.weather.fogBanks[0];
    expect(visibilityAt(env, bank.x, bank.z)).toBeLessThan(bank.visibility * 1.01);
    send('weatherForce', Object.keys(CONFIG.weather.presets).indexOf('Fog'));
    run(240);
    expect(visibilityAt(env, 0, 0)).toBeLessThan(400);
  });

  it('leeway: stopped, she lies beam-on and drifts downwind; the light skiff faster', () => {
    const { world, env, v, send, run } = setup('Squall');
    send('weatherFixed', 1);
    const skiff = Object.values(world.vessels).find((x) => x.defId === 'skiff')!;
    placeVessel(v, 0, 0, -400, 30);
    placeVessel(skiff, 200, 0, -400, 0);
    // Flat water, to see the wind's push alone.
    const flat = () => {
      env.seaScale = 0;
      env.waves = [];
    };
    run(120, flat);
    const w = windVector(env, { x: 0, z: 0 });
    const dir = Math.hypot(w.x, w.z);
    const down = (s: typeof v) => (s.linearVelocity[0] * w.x + s.linearVelocity[2] * w.z) / dir;
    // A realistic leeway: ~1 kn for the workboat in a squall, more for the skiff...
    expect(down(v)).toBeGreaterThan(0.3);
    expect(down(v)).toBeLessThan(1.0);
    expect(down(skiff)).toBeGreaterThan(down(v));
    // ...lying beam-on, not running off downwind end-on.
    const q = new THREE.Quaternion(...v.orientation).invert();
    const local = new THREE.Vector3(...v.linearVelocity).applyQuaternion(q);
    expect(Math.abs(local.x)).toBeGreaterThan(Math.abs(local.z) * 2);
  });

  it('things in the water drift downwind', () => {
    const { world, env, send, run } = setup('Squall');
    send('weatherFixed', 1);
    world.rescue!.active = { id: 'i', defId: 'manOverboard', phase: 'accepted', x: 0, z: 0, radius: 50, alertT: 0, t: 0, targets: [{ id: 't', kind: 'person', x: 0, z: 0 }] } as unknown as Incident;
    run(10);
    const t = world.rescue!.active!.targets[0];
    const w = windVector(env, { x: 0, z: 0 });
    const cur = CONFIG.rescue.drift;
    // Moved more along the wind than the current alone would take it.
    const along = (t.x * w.x + t.z * w.z) / Math.hypot(w.x, w.z);
    const curAlong = ((cur[0] * w.x + cur[1] * w.z) / Math.hypot(w.x, w.z)) * 10;
    expect(along).toBeGreaterThan(curAlong + 1);
  });
});

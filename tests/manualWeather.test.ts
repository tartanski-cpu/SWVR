/**
 * Weather by hand (Debug > World > Weather; environment/weather.ts setManualWeather, the
 * 'weatherManual' and 'weatherOwn' intents): wind, its bearing, rain and the sea's height set
 * one at a time, in at once and held there (no director); then back to the live weather as it
 * came in, or the game's own.
 */
import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/core/world';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { ENVIRONMENT_ID } from '../src/core/ids';
import { setLiveWeather } from '../src/environment/weather';
import { significantWaveHeight } from '../src/ocean/waves';
import type { Intent } from '../src/core/intents';

const manual = (which: number, v: number): Intent => ({ playerId: 'p', targetId: ENVIRONMENT_ID, control: 'weatherManual', value: which, args: [v] });

describe('weather by hand', { timeout: 60000 }, () => {
  it('sets wind, bearing, rain and sea, holds them, and gives the live weather back', () => {
    const { world } = createWorld(new IdFactory(), 'pilotBoat', { weather: true });
    const env = world.environment;
    setLiveWeather(env, { wind: 4, windFrom: 300, visibility: 15000, rain: 0, cloud: 0.5 }, 'Clear', world.time, { text: 'x', credit: 'c' });
    stepWorld(world, [manual(0, 20), manual(1, 180), manual(2, 0.75), manual(3, 3)], 1);
    const w = env.weather!;
    expect(w.manual).toBeDefined();
    expect(w.now.wind).toBeCloseTo(20, 3);
    expect(w.now.windFrom).toBeCloseTo(180, 3);
    expect(w.now.rain).toBeCloseTo(0.75, 3);
    expect(w.preset).toBe('Squall');
    expect(significantWaveHeight(env.waves)).toBeCloseTo(3, 1);
    expect(JSON.parse(JSON.stringify(w)).next.at).toBeGreaterThan(world.time); // crew snapshots read it
    // Held: an hour on, nothing has moved.
    for (let i = 0; i < 3600; i++) stepWorld(world, [], 1);
    expect(env.weather!.now.wind).toBeCloseTo(20, 3);
    expect(env.weather!.now.rain).toBeCloseTo(0.75, 3);
    expect(significantWaveHeight(env.waves)).toBeCloseTo(3, 1);
    // Calm it right down: flat sea, no wind.
    stepWorld(world, [manual(0, 0), manual(3, 0), manual(2, 0)], 1);
    expect(env.weather!.now.wind).toBe(0);
    expect(env.weather!.preset).toBe('Clear');
    expect(significantWaveHeight(env.waves)).toBeLessThan(0.15);
    // Back to live: the values as they came in, the director on.
    stepWorld(world, [{ playerId: 'p', targetId: ENVIRONMENT_ID, control: 'weatherOwn', value: 1 }], 1);
    expect(env.weather!.manual).toBeUndefined();
    expect(env.weather!.now.wind).toBeCloseTo(4, 3);
    expect(env.weather!.now.windFrom).toBeCloseTo(300, 3);
    expect(env.weather!.fixed).toBe(false);
  });

  it('without live weather, back to the game\'s own', () => {
    const { world } = createWorld(new IdFactory(), 'pilotBoat', { weather: true });
    stepWorld(world, [manual(0, 25)], 1);
    expect(world.environment.weather!.fixed).toBe(true);
    stepWorld(world, [{ playerId: 'p', targetId: ENVIRONMENT_ID, control: 'weatherOwn', value: 1 }], 1);
    expect(world.environment.weather!.manual).toBeUndefined();
  });
});

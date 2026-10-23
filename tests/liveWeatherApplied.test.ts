/**
 * A Voyage map's live weather applied (environment/weather.ts setLiveWeather; the map side's
 * fetch is tests/coastWeather.test.ts): the values in at once and held, the sea at the marine
 * model's height and kept there, not dragged back to the wind's; a debug preset gives the
 * game's own weather back; the line the players read.
 */
import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/core/world';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { seaForWind, setLiveWeather, setWeatherPreset } from '../src/environment/weather';
import { significantWaveHeight } from '../src/ocean/waves';
import { liveWeatherText } from '../src/voyage/liveWeather';
import { seaScaleFor } from '../src/world/coastWeather';

describe('live weather in the world', () => {
  it('held for the session, the sea at the marine height (not the wind\'s), the director off', () => {
    const { world } = createWorld(new IdFactory(), 'pilotBoat', { weather: true });
    const env = world.environment;
    // A light wind over an old swell: the wind alone would give a much smaller sea.
    const scale = seaScaleFor(1.6);
    setLiveWeather(env, { wind: 3, windFrom: 300, visibility: 15000, rain: 0, cloud: 0.8 }, 'Overcast', world.time, { text: 'x', credit: 'c' }, scale);
    expect(env.weather!.fixed).toBe(true);
    expect(env.weather!.preset).toBe('Overcast');
    expect(significantWaveHeight(env.waves)).toBeCloseTo(1.6, 1);
    expect(scale).toBeGreaterThan(seaForWind(3) + 0.3);
    // Ten minutes on: still that sea, still that wind, still that preset.
    for (let i = 0; i < 600; i++) stepWorld(world, [], 1);
    expect(env.seaScale).toBeCloseTo(scale, 3);
    expect(env.weather!.now.wind).toBeCloseTo(3, 3);
    expect(env.weather!.preset).toBe('Overcast');
    // A debug preset: the game's own weather again, the sea following the wind.
    setWeatherPreset(env.weather!, 'Squall', world.time, true, env);
    expect(env.weather!.live).toBeUndefined();
    expect(env.weather!.seaHeld).toBeUndefined();
  });

  it('with no marine sea: the sea the wind raises', () => {
    const { world } = createWorld(new IdFactory(), 'pilotBoat', { weather: true });
    setLiveWeather(world.environment, { wind: 9, windFrom: 200, visibility: 8000, rain: 0.4, cloud: 1 }, 'Rain', world.time, { text: 'x', credit: 'c' });
    expect(world.environment.seaScale).toBeCloseTo(seaForWind(9), 6);
  });

  it('in words: where, when, the wind in knots and from where, gusts, the sky, the sea', () => {
    const text = liveWeatherText('Oban and Lorn', { time: '2026-10-23T15:30', zone: 'GMT+1', wind: 5.1, windFrom: 315, gust: 8.7, visibility: 20000, rain: 0, cloud: 0.9, preset: 'Overcast', sea: { scale: 0.5, height: 0.8, period: 5, from: 300 } });
    expect(text).toBe('Live weather, Oban and Lorn 15:30 GMT+1: wind north-west 10 kn, gusts 17, overcast, sea 0.8 m');
    expect(liveWeatherText('Syros', { time: '', zone: '', wind: 3, windFrom: 34, gust: 3, visibility: 20000, rain: 0, cloud: 0.1, preset: 'Clear' })).toBe('Live weather, Syros: wind north-east 6 kn, gusts 6, clear');
  });
});

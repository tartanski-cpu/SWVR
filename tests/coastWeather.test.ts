/**
 * Live weather on the Voyage maps (world/coastWeather.ts): the services' answers turned into
 * the game's weather (a real answer for Oban, and made-up fog, a gale with thunder, rain);
 * the sea from the marine model as the game's sea scale; and the game keeps its own weather
 * when the services fail. No network: the answers are given, the fetch faked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../src/config';
import { seaStateWaves } from '../src/environment/environmentState';
import { significantWaveHeight } from '../src/ocean/waves';
import { fetchLiveWeather, liveWeatherFrom, seaScaleFor, type ForecastAnswer } from '../src/world/coastWeather';
import { VOYAGE_MAPS } from '../src/world/maps';

// Oban, 23 Oct 2026 15:30 BST, as the services gave it.
const oban: ForecastAnswer = { timezone_abbreviation: 'GMT+1', current: { time: '2026-10-23T15:30', wind_speed_10m: 4.9, wind_direction_10m: 328, wind_gusts_10m: 8.5, precipitation: 0, cloud_cover: 100, visibility: 37100, weather_code: 3 } };
const obanSea = { current: { wave_height: 0.56, wave_period: 6.15, wave_direction: 266 } };
const with_ = (over: Partial<NonNullable<ForecastAnswer['current']>>): ForecastAnswer => ({ ...oban, current: { ...oban.current, ...over } });

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

afterEach(() => vi.unstubAllGlobals());

describe('live weather (owner: real weather at the map, once a session)', () => {
  it('Oban, a grey afternoon: a light north-westerly, overcast, the farthest the game draws, dry; the sea from the marine model', () => {
    const w = liveWeatherFrom(oban, obanSea)!;
    expect(w.wind).toBeCloseTo(4.9);
    expect(w.windFrom).toBe(328);
    expect(w.gust).toBeCloseTo(8.5);
    expect(w.visibility).toBe(CONFIG.liveWeather.maxVisibility);
    expect(w.rain).toBe(0);
    expect(w.cloud).toBe(1);
    expect(w.preset).toBe('Overcast');
    expect(w.time).toBe('2026-10-23T15:30');
    expect(w.zone).toBe('GMT+1');
    // The game's sea at that scale has the marine model's wave height.
    expect(significantWaveHeight(seaStateWaves(w.sea!.scale))).toBeCloseTo(0.56, 1);
    expect(w.sea!.from).toBe(266);
  });

  it('fog, a gale with thunder, rain, a clear day: the nearest preset; rain in proportion', () => {
    expect(liveWeatherFrom(with_({ visibility: 300, weather_code: 45 }))!.preset).toBe('Fog');
    expect(liveWeatherFrom(with_({ wind_speed_10m: 18 }))!.preset).toBe('Squall');
    expect(liveWeatherFrom(with_({ weather_code: 95 }))!.preset).toBe('Squall');
    const rainy = liveWeatherFrom(with_({ precipitation: 2 }))!;
    expect(rainy.preset).toBe('Rain');
    expect(rainy.rain).toBeCloseTo(2 / CONFIG.liveWeather.rainMmH);
    expect(liveWeatherFrom(with_({ precipitation: 40 }))!.rain).toBe(1);
    expect(liveWeatherFrom(with_({ cloud_cover: 20 }))!.preset).toBe('Clear');
  });

  it('no sea where the marine model has none; nothing without current conditions', () => {
    expect(liveWeatherFrom(oban, { current: { wave_height: null } })!.sea).toBeUndefined();
    expect(liveWeatherFrom(oban, null)!.sea).toBeUndefined();
    expect(liveWeatherFrom({})).toBeNull();
  });

  it('the sea scale for a wave height: calm, slight, moderate, rough', () => {
    expect(seaScaleFor(0)).toBe(0);
    for (const hs of [0.6, 1.3, 2.5]) expect(significantWaveHeight(seaStateWaves(seaScaleFor(hs)))).toBeCloseTo(hs, 1);
  });

  it('asks both services for the map\'s point; the services down or slow: null (the game\'s own weather)', async () => {
    const asked: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url);
      return { ok: true, json: async () => (url.includes('marine') ? obanSea : oban) };
    });
    const at = VOYAGE_MAPS.find((m) => m.id === 'oban')!.weatherAt;
    const w = await fetchLiveWeather(at);
    expect(w?.preset).toBe('Overcast');
    expect(asked.every((u) => u.includes(`latitude=${at.lat}&longitude=${at.lon}`))).toBe(true);
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });
    expect(await fetchLiveWeather(at)).toBeNull();
    vi.stubGlobal('fetch', async () => ({ ok: false, json: async () => ({}) }));
    expect(await fetchLiveWeather(at)).toBeNull();
  });

  it('every Voyage map has a point to read its weather at, inside its own box', () => {
    for (const m of VOYAGE_MAPS) {
      const [w, s, e, n] = (JSON.parse(readFileSync(join(root, 'public/regions', m.id, 'region.json'), 'utf8')) as { bbox: number[] }).bbox;
      expect(m.weatherAt.lon, m.id).toBeGreaterThan(w);
      expect(m.weatherAt.lon, m.id).toBeLessThan(e);
      expect(m.weatherAt.lat, m.id).toBeGreaterThan(s);
      expect(m.weatherAt.lat, m.id).toBeLessThan(n);
    }
  });
});

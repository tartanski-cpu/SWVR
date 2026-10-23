/**
 * Live weather on the Voyage maps (owner, Oct 2026: "real-time weather in those locations ...
 * every time you start a game session ... a forecast"). The current conditions at the map's
 * point (VoyageMap.weatherAt), fetched once at the start of a session from Open-Meteo (free,
 * no key: CONFIG.liveWeather), turned into the game's weather values:
 *
 *   wind        the 10 m wind (m/s) and the bearing it blows from (as the game's)
 *   visibility  the model's (m), no farther than the game's clearest preset
 *   rain        precipitation (mm an hour) as the game's 0-1, at full by `rainMmH`
 *   cloud       cover, 0-1
 *   preset      the nearest of the game's presets (the sky, the shipping forecast's words):
 *               Fog, Squall (a gale, or thunder), Rain, Overcast or Clear
 *   sea         the marine model's significant wave height, as the game's sea scale (its
 *               Hs is about 1.3 m a unit of scale; environment/environmentState.ts), and its
 *               direction and period; absent where the marine model has no sea there
 *
 * `liveWeatherFrom` is pure (the tests feed it the service's answers); `fetchLiveWeather`
 * asks the two services and gives null if either fails or is slow, so the game keeps its own
 * weather. Applying it to the world is the game's (the host, at the start of a Voyage).
 */
import { CONFIG, type WeatherPresetName } from '../config';
import { seaStateWaves } from '../environment/environmentState';
import { significantWaveHeight } from '../ocean/waves';

export interface LiveWeather {
  /** The conditions' time, local to the place ("2026-10-23T15:30"), and its time zone's name. */
  time: string;
  zone: string;
  wind: number;
  windFrom: number;
  /** Gusts (m/s), for the forecast's words. */
  gust: number;
  visibility: number;
  rain: number;
  cloud: number;
  preset: WeatherPresetName;
  /** The sea, from the marine model: the game's sea scale, the waves' height (m), period (s) and the bearing they come from. */
  sea?: { scale: number; height: number; period: number; from: number };
}

/** The forecast service's answer (the parts read). */
export interface ForecastAnswer {
  timezone_abbreviation?: string;
  current?: { time?: string; wind_speed_10m?: number; wind_direction_10m?: number; wind_gusts_10m?: number; precipitation?: number; cloud_cover?: number; visibility?: number; weather_code?: number };
}
/** The marine service's answer (the parts read). */
export interface MarineAnswer {
  current?: { wave_height?: number | null; wave_period?: number | null; wave_direction?: number | null };
}

/** The game's sea scale whose significant wave height is `hs` (m). */
export function seaScaleFor(hs: number): number {
  // The scale's waves grow steadily with it: bisect.
  let lo = 0;
  let hi = CONFIG.ocean.maxSeaScale;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (significantWaveHeight(seaStateWaves(mid)) < hs) lo = mid;
    else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 100) / 100;
}

/** The game's weather from the services' answers (null if the forecast has no current conditions). */
export function liveWeatherFrom(f: ForecastAnswer, m?: MarineAnswer | null): LiveWeather | null {
  const c = CONFIG.liveWeather;
  const now = f.current;
  if (!now || now.wind_speed_10m === undefined || now.wind_direction_10m === undefined) return null;
  const wind = Math.max(0, now.wind_speed_10m);
  const rain = Math.min(1, Math.max(0, (now.precipitation ?? 0) / c.rainMmH));
  const cloud = Math.min(1, Math.max(0, (now.cloud_cover ?? 0) / 100));
  const code = now.weather_code ?? 0;
  // WMO weather codes: 45, 48 fog; 95-99 thunderstorms.
  const fogCode = code === 45 || code === 48;
  const visibility = Math.min(c.maxVisibility, Math.max(50, now.visibility ?? (fogCode ? 200 : c.maxVisibility)));
  const preset: WeatherPresetName =
    visibility < c.fog || (fogCode && visibility < 2 * c.fog) ? 'Fog' : wind >= c.squallWind || code >= 95 ? 'Squall' : rain > c.rainy ? 'Rain' : cloud > c.overcast ? 'Overcast' : 'Clear';
  const w = m?.current;
  const sea = w && typeof w.wave_height === 'number' ? { scale: seaScaleFor(w.wave_height), height: w.wave_height, period: w.wave_period ?? 0, from: w.wave_direction ?? 0 } : undefined;
  return {
    time: now.time ?? '',
    zone: f.timezone_abbreviation ?? '',
    wind,
    windFrom: ((now.wind_direction_10m % 360) + 360) % 360,
    gust: Math.max(wind, now.wind_gusts_10m ?? wind),
    visibility,
    rain,
    cloud,
    preset,
    ...(sea ? { sea } : {}),
  };
}

/** Ask a service, giving up after the timeout (null on any failure). */
async function ask<T>(url: string): Promise<T | null> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), CONFIG.liveWeather.timeoutMs);
  try {
    const res = await fetch(url, { signal: stop.signal });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The current conditions at (lat, lon), or null (offline, the service down or slow): then the game's own weather. */
export async function fetchLiveWeather(at: { lat: number; lon: number }): Promise<LiveWeather | null> {
  const c = CONFIG.liveWeather;
  const where = `latitude=${at.lat}&longitude=${at.lon}`;
  const [f, m] = await Promise.all([
    ask<ForecastAnswer>(`${c.forecastUrl}?${where}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,cloud_cover,visibility,weather_code&wind_speed_unit=ms&timezone=auto`),
    ask<MarineAnswer>(`${c.marineUrl}?${where}&current=wave_height,wave_period,wave_direction`),
  ]);
  return f ? liveWeatherFrom(f, m) : null;
}

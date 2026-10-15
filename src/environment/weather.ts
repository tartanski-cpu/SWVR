/**
 * Dynamic weather: one state drives everything (environment/weather view, waves, the
 * boats' leeway, drift, sound). Plain data in EnvironmentState, stepped by the host; the
 * clients get it in the snapshots and render it locally.
 *
 *   values     wind speed (m/s) and the bearing it blows FROM, visibility (m), rain and
 *              cloud (0..1). They ease toward the current preset's targets with a time
 *              constant (CONFIG.weather.transition), the wind direction by the short way.
 *   director   holds a preset for a while (CONFIG.weather.hold), then moves to one of the
 *              presets allowed to follow it (`next`, weighted) - never clear straight to a
 *              squall. It always knows its NEXT change (preset and time) a step ahead:
 *              that plan is what a forecast describes (weather milestone 5).
 *   lightning  in a squall, a flash every so often at a random distance (`lightning`):
 *              views flash the sky and play the thunder, delayed by the distance.
 *   forecast   the time of the next VHF shipping forecast (environment/forecast.ts):
 *              regularly, and soon after each change of weather.
 *   sea        follows the wind: target scale = wind x seaPerWind, built up over
 *              `seaBuild`, settling over `seaDecay` - so waves lag the wind. The wave
 *              components are rebuilt each second with their phases kept continuous
 *              (changing a period changes w, so phi is shifted by (w_new - w_old) t).
 * Random choices use a deterministic hash of a counter in the state (host and clients agree).
 */
import { CONFIG, type WeatherPresetName } from '../config';
import { clamp, wrap } from '../core/math';
import type { WaveComponent } from '../ocean/waves';
import type { EnvironmentState } from './environmentState';
import { seaStateWaves } from './environmentState';

export interface WeatherValues {
  /** Wind speed (m/s) and the bearing it blows FROM (deg, 0 = north). */
  wind: number;
  windFrom: number;
  /** Meteorological visibility (m). */
  visibility: number;
  rain: number;
  cloud: number;
}

export interface WeatherState {
  preset: WeatherPresetName;
  now: WeatherValues;
  target: WeatherValues;
  /** The director's plan: the next preset and when it starts (world time, s). */
  next: { preset: WeatherPresetName; at: number };
  seq: number;
  /** No director: the weather stays as it is. */
  fixed: boolean;
  /** Debug: transitions and holds run this many times faster. */
  speed: number;
  /** World time of the last wave rebuild (s). */
  wavesAt: number;
  /** The last lightning flash (seq counts them; views flash/thunder on change) and the next. */
  lightning: { seq: number; at: number; dist: number; nextAt: number };
  /** When the next shipping forecast goes out (world time, s). */
  forecastAt: number;
}

const TWO_PI = Math.PI * 2;

function hash01(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** A preset's target values, the wind direction wandering a little each time. */
function targetFor(preset: WeatherPresetName, seq: number): WeatherValues {
  const p = CONFIG.weather.presets[preset];
  const c = CONFIG.weather;
  return { wind: p.wind, windFrom: wrap(c.windDir + (hash01(seq + 0.37) * 2 - 1) * c.windDirSpread, 360), visibility: p.visibility, rain: p.rain, cloud: p.cloud };
}

function pickNext(from: WeatherPresetName, seq: number): WeatherPresetName {
  const table = CONFIG.weather.next[from] as Partial<Record<WeatherPresetName, number>>;
  const entries = Object.entries(table) as [WeatherPresetName, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = hash01(seq) * total;
  for (const [name, w] of entries) {
    if ((r -= w) < 0) return name;
  }
  return entries[0][0];
}

function holdFor(preset: WeatherPresetName, seq: number): number {
  const [a, b] = preset === 'Squall' ? CONFIG.weather.squallHold : CONFIG.weather.hold;
  return a + (b - a) * hash01(seq + 0.71);
}

export function createWeather(preset: WeatherPresetName = CONFIG.weather.startPreset, time = 0): WeatherState {
  const target = targetFor(preset, 1);
  return {
    preset,
    now: { ...target },
    target,
    next: { preset: pickNext(preset, 2), at: time + holdFor(preset, 3) },
    seq: 3,
    fixed: CONFIG.weather.fixed,
    speed: 1,
    wavesAt: -1,
    lightning: { seq: 0, at: -1, dist: 0, nextAt: time },
    // The first forecast a couple of minutes in: time to get the boat started.
    forecastAt: time + 120,
  };
}

/** Sea scale the wind would raise in the long run. */
export function seaForWind(wind: number): number {
  return clamp(wind * CONFIG.weather.seaPerWind, 0, CONFIG.ocean.maxSeaScale);
}

/** Change to a preset now (the director, or a debug force); `instant` jumps the values too. */
export function setWeatherPreset(w: WeatherState, preset: WeatherPresetName, time: number, instant = false, env?: EnvironmentState): void {
  w.seq += 3;
  w.preset = preset;
  w.target = targetFor(preset, w.seq);
  w.next = { preset: pickNext(preset, w.seq + 1), at: time + holdFor(preset, w.seq + 2) / w.speed };
  // A new plan: the coastguard puts out a fresh forecast shortly.
  w.forecastAt = Math.min(w.forecastAt, time + CONFIG.weather.forecast.afterChange / w.speed);
  if (instant) {
    w.now = { ...w.target };
    if (env) {
      env.seaScale = seaForWind(w.now.wind);
      rebuildWaves(env, time);
    }
  }
}

/** Advance the weather by dt (host). */
export function stepWeather(env: EnvironmentState, time: number, dt: number): void {
  const w = env.weather;
  if (!w) return;
  const c = CONFIG.weather;
  // Director: on to the planned preset when its time comes.
  if (!w.fixed && time >= w.next.at) setWeatherPreset(w, w.next.preset, time);
  // Ease the values toward the target.
  const k = 1 - Math.exp((-dt * w.speed) / c.transition);
  const n = w.now;
  const t = w.target;
  n.wind += (t.wind - n.wind) * k;
  n.rain += (t.rain - n.rain) * k;
  n.cloud += (t.cloud - n.cloud) * k;
  // Visibility eases in log space (220 m to 20 km is a long way linearly).
  n.visibility = Math.exp(Math.log(n.visibility) + (Math.log(t.visibility) - Math.log(n.visibility)) * k);
  const dDir = ((t.windFrom - n.windFrom + 540) % 360) - 180;
  n.windFrom = wrap(n.windFrom + dDir * k, 360);
  // The sea follows the wind, building faster than it settles.
  const seaTarget = seaForWind(n.wind);
  const tau = seaTarget > env.seaScale ? c.seaBuild : c.seaDecay;
  env.seaScale += (seaTarget - env.seaScale) * (1 - Math.exp((-dt * w.speed) / tau));
  // Rebuild the wave components once a second.
  if (time - w.wavesAt >= 1) rebuildWaves(env, time);
  // Lightning, in squalls once the rain has set in.
  const L = w.lightning;
  if (w.preset === 'Squall' && n.rain > 0.7) {
    if (time >= L.nextAt) {
      const lc = c.lightning;
      L.seq += 1;
      L.at = time;
      L.dist = lc.dist[0] + (lc.dist[1] - lc.dist[0]) * hash01(w.seq * 31 + L.seq * 1.7);
      L.nextAt = time + (lc.every[0] + (lc.every[1] - lc.every[0]) * hash01(w.seq * 17 + L.seq * 2.3)) / w.speed;
    }
  } else {
    L.nextAt = Math.max(L.nextAt, time + 3);
  }
}

/**
 * New wave components for the current sea scale, phases shifted so the surface doesn't
 * jump: theta = w t - phi must be the same before and after at `time`.
 */
export function rebuildWaves(env: EnvironmentState, time: number): void {
  if (env.weather) env.weather.wavesAt = time;
  const old = env.waves;
  const fresh = seaStateWaves(env.seaScale);
  if (fresh.length && old.length === fresh.length) {
    fresh.forEach((f: WaveComponent, i) => {
      const o = old[i];
      const dw = TWO_PI / f.period - TWO_PI / o.period;
      f.phase = wrap(o.phase + dw * time, TWO_PI);
    });
  }
  env.waves = fresh;
}

/** Visibility at a point (m): the weather's, thinned by any fog bank around it. */
export function visibilityAt(env: EnvironmentState, x: number, z: number): number {
  const w = env.weather;
  let vis = w ? w.now.visibility : CONFIG.environment.fogFar * 4;
  for (const b of CONFIG.weather.fogBanks) {
    const d = Math.hypot(x - b.x, z - b.z);
    if (d >= b.r) continue;
    // Thickest in the middle, thinning out over the outer half of the bank.
    const f = clamp((b.r - d) / (b.r * 0.5), 0, 1);
    vis = Math.exp(Math.log(vis) + (Math.log(Math.min(vis, b.visibility)) - Math.log(vis)) * f);
  }
  return vis;
}

/** Wind velocity vector (m/s, world x/z): blowing FROM windFrom, so toward windFrom + 180. */
export function windVector(env: EnvironmentState, out: { x: number; z: number }): { x: number; z: number } {
  const w = env.weather;
  if (!w) {
    out.x = 0;
    out.z = 0;
    return out;
  }
  const to = ((w.now.windFrom + 180) * Math.PI) / 180;
  out.x = Math.sin(to) * w.now.wind; // east
  out.z = -Math.cos(to) * w.now.wind; // north is -z
  return out;
}

/** Beaufort force for a wind speed (m/s). */
export function beaufort(wind: number): number {
  const limits = [0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
  let b = 0;
  while (b < limits.length && wind >= limits[b]) b++;
  return b;
}

/** Compass name of a bearing (8 points). */
export function compass8(deg: number): string {
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(wrap(deg, 360) / 45) % 8];
}

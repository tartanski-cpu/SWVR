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
 *              components are rebuilt as it changes, with their phases kept continuous
 *              where the players are (rebuildWaves).
 * Random choices use a deterministic hash of a counter in the state (host and clients agree).
 */
import { CONFIG, type WeatherPresetName } from '../config';
import { FOG_BANKS } from '../world/archipelago';
import { clamp, wrap } from '../core/math';
import { wavenumberFromPeriod, type WaveComponent } from '../ocean/waves';
import type { EnvironmentState } from './environmentState';
import { seaStateWaves } from './environmentState';
import { addGust, type GustState } from './gusts';
import { setShortSeasOff, updateWindSea, windSeaField } from '../ocean/windSea';

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
  /** World time of the last wave rebuild (s), and the sea scale they were built for. */
  wavesAt: number;
  wavesScale?: number;
  /** The last lightning flash (seq counts them; views flash/thunder on change) and the next. */
  lightning: { seq: number; at: number; dist: number; nextAt: number };
  /** When the next shipping forecast goes out (world time, s). */
  forecastAt: number;
  /** Katabatic gusts (gusts.ts): the one blowing, and when the next falls. Absent until the host first steps them. */
  gust?: GustState;
  /**
   * Live weather (a Voyage map's real conditions, world/coastWeather.ts; setLiveWeather): the
   * sea held at the marine model's (its sea scale) instead of following the wind, and the
   * line telling the players what it is, with the service's credit. Absent: the game's own.
   */
  seaHeld?: number;
  live?: { text: string; credit: string };
  /** The live weather as it came in, kept to go back to from manual weather (setLiveWeather). */
  liveSaved?: { values: WeatherValues; preset: WeatherPresetName; seaScale?: number; live: { text: string; credit: string } };
  /**
   * Debug: the weather set by hand (setManualWeather; owner, Oct 2026: off live weather, to test
   * big waves and strong winds): the wind (m/s) and where from, the rain (0..1), the sea's
   * significant wave height (m). Held as set: no director.
   */
  manual?: ManualWeather;
}

/** Weather set by hand (Debug): wind (m/s), the bearing it blows from (deg), rain (0..1), significant wave height (m). */
export interface ManualWeather {
  wind: number;
  windFrom: number;
  rain: number;
  hs: number;
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

/** The region's profile in force (RegionDef.weather), set by the host each tick; absent: the game's own tables. */
export type WeatherProfile = { next: Record<string, Partial<Record<string, number>>>; hold?: [number, number]; morningFog?: { from: number; to: number; chance: number } } | undefined;

function pickNext(from: WeatherPresetName, seq: number, profile?: WeatherProfile): WeatherPresetName {
  const table = ((profile?.next[from] as Partial<Record<WeatherPresetName, number>> | undefined) ?? CONFIG.weather.next[from]) as Partial<Record<WeatherPresetName, number>>;
  const entries = Object.entries(table) as [WeatherPresetName, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = hash01(seq) * total;
  for (const [name, w] of entries) {
    if ((r -= w) < 0) return name;
  }
  return entries[0][0];
}

function holdFor(preset: WeatherPresetName, seq: number, profile?: WeatherProfile): number {
  const [a, b] = preset === 'Squall' ? CONFIG.weather.squallHold : (profile?.hold ?? CONFIG.weather.hold);
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
export function setWeatherPreset(w: WeatherState, preset: WeatherPresetName, time: number, instant = false, env?: EnvironmentState, profile?: WeatherProfile): void {
  // The game's own weather again (a debug force on a live-weather Voyage): the sea follows the wind.
  delete w.seaHeld;
  delete w.live;
  delete w.manual;
  w.seq += 3;
  w.preset = preset;
  w.target = targetFor(preset, w.seq);
  w.next = { preset: pickNext(preset, w.seq + 1, profile), at: time + holdFor(preset, w.seq + 2, profile) / w.speed };
  // Morning fog (a region's profile): a change due to begin in the morning hours is to fog,
  // `chance` of the time. The hour it begins: the clock now plus the hold, at the clock's rate.
  const mf = profile?.morningFog;
  if (mf && env && w.next.preset !== preset) {
    const hourAt = wrap(env.timeOfDay + (w.next.at - time) * env.timeScale, 24);
    if (hourAt >= mf.from && hourAt < mf.to && hash01(w.seq + 0.53) < mf.chance) w.next.preset = 'Fog';
  }
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

/**
 * Live weather (a Voyage map's real conditions, fetched as the session starts; app/App.ts):
 * the values and the nearest preset straight in, and the sea at the marine model's height
 * where it gave one (`seaHeld`), else as the wind raises it. The waves rebuilt for it at once.
 *
 * It's the starting point, not a freeze (owner, Oct 2026: dynamic weather is one of Voyage's
 * basics; review: held for the session, it never changed online). The director plans the
 * next change from it by the region's odds (`profile`), as for the game's own weather; the
 * real sea holds until that first change, then follows the wind.
 */
export function setLiveWeather(env: EnvironmentState, values: WeatherValues, preset: WeatherPresetName, time: number, live: { text: string; credit: string }, seaScale?: number, profile?: WeatherProfile): void {
  const w = env.weather;
  if (!w) return;
  w.seq += 3;
  w.preset = preset;
  w.now = { ...values };
  w.target = { ...values };
  w.fixed = CONFIG.weather.fixed;
  w.next = { preset: pickNext(preset, w.seq + 1, profile), at: time + holdFor(preset, w.seq + 2, profile) / w.speed };
  w.live = live;
  delete w.manual;
  w.liveSaved = { values: { ...values }, preset, ...(seaScale !== undefined ? { seaScale } : {}), live };
  if (seaScale !== undefined) w.seaHeld = clamp(seaScale, 0, CONFIG.ocean.maxSeaScale);
  else delete w.seaHeld;
  // A fresh shipping forecast shortly, for the real conditions.
  w.forecastAt = Math.min(w.forecastAt, time + CONFIG.weather.forecast.afterChange / w.speed);
  env.seaScale = w.seaHeld ?? seaForWind(values.wind);
  rebuildWaves(env, time);
}

/** The game's preset nearest some values (the sky, the lightning, the forecast's words), as live weather picks it. */
export function presetFor(v: WeatherValues): WeatherPresetName {
  const c = CONFIG.liveWeather;
  return v.visibility < c.fog ? 'Fog' : v.wind >= c.squallWind && v.rain > c.rainy ? 'Squall' : v.rain > c.rainy ? 'Rain' : v.cloud > c.overcast ? 'Overcast' : 'Clear';
}

/**
 * Weather set by hand (Debug > World > Weather; owner, Oct 2026: "override it with predefined
 * weather ... a wind slider, rain slider and wave height slider"): in at once, held (no
 * director), the sea at the height asked for (`seaScale`, the game's scale for that Hs) rather
 * than the wind's. The rain brings the cloud down and the visibility in with it.
 */
export function setManualWeather(env: EnvironmentState, m: ManualWeather, time: number, seaScale: number): void {
  const w = env.weather;
  if (!w) return;
  const rain = clamp(m.rain, 0, 1);
  const values: WeatherValues = {
    wind: Math.max(0, m.wind),
    windFrom: wrap(m.windFrom, 360),
    rain,
    cloud: rain > 0 ? 0.7 + 0.3 * rain : 0.2,
    visibility: CONFIG.weather.presets.Clear.visibility * (1 - 0.88 * rain),
  };
  w.seq += 3;
  w.manual = { ...m, rain };
  w.preset = presetFor(values);
  w.now = { ...values };
  w.target = { ...values };
  w.fixed = true;
  delete w.live;
  w.next = { preset: w.preset, at: time + 1e9 }; // never (and JSON-safe for the crew snapshots, unlike Infinity)
  w.seaHeld = clamp(seaScale, 0, CONFIG.ocean.maxSeaScale);
  env.seaScale = w.seaHeld;
  rebuildWaves(env, time);
}

/**
 * Back from manual weather: to the live weather as it came in (where there was some; the
 * app asks for it afresh too), else the game's own, the director planning on from here.
 */
export function endManualWeather(env: EnvironmentState, time: number, profile?: WeatherProfile): void {
  const w = env.weather;
  if (!w) return;
  delete w.manual;
  const s = w.liveSaved;
  if (s) {
    setLiveWeather(env, s.values, s.preset, time, s.live, s.seaScale, profile);
    return;
  }
  w.fixed = CONFIG.weather.fixed;
  setWeatherPreset(w, w.preset, time, false, env, profile);
}

/** Advance the weather by dt (host). */
/** @param profile the weather profile of the region the home boat is in (RegionDef.weather), if any */
export function stepWeather(env: EnvironmentState, time: number, dt: number, profile?: WeatherProfile): void {
  const w = env.weather;
  if (!w) return;
  const c = CONFIG.weather;
  // Director: on to the planned preset when its time comes (the next one by the region's odds).
  if (!w.fixed && time >= w.next.at) setWeatherPreset(w, w.next.preset, time, false, env, profile);
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
  // The sea follows the wind, building faster than it settles; held where live weather gave it.
  const seaTarget = w.seaHeld ?? seaForWind(n.wind);
  const tau = seaTarget > env.seaScale ? c.seaBuild : c.seaDecay;
  env.seaScale += (seaTarget - env.seaScale) * (1 - Math.exp((-dt * w.speed) / tau));
  // Rebuild the wave components as soon as the sea has changed by a hair (1 part in 10^4:
  // most ticks while it builds or settles), so it changes smoothly. (Once a second, the
  // waves stepped visibly each second.) And when the wind has changed enough for the wind
  // sea's field to be worked out again (ocean/windSea.ts): its trains' sizes and direction.
  setShortSeasOff(!!env.shortSeasOff);
  const windChanged = updateWindSea(n.wind, n.windFrom);
  if (windChanged || Math.abs(env.seaScale - (w.wavesScale ?? -1)) > 1e-4 * Math.max(1, env.seaScale)) rebuildWaves(env, time);
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
 * jump where the players are (`env.seaAnchor`, else the origin).
 *
 * A component's phase is theta = k (D . p) - w t + phi. A new sea state changes its period,
 * so both w and k: keeping theta the same at the anchor point a and time t needs
 *   phi_new = phi_old + (w_new - w_old) t - (k_new - k_old) (D . a).
 * It can only be exact along one line: elsewhere the change of k shifts the waves by
 * (k_new - k_old) times the distance from it. Kept at the origin (as it was), that was a
 * visible jerk near the harbours, a kilometre or so out; at the players it's nil where
 * they are and, rebuilt in small steps as the sea changes, a gentle drift far off.
 */
export function rebuildWaves(env: EnvironmentState, time: number): void {
  if (env.weather) {
    env.weather.wavesAt = time;
    env.weather.wavesScale = env.seaScale;
  }
  // The wind sea's field for the wind now (worked out again only if it's changed enough).
  setShortSeasOff(!!env.shortSeasOff);
  if (env.weather) updateWindSea(env.weather.now.wind, env.weather.now.windFrom);
  const old = env.waves;
  // The short trains down the wind, as tall as the wind sea's field has them anywhere (ocean/windSea.ts).
  const field = windSeaField();
  const windTo = env.weather ? (env.weather.now.windFrom + 180) % 360 : undefined;
  const fresh = seaStateWaves(env.seaScale, windTo, field?.max ?? []);
  const a = env.seaAnchor ?? { x: 0, z: 0 };
  if (fresh.length && old.length === fresh.length) {
    fresh.forEach((f: WaveComponent, i) => {
      const o = old[i];
      const dw = TWO_PI / f.period - TWO_PI / o.period;
      // theta = k (D . a) - w t + phi kept the same at the anchor a: for a change of period
      // (w, k) and of direction (D: a short train swinging with the wind).
      const kNew = wavenumberFromPeriod(f.period);
      const kOld = wavenumberFromPeriod(o.period);
      const b = (f.directionDeg * Math.PI) / 180;
      const bo = (o.directionDeg * Math.PI) / 180;
      // D . a, with D = (sin b, -cos b): x east, north -z (as prepareWaves).
      const along = Math.sin(b) * a.x - Math.cos(b) * a.z;
      const alongOld = Math.sin(bo) * a.x - Math.cos(bo) * a.z;
      f.phase = wrap(o.phase + dw * time - (kNew * along - kOld * alongOld), TWO_PI);
    });
  }
  env.waves = fresh;
}

/** Visibility at a point (m): the weather's, thinned by any fog bank around it. */
export function visibilityAt(env: EnvironmentState, x: number, z: number): number {
  const w = env.weather;
  let vis = w ? w.now.visibility : CONFIG.environment.hazeFar;
  for (const b of FOG_BANKS) {
    const d = Math.hypot(x - b.x, z - b.z);
    if (d >= b.r) continue;
    // Thickest in the middle, thinning out over the outer half of the bank.
    const f = clamp((b.r - d) / (b.r * 0.5), 0, 1);
    vis = Math.exp(Math.log(vis) + (Math.log(Math.min(vis, b.visibility)) - Math.log(vis)) * f);
  }
  return vis;
}

/**
 * Wind velocity vector (m/s, world x/z): blowing FROM windFrom, so toward windFrom + 180.
 * Given a place (`at`: world x, z), a katabatic gust blowing there is added (gusts.ts);
 * without one, the weather's wind everywhere.
 */
export function windVector(env: EnvironmentState, out: { x: number; z: number }, at?: { x: number; z: number }): { x: number; z: number } {
  const w = env.weather;
  if (!w) {
    out.x = 0;
    out.z = 0;
    return out;
  }
  const to = ((w.now.windFrom + 180) * Math.PI) / 180;
  out.x = Math.sin(to) * w.now.wind; // east
  out.z = -Math.cos(to) * w.now.wind; // north is -z
  if (at && w.gust?.zone) addGust(env, at.x, at.z, out);
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

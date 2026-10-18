/**
 * Environment simulation: time of day -> sun direction -> sky/fog/light palette.
 *
 * Pure functions on plain data (no Three.js) so they run in the headless sim and in
 * tests. environmentView.ts turns the results into lights, background and fog.
 * Day/night is just `timeScale > 0`; weather will hang off EnvironmentState later.
 */
import { CONFIG } from '../config';
import type { Intent } from '../core/intents';
import { DEG, clamp, hexToRGB, lerp, lerpRGB, wrap, type RGB, type Vec3 } from '../core/math';
import type { EnvironmentState } from './environmentState';
import { rebuildWaves, setWeatherPreset } from './weather';
import type { WeatherPresetName } from '../config';

export function stepEnvironment(env: EnvironmentState, dt: number): void {
  if (env.timeScale !== 0) env.timeOfDay = wrap(env.timeOfDay + env.timeScale * dt, 24);
}

export function applyEnvironmentIntent(env: EnvironmentState, intent: Intent, time = 0): void {
  switch (intent.control) {
    case 'weatherForce': {
      // Debug: change to preset `value` (index into CONFIG.weather.presets); args[0] = 1 instant.
      const names = Object.keys(CONFIG.weather.presets) as WeatherPresetName[];
      const name = names[Math.round(intent.value)];
      if (env.weather && name) setWeatherPreset(env.weather, name, time, (intent.args?.[0] ?? 0) > 0.5, env);
      break;
    }
    case 'weatherFixed':
      if (env.weather) env.weather.fixed = intent.value > 0.5;
      break;
    case 'weatherSpeed':
      // Debug: transitions (and holds) this many times faster.
      if (env.weather) {
        const w = env.weather;
        const speed = clamp(intent.value, 1, 60);
        // The change already planned comes sooner (or later) too.
        w.next.at = time + Math.max(0, w.next.at - time) * (w.speed / speed);
        w.speed = speed;
      }
      break;
    case 'timeOfDay':
      env.timeOfDay = wrap(intent.value, 24);
      break;
    case 'timeOfDayDelta':
      env.timeOfDay = wrap(env.timeOfDay + intent.value, 24);
      break;
    case 'timeScale':
      env.timeScale = intent.value;
      break;
    case 'raceOverride':
      // Debug: 0 the clock, 1 every race at peak, 2 every race slack (world/currents.ts).
      env.raceOverride = intent.value >= 1.5 ? 'slack' : intent.value >= 0.5 ? 'peak' : undefined;
      break;
    case 'seaState':
      // Sea scale: 0 = flat calm, 1 = the configured moderate sea, up to maxSeaScale (storm).
      // Rebuilt with the phases kept where the players are, so the waves don't jump.
      env.seaScale = Math.round(clamp(intent.value, 0, CONFIG.ocean.maxSeaScale) * 100) / 100;
      rebuildWaves(env, time);
      break;
  }
}

/**
 * Unit vector pointing from the scene towards the sun, in world axes
 * (+X east, +Y up, -Z north), from the standard spherical-astronomy relations:
 *
 *   H = hour angle = (t - 12h) * 15 deg,  phi = latitude,  delta = declination
 *   east  = -cos(delta) sin(H)
 *   north =  sin(delta) cos(phi) - cos(delta) sin(phi) cos(H)
 *   up    =  sin(delta) sin(phi) + cos(delta) cos(phi) cos(H)
 */
export function sunDirection(
  timeOfDay: number,
  latitudeDeg = CONFIG.environment.latitudeDeg,
  declinationDeg = CONFIG.environment.solarDeclinationDeg,
): Vec3 {
  const H = (timeOfDay - 12) * 15 * DEG;
  const phi = latitudeDeg * DEG;
  const dec = declinationDeg * DEG;
  const east = -Math.cos(dec) * Math.sin(H);
  const north = Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.sin(phi) * Math.cos(H);
  const up = Math.sin(dec) * Math.sin(phi) + Math.cos(dec) * Math.cos(phi) * Math.cos(H);
  return [east, up, -north];
}

/** Sun elevation (degrees) at a given time of day. */
export function sunElevation(timeOfDay: number): number {
  return sunElevationDeg(sunDirection(timeOfDay));
}

/** Sun elevation above the horizon in degrees. */
export function sunElevationDeg(sunDir: Vec3): number {
  return Math.asin(clamp(sunDir[1], -1, 1)) / DEG;
}

export interface SkyPalette {
  zenith: RGB;
  horizon: RGB;
  fog: RGB;
  sunColor: RGB;
  sunIntensity: number;
  /** Hemisphere (sky) light intensity. */
  ambientIntensity: number;
}

/** Palette keyframes by sun elevation (degrees). Colours are sRGB hex. */
const KEYS: { elev: number; zenith: number; horizon: number; sun: number; sunI: number; amb: number }[] = [
  { elev: -18, zenith: 0x02040a, horizon: 0x0a1020, sun: 0x334466, sunI: 0.0, amb: 0.06 },
  { elev: -6, zenith: 0x0f1d3a, horizon: 0x3a3550, sun: 0xff6030, sunI: 0.0, amb: 0.18 },
  { elev: 0, zenith: 0x2a4a80, horizon: 0xe8885a, sun: 0xff8040, sunI: 0.6, amb: 0.4 },
  { elev: 8, zenith: 0x3d6db0, horizon: 0xe8c49a, sun: 0xffc890, sunI: 1.6, amb: 0.65 },
  { elev: 25, zenith: 0x3a78c8, horizon: 0xa8c8e0, sun: 0xfff2e0, sunI: 2.6, amb: 0.9 },
  { elev: 60, zenith: 0x2f6fc4, horizon: 0xb0d0e8, sun: 0xffffff, sunI: 3.0, amb: 1.0 },
];

export function skyPalette(sunElevation: number): SkyPalette {
  let i = 0;
  while (i < KEYS.length - 2 && sunElevation > KEYS[i + 1].elev) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = clamp((sunElevation - a.elev) / (b.elev - a.elev), 0, 1);
  const horizon = lerpRGB(hexToRGB(a.horizon), hexToRGB(b.horizon), t);
  return {
    zenith: lerpRGB(hexToRGB(a.zenith), hexToRGB(b.zenith), t),
    horizon,
    fog: horizon,
    sunColor: lerpRGB(hexToRGB(a.sun), hexToRGB(b.sun), t),
    sunIntensity: lerp(a.sunI, b.sunI, t),
    ambientIntensity: lerp(a.amb, b.amb, t),
  };
}

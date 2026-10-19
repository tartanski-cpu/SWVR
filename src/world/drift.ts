/**
 * What everything in the water drifts with: the slow background set (CONFIG.rescue.drift),
 * the wind's leeway on a floating thing (weather.driftPerWind of the wind), and any tidal
 * race it is in (world/currents.ts). One helper, so survivors, the life ring, debris, logs
 * and pots all move together.
 */
import { CONFIG } from '../config';
import type { EnvironmentState } from '../environment/environmentState';
import { windVector } from '../environment/weather';
import { addCurrent } from './currents';

const wind = { x: 0, z: 0 };

/** Drift velocity at (x, z) now (m/s, world x, z), written to `out`. */
export function driftVelocity(env: EnvironmentState, x: number, z: number, out: { x: number; z: number }): { x: number; z: number } {
  const w = windVector(env, wind, { x, z });
  out.x = CONFIG.rescue.drift[0] + w.x * CONFIG.weather.driftPerWind;
  out.z = CONFIG.rescue.drift[1] + w.z * CONFIG.weather.driftPerWind;
  addCurrent(x, z, out);
  return out;
}

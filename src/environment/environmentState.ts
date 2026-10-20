import { CONFIG } from '../config';
import { ENVIRONMENT_ID, type EntityId } from '../core/ids';
import type { WaveComponent } from '../ocean/waves';
import type { WeatherState } from './weather';

/**
 * Serializable environment state: time of day and sea state. Weather (wind, rain,
 * visibility) will be added here later, so a host can change it and clients follow.
 */
export interface EnvironmentState {
  id: EntityId;
  /** Hours, 0..24. */
  timeOfDay: number;
  /** Game-hours per real second. */
  timeScale: number;
  /** Sea state as a scale on the configured waves (0 = flat calm, 1 = moderate). */
  seaScale: number;
  /** Wave components of the current sea state (derived from seaScale). */
  waves: WaveComponent[];
  /** Dynamic weather (weather.ts). Absent: fixed fair weather (tests, trials). */
  weather?: WeatherState;
  /**
   * Where the players are (world x, z; set by the host each tick): the waves are kept
   * continuous here when the sea changes (weather.ts rebuildWaves). Absent: the origin.
   */
  seaAnchor?: { x: number; z: number };
  /** Debug (regions): every tidal race pinned at peak or slack; absent: the clock (world/currents.ts). */
  raceOverride?: 'peak' | 'slack';
}

/** The configured waves scaled to sea state `s` (see CONFIG.ocean.seaStates). */
export function seaStateWaves(s: number): WaveComponent[] {
  if (s <= 0) return [];
  const tScale = Math.pow(s, CONFIG.ocean.seaPeriodExponent);
  const sea = CONFIG.ocean.waves.map((w) => ({ ...w, amplitude: w.amplitude * s, period: w.period * tScale }));
  // The overfalls' chop (CONFIG.currents.overfalls.chop): short wind waves either side of
  // the main wave's direction, nowhere but in a race running against them (ocean/waves.ts).
  const c = CONFIG.currents.overfalls.chop;
  const main = sea[0]?.directionDeg ?? 0;
  const chop: WaveComponent[] = c.periods.map((period, i) => ({ amplitude: c.amplitude * s, period, directionDeg: main + (i % 2 ? -1 : 1) * c.spreadDeg, steepness: 1, phase: 1.3 * (i + 1), chop: true }));
  return [...sea, ...chop];
}

export function createEnvironment(): EnvironmentState {
  return {
    id: ENVIRONMENT_ID,
    timeOfDay: CONFIG.environment.startTimeOfDay,
    timeScale: CONFIG.environment.timeScale,
    seaScale: 1,
    waves: seaStateWaves(1),
  };
}

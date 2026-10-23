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
  /** Debug: the short seas by fetch off (ocean/windSea.ts), the long waves everywhere as before. */
  shortSeasOff?: boolean;
  /** Debug (regions): every tidal race pinned at the flood's peak, the ebb's, or slack; absent: the clock (world/currents.ts). */
  raceOverride?: 'peak' | 'ebb' | 'slack';
}

/** The configured waves scaled to sea state `s` (see CONFIG.ocean.seaStates). */
/**
 * The sea's wave trains for sea scale `s`: the long waves (the open sea), and the short
 * trains (CONFIG.ocean.fetchSeas.trains) that carry the wind sea in enclosed water and the
 * overfalls' chop in a race (ocean/windSea.ts, ocean/waves.ts waveFactors). The short trains
 * run down the wind (`windToDeg`, the way it blows; the main long wave's way if not given),
 * each as tall as the largest it is anywhere (`trainMax`, m: the wind sea's field) or the
 * race chop's (`chop.amplitude` × s), whichever is more: at each spot they're scaled down to
 * what's there.
 */
export function seaStateWaves(s: number, windToDeg?: number, trainMax: readonly number[] = []): WaveComponent[] {
  const f = CONFIG.ocean.fetchSeas;
  const tScale = Math.pow(Math.max(s, 0), CONFIG.ocean.seaPeriodExponent);
  const sea = s > 0 ? CONFIG.ocean.waves.map((w) => ({ ...w, amplitude: w.amplitude * s, period: w.period * tScale })) : [];
  const raceAmp = CONFIG.currents.overfalls.chop.amplitude * Math.max(s, 0);
  const to = windToDeg ?? CONFIG.ocean.waves[0]?.directionDeg ?? 0;
  const trains: WaveComponent[] = f.trains.map((t, i) => ({
    amplitude: Math.max(raceAmp, trainMax[i] ?? 0),
    period: t.period,
    directionDeg: (((to + t.offsetDeg) % 360) + 360) % 360,
    steepness: f.steepness,
    phase: 1.3 * (i + 1),
    chop: true,
    train: i,
    raceAmp,
  }));
  if (!sea.length && trains.every((t) => t.amplitude <= 0)) return [];
  return [...sea, ...trains];
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

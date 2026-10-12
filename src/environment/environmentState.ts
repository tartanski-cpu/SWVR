import { CONFIG } from '../config';
import { ENVIRONMENT_ID, type EntityId } from '../core/ids';
import type { WaveComponent } from '../ocean/waves';

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
  /** Wave components of the current sea state. */
  waves: WaveComponent[];
}

export function createEnvironment(): EnvironmentState {
  return {
    id: ENVIRONMENT_ID,
    timeOfDay: CONFIG.environment.startTimeOfDay,
    timeScale: CONFIG.environment.timeScale,
    waves: CONFIG.ocean.waves.map((w) => ({ ...w })),
  };
}

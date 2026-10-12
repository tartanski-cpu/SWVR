import { CONFIG } from '../config';
import type { EnvironmentState } from '../environment/timeOfDay';
import type { PlayerState } from '../player/playerState';
import { createPlayerState } from '../player/playerState';
import { ENVIRONMENT_ID, IdFactory, type EntityId } from './ids';

/**
 * The complete simulation state. Plain, JSON-serializable data only: no class
 * instances, no Three.js objects, no functions. That makes it trivial to snapshot,
 * diff, send over a network or save later.
 */
export interface WorldState {
  /** Number of fixed ticks simulated so far. */
  tick: number;
  /** Simulated seconds (tick * dt). */
  time: number;
  environment: EnvironmentState;
  players: Record<EntityId, PlayerState>;
  // vessels: Record<EntityId, VesselState>  (milestone 3)
}

export function createWorld(ids: IdFactory): { world: WorldState; localPlayerId: EntityId } {
  const localPlayerId = ids.next('player');
  const world: WorldState = {
    tick: 0,
    time: 0,
    environment: {
      id: ENVIRONMENT_ID,
      timeOfDay: CONFIG.environment.startTimeOfDay,
      timeScale: CONFIG.environment.timeScale,
    },
    players: {
      [localPlayerId]: createPlayerState(localPlayerId, 'Player 1'),
    },
  };
  return { world, localPlayerId };
}

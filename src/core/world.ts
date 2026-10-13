import { CONFIG } from '../config';
import { createEnvironment, type EnvironmentState } from '../environment/environmentState';
import type { PlayerState } from '../player/playerState';
import { createPlayerState } from '../player/playerState';
import { placeOnPlatform } from '../player/playerControl';
import { dropVessel } from '../vessel/vesselControl';
import { createVesselState, type VesselState } from '../vessel/vesselState';
import { IdFactory, type EntityId } from './ids';
import { stockPorts, type CargoItem } from '../cargo/cargo';

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
  vessels: Record<EntityId, VesselState>;
  /**
   * 'archipelago': vessels collide with the islands, seabed and harbour structures and can
   * anchor; 'openSea': deep water everywhere (sea trials, tests).
   */
  geography: 'archipelago' | 'openSea';
  /** Cargo items, waiting at ports or aboard vessels (cargo/cargo.ts). */
  cargo: Record<EntityId, CargoItem>;
  /** Counter for cargo ids and its deterministic choices. */
  cargoSeq: number;
  /** Deliveries completed. */
  deliveries: number;
}

export function createWorld(
  ids: IdFactory,
  vesselDefId: string = CONFIG.testScene.vesselDefId,
): { world: WorldState; localPlayerId: EntityId; vesselId: EntityId } {
  const localPlayerId = ids.next('player');
  const vesselId = ids.next('vessel');
  const vessel = createVesselState(vesselId, vesselDefId);
  dropVessel(vessel);
  const player = createPlayerState(localPlayerId, 'Player 1');
  placeOnPlatform(player);
  const world: WorldState = {
    tick: 0,
    time: 0,
    environment: createEnvironment(),
    players: {
      [localPlayerId]: player,
    },
    vessels: { [vesselId]: vessel },
    geography: 'archipelago',
    cargo: {},
    cargoSeq: 0,
    deliveries: 0,
  };
  stockPorts(world);
  return { world, localPlayerId, vesselId };
}

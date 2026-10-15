import type { BoardState } from '../board/board';
import { CONFIG } from '../config';
import { createEnvironment, type EnvironmentState } from '../environment/environmentState';
import type { PlayerState } from '../player/playerState';
import { createPlayerState } from '../player/playerState';
import { placeOnPlatform } from '../player/playerControl';
import { dropVessel } from '../vessel/vesselControl';
import { createVesselState, type VesselState } from '../vessel/vesselState';
import { IdFactory, type EntityId } from './ids';
import { stockPorts, type CargoItem } from '../cargo/cargo';
import type { Ping } from '../player/ping';
import { stowTender } from '../vessel/davit';
import type { DutiesState } from '../duties/duties';
import { createRescueState, type RescueState } from '../rescue/rescue';

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
  /** Items lost overboard or dropped in the sea. */
  lost?: number;
  /** "Look here" markers, one per player (player/ping.ts). */
  pings?: Record<EntityId, Ping>;
  /** Cargo runs, distress calls and the active rescue (rescue/rescue.ts). */
  rescue?: RescueState;
  /** The crew whiteboard's notes (board/board.ts). */
  board?: BoardState;
  /** The duty board's task list: game-generated duties (duties/duties.ts). */
  duties?: DutiesState;
  /** The last shipping forecast received by VHF (shown on the duty board; weather milestones). */
  forecast?: { text: string; receivedAt: string };
}

export function createWorld(
  ids: IdFactory,
  vesselDefId: string = CONFIG.testScene.vesselDefId,
  /** Also give the workboat her tender (the skiff, on the stern davit): the game does, tests may. */
  /** cold: the boat starts dark and cold, battery master off (the game; tests start warm). */
  opts: { tender?: boolean; cold?: boolean } = {},
): { world: WorldState; localPlayerId: EntityId; vesselId: EntityId } {
  const localPlayerId = ids.next('player');
  const vesselId = ids.next('vessel');
  const vessel = createVesselState(vesselId, vesselDefId);
  dropVessel(vessel);
  const tender = opts.tender ? createVesselState(ids.next('vessel'), 'skiff') : null;
  const player = createPlayerState(localPlayerId, 'Player 1');
  placeOnPlatform(player);
  const world: WorldState = {
    tick: 0,
    time: 0,
    environment: createEnvironment(),
    players: {
      [localPlayerId]: player,
    },
    vessels: { [vesselId]: vessel, ...(tender ? { [tender.id]: tender } : {}) },
    geography: 'archipelago',
    cargo: {},
    cargoSeq: 0,
    deliveries: 0,
    rescue: createRescueState(),
  };
  if (opts.cold && vessel.electrics) {
    vessel.electrics.master = 0;
    for (const k of Object.keys(vessel.electrics.breakers) as (keyof typeof vessel.electrics.breakers)[]) vessel.electrics.breakers[k] = 0;
  }
  // The tender starts hanging on the ship's stern davit.
  if (tender) stowTender(world, tender, vesselId);
  stockPorts(world);
  return { world, localPlayerId, vesselId };
}

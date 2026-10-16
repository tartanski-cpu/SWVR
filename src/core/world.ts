import type { BoardState } from '../board/board';
import { CONFIG } from '../config';
import { createEnvironment, type EnvironmentState } from '../environment/environmentState';
import type { PlayerState } from '../player/playerState';
import { createPlayerState } from '../player/playerState';
import { placeAshore } from '../player/playerControl';
import { dropVessel, placeVessel } from '../vessel/vesselControl';
import { BERTHS } from '../world/archipelago';
import { shoreSide } from '../vessel/physics/mooring';
import { createVesselState, type VesselState } from '../vessel/vesselState';
import { IdFactory, type EntityId } from './ids';
import { stockPorts, type CargoItem } from '../cargo/cargo';
import { stowTender } from '../vessel/tenderCrane';
import { createWeather, rebuildWaves, seaForWind } from '../environment/weather';
import type { Forecast } from '../environment/forecast';
import type { TrafficState } from '../traffic/traffic';
import type { DutiesState } from '../duties/duties';
import { createRescueState, type RescueState } from '../rescue/rescue';
import { createTowState, type TowState } from '../tow/tow';
import { createFireState, type FireState } from '../fire/fire';
import { createSalvageState, type SalvageState } from '../salvage/salvage';
import { createFishingState, type FishingState } from '../fishing/fishing';
import { createCareer, type CareerState } from '../career/career';
import type { PottingState } from '../potting/potting';

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
  /** Cargo runs, distress calls and the active rescue (rescue/rescue.ts). */
  rescue?: RescueState;
  /** The crew whiteboard's notes (board/board.ts). */
  board?: BoardState;
  /** The duty board's task list: game-generated duties (duties/duties.ts). */
  duties?: DutiesState;
  /** The last shipping forecast received by VHF (shown on the duty board; weather milestones). */
  forecast?: Forecast;
  /** Passing ships, floating debris (traffic/traffic.ts). */
  traffic?: TrafficState;
  /** Towing missions: the tow job and its towline (tow/tow.ts). */
  tow?: TowState;
  /** Fire missions: the fire job (fire/fire.ts). */
  fire?: FireState;
  /** Log salvage: logs washed up on beaches (salvage/salvage.ts). */
  salvage?: SalvageState;
  /** Lobster and crab potting: pots in the water (potting/potting.ts). Absent = off. */
  potting?: PottingState;
  /** Fishing: the trawl and the catch (fishing/fishing.ts). */
  fishing?: FishingState;
  /** The career: money, ledger, reputation, contracts, upgrades (career/career.ts). */
  career?: CareerState;
  /**
   * No new emergency calls (rescues, tows, fires) while set: the menu's Voyage tab,
   * "Emergency calls: Off" (owner request: a way to quieten the VHF). A call already
   * ringing still runs its course. Forecasts and harbour chatter carry on.
   */
  quietCalls?: boolean;
}

export function createWorld(
  ids: IdFactory,
  vesselDefId: string = CONFIG.testScene.vesselDefId,
  /** Also give the workboat her tender (the skiff, in her cradle on the foredeck): the game does, tests may. */
  /** cold: the boat starts dark and cold, battery master off (the game; tests start warm). */
  /** tows / fires: towing and fire calls come by themselves (the game). */
  /** harbour: she starts moored in Calder Haven and you on the quay (the game); else at sea at her spawn (tests). */
  opts: { tender?: boolean; cold?: boolean; weather?: boolean; tows?: boolean; fires?: boolean; logs?: boolean; harbour?: boolean } = {},
): { world: WorldState; localPlayerId: EntityId; vesselId: EntityId } {
  const localPlayerId = ids.next('player');
  const vesselId = ids.next('vessel');
  const vessel = createVesselState(vesselId, vesselDefId);
  if (opts.harbour) mooredAtStart(vessel);
  else dropVessel(vessel);
  const tender = opts.tender ? createVesselState(ids.next('vessel'), 'skiff') : null;
  const player = createPlayerState(localPlayerId, 'Player 1');
  placeAshore(player);
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
    // Towing missions: calls come by themselves in the game (tests raise them by intent).
    tow: createTowState(!!opts.tows),
    fire: createFireState(!!opts.fires),
    salvage: createSalvageState(!!opts.logs),
    fishing: createFishingState(),
    career: createCareer(),
  };
  // Dynamic weather (the game): starting preset, the sea matching its wind.
  if (opts.weather) {
    world.environment.weather = createWeather();
    world.environment.seaScale = seaForWind(world.environment.weather.now.wind);
    rebuildWaves(world.environment, 0);
  }
  if (opts.cold && vessel.electrics) {
    vessel.electrics.master = 0;
    for (const k of Object.keys(vessel.electrics.breakers) as (keyof typeof vessel.electrics.breakers)[]) vessel.electrics.breakers[k] = 0;
  }
  // The tender starts in her cradle on the ship's foredeck.
  if (tender) stowTender(world, tender, vesselId);
  stockPorts(world);
  return { world, localPlayerId, vesselId };
}

/**
 * The game's start: lying alongside her berth in Calder Haven (CONFIG.start), bow along the
 * berth, afloat at her waterline, her mooring lines already fast (moored).
 */
function mooredAtStart(v: VesselState): void {
  const b = BERTHS.find((x) => x.id === CONFIG.start.berthId);
  if (!b) return dropVessel(v);
  placeVessel(v, b.x, 0, b.z, b.headingDeg);
  v.mooring.phase = 'moored';
  v.mooring.berthId = b.id;
  v.mooring.reversed = false;
  v.mooring.t = 0;
  v.mooring.bow = v.mooring.stern = shoreSide(v, b);
}

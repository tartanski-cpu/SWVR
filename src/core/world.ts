import type { FuelState } from '../fuel/fuelHose';
import { gearOf } from '../boats/sims';
import type { BoardState } from '../board/board';
import { CONFIG } from '../config';
import { createEnvironment, type EnvironmentState } from '../environment/environmentState';
import type { PlayerState } from '../player/playerState';
import { createPlayerState } from '../player/playerState';
import { placeAshore } from '../player/playerControl';
import { dropVessel, placeVessel } from '../vessel/vesselControl';
import { BERTHS } from '../world/archipelago';
import { berthPose, shoreSide } from '../vessel/physics/mooring';
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
  /**
   * A crew-mate holding a camera player's camera in their hand (player/cameraHold.ts), by
   * the camera player's id: who, and which hand. The camera's view follows that hand.
   */
  cameraHolds?: Record<EntityId, { by: EntityId; hand: 'left' | 'right'; back?: boolean }>;
  vessels: Record<EntityId, VesselState>;
  /**
   * The players' own boat, the one the game gives them (modular boats M6b): the world's
   * systems (rescue, tows, fires, duties, the career...) work for her. Absent in a snapshot
   * from a host older than M6b (homeVessel() then falls back to the workboat).
   */
  homeVesselId?: EntityId;
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
  /** The fuel pumps' hoses: where each nozzle is (fuel/fuelHose.ts). Made when first used. */
  fuel?: FuelState;
  /** Fishing: the trawl and the catch (fishing/fishing.ts). */
  fishing?: FishingState;
  /** The career: money, ledger, reputation, contracts, upgrades (career/career.ts). */
  career?: CareerState;
  /**
   * How the home boat was built, so crew who join build her the same (net: the welcome):
   * her Shipyard code if she's a design, and the workboat's equipment she was fitted out
   * without (career upgrade ids, CareerUpgrade.fit). Absent: as her vessel type has it.
   */
  build?: {
    design?: string;
    without?: string[];
    /** The game's own version (commit and build time) on the host: crew on another reload (App.ts). */
    app?: string;
  };
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
  // Her tender only if she has a crane to carry it (the workboat; M7: not every boat does).
  const tender = opts.tender && gearOf({ defId: vesselDefId }, 'tenderCrane') ? createVesselState(ids.next('vessel'), 'skiff') : null;
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
    homeVesselId: vesselId,
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
  const at = berthPose(v, b);
  placeVessel(v, at.x, 0, at.z, at.headingDeg);
  v.mooring.phase = 'moored';
  v.mooring.berthId = b.id;
  v.mooring.reversed = false;
  v.mooring.t = 0;
  v.mooring.bow = v.mooring.stern = shoreSide(v, b);
}

/**
 * The players' own boat (WorldState.homeVesselId), or none. A world from a host older than
 * M6b has no home boat recorded: then the workboat, as the systems found it before.
 */
export function homeVessel(world: WorldState): VesselState | undefined {
  const v = world.homeVesselId ? world.vessels[world.homeVesselId] : undefined;
  return v ?? Object.values(world.vessels).find((x) => x.defId === 'workboat');
}

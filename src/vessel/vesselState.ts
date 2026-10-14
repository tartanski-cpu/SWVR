import type { EntityId } from '../core/ids';
import { CONFIG } from '../config';
import type { Quat, Vec3 } from '../core/math';
import { VESSEL_DEFS } from './vesselDef';

/** Control positions as set by players (via intents). */
export interface VesselControls {
  /** Combined throttle/gear lever, -1 (full astern) .. 0 (neutral) .. +1 (full ahead). */
  lever: number;
  /** Helm (wheel) position, -1 (hard to port) .. +1 (hard to starboard). */
  helm: number;
  /** Navigation lights switch, 0 off / 1 on. */
  navLights: number;
  /** Horn button, 0 released / 1 held. */
  horn: number;
  /** Anchor windlass switch: 1 = let go / pay out, 0 = heave in and stow. */
  anchor: number;
  /** Wheelhouse light switch, 0 off / 1 on. */
  cabinLight: number;
  /** Searchlight: switch (0/1), pan (deg, + to starboard) and tilt (deg, + up, 0 = horizontal). */
  spotlight: number;
  spotPan: number;
  spotTilt: number;
  /** Deck floodlights (foredeck, aft deck) and the rail LED strips, 0 off / 1 on. */
  deckFore: number;
  deckAft: number;
  railLights: number;
  /** FM radio: on (0/1) and the station (index into CONFIG.fmRadio.stations). */
  fmOn: number;
  fmStation: number;
}

/** Docking and mooring lines (physics/mooring.ts). */
export interface MooringState {
  /** free: under way; docking: lines out, warping in; moored: made fast alongside. */
  phase: 'free' | 'docking' | 'moored';
  /** Berth id while docking/moored, or the berth whose hot spot she is in (phase free). */
  berthId: string | null;
  /** Lying the berth's way (0) or the other way round (1), chosen when docking. */
  reversed: boolean;
  /** Seconds since DOCK was pressed (lines come taut over warpTime). */
  t: number;
}

/** Anchor and windlass (see physics/anchor.ts). */
export interface AnchorState {
  /**
   * stowed   - in the bow roller
   * paying   - let go: chain running out to the scope for the depth
   * set      - on the bottom with the chain out
   * weighing - windlass heaving in; the anchor breaks out when the chain is up-and-down
   * hanging  - off the bottom (too deep for the chain, or broken out while weighing)
   */
  phase: 'stowed' | 'paying' | 'set' | 'weighing' | 'hanging';
  /** Anchor position on the seabed (world x, z). */
  x: number;
  z: number;
  /** Chain paid out (m). */
  rodeM: number;
  /** Horizontal chain tension at the bow (N), last tick. */
  tension: number;
  /** Tension exceeds holding power: the anchor is ploughing through the bottom. */
  dragging: boolean;
}

/** Contact with seabed, shore or structures on the last tick. */
export interface ContactState {
  /** Total normal force (N). */
  force: number;
  /** Mean sliding speed over the touching points (m/s). */
  slide: number;
  /** Largest approach speed of a point that touched this tick (m/s): impacts. */
  impact: number;
}

/** Machinery state, advanced by the simulation. */
export interface EngineState {
  phase: 'off' | 'cranking' | 'running';
  /** Seconds spent cranking so far. */
  crank: number;
  /** Engine (crankshaft) speed. */
  rpm: number;
  /** Fuel rack position 0..1 as set by the governor (engine load). */
  rack: number;
  /** Engaged gear: -1 astern, 0 neutral, +1 ahead. */
  gear: -1 | 0 | 1;
  /** Seconds the lever has been asking for a different gear. */
  shift: number;
  /** Fuel in the tank (L). */
  fuelL: number;
  /** Current fuel flow (L/h), for displays and the trials report. */
  fuelFlowLph: number;
  /** Coolant (block) and lube oil temperatures (°C). */
  coolantC: number;
  oilC: number;
  /** Raw-water pump impeller failed: the heat exchanger barely works. */
  coolingFault: boolean;
}

/**
 * Serializable state of one vessel. Everything needed to reproduce its motion lives
 * here; everything static lives in its VesselDef (looked up by `defId`).
 */
export interface VesselState {
  id: EntityId;
  defId: string;
  /** World position of the vessel origin (centreline, amidships, DWL). */
  position: Vec3;
  /** Orientation, vessel -> world. */
  orientation: Quat;
  /** World-frame velocity of the centre of gravity (m/s). */
  linearVelocity: Vec3;
  /** World-frame angular velocity (rad/s). */
  angularVelocity: Vec3;
  controls: VesselControls;
  engine: EngineState;
  /** Actual rudder angle (rad), + = trailing edge to starboard (turns the bow to starboard). */
  rudder: number;
  /** Propeller thrust (N) on the last tick, for displays/audio. */
  thrust: number;
  anchor: AnchorState;
  mooring: MooringState;
  /** Taking fuel at a fuel berth. */
  refuelling: boolean;
  contact: ContactState;
  /**
   * Who has a hand on each grab control (multiplayer): channel -> player id. The first
   * hand keeps it until it lets go; other players' intents for it are ignored meanwhile.
   */
  holds: Record<string, EntityId>;
}

export function createVesselState(id: EntityId, defId: string): VesselState {
  return {
    id,
    defId,
    position: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    linearVelocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    controls: { lever: 0, helm: 0, navLights: 0, horn: 0, anchor: 0, cabinLight: 0, spotlight: 0, spotPan: 0, spotTilt: -4, deckFore: 0, deckAft: 0, railLights: 0, fmOn: 0, fmStation: 0 },
    engine: {
      phase: 'off',
      crank: 0,
      rpm: 0,
      rack: 0,
      gear: 0,
      shift: 0,
      fuelL: VESSEL_DEFS[defId].engine.fuel.startL,
      fuelFlowLph: 0,
      // A cold engine: everything at sea temperature.
      coolantC: CONFIG.environment.seaTempC,
      oilC: CONFIG.environment.seaTempC,
      coolingFault: false,
    },
    holds: {},
    rudder: 0,
    thrust: 0,
    anchor: { phase: 'stowed', x: 0, z: 0, rodeM: 0, tension: 0, dragging: false },
    mooring: { phase: 'free', berthId: null, reversed: false, t: 0 },
    refuelling: false,
    contact: { force: 0, slide: 0, impact: 0 },
  };
}

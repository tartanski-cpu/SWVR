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
  /**
   * Outboard boats: motor on (0/1) and gear (-1 reverse, 0 neutral, +1 forward). Their
   * `lever` is then the twist-grip throttle, 0..1, in that gear.
   */
  obOn: number;
  obGear: number;
  /** Diesel ignition: HEAT and START buttons, 1 while held (the key is in EngineState). */
  heat: number;
  start: number;
  /** Windscreen wipers switch (0/1) and the forepeak hatch (1 open / 0 closed). */
  wipers: number;
  hatch: number;
  /** Chart table lamp switch (0/1; Deck lights breaker). */
  chartLamp: number;
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
  /** Ignition key: 0 off / 1 on. Off stops a running engine (fuel solenoid). */
  key: number;
  /** Glow plug preheat accumulated (s); `preheatTime` is enough. */
  glow: number;
  /** Quick start: keep cranking without START held until she catches. */
  autoCrank?: boolean;
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
  /** Outboard boats: battery charge, 0 (flat) .. 1 (full). */
  battery?: number;
  /** A ship's tender: whose davit she belongs to and where she is (vessel/davit.ts). */
  tender?: TenderState;
  /** 12 V electrics, boats that have them (vessel/electrics.ts). */
  electrics?: ElectricsState;
  /** Water in the bilge, 0 (dry) .. 1 (full), boats with a hatch (vessel/bilge.ts). */
  bilge?: number;
}

/** Batteries, master switch and the last tick's readings (vessel/electrics.ts). */
export interface ElectricsState {
  /** Battery master switch, 0 off / 1 on. */
  master: number;
  /** Battery selector: 1, 2, or 3 = both in parallel. */
  selector: number;
  /** State of charge of battery 1 and 2, 0 (flat) .. 1 (full). */
  soc: [number, number];
  /** Bus voltage and net battery current (A, + = discharging) on the last tick. */
  volts: number;
  amps: number;
  /** Breakers on the panel by the helm, 0 off / 1 on (see BREAKERS in electrics.ts). */
  breakers: Record<BreakerName, number>;
}

/** The breakers, in panel order. */
export const BREAKERS = ['instruments', 'chart', 'radio', 'navLights', 'deckLights', 'bilge'] as const;
export type BreakerName = (typeof BREAKERS)[number];

/**
 * A tender and her mother ship's davit.
 *   free     - afloat, her own physics
 *   stowed   - hanging on the davit, riding the ship (kinematic), charging
 *   lowering - on the falls, going down; let go at the water (`t` seconds in)
 *   hoisting - hooked on: lined up under the davit from `from`, then hoisted
 */
export interface TenderState {
  hostId: EntityId;
  phase: 'free' | 'stowed' | 'lowering' | 'hoisting';
  t: number;
  /** Hoisting: her pose in the ship's axes when she was hooked on (x, y, z, yaw rad). */
  from?: [number, number, number, number];
}

export function createVesselState(id: EntityId, defId: string): VesselState {
  return {
    id,
    defId,
    position: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    linearVelocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    controls: { lever: 0, helm: 0, navLights: 0, horn: 0, anchor: 0, cabinLight: 0, spotlight: 0, spotPan: 0, spotTilt: -4, deckFore: 0, deckAft: 0, railLights: 0, fmOn: 0, fmStation: 0, obOn: 0, obGear: 0, heat: 0, start: 0, wipers: 0, chartLamp: 0, hatch: VESSEL_DEFS[defId].hatch?.startOpen ? 1 : 0 },
    engine: {
      phase: 'off',
      crank: 0,
      rpm: 0,
      rack: 0,
      gear: 0,
      shift: 0,
      fuelL: VESSEL_DEFS[defId].engine?.fuel.startL ?? 0,
      fuelFlowLph: 0,
      // A cold engine: everything at sea temperature.
      coolantC: CONFIG.environment.seaTempC,
      oilC: CONFIG.environment.seaTempC,
      coolingFault: false,
      key: 0,
      glow: 0,
    },
    holds: {},
    rudder: 0,
    thrust: 0,
    anchor: { phase: 'stowed', x: 0, z: 0, rodeM: 0, tension: 0, dragging: false },
    mooring: { phase: 'free', berthId: null, reversed: false, t: 0 },
    refuelling: false,
    contact: { force: 0, slide: 0, impact: 0 },
    ...(VESSEL_DEFS[defId].outboard ? { battery: 1 } : {}),
    ...(VESSEL_DEFS[defId].bilge ? { bilge: 0 } : {}),
    // Warm by default (tests, trials): master on, both batteries full. The game itself
    // starts cold and dark (createWorld `cold`).
    ...(VESSEL_DEFS[defId].electrics
      ? { electrics: { master: 1, selector: 1, soc: [1, 1] as [number, number], volts: 12.7, amps: 0, breakers: { instruments: 1, chart: 1, radio: 1, navLights: 1, deckLights: 1, bilge: 1 } } }
      : {}),
  };
}

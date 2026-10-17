import type { ModuleStateEnvelope } from '../modular/module';
import type { EntityId } from '../core/ids';
import { CONFIG } from '../config';
import type { Quat, Vec3 } from '../core/math';
import { freshModuleStates, gearOf } from '../boats/sims';

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
  /** Windscreen wipers switch (0/1). */
  wipers: number;
  /** Chart table lamp switch (0/1; Deck lights breaker). */
  chartLamp: number;
  /** Fenders out over the side (1) or stowed (0). */
  fenders: number;
  /** Wheelhouse aft door open (1) or shut (0); it starts open. */
  door: number;
  /** The port side door (wheelhouse.sideDoor): 1 open. Absent (older saves, snapshots) = shut. */
  sideDoor?: number;
  /** The gate in the working-deck bulwark (layout.sideGate): 1 open. Absent = shut. */
  sideGate?: number;
  /** The bow ramp (layout.bowRamp, the landing craft's): 1 lowered. Absent = raised. */
  bowRamp?: number;
  /** The engine hatch in the wheelhouse floor open (1) or shut (0). */
  engineHatch?: number;
  /** The chart table's drop leaf unfolded (1, or unset) or folded against the wall (0). */
  chartLeaf?: number;
  /** Fire monitor on the roof: pump on (0/1), and its pan (deg, + to starboard) and elevation (deg). */
  firePump: number;
  monPan: number;
  monTilt: number;
  /** Trawl: shoot (1) / haul (0) the net (fishing/fishing.ts). */
  trawl: number;
  /**
   * Hold-to-run winch buttons (1 while held): the tow winch by the towing post (heave in /
   * pay out the towline), and the trawl net's on the A-frame (pay out / haul).
   */
  winchHeave?: number;
  winchPayOut?: number;
  /**
   * The deck crane's controls (modules/deckCrane): the slew and boom angles its joystick
   * asks for (deg; the crane follows at its own rates), and its hold-to-run HOIST UP / DOWN
   * and HOOK buttons (1 while held). Unset until a boat has a crane.
   */
  craneSlew?: number;
  craneLuff?: number;
  craneHoistUp?: number;
  craneHoistDown?: number;
  craneHook?: number;
  netOut?: number;
  netIn?: number;
}

/** Docking and mooring lines (physics/mooring.ts). */
export interface MooringState {
  /** free: under way; docking: lines out, warping in; moored: made fast alongside. */
  phase: 'free' | 'docking' | 'moored';
  /** Berth id while docking/moored, or the berth whose hot spot she is in (phase free). */
  berthId: string | null;
  /** Lying the berth's way (0) or the other way round (1), chosen when docking. */
  reversed: boolean;
  /** Seconds since the first line went ashore (lines come taut over warpTime). */
  t: number;
  /**
   * The bow line and the stern line: 0 not fast, else the side of the cleat it's made fast
   * on (-1 port, +1 starboard). Each end is made fast or cast off on its own, at a cleat.
   */
  bow?: number;
  stern?: number;
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
  /** Glow plug preheat accumulated (s); `preheatNeeded()` (physics/propulsion.ts) is enough. */
  glow: number;
  /** Quick start: keep cranking without START held until she catches. */
  autoCrank?: boolean;
  /** Lube oil in the sump, 0..1, and running time since the last dipstick check (s). */
  oil?: number;
  sinceCheck?: number;
  /** Engine wear, 0 (as new) .. 1, from running hot or dry; costs power (vessel/wear.ts). */
  wear?: number;
  /** How much of the propeller disc is under water, 0..1, this tick (the rudder reads it). */
  immersion?: number;
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
  /**
   * The fire extinguisher on its wheelhouse bracket (player/handGear.ts, fire/extinguisher.ts):
   * charge left, 0..1. Absent = full.
   */
  extCharge?: number;
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
  /** A ship's tender: whose crane she belongs to and where she is (vessel/tenderCrane.ts). */
  tender?: TenderState;
  /** 12 V electrics, boats that have them (vessel/electrics.ts). */
  electrics?: ElectricsState;
  /**
   * Modules with state of their own (modular boats; the first: the deck crane), by their
   * path on her ('deckCrane'): plain JSON, so it is sent to crew and saved like the rest.
   */
  modules?: Record<string, ModuleStateEnvelope>;
  /** Water in the bilge, 0 (dry) .. 1 (full), boats with a bilge pump (vessel/bilge.ts). */
  bilge?: number;
  /** Hull damage, 0 (sound) .. 1: it leaks into the bilge (vessel/wear.ts). */
  damage?: number;
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
export const BREAKERS = ['instruments', 'chart', 'radio', 'navLights', 'deckLights', 'bilge', 'hydraulics'] as const;
export type BreakerName = (typeof BREAKERS)[number];

/**
 * A tender and her mother ship's crane.
 *   free     - afloat, her own physics
 *   stowed   - in the cradle on the foredeck, riding the ship (kinematic), charging
 *   lowering - on the falls, going down; let go at the water (`t` seconds in)
 *   hoisting - hooked on: lined up under the hook from `from`, then hoisted in
 */
export interface TenderState {
  hostId: EntityId;
  phase: 'free' | 'stowed' | 'lowering' | 'hoisting';
  t: number;
  /** Hoisting: her pose in the ship's axes when she was hooked on (x, y, z, yaw rad). */
  from?: [number, number, number, number];
  /**
   * The painter (her bow line to the ship), while it's fast: which of the ship's cleats it's
   * on (vessel/physics/painter.ts cleatLocal order) and its length (m) from her bow cleat.
   */
  painter?: { cleat: number; length: number };
}

export function createVesselState(id: EntityId, defId: string): VesselState {
  // What she carries decides what state she has (modular boats M6b: her modules' gear).
  const v = { defId };
  const diesel = gearOf(v, 'diesel');
  return {
    id,
    defId,
    position: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    linearVelocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    controls: { lever: 0, helm: 0, navLights: 0, horn: 0, anchor: 0, cabinLight: 0, spotlight: 0, spotPan: 0, spotTilt: -4, deckFore: 0, deckAft: 0, railLights: 0, fmOn: 0, fmStation: 0, obOn: 0, obGear: 0, heat: 0, start: 0, wipers: 0, chartLamp: 0, fenders: 0, door: 1, firePump: 0, monPan: 0, monTilt: 20, trawl: 0 },
    engine: {
      phase: 'off',
      crank: 0,
      rpm: 0,
      rack: 0,
      gear: 0,
      shift: 0,
      fuelL: diesel?.engine.fuel.startL ?? 0,
      fuelFlowLph: 0,
      // A cold engine: everything at sea temperature.
      coolantC: CONFIG.environment.seaTempC,
      oilC: CONFIG.environment.seaTempC,
      coolingFault: false,
      key: 0,
      glow: 0,
      ...(diesel ? { oil: diesel.maintenance.oilStart, sinceCheck: 0, wear: 0 } : {}),
    },
    holds: {},
    rudder: 0,
    thrust: 0,
    anchor: { phase: 'stowed', x: 0, z: 0, rodeM: 0, tension: 0, dragging: false },
    mooring: { phase: 'free', berthId: null, reversed: false, t: 0, bow: 0, stern: 0 },
    refuelling: false,
    contact: { force: 0, slide: 0, impact: 0 },
    ...(gearOf(v, 'outboard') ? { battery: 1 } : {}),
    ...(gearOf(v, 'bilgePump') ? { bilge: 0, damage: 0 } : {}),
    // Warm by default (tests, trials): master on, both batteries full. The game itself
    // starts cold and dark (createWorld `cold`).
    ...(gearOf(v, 'batteries')
      ? { electrics: { master: 1, selector: 1, soc: [1, 1] as [number, number], volts: 12.7, amps: 0, breakers: { instruments: 1, chart: 1, radio: 1, navLights: 1, deckLights: 1, bilge: 1, hydraulics: 1 } } }
      : {}),
    // Her modules' own state (the deck crane), if any keep theirs here.
    ...(freshModuleStates(defId) ? { modules: freshModuleStates(defId) } : {}),
  };
}

import type { ModuleStateEnvelope } from '../modular/module';
import type { EntityId } from '../core/ids';
import { CONFIG } from '../config';
import type { Quat, Vec3 } from '../core/math';
import { freshModuleStates, gearOf, hasPullDownBoard } from '../boats/sims';
import { vesselBuildToken } from './vesselDef';

/** Control positions as set by players (via intents). */
export interface VesselControls {
  /** Combined throttle/gear lever, -1 (full astern) .. 0 (neutral) .. +1 (full ahead). */
  lever: number;
  /**
   * Twin engines worked separately (the twin lever control; owner, Oct 2026): the starboard
   * engine's lever, as `lever`. `lever` is then the port engine's. Unset: it follows `lever`.
   */
  lever2?: number;
  /**
   * Azimuth drives (modules/dieselInboard `azimuth`, the harbour tug's; owner, Oct 2026): the
   * way each drive's lever points, the direction it asks its drive to push (deg, 0 ahead, + to
   * starboard, round to +-180 astern); `lever` and `lever2` are then each drive's power (0..1).
   * TRANSIT (1): the wheel swings both drives together instead, as rudders. Unset on other boats.
   */
  aziAngle?: number;
  aziAngle2?: number;
  aziTransit?: number;
  /** Azimuth drives: the two throttles synchronised (1): either lever's power sets both (vessel/vesselControl.ts). */
  aziSync?: number;
  /**
   * Hydrofoils (vessel/physics/foils.ts; owner, Oct 2026: the foiling ferry's helm): FOIL (1,
   * or unset) her flight computer flies her on her foils at speed; HULL (0) it keeps her down
   * on her hulls (switched while flying, she comes down gently).
   */
  foilMode?: number;
  /** Her ride height: 0 low, 1 normal (or unset), 2 high (CONFIG.foils.rideSteps). */
  foilRide?: number;
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
  /** The pull-down whiteboard (under a cabin roof): 1 pulled down, 0 / absent rolled up. */
  boardDown?: number;
  /** The autopilot (vessel/autopilot.ts; the helm assist panel): 1 engaged, holding `autopilotHeading` (deg); `autopilotHelm` the wheel as it last set it. */
  autopilot?: number;
  autopilotHeading?: number;
  autopilotHelm?: number;
  /**
   * Outboard boats: motor on (0/1) and gear (-1 reverse, 0 neutral, +1 forward). Their
   * `lever` is then the twist-grip throttle, 0..1, in that gear.
   */
  obOn: number;
  obGear: number;
  /** Diesel ignition: HEAT and START buttons, 1 while held (the key is in EngineState). */
  heat: number;
  start: number;
  /** Twin engines worked separately: the starboard engine's START, 1 while held (`start` is then the port engine's). */
  start2?: number;
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
  /** The head's door (a Shipyard boat's furniture, P5) open (1) or shut (0, or unset). */
  headDoor?: number;
  /** A fish hold's hatch lid (modules/fishHold) open (1) or shut (0, or unset). */
  holdHatch?: number;
  /** The fish hold's LIFT button pressed (1 until the hold's tick has lifted a box out: fishing/fishHold.ts). */
  holdLift?: number;
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
   * The deck crane's controls (modules/deckCrane): what its two joysticks ask for, the slew
   * and boom angles (deg), the telescope run out and the wire paid out (m; the crane follows
   * each at its own rate), and its HOOK button (1 while held). Unset until a boat has a crane.
   */
  craneSlew?: number;
  craneLuff?: number;
  craneExtend?: number;
  craneWire?: number;
  craneHook?: number;
  netOut?: number;
  netIn?: number;
  /**
   * The dive A-frame's hold-to-run buttons (modules/diveFrame), 1 while held: FRAME OUT / IN
   * and WINCH UP / DOWN. Unset on a boat without one.
   */
  diveOut?: number;
  diveIn?: number;
  diveUp?: number;
  diveDown?: number;
  /** RELEASE on the A-frame's box pressed (1 until the fishing tick has emptied the codend: fishing.ts clears it). */
  netRelease?: number;
  /**
   * Pod drives' joystick (modules/pods): vector mode on (1) or off (0 / unset), and the stick:
   * `joyX` to starboard, `joyY` ahead, `joyR` twisted clockwise (bow to starboard), each -1..1
   * (0 when let go: it springs back).
   */
  joyMode?: number;
  /** The chartplotter's zoom (nav/chartPlotter.ts): 0 AUTO, k the k-th of CONFIG.chartPlotter.ranges. One for the boat: the crew see what the helmsman set. */
  chartZoom?: number;
  /** Each advanced touchscreen's page (controls/instruments.ts `touchScreen`; CS5): the index of its tab. One for the boat, as the chartplotter's zoom: the crew see the page whoever pressed it chose. */
  touchPage1?: number;
  touchPage2?: number;
  joyX?: number;
  joyY?: number;
  joyR?: number;
}

/**
 * A bow-ramp boat on a slipway (world/slipway.ts): drawn up onto it ('landing', over `dur`
 * s from where she was), then held there ('landed': no waves, no drift). `flapDeg`: her
 * ramp's toe flaps' angle below the horizontal, resting on the slip.
 */
export interface SlipState {
  id: string;
  phase: 'landing' | 'landed';
  t: number;
  dur: number;
  from: { position: Vec3; orientation: Quat };
  to: { position: Vec3; orientation: Quat };
  flapDeg: number;
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
  /**
   * The same for her guards (fenders out, a rubbing strake, tyres, a push fender): the force
   * they take and how fast they slide along a quay. Rubbing on a guard isn't hull damage
   * (wear.ts), except a little in a storm. Absent on older states.
   */
  guardForce?: number;
  guardSlide?: number;
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
  /** Her tank's size when it isn't her design's (L): the boatyard's bigger tank (career.ts). */
  tankL?: number;
  /** Current fuel flow (L/h), for displays and the trials report. */
  fuelFlowLph: number;
  /** Electric motors (physics/electricMotor.ts): the power they draw from her battery (kW; - while they give some back). */
  powerKw?: number;
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
  /** Quick start of twin engines worked separately: the starboard engine waits for the port one to catch, then cranks (two starters at once pull the battery down too far to turn either). */
  queued?: boolean;
  /** Lube oil in the sump, 0..1, and running time since the last dipstick check (s). */
  oil?: number;
  sinceCheck?: number;
  /** Engine wear, 0 (as new) .. 1, from running hot or dry; costs power (vessel/wear.ts). */
  wear?: number;
  /** How much of the propeller disc is under water, 0..1, this tick (the rudder reads it). */
  immersion?: number;
  /**
   * Twin engines worked separately (owner, Oct 2026: a twin lever control, a START for each):
   * the starboard engine, running on its own (its revs, gear, governor, start-up). This one is
   * then the port engine. Its key, oil, wear and coolant are the port engine's, mirrored each
   * tick (one key, one dipstick and set of lamps for both: modules/dieselInboard).
   */
  stbd?: EngineState;
  /**
   * Azimuth drives (modules/dieselInboard `azimuth`): where this engine's drive points, the way
   * it pushes (rad, 0 ahead, + to starboard, +-pi astern). Unset on other boats.
   */
  azimuth?: number;
}

/**
 * Serializable state of one vessel. Everything needed to reproduce its motion lives
 * here; everything static lives in its VesselDef (looked up by `defId`).
 */
export interface VesselState {
  id: EntityId;
  defId: string;
  /**
   * What's in her fish hold (a Shipyard boat's, modules/fishHold), box by box in the order
   * they went down: each one's species ('' if it isn't named). Absent: none in it (or no hold).
   */
  hold?: { boxes: string[] };
  /**
   * A foiling boat's flight, as of the last tick (vessel/physics/foils.ts), for her helm's
   * display and sound (in her state, so a crew's game sees it too): how far her flight
   * computer is in charge (0..1), each foil panel's flap (deg), how far her hulls are out of
   * the water (0..1). Absent on other boats.
   */
  foil?: { engaged: number; flaps: number[]; clear: number };
  /** Her trawl's warps out (0..1) and its net on its drum (0..1): what the trawl winches and net drum show (fishing.ts). Absent: in, and all on the drum. */
  trawlGear?: { warp: number; net: number };
  /** How far her A-frame has swung inboard on its rams (0 raked aft over the stern, 1 in over the deck; fishing/codend.ts). Absent: 0. */
  aFrameLuff?: number;
  /**
   * The design token her type was built from (multi-boat M1: a `boat:` type, boats/library.ts):
   * travels with her in every snapshot, so any page can build her type. Unset on the fixed types.
   */
  build?: string;
  /** The player she belongs to (multi-boat M3: launched by them, core/launch.ts); unset on the game's own boats. */
  owner?: EntityId;
  /** Her owner's browser tab (PlayerState.clientId): a rejoin from it gets her back, whatever player number it's given. */
  ownerClient?: string;
  /** Her owner gone from the game since (world time, s): she waits CONFIG.net.crewBoatGraceS for them (core/launch.ts). */
  ownerAwayAt?: number;
  /** How closely she's simulated this tick (multi-boat M4, core/lod.ts): by her distance to the nearest player. Set by the host. */
  lod?: 'near' | 'mid' | 'far';
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
  /** The rod's catch in the bucket (fishing/rod.ts): fish, their weight (kg), the last one's species. Sold when she's tied up at a port. */
  rodCatch?: { count: number; kg: number; last?: string };
  /** Taking fuel at a fuel berth. */
  refuelling: boolean;
  contact: ContactState;
  /**
   * Who has a hand on each grab control (multiplayer): channel -> player id. The first
   * hand keeps it until it lets go; other players' intents for it are ignored meanwhile.
   */
  holds: Record<string, EntityId>;
  /** Outboard boats and electric pod motors (modules/pods `electric`): battery charge, 0 (flat) .. 1 (full). */
  battery?: number;
  /**
   * Solar panels (modules/solarRoof, the solar catamaran's): the sunlight now (GHI, W/m2), what
   * her panels make (kW, after their controller) and what goes into her battery (kW).
   */
  solar?: { wm2: number; panelKw: number; chargeKw: number };
  /** Plugged in at a quay charger (vessel/shorePower.ts): its rating and what goes into her battery now (kW), and the energy taken from it (kWh, to be billed). */
  shore?: { ratedKw: number; chargeKw: number; kWh: number; /** By the menu's Refuel at a fuel berth (no cable). */ menu?: boolean };
  /** A ship's tender: whose crane she belongs to and where she is (vessel/tenderCrane.ts). */
  tender?: TenderState;
  /** Landing on (or landed on) a slipway, her bow ramp down on it (world/slipway.ts). Absent: not. */
  slip?: SlipState;
  /** 12 V electrics, boats that have them (vessel/electrics.ts). */
  electrics?: ElectricsState;
  /** The harbour tug's engine room machinery, for her start-up from dead ship (plant/plant.ts). Absent: other boats. */
  plant?: PlantState;
  /**
   * Modules with state of their own (modular boats; the first: the deck crane), by their
   * path on her ('deckCrane'): plain JSON, so it is sent to crew and saved like the rest.
   */
  modules?: Record<string, ModuleStateEnvelope>;
  /**
   * The towline's gauge (owner, Oct 2026; tow/tow.ts towlineForces, the TOW LINE screen): on
   * the towing boat while she has a line fast or has just lost one. `tension` (N); `load`, how
   * near it is to parting, 0 .. 1 (the nearer of its tension to its breaking force and its
   * stretch to the most it takes); `peak`, the highest load lately (held CONFIG.tow.gauge.peakHoldS
   * from `peakAt`, world time s); `parted`, it parted lately (CONFIG.tow.gauge.partedShowS
   * after `partedAt`).
   */
  towLine?: { fast: boolean; tension: number; load: number; peak: number; peakAt: number; parted?: boolean; partedAt?: number };
  /** Pod drives (modules/pods): each pod's own heading (rad, port pod first; the pods' swing convention), apart in joystick mode. */
  pods?: { angles: number[] };
  /** Water in the bilge, 0 (dry) .. 1 (full), boats with a bilge pump (vessel/bilge.ts). */
  bilge?: number;
  /** Hull damage, 0 (sound) .. 1: it leaks into the bilge (vessel/wear.ts). */
  damage?: number;
  /** World time until which knocks do her no damage: she's just come into the world, or been sent to a port (core/simulation.ts, CONFIG.wear.spawnGraceS). */
  settleUntil?: number;
  /** The roving fender hung over the side by a deckhand (vessel/walkFender.ts); null or unset: none. */
  walkFender?: { side: -1 | 1; z: number; by?: string } | null;
}

/**
 * The harbour tug's engine room machinery (plant/plant.ts): what's open, running and switched,
 * port engine first in the pairs. Her 24 V battery master is `electrics.master`.
 */
export interface PlantState {
  /** The generator's fuel valve open; the generator off, running up, or running (s since its START). */
  genFuel: number;
  gen: 'off' | 'starting' | 'running';
  genT: number;
  /** The generator's breaker on the main switchboard closed (the switchboard live). */
  genBreaker: number;
  /** The fuel supply pump switched on; each engine's day tank valve open; each engine's sea suction open. */
  fuelPump: number;
  dayValve: [number, number];
  sea: [number, number];
  /** Each engine's pre-lube pump switched on, and its lube oil pressure (bar). */
  prelube: [number, number];
  lubeBar: [number, number];
  /** The air compressor switched on, the starting air (bar), the main air valve to the engines open. */
  compressor: number;
  airBar: number;
  airValve: number;
  /** Where the engines are worked from: 0 local (the engine-side panels), 1 the control room, 2 the bridge. */
  place: number;
  /** Seconds each engine and the generator have run with their fuel shut. */
  starve: [number, number];
  genStarve: number;
  /** Each engine counted as started this crank (its starting air taken). */
  cranked: [number, number];
  /** The plant set the cooling fault (sea suction shut), so it clears it when opened. */
  seaFault?: boolean;
  /** The last thing that stopped or blocked her, said to whoever's aboard, and a count that goes up with each (so the same one again is said again). */
  note?: string;
  noteN?: number;
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
  /**
   * Which of her ship's tender cranes carries her (boats/sims.ts tenderCranesOf, recipe
   * order): absent, the first; 1, the second (owner, 28 Oct 2026: the skiff and the rescue
   * boat on one ship, each on her own crane).
   */
  crane?: number;
  phase: 'free' | 'stowed' | 'lowering' | 'hoisting';
  t: number;
  /** Hoisting: her pose in the ship's axes when she was hooked on (x, y, z, yaw rad). */
  from?: [number, number, number, number];
  /**
   * The painter (her bow line to the ship), while it's fast: which of the ship's cleats it's
   * on (vessel/physics/painter.ts cleatLocal order) and its length (m) from her bow cleat.
   */
  painter?: { cleat: number; length: number };
  /** Her stern line to the ship, the same way (from her stern cleat), while it's fast. */
  sternPainter?: { cleat: number; length: number };
}

export function createVesselState(id: EntityId, defId: string): VesselState {
  // What she carries decides what state she has (modular boats M6b: her modules' gear).
  const v = { defId };
  const diesel = gearOf(v, 'diesel');
  const build = vesselBuildToken(defId);
  return {
    id,
    defId,
    ...(build ? { build } : {}),
    position: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    linearVelocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    controls: { lever: 0, helm: 0, navLights: 0, horn: 0, anchor: 0, cabinLight: 0, spotlight: 0, spotPan: 0, spotTilt: -4, deckFore: 0, deckAft: 0, railLights: 0, fmOn: 0, fmStation: 0, obOn: 0, obGear: 0, heat: 0, start: 0, wipers: 0, chartLamp: 0, fenders: 0, door: 1, firePump: 0, monPan: 0, monTilt: 20, trawl: 0, ...(hasPullDownBoard(defId) ? { boardDown: 0 } : {}) },
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
    // (Her battery's charge: an electric outboard's, or electric pod motors'.)
    ...(gearOf(v, 'outboard') || gearOf(v, 'diesel')?.electric ? { battery: 1 } : {}),
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

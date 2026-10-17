/**
 * Contract: MODULES (docs/MODULAR_BOATS.md 3.3).
 *
 * A module is a self-contained part of a boat: a throttle lever, a rev counter, a breaker
 * panel, the engine, a battery bank, the crane. It owns its geometry, its state, its logic
 * and its controls, and it never refers to another module: it reads and writes the bus
 * through named PORTS, and that's all.
 *
 * One definition, two halves (2.1):
 *   sim   host only, runs headless (tests, sea trials, a multiplayer host). Plain functions
 *         over plain JSON state kept in VesselState.modules[socketPath], so it is saved and
 *         sent to the crew like everything else in the world. No Three.js scenes.
 *   view  every machine (host and crew): meshes and controls, built once, updated each
 *         frame from the bus. A crew machine never runs the sim half.
 * A module may have only one half: a switch has no sim; a fuel tank has no view.
 *
 * Everything tunable comes from the module's config (`defaults`), which a recipe overrides
 * per boat: lever travel, gauge range, crane speeds.
 */
import type * as THREE from 'three';
import type { Control } from '../controls/Control';
import type { Screen } from '../controls/instruments';
import type { BreakerName, VesselState } from '../vessel/vesselState';
import type { CONFIG } from '../config';
import type { TenderCrane } from '../vessel/tenderCrane';
import type { BusReader, BusValue } from './bus';
import type { BusKey } from './busKeys';
import type { Physical, Socket, SocketType } from './socket';

export interface ModuleDefinition<Config = unknown, State = unknown> {
  /** Stable forever: 'control.throttle-lever'. Renaming one = adding an alias. */
  id: string;
  aliases?: readonly string[];
  /** Bump when State changes in a way old saves can't read; migrate() brings them forward. */
  version: number;
  /** Socket types it can go on. */
  fits: readonly SocketType[];
  /** Socket tags it needs ('inboard'). */
  needsTags?: readonly string[];
  /** Default config. A recipe's `config` is laid over it (shallow: whole top-level fields). */
  defaults: Config;
  /** Problems with a config, in plain words (empty: fine). */
  validateConfig?(c: Config): string[];
  /** Its connections to the bus, each with a default key; a recipe may rebind them (2.4). */
  ports: Readonly<Record<string, PortSpec>>;
  /** Power, circuits, fuel it can't work without (the recipe check looks for a provider). */
  needs?(c: Config): Requirement[];
  /** What it gives the boat (a circuit, hydraulic pressure, fuel). */
  provides?(c: Config): Provision[];
  /**
   * Its gear's facts for the world's systems (M5), for each `{ gear }` it provides. `at`
   * takes a point in its own axes to the boat's (for gear placed by its socket).
   */
  gear?(c: Config, hull: HullQueries, at: (local: readonly [number, number, number]) => [number, number, number]): Partial<GearFacts>;
  /** Mass, CG, size, power: checked against the socket, added to the boat's mass (2.6). */
  physical?(c: Config): Physical;
  /** Its part in the energy network (2.5). */
  power?(c: Config): PowerRole[];
  /**
   * Where it stands solid on the boat, for walking and cargo (M5b): fixed boxes and discs in
   * the boat's axes, worked out from its config and the hull (deck gear draws in the boat's
   * axes too). Read by the simulation as well as the view (cargo placement is simulated).
   * What moves with the bus (a table's leaf) is the view's `footprints` instead.
   */
  footprints?(c: Config, hull: HullQueries): GearFootprint[];
  /** Sockets it offers its own children (a console's slots, a mast's light). */
  sockets?(c: Config): Socket[];
  sim?: ModuleSim<Config, State>;
  view?: ModuleView<Config, State>;
  /** Bring a saved state from an older version up to date. */
  migrate?(old: unknown, fromVersion: number): State;
}

/** One connection to the bus. */
export interface PortSpec {
  dir: 'read' | 'write';
  /**
   * Default key: the generic one ('propulsion.rpm'). A recipe's `bind` may change it.
   * None: the recipe must bind it (a generic switch: which key it throws is the boat's call).
   */
  key?: BusKey;
  /** Read ports: false = may go unconnected (a lamp with nothing to show stays dark). Default true. */
  required?: boolean;
}

/**
 * Deck gear a boat has (modular boats M5): what the world's systems ask a boat for, rather
 * than reading her vessel config. A boat tows if she has a tow point and a winch; fishes if
 * she has a trawl gantry and a trawl; carries a tender if she has a tender crane.
 */
export type GearKind =
  | 'tenderCrane'
  | 'towWinch'
  | 'towPoint'
  | 'trawlGantry'
  | 'trawl'
  | 'anchor'
  // M5b
  | 'searchlight'
  | 'fireMonitor'
  | 'bowCleat'
  | 'sternCleat'
  | 'fenders'
  | 'swimLadder'
  | 'lifeRing'
  | 'boatHook'
  // M6b: the machinery and fittings the vessel definition used to carry
  | 'midCleat'
  | 'diesel'
  | 'rudder'
  | 'outboard'
  | 'batteries'
  | 'bilgePump'
  | 'chartTable';

/** What the world's systems need to know about each kind of gear (the boat's axes, m). */
export interface GearFacts {
  /** Where the towline leaves her: the top of the stern roller. */
  towPoint: { point: [number, number, number] };
  /** Where the wire comes off the winch drum. */
  towWinch: { lead: [number, number, number] };
  /** The A-frame: the starboard foot (port is -x) and head, the blocks' x, the brace feet, the control box height. */
  trawlGantry: { x: number; footZ: number; deck: number; headZ: number; top: number; blockX: number; braceZ: number; buttonY: number };
  trawl: Record<string, never>;
  /** The crane's geometry and its launch and recovery path (vessel/tenderCrane.ts). */
  tenderCrane: TenderCrane;
  /** The hawse (where the chain leaves her) and how much chain there is. */
  anchor: { hawse: [number, number, number]; chainM: number };
  /** The searchlight: where it stands, its aim limits, its light (the controls clamp to the limits). */
  searchlight: typeof CONFIG.vessels.workboat.spotlight;
  /** The fire monitor: the nozzle's pivot, its aim limits, the water's speed and drift (fire/fire.ts shoots the jet from it). */
  fireMonitor: typeof CONFIG.vessels.workboat.fireMonitor;
  /** A cleat the mooring lines are made fast to, forward (bow line) or aft (stern line): its station (z) and the line's height on her. */
  bowCleat: { z: number; lineY: number };
  sternCleat: { z: number; lineY: number };
  fenders: Record<string, never>;
  /** The swim ladder: its outboard line (x, z), foot and head heights, where you step aboard (deckX), the desktop's jump range, its width. */
  swimLadder: { x: number; z: number; bottom: number; top: number; deckX: number; range: number; width: number };
  /** The life ring: where it hangs stowed, and the cleat its line is made fast to. */
  lifeRing: { stow: [number, number, number]; cleat: [number, number, number] };
  /** The boat hook: in its clips at (x, y), from z0 to z1. */
  boatHook: { stow: [number, number, number, number] };
  /** A midship cleat (the skiff's painter): its station and the line's height. */
  midCleat: { z: number; lineY: number };
  /** The inboard diesel: the engine, its propeller, and its upkeep (oil, and where the engine and its dipstick are). */
  diesel: { engine: Workboat['engine']; propeller: Workboat['propeller']; maintenance: Workboat['maintenance'] };
  /** The rudder and its steering gear. */
  rudder: Workboat['rudder'];
  /** An electric outboard: motor, battery and tiller. */
  outboard: typeof CONFIG.vessels.skiff.outboard;
  /** The house batteries: each one's capacity, voltages, internal resistance, and the charge below which it's flat. */
  batteries: { ah: number; restVolts: readonly [number, number]; internalOhm: number; chargeVolts: number; cutoffSoc: number };
  /** The bilge pump: how fast it empties the bilge, and the level that lights the BILGE lamp. */
  bilgePump: { pumpRate: number; alarmAt: number };
  /** The chart table: its plan on the wheelhouse floor (the boat's axes) and its height. */
  chartTable: { x0: number; x1: number; z0: number; z1: number; height: number };
}

type Workboat = typeof CONFIG.vessels.workboat;

/** Something a module can't work without. */
export type Requirement =
  | { power: 'electrical'; circuit?: string } // 12 V, on that breaker's circuit
  | { power: 'hydraulic' } //                   deck hydraulic pressure
  | { power: 'pto' } //                         the engine's power take-off turning (the fire pump)
  | { fuel: 'diesel' }
  | { gear: GearKind }; //                      other deck gear (a trawl needs a gantry to hang from)

/** Something a module (or the hull) gives the boat. */
export type Provision =
  | { power: 'electrical'; circuits?: readonly string[] }
  | { power: 'hydraulic' }
  | { power: 'pto' }
  | { fuel: 'diesel' }
  | { gear: GearKind };

/**
 * Its part in the energy network (2.5); summed by the network service, never by modules.
 * As built in M4a, for the 12 V house system: currents in amps (the voltmeter, the battery
 * model and the loads were always amps). A high-voltage propulsion bank in kW, and DC-DC
 * converters between banks, come with electric drive (M9).
 */
export type PowerRole =
  /** Charges the bank (the alternator; later shore power, solar). */
  | { role: 'source'; amps: (io: PortIO) => number }
  /** Draws from the bank while `amps` says so; on a breaker's circuit, or the master alone. */
  | { role: 'load'; circuit?: BreakerName; amps: (io: PortIO) => number }
  /** The batteries themselves. */
  | { role: 'store'; batteries: number; ah: number; restVolts: readonly [number, number]; internalOhm: number; chargeVolts: number; cutoffSoc: number };

// ── The sim half ─────────────────────────────────────────────────────────────

/** Host only, headless. The same idiom as today's step* functions: (state in, state out). */
export interface ModuleSim<Config, State> {
  /** Its state when first fitted (plain JSON). */
  init(c: Config): State;
  /**
   * Until the boat is built entirely from JSON (M6), a converted machine's state stays where
   * today's VesselState keeps it (the diesel's is `engine`), so saves, snapshots and every
   * reader stay as they are. This says where; without it the state is the module's own.
   */
  legacyState?(v: VesselState): State;
  /** Each fixed tick, after the energy network and the hull's leak (see simAssembly.ts for the order). */
  tick(ctx: SimContext<Config>, s: State, dt: number): void;
  /**
   * For anything that pushes on the hull (2.3): called inside the hull's rigid-body step,
   * where the engine and rudder are now, so the handling stays exactly the same.
   */
  physics?(port: PhysicsPort, ctx: SimContext<Config>, s: State, dt: number): void;
  /**
   * For gear that holds her to the ground (the anchor, M5): called later in the rigid-body
   * step, after the hull's contacts and only near land, where the anchor always was.
   */
  mooring?(port: PhysicsPort, ctx: SimContext<Config>, s: State, dt: number): void;
}

export interface SimContext<Config> {
  config: Config;
  socket: Socket;
  /** Its path on this boat ('helm/slot3'): also its key in VesselState.modules. */
  path: string;
  /** Reads and writes through its ports (any rebinding is invisible to it). */
  io: PortIO;
  /** World facts it may need. Never another module. */
  env: EnvironmentReader;
}

export interface PortIO {
  get(port: string): BusValue;
  num(port: string): number;
  /** Does this boat carry the port's key at all (a boat without electrics has no bus voltage)? */
  has(port: string): boolean;
  set(port: string, value: BusValue): void;
}

/**
 * Read-only facts about the world around the boat, added as modules need them (water depth
 * for the anchor in M5, sun and cloud for solar in M10).
 */
export interface EnvironmentReader {
  /** Simulated time (s). */
  time: number;
}

/**
 * The hull's water, for force-producing modules (2.3), during the hull's rigid-body step.
 * Points and directions are in the boat's axes (x starboard, y up, z aft) for now: the
 * engine and rudder sockets aren't turned. (Socket axes come with a module that is.)
 */
export interface PhysicsPort {
  /**
   * A point of the hull's velocity through the water (m/s, the boat's axes): its motion less
   * the waves' orbital motion there. `level`: the vertical part dropped before turning it
   * into her axes (an outboard's speed of advance, M6a).
   */
  flowAt(local: readonly [number, number, number], level?: boolean): { x: number; y: number; z: number };
  /** How far a point is under the sea surface (m, + under), the surface taken where `surfaceAt` is (default: the point). */
  depthAt(local: readonly [number, number, number], surfaceAt?: readonly [number, number, number]): number;
  /** Push on the hull at a point (N). */
  addForce(local: readonly [number, number, number], fx: number, fy: number, fz: number): void;
  /**
   * For gear that reaches outside the boat (the anchor's chain to the seabed): a point of
   * hers in the world, its velocity there, and a push given in world axes (N).
   */
  worldPoint(local: readonly [number, number, number]): { x: number; y: number; z: number };
  worldVelocity(local: readonly [number, number, number]): { x: number; y: number; z: number };
  addWorldForce(local: readonly [number, number, number], fx: number, fy: number, fz: number): void;
}

// ── The view half ────────────────────────────────────────────────────────────

/** Every machine. Built once when the boat is assembled; updated each frame. */
export interface ModuleView<Config, State> {
  build(ctx: ViewContext<Config>): ModuleViewInstance<State>;
  /**
   * 'boat': it draws in the boat's own axes, from positions in its config (deck gear whose
   * config holds its positions on the boat); its
   * socket only says where it is fitted. Default 'socket': it draws from its socket.
   */
  frame?: 'socket' | 'boat';
}

export interface ViewContext<Config> {
  config: Config;
  socket: Socket;
  path: string;
  /** Each port's bus key on this boat (after the recipe's rebinding): what controls send. */
  keys: Readonly<Record<string, BusKey>>;
  /** The hull's shape, for modules that span it (2.7). */
  hull: HullQueries;
  /** The shared paint colours (Part C): static parts use these so they merge. */
  palette: Readonly<Record<string, number>>;
  /**
   * Draw this moving part as one instance of the boat's shared mesh of its kind (Part C,
   * 2.10): every toggle bat on the boat is one draw call, every button cap another. The
   * mesh itself is hidden but kept, so the pointer still hits it and the control still
   * moves it; each frame its place, colour and glow (hover, lit) are copied to its instance.
   * Every mesh shared as one kind must have the same shape (the first one's is drawn).
   */
  share(mesh: THREE.Mesh, kind: SharedPartKind): void;
  /**
   * What only this player's machine knows, set by the app ('fm.status': the FM set
   * tuning, or no signal). Not on the bus: it isn't the boat's state, and isn't sent.
   */
  local(name: string): string;
  /**
   * Fit a screen on the boat's shared display atlas (one texture, one draw call for every
   * screen). `plane`: the screen's face in socket axes, UVs 0..1 across it.
   */
  display(screen: Screen, plane: THREE.BufferGeometry, circuit: BreakerName): void;
}

/** Read-only hull geometry (vessel axes, m). */
export interface HullQueries {
  /** Half-beam at the deck edge at z. */
  halfBeam(z: number): number;
  /** Deck height at the edge at z. */
  deckY(z: number): number;
  /** Top of the bulwark at z. */
  bulwarkTop(z: number): number;
  /** z of the transom and of the stem. */
  transom: number;
  stem: number;
  /** Height of the wheelhouse roof's underside (null: no wheelhouse): sets hung from it reach it. */
  cabinRoof: number | null;
  /** Height of the wheelhouse floor (null: no wheelhouse). */
  cabinFloor: number | null;
  /** The engine space under the hatch in the wheelhouse floor: its depth below the floor and its outboard side (x); null: none. */
  engineSpace: { depth: number; outboardX: number } | null;
}

/**
 * Repeated moving parts drawn as one instanced mesh each (2.10). The warning lamps and the
 * breaker lamps are already one instanced mesh per panel, so they stay their modules' own.
 * The wheelhouse's kinds are hidden with its other small parts from outside it
 * (app/interiorDetail.ts); the deck gear's buttons ('deckButtonCap', M5a) are out on deck,
 * so they are always drawn.
 */
export type SharedPartKind = 'toggleBat' | 'buttonCap' | 'deckButtonCap';

/** Shared kinds that stand out on deck, not in the wheelhouse. */
export const DECK_SHARED_KINDS: readonly SharedPartKind[] = ['deckButtonCap'];

/** What a view gives the assembler. */
export interface ModuleViewInstance<State> {
  /**
   * Parts that never move relative to the boat, in socket axes with vertex colours from the
   * palette. Merged into the boat's shared meshes at assembly: forty switch housings cost
   * no extra draw calls.
   */
  staticParts: THREE.BufferGeometry[];
  /** Kept separate: these cost draw calls, and the debug overlay counts them. */
  movingParts: THREE.Object3D[];
  /** The existing control components (Lever, Toggle, Button, Wheel, Joystick...). */
  controls: Control[];
  /** Engraved labels, drawn with the boat's others in one mesh. */
  labels?: EngravedLabel[];
  /** Solid for walking and cargo (vessel axes); may change with the bus (a leaf folded). */
  footprints?(read: BusReader): Footprint[];
  /**
   * Each frame. `s` is the module's sim state as last received (undefined: none); `frame`
   * what the scene is like this frame (how dark, where the viewer is), for lights.
   */
  update(read: BusReader, s: State | undefined, dt: number, frame: ViewFrame): void;
  /**
   * What the app may hand this module beyond the bus: what isn't the boat's own state
   * (the VHF's rescue calls, the duty board's game tasks, the crew's whiteboard notes, the
   * chart table's pencil and dividers). The module never reaches out for it; the app finds
   * the module by its id (AssembledView.api) and feeds it.
   */
  api?: object;
  dispose?(): void;
}

/** What a module's view may want to know about the scene each frame (M6c). */
export interface ViewFrame {
  /** 0 (noon) .. 1 (night). */
  darkness: number;
  /** The viewer's head, world axes (the nav lights' arcs of visibility). */
  viewer: THREE.Vector3;
}

/** How far aft of what it names an engraved label lies (m). */
export const LABEL_OFFSET = 0.085;

/**
 * A small engraved label lying on a panel, just aft of what it names (`at`, socket axes).
 * `title`: dark on light, for a group's plate. `yaw`: read facing that way (rad; 0 forward).
 */
export interface EngravedLabel {
  text: string;
  at: readonly [number, number, number];
  title?: boolean;
  yaw?: number;
  /** Width and height (m); the letters scale with the height. Default 0.16 x 0.02. */
  size?: readonly [number, number];
  /** How far from what it names (m). Default LABEL_OFFSET. */
  offset?: number;
  /** On the underside of a panel, read from below (the overhead panel). */
  underside?: boolean;
}

/** A box you can't walk or stand cargo in (m; from a module in its socket's axes, from the assembler in the boat's). */
export interface Footprint {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Its top: you can't walk through it below this height. */
  top: number;
  /** Its foot (default: anywhere below): floors more than a step below it are clear (a mast on the roof doesn't block the deck). */
  base?: number;
}

/** A round footprint (a crane's column, an A-frame's foot): centre (x, z) and radius (m, the boat's axes). */
export interface DiscFootprint {
  x: number;
  z: number;
  r: number;
  top: number;
  base?: number;
}

/** What a module's gear takes up on deck (ModuleDefinition.footprints). */
export type GearFootprint = Footprint | DiscFootprint;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** A module's saved state, with the version that wrote it. */
export interface ModuleStateEnvelope {
  v: number;
  s: unknown;
}

/** A fresh state for a newly fitted module (none for modules without a sim half). */
export function initModuleState<C, S>(def: ModuleDefinition<C, S>, config: C): ModuleStateEnvelope | undefined {
  return def.sim ? { v: def.version, s: def.sim.init(config) } : undefined;
}

/**
 * A saved state brought up to date: as is if current, migrated if older (or started fresh
 * if the module can't migrate), started fresh if it's from a newer game than this one.
 */
export function restoreModuleState<C, S>(def: ModuleDefinition<C, S>, config: C, saved: ModuleStateEnvelope | undefined): ModuleStateEnvelope | undefined {
  if (!def.sim) return undefined;
  if (!saved || typeof saved.v !== 'number' || saved.v > def.version) return initModuleState(def, config);
  if (saved.v === def.version) return saved;
  return def.migrate ? { v: def.version, s: def.migrate(saved.s, saved.v) } : initModuleState(def, config);
}

/** The module's config with a recipe's overrides laid over its defaults. */
export function mergeConfig<C>(def: ModuleDefinition<C>, overrides: Record<string, unknown> | undefined): C {
  return overrides ? ({ ...(def.defaults as object), ...overrides } as C) : def.defaults;
}

/** Each port's bus key after a recipe's rebinding (ports with no key at all are left out). */
export function resolvePorts(def: ModuleDefinition, bind: Readonly<Record<string, BusKey>> | undefined): Record<string, BusKey> {
  const out: Record<string, BusKey> = {};
  for (const [name, p] of Object.entries(def.ports)) {
    const key = bind?.[name] ?? p.key;
    if (key) out[name] = key;
  }
  return out;
}

/** Port reads and writes for one mounted module, through its (possibly rebound) keys. */
export function portIO(bus: { get(k: BusKey): BusValue; num(k: BusKey): number; has(k: BusKey): boolean; set(k: BusKey, v: BusValue): void }, keys: Readonly<Record<string, BusKey>>): PortIO {
  const key = (port: string): BusKey => {
    const k = keys[port];
    if (!k) throw new Error(`no port '${port}'`);
    return k;
  };
  return {
    get: (port) => bus.get(key(port)),
    num: (port) => bus.num(key(port)),
    has: (port) => !!keys[port] && bus.has(key(port)),
    set: (port, v) => bus.set(key(port), v),
  };
}

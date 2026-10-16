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
import type { BreakerName } from '../vessel/vesselState';
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
  /** Mass, CG, size, power: checked against the socket, added to the boat's mass (2.6). */
  physical?(c: Config): Physical;
  /** Its part in the energy network (2.5). */
  power?(c: Config): PowerRole[];
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

/** Something a module can't work without. */
export type Requirement =
  | { power: 'electrical'; circuit?: string } // 12 V, on that breaker's circuit
  | { power: 'hydraulic' } //                   deck hydraulic pressure
  | { power: 'pto' } //                         the engine's power take-off turning (the fire pump)
  | { fuel: 'diesel' };

/** Something a module (or the hull) gives the boat. */
export type Provision =
  | { power: 'electrical'; circuits?: readonly string[] }
  | { power: 'hydraulic' }
  | { power: 'pto' }
  | { fuel: 'diesel' };

/** Its part in the energy network (2.5); summed by the network service, never by modules. */
export type PowerRole =
  | { role: 'source'; bank?: string; kw: (bus: BusReader) => number } // alternator, genset, solar, shore
  | { role: 'store'; bank: string; kWh: number; maxChargeKw: number; maxDischargeKw: number; nominalV: number }
  | { role: 'load'; bank?: string; circuit?: string; priority: number; kw: (bus: BusReader) => number };

// ── The sim half ─────────────────────────────────────────────────────────────

/** Host only, headless. The same idiom as today's step* functions: (state in, state out). */
export interface ModuleSim<Config, State> {
  /** Its state when first fitted (plain JSON). */
  init(c: Config): State;
  /** Each fixed tick, after the intents, beside today's stepElectrics / stepBilge. */
  tick(ctx: SimContext<Config>, s: State, dt: number): void;
  /**
   * For anything that pushes on the hull (2.3): called inside the hull's rigid-body step,
   * where the engine and rudder are now, so the handling stays exactly the same.
   */
  physics?(port: PhysicsPort, ctx: SimContext<Config>, s: State, dt: number): void;
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
  set(port: string, value: BusValue): void;
}

/** Read-only facts about the world around the boat. Filled in as modules need them (M4+). */
export interface EnvironmentReader {
  /** Simulated time (s). */
  time: number;
  /** Water depth under a point of the boat (m, socket axes). */
  depthAt(local: readonly [number, number, number]): number;
  /** Sun elevation (deg) and cloud cover (0..1), for solar later. */
  sunElevationDeg: number;
  cloud: number;
}

/** The hull's water, for force-producing modules (2.3). */
export interface PhysicsPort {
  /** Water velocity past a point (m/s, socket axes) and how deep the point is (m, + under). */
  flowAt(local: readonly [number, number, number]): { x: number; y: number; z: number; depth: number };
  /** Push on the hull at a point (N, socket axes). */
  addForce(local: readonly [number, number, number], force: readonly [number, number, number]): void;
}

// ── The view half ────────────────────────────────────────────────────────────

/** Every machine. Built once when the boat is assembled; updated each frame. */
export interface ModuleView<Config, State> {
  build(ctx: ViewContext<Config>): ModuleViewInstance<State>;
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
  /** One instance of a shared moving part (Part C, 2.10): one draw call for all of them. */
  instance(part: SharedPartKind): InstanceHandle;
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
}

/** Repeated moving parts drawn as one instanced mesh each (2.10). Grows in M3. */
export type SharedPartKind = 'toggleBat' | 'buttonCap' | 'lamp';

export interface InstanceHandle {
  /** Where the part is, in the boat's axes. */
  setMatrix(m: THREE.Matrix4): void;
  setColor(hex: number): void;
}

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
  /** Engraved labels, drawn with the bridge's others in one mesh. */
  labels?: EngravedLabel[];
  /** Solid for walking and cargo (vessel axes); may change with the bus (a leaf folded). */
  footprints?(read: BusReader): Footprint[];
  /** Each frame. `s` is the module's sim state as last received (undefined: none). */
  update(read: BusReader, s: State | undefined, dt: number): void;
  dispose?(): void;
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
}

/** A box you can't walk or stand cargo in (vessel axes, m). */
export interface Footprint {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Its top: you can't walk through it below this height. */
  top: number;
}

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
export function portIO(bus: { get(k: BusKey): BusValue; num(k: BusKey): number; set(k: BusKey, v: BusValue): void }, keys: Readonly<Record<string, BusKey>>): PortIO {
  const key = (port: string): BusKey => {
    const k = keys[port];
    if (!k) throw new Error(`no port '${port}'`);
    return k;
  };
  return {
    get: (port) => bus.get(key(port)),
    num: (port) => bus.num(key(port)),
    set: (port, v) => bus.set(key(port), v),
  };
}

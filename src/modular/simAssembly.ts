/**
 * The simulation side of the assembler (modular boats M4a): a boat's machinery, from her
 * recipe. Headless: no scenes, no DOM; the host runs it inside stepWorld.
 *
 *   buildSimDef(recipe)   once per boat type: which mounted modules have a simulation half
 *                         or a part in the energy network, with their configs and ports;
 *   runtimeFor(def, v)    once per boat: those modules bound to her state and her bus.
 *
 * Each tick the simulation calls, in this order (where today's code was, so the numbers
 * stay the same):
 *   physics   inside the hull's rigid-body step, where the engine and rudder were: modules
 *             that push on the hull (the diesel and its propeller, the rudder), in the
 *             recipe's order, through the physics port;
 *   network   the energy network (vessel/electrics.ts): the loads and sources the modules
 *             declare, the batteries, the circuits;
 *   tick      the modules' own upkeep (the bilge pump, the engine's oil and wear), in the
 *             recipe's order.
 * Modules never see each other: each reads and writes the bus through its own ports.
 */
import * as THREE from 'three';
import type { VesselState } from '../vessel/vesselState';
import type { BreakerName } from '../vessel/vesselState';
import { busOf } from './bus';
import type { BusKey } from './busKeys';
import type { HullLibrary } from './hull';
import { portIO, restoreModuleState, type GearFacts, type GearFootprint, type GearKind, type HullQueries, type ModuleDefinition, type PhysicsPort, type PortIO, type PowerRole, type SimContext } from './module';
import { flattenMounts, validateRecipe, type ModuleLibrary, type Recipe } from './recipe';
import type { Socket } from './socket';
import { mountPlaces } from './vesselAssembly';

/** One module with a simulation half or an energy role, as mounted on this boat type. */
export interface SimMount {
  path: string;
  def: ModuleDefinition;
  config: unknown;
  keys: Record<string, BusKey>;
  socket: Socket;
  roles: PowerRole[];
}

export interface VesselSimDef {
  recipe: string;
  mounts: SimMount[];
  /** Her deck gear's facts, by kind (M5). */
  gear: Partial<GearFacts>;
  /** Where her modules stand solid on deck and roof (M5b; the boat's axes). */
  footprints: GearFootprint[];
}

export type StoreRole = Extract<PowerRole, { role: 'store' }>;

/** A boat's machinery bound to her state. */
export interface VesselRuntime {
  /** Inside the hull's rigid-body step: every module that pushes on the hull. */
  physics(port: PhysicsPort, dt: number): void;
  /** Later in it, after the hull's contacts, near land: gear holding her to the ground (the anchor). */
  mooring(port: PhysicsPort, dt: number): void;
  /** After the energy network: every module's upkeep. */
  tick(dt: number, time: number): void;
  /** Current drawn now by every load the modules declare, on circuits that are switched on (A). */
  loadAmps(): number;
  /** Current the sources (the alternator) give now (A). */
  sourceAmps(): number;
  /** The batteries (null: none fitted). */
  store: StoreRole | null;
  /** What it was built from. */
  sim: VesselSimDef;
}

/** Which of a recipe's modules simulate, and how (checked first; a bad recipe throws). */
export function buildSimDef(recipe: Recipe, lib: { hulls: HullLibrary; modules: ModuleLibrary }, hull: HullQueries): VesselSimDef {
  const errors = validateRecipe(recipe, lib);
  if (errors.length) throw new Error(`Recipe '${recipe.id}' has problems:\n  ${errors.join('\n  ')}`);
  const { mounted } = flattenMounts(recipe, lib.hulls, lib.modules);
  const mounts: SimMount[] = [];
  const gear: Partial<GearFacts> = {};
  const footprints: GearFootprint[] = [];
  const places = mountPlaces(mounted);
  for (const m of mounted) {
    const place = places.get(m.path)!;
    // Gear drawn in the boat's axes gives its footprints there; gear drawn from its socket
    // (placeable: the deck crane) gives them in its own axes, put onto the boat here.
    const own = m.def.footprints?.(m.config, hull) ?? [];
    footprints.push(...(m.def.view?.frame === 'boat' ? own : own.map((f) => placeFootprint(f, place))));
    // The first module giving each kind of gear tells the world about it.
    const at = (p: readonly [number, number, number]): [number, number, number] => {
      const w = new THREE.Vector3(...p).applyMatrix4(place);
      return [w.x, w.y, w.z];
    };
    const facts = m.def.gear?.(m.config, hull, at) ?? {};
    for (const k of Object.keys(facts) as GearKind[]) if (!(k in gear)) Object.assign(gear, { [k]: facts[k] });
    const roles = m.def.power?.(m.config) ?? [];
    if (!m.def.sim && !roles.length) continue;
    mounts.push({ path: m.path, def: m.def, config: m.config, keys: m.keys, socket: m.socket, roles });
  }
  const stores = mounts.flatMap((m) => m.roles.filter((r) => r.role === 'store'));
  if (stores.length > 1) throw new Error(`Recipe '${recipe.id}': more than one battery bank (one house bank for now)`);
  return { recipe: recipe.id, mounts, gear, footprints };
}

/** A footprint in a module's axes onto the boat's (a box: the box around its turned corners). */
function placeFootprint(f: GearFootprint, place: THREE.Matrix4): GearFootprint {
  const lift = new THREE.Vector3().setFromMatrixPosition(place).y;
  const on = (x: number, z: number) => new THREE.Vector3(x, 0, z).applyMatrix4(place);
  const height = { top: f.top + lift, ...(f.base !== undefined ? { base: f.base + lift } : {}) };
  if ('r' in f) {
    const c = on(f.x, f.z);
    return { x: c.x, z: c.z, r: f.r, ...height };
  }
  const corners = [on(f.x0, f.z0), on(f.x1, f.z0), on(f.x0, f.z1), on(f.x1, f.z1)];
  return {
    x0: Math.min(...corners.map((p) => p.x)),
    x1: Math.max(...corners.map((p) => p.x)),
    z0: Math.min(...corners.map((p) => p.z)),
    z1: Math.max(...corners.map((p) => p.z)),
    ...height,
  };
}

const runtimes = new WeakMap<VesselState, VesselRuntime>();

/** The boat's runtime (made on first use, kept with her state). */
export function runtimeFor(sim: VesselSimDef, v: VesselState): VesselRuntime {
  let rt = runtimes.get(v);
  // New, or her recipe has changed since (a refit): bind afresh.
  if (!rt || rt.sim !== sim) runtimes.set(v, (rt = makeRuntime(sim, v)));
  return rt;
}

function makeRuntime(sim: VesselSimDef, v: VesselState): VesselRuntime {
  const bus = busOf(v);
  const env = { time: 0 };
  type Bound = { ctx: SimContext<unknown>; def: ModuleDefinition; state: unknown };
  const bound: Bound[] = [];
  const loads: { circuit?: BreakerName; amps: (io: PortIO) => number; io: PortIO }[] = [];
  const sources: { amps: (io: PortIO) => number; io: PortIO }[] = [];
  let store: StoreRole | null = null;
  for (const m of sim.mounts) {
    const io = portIO(bus, m.keys);
    if (m.def.sim) {
      const ctx: SimContext<unknown> = { config: m.config, socket: m.socket, path: m.path, io, env };
      // Until M6 a converted machine's state is where today's VesselState keeps it. A module
      // with state of its own keeps it in VesselState.modules (the deck crane), so snapshots
      // and saves carry it, and its view reads it there.
      let state: unknown;
      if (m.def.sim.legacyState) state = m.def.sim.legacyState(v);
      else {
        v.modules ??= {};
        const saved = v.modules[m.path];
        v.modules[m.path] = { ...restoreModuleState(m.def, m.config, saved)!, id: m.def.id };
        state = v.modules[m.path].s;
      }
      bound.push({ ctx, def: m.def, state });
    }
    for (const r of m.roles) {
      if (r.role === 'load') loads.push({ circuit: r.circuit, amps: r.amps, io });
      else if (r.role === 'source') sources.push({ amps: r.amps, io });
      else store = r;
    }
  }
  const pushing = bound.filter((b) => b.def.sim!.physics);
  const holding = bound.filter((b) => b.def.sim!.mooring);
  return {
    store,
    sim,
    physics(port, dt) {
      for (const b of pushing) b.def.sim!.physics!(port, b.ctx, b.state, dt);
    },
    mooring(port, dt) {
      for (const b of holding) b.def.sim!.mooring!(port, b.ctx, b.state, dt);
    },
    tick(dt, time) {
      env.time = time;
      for (const b of bound) b.def.sim!.tick(b.ctx, b.state, dt);
    },
    loadAmps() {
      const breakers = v.electrics?.breakers;
      let a = 0;
      for (const l of loads) if (!l.circuit || !breakers || breakers[l.circuit] > 0) a += l.amps(l.io);
      return a;
    },
    sourceAmps() {
      let a = 0;
      for (const s of sources) a += s.amps(s.io);
      return a;
    },
  };
}

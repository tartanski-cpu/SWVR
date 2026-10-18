/**
 * Each boat's machinery, from her recipe (modular boats M4a): the simulation reaches her
 * modules through here. Boats without a recipe (the skiff, the tows) have none and keep
 * their own code (the skiff's outboard).
 */
import { buildSimDef, runtimeFor, type VesselRuntime, type VesselSimDef } from '../modular/simAssembly';
import type { VesselState } from '../vessel/vesselState';
import { hullQueries } from '../modular/hull';
import { initModuleState, type GearFacts, type GearFootprint, type GearKind, type ModuleStateEnvelope } from '../modular/module';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { flattenMounts, type Recipe } from '../modular/recipe';
import { LIBRARY, RECIPES, setDesignBoat, setWorkboatFit } from './library';
import type { DesignedBoat } from '../shipyard/build';
import type { ShipDesign } from '../shipyard/design';

const sims = new Map<string, VesselSimDef | null>();

/**
 * Refit every boat of a type to another recipe (checked first; a bad one throws). For the
 * shipyard (M8) and for tests; `null` goes back to the type's own recipe.
 */
export function setVesselRecipe(defId: string, recipe: Recipe | null): void {
  if (recipe) sims.set(defId, buildSimDef(recipe, LIBRARY, hullQueries(VESSEL_DEFS[defId])));
  else sims.delete(defId);
}

/**
 * Make the Shipyard's 'design' vessel type this design (shipyard/build.ts): her hull,
 * recipe and vessel def, and her machinery here. For a new world: boats already afloat keep
 * what they were built with until they're made again.
 */
export function useDesign(d: ShipDesign): DesignedBoat {
  const boat = setDesignBoat(d);
  sims.delete('design');
  return boat;
}

/**
 * Fit the workboat out without the modules in these sockets (library.ts setWorkboatFit; none:
 * the whole boat), her machinery here too. For a new world, as useDesign.
 */
export function useWorkboatFit(without: readonly string[]): void {
  setWorkboatFit(without);
  sims.delete('workboat');
}

/** Her recipe's simulation side (null: she has none). */
export function simOf(defId: string): VesselSimDef | null {
  let sim = sims.get(defId);
  if (sim === undefined) {
    const recipe = RECIPES[defId];
    sim = recipe ? buildSimDef(recipe, LIBRARY, hullQueries(VESSEL_DEFS[defId])) : null;
    sims.set(defId, sim);
  }
  return sim;
}

/**
 * Her deck gear of a kind (modular boats M5): the config of the module that gives it, or
 * null if she has none. The world's systems ask this ("has she a tow point?") rather than
 * reading the vessel config.
 */
export function gearOf<K extends GearKind>(v: { defId: string }, kind: K): GearFacts[K] | null {
  return simOf(v.defId)?.gear[kind] ?? null;
}

/**
 * Where her modules stand solid (M5b; the boat's axes): the walk area and cargo placement
 * keep out of these. None for a boat without a recipe.
 */
export function footprintsOf(v: { defId: string }): readonly GearFootprint[] {
  return simOf(v.defId)?.footprints ?? [];
}

/** The boat's machinery, bound to her (null: she has no recipe). */
export function vesselRuntime(v: VesselState): VesselRuntime | null {
  const sim = simOf(v.defId);
  return sim ? runtimeFor(sim, v) : null;
}

/**
 * A new boat's own module state (modules that keep theirs in VesselState.modules, such as
 * the deck crane), as they start; undefined if she has none. Made with her, so their keys
 * are there from her first moment, not only once her machinery has first run.
 */
export function freshModuleStates(defId: string): Record<string, ModuleStateEnvelope> | undefined {
  const out: Record<string, ModuleStateEnvelope> = {};
  for (const m of simOf(defId)?.mounts ?? []) if (m.def.sim && !m.def.sim.legacyState) out[m.path] = { ...initModuleState(m.def, m.config)!, id: m.def.id };
  return Object.keys(out).length ? out : undefined;
}

/** Does her recipe carry this module (its id), anywhere aboard? */
export function hasModule(defId: string, moduleId: string): boolean {
  const recipe = RECIPES[defId];
  return !!recipe && flattenMounts(recipe, LIBRARY.hulls, LIBRARY.modules).mounted.some((m) => m.def.id === moduleId);
}

/** Does she carry a pull-down whiteboard (one hung from a cabin roof)? Its 'whiteboard.down' starts rolled up. */
export function hasPullDownBoard(defId: string): boolean {
  const recipe = RECIPES[defId];
  if (!recipe) return false;
  return flattenMounts(recipe, LIBRARY.hulls, LIBRARY.modules).mounted.some((m) => m.def.id === 'furniture.whiteboard' && m.socket.type === 'cabin.overhead');
}

/**
 * Each boat's machinery, from her recipe (modular boats M4a): the simulation reaches her
 * modules through here. Boats without a recipe (the skiff, the tows) have none and keep
 * their own code (the skiff's outboard).
 */
import { buildSimDef, runtimeFor, type VesselRuntime, type VesselSimDef } from '../modular/simAssembly';
import type { VesselState } from '../vessel/vesselState';
import { hullQueries } from '../modular/hull';
import type { GearFacts, GearFootprint, GearKind } from '../modular/module';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import type { Recipe } from '../modular/recipe';
import { LIBRARY, RECIPES } from './library';

const sims = new Map<string, VesselSimDef | null>();

/**
 * Refit every boat of a type to another recipe (checked first; a bad one throws). For the
 * shipyard (M8) and for tests; `null` goes back to the type's own recipe.
 */
export function setVesselRecipe(defId: string, recipe: Recipe | null): void {
  if (recipe) sims.set(defId, buildSimDef(recipe, LIBRARY, hullQueries(VESSEL_DEFS[defId])));
  else sims.delete(defId);
}

/** Her recipe's simulation side (null: she has none). */
function simOf(defId: string): VesselSimDef | null {
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

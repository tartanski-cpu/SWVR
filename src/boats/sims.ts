/**
 * Each boat's machinery, from her recipe (modular boats M4a): the simulation reaches her
 * modules through here. Boats without a recipe (the skiff, the tows) have none and keep
 * their own code (the skiff's outboard).
 */
import { buildSimDef, runtimeFor, type VesselRuntime, type VesselSimDef } from '../modular/simAssembly';
import type { VesselState } from '../vessel/vesselState';
import type { Recipe } from '../modular/recipe';
import { LIBRARY, RECIPES } from './library';

const sims = new Map<string, VesselSimDef | null>();

/**
 * Refit every boat of a type to another recipe (checked first; a bad one throws). For the
 * shipyard (M8) and for tests; `null` goes back to the type's own recipe.
 */
export function setVesselRecipe(defId: string, recipe: Recipe | null): void {
  if (recipe) sims.set(defId, buildSimDef(recipe, LIBRARY));
  else sims.delete(defId);
}

/** The boat's machinery, bound to her (null: she has no recipe). */
export function vesselRuntime(v: VesselState): VesselRuntime | null {
  let sim = sims.get(v.defId);
  if (sim === undefined) {
    const recipe = RECIPES[v.defId];
    sim = recipe ? buildSimDef(recipe, LIBRARY) : null;
    sims.set(v.defId, sim);
  }
  return sim ? runtimeFor(sim, v) : null;
}

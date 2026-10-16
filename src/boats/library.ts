/**
 * Every hull, module and recipe the game knows (modular boats). Adding a module: write it
 * in its own folder under src/modules/, then list it here. Adding a boat: a hull here and
 * a recipe JSON.
 */
import { createHullLibrary } from '../modular/hull';
import { createModuleLibrary, parseRecipe, validateRecipe, type Recipe } from '../modular/recipe';
import { THROTTLE_LEVER } from '../modules/throttleLever';
import starterWorkboat from './starterWorkboat.json';
import { WORKBOAT_HULL } from './workboatHull';

export const HULLS = createHullLibrary([WORKBOAT_HULL]);

export const MODULES = createModuleLibrary([THROTTLE_LEVER]);

export const LIBRARY = { hulls: HULLS, modules: MODULES };

/** A recipe from JSON, checked; throws with every problem listed if it isn't right. */
export function loadRecipe(json: unknown): Recipe {
  const parsed = parseRecipe(json);
  if ('errors' in parsed) throw new Error(`Recipe isn't valid:\n  ${parsed.errors.join('\n  ')}`);
  const errors = validateRecipe(parsed.recipe, LIBRARY);
  if (errors.length) throw new Error(`Recipe '${parsed.recipe.id}' has problems:\n  ${errors.join('\n  ')}`);
  return parsed.recipe;
}

/** The recipes, by the vessel definition they're built on (until M6). */
export const RECIPES: Record<string, Recipe> = {
  workboat: loadRecipe(starterWorkboat),
};

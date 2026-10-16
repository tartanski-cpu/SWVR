/**
 * Every hull, module and recipe the game knows (modular boats). Adding a module: write it
 * in its own folder under src/modules/, then list it here. Adding a boat: a hull here and
 * a recipe JSON.
 */
import { createHullLibrary } from '../modular/hull';
import { createModuleLibrary, parseRecipe, validateRecipe, type Recipe } from '../modular/recipe';
import { BATTERY_BANK } from '../modules/batteryBank';
import { BATTERY_MASTER } from '../modules/batteryMaster';
import { BILGE_PUMP } from '../modules/bilgePump';
import { BATTERY_SELECTOR } from '../modules/batterySelector';
import { BREAKER_PANEL } from '../modules/breakerPanel';
import { CHART_TABLE } from '../modules/chartTable';
import { CHARTPLOTTER } from '../modules/chartplotter';
import { CONSOLE } from '../modules/console';
import { CONSUMER } from '../modules/consumer';
import { DIESEL_INBOARD } from '../modules/dieselInboard';
import { DIPSTICK } from '../modules/dipstick';
import { DOOR_BUTTON } from '../modules/doorButton';
import { DUTY_BOARD } from '../modules/dutyBoard';
import { FM_RADIO } from '../modules/fmRadio';
import { FUEL_TANK } from '../modules/fuelTank';
import { HATCH_COVER } from '../modules/hatchCover';
import { JOYSTICK } from '../modules/joystick';
import { KEY_SWITCH } from '../modules/keySwitch';
import { OIL_CAN } from '../modules/oilCan';
import { OVERHEAD_PANEL } from '../modules/overheadPanel';
import { PTO_PUMP } from '../modules/ptoPump';
import { PUSH_BUTTON } from '../modules/pushButton';
import { RUDDER } from '../modules/rudder';
import { SCREEN } from '../modules/screen';
import { START_CARD } from '../modules/startCard';
import { THROTTLE_LEVER } from '../modules/throttleLever';
import { TOGGLE } from '../modules/toggle';
import { VHF } from '../modules/vhf';
import { WARNING_LAMPS } from '../modules/warningLamps';
import { WHEEL } from '../modules/wheel';
import { WHITEBOARD } from '../modules/whiteboard';
import starterWorkboat from './starterWorkboat.json';
import { WORKBOAT_HULL } from './workboatHull';

export const HULLS = createHullLibrary([WORKBOAT_HULL]);

export const MODULES = createModuleLibrary([
  CONSOLE, WHEEL, THROTTLE_LEVER, TOGGLE, PUSH_BUTTON, KEY_SWITCH, JOYSTICK, WARNING_LAMPS, START_CARD, SCREEN,
  OVERHEAD_PANEL, FM_RADIO, BREAKER_PANEL, BATTERY_MASTER, BATTERY_SELECTOR,
  VHF, CHARTPLOTTER, CHART_TABLE, DUTY_BOARD, WHITEBOARD, DOOR_BUTTON, HATCH_COVER, DIPSTICK, OIL_CAN,
  DIESEL_INBOARD, RUDDER, FUEL_TANK, BATTERY_BANK, PTO_PUMP, BILGE_PUMP, CONSUMER,
]);

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

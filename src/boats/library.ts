/**
 * Every hull, module and recipe the game knows (modular boats). Adding a module: write it
 * in its own folder under src/modules/, then list it here. Adding a boat: a hull here and
 * a recipe JSON.
 */
import { createHullLibrary, type HullLibrary } from '../modular/hull';
import { buildDesign, type DesignedBoat } from '../shipyard/build';
import { DEFAULT_DESIGN, encodeDesign, type ShipDesign } from '../shipyard/design';
import { vesselDefFrom } from '../modular/vesselAssembly';
import { registerVesselDefs } from '../vessel/vesselDef';
import { createModuleLibrary, parseRecipe, validateRecipe, type Recipe } from '../modular/recipe';
import { A_FRAME } from '../modules/aFrame';
import { ANCHOR_WINDLASS } from '../modules/anchorWindlass';
import { BOAT_HOOK_RACK } from '../modules/boatHookRack';
import { BATTERY_BANK } from '../modules/batteryBank';
import { BATTERY_MASTER } from '../modules/batteryMaster';
import { BILGE_PUMP } from '../modules/bilgePump';
import { CABIN_LIGHT } from '../modules/cabinLight';
import { BATTERY_SELECTOR } from '../modules/batterySelector';
import { BREAKER_PANEL } from '../modules/breakerPanel';
import { CHART_TABLE } from '../modules/chartTable';
import { CHARTPLOTTER } from '../modules/chartplotter';
import { CLEAT } from '../modules/cleat';
import { CONSOLE } from '../modules/console';
import { CONSUMER } from '../modules/consumer';
import { DIESEL_INBOARD } from '../modules/dieselInboard';
import { DIPSTICK } from '../modules/dipstick';
import { DOOR_BUTTON } from '../modules/doorButton';
import { ELECTRIC_OUTBOARD } from '../modules/electricOutboard';
import { DUTY_BOARD } from '../modules/dutyBoard';
import { FENDERS } from '../modules/fenders';
import { FIRE_MONITOR } from '../modules/fireMonitor';
import { FLOODLIGHT } from '../modules/floodlight';
import { FM_RADIO } from '../modules/fmRadio';
import { FUEL_TANK } from '../modules/fuelTank';
import { HATCH_COVER } from '../modules/hatchCover';
import { HULL_GUARD } from '../modules/hullGuard';
import { PUSH_FENDER } from '../modules/pushFender';
import { JOYSTICK } from '../modules/joystick';
import { KEY_SWITCH } from '../modules/keySwitch';
import { LIFE_RING_STATION } from '../modules/lifeRingStation';
import { MAST } from '../modules/mast';
import { NAV_LIGHTS } from '../modules/navLights';
import { OIL_CAN } from '../modules/oilCan';
import { OVERHEAD_PANEL } from '../modules/overheadPanel';
import { PTO_PUMP } from '../modules/ptoPump';
import { PUSH_BUTTON } from '../modules/pushButton';
import { RAIL_LIGHTS } from '../modules/railLights';
import { RUDDER } from '../modules/rudder';
import { SCREEN } from '../modules/screen';
import { SEARCHLIGHT } from '../modules/searchlight';
import { START_CARD } from '../modules/startCard';
import { STERN_ROLLER } from '../modules/sternRoller';
import { SWIM_LADDER } from '../modules/swimLadder';
import { TENDER_CRANE } from '../modules/tenderCrane';
import { THROTTLE_LEVER } from '../modules/throttleLever';
import { TILLER } from '../modules/tiller';
import { TOGGLE } from '../modules/toggle';
import { TOW_WINCH } from '../modules/towWinch';
import { DECK_CRANE } from '../modules/deckCrane';
import { TRAWL } from '../modules/trawl';
import { VHF } from '../modules/vhf';
import { WARNING_LAMPS } from '../modules/warningLamps';
import { WHEEL } from '../modules/wheel';
import { WHITEBOARD } from '../modules/whiteboard';
import landingCraft from './landingCraft.json';
import { LANDING_CRAFT_HULL } from './landingCraftHull';
import skiff from './skiff.json';
import { SKIFF_HULL } from './skiffHull';
import starterWorkboat from './starterWorkboat.json';
import towBarge from './tow-barge.json';
import towDerelict from './tow-derelict.json';
import towLogRaft from './tow-logRaft.json';
import towDory from './tow-dory.json';
import towYacht from './tow-yacht.json';
import towTrawler from './tow-trawler.json';
import towPontoon from './tow-pontoon.json';
import { BARGE_HULL, DERELICT_HULL, DORY_HULL, LOG_RAFT_HULL, PONTOON_HULL, TRAWLER_HULL, YACHT_HULL } from './towHulls';
import { WORKBOAT_HULL } from './workboatHull';

const FIXED_HULLS = createHullLibrary([WORKBOAT_HULL, SKIFF_HULL, DERELICT_HULL, LOG_RAFT_HULL, BARGE_HULL, DORY_HULL, YACHT_HULL, TRAWLER_HULL, PONTOON_HULL, LANDING_CRAFT_HULL]);

/**
 * The Shipyard's designed boat (shipyard/build.ts): one at a time, the vessel type 'design',
 * built from a design's choices (by default the Shipyard's starting design). `useDesign`
 * swaps her for another: a game started in her, or the Shipyard page trying one out.
 */
let designed: DesignedBoat = buildDesign(DEFAULT_DESIGN, encodeDesign(DEFAULT_DESIGN));

export const HULLS: HullLibrary = { get: (id) => (id === designed.hull.id ? designed.hull : FIXED_HULLS.get(id)) };

export const MODULES = createModuleLibrary([
  CONSOLE, WHEEL, THROTTLE_LEVER, TOGGLE, PUSH_BUTTON, KEY_SWITCH, JOYSTICK, WARNING_LAMPS, START_CARD, SCREEN,
  OVERHEAD_PANEL, FM_RADIO, BREAKER_PANEL, BATTERY_MASTER, BATTERY_SELECTOR,
  VHF, CHARTPLOTTER, CHART_TABLE, DUTY_BOARD, WHITEBOARD, DOOR_BUTTON, HATCH_COVER, DIPSTICK, OIL_CAN,
  DIESEL_INBOARD, RUDDER, FUEL_TANK, BATTERY_BANK, PTO_PUMP, BILGE_PUMP, CONSUMER,
  TENDER_CRANE, DECK_CRANE, TOW_WINCH, STERN_ROLLER, A_FRAME, TRAWL, ANCHOR_WINDLASS,
  SEARCHLIGHT, FIRE_MONITOR, MAST, CLEAT, FENDERS, HULL_GUARD, PUSH_FENDER, SWIM_LADDER, LIFE_RING_STATION, BOAT_HOOK_RACK,
  ELECTRIC_OUTBOARD,
  NAV_LIGHTS, CABIN_LIGHT, FLOODLIGHT, RAIL_LIGHTS, TILLER,
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

/** Every boat's recipe, by her vessel def id (VESSEL_DEFS is built from these, M6a). */
export const RECIPES: Record<string, Recipe> = {
  workboat: loadRecipe(starterWorkboat),
  skiff: loadRecipe(skiff),
  derelict: loadRecipe(towDerelict),
  logRaft: loadRecipe(towLogRaft),
  barge: loadRecipe(towBarge),
  dory: loadRecipe(towDory),
  yacht: loadRecipe(towYacht),
  trawler: loadRecipe(towTrawler),
  pontoon: loadRecipe(towPontoon),
  landingCraft: loadRecipe(landingCraft),
  design: loadRecipe(designed.recipe),
};

/**
 * Make the 'design' vessel type this design (her hull, recipe and vessel def rebuilt). Use
 * boats/sims.ts `useDesign`, which also refits her machinery.
 */
export function setDesignBoat(d: ShipDesign): DesignedBoat {
  designed = buildDesign(d, encodeDesign(d));
  RECIPES.design = loadRecipe(designed.recipe);
  registerVesselDefs(buildDefs);
  return designed;
}

/** The design the 'design' vessel type is now. */
export function currentDesign(): DesignedBoat {
  return designed;
}

// Every vessel type is built from her recipe (M6a): VESSEL_DEFS asks this when first used.
function buildDefs() {
  return Object.fromEntries(Object.entries(RECIPES).map(([id, recipe]) => [id, vesselDefFrom(id, recipe, LIBRARY)]));
}
registerVesselDefs(buildDefs);

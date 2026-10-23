/**
 * The Shipyard's boat builder (owner, Oct 2026): a design's choices (shipyard/design.ts) to a
 * hull definition and a recipe, the same two things every boat in the game is made of. The
 * game and the Shipyard page both call this, so the code a player types gets exactly the
 * boat they designed. Deterministic: same choices, same boat.
 *
 * How she's worked out (all on her stations, the same ones that float and draw her):
 *   - her shape: a base hull (DESIGN_HULLS) with its length, beam and depth scaled;
 *   - her weight: what she displaces at her design waterline, so she floats on her lines,
 *     and her CG over her LCB (level trim), its height a fixed share of her depth amidships;
 *   - her handling: the landing craft's per-area damping and resistance curve on her own
 *     waterline length; roll damping ~28 % of critical from her own GM;
 *   - her wheelhouse: placed and sized from the choices within the deck that's free for it;
 *     what's inside it (console, panels, buttons, the engine under its hatch) placed from it
 *     the way the landing craft's is (boats/landingCraftHull.ts);
 *   - her machinery and controls: the landing craft's recipe as the template, with the
 *     chosen engine and propeller, and the basic or advanced controls;
 *   - her hull protection: the crew's fenders (a basket on deck), a rubber rubbing strake
 *     all round, or tyres along her sides (modules/hullGuard), designed into her weight.
 * Anything doubtful (a cabin too narrow for the console, too little stability) comes back as
 * a plain-language warning; the page shows them, the game builds her anyway.
 *
 * The work is done part by part (P4, src/shipyard/parts/): her lines (hull.ts), her houses
 * (house.ts), how she floats (trim.ts), her engine room (engineRoom.ts), the places in her
 * wheelhouse (places.ts), her deck gear (deckGear.ts), her hull definition and sockets
 * (hullDef.ts), her recipe (recipe.ts) and her weights (weights.ts); the hull types,
 * engines and liveries are in catalog.ts, shared geometry in common.ts.
 */
import type { ShaftLine } from './machinery';
import { CONFIG } from '../config';
import { hullFormOf, type HullDefinition } from '../modular/hull';
import type { Recipe } from '../modular/recipe';
import type { HullForm } from '../vessel/hullForm';
import type { FurnitureKey, PlaceKey, ShipDesign } from './design';

import { hullPart } from './parts/hull';
import { housePart, layoutPart, overheadPart, interiorPart } from './parts/house';
import { trimPart } from './parts/trim';
import { machineryPart, engineHatchPart } from './parts/engineRoom';
import { placesPart } from './parts/places';
import { deckGearPart, houseGearPart } from './parts/deckGear';
import { hullDefPart } from './parts/hullDef';
import { furniturePart } from './parts/furniture';
import { holdPart } from './parts/hold';
import { recipePart } from './parts/recipe';
import { weightsPart } from './parts/weights';
import { atDWL, type BuildArgs } from './parts/common';
import type { Material } from './parts/catalog';
export { DESIGN_HULLS, ENGINES, FRAME_COLOURS, HOUSE_PAINTS, LIVERIES, ROOF_PAINTS, ROOF_TOPS, bowKeel, facetCentre, frontMullions, materialOf, sizeScale, withSheer, type DesignHull, type Material } from './parts/catalog';

/** The designed boat: her hull and recipe, her main figures, and anything to warn about. */
export interface DesignedBoat {
  hull: HullDefinition;
  recipe: Recipe;
  /** floorM: the cabin floor about the deck under the house (as built: a fine hull can bring a low one up). */
  /** engineShortM: how far her engine stands above the cabin floor (0: it fits; machinery.ts). */
  figures: { lengthM: number; beamM: number; massT: number; draughtM: number; gmM: number; propellerM: number; engineShortM: number; gear: number; engine: string; price: number; floorM: number; floorOnDeckhouseM?: number; material: Material; freeboardM: number };
  warnings: string[];
  /** Her shaft line and the engine on it (machinery.ts): for the Shipyard's drawing of her machinery. */
  shaft: ShaftLine;
  /**
   * What she weighs, part by part (owner, Oct 2026): what she's built of, each part's weight
   * (kg) and its centre's height (m, her axes as first drawn: buildDesign raises them with her
   * lines), and the total and its centre: her displacement and centre of gravity.
   */
  weights: { material: Material; items: { name: string; kg: number; y: number; z: number }[]; massKg: number; cgY: number; balanceM: number };
  /**
   * Where the gear placed by hand stands (boat axes, m), whether it had to move off its
   * pinned cell to stand there (`moved`), and on the roof or not; null if it couldn't stand
   * within a metre of its pin and is in its usual place.
   */
  placed: Partial<Record<PlaceKey | FurnitureKey, { x: number; z: number; moved: boolean; onRoof?: boolean } | null>>;
  /** Why a piece placed by hand won't stand exactly where it was put, in a few words ("on her other gear or a ladder"): the Shipyard says it as you place it. */
  placeWhy: Partial<Record<PlaceKey | FurnitureKey, string>>;
}

/**
 * Build her design (owner, Oct 2026: she floats at what she weighs). Twice: first on her
 * lines as drawn, to weigh her (her weight doesn't depend on how high she floats: her
 * plating, houses, machinery, gear and load are what they are); then with her lines raised
 * (lighter than they displace) or lowered (heavier) until she displaces exactly that
 * weight, so her draught, freeboard and hydrostatics are those of the boat as built.
 * `id`: her vessel type's id (her hull is `hull.<id>`, her recipe `vessel.<id>`): the
 * Shipyard's one-at-a-time 'design', or a fleet boat's own (boats/fleet.ts).
 */
export function buildDesign(d: ShipDesign, code = 'design', id = 'design'): DesignedBoat {
  const first = buildAt(d, code, 0, null, id);
  const { rise, sinks } = riseFor(hullFormOf(first.hull.form), first.weights.massKg);
  const boat = buildAt(d, code, rise, { massKg: first.weights.massKg, cgY: first.weights.cgY }, id);
  if (sinks) boat.warnings.unshift(`She's too heavy for her hull (${(first.weights.massKg / 1000).toFixed(1)} t): she'd float with her deck awash. Make her lighter (aluminium, a smaller engine, less gear) or bigger.`);
  else if (boat.figures.freeboardM < 0.3) boat.warnings.unshift(`She floats deep for her weight: ${Math.round(boat.figures.freeboardM * 100)} cm of freeboard amidships. Give her more depth (Hull) or make her lighter.`);
  return boat;
}

/**
 * How far to raise her lines (m) for her to displace `massKg`: her stations moved up by it,
 * their volume below the waterline (atDWL) is her weight in sea water. Found by halving the
 * bracket (40 steps: well under a millimetre). Deeper than her deck awash she `sinks`.
 */
function riseFor(form: HullForm, massKg: number): { rise: number; sinks: boolean } {
  const rho = CONFIG.ocean.density;
  const at = (rise: number) => atDWL({ ...form, stations: form.stations.map((s) => ({ ...s, polygon: s.polygon.map(([x, y]) => [x, y + rise] as [number, number]) })) }).volume * rho;
  const deckLow = Math.min(...form.stations.map((s) => s.polygon[0][1]));
  let lo = -deckLow + 0.02;
  let hi = 3;
  if (at(lo) < massKg) return { rise: lo, sinks: true };
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) > massKg) lo = mid;
    else hi = mid;
  }
  return { rise: Math.round(((lo + hi) / 2) * 1000) / 1000, sinks: false };
}

/**
 * One build of her (buildDesign runs it twice): her parts in turn (P4: src/shipyard/parts/),
 * each given the design and everything the parts before it worked out.
 */
function buildAt(d: ShipDesign, code: string, raise: number, given: { massKg: number; cgY: number } | null, id: string): DesignedBoat {
  const a: BuildArgs = { d, code, raise, given, id };
  const p0 = hullPart(a);
  const p1 = { ...p0, ...housePart(a, p0) };
  const p2 = { ...p1, ...layoutPart(a, p1) };
  const p3 = { ...p2, ...trimPart(a, p2) };
  const p4 = { ...p3, ...machineryPart(a, p3) };
  const p5 = { ...p4, ...placesPart(a, p4) };
  const p6 = { ...p5, ...deckGearPart(a, p5) };
  const p7 = { ...p6, ...overheadPart(a, p6) };
  const p8 = { ...p7, ...engineHatchPart(a, p7) };
  const p9 = { ...p8, ...interiorPart(a, p8) };
  const p10 = { ...p9, ...houseGearPart(a, p9) };
  const p11 = { ...p10, ...hullDefPart(a, p10) };
  const p12 = { ...p11, ...furniturePart(a, p11) };
  const p12b = { ...p12, ...holdPart(a, p12) };
  const p13 = { ...p12b, ...recipePart(a, p12b) };
  return weightsPart(a, p13);
}

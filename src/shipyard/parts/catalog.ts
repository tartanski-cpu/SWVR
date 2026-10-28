/**
 * The Shipyard's catalogue (P4, split out of build.ts): her hull types (DESIGN_HULLS) and the lines
 * they're drawn from, the engine packages, the liveries and roof colours.
 */
import { CONFIG } from '../../config';
import { DESIGNS } from '../../hulls/designs';
import { curveAt, type HullDesign } from '../../hulls/loft';
import { type HullDefinition } from '../../modular/hull';
import type { Livery } from '../../vessel/vesselDef';
import { BATTERY_DEFAULT, BATTERY_STEPS, DASH_SLOTS, DEFAULT_DESIGN, FURNITURE_KEYS, FURNITURE_SLOTS, fromSteps, furnitureCell, PANEL_SLOTS, SCALES, SEAT_FACES, type ShipDesign } from '../design';

/** A faceted front's middle pane: between the front windows' mullions (hullMesh.ts, at +-0.5 m). */
export const FACET_CENTRE = 0.5;

/**
 * A three-facet front's middle facet, half its width (m) for a wheelhouse `hw` half wide: on
 * a wide house the side facets are kept `sideFacet` across and the middle takes the rest
 * (owner, Oct 2026), never narrower than the usual 1 m middle pane.
 */
export function facetCentre(hw: number): number {
  return Math.round(Math.max(FACET_CENTRE, hw - CONFIG.shipyard.frontWindows.sideFacet) * 1000) / 1000;
}

/**
 * The front windows' mullions (x, m, port to starboard) for a wheelhouse `hw` half wide with
 * walls `wall` thick, flat or with a facet `centre` (owner, Oct 2026: "as you stretch, the
 * windows should multiply"; CONFIG.shipyard.frontWindows). Flat: the usual two at +-0.5 m while
 * the outer panes are no wider than `paneMax`, else an odd number of equal panes across. Faceted:
 * the facets' corners at +-centre, and the middle facet split the same way.
 */
export function frontMullions(hw: number, wall: number, centre?: number): number[] {
  const { paneMax, maxPanes } = CONFIG.shipyard.frontWindows;
  const r = (x: number) => Math.round(x * 1000) / 1000;
  /** `n` panes evenly from -half to +half: the mullions between them. */
  const split = (half: number, most: number) => {
    let n = Math.ceil((2 * half) / paneMax - 1e-9);
    if (n % 2 === 0) n++; // a pane, not a mullion, in front of the helm
    n = Math.min(n, most % 2 ? most : most - 1);
    return Array.from({ length: n - 1 }, (_, i) => r(-half + (2 * half * (i + 1)) / n));
  };
  if (centre !== undefined) return [-centre, ...split(centre, maxPanes - 2), centre];
  const inner = hw - wall;
  if (inner - 0.5 <= paneMax) return [-0.5, 0.5];
  return split(inner, maxPanes);
}

export const study = (id: string): HullDesign => {
  const d = DESIGNS.find((x) => x.id === id);
  if (!d) throw new Error(`the hull study has no '${id}' design`);
  return d;
};

/**
 * The Shipyard landing craft's lines (owner, Oct 2026, from a GA and a photo of aluminium
 * landing craft): the hull study's landing craft, her bow redrawn. A V-bottomed planing hull
 * whose bottom sweeps up in a steep, nearly straight rake (the beach plate, about 25 deg) from
 * a third of her length back to just under the deck at the bow, keeping its V all the way
 * (the chines held about 0.25 m over the keel as the depth closes); above the chines her
 * slab sides run on to a square box section, 0.3 m deep, that carries the ramp. (The study's
 * own bow: a gentle forefoot only up to the waterline, flat-bottomed, under a 1.2 m bow plate.)
 */
export const landingCraftLines = (): HullDesign => {
  const d = study('landingCraft');
  return {
    ...d,
    keel: [
      [0, -0.45],
      [0.55, -0.48],
      [0.66, -0.42],
      [1, 1.0],
    ],
    section: {
      ...d.section,
      chineHeight: [
        [0, 0.12],
        [0.6, 0.15],
        [0.8, 0.22],
        [0.92, 0.4],
        [1, 0.8],
      ],
    },
  };
};

/** A base hull the Shipyard starts from: its form (scaled) and the kind of boat she is. */
export interface DesignHull {
  name: string;
  /** Her form, scaled (length, beam and depth factors), with her bow (its step: SCALES.bow, the stem's rake). */
  form(L: number, B: number, D: number, bow: number, sheer: number, forecastle?: { from: number; raise: number }): HullDefinition['form'];
  /**
   * A catamaran (owner, Oct 2026: the fast work cat; her form carries `catamaran`): two
   * demihulls under a bridge deck. Always twin engines, one in each hull, each with its
   * propeller and rudder under its own keel; no bow ramp or push fender.
   */
  catamaran?: boolean;
  /** Her wheelhouse can be offset across her (design.houseX; owner, Oct 2026: the landing craft's, a narrow one to port or starboard). */
  offsetHouse?: boolean;
  /** A raised foredeck can be chosen (design.fcLength; owner, Oct 2026: the fishing boat, then the tug). */
  raisedForedeck?: boolean;
  /**
   * How she rides at speed (CONFIG.shipyard.regimes): a planing hull (a fast boat's propeller,
   * the landing craft's per-area damping), a semi-displacement one (part planing; the
   * workboat's), or a displacement one. Her banking into turns and how she slams come from it
   * and her own deadrise.
   */
  regime: 'planing' | 'semi' | 'displacement';
  /** A square landing bow with its ramp (the landing craft's). */
  ramp: boolean;
  /**
   * A tug's square push bow (the small tug's): her own bow, which the bow choice leaves as
   * it is, faced with a rubber push fender (modules/pushFender).
   */
  pushBow?: boolean;
  /**
   * A big diesel's dry exhaust stacks up through the wheelhouse's aft corners and her cooling
   * water out of her side (the small tug's; owner, Oct 2026: the stern trawler's too). See
   * parts/hullDef.ts.
   */
  exhaustStacks?: boolean;
  /**
   * A landing bow (the landing craft, owner: a square platform on a planing hull): her own
   * forefoot, the bottom sweeping up to a raked square bow plate at the waterline under her
   * ramp, so she rides up a beach or a slipway. No bow choice: never plumb, never the deep stem.
   */
  landingBow?: boolean;
  /**
   * No longer offered (owner, Oct 2026: "the workboat is not really a class of hull, it's a
   * role"): not in the Hull step nor the brief's hull types. Kept, and in her place in this
   * list (a design code holds her index), so a design already on her still opens and builds.
   */
  retired?: boolean;
  /** Minimum open deck (m) aft of the house (cockpit) and forward of it. */
  cockpit: number;
  foredeck: number;
  /** Where the Shipyard page starts her when you pick her (her type's usual layout); the sliders move it all. */
  defaults: Partial<ShipDesign>;
  /**
   * What she's built of, if her type settles it (owner, Oct 2026): the gillnetter and the tug
   * steel, the landing craft and the pilot boat aluminium. Unset (the workboat), it's the
   * design's choice (design.material).
   */
  material?: Material;
  /** Her plating and framing heavier than the material's usual, by this factor (the tug's: built heavy, for pushing and towing). */
  scantlings?: number;
  /**
   * Permanent ballast (kg), low in her hull: the tug's, so she sits down to grip the water
   * and swing a big propeller (her propeller's size is bounded by her draught aft).
   */
  ballastKg?: number;
  /** Where her ballast's weight is, above her keel amidships (m; 0.15, low in her bilge, unless her type says). */
  ballastAboveKeel?: number;
  /** Her fuel tanks (litres), where her type sets them (a ship's, the harbour tug's); else about a litre a kW. */
  fuelL?: number;
  /**
   * Her size range grows beyond the usual (owner, Oct 2026: the landing craft's layout
   * "can actually extend to fairly big... proportionally in all directions"): the length
   * slider's upper half takes her up to this many times her base size, her beam with it and
   * her depth as its square root (see buildAt; the beam and depth sliders then tweak her
   * proportions). Its lower half is as every hull's (SCALES.scale).
   */
  growsTo?: number;
  /**
   * Her size range shrinks below the usual (owner, Oct 2026: "a really tiny tug"): her length
   * factor at the slider's first step (the usual is 0.8), up in equal ratios to her base size
   * at step 8; her beam and depth shrink with it (CONFIG.shipyard.shrink).
   */
  shrinksTo?: number;
  /**
   * A one-off (owner, Oct 2026: the harbour tug, "a fixed hull and ... all the parts of the
   * wheelhouse fixed, so basically predefined"): these choices are hers and stay so (withFixed:
   * the page hides their controls, the build keeps to them). What's left is the player's:
   * colours, the wheelhouse inside and its instruments, the deck gear she takes.
   */
  fixed?: Partial<ShipDesign>;
  /** What a one-off's steps say at their top: what's fixed, and what's the player's. */
  oneOffNote?: string;
  /** Her study's fendering (hulls/fendering.ts: the harbour tug's) is her hull protection: drawn on her, with its contacts. */
  fendering?: boolean;
  /**
   * How deep below her waterline her propellers may reach (m), where her stern is cut up
   * shallower (the harbour tug's, for drive pods that hang under it): her propeller's size
   * is bounded by it instead of her draught at the transom.
   */
  propDepth?: number;
  /** Her engine room rises into her deckhouse (a ship's machinery casing: the harbour tug's): her engines may stand up to its top where they're under it. */
  engineCasing?: boolean;
  /** Her shafts drawn as Z-drives on the Engine step (the harbour tug's: azimuth drives to come; enginePreview.ts zDrive). */
  zDrives?: boolean;
  /**
   * She tows over her bow (the harbour tug): her tow winch on the foredeck facing forward, her
   * tow point at the stem (a bow staple). With the stern roller fitted she tows over her stern
   * instead, from a towing hook aft of her house, as the small tug does.
   */
  towsOverBow?: boolean;
  /**
   * Interiors to start her furniture from (the foiling ferry's: owner, 28 Oct 2026, "2 options
   * for the interior ... 1 as ferry and 1 as explorer vessel i.e sofas etc."): each a name, a
   * line on it, and its pieces' pins (every other piece taken off). The Furniture step offers
   * them; each piece is still the player's to move or take off.
   */
  interiors?: { name: string; info: string; pins: Partial<ShipDesign> }[];
  /** A solar roof over her house charging her battery (the solar catamaran's; modules/solarRoof, parts/recipe.ts). */
  solarRoof?: boolean;
  /**
   * Her drive in pods on her foils' struts (the foiling ferry's; owner, 28 Oct 2026: "the
   * bulbs on the stern foils are her motors"): one at the foot of each strut her lines give a
   * pod (`podDragArea`: her aft struts, one under each hull), its motor inside it, so no engine
   * inside her. Each strut turns with her steering, its pod with it.
   */
  foilPods?: boolean;
}

/** Is her gearbox fixed with her type (a one-off's), so never matched by trial? */
export const gearFixed = (d: ShipDesign): boolean => DESIGN_HULLS[d.hull]?.fixed?.gear !== undefined;

/** A design with her one-off type's fixed choices (DesignHull.fixed) kept to. */
export function withFixed<D extends Pick<ShipDesign, 'hull'>>(d: D): D {
  const fixed = DESIGN_HULLS[d.hull]?.fixed;
  return fixed ? { ...d, ...fixed } : d;
}

/** What a hull and its houses are built of (CONFIG.shipyard.materials). */
export type Material = 'aluminium' | 'steel' | 'foam and plywood' | 'composite';
/**
 * Her length as a factor of her type's base (the length slider's step `i`): every hull's
 * 0.8 to 1.175 (SCALES.scale); a hull that `growsTo` more, the same up to her base size
 * (step 8), then up in equal ratios to `growsTo` at the top (step 15); a hull that
 * `shrinksTo` less, from that at step 0 up in equal ratios to her base size at step 8.
 */
export function sizeScale(base: Pick<DesignHull, 'growsTo' | 'shrinksTo'>, i: number): number {
  const top = base.growsTo;
  if (base.shrinksTo && i < 8) return Math.round(base.shrinksTo ** ((8 - i) / 8) * 1000) / 1000;
  if (!top || i <= 8) return SCALES.scale(i);
  return Math.round(top ** ((i - 8) / 7) * 1000) / 1000;
}

/** What this design is built of: her hull type's own material, else her choice. */
export function materialOf(d: Pick<ShipDesign, 'hull' | 'material'>): Material {
  return DESIGN_HULLS[d.hull]?.material ?? (d.material ? 'steel' : 'aluminium');
}

/**
 * Sections upright (no study rake): the game puts each station at its section's deck edge,
 * so a leaning section with a deep keel pushed the deck forward and the bow choice changed
 * her length. Her stem's rake is her keel's profile (bowKeel); her deck runs her length.
 */
export const UPRIGHT: [number, number][] = [
  [0, 0],
  [1, 0],
];

/**
 * Her deck line with more sheer (owner, Oct 2026, from a photo of a trawler: "this bow has got
 * quite a lot of sheer. The default one is quite flat"): `rise` m more at the stem, nothing
 * from `CONFIG.shipyard.sheer.from` of her length aft, rising as the square of the distance
 * forward of it (fair, steepest at the bow, as a sheer line is drawn). Resampled every 5 % of
 * her length forward of where it starts, so the curve stays fair between the stations.
 */
export function withSheer(sheer: [number, number][], rise: number): [number, number][] {
  if (!rise) return sheer;
  const t0 = CONFIG.shipyard.sheer.from;
  const ts = [...new Set([...sheer.map(([t]) => t), t0, ...Array.from({ length: 21 }, (_, i) => i / 20).filter((t) => t > t0)])].sort((a, b) => a - b);
  return ts.map((t) => [t, Math.round((curveAt(sheer, t) + rise * Math.max(0, (t - t0) / (1 - t0)) ** 2) * 1000) / 1000]);
}

/**
 * Lofted from the hull study, scaled (lengths along, half-breadths across, heights up), with
 * her bow reshaped: the game's stations are upright sections, so a bow's rake is its stem
 * line in profile, the keel meeting a raked stem under a deck that keeps its length (bowKeel).
 * `chinesRunOn`: her chines are measured from the uncut keel line, so they run on smoothly to
 * the stem and close in where the forefoot rises to them (a V hull: the pilot boat, owner).
 * A flat-bottomed hull's chine sweeps up with her forefoot instead (the landing craft's
 * square bow keeps its buoyancy that way).
 */
export function scaledStudy(d: HullDesign, L: number, B: number, D: number, bow: number | null, chinesRunOn = false, sheerRise = 0, forecastle?: { from: number; raise: number }): HullDesign {
  const by = (c: [number, number][], k: number) => c.map(([t, v]) => [t, v * k] as [number, number]);
  const sheer = withSheer(by(d.sheer, D), sheerRise);
  // No bow choice (a push bow): her own keel and forefoot, scaled.
  const fc = forecastle ? { forecastle } : {};
  if (bow === null) return { ...d, length: d.length * L, halfBeam: by(d.halfBeam, B), sheer, keel: by(d.keel, D), rake: UPRIGHT, wheelhouse: undefined, houses: undefined, ...fc };
  const bowed = bowKeel(by(d.keel, D), curveAt(sheer, 1), d.length * L, SCALES.bow(bow));
  const extra = bowed.stations.length ? { extraStations: bowed.stations } : {};
  // Her chines from her keel as cut (they sweep up her stem with the forefoot), or run on from
  // the uncut one; her paint line runs on from it either way (owner: straight to her stem).
  const lines = chinesRunOn ? { chineKeel: bowed.base } : { paintKeel: bowed.base };
  return { ...d, length: d.length * L, halfBeam: by(d.halfBeam, B), sheer, keel: bowed.keel, ...lines, rake: UPRIGHT, wheelhouse: undefined, houses: undefined, ...fc, ...extra };
}

/**
 * Her keel line with her bow reshaped (the Shipyard's bow choice, SCALES.bow), and the
 * uncut keel line her chines are measured from (`base`).
 * - Her keel: her own keel line (her rocker, owner) aft of 60 % of her length; forward of
 *   that, straight on along its slope there, at full depth to the stem (the study's own
 *   forefoot is replaced). No change of slope anywhere (owner: a nick behind the forefoot,
 *   when it was held level from 75 %).
 * - Her stem runs from 0.15 m under the stem head down to that line, raked `deg` from
 *   vertical overall (stem head to forefoot), and curved (owner, after a straight stem read
 *   as too raked): full forward, like the hull study's pilot boat, steeper at the deck
 *   (atan(tan deg / 2): 31 deg at 50) and running into the keel along it, with no knuckle.
 *   In profile it's a parabola added to the keel line. A 50 deg stem on a 2 m deep bow
 *   reaches back ~2.4 m (owner: the keel not cut away further back).
 * - A plumb stem, or one raked no more than CONFIG.shipyard.bow.straightUpTo (owner: "straight
 *   down, then a nice radius at the bottom"), is straight from the stem head, raked `deg`, and
 *   rounded into the keel by a forefoot radius (a circular arc, tangent to the stem and the
 *   keel). Her stations are closer round it (`stations`: extra stations for the loft), so it
 *   reads as a curve, not a corner.
 * Drawn through samples every 1.25 % of her length.
 */
export function bowKeel(keel: [number, number][], stemDeckY: number, lengthM: number, deg: number): { keel: [number, number][]; base: [number, number][]; stations: number[] } {
  const own = (t: number) => curveAt(keel, t);
  const from = 0.6;
  const slope = (own(from + 1e-4) - own(from - 1e-4)) / 2e-4;
  const line = (t: number) => (t < from ? own(t) : own(from) + slope * (t - from));
  const top = stemDeckY - 0.15;
  const rise = top - line(1);
  const c = CONFIG.shipyard.bow;
  const ts = Array.from({ length: 81 }, (_, i) => i / 80);
  const stations: number[] = [];
  // Her stem's height over her keel line, `d` m aft of her stem head.
  let over: (d: number) => number;
  if (deg <= c.straightUpTo + 1e-9) {
    // A straight stem raked b, and an arc of radius R tangent to it and to the keel line: its
    // centre (dc, R) aft of the stem, R off it; it meets the stem at dt, the keel at dc.
    const b = (deg * Math.PI) / 180;
    const R = c.forefootRadius * rise;
    const dc = (R + (rise - R) * Math.sin(b)) / Math.cos(b);
    const dt = dc - R * Math.cos(b);
    // (A plumb stem has no straight part in profile: her last station is the stem itself,
    // from the arc's top up to her deck.)
    over = (d) => (d <= dt && b > 1e-9 ? rise - d / Math.tan(b) : d < dc ? R - Math.sqrt(Math.max(0, R * R - (d - dc) ** 2)) : 0);
    // Stations round the arc, evenly by its angle (b at the stem's end .. 90 deg at the keel's).
    const n = c.radiusStations + 1;
    for (let k = 0; k <= n; k++) {
      const a = b + ((Math.PI / 2 - b) * k) / n;
      const d = dc - R * Math.cos(a);
      if (d > 1e-6 && d < lengthM) stations.push(1 - d / lengthM);
    }
  } else {
    // How far back from the stem head the stem meets the keel (m).
    const reach = rise * Math.tan((deg * Math.PI) / 180);
    over = (d) => (d < reach ? rise * (1 - d / reach) ** 2 : 0);
    // The forefoot, where the stem runs into the keel: sampled too.
    if (reach < lengthM) ts.push(1 - reach / lengthM);
  }
  const at = (t: number) => line(t) + over((1 - t) * lengthM);
  ts.push(...stations);
  ts.sort((a, b) => a - b);
  return { keel: ts.map((t) => [t, at(t)]), base: ts.map((t) => [t, line(t)]), stations };
}

/** The small tug's hull (its index in DESIGN_HULLS): a tug's wheelhouse kept forward, her towing hook amidships. */
export const TUG_HULL = 4;
/** The slow-revving tug diesel (its index in ENGINES): a boat with it is a tug, whatever her hull (the line-throwing gun). */
export const TUG_DIESEL = 3;
/** The harbour tug (DESIGN_HULLS), and her own engine (ENGINES: only she takes it). */
export const HARBOUR_TUG = 7;
export const HARBOUR_TUG_DIESEL = 5;

/**
 * The harbour tug's fixed choices (owner, Oct 2026: "this ship hull is basically a one-off"):
 * her hull as drawn (each size slider at x1), its bulwarks, bow and sheer; steel; her
 * fendering her protection (no strake or tyres, no bow fender); none of the trawl, dive or
 * landing gear, no outboards, stern drives or pods; her propellers in Kort nozzles, as her
 * drives' are; the 1850 kW diesels as a stand-in for her drives. Her wheelhouse and deckhouse
 * are the player's again (owner, 26 Oct 2026: "give me the control of the wheelhouse and
 * deckhouse as parametric parts"): HARBOUR_TUG_HOUSE is only where they start.
 */
const HARBOUR_TUG_FIXED: Partial<ShipDesign> = {
  ...fromSteps({ length: 8, beam: 8, depth: 8, bulwark: 6, bow: 0, engine: 5, twin: 1 }),
  sheer: 0,
  fcLength: 0,
  foreCabin: 0,
  material: 1,
  guard: 0,
  rails: 0,
  bowFender: 0,
  outboards: 0,
  sternDrive: 0,
  pods: 0,
  // (Her propellers in nozzles, as an azimuth drive's are: a tug's bollard pull.)
  nozzle: 1,
  // Her gearbox fixed too: her engines and drives are, so no matching by trial (CONFIG.shipyard.harbourTug.gear).
  gear: CONFIG.shipyard.harbourTug.gear,
  aFrame: 0,
  netDrum: 0,
  trawlWinches: 0,
  fishHold: 0,
  diveFrame: 0,
};

/**
 * Where the harbour tug's house starts (owner, Oct 2026, from photographs of a 25 m ASD tug):
 * a deckhouse about 2.4 m high over the middle of her length, a little forward of amidships,
 * side decks either side of it and its top walked with rails; the bridge on it narrow and
 * tall (owner: "much kind of more narrow, tall"), windows raked out all round, a deep roof;
 * raked stacks; her tow winch, towing over her bow (no stern roller: with one she tows over
 * her stern from a towing hook, as the small tug does).
 */
/** The solar catamaran's index in DESIGN_HULLS. */
export const SOLAR_CAT = 8;
/** Her electric pod motors' index in ENGINES (hers alone). */
export const SOLAR_MOTOR = 6;

/**
 * The solar catamaran, a one-off (owner, 26 Oct 2026: "a bit of a one-off build. I would say the
 * only thing that should be options are the number of batteries"): her hull, her motors and
 * pods, her solar roof and deck fittings fixed (SOLAR_CAT_FIXED). Her wheelhouse, its inside, her
 * controls and her furniture are the player's (owner, 27 Oct 2026: "the wheelhouse is not
 * configurable. I think I want to use the sliders, so I can move that around. Which means you
 * shouldn't predefine the furniture"): SOLAR_CAT_HOUSE is only where they start, as the harbour
 * tug's house is. Her battery and her paint are the player's too. Twin electric pod motors
 * (SOLAR_MOTOR), one pod under each hull's stern.
 */
// (Her paint is the player's too, owner 27 Oct 2026: "should get the paint options as well, the
// ones that are appropriate": her topsides, house, frames, roof, its top and her finish. Not a
// service livery's markings, which want a single hull.)
const SOLAR_PAINT = { paint: 5, houseColour: 0, frames: 0, roofPaint: 4, roofTop: 0, finish: 2 };
/** The choices on the Wheelhouse, Controls and Furniture steps: hers to make (but a cabin below: her hulls are too slim for one). */
const HOUSE_KEYS: (keyof ShipDesign)[] = [
  ...(['housePos', 'houseLength', 'houseWidth', 'houseX', 'headroom', 'floor', 'visor', 'lowerFront', 'windowRake', 'kick', 'facets', 'aftFacets', 'flare', 'sills', 'sideDoor', 'roofThickness', 'roofEdge', 'overhead', 'saloon', 'saloonFloor', 'saloonRoof', 'interior', 'chartTable', 'consoleSide', 'consoleLen'] as const),
  ...(['dhLength', 'dhHeight', 'dhWidth', 'dhRake', 'dhNarrow', 'dhWalk', 'dhAft', 'controls', 'oldSchool', 'touch', 'helmAssist'] as const),
  ...FURNITURE_KEYS,
  ...SEAT_FACES,
  ...Object.values(DASH_SLOTS),
  ...Object.values(PANEL_SLOTS),
];
const { battery: _battery, paint: _p, houseColour: _h, frames: _f, roofPaint: _r, roofTop: _t, finish: _fi, ...EVERYTHING } = DEFAULT_DESIGN;
const SOLAR_CAT_FIXED: Partial<ShipDesign> = {
  ...Object.fromEntries(Object.entries(EVERYTHING).filter(([k]) => !HOUSE_KEYS.includes(k as keyof ShipDesign))),
  ...fromSteps({ length: 8, beam: 8, depth: 8, bulwark: 0, bow: 0 }),
  hull: SOLAR_CAT,
  sheer: 0,
  foreCabin: 0,
  engine: SOLAR_MOTOR,
  // Her pods' reduction fixed (no matching): the step the yard's trial matches for her electric
  // motors, 27 Oct 2026 (3.14 : 1; about 10 kn flat out, the motors at their full torque just
  // under their rated revs).
  gear: 12,
  twin: 1,
  pods: 1,
  outboards: 0,
  sternDrive: 0,
  nozzle: 0,
  guard: 0,
  rails: 1,
  bowFender: 0,
  noAnchor: 0,
  lifeRing: 1,
};

/** Where her wheelhouse, inside and furniture start (the player's to change: SOLAR_CAT_FIXED). */
const SOLAR_CAT_HOUSE: Partial<ShipDesign> = {
  ...fromSteps({ visor: 1, lowerFront: 0 }),
  housePos: 0.5,
  houseLength: 5.4,
  houseWidth: 1,
  // Low and swept (owner, 27 Oct 2026: "the window as raked as possible ... more like 60";
  // "near standing headroom", the helm for sitting at): near standing headroom, the front swept
  // back 60°. (Her floor stays level with her bridge deck: sunk into it, her aft doorway and the
  // cockpit under the roof's overhang would be too low.)
  headroom: 1.95,
  floor: 0,
  windowRake: -60,
  // The front below her windows kicked out (owner, 27 Oct 2026: "kicked out at quite a steep
  // angle in front of the windows. And then the solar panels are on top of that sloped part"):
  // sloped back 60° (design.kick 12), its panels on it (parts/recipe.ts, modules/solarRoof).
  kick: 12,
  roofThickness: 0.12,
  roofEdge: 30,
  saloon: 4.4,
  saloonFloor: 0,
  saloonRoof: 0,
  overhead: 2.5,
  dhLength: 0,
  // A basic interior to start from (owner: "it should have a sort of basic interior"; each piece
  // movable or taken off on the Furniture step): a settee each side of the saloon, a galley aft
  // to starboard, a berth forward to port behind the helm and the head across from it (pins on
  // the grid: x from her centreline, metres forward of her transom).
  setteeAt: furnitureCell(-1.8, 6.5),
  setteeAt2: furnitureCell(1.8, 6.5),
  galleyAt: furnitureCell(1.8, 4.7),
  berthAt: furnitureCell(-1.8, 8.5),
  headAt: furnitureCell(1.8, 8.3),
};

/** The foiling ferry's index in DESIGN_HULLS. */
export const FOIL_FERRY = 9;
/** Her pod's twin motors' index in ENGINES (hers alone). */
export const FERRY_MOTOR = 7;

/**
 * The foiling electric ferry, a one-off (owner, 28 Oct 2026: her house, controls and furniture
 * "hers to shape" as the solar cat's, a contra-rotating pair of propellers on her pod, a
 * battery slider like the solar cat's): her hull and foils, her pod and motors and her deck
 * fittings fixed (FOIL_FERRY_FIXED); her wheelhouse, its inside, her controls and furniture,
 * her battery and paint the player's (the same keys as the solar cat's: HOUSE_KEYS).
 */
const FOIL_FERRY_FIXED: Partial<ShipDesign> = {
  ...Object.fromEntries(Object.entries(EVERYTHING).filter(([k]) => !HOUSE_KEYS.includes(k as keyof ShipDesign))),
  ...fromSteps({ length: 8, beam: 8, depth: 8, bulwark: 0, bow: 0 }),
  hull: FOIL_FERRY,
  sheer: 0,
  foreCabin: 0,
  engine: FERRY_MOTOR,
  // Her pod's reduction fixed (no matching), 1.6 : 1 (owner, 28 Oct 2026, from the choppy-sea
  // test): enough torque at her propellers to lift her over the hump into a Moderate sea; about
  // 28 kn flat out in calm water, her motors at their rated revs. (The trial's match for top
  // speed, 1.33 : 1, gave 34 kn but left her stuck on her hulls at 10-12 kn into a Moderate sea.)
  gear: 5,
  twin: 0,
  pods: 1,
  outboards: 0,
  sternDrive: 0,
  nozzle: 0,
  guard: 0,
  rails: 1,
  bowFender: 0,
  noAnchor: 0,
  lifeRing: 1,
};

/** Her ferry interior: rows of seats either side of an aisle, facing forward (pins: x from her centreline, metres forward of her transom). */
const FERRY_SEATS: Partial<ShipDesign> = Object.fromEntries([-1.35, -0.75, 0.75, 1.35].flatMap((x, i) => [5.9, 5.0, 4.1].map((z, j) => [FURNITURE_SLOTS.seat[i * 3 + j], furnitureCell(x, z)])));
/**
 * Her explorer interior (owner, 28 Oct 2026: "sofas etc."): to port a sofa aft, a table and a
 * berth forward; to starboard a sofa aft, the galley, the head forward; a TV on the starboard wall.
 */
const EXPLORER: Partial<ShipDesign> = {
  setteeAt: furnitureCell(-1.4, 3.5),
  messAt: furnitureCell(-1.4, 4.9),
  berthAt: furnitureCell(-1.35, 7.4),
  setteeAt2: furnitureCell(1.4, 3.5),
  galleyAt: furnitureCell(1.4, 5.4),
  headAt: furnitureCell(1.4, 7.6),
  tvAt: furnitureCell(1.8, 4.4),
};

/**
 * Where her house and cabin start (the player's to change): a long, low passenger cabin with
 * big windows nearly the length of her, her helm at its front; her ferry interior (FERRY_SEATS).
 */
const FOIL_FERRY_HOUSE: Partial<ShipDesign> = {
  ...fromSteps({ visor: 1, lowerFront: 0 }),
  housePos: 0.45,
  houseLength: 4.0,
  houseWidth: 1,
  headroom: 1.95,
  floor: 0,
  windowRake: -45,
  kick: 0,
  roofThickness: 0.12,
  roofEdge: 30,
  saloon: 3.6,
  saloonFloor: 0,
  saloonRoof: 0,
  overhead: 0,
  dhLength: 0,
  ...FERRY_SEATS,
};

const HARBOUR_TUG_HOUSE: Partial<ShipDesign> = {
  ...fromSteps({ visor: 1, lowerFront: 0 }),
  housePos: 0.55,
  houseLength: 3.8,
  houseWidth: 0.55,
  headroom: 2.5,
  floor: 0,
  windowRake: 10,
  roofThickness: 0.3,
  roofEdge: 45,
  dhLength: 2.0,
  dhHeight: 2.4,
  dhWidth: 0.8,
  dhRake: 0,
  dhNarrow: 0,
  dhWalk: 1,
  dhAft: 2.0,
  saloon: 0,
  facets: 0,
  aftFacets: 0,
  flare: 1,
  sills: 0,
  houseX: 20,
  stackStyle: 0,
  // Her stacks on the deckhouse at its aft end, in square casings (owner, Oct 2026: the reference tug's "standalone box").
  stackMount: 1,
  stackPos: 0,
  stackCasing: 1,
  towWinch: 1,
  sternRoller: 0,
  winchAt: 0,
};

export const DESIGN_HULLS: DesignHull[] = [
  {
    name: 'Landing craft: 9 m aluminium, square landing bow with a ramp',
    material: 'aluminium',
    growsTo: 2.5,
    // Her bow is her own: the landing bow (landingCraftLines), no bow choice.
    form: (L, B, D, _bow, sheer) => ({ kind: 'lofted', design: scaledStudy(landingCraftLines(), L, B, D, null, false, sheer) }),
    regime: 'planing',
    ramp: true,
    landingBow: true,
    offsetHouse: true,
    cockpit: 1.0,
    foredeck: 1.6,
    defaults: fromSteps({ length: 8, beam: 8, depth: 8, bulwark: 2, bow: 2, housePos: 4, houseLength: 2, houseWidth: 7, headroom: 3, floor: 2, visor: 1, roofThickness: 0, roofEdge: 1, windowRake: 4, lowerFront: 0, engine: 1, twin: 0 }),
  },
  {
    name: 'Gillnetter: 9.75 m, beamy and shallow, flat open foredeck',
    material: 'steel',
    form: (L, B, D, bow, sheer, forecastle) => ({ kind: 'lofted', design: scaledStudy(study('gillnetter'), L, B, D, bow, false, sheer, forecastle) }),
    raisedForedeck: true,
    regime: 'planing',
    ramp: false,
    cockpit: 1.0,
    foredeck: 1.5,
    // The house forward of amidships, her working deck aft (owner, Oct 2026: as the trawler she
    // was shown with; a raised foredeck then ends forward of the house or runs on under it).
    // (A bowpicker has it right aft: housePos 0.)
    defaults: fromSteps({ length: 8, beam: 8, depth: 8, bulwark: 3, bow: 2, housePos: 11, houseLength: 6, houseWidth: 7, headroom: 3, floor: 3, visor: 1, roofThickness: 0, roofEdge: 1, windowRake: 4, lowerFront: 0, engine: 1, twin: 0 }),
  },
  {
    name: 'Workboat: 12 m semi-displacement, hard chine, fine entry',
    retired: true,
    form: (L, B, D, bow, sheer) => {
      const h = CONFIG.vessels.workboat.hull;
      return {
        kind: 'chine',
        params: { ...h, length: h.length * L, beamDeck: h.beamDeck * B, beamChine: h.beamChine * B, keelY: h.keelY * D, chineYAft: h.chineYAft * D, chineYBow: h.chineYBow * D, deckYAft: h.deckYAft * D, deckYBow: h.deckYBow * D + sheer, forefoot: { from: 0.55, rise: 1, stemDeg: SCALES.bow(bow) } },
      };
    },
    // (Semi-displacement, owner: part of her weight on her bottom's lift at speed.)
    regime: 'semi',
    ramp: false,
    cockpit: 1.5,
    foredeck: 2.0,
    // As the game's workboat: the house a little forward of amidships, her working deck aft.
    defaults: fromSteps({ length: 8, beam: 8, depth: 8, bulwark: 2, bow: 1, housePos: 9, houseLength: 5, houseWidth: 7, headroom: 3, floor: 3, visor: 2, roofThickness: 1, roofEdge: 1, windowRake: 6, lowerFront: 0, engine: 2, twin: 0 }),
  },
  // New hull types go on the end: a design's code holds its hull's place in this list.
  {
    name: 'Pilot boat: 14 m deep-V, spray chine, fine entry, well-raked stem',
    material: 'aluminium',
    form: (L, B, D, bow, sheer) => ({ kind: 'lofted', design: scaledStudy(study('pilot'), L, B, D, bow, true, sheer) }),
    regime: 'planing',
    ramp: false,
    cockpit: 1.6,
    foredeck: 2.6,
    // A pilot / crew boat: a long house amidships with walkaround side decks (the Targa and
    // Safehaven types), low bulwarks, a well-raked stem, twin engines.
    defaults: fromSteps({ length: 8, beam: 8, depth: 8, bulwark: 0, bow: 4, housePos: 9, houseLength: 12, houseWidth: 6, headroom: 3, floor: 3, visor: 2, roofThickness: 1, roofEdge: 2, windowRake: 6, lowerFront: 0, engine: 2, twin: 1, paint: 1 }),
  },
  {
    name: 'Small tug: 13 m, beamy and deep, a square push bow with a rubber push fender',
    material: 'steel',
    scantlings: 1.5,
    ballastKg: 18000,
    // Down to a 7 m tug (owner, Oct 2026: "a really tiny tug").
    shrinksTo: 0.54,
    // Her bow is her own (a square push plate, the bottom sweeping up to it): no bow choice.
    form: (L, B, D, _bow, sheer, forecastle) => ({ kind: 'lofted', design: scaledStudy(study('pushTug'), L, B, D, null, false, sheer, forecastle) }),
    // A raised foredeck as the fishing boat's (owner, Oct 2026): a harbour tug's forecastle.
    raisedForedeck: true,
    regime: 'displacement',
    ramp: false,
    pushBow: true,
    exhaustStacks: true,
    // A long towing deck aft; the foredeck short, up to the push bow.
    cockpit: 3.0,
    foredeck: 1.6,
    // The owner's reference: a short house forward of amidships, raised to see over the
    // high bow, windows a little reverse-raked; a low towing deck aft; twin screws; a
    // rubbing strake; red and grey. One slow-revving tug diesel (owner: an engine with the
    // tug in mind; single or twin).
    defaults: fromSteps({ length: 8, beam: 8, depth: 8, bulwark: 4, bow: 0, housePos: 11, houseLength: 4, houseWidth: 4, headroom: 3, floor: 5, visor: 1, roofThickness: 1, roofEdge: 2, windowRake: 5, lowerFront: 0, engine: 3, twin: 0, paint: 7, guard: 2 }),
  },
  {
    // Step 3 toward a trawler (owner, Oct 2026, from a 24 m trawler's general arrangement): a
    // hull type of her own, 16 to 23.5 m (the length slider's usual 0.8 to 1.175 of 20 m). Not
    // in the design code (a sixth type would change how every earlier code reads): she
    // travels as a link or file.
    name: 'Stern trawler: 20 m hard-chine steel, a whaleback forward, a long working deck aft',
    material: 'steel',
    scantlings: CONFIG.shipyard.sternTrawler.scantlings,
    ballastKg: CONFIG.shipyard.sternTrawler.ballastKg,
    form: (L, B, D, bow, sheer, forecastle) => ({ kind: 'lofted', design: scaledStudy(study('sternTrawler'), L, B, D, bow, false, sheer, forecastle) }),
    // Her whaleback: a raised foredeck as the fishing boat's and the tug's, her wheelhouse standing on it.
    raisedForedeck: true,
    regime: 'displacement',
    ramp: false,
    // The working deck aft for the net drum, the trawl winches and the A-frame; the foredeck short under the whaleback.
    cockpit: 6.0,
    foredeck: 2.0,
    // Her exhaust as the tug's (owner, Oct 2026): stacks up through the wheelhouse's aft
    // corners, her cooling water out of her side.
    exhaustStacks: true,
    // A trawler's: the wheelhouse forward of amidships on the whaleback, which runs aft under
    // it; one slow-revving diesel (the 750 kW, owner, Oct 2026: she needed a bigger engine)
    // turning a big propeller in a Kort nozzle; the trawl gear,
    // its net drum and winches, and a fish hold; fishing green.
    defaults: { ...fromSteps({ length: 8, beam: 8, depth: 8, bulwark: 7, bow: 2, housePos: 12, houseLength: 12, houseWidth: 5, headroom: 3, floor: 3, visor: 1, roofThickness: 1, roofEdge: 2, windowRake: 5, lowerFront: 0, engine: 4, twin: 0, paint: 3 }), nozzle: 1, fcLength: 2, fcHeight: 2, aFrame: 1, netDrum: 1, trawlWinches: 1, fishHold: 1, sternRoller: 0 },
  },
  {
    // The fast catamaran workboat (owner, Oct 2026: "a catamaran workboat, a wider working
    // platform for cranes etc., the wheelhouse forward or aft, stiffer in roll, fast: 25-28 kn
    // on all sizes with the engines we have"): the hull study's `workCat` (the hull
    // modifications chat drew her lines and her two-hull physics). 10 to 14.7 m (the usual 0.8
    // to 1.175 of 12.5 m). Her demihulls' spacing scales with her beam, her wet deck's height
    // over the DWL with her depth. Her bows take the bow choice (owner, Oct 2026; plumb by
    // default, as most work cats). Not in the design code: she travels as a link or file.
    name: 'Fast catamaran: 12.5 m aluminium, two slim hulls under a wide bridge deck',
    scantlings: CONFIG.shipyard.catamaran.scantlings,
    material: 'aluminium',
    catamaran: true,
    form: (L, B, D, bow, sheer) => {
      const d = scaledStudy(study('workCat'), L, B, D, bow, false, sheer);
      const cat = study('workCat').catamaran!;
      return { kind: 'lofted', design: { ...d, catamaran: { spacing: cat.spacing * B, tunnel: cat.tunnel * D } } };
    },
    // Semi-planing slim hulls (her resistance is a catamaran's: vessel/catamaran.ts).
    regime: 'semi',
    ramp: false,
    cockpit: 2.0,
    foredeck: 1.5,
    // The wheelhouse forward over a wide working deck aft (it can go aft: Position), twin
    // engines, one in each hull (her hulls are too slim for one engine on her centreline).
    // Twin 400 kW as she comes: twin 280s make about 24.4 kn on her redrawn lines, under the
    // owner's 25 to 28 (re-measured 23 Oct 2026).
    // A bow fender as she comes (owner, Oct 2026: the usual crew-transfer boat is a catamaran).
    defaults: { ...fromSteps({ length: 8, beam: 8, depth: 8, bulwark: 1, bow: 0, housePos: 12, houseLength: 5, houseWidth: 5, headroom: 3, floor: 3, visor: 1, roofThickness: 1, roofEdge: 1, windowRake: 6, lowerFront: 0, engine: 2, twin: 1, paint: 0 }), bowFender: 1 },
  },
  {
    // The harbour tug (owner, Oct 2026: "this ship hull is basically a one-off. It doesn't
    // need to be parametric"): the hull study's `harbourTug` as she is (the hull modifications
    // chat's lines: an azimuth stern drive tug of a real 25 m tug's size and type), her
    // hull fixed (HARBOUR_TUG_FIXED), her house the player's (from HARBOUR_TUG_HOUSE). Not in the design code: a link or file.
    name: 'Harbour tug: 25 m steel, a one-off hull, a raised bridge on a deckhouse',
    material: 'steel',
    scantlings: CONFIG.shipyard.harbourTug.scantlings,
    ballastKg: CONFIG.shipyard.harbourTug.ballastKg,
    ballastAboveKeel: CONFIG.shipyard.harbourTug.ballastAboveKeel,
    fuelL: CONFIG.shipyard.harbourTug.fuelL,
    // As drawn: no scaling, no bow choice (her sliders are fixed at x1).
    form: () => ({ kind: 'lofted', design: scaledStudy(study('harbourTug'), 1, 1, 1, null, false, 0) }),
    regime: 'displacement',
    ramp: false,
    exhaustStacks: true,
    fendering: true,
    towsOverBow: true,
    propDepth: CONFIG.shipyard.harbourTug.propDepth,
    engineCasing: true,
    zDrives: true,
    cockpit: 6.0,
    foredeck: 4.0,
    fixed: HARBOUR_TUG_FIXED,
    oneOffNote: 'Her hull is a one-off, fixed as she’s drawn, and so are her fendering and her engines. Her wheelhouse and deckhouse, her colours, the inside and her deck gear are yours to choose.',
    // Her colours as drawn: dark blue-grey topsides, a white house, a red roof.
    defaults: { ...HARBOUR_TUG_HOUSE, ...HARBOUR_TUG_FIXED, paint: 2, houseColour: 1, roofPaint: 6, lifeRing: 1 },
  },
  {
    // The solar catamaran (owner, 26 Oct 2026, the hull modifications chat's step 2): the hull
    // study's `solarCat` as she is (16 x 5.2 m, two very slim hulls under a bridge deck, a
    // wave-piercing centre bow; foam-cored plywood). Her hull, motors and deck fixed (SOLAR_CAT_FIXED), her house the player's (from SOLAR_CAT_HOUSE).
    // Not in the design code: a link or file.
    name: 'Solar catamaran: 16 m foam and plywood, solar and battery power, a one-off',
    material: 'foam and plywood',
    catamaran: true,
    // No fuel of her own: her motors run on her battery (a token tank, as every recipe has one, never drawn on).
    fuelL: 40,
    // As drawn: no scaling, no bow choice; her centre bow kept (catamaran.centreBow).
    form: () => ({ kind: 'lofted', design: { ...scaledStudy(study('solarCat'), 1, 1, 1, null, false, 0), catamaran: study('solarCat').catamaran } }),
    regime: 'displacement',
    ramp: false,
    cockpit: 2.5,
    foredeck: 2.0,
    solarRoof: true,
    fixed: SOLAR_CAT_FIXED,
    oneOffNote: 'Her hull is a one-off, fixed as she’s drawn, and so are her electric pods, her solar roof (it follows her house) and her deck fittings. Yours to choose: her wheelhouse, its inside, her controls and her furniture, her battery (Engine step) and her paint.',
    // Black, as her pictures (owner: "Of course, it needs to be black"): black topsides, her paint's own light house, a black roof edge.
    defaults: { ...SOLAR_CAT_HOUSE, ...SOLAR_CAT_FIXED, ...SOLAR_PAINT, battery: BATTERY_DEFAULT },
  },
  {
    // The foiling electric ferry (owner, 28 Oct 2026; the hull modifications chat's `foilFerry`):
    // her lines and foils as drawn (12 x 4.5 m, two deep-V hulls under a high bridge deck, a main
    // foil forward and an aft foil on the strut that carries her pod). Her hull, foils, pod and
    // deck fixed (FOIL_FERRY_FIXED), her house the player's (from FOIL_FERRY_HOUSE).
    // Not in the design code: a link or file.
    name: 'Foiling electric ferry: 12 m composite, flies on hydrofoils at 25 kn, a one-off',
    material: 'composite',
    catamaran: true,
    // No fuel of her own (a token tank, never drawn on), as the solar catamaran.
    fuelL: 40,
    // (Her pods' struts turn with her pods: they steer her, physics/foils.ts `steered`.)
    form: () => {
      const d = study('foilFerry');
      return { kind: 'lofted', design: { ...scaledStudy(d, 1, 1, 1, null, false, 0), catamaran: d.catamaran, ...(d.foils ? { foils: { ...d.foils, struts: d.foils.struts.map((s) => (s.podDragArea ? { ...s, steered: true } : s)) } } : {}) } };
    },
    // (Her hulls run on their bottoms until her foils lift her: a fast boat's propellers.)
    regime: 'planing',
    ramp: false,
    cockpit: 1.5,
    foredeck: 1.5,
    foilPods: true,
    interiors: [
      { name: 'Ferry', info: 'Twelve seats in rows either side of an aisle, facing forward: a passenger ferry.', pins: FERRY_SEATS },
      { name: 'Explorer', info: 'Sofas aft either side, a table, a galley, a berth and a head, a TV on the wall: for living aboard and exploring.', pins: EXPLORER },
    ],
    fixed: FOIL_FERRY_FIXED,
    oneOffNote: 'Her hull and hydrofoils are a one-off, fixed as she’s drawn, and so are her electric pods (one at the foot of each aft foil’s strut, a motor in each, a lever each) and her deck fittings. Yours to choose: her wheelhouse and cabin, its inside, her controls and her furniture, her battery (Engine step) and her paint.',
    // White, a light house, a dark roof, as new; her biggest battery.
    defaults: { ...FOIL_FERRY_HOUSE, ...FOIL_FERRY_FIXED, paint: 4, houseColour: 0, frames: 0, roofPaint: 4, roofTop: 0, finish: 2, battery: BATTERY_STEPS - 1 },
  },
];

/**
 * Engine packages: power, weight, sound, and how quickly its governor adds fuel.
 *   ratedRpm   its rated speed. The first three are high-speed diesels rated at 1800 rpm. The
 *              tug's (owner, Oct 2026) is a slow-revving heavy-duty diesel: bigger cylinders
 *              turning slower, so far more torque for its power (torque = power / shaft speed:
 *              at 1000 rpm, 1.8 times a 1800 rpm engine's). Its torque curve, idle, governor
 *              droop and starter are the 1800 rpm engine's with every rpm scaled to it, so it
 *              is slower all through its range (owner): idling at 333 rpm, flat out near 1000.
 *              It goes on a shaft only (design.ts SHAFT_ONLY_ENGINES), singly or as a twin
 *              (owner, Oct 2026: more power for the tugs; it was single only).
 *   propMaxM   the biggest propeller it's given (m). Slow revs (and a lower gearbox ratio to
 *              suit) turn a bigger, slower propeller: it throws more water slower, which pulls
 *              harder for the same power, what a tug wants (see `propD` in buildDesign).
 *   pricePerKw  GBP per kW (a slow, heavy engine costs more for its power).
 *   size       its length (with the gearbox), width and height (m), about right for its power
 *              and weight: what has to fit under the cabin floor (machinery.ts) and what the
 *              Shipyard draws (enginePreview.ts). The tug diesel is tall: it wants a deep hull.
 *   about      what the Engine step says about it, if more than its weight.
 */
export const ENGINES = [
  { name: '150 kW diesel (straight six)', kw: 150, kg: 600, voice: 'inlineSix' as const, rackRise: 1.2, ratedRpm: 1800, propMaxM: 1.05, pricePerKw: 120, size: [1.47, 0.62, 0.78] as const },
  { name: '280 kW turbo diesel (V8)', kw: 280, kg: 800, voice: 'v8' as const, rackRise: 2.0, ratedRpm: 1800, propMaxM: 1.05, pricePerKw: 120, size: [1.32, 0.86, 0.8] as const },
  { name: '400 kW turbo diesel (V8)', kw: 400, kg: 1100, voice: 'v8' as const, rackRise: 2.0, ratedRpm: 1800, propMaxM: 1.05, pricePerKw: 120, size: [1.52, 0.96, 0.9] as const },
  { name: '450 kW slow-revving tug diesel (big straight six, 1000 rpm)', kw: 450, kg: 2200, voice: 'inlineSix' as const, /* owner, Oct 2026: tried the big-six voice (CONFIG.engineVoices.bigSix) and preferred this one */ rackRise: 1.0, ratedRpm: 1000, idleRpm: 450, propMaxM: 1.4, pricePerKw: 170, size: [2.65, 0.95, 1.35] as const, about: 'Slow-revving and heavy, for towing: more torque, turning a bigger propeller, so a harder pull for its power. Slower to answer the throttle.' },
  // A bigger one of the same kind (owner, Oct 2026: "the 24-metre trawler is going to need a
  // bigger engine ... 750 kilowatt ... based on the straight six"): a medium-speed straight six,
  // the tug diesel's revs, with bigger cylinders; it turns the biggest propeller, for a stern
  // trawler towing her net or a big tug. Shaft only, as the tug diesel.
  { name: '750 kW medium-speed diesel (big straight six, 1000 rpm)', kw: 750, kg: 4800, voice: 'inlineSix' as const, rackRise: 0.9, ratedRpm: 1000, idleRpm: 420, propMaxM: 1.9, pricePerKw: 180, size: [3.3, 1.15, 1.7] as const, about: 'The biggest, for a trawler or a big tug: a medium-speed straight six turning the biggest, slowest propeller, for a hard pull on a net or a tow. Heavy and tall: it wants a long, deep hull.' },
  // The harbour tug's (owner, Oct 2026: her real power, 2 x 1850 kW, until her azimuth drives
  // come): a big high-power diesel of her size, on a shaft for now, turning a propeller as big
  // as her draught aft allows. Heavy and long: only she has the room for it.
  { name: '1850 kW harbour tug diesel (V16, 1600 rpm)', kw: 1850, kg: 8500, voice: 'v16' as const, rackRise: 1.2, ratedRpm: 1600, idleRpm: 600, propMaxM: 2.4, pricePerKw: 200, size: [4.4, 1.7, 2.1] as const, only: [HARBOUR_TUG] as readonly number[], about: 'The harbour tug’s: a big high-power diesel for her bollard pull. A stand-in on a shaft until her azimuth drives come.' },
  // The solar catamaran's (owner, 26 Oct 2026): an electric motor driving each of her pods,
  // from her battery (in the game: physics/electricMotor.ts, through her pods; 27 Oct 2026).
  { name: '25 kW electric pod motor', kw: 25, kg: 60, voice: 'electric' as const, rackRise: 2.0, ratedRpm: 1800, propMaxM: 0.7, pricePerKw: 300, size: [0.7, 0.4, 0.4] as const, only: [SOLAR_CAT] as readonly number[], electric: true, about: 'The solar catamaran’s: an electric motor for each of her pods, quiet and clean, running on her battery.' },
  // The foiling ferry's (owner, 28 Oct 2026: "the bulbs on the stern foils are her motors"):
  // a motor in each of her two pods, at the feet of her aft struts, each on its own lever
  // (physics/electricMotor.ts, through her pods). Together the 190 kW she had in one pod.
  { name: '95 kW electric pod motor', kw: 95, kg: 55, voice: 'electric' as const, rackRise: 2.0, ratedRpm: 1800, propMaxM: 0.6, pricePerKw: 350, size: [0.8, 0.26, 0.26] as const, only: [FOIL_FERRY] as readonly number[], electric: true, about: 'The foiling ferry’s: an electric motor in each of her two pods, at the feet of her aft foils’ struts, each on its own lever. Together enough to lift her over the hump onto her foils.' },
];

/** Paints: the hull mesh's colours (vessel/view/hullMesh.ts); `{}` is the workboat's own. */
export const LIVERIES: { name: string; livery: Livery }[] = [
  { name: 'Aluminium grey', livery: { bottom: 0x2f3438, topsides: 0xb9bec2, deck: 0x8a9096, house: 0xc9cdcf, roof: 0xd3d6d8, rail: 0xaab0b4, floor: 0x8a9096 } },
  { name: 'Workboat orange', livery: {} },
  { name: 'Navy blue', livery: { bottom: 0x8c2a22, topsides: 0x1f3a5c, deck: 0x7d8a78, house: 0xeceae2, roof: 0xb9bdb6 } },
  { name: 'Fishing green', livery: { bottom: 0x8c2a22, topsides: 0x2f5a3a, deck: 0x7d7a6a, house: 0xeceae2, roof: 0xb9bdb6 } },
  { name: 'White', livery: { bottom: 0x8c2a22, topsides: 0xeeeeea, deck: 0x8a9096, house: 0xf4f4f0, roof: 0xd8d8d2 } },
  { name: 'Black', livery: { bottom: 0x8c2a22, topsides: 0x22262a, deck: 0x6f746f, house: 0xe6e6df, roof: 0xb9bdb6 } },
  { name: 'Pilot yellow', livery: { bottom: 0x2f3438, topsides: 0xe0b020, deck: 0x7d8a78, house: 0xeceae2, roof: 0xb9bdb6 } },
  { name: 'Rescue red', livery: { bottom: 0x2f3438, topsides: 0xc0302a, deck: 0x7d8a78, house: 0xeceae2, roof: 0xb9bdb6 } },
  // More (owner, Oct 2026: "a few more options for paint colors"); after the first 8, so a
  // boat in one of these travels as a link or file (design.ts CODE_PAINTS).
  { name: 'Teal', livery: { bottom: 0x8c2a22, topsides: 0x1f6f6a, deck: 0x7d8a78, house: 0xeceae2, roof: 0xb9bdb6 } },
  { name: 'Burgundy', livery: { bottom: 0x2f3438, topsides: 0x6e1f2a, deck: 0x7d7a6a, house: 0xeceae2, roof: 0xb9bdb6 } },
  { name: 'Sky blue', livery: { bottom: 0x8c2a22, topsides: 0x5b8fbf, deck: 0x8a9096, house: 0xf4f4f0, roof: 0xd8d8d2 } },
  { name: 'Slate grey', livery: { bottom: 0x8c2a22, topsides: 0x56606a, deck: 0x7d8a78, house: 0xeceae2, roof: 0xb9bdb6 } },
  { name: 'Sand', livery: { bottom: 0x2f3438, topsides: 0xc8b48a, deck: 0x7d7a6a, house: 0xf4f4f0, roof: 0xd8d8d2 } },
  { name: 'Royal blue', livery: { bottom: 0x2f3438, topsides: 0x2850a0, deck: 0x8a9096, house: 0xf4f4f0, roof: 0xd8d8d2 } },
];

/** Roof colours (owner): the hull's own topsides colour (null), or one of its own; an orange roof is common on workboats. */
/**
 * The wheelhouse's colour (owner, Oct 2026: "an option to color the wheelhouse"; design.houseColour):
 * her paint's own (null, the first), or one of these. Its walls, outside; its roof is the Roof's.
 */
export const HOUSE_PAINTS: { name: string; colour: number | null }[] = [
  { name: 'Like her paint', colour: null },
  { name: 'White', colour: 0xf2f2ee },
  { name: 'Cream', colour: 0xe9e1c8 },
  { name: 'Light grey', colour: 0xc4c8ca },
  { name: 'Dark grey', colour: 0x4a4f54 },
  { name: 'Red', colour: 0xc0302a },
  { name: 'Blue', colour: 0x1f3a5c },
  { name: 'Green', colour: 0x2f5a3a },
  { name: 'Orange', colour: 0xe0661f },
  { name: 'Yellow', colour: 0xe0b020 },
  // More (owner, Oct 2026); after the first 10, so they travel as a link or file (design.ts CODE_HOUSE_COLOURS).
  { name: 'Teal', colour: 0x1f6f6a },
  { name: 'Burgundy', colour: 0x6e1f2a },
  { name: 'Sky blue', colour: 0x5b8fbf },
  { name: 'Sand', colour: 0xc8b48a },
];

/**
 * The window frames round the wheelhouse glass, and its mullions and posts (owner, Oct 2026:
 * "whether the frames around the windows are black or white"; design.frames). The white is a
 * shade off the house whites: the house's walls are told from its frames by their colour
 * (hullMesh lineInside lines only the walls inside).
 */
export const FRAME_COLOURS: { name: string; colour: number }[] = [
  { name: 'Black', colour: 0x16191b },
  { name: 'White', colour: 0xfafaf7 },
];

export const ROOF_PAINTS: { name: string; colour: number | null }[] = [
  { name: 'Like hull', colour: null },
  { name: 'Orange', colour: 0xe0661f },
  { name: 'White', colour: 0xeeeeea },
  { name: 'Grey', colour: 0xb9bdb6 },
  { name: 'Black', colour: 0x22262a },
  // More (owner, Oct 2026); after the first 5, so they travel as a link or file (design.ts CODE_ROOF_PAINTS).
  { name: 'Cream', colour: 0xe9e1c8 },
  { name: 'Red', colour: 0xc0302a },
  { name: 'Blue', colour: 0x1f3a5c },
  { name: 'Sand', colour: 0xc8b48a },
];

/**
 * The roof's top (owner: the eyebrow, as on the Alaskan's tan roof with its light-grey top):
 * one colour, or a panel set in from the edges in a second colour (hullMesh: `roofInset` in
 * from the top's edge), so the roof's edge shows as a band round it.
 */
export const ROOF_TOPS: { name: string; colour: number | null }[] = [
  { name: 'One colour', colour: null },
  { name: 'Light grey', colour: 0xc9ccc4 },
  { name: 'White', colour: 0xeeeeea },
  { name: 'Sand', colour: 0xc8b48a },
  { name: 'Dark grey', colour: 0x4a4f54 },
  // More (owner, Oct 2026); after the first 5, so they travel as a link or file (design.ts CODE_ROOF_TOPS).
  { name: 'Cream', colour: 0xe9e1c8 },
  { name: 'Black', colour: 0x22262a },
  { name: 'Orange', colour: 0xe0661f },
];

/** Her livery with the roof's colour chosen, and its top's (the workboat orange livery is `{}`: the workboat's own orange topsides), and the finish inside (none: the wood lining) and the floor (none: matting). */
export function liveryOf(d: ShipDesign): Livery {
  const l = LIVERIES[d.paint].livery;
  const top = ROOF_TOPS[d.roofTop ?? 0]?.colour;
  const house = HOUSE_PAINTS[d.houseColour ?? 0]?.colour;
  return {
    ...l,
    roof: ROOF_PAINTS[d.roofPaint].colour ?? l.topsides ?? 0xd9622b,
    ...(top != null ? { roofTop: top } : {}),
    ...(house != null ? { house } : {}),
    ...(d.frames ? { frame: FRAME_COLOURS[d.frames].colour } : {}),
    // Her finish: how used her hull looks (CONFIG.shipyard.finish).
    weathering: CONFIG.shipyard.finish[d.finish ?? 0] ?? CONFIG.shipyard.finish[0],
    ...(d.interior ? { interior: d.interior } : {}),
    ...(d.cabinFloor ? { cabinFloor: d.cabinFloor } : {}),
  };
}

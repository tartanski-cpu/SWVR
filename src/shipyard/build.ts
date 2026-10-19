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
 */
import { bottomAt as bottomUnder, FLANGE_SHARE, halfSection, layShaft, sternDriveLine, twinEngineX, type ShaftLine } from './machinery';
import { BODY_RADIUS, CONFIG } from '../config';
import landingCraftRecipe from '../boats/landingCraft.json';
import { DESIGNS } from '../hulls/designs';
import { curveAt, type HullDesign } from '../hulls/loft';
import { hullFormOf, hullQueries, type HullDefinition } from '../modular/hull';
import { inertiaFromGyradius, lightshipOf } from '../modular/massProperties';
import type { Mount, Recipe } from '../modular/recipe';
import type { Socket } from '../modular/socket';
import type { HullForm } from '../vessel/hullForm';
import type { DoorStep, FloorLevel, HouseShape, LayoutConfig, Livery } from '../vessel/vesselDef';
import type { DeckhouseLayout } from '../vessel/deckhouse';
import { houseFlare } from '../vessel/houseFlare';
import { BREAKERS } from '../vessel/vesselState';
import { strakeLine, tyreSpots } from '../vessel/physics/guards';
import { fromSteps, guardParts, MEASURES, outboardCount, PLACE_GRID, placeOf, SCALES, SINGLE_ONLY_ENGINES, type PlaceKey, type ShipDesign } from './design';

/** A faceted front's middle pane: between the front windows' mullions (hullMesh.ts, at +-0.5 m). */
const FACET_CENTRE = 0.5;

type V3 = [number, number, number];
const study = (id: string): HullDesign => {
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
const landingCraftLines = (): HullDesign => {
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
  form(L: number, B: number, D: number, bow: number): HullDefinition['form'];
  /** A planing hull (she banks into turns, a fast boat's propeller), or a displacement one. */
  planing: boolean;
  /** A square landing bow with its ramp (the landing craft's). */
  ramp: boolean;
  /**
   * A tug's square push bow (the small tug's): her own bow, which the bow choice leaves as
   * it is, faced with a rubber push fender (modules/pushFender).
   */
  pushBow?: boolean;
  /**
   * A landing bow (the landing craft, owner: a square platform on a planing hull): her own
   * forefoot, the bottom sweeping up to a raked square bow plate at the waterline under her
   * ramp, so she rides up a beach or a slipway. No bow choice: never plumb, never the deep stem.
   */
  landingBow?: boolean;
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
  /**
   * Her size range grows beyond the usual (owner, Oct 2026: the landing craft's layout
   * "can actually extend to fairly big... proportionally in all directions"): the length
   * slider's upper half takes her up to this many times her base size, her beam with it and
   * her depth as its square root (see buildAt; the beam and depth sliders then tweak her
   * proportions). Its lower half is as every hull's (SCALES.scale).
   */
  growsTo?: number;
}

/** What a hull and its houses are built of (CONFIG.shipyard.materials). */
export type Material = 'aluminium' | 'steel';
/**
 * Her length as a factor of her type's base (the length slider's step `i`): every hull's
 * 0.8 to 1.175 (SCALES.scale); a hull that `growsTo` more, the same up to her base size
 * (step 8), then up in equal ratios to `growsTo` at the top (step 15).
 */
export function sizeScale(base: Pick<DesignHull, 'growsTo'>, i: number): number {
  const top = base.growsTo;
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
const UPRIGHT: [number, number][] = [
  [0, 0],
  [1, 0],
];

/**
 * Lofted from the hull study, scaled (lengths along, half-breadths across, heights up), with
 * her bow reshaped: the game's stations are upright sections, so a bow's rake is its stem
 * line in profile, the keel meeting a raked stem under a deck that keeps its length (bowKeel).
 * `chinesRunOn`: her chines are measured from the uncut keel line, so they run on smoothly to
 * the stem and close in where the forefoot rises to them (a V hull: the pilot boat, owner).
 * A flat-bottomed hull's chine sweeps up with her forefoot instead (the landing craft's
 * square bow keeps its buoyancy that way).
 */
function scaledStudy(d: HullDesign, L: number, B: number, D: number, bow: number | null, chinesRunOn = false): HullDesign {
  const by = (c: [number, number][], k: number) => c.map(([t, v]) => [t, v * k] as [number, number]);
  const sheer = by(d.sheer, D);
  // No bow choice (a push bow): her own keel and forefoot, scaled.
  if (bow === null) return { ...d, length: d.length * L, halfBeam: by(d.halfBeam, B), sheer, keel: by(d.keel, D), rake: UPRIGHT, wheelhouse: undefined, houses: undefined };
  const bowed = bowKeel(by(d.keel, D), curveAt(sheer, 1), d.length * L, SCALES.bow(bow));
  return { ...d, length: d.length * L, halfBeam: by(d.halfBeam, B), sheer, keel: bowed.keel, ...(chinesRunOn ? { chineKeel: bowed.base } : {}), rake: UPRIGHT, wheelhouse: undefined, houses: undefined };
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
 *   In profile it's a parabola added to the keel line. 0 deg is a plumb stem. A 50 deg stem
 *   on a 2 m deep bow reaches back ~2.4 m (owner: the keel not cut away further back).
 * Drawn through samples every 1.25 % of her length.
 */
export function bowKeel(keel: [number, number][], stemDeckY: number, lengthM: number, deg: number): { keel: [number, number][]; base: [number, number][] } {
  const own = (t: number) => curveAt(keel, t);
  const from = 0.6;
  const slope = (own(from + 1e-4) - own(from - 1e-4)) / 2e-4;
  const line = (t: number) => (t < from ? own(t) : own(from) + slope * (t - from));
  const top = stemDeckY - 0.15;
  const rise = top - line(1);
  // How far back from the stem head the stem meets the keel (m).
  const reach = deg > 0.1 ? rise * Math.tan((deg * Math.PI) / 180) : 0;
  const at = (t: number) => {
    const d = (1 - t) * lengthM;
    return reach > 0 && d < reach ? line(t) + rise * (1 - d / reach) ** 2 : line(t);
  };
  const ts = Array.from({ length: 81 }, (_, i) => i / 80);
  // The forefoot, where the stem runs into the keel: sampled too.
  if (reach > 0 && reach < lengthM) ts.push(1 - reach / lengthM);
  ts.sort((a, b) => a - b);
  return { keel: ts.map((t) => [t, at(t)]), base: ts.map((t) => [t, line(t)]) };
}

export const DESIGN_HULLS: DesignHull[] = [
  {
    name: 'Landing craft: 9 m aluminium, square landing bow with a ramp',
    material: 'aluminium',
    growsTo: 2.5,
    // Her bow is her own: the landing bow (landingCraftLines), no bow choice.
    form: (L, B, D) => ({ kind: 'lofted', design: scaledStudy(landingCraftLines(), L, B, D, null) }),
    planing: true,
    ramp: true,
    landingBow: true,
    cockpit: 1.0,
    foredeck: 1.6,
    defaults: fromSteps({ length: 8, beam: 8, depth: 8, bulwark: 2, bow: 2, housePos: 4, houseLength: 2, houseWidth: 7, headroom: 3, floor: 2, visor: 1, roofThickness: 0, roofEdge: 1, windowRake: 4, lowerFront: 0, engine: 1, twin: 0 }),
  },
  {
    name: 'Gillnetter: 9.75 m, beamy and shallow, flat open foredeck',
    material: 'steel',
    form: (L, B, D, bow) => ({ kind: 'lofted', design: scaledStudy(study('gillnetter'), L, B, D, bow) }),
    planing: true,
    ramp: false,
    cockpit: 1.0,
    foredeck: 1.5,
    // A bowpicker: the house right aft, the open foredeck for the net reel.
    defaults: fromSteps({ length: 8, beam: 8, depth: 8, bulwark: 3, bow: 2, housePos: 0, houseLength: 6, houseWidth: 7, headroom: 3, floor: 3, visor: 1, roofThickness: 0, roofEdge: 1, windowRake: 4, lowerFront: 0, engine: 1, twin: 0 }),
  },
  {
    name: 'Workboat: 12 m semi-displacement, hard chine, fine entry',
    form: (L, B, D, bow) => {
      const h = CONFIG.vessels.workboat.hull;
      return {
        kind: 'chine',
        params: { ...h, length: h.length * L, beamDeck: h.beamDeck * B, beamChine: h.beamChine * B, keelY: h.keelY * D, chineYAft: h.chineYAft * D, chineYBow: h.chineYBow * D, deckYAft: h.deckYAft * D, deckYBow: h.deckYBow * D, forefoot: { from: 0.55, rise: 1, stemDeg: SCALES.bow(bow) } },
      };
    },
    planing: false,
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
    form: (L, B, D, bow) => ({ kind: 'lofted', design: scaledStudy(study('pilot'), L, B, D, bow, true) }),
    planing: true,
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
    // Her bow is her own (a square push plate, the bottom sweeping up to it): no bow choice.
    form: (L, B, D) => ({ kind: 'lofted', design: scaledStudy(study('pushTug'), L, B, D, null) }),
    planing: false,
    ramp: false,
    pushBow: true,
    // A long towing deck aft; the foredeck short, up to the push bow.
    cockpit: 3.0,
    foredeck: 1.6,
    // The owner's reference: a short house forward of amidships, raised to see over the
    // high bow, windows a little reverse-raked; a low towing deck aft; twin screws; a
    // rubbing strake; red and grey. One slow-revving tug diesel (owner: an engine with the
    // tug in mind; single only).
    defaults: fromSteps({ length: 8, beam: 8, depth: 8, bulwark: 4, bow: 0, housePos: 11, houseLength: 4, houseWidth: 4, headroom: 3, floor: 5, visor: 1, roofThickness: 1, roofEdge: 2, windowRake: 5, lowerFront: 0, engine: 3, twin: 0, paint: 7, guard: 2 }),
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
 *              It goes in singly only (design.ts SINGLE_ONLY_ENGINES; owner).
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
  { name: '450 kW slow-revving tug diesel (big straight six, 1000 rpm; single only)', kw: 450, kg: 2200, voice: 'bigSix' as const, rackRise: 1.0, ratedRpm: 1000, idleRpm: 450, propMaxM: 1.4, pricePerKw: 170, size: [2.65, 0.95, 1.35] as const, about: 'Slow-revving and heavy, for towing: more torque, turning a bigger propeller, so a harder pull for its power. Slower to answer the throttle.' },
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
];

/** Roof colours (owner): the hull's own topsides colour (null), or one of its own; an orange roof is common on workboats. */
export const ROOF_PAINTS: { name: string; colour: number | null }[] = [
  { name: 'Like hull', colour: null },
  { name: 'Orange', colour: 0xe0661f },
  { name: 'White', colour: 0xeeeeea },
  { name: 'Grey', colour: 0xb9bdb6 },
  { name: 'Black', colour: 0x22262a },
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
];

/** Her livery with the roof's colour chosen, and its top's (the workboat orange livery is `{}`: the workboat's own orange topsides). */
function liveryOf(d: ShipDesign): Livery {
  const l = LIVERIES[d.paint].livery;
  const top = ROOF_TOPS[d.roofTop ?? 0]?.colour;
  return { ...l, roof: ROOF_PAINTS[d.roofPaint].colour ?? l.topsides ?? 0xd9622b, ...(top != null ? { roofTop: top } : {}) };
}

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
  placed: Partial<Record<PlaceKey, { x: number; z: number; moved: boolean; onRoof?: boolean } | null>>;
}

/** Her displaced volume, LCB, KB and waterplane inertia at the DWL (y = 0), from her stations. */
function atDWL(form: HullForm): { volume: number; lcb: number; kbY: number; iT: number; lwl: number } {
  let v = 0;
  let mz = 0;
  let my = 0;
  let iT = 0;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const st of form.stations) {
    const { area, cy } = clippedBelow(st.polygon);
    v += area * st.weight;
    mz += area * st.weight * st.z;
    my += area * cy * st.weight;
    const b = waterlineHalf(st.polygon);
    iT += ((2 * b) ** 3 / 12) * st.weight;
    if (area > 1e-4) {
      zMin = Math.min(zMin, st.z);
      zMax = Math.max(zMax, st.z);
    }
  }
  return { volume: v, lcb: mz / v, kbY: my / v, iT, lwl: zMax - zMin };
}

/** Area and centroid height of a section polygon below y = 0 (Sutherland-Hodgman, shoelace). */
function clippedBelow(poly: readonly (readonly [number, number])[]): { area: number; cy: number } {
  const out: [number, number][] = [];
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    if (y0 <= 0) out.push([x0, y0]);
    if ((y0 <= 0) !== (y1 <= 0)) out.push([x0 + ((x1 - x0) * (0 - y0)) / (y1 - y0), 0]);
  }
  let a = 0;
  let cy = 0;
  for (let i = 0; i < out.length; i++) {
    const [x0, y0] = out[i];
    const [x1, y1] = out[(i + 1) % out.length];
    const c = x0 * y1 - x1 * y0;
    a += c;
    cy += (y0 + y1) * c;
  }
  a /= 2;
  return Math.abs(a) < 1e-9 ? { area: 0, cy: 0 } : { area: Math.abs(a), cy: cy / (6 * a) };
}

/** A station's half-breadth at height y (0 below her keel; her deck half-breadth above her deck). */
function halfBreadthAt(poly: readonly (readonly [number, number])[], y: number): number {
  const [[xd, yd], [xc, yc], [, yk]] = [poly[4], poly[3], poly[2]];
  if (y <= yk) return 0;
  if (y >= yd) return xd;
  if (y <= yc) return (xc * (y - yk)) / Math.max(yc - yk, 1e-6);
  return xc + ((xd - xc) * (y - yc)) / Math.max(yd - yc, 1e-6);
}

/** Half-breadth where a section crosses the waterline (0 if it doesn't). */
function waterlineHalf(poly: readonly (readonly [number, number])[]): number {
  let half = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    if (y0 * y1 <= 0 && y0 !== y1) half = Math.max(half, Math.abs(x0 + ((x1 - x0) * -y0) / (y1 - y0)));
  }
  return half;
}

/** The landing craft's 150 kW torque curve, which the packages scale (same 1800 rpm rating). */
const BASE_TORQUE: [number, number][] = [
  [0, 0], [300, 375], [600, 638], [1000, 938], [1300, 990], [1600, 908], [1800, 796], [1900, 450], [1950, 0],
];

/**
 * Build her design (owner, Oct 2026: she floats at what she weighs). Twice: first on her
 * lines as drawn, to weigh her (her weight doesn't depend on how high she floats: her
 * plating, houses, machinery, gear and load are what they are); then with her lines raised
 * (lighter than they displace) or lowered (heavier) until she displaces exactly that
 * weight, so her draught, freeboard and hydrostatics are those of the boat as built.
 */
export function buildDesign(d: ShipDesign, code = 'design'): DesignedBoat {
  const first = buildAt(d, code, 0, null);
  const { rise, sinks } = riseFor(hullFormOf(first.hull.form), first.weights.massKg);
  const boat = buildAt(d, code, rise, { massKg: first.weights.massKg, cgY: first.weights.cgY });
  if (sinks) boat.warnings.unshift(`She's too heavy for her hull (${(first.weights.massKg / 1000).toFixed(1)} t): she'd float with her deck awash. Make her lighter (aluminium, a smaller engine, less gear) or bigger.`);
  else if (boat.figures.freeboardM < 0.3) boat.warnings.unshift(`She floats deep for her weight: ${Math.round(boat.figures.freeboardM * 100)} cm of freeboard amidships. Give her more depth (Hull) or make her lighter.`);
  return boat;
}

/** Her lines raised by `rise` (m; negative lowers them): her keel and sheer lines, which every height of her hull is measured from. */
function raised(form: HullDefinition['form'], rise: number): HullDefinition['form'] {
  if (!rise) return form;
  // (The workboat's chine hull: its keel, chine and deck heights.)
  if (form.kind === 'chine') {
    const p = form.params;
    return { ...form, params: { ...p, keelY: p.keelY + rise, chineYAft: p.chineYAft + rise, chineYBow: p.chineYBow + rise, deckYAft: p.deckYAft + rise, deckYBow: p.deckYBow + rise } };
  }
  const up = (c: [number, number][]) => c.map(([t, v]) => [t, v + rise] as [number, number]);
  const dsg = form.design;
  return { ...form, design: { ...dsg, keel: up(dsg.keel), sheer: up(dsg.sheer), ...(dsg.chineKeel ? { chineKeel: up(dsg.chineKeel) } : {}) } };
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

function buildAt(d: ShipDesign, code: string, raise: number, given: { massKg: number; cgY: number } | null): DesignedBoat {
  const warnings: string[] = [];
  const base = DESIGN_HULLS[d.hull];
  // Her size: length, beam and depth as factors of her type's own. A hull that `growsTo` a
  // bigger size grows past her base size in length and beam together, and in depth as the
  // square root of it (and her plating thicker by as much: `grownPlate`): scaled fully in
  // depth, a 22 m landing craft weighed 24 t and floated with 3 m of freeboard (a hull's
  // weight goes with its area, its buoyancy with its volume). Big landing craft are
  // relatively shallower and more heavily plated.
  const L = sizeScale(base, d.length);
  const grown = Math.max(1, L);
  const grownPlate = Math.sqrt(grown);
  const B = SCALES.scale(d.beam) * grown;
  const D = SCALES.scale(d.depth) * grownPlate;
  const form = raised(base.form(L, B, D, d.bow), raise);
  const shape = hullFormOf(form);
  const st = shape.stations;
  const transom = st[0].z;
  const stem = st[st.length - 1].z;
  const bulwarkHeight = Math.round(SCALES.bulwark(d.bulwark) * 100) / 100;

  // ── The wheelhouse, within the deck free for it ──
  const q = hullQueries({ hull: shape, layout: { bulwarkHeight, railHeight: 0, deckEdgeMargin: 0.25, bodyRadius: BODY_RADIUS } as LayoutConfig });
  const zAft = transom - base.cockpit;
  const zFwd = stem + base.foredeck + (base.ramp ? 0.6 : 0);
  let houseL = d.houseLength;
  if (houseL > zAft - zFwd) {
    houseL = zAft - zFwd;
    warnings.push(`The wheelhouse is longer than her deck allows: cut to ${houseL.toFixed(1)} m.`);
  }
  // A saloon aft of it (parametric boats P2b): the house runs on aft, one house, one roof.
  // Cut short (or left off, under `saloonMin`) if her deck hasn't the room.
  const sal = CONFIG.shipyard.saloon;
  let saloonL = d.saloon ?? 0;
  if (saloonL && houseL + saloonL > zAft - zFwd) {
    saloonL = Math.floor((zAft - zFwd - houseL) * 10) / 10;
    if (saloonL < sal.minLength) {
      saloonL = 0;
      warnings.push('There\'s no room on her deck for a saloon aft of the wheelhouse: left off (a shorter wheelhouse leaves some).');
    } else warnings.push(`The saloon is longer than her deck allows: cut to ${saloonL.toFixed(1)} m.`);
  }
  /** The wheelhouse's own length; `houseL` from here on is the whole house's, saloon and all. */
  const helmL = houseL;
  houseL += saloonL;
  const aft = zAft - d.housePos * (zAft - zFwd - houseL);
  const front = aft - houseL;
  /** Where the wheelhouse ends and the saloon begins (the house's aft, without one). */
  const helmAft = front + helmL;
  const along = (n: number) => Array.from({ length: n + 1 }, (_, i) => front + ((aft - front) * i) / n);
  const narrowest = Math.min(...along(8).map((z) => q.halfBeam(z)));
  const sideDeck = 0.28;
  let hw = d.houseWidth * (narrowest - sideDeck);
  if (hw < 0.85) {
    warnings.push('Her wheelhouse is too narrow for the console: widened to 1.7 m, leaving narrow side decks.');
    hw = Math.min(0.85, narrowest - 0.12);
  }
  const deckHi = Math.max(...along(8).map((z) => q.deckY(z)));
  const deckLo = Math.min(...along(8).map((z) => q.deckY(z)));
  const headroom = d.headroom;
  // The floor (owner: the house's height, to see over a bow or a ramp): raised from the
  // highest deck under the house, or sunk from the lowest (a step down in, for headroom).
  // A floor below the deck needs her hull at least as wide as the house down there (its
  // walls go down to it); in a fine entry it isn't, and the floor comes up until it is.
  // (Set after the deckhouse, below: with one, the floor is measured from its top.)
  const lift = d.floor;
  const level = deckHi + 0.03;
  const tightAt = (y: number) => Math.min(...along(8).map((z) => halfBreadthAt(st.reduce((a, s) => (Math.abs(s.z - z) < Math.abs(a.z - z) ? s : a)).polygon, y)));
  // ── The deckhouse (owner: pilot and rescue boats; vessel/deckhouse.ts) ──
  // From the wheelhouse's aft wall (just inside it, so the house's own aft wall shows)
  // forward past its front, out to her sides less any side deck (but at least as wide as
  // the house it carries), its top flat over the highest deck under it. The wheelhouse then
  // stands on it: its floor at the deckhouse's top, steps up to its aft door from the deck.
  const dhc = CONFIG.shipyard.deckhouse;
  const rnd = (v: number) => Math.round(v * 1000) / 1000;
  // A three-facet front (decided here: the deckhouse under the house follows it too).
  const facetTan = Math.tan((CONFIG.shipyard.facetDeg * Math.PI) / 180);
  let facet: { centre: number; depth: number } | null = null;
  if (d.facets) {
    const depth = Math.round((hw - FACET_CENTRE) * facetTan * 1000) / 1000;
    if (hw - FACET_CENTRE < 0.25) warnings.push('Her wheelhouse is too narrow for a faceted front (its middle pane would be all of it): left flat.');
    else if (aft - front - depth < 1.6) warnings.push('Her wheelhouse is too short for a faceted front (the console\'s wings would reach too far aft): left flat.');
    else facet = { centre: FACET_CENTRE, depth };
  }
  let deckhouse: DeckhouseLayout | null = null;
  let dhArea = 0;
  if (d.dhLength) {
    let z0 = front - d.dhLength;
    const minZ = stem + (base.ramp ? 1.8 : dhc.fromStem);
    if (z0 < minZ) {
      z0 = minZ;
      warnings.push('The deckhouse reaches further forward than her bow allows: cut short.');
    }
    // As wide as the house (owner: leaves her side decks clear, for a side door): only forward
    // of it, the house's own walls coming down to the deck. Else from its aft wall.
    const narrow = !!d.dhNarrow;
    // (As wide as a faceted house: on to its angled corners, so they stand on it.)
    const z1 = narrow ? front + 0.03 + (facet?.depth ?? 0) : aft - 0.02;
    const side = d.dhWidth;
    const plainAt = (z: number) => (narrow ? Math.max(0.3, Math.min(hw, q.halfBeam(z) - dhc.edge)) : Math.max(z >= front - 0.01 ? hw : 0.3, q.halfBeam(z) - Math.max(dhc.edge, side)));
    // Faceted as the house is (owner): its front square across the middle, its corners cut
    // back at the same angle from its own front (always ahead of the house's, so wider).
    const halfAt = (z: number) => (facet ? Math.min(plainAt(z), Math.max(0.3, facet.centre + (z - z0) / facetTan)) : plainAt(z));
    const zs: number[] = [];
    for (let z = z0; z < z1 - 0.05; z += 0.25) zs.push(z);
    // A section where the cut corner meets her side (or the set-in width), so its edge is straight.
    if (facet) for (let z = z0; z < z1; z += 0.05) if (Math.abs(facet.centre + (z - z0) / facetTan - plainAt(z)) < 0.03) zs.push(z);
    zs.push(z1);
    zs.sort((a, b) => a - b);
    const plan = zs.map((z): [number, number] => [rnd(z), rnd(halfAt(z))]);
    const top = rnd(Math.max(...zs.map((z) => q.deckY(z))) + d.dhHeight);
    deckhouse = { z0: rnd(z0), z1: rnd(z1), top, rakeDeg: d.dhRake, plan };
    // Its plate: the two sides, the top, the front and the aft face (m²), for its weight and price.
    const h = d.dhHeight;
    for (let i = 1; i < plan.length; i++) dhArea += (plan[i][0] - plan[i - 1][0]) * (2 * h + plan[i][1] + plan[i - 1][1]);
    dhArea += 2 * plan[0][1] * h + 2 * plan[plan.length - 1][1] * h;
  }
  // The floor: with a deckhouse, from its top (owner, Oct 2026: level with it, raised, or
  // sunk into it, the house's walls going down inside it and its top open over the cabin);
  // without, from the deck. Below the deck it needs her hull at least as wide as the house.
  const onTop = deckhouse ? deckhouse.top + 0.02 : level;
  let floorY = deckhouse || lift >= 0 ? onTop + lift : Math.min(level, deckLo + 0.01 + lift);
  if (floorY < level && tightAt(floorY - 0.15) < hw + 0.02) {
    while (floorY < level && tightAt(floorY - 0.15) < hw + 0.02) floorY = Math.min(level, floorY + 0.2);
    warnings.push(`Her hull is too fine under the wheelhouse for its floor that low: raised to ${(floorY - level).toFixed(1)} m about the deck.`);
  }
  if (deckhouse && floorY < deckhouse.top - 0.01 && !d.dhNarrow) {
    // Sunk into it: no top over the cabin (inside the house's walls), less plate.
    deckhouse.well = { halfWidth: rnd(hw - 0.03), z0: rnd(front + 0.03) };
    dhArea -= 2 * (hw - 0.03) * (deckhouse.z1 - front - 0.03);
  }
  const roofY = floorY + headroom;
  const wall = 0.06;
  // The saloon's floor (owner: "two steps down into the saloon", as on the Alaskan): level with
  // the wheelhouse's, or a step or more down, each a 0.2 m rise with a tread `sal.tread` deep
  // between (the treads aft of the wheelhouse, in the saloon). Not into a deckhouse it stands
  // on, and below the deck only where her hull is wide enough for the house's walls to go
  // down to it (as a sunk wheelhouse floor); else as low as it can go, in whole steps.
  let saloonDrop = saloonL ? d.saloonFloor ?? 0 : 0;
  if (saloonDrop) {
    const salTight = (y: number) => Math.min(...Array.from({ length: 5 }, (_, i) => helmAft + ((aft - helmAft) * i) / 4).map((z) => halfBreadthAt(st.reduce((a, s) => (Math.abs(s.z - z) < Math.abs(a.z - z) ? s : a)).polygon, y)));
    const lowest = deckhouse ? Math.min(floorY, deckhouse.top + 0.02) : -Infinity;
    const fits = (drop: number) => floorY - drop >= lowest - 1e-6 && (floorY - drop >= level - 1e-6 || salTight(floorY - drop - 0.15) >= hw + 0.02);
    const asked = saloonDrop;
    while (saloonDrop > 1e-6 && !fits(saloonDrop)) saloonDrop = Math.round((saloonDrop - 0.2) * 10) / 10;
    if (saloonDrop < asked - 1e-6) warnings.push(saloonDrop ? `The saloon's floor can only go ${Math.round(saloonDrop / 0.2)} step${saloonDrop > 0.3 ? 's' : ''} down here (${deckhouse ? 'not into the deckhouse' : 'her hull is too fine for it lower'}).` : `The saloon's floor can't step down here (${deckhouse ? 'not into the deckhouse' : 'her hull is too fine for it lower'}): level with the wheelhouse's.`);
  }
  /** The saloon's floor (the wheelhouse's, without one or level with it): the floor at the aft door. */
  const FA = rnd(floorY - saloonDrop);
  const nRise = Math.round(saloonDrop / 0.2);
  const levels: FloorLevel[] = saloonDrop
    ? [
        // The treads down from the wheelhouse, then the saloon.
        ...Array.from({ length: nRise - 1 }, (_, k) => ({ y: rnd(floorY - 0.2 * (k + 1)), z0: rnd(helmAft + k * sal.tread), z1: rnd(helmAft + (k + 1) * sal.tread) })),
        { y: FA, z0: rnd(helmAft + (nRise - 1) * sal.tread), z1: rnd(aft) },
      ]
    : [];
  // The house's shape (owner): the roof one flat slab reaching forward over the windows (the
  // visor), its front edge cut back underneath; the front windows raked either way.
  const roofThickness = d.roofThickness;
  // Its front and sides chamfered (hullMesh.ts chamferedSlab): the top set in this much.
  const roofBack = roofThickness * Math.tan((d.roofEdge * Math.PI) / 180);
  // The window sills, one height all round (owner; they were 1.31 at the front, the dash top,
  // and 1.0 at the sides): the standard height, or low, below the console.
  const sill = d.sills ? CONFIG.shipyard.windowSills.low : CONFIG.shipyard.windowSills.standard;
  // The windows run up to the roof's underside, only their frame between (owner: the roof is
  // one piece, overhanging them, no band of wall above the glass).
  const windowHead = headroom - CONFIG.pixelPaint.frameWidth;
  const doorHeight = Math.min(1.95, headroom - 0.1);
  // The saloon's own roof (owner, P2b: the raised pilothouse look): lower than the wheelhouse's
  // by whole 0.2 m steps, the step in the roofline at the wheelhouse's aft end, its windows
  // coming down with it. Never so low its headroom is under the doorway's plus 0.1 m (the aft
  // door is in its wall), or its window band (from the sill to the frame under the roof) under
  // `sal.minBand`: as low as it can go then, and said.
  let roofDrop = saloonL ? d.saloonRoof ?? 0 : 0;
  if (roofDrop) {
    const asked = roofDrop;
    const ok = (drop: number) => roofY - drop - FA >= doorHeight + 0.1 - 1e-6 && roofY - drop - CONFIG.pixelPaint.frameWidth - (floorY + sill) >= sal.minBand - 1e-6;
    const by = MEASURES.saloonRoof.by;
    while (roofDrop > 1e-6 && !ok(roofDrop)) roofDrop = Math.max(0, Math.round((roofDrop - by) / by) * by);
    if (roofDrop < asked - 1e-6) {
      const why = roofY - asked - FA < doorHeight + 0.1 - 1e-6 ? 'its headroom over the saloon floor would be less than the doorway' : 'its windows would be too shallow';
      warnings.push(roofDrop ? `The saloon's roof can only come ${roofDrop.toFixed(2)} m lower (${why}): a deeper saloon floor, or more headroom, lets it go lower.` : `The saloon's roof can't come lower (${why}): it's as high as the wheelhouse's. A deeper saloon floor, or more headroom, lets it.`);
    }
  }
  /** The saloon's roof (its underside), lower than the wheelhouse's aft of the step at `helmAft`; null: one roof. */
  const saloonRoof = roofDrop ? { z: rnd(helmAft), y: rnd(roofY - roofDrop) } : null;
  /** The roof's underside at z (a lower saloon roof aft of its step). */
  const roofAt = (z: number) => (saloonRoof && z > saloonRoof.z ? saloonRoof.y : roofY);
  // The front below the windows stays upright (its choice isn't offered now, owner).
  const house: HouseShape = { lowerRakeDeg: 0, lowerFromY: Math.min(q.deckY(front), floorY), roofEdgeDeg: d.roofEdge, visor: CONFIG.shipyard.visor }; // (one set length now, owner: `d.visor` is kept in the code, unused)
  // A three-facet front (owner: a tug's pilot house): the middle pane square across her
  // between the mullions, the outer two angled back `facetDeg` to the side walls; the
  // console wraps round with it, its wings set back as much (sb).
  if (facet) house.facet = facet;
  // Windows raked out all round (owner; houseFlare.ts): the sides and aft lean out above the sill.
  if (d.flare) house.flare = { tan: Math.round(Math.tan((CONFIG.shipyard.flareDeg * Math.PI) / 180) * 1e4) / 1e4 };
  /** How far a faceted front is set back at x (0 across the middle; the console's wings, and what's placed beside them, follow it). */
  const sb = (x: number) => (house.facet ? (Math.max(0, Math.abs(x) - house.facet.centre) * house.facet.depth) / (hw - house.facet.centre) : 0);
  // Raked out all round (owner): the front leans out with the sides, at the same angle (its own rake is set aside).
  const windowRake = d.flare ? CONFIG.shipyard.flareDeg : d.windowRake;
  // Where the front windows' foot and head stand (z), as hullMesh draws them.
  const ahead = Math.max(0, floorY + sill - house.lowerFromY) * Math.tan((house.lowerRakeDeg * Math.PI) / 180);
  const zHead = front - ahead - (windowHead - sill) * Math.tan((windowRake * Math.PI) / 180);
  // The console (and what's placed by it) set back from the front (owner: it stood against the
  // glass): far enough that each of its parts rising above the sill is `consoleClear` behind the
  // glass anywhere from the sill up to that part's top. Glass raked aft at the top (negative rake)
  // leans back over it, so that needs more. Each part: its height above the floor, and its front (m aft of the house front)
  // with the console against the wall: the dash; with low sills, the desk's raised back and the
  // screens on stalks; the screens hung from the roof.
  const consoleBack = (() => {
    const lean = Math.tan((windowRake * Math.PI) / 180); // + forward at the top
    // How far aft the glass reaches anywhere from the sill up to height y (it's tightest at the
    // sill for glass leaning forward, at y for glass raked aft).
    const glassAft = (y: number) => Math.max(0, -lean * (y - sill));
    const parts: [number, number][] = d.sills
      ? [[1.02, 0.06], [0.9 + 0.21 + CONFIG.modules.screen.dash.height / 2, 0.2], [headroom - 0.1, 0.32]]
      : [[0.9 + CONFIG.modules.helmConsole.dash.top, 0.06], [headroom - 0.1, 0.32]];
    const above = parts.filter(([y]) => y > sill);
    return above.length ? Math.ceil(Math.max(0, ...above.map(([y, z]) => glassAft(y) + CONFIG.shipyard.consoleClear - z)) * 100) / 100 : 0; // (up to the next cm)
  })();
  /** The console's line: the house front, less any setback (consoleBack). */
  const cf = front + consoleBack;
  // Steps at the aft door, no rise over 0.35 m (a player steps up 0.4): outside for a
  // raised floor, inside for a deep sunk one.
  const doorDeck = q.deckY(aft + 0.15);
  const rise = FA - doorDeck;
  const nSteps = Math.max(0, Math.ceil(Math.abs(rise) / 0.35) - 1);
  const tread = 0.28;
  const steps: DoorStep[] = Array.from({ length: nSteps }, (_, i) => {
    const k = i + 1; // 1: the lowest step; nSteps: the highest, at the door
    const y = Math.min(FA, doorDeck) + (Math.abs(rise) * k) / (nSteps + 1);
    const out = nSteps - k; // treads between it and the door
    return rise > 0 ? { y, z0: aft + out * tread, z1: aft + (out + 1) * tread } : { y, z0: aft - wall - (out + 1) * tread, z1: aft - wall - out * tread };
  });
  // Treads inside the aft wall (a sunk floor): the engine hatch keeps forward of them.
  const inside = rise < 0 ? nSteps * tread : 0;
  const F = floorY;
  /** The roof's top (flat, or a step down to a lower saloon roof). */
  const roofTopAt = (z: number) => roofAt(z) + roofThickness;
  // On the roof, forward: clear of its front edge (the visor's top, set back by its rake) whichever way the windows rake.
  const roofFront = Math.max(front, zHead - house.visor + roofThickness * Math.tan((house.roofEdgeDeg * Math.PI) / 180));

  // Her bow ramp (the landing craft's), across her square bow.
  const bowHalf = st[st.length - 1].halfBeamDeck;
  const lcRamp = CONFIG.vessels.landingCraft.layout.bowRamp;
  // (Grown, her ramp is longer, its rams and toe flaps with it, as her depth grows: her bow
  // stands that much higher off the beach.)
  const rk = (v: number) => Math.round(v * grownPlate * 100) / 100;
  const bowRamp = base.ramp
    ? { ...lcRamp, width: Math.round(2 * (bowHalf - 0.08) * 100) / 100, length: rk(lcRamp.length), flap: { ...lcRamp.flap, length: rk(lcRamp.flap.length) }, ram: { ...lcRamp.ram, x: Math.round((bowHalf - 0.07) * 100) / 100, aft: rk(lcRamp.ram.aft), height: rk(lcRamp.ram.height), along: rk(lcRamp.ram.along) }, button: { z: stem + 0.8, y: 0.42 } }
    : undefined;

  const layout = {
    // No roof rail or ladder (owner: simpler): the roof isn't walked.
    wheelhouse: { halfWidth: hw, front, aft, floorY, roofY, wall, doorWidth: 0.7, doorHeight, windowSill: sill, windowHead, frontSill: sill, frontRakeDeg: windowRake, ...(d.flare ? { doorHinged: true } : {}), consoleDepth: 0.5, ...(consoleBack ? { consoleBack } : {}), consoleHeight: 0.9, viewSill: d.sills ? 0.9 : Math.max(sill, 0.9 + CONFIG.modules.helmConsole.dash.top), shape: house, ...(steps.length ? { steps } : {}), ...(levels.length ? { levels } : {}), ...(saloonRoof ? { saloonRoof } : {}) },
    roof: { thickness: roofThickness, overhang: 0.15, railHeight: 0, edgeMargin: 0.25 },
    // (Their height from the wheelhouse's floor: 1.1 m above the saloon's at its aft door.)
    doorButtons: { x: 0.45, height: rnd(1.1 - saloonDrop) },
    ...(bowRamp ? { bowRamp } : {}),
    ...(deckhouse ? { deckhouse } : {}),
    bulwarkHeight,
    // Handrails 0.4 m over the bulwarks, or none (owner: an option; bulwarks only).
    railHeight: d.rails ? 0 : bulwarkHeight + 0.4,
    // The notch in the transom bulwark for a stern roller (set below if she has one).
    fairleadGap: d.sternRoller ? CONFIG.vessels.workboat.layout.fairleadGap : 0,
    deckEdgeMargin: 0.25,
    bodyRadius: BODY_RADIUS,
  } as LayoutConfig;
  if (layout.wheelhouse && roofY - deckHi < 1.8) warnings.push('Her wheelhouse roof is low over the deck outside: the doorway will be a squeeze.');

  // ── Weight, CG, inertia, damping: she floats on her lines ──
  const h = atDWL(shape);
  const rho = CONFIG.ocean.density;
  const g = CONFIG.ocean.gravity;
  // (Her weight, once weighed: buildDesign. The first time, what her lines displace as drawn.)
  const mass = given ? given.massKg : Math.round(rho * h.volume);
  const mid = st.reduce((a, s) => (Math.abs(s.z - h.lcb) < Math.abs(a.z - h.lcb) ? s : a)).polygon;
  const keelMid = mid[2][1];
  const deckMid = mid[0][1];
  const cg: V3 = [0, keelMid + 0.63 * (deckMid - keelMid) + 0.15 * (headroom - 2.2) + 0.15 * (floorY - level), h.lcb];
  // A deckhouse's plate, high up: her centre of gravity rises by its share of her weight
  // times how far its own centre (halfway up it) is above hers. Her displacement is the
  // same (she still floats on her lines: the rest of her is that much lighter).
  const dhKg = dhArea * dhc.kgPerM2;
  if (deckhouse) cg[1] += (dhKg / mass) * ((deckMid + deckhouse.top) / 2 + 0.2 - cg[1]);
  // Hull protection (owner): the strake or the tyres, high on her sides, designed in the same
  // way (the crew's few fenders are too light to count). The strake runs right round her: both
  // sides, the transom and, without a ramp, across a square bow.
  const prot = guardParts(d.guard);
  const hg = CONFIG.modules.hullGuard;
  const strakeAt = prot.side === 'strake' ? strakeLine(q) : [];
  let strakeM = 0;
  for (let i = 1; i < strakeAt.length; i++) strakeM += 2 * Math.hypot(strakeAt[i][0] - strakeAt[i - 1][0], strakeAt[i][1] - strakeAt[i - 1][1], strakeAt[i][2] - strakeAt[i - 1][2]);
  if (strakeAt.length) strakeM += 2 * strakeAt[0][0] + (base.ramp ? 0 : 2 * strakeAt[strakeAt.length - 1][0]);
  const tyres = prot.side === 'tyres' ? tyreSpots(q) : [];
  const guardKg = strakeM * hg.strake.kgPerM + 2 * tyres.length * hg.tyres.kgEach;
  const guardY = prot.side === 'strake' ? deckMid - hg.strake.drop : deckMid - hg.tyres.drop;
  if (guardKg > 0) cg[1] += (guardKg / mass) * (guardY - cg[1]);
  // A tug's push knees on her square bow plate (modules/pushFender): from the bulwark top
  // down to just above where the plate's sides end (its chines), within `inset` of her
  // sides; designed in high at her bow, as the strake is.
  const pf = CONFIG.modules.pushFender;
  const stemPoly = st[st.length - 1].polygon;
  const pushFender = base.pushBow
    ? { halfWidth: rnd(q.halfBeam(stem) - pf.inset), bottom: rnd(stemPoly[3][1] + pf.clear), top: rnd(q.deckY(stem) + bulwarkHeight), z: rnd(stem) }
    : null;
  if (pushFender) {
    const kg = pf.knees * pf.kneeWidth * (pushFender.top - pushFender.bottom) * pf.kgPerM2;
    cg[1] += (kg / mass) * ((pushFender.top + pushFender.bottom) / 2 - cg[1]);
  }
  const beamDeck = 2 * Math.max(...st.map((s) => s.halfBeamDeck));
  const lengthM = transom - stem;
  const gyradius = { roll: 0.39 * beamDeck, pitch: 0.278 * lengthM, yaw: 0.29 * lengthM };
  // Weighed (buildDesign), her centre of gravity is her parts': its height from the weights
  // below, her lines raised with it; along her it stays over her centre of buoyancy (level
  // trim: as her designer would trim her, with her tanks and ballast).
  if (given) cg[1] = Math.round((given.cgY + raise) * 1000) / 1000;
  const gm = h.kbY + h.iT / h.volume - cg[1];
  if (gm < 0.5) warnings.push(`Her stability is low (GM ${gm.toFixed(2)} m): give her more beam or less depth.`);
  const iRoll = mass * gyradius.roll ** 2 * 1.25; // with its added mass
  const rollCritical = 2 * Math.sqrt(iRoll * mass * g * Math.max(0.2, gm));
  const lc = CONFIG.vessels.landingCraft;
  const sizeK = (mass / lc.mass) * (lengthM / 10.2) ** 2;
  // Per-area terms: a planing hull's (the landing craft's, with her small settling drag in
  // surge) or a displacement hull's (the workboat's).
  const perArea = base.planing ? lc.damping : CONFIG.vessels.workboat.damping;
  const damping = { ...perArea, roll: Math.round(0.28 * rollCritical), pitch: Math.round(lc.damping.pitch * sizeK), yaw: Math.round(lc.damping.yaw * sizeK) };

  // ── Machinery ──
  const eng = ENGINES[d.engine];
  const kw = eng.kw;
  // Her engine's rated speed as a share of the 1800 rpm engines' (1 for those).
  const rs = eng.ratedRpm / 1800;
  // Twin engines: two of the package, their propellers set out ~28 % of her deck beam either
  // side of the centreline (under her bottom, clear of each other), twin rudders behind them.
  // (An engine that only goes in singly is built single, whatever the twin choice says.)
  const singleOnly = SINGLE_ONLY_ENGINES.includes(d.engine);
  if (d.twin && singleOnly) warnings.push(`The ${eng.name.split(' (')[0]} goes in singly: she has one.`);
  const twin = !!d.twin && !singleOnly;
  // Stern drives (owner, Oct 2026; design.sternDrive): the engine against the transom, a
  // leg through it that swings to steer (CONFIG.modules.sternDrive). Not the slow tug
  // diesel (its big slow propeller wants a shaft); outboards, if chosen, instead.
  const sdc = CONFIG.modules.sternDrive;
  if (d.sternDrive && singleOnly && !outboardCount(d)) warnings.push(`The ${eng.name.split(' (')[0]} goes on a shaft (its big slow propeller): no stern drive.`);
  const sd = !!d.sternDrive && !singleOnly && !outboardCount(d);
  // A Kort nozzle (owner, Oct 2026; design.nozzle; CONFIG.nozzle): on a shaft-driven propeller only.
  if (d.nozzle && (sd || outboardCount(d))) warnings.push(`A Kort nozzle goes round a shaft-driven propeller: none on ${outboardCount(d) ? 'outboards' : 'a stern drive'}.`);
  const nozzle = !!d.nozzle && !sd && !outboardCount(d);
  const n = twin ? 2 : 1;
  const keelAft = st[0].polygon[2][1];
  const draughtAft = -keelAft;
  // The propeller: as big as her draught aft allows (tip clear below her keel by ~1/4 of
  // it), and no bigger than her engine can turn (0.675 m at 150 kW .. 1.05 m at 400 kW). A
  // slower engine turns a bigger one for its power (a propeller's best diameter grows as its
  // revs fall): the 1000 rpm tug engine up to 1.4 m, as her draught allows (ENGINES propMaxM).
  const twinX = Math.round(0.28 * 2 * Math.max(...st.map((s) => s.halfBeamDeck)) * 100) / 100;
  const propD = Math.round(Math.max(0.45, Math.min(1.25 * draughtAft, 0.45 + (0.0015 * kw) / rs, eng.propMaxM, twin ? 2 * twinX - 0.15 : 9)) * 100) / 100;
  // Her shaft and the engine on it (machinery.ts): the shaft rises forward from the
  // propeller at a set angle and the engine sits on it where it clears her bottom. Its top
  // must be under the cabin floor (under the house) or the deck (elsewhere): a tall engine in
  // a shallow hull doesn't fit, which is a reason for more depth (owner).
  // Her plating's area (every station's section all round, deck included, her transom and
  // any square bow plate) and its centre (height y, place along her z): for her weights.
  let shellM2 = 0;
  let shellM2y = 0;
  let shellM2z = 0;
  const ring2 = (p: readonly (readonly [number, number])[]) => p.map((a, i) => [a, p[(i + 1) % p.length]] as const);
  for (let i = 1; i < st.length; i++) {
    const dz = Math.abs(st[i].z - st[i - 1].z) / 2;
    for (const sec of [st[i - 1], st[i]])
      for (const [a, b] of ring2(sec.polygon)) {
        const m2 = Math.hypot(b[0] - a[0], b[1] - a[1]) * dz;
        shellM2 += m2;
        shellM2y += (m2 * (a[1] + b[1])) / 2;
        shellM2z += m2 * (st[i - 1].z + st[i].z) / 2;
      }
  }
  for (const end of [st[0], ...(st[st.length - 1].halfBeamDeck > 0.3 ? [st[st.length - 1]] : [])]) {
    const p = end.polygon;
    const m2 = Math.abs(p.reduce((a, [x, y], i) => a + x * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * y, 0)) / 2;
    shellM2 += m2;
    shellM2y += (m2 * p.reduce((a, [, y]) => a + y, 0)) / p.length;
    shellM2z += m2 * end.z;
  }
  const material = materialOf(d);
  const mat = CONFIG.shipyard.materials[material];
  const wc = CONFIG.shipyard.weights;
  // Where her balance wants the engine (owner, Oct 2026: "a place where the centre of gravity
  // is good longitudinally"): her other main weights (plating, houses, fit-out, crew) and
  // where they are; the engine, its shafting and the batteries placed so that, with them, her
  // centre of gravity is over her centre of buoyancy (she floats level without ballast to
  // trim her). Her fuel and ballast are taken to be about her centre of buoyancy; her deck
  // gear isn't placed yet, and left out.
  const restKgZ: [number, number][] = [
    [shellM2 * mat.shellKgPerM2 * (base.scantlings ?? 1) * grownPlate, shellM2z / shellM2],
    // (A lower saloon roof: its two side walls that much shorter; the step's riser and the lower aft wall cancel.)
    [(2 * (houseL + 2 * hw) * (roofY - floorY) - 2 * saloonL * roofDrop + 4 * hw * houseL) * mat.houseKgPerM2, (front + aft) / 2],
    [dhArea * mat.houseKgPerM2, deckhouse ? (deckhouse.z0 + deckhouse.z1) / 2 : 0],
    [wc.outfitKgPerM2 * lengthM * beamDeck * 0.8, shellM2z / shellM2],
    [wc.crewKg + wc.storesKg, (front + aft) / 2],
  ];
  const engineGroupKg = eng.kg * n * (1 + wc.machineryShare) + 2 * CONFIG.modules.batteryBank.massKg;
  const restKg = restKgZ.reduce((a, [m]) => a + m, 0);
  const balanceZ = (h.lcb * (restKg + engineGroupKg) - restKgZ.reduce((a, [m, z]) => a + m * z, 0)) / engineGroupKg;
  const ceilingAt = (z: number) => (z >= front && z <= aft ? floorY : q.deckY(z));
  const shaft = sd
    ? sternDriveLine(shape, eng.size, twin ? twinEngineX(twinX, eng.size[1]) : 0, transom, ceilingAt, sdc.transomInset)
    : layShaft(shape, eng.size, twin ? twinEngineX(twinX, eng.size[1]) : 0, { x: twin ? twinX : 0, z: transom - 0.65, d: propD }, ceilingAt, CONFIG.shipyard.shaftAngleDeg, CONFIG.shipyard.shaftAngleMaxDeg, balanceZ);
  // A stern drive's legs: one behind each engine, through the transom; the top of each (its
  // gimbal housing) over the engine's output, its anti-ventilation plate level with her
  // bottom at the transom; its propeller a high-revving one, no bigger than `propMaxM`.
  const sdPropD = Math.min(propD, sdc.propMaxM);
  const sdLegs = sd
    ? (() => {
        const units = twin ? [-shaft.x, shaft.x].map(rnd) : [0];
        const mount = { y: rnd(shaft.flangeY + 0.15), z: rnd(transom) };
        const plateY = Math.max(...units.map((x) => bottomUnder(shape, x, transom))) - 0.02;
        return { units, mount, look: { ...sdc.look, shaftLength: rnd(Math.max(0.3, mount.y - plateY)) } };
      })()
    : null;
  // Outboards instead (owner, Oct 2026; design.outboards): 2 to 4 of the petrol V8s
  // (CONFIG.modules.outboard) on a bracket off the transom, in place of the engine package,
  // its shaft and the rudder (they steer by swinging). The engine choice above then only
  // stands in the code. Their units set `spacing` apart, centred, closer if her transom is
  // narrow; the bracket as wide as the row and a margin, aft of the transom by its length,
  // its bottom at the waterline and its top just under the mount. The mount's height: their
  // anti-ventilation plates about level with her keel (the bottom's water is clean there),
  // up to 0.35 m under the water and no higher than 0.08 m under it, a 30 in shaft above.
  const nOb = outboardCount(d);
  const obc = CONFIG.modules.outboard;
  // Her gearbox (or the outboards' lower units), the design's step: matched by trial
  // (shipyard/trial.ts matchGear) so she reaches her rated revs flat out. (Outboards on a
  // fixed 2.0 lower unit lugged on a heavy hull and ran hot: owner.)
  const gear = Math.round(SCALES.gear(d.gear) * 100) / 100;
  const outboards = (() => {
    if (!nOb) return null;
    const halfT = st[0].halfBeamDeck;
    const spacing = nOb > 1 ? Math.min(obc.spacing, (2 * (halfT - 0.35)) / (nOb - 1)) : 0;
    if (spacing < obc.spacing - 1e-6) warnings.push(`Her transom is narrow for ${nOb} outboards: they're ${Math.round(spacing * 100)} cm apart (they want ${Math.round(obc.spacing * 100)} cm to turn lock to lock). Give her more beam (Hull), or fit fewer.`);
    const units = Array.from({ length: nOb }, (_, i) => Math.round((i - (nOb - 1) / 2) * spacing * 100) / 100);
    const plateY = Math.round(Math.max(-0.35, Math.min(-0.08, keelAft + 0.35)) * 100) / 100;
    const mount = { y: Math.round((plateY + obc.look.shaftLength) * 100) / 100, z: Math.round((transom + obc.bracket.length) * 100) / 100 };
    const bracket = { z0: Math.round((transom - 0.02) * 100) / 100, z1: mount.z, y0: 0, y1: Math.round((mount.y - obc.bracket.belowMount) * 100) / 100, halfWidth: Math.round(Math.min(halfT - 0.05, Math.max(...units.map(Math.abs)) + obc.bracket.margin) * 100) / 100 };
    // A lower unit only comes in a narrow range of ratios: a code matched for an inboard (or
    // never matched) can't put a 1.2 on them (she'd lug and run hot).
    const [gMin, gMax] = obc.engine.gearRange;
    return { units, mount, bracket, engine: { ...obc.engine, gearRatio: Math.min(gMax, Math.max(gMin, gear)) } };
  })();
  if (!shaft.fits && !outboards) warnings.push(`The ${eng.name.split(' (')[0]} doesn't fit: ${sd ? 'against the transom' : 'on its shaft line'} it stands ${(shaft.shortM * 100).toFixed(0)} cm above the ${shaft.flangeZ - eng.size[0] / 2 >= front && shaft.flangeZ - eng.size[0] / 2 <= aft ? 'cabin floor' : 'deck'}. Give her more depth (Hull), raise the floor (Wheelhouse), or fit a smaller engine.`);

  // ── The engine space and its hatch (owner, Oct 2026: the box under the wheelhouse "is not
  // where the engine will go") ──
  // Over the engine, where its shaft line puts it (the starboard one of a twin: the one whose
  // oil is checked). Outboards have no engine inside: the hatch (her oil checks, as the
  // Alaskan's lazarette) goes at the aft end. It's cut into whichever floor holds most of the
  // engine, as close over its middle as fits: the cabin floor (aft of the helm, clear of the
  // chart table and any steps inside; not on a deckhouse, its floor far above), or the open
  // deck (clear of the house and its steps, the bow and the stern gear). As long as the
  // engine and a little (CONFIG.shipyard.engineHatch), as wide as it and a hand's width each
  // side for the dipstick and the oil can. The engine space under it goes down to just over
  // her bottom (the highest of it under the hatch's corners: a V bottom rises to the chines).
  const ehc = CONFIG.shipyard.engineHatch;
  const [engL, engW, engH] = eng.size;
  const engX = outboards ? 0 : twin ? shaft.x : 0;
  const engZ0 = outboards ? transom - 0.6 - ehc.minLength : shaft.flangeZ - engL;
  const engZ1 = outboards ? transom - 0.6 : shaft.flangeZ;
  const engHalf = outboards ? 0.25 : engW / 2;
  const engMid = (engZ0 + engZ1) / 2;
  type HatchZone = { floor: boolean; z0: number; z1: number; x0: (z: number) => number; x1: (z: number) => number };
  /** The engine's top (the model's) at z along her, on its tilted shaft line. */
  const engTopAt = (z: number) => shaft.flangeY + (shaft.flangeZ - z) * Math.tan((shaft.angleDeg * Math.PI) / 180) + (1 - FLANGE_SHARE) * engH;
  const propPos: V3 = [0, keelAft + 0.1, transom - 0.65];
  const rudderPos: V3 = [0, keelAft + 0.15, transom - 0.25];
  const prop = base.planing ? { kt0: 0.6, j0: 1.35, kq0: 0.1, jq0: 1.45, wake: 0.06, thrustDeduction: 0.08 } : { kt0: 0.57, j0: 1.15, kq0: 0.077, jq0: 1.25, wake: 0.18, thrustDeduction: 0.18 };
  // One rudder (or twin rudders, as one of twice the area, each in its own propeller's wash).
  const rudderArea = Math.round(0.07 * h.lwl * Math.max(0.3, draughtAft) * n * 100) / 100;
  // Her installed power (the outboards': each one's, times their count).
  const powerKw = nOb ? obc.engine.powerKw * nOb : kw * n;
  const tankL = Math.max(200, Math.round((powerKw * 1.1) / 50) * 50);
  const batteriesKg = 2 * CONFIG.modules.batteryBank.massKg;

  // ── Places (vessel axes), as the landing craft's are from her cabin ──
  const wl = CONFIG.shipyard.workLights;
  const at = {
    console: [0, F + 0.9, cf + 0.56] as V3,
    // (Below the window sill: low windows bring it down.)
    breakerPanel: [hw - 0.185, F + Math.min(0.6, sill - 0.2), cf + 0.875 + sb(hw - 0.185)] as V3,
    rampButton: [-(hw - 0.07), F + Math.min(0.73, sill - 0.08), cf + 0.775 + sb(hw - 0.07)] as V3,
    // (On the aft wall: from the saloon's floor, if she has one.)
    batteryMaster: [hw - 0.45, FA + 0.48, aft - 0.065] as V3,
    batterySelector: [hw - 0.2, FA + 0.48, aft - 0.065] as V3,
    vhf: [-(hw - 0.3), roofY - 0.17, cf + 0.525 + sb(hw - 0.3)] as V3,
    // The advanced package's instruments (owner): the chartplotter hung out to starboard
    // ahead of the helm, turned toward it (the VHF's mirror); the NAV / WIND screen hung on
    // the centreline ahead of the helm; the FM set further aft to starboard, over your head.
    chartplotter: [hw - 0.35, roofY - 0.17, cf + 0.5 + sb(hw - 0.35)] as V3,
    navDisplay: [0, roofY - 0.15, cf + 0.42] as V3,
    fm: [hw - 0.35, roofY - 0.11, cf + 1.3 + sb(hw - 0.35)] as V3,
    // The task board, on solid wall below the window sill (her walls are glass above it), on
    // the starboard wall, aft (its face's middle; 2 cm off the wall's inside face, clear of
    // its frames: no flicker between them).
    // The whiteboard: a pull-down board hung from the roof just forward of the aft wall
    // (owner: not low on the wall), port of the door, as wide as fits there.
    whiteboard: [(-(hw - wall) + 0.1) / 2, roofAt(aft - wall - 0.1), aft - wall - 0.1] as V3,
    dutyBoard: [hw - wall - 0.02, F + sill - CONFIG.modules.dutyBoard.height / 2 - 0.04, aft - wall - 0.5] as V3,
    // The engine's middle, on its shaft line (its weight is carried there); the engine space under its hatch.
    engineBed: [0, rnd(engTopAt(engMid) - engH / 2), rnd(engMid)] as V3,
    engineSpace: [0, 0, 0] as V3, // (set with her engine hatch, below)
    cabinLight: [0, roofAt((front + aft) / 2 + 0.15) - 0.12, (front + aft) / 2 + 0.15] as V3,
    searchlight: [0, roofTopAt(roofFront + 0.275) + 0.13, roofFront + 0.275] as V3,
    navLights: [0, roofTopAt(roofFront + 1.275), roofFront + 1.275] as V3,
    // The advanced interior's working lights (owner): the overhead switch panel over the helm
    // (its face), and the deck floods on the roof's front and aft edges, off to port (the
    // fore one set back with a faceted front's corner), each aimed at the middle of its deck.
    overhead: [0, roofY - CONFIG.modules.overheadPanel.drop, cf + wl.overheadAft] as V3,
    floodFore: [-wl.flood.x, roofTopAt(roofFront) + 0.07, roofFront + wl.flood.inset + sb(wl.flood.x + 0.11)] as V3,
    floodAft: [-wl.flood.x, roofTopAt(aft) + 0.07, aft - wl.flood.inset] as V3,
  };
  const bowCleat = stem + 0.5;
  const sternCleat = transom - 0.4;
  // With a skiff, the midship cleats for her painter (owner): on the bulwark tops at the house's
  // end of the skiff's deck, as the workboat's are just aft of her wheelhouse, where the crew
  // working her alongside stand; kept inside the mooring cleats.
  const mc = CONFIG.shipyard.deckGear.midCleats;
  const midCleat = d.skiff
    ? Math.round(100 * Math.min(sternCleat - mc.fromEnds, Math.max(bowCleat + mc.fromEnds, d.skiff <= 2 ? (deckhouse ? Math.min(front, deckhouse.z0) : front) - mc.fromHouse : aft + mc.fromHouse))) / 100
    : null;
  const cleat = (side: number, z: number): V3 => [side * (q.halfBeam(z) - 0.03), q.deckY(z) + bulwarkHeight, z];
  const rampBow: V3 | null = bowRamp ? [-(q.halfBeam(bowRamp.button.z) - 0.06), q.deckY(bowRamp.button.z) + bowRamp.button.y, bowRamp.button.z] : null;

  // ── Hull definition ──
  const weighed = { massKg: mass, cg, inertia: inertiaFromGyradius(mass, gyradius) };
  const freeboard = deckMid;
  // ── Deck gear: where each piece stands (owner) ──
  // In this order, each kept clear of what's already placed (`taken`, in plan):
  //   1. the stern gear at its fixed places (the stern roller, the A-frame's feet);
  //   2. the gear placed by hand (design.ts PLACE_FIELDS: a pin puts it on the 25 cm grid):
  //      the tow winch, the crane, the searchlight and the fire monitor, each on its pinned
  //      cell if it stands there, else the nearest cell within a metre that does, else (with
  //      a warning) its usual place;
  //   3. the rest at their usual places: the winch forward of the transom, the crane at the
  //      deck edge (the foredeck's to starboard, the aft deck's to port), the searchlight's
  //      and monitor's poles off the house (the searchlight to starboard, the monitor to port),
  //      or on the roof.
  const cr = CONFIG.modules.deckCrane;
  const dp = CONFIG.modules.deckPole;
  const dg = CONFIG.shipyard.deckGear;
  const twc = CONFIG.vessels.workboat.towWinch;
  const afc = CONFIG.vessels.workboat.fishing.aFrame;
  type Rect = { x0: number; x1: number; z0: number; z1: number };
  const taken: Rect[] = [];
  const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const bowClear = stem + (bowRamp ? 1.8 : 1.0);

  // 1. The stern gear.
  const sternRoller = !!d.sternRoller;
  if (sternRoller) taken.push({ x0: -0.3, x1: 0.3, z0: transom - 0.3, z1: transom }); // the roller in the transom bulwark
  const wantWinch = !!(d.towWinch || d.aFrame);
  const aFrameFeet: Rect[] = [];
  if (d.aFrame) {
    const fz = transom - afc.footFromTransom;
    const fx = q.halfBeam(fz) - afc.footInset;
    for (const sd of [-1, 1]) aFrameFeet.push({ x0: sd * fx - 0.2, x1: sd * fx + 0.2, z0: fz - 0.25, z1: fz + 0.25 });
    taken.push(...aFrameFeet);
  }

  // Plan shapes, in a piece's own axes (x to its starboard, z aft), turned by its facing
  // (quarter turns, as the socket's yaw: -90 deg each) and set at (x, z).
  const turn = (lx: number, lz: number, face: number): [number, number] => {
    const a = (-Math.PI / 2) * face;
    return [lx * Math.cos(a) + lz * Math.sin(a), -lx * Math.sin(a) + lz * Math.cos(a)];
  };
  const placeRect = (r: Rect, x: number, z: number, face: number): Rect => {
    const pts = [turn(r.x0, r.z0, face), turn(r.x1, r.z0, face), turn(r.x0, r.z1, face), turn(r.x1, r.z1, face)];
    return { x0: x + Math.min(...pts.map((p) => p[0])), x1: x + Math.max(...pts.map((p) => p[0])), z0: z + Math.min(...pts.map((p) => p[1])), z1: z + Math.max(...pts.map((p) => p[1])) };
  };
  // Each piece's plan: the winch (drum, cheeks, housing; room to stand forward of it, the
  // side away from its lead), the crane (plinth; its post on its starboard side, aft, with
  // room to stand), a pole (the pole, its box aft, room to stand aft of that).
  const winchShape: Rect[] = [{ x0: -twc.drumWidth / 2 - 0.12, x1: twc.drumWidth / 2 + 0.1 + twc.housing.width, z0: -0.25 - dg.standRoom, z1: 0.25 }];
  const cranePlinth = cr.plinthRadius + 0.1;
  const craneShape = (postX: number, postZ: number): Rect[] => [
    { x0: -cranePlinth, x1: cranePlinth, z0: -cranePlinth, z1: cranePlinth },
    { x0: postX - 0.3, x1: postX + 0.3, z0: postZ - 0.5, z1: postZ + 0.5 },
  ];
  const poleShape: Rect[] = [{ x0: -dp.box.width / 2 - 0.05, x1: dp.box.width / 2 + 0.05, z0: -0.12, z1: dp.box.depth + 0.45 }];
  // The house in plan with a margin, and its door's steps aft.
  const dhW = deckhouse ? Math.max(...deckhouse.plan.map(([, w]) => w)) : 0;
  const houseRect: Rect = { x0: -Math.max(hw, dhW) - 0.3, x1: Math.max(hw, dhW) + 0.3, z0: (deckhouse ? Math.min(front, deckhouse.z0) : front) - 0.3, z1: aft + 0.7 };
  /** The forward end of what stands on her deck amidships: the deckhouse's front, or the wheelhouse's. */
  const foreEnd = deckhouse ? Math.min(front, deckhouse.z0) : front;
  const onDeck = (r: Rect) => r.z0 > bowClear && r.z1 < transom - 0.15 && [r.z0, r.z1].every((z) => Math.max(Math.abs(r.x0), Math.abs(r.x1)) <= q.halfBeam(z) - 0.15);
  const standsOnDeck = (rects: Rect[]) => rects.every((r) => onDeck(r) && !overlaps(r, houseRect) && !taken.some((o) => overlaps(o, r)));
  // The roof: its edges, the masthead light's pole and the horn, and what's already on it.
  const roofTaken: [number, number, number][] = [
    [0, roofFront + 0.475, 0.45],
    [0, roofFront + 0.775, 0.3],
    // The deck floods (advanced controls).
    ...(d.controls ? ([at.floodFore, at.floodAft].map(([x, , z]) => [x, z, wl.flood.keepClear]) as [number, number, number][]) : []),
  ];
  const onRoof = (x: number, z: number) => Math.abs(x) < hw && z > front && z < aft;
  // (Not on the step down to a lower saloon roof.)
  const standsOnRoof = (x: number, z: number) => Math.abs(x) <= Math.min(hw - 0.2, hw + 0.15 - roofBack - 0.15) && z >= roofFront + 0.2 + sb(Math.abs(x) + 0.2) && z <= aft - 0.2 && (!saloonRoof || Math.abs(z - saloonRoof.z) >= 0.3) && roofTaken.every(([ox, oz, r]) => Math.hypot(x - ox, z - oz) >= r);
  /** The pinned cell, or the nearest within a metre where `stands` (x, z: boat axes); null if none. */
  const seat = (key: PlaceKey, stands: (x: number, z: number, face: number) => boolean): { x: number; z: number; face: number; moved: boolean } | null => {
    const p = placeOf(key, d[key]);
    if (!p) return null;
    const ring: [number, number][] = [];
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) ring.push([i, j]);
    ring.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
    for (const [i, j] of ring) {
      const x = p.x + i * PLACE_GRID.step;
      const z = transom - (p.fromTransom + j * PLACE_GRID.step);
      if (stands(x, z, p.face)) return { x: r2(x), z: r2(z), face: p.face, moved: i !== 0 || j !== 0 };
    }
    return null;
  };
  const placed: DesignedBoat['placed'] = {};
  const usual = (key: PlaceKey, what: string) => {
    placed[key] = null;
    warnings.push(`The ${what} won't stand where it's pinned (nor within a metre of it): it's in its usual place.`);
  };

  // 2 and 3: the tow winch.
  let winchAt: V3 | null = null;
  let winchFace = 0;
  if (wantWinch && d.winchAt) {
    const s = seat('winchAt', (x, z, f) => standsOnDeck(winchShape.map((r) => placeRect(r, x, z, f))));
    if (s) {
      winchAt = [s.x, q.deckY(s.z), s.z];
      winchFace = s.face;
      placed.winchAt = { x: s.x, z: s.z, moved: s.moved };
    } else usual('winchAt', 'tow winch');
  }
  if (wantWinch && !winchAt) {
    // Its usual place: on the centreline just forward of the transom, room forward of it to
    // stand at its buttons, clear of the house's door.
    const z = transom - dg.winchFromTransom;
    if (standsOnDeck(winchShape.map((r) => placeRect(r, 0, z, 0)))) winchAt = [0, q.deckY(z), r2(z)];
    else warnings.push(`Her aft deck is too short for the tow winch${d.aFrame ? ' (the A-frame’s warps lead off it, so the A-frame is left off too)' : ''}: left off.`);
  }
  if (winchAt) taken.push(...winchShape.map((r) => placeRect(r, winchAt![0], winchAt![2], winchFace)));
  const aFrame = !!d.aFrame && !!winchAt;

  // The deck crane: its socket where its column stands, so the crane module keeps it there
  // (placed by hand: 'socket'; at the deck edge: its 'auto' keeps an off-centre socket), and
  // the clash checks and its designed-in weight are where it really is. Its control post
  // stands inboard of it at the edge; placed by hand, on its own starboard side.
  let craneAt: V3 | null = null;
  let craneYaw = 0;
  let cranePlaced = false;
  if (d.deckCrane && d.craneAt) {
    const s = seat('craneAt', (x, z, f) => standsOnDeck(craneShape(cr.post.x, cr.post.z).map((r) => placeRect(r, x, z, f))));
    if (s) {
      craneAt = [s.x, q.deckY(s.z), s.z];
      craneYaw = -90 * s.face;
      cranePlaced = true;
      taken.push(...craneShape(cr.post.x, cr.post.z).map((r) => placeRect(r, s.x, s.z, s.face)));
      placed.craneAt = { x: s.x, z: s.z, moved: s.moved };
    } else usual('craneAt', 'deck crane');
  }
  if (d.deckCrane && !craneAt) {
    const fore = d.deckCrane === 1;
    const z = fore ? foreEnd - 0.9 : aft + 0.9;
    const x = (fore ? 1 : -1) * (q.halfBeam(z) - cr.edgeInset);
    // At the edge its post stands inboard; the aft one faces aft (its boom resting over the aft deck, not the house).
    const shape = craneShape(-Math.sign(x) * Math.abs(cr.post.x), (fore ? 1 : -1) * cr.post.z).map((r) => placeRect(r, x, z, 0));
    const room = fore ? z - cr.plinthRadius - 0.3 > bowClear : z + 0.4 < transom - 0.3;
    if (!room) warnings.push(`There's no room on her ${fore ? 'foredeck' : 'aft deck'} for the deck crane: left off.`);
    else if (shape.some((r) => taken.some((o) => overlaps(o, r)))) warnings.push(`The deck crane would stand on her ${fore ? 'foredeck' : 'aft deck'} gear: left off.`);
    else {
      craneAt = [x, q.deckY(z), z];
      craneYaw = fore ? 0 : 180;
      taken.push(...shape);
    }
  }

  // The skiff in her cradle and its crane (owner; module deck.tender-crane, its socket the
  // foot of the column): the cradle forward of the column (as on the workboat's foredeck),
  // the column at its aft end to one side, the skiff going over that side. On the foredeck
  // the column just forward of the house, on the aft deck as far aft as it fits. The cradle
  // is off the centreline toward the crane's side, as the deck crane is (owner: not central;
  // the skiff and crane together over to the side picked), as far over as fits; only if
  // there's no room off the centreline does it sit nearer the middle.
  const tc = CONFIG.vessels.workboat.tenderCrane;
  let skiffAt: V3 | null = null;
  if (d.skiff) {
    const fore = d.skiff <= 2;
    const side = d.skiff % 2 === 1 ? 1 : -1;
    const ahead = tc.column[1] - tc.cradle.z0; // the cradle reaches this far forward of the column
    const outset = tc.column[0] - tc.stow[0]; // the column this far out from the cradle's middle
    const shape = (cx: number, cz: number): Rect[] => [
      { x0: cx - side * outset - tc.cradle.halfWidth - 0.1, x1: cx - side * outset + tc.cradle.halfWidth + 0.1, z0: cz - ahead - 0.1, z1: cz + (tc.cradle.z1 - tc.column[1]) + 0.1 },
      { x0: cx - 0.35, x1: cx + 0.35, z0: cz - 0.35, z1: cz + 0.35 },
    ];
    // Its own check (the cradle is long): inside her beam at each end and the middle, 0.5 m
    // clear of the stem and 0.15 of the transom, clear of the house itself and of its aft
    // doorway (and the steps there, if any), and of her other gear.
    const body: Rect = { x0: -Math.max(hw, dhW) - 0.2, x1: Math.max(hw, dhW) + 0.2, z0: foreEnd - 0.2, z1: aft + 0.15 };
    const doorway: Rect = { x0: -0.6, x1: 0.6, z0: aft, z1: aft + 0.3 + Math.max(0, ...steps.map((st) => st.z1 - aft)) };
    const fits = (r: Rect) =>
      r.z0 > stem + 0.5 && r.z1 < transom - 0.15 && [r.z0, (r.z0 + r.z1) / 2, r.z1].every((z) => Math.max(Math.abs(r.x0), Math.abs(r.x1)) <= q.halfBeam(z) - 0.15) && !overlaps(r, body) && !overlaps(r, doorway) && !taken.some((o) => overlaps(o, r));
    const zs: number[] = [];
    if (fore) for (let z = foreEnd - 0.55; z - ahead > stem + 0.5; z -= 0.25) zs.push(z);
    else for (let z = transom - 0.5; z - ahead > aft; z -= 0.25) zs.push(z);
    // The cradle's middle shifted toward the column's side: as far over as fits (to 1.5 m),
    // at least `skiffOffset` off the centreline; nearer the middle only as a last resort.
    const least = CONFIG.shipyard.skiffOffset;
    const mids: number[] = [];
    for (let m = 1.5; m >= least - 1e-9; m -= 0.05) mids.push(Math.round(m * 100) / 100);
    const fallback = [0.2, 0.1, 0].filter((m) => m < least);
    search: for (const pass of [mids, fallback])
      for (const z of zs)
        for (const mid of pass) {
          const cx = side * (outset + mid);
          if (shape(cx, z).every(fits)) {
            skiffAt = [r2(cx), q.deckY(z), r2(z)];
            taken.push(...shape(cx, z));
            break search;
          }
        }
    if (!skiffAt) warnings.push(`There's no room on her ${fore ? 'foredeck' : 'aft deck'} for the skiff's cradle (${(ahead + 0.3).toFixed(1)} m long, ${(2 * tc.cradle.halfWidth + outset).toFixed(1)} m across with the crane) clear of her other gear: move the wheelhouse ${fore ? 'aft' : 'forward'}, or make her longer. Left off.`);
  }

  // The searchlight and the fire monitor: placed by hand, on the roof if the pin's on it
  // (clear of the masthead light, the horn and each other), else on a pole on deck; at their
  // usual places, on the roof (choice 1) or a pole a little off the house (2 fore, 3 aft).
  const roofOrPole = (key: 'lampAt' | 'monitorAt', what: string): { pole: V3 | null; roof: [number, number] | null } => {
    const s = seat(key, (x, z) => (onRoof(x, z) ? standsOnRoof(x, z) : standsOnDeck(poleShape.map((r) => placeRect(r, x, z, 0)))));
    if (!s) {
      usual(key, what);
      return { pole: null, roof: null };
    }
    placed[key] = { x: s.x, z: s.z, moved: s.moved, onRoof: onRoof(s.x, s.z) };
    if (onRoof(s.x, s.z)) {
      roofTaken.push([s.x, s.z, 0.6]);
      return { pole: null, roof: [s.x, s.z] };
    }
    taken.push(...poleShape.map((r) => placeRect(r, s.x, s.z, 0)));
    return { pole: [s.x, q.deckY(s.z), s.z], roof: null };
  };
  const lampHand = d.searchlight && d.lampAt ? roofOrPole('lampAt', 'searchlight') : { pole: null, roof: null };
  const monitorHand = d.fireMonitor && d.monitorAt ? roofOrPole('monitorAt', 'fire monitor') : { pole: null, roof: null };
  const lampByHand = !!(lampHand.pole || lampHand.roof);
  const monitorByHand = !!(monitorHand.pole || monitorHand.roof);
  /** A pole's foot on deck 1 (fore) or 2 (aft), starting on `side`; null (and a warning) if there's no room. */
  const poleFoot = (deck: number, side: number, what: string): V3 | null => {
    for (const step of [0, 1])
      for (const sd of [side, -side]) {
        const z = deck === 1 ? foreEnd - dp.fromHouse - 0.85 * step : aft + dp.fromHouse + 0.85 * step;
        const room = deck === 1 ? z - 0.2 > bowClear : z + dp.box.depth + 0.5 < transom - 0.2;
        const x = sd * (q.halfBeam(z) - dp.inset);
        if (!room || Math.abs(x) < 0.5) continue;
        const rect = placeRect(poleShape[0], x, z, 0);
        if (taken.some((o) => overlaps(o, rect))) continue;
        taken.push(rect);
        return [r2(x), q.deckY(z), r2(z)];
      }
    warnings.push(`There's no room on her ${deck === 1 ? 'foredeck' : 'aft deck'} for the ${what}'s pole: left off.`);
    return null;
  };
  const lampFoot = lampByHand ? lampHand.pole : d.searchlight >= 2 ? poleFoot(d.searchlight - 1, 1, 'searchlight') : null;
  const monitorFoot = monitorByHand ? monitorHand.pole : d.fireMonitor >= 2 ? poleFoot(d.fireMonitor - 1, -1, 'fire monitor') : null;
  const lampOnRoof = lampByHand ? !!lampHand.roof : d.searchlight === 1;
  const monitorOnRoof = monitorByHand ? !!monitorHand.roof : d.fireMonitor === 1;
  const hasLamp = lampOnRoof || !!lampFoot;
  const hasMonitor = monitorOnRoof || !!monitorFoot;

  // On the roof: the searchlight forward on the centreline, the monitor centred aft of the
  // masthead light's pole, clear of its barrel's swing; or where they're placed.
  const lampRoof: V3 = lampHand.roof ? [lampHand.roof[0], r2(roofTopAt(lampHand.roof[1]) + 0.13), lampHand.roof[1]] : at.searchlight;
  const monitorRoof: V3 = monitorHand.roof ? [monitorHand.roof[0], r2(roofTopAt(monitorHand.roof[1]) + 0.38), monitorHand.roof[1]] : [0, roofTopAt(0) + 0.38, r2(Math.min(roofFront + 1.25, aft - 0.3))];
  /** Where a deck piece is, in words: "Foredeck, port", "Aft deck, centreline". */
  const deckWords = (p: V3) => `${p[2] < front ? 'Foredeck' : p[2] > aft ? 'Aft deck' : 'Side deck'}, ${Math.abs(p[0]) < 0.2 ? 'centreline' : p[0] < 0 ? 'port' : 'starboard'}`;

  // The fender basket (owner: the crew's fenders): on deck against the bulwark, aft to
  // starboard where the starting workboat's is, else the next clear spot (port, then just
  // aft of the house, then the foredeck). The fenders hang over the side at three stations
  // spread along her, each side, when they're out.
  const pc = CONFIG.shipyard.protection;
  let basketAt: [number, number] | null = null;
  const fenderZs = [0.3, 0.55, 0.825].slice(0, pc.fenders).map((f) => r2(stem + f * (transom - stem)));
  if (prot.fenders) {
    for (const [sd, z] of [[1, transom - 0.6], [-1, transom - 0.6], [1, aft + 1.0], [-1, aft + 1.0], [1, foreEnd - 0.6], [-1, foreEnd - 0.6]]) {
      const x = sd * (q.halfBeam(z) - 0.45);
      const rect = { x0: x - 0.25, x1: x + 0.25, z0: z - 0.25, z1: z + 0.25 };
      if (!onDeck(rect) || overlaps(rect, houseRect) || taken.some((o) => overlaps(o, rect))) continue;
      basketAt = [r2(x), r2(z)];
      taken.push(rect);
      break;
    }
    if (!basketAt) warnings.push('There\'s no clear deck for the fender basket: the fenders are left off.');
  }

  // The anchor, last, on what deck's left (owner; module deck.anchor-windlass, its socket the roller where the chain
  // leaves her): at the bow, its roller on the bulwark's top just aft of the stem and the
  // windlass on the deck behind it; on a ramp-bow boat (the ramp is her bow) a kedge on the
  // port quarter, the roller on the transom facing aft.
  const ac = dg.anchor;
  const awc = CONFIG.modules.anchorWindlass;
  let anchorAt: { at: V3; yaw: number } | null = null;
  if (!d.noAnchor) {
    const z = bowRamp ? transom - 0.05 : stem + ac.fromStem;
    // The kedge on the port quarter, else the starboard, else along the transom toward the
    // middle, last on the centreline (if no stern roller's there), wherever there's room.
    const xs: number[] = [];
    const outer = q.halfBeam(transom - 0.3) - ac.fromSide;
    for (let k = outer; k >= 0.6; k -= 0.25) xs.push(-k, k);
    if (!sternRoller) xs.push(0);
    for (const x of bowRamp ? xs : [0]) {
      // The roller and the windlass behind it (forward of it, for the kedge), with room to work it.
      const rect: Rect = bowRamp ? { x0: x - 0.25, x1: x + 0.25, z0: z - ac.kedgeAft - 0.15, z1: z } : { x0: -0.25, x1: 0.25, z0: z, z1: z + awc.aft + 0.15 };
      // Clear of the house and of its aft door's steps (only the doorway: the margin the
      // other gear keeps round the house is more than a windlass needs).
      const clearOfHouse = !overlaps(rect, { ...houseRect, z1: aft + 0.15 }) && !overlaps(rect, { x0: -0.6, x1: 0.6, z0: aft, z1: aft + 0.8 });
      if (!clearOfHouse || taken.some((o) => overlaps(o, rect))) continue;
      anchorAt = { at: [r2(x), r2(q.bulwarkTop(z)), r2(z)], yaw: bowRamp ? 180 : 0 };
      taken.push(rect);
      break;
    }
    if (!anchorAt) warnings.push(`There's no room for the anchor's windlass ${bowRamp ? 'along her transom (clear of the stern gear)' : 'behind her bow roller (clear of the deckhouse)'}: left off.`);
  }


  // Her engine hatch (planned above, with the engine), now the deck gear has its places.
  const ctabW = d.chartTable ? CONFIG.modules.chartTable.width + 0.1 : 0;
  const zones: HatchZone[] = [];
  // (In the wheelhouse's floor: a saloon a step down has its own, at another height.)
  if (!deckhouse) zones.push({ floor: true, z0: cf + 0.5 + ehc.helmRoom, z1: saloonDrop ? helmAft - 0.05 : aft - wall - inside - 0.05, x0: () => -(hw - wall) + 0.05 + ctabW, x1: () => hw - wall - 0.05 });
  const houseZ0 = (deckhouse ? Math.min(front, deckhouse.z0) : front) - 0.3;
  const houseZ1 = aft + Math.max(0.7, (rise > 0 ? nSteps * tread : 0) + 0.3);
  const deckX = (z: number) => q.halfBeam(z) - ehc.deckMargin;
  zones.push({ floor: false, z0: stem + (bowRamp ? 1.8 : 1.0), z1: houseZ0, x0: (z) => -deckX(z), x1: deckX });
  zones.push({ floor: false, z0: houseZ1, z1: transom - 0.35, x0: (z) => -deckX(z), x1: deckX });
  const hatchLen = Math.max(ehc.minLength, Math.min(ehc.maxLength, engZ1 - engZ0 + 2 * ehc.endRoom));
  // In each, the spots along it (5 cm apart) clear of the gear placed on deck (`taken`, with
  // room to lift the lid: narrower or shorter if need be); the best is the one over most of
  // the engine, then the nearest its middle.
  const hatchesIn = (zone: HatchZone) => {
    const out = [];
    for (let len = Math.min(hatchLen, zone.z1 - zone.z0); len >= ehc.minLength - 1e-6; len -= 0.1) {
      for (let k = 0; k <= Math.floor((zone.z1 - zone.z0 - len) / 0.05); k++) {
        const mid = zone.z0 + len / 2 + k * 0.05;
        const z0 = mid - len / 2;
        const z1 = mid + len / 2;
        let x0 = Math.max(zone.x0(z0), zone.x0(z1), engX - engHalf - ehc.sideRoom);
        let x1 = Math.min(zone.x1(z0), zone.x1(z1), engX + engHalf + ehc.sideRoom);
        // Narrower, clear of gear beside it (a crane at the deck edge): from whichever side it's on.
        if (!zone.floor)
          for (const o of taken)
            if (o.z0 < z1 + 0.1 && o.z1 > z0 - 0.1) {
              if ((o.x0 + o.x1) / 2 >= engX) x1 = Math.min(x1, o.x0 - 0.1);
              else x0 = Math.max(x0, o.x1 + 0.1);
            }
        if (x1 - x0 < ehc.minWidth) continue;
        out.push({ zone, x0, x1, z0, z1, over: Math.max(0, Math.min(z1, engZ1) - Math.max(z0, engZ0)), off: Math.abs(mid - engMid) });
      }
    }
    return out;
  };
  const spot = zones.flatMap(hatchesIn).sort((a, b) => b.over - a.over || a.off - b.off)[0];
  // (Never without one in practice: a hull too short for any of these keeps it in the cabin floor, aft to starboard.)
  const hs = spot ?? { zone: zones[0] ?? { floor: true }, x0: 0.15, x1: Math.min(0.85, hw - 0.2), z0: aft - 1.125 - inside, z1: aft - 0.325 - inside };
  const hatchZ = (hs.z0 + hs.z1) / 2;
  /** The hatch's top: the cabin floor, or the deck there. */
  const hatchTop = hs.zone.floor ? floorY : q.deckY(hatchZ);
  // The engine space's floor plates: just over her bottom under the engine's sides (under
  // the hatch's sides for outboards' lazarette), so the engine stands up through them on
  // its bearers. The sea is kept out of it in the drawing (the diesel module's water stop).
  const sideXs = outboards ? [hs.x0, hs.x1] : (twin ? [-1, 1] : [1]).flatMap((s) => [s * engX - engHalf, s * engX + engHalf]);
  const soleY = Math.max(...[hs.z0, hatchZ, hs.z1].flatMap((z) => sideXs.map((x) => bottomUnder(shape, x, z)))) + ehc.soleClear;
  /** Her hull's inside half-breadth at height y, at z (from her section there: keel, chine, deck edge). */
  const insideHalf = (z: number, y: number) => {
    const s = halfSection(shape, z);
    for (let k = 1; k < s.length; k++)
      if (y <= s[k][1]) return s[k - 1][0] + ((s[k][0] - s[k - 1][0]) * (y - s[k - 1][1])) / Math.max(1e-6, s[k][1] - s[k - 1][1]);
    return s[s.length - 1][0];
  };
  // The space: across both engines of a twin (each on its own shaft, either side), otherwise
  // the hatch's own width; no wider than her hull inside at the floor plates (less a frame).
  // (In the cabin floor, inside the house's walls too: its walls stand on the floor's edge.)
  const roomHalf = Math.min(insideHalf(hs.z0, soleY), insideHalf(hs.z1, soleY), hs.zone.floor ? hw - wall : 99) - 0.05;
  const span = twin && !outboards ? engX + engHalf + ehc.sideRoom : 0;
  const sx0 = Math.max(-roomHalf, Math.min(hs.x0, -span));
  const sx1 = Math.min(roomHalf, Math.max(hs.x1, span));
  const eh = {
    x0: rnd(Math.max(hs.x0, sx0)),
    x1: rnd(Math.min(hs.x1, sx1)),
    z0: rnd(hs.z0),
    z1: rnd(hs.z1),
    pitDepth: rnd(hatchTop - soleY),
    ...(hs.zone.floor ? {} : { y: rnd(hatchTop) }),
    ...(sx0 < hs.x0 - 0.01 || sx1 > hs.x1 + 0.01 ? { space: { x0: rnd(sx0), x1: rnd(sx1) } } : {}),
  };
  layout.engineHatch = eh;
  at.engineSpace = [rnd((eh.x0 + eh.x1) / 2), rnd(soleY + 0.15), rnd(hatchZ)];
  // The dipstick on the engine's inboard side near its forward end, its ring a hand's depth
  // under the hatch (in reach through it); outboards': in the space under the hatch.
  const dipZ = Math.max(eh.z0 + 0.15, Math.min(eh.z1 - 0.15, engZ0 + 0.35));
  const dip: V3 = outboards
    ? [rnd(eh.x0 + 0.15), rnd(hatchTop - 0.32), rnd(eh.z0 + 0.2)]
    : [rnd(Math.max(eh.x0 + 0.06, engX - engHalf - 0.04)), rnd(Math.min(hatchTop - 0.25, Math.max(soleY + 0.1, engTopAt(dipZ) - 0.3))), rnd(dipZ)];
  const hatchIs = hs.zone.floor ? 'Cabin floor' : 'Deck';

  // The chart table (owner: its own choice): along the port wall at the aft end, its hinge
  // corner forward, if her house is wide enough to pass inboard of it and long enough to
  // leave the helm clear.
  const ctab = CONFIG.modules.chartTable;
  let chartTableAt: V3 | null = null;
  if (d.chartTable) {
    const z0 = aft - wall - 0.3 - ctab.depth;
    if (hw - wall - ctab.width >= 0.35 && z0 >= cf + 1.0 + sb(hw) && (!saloonDrop || z0 >= levels[levels.length - 1].z0)) chartTableAt = [-(hw - wall), FA, Math.round(z0 * 1000) / 1000];
    else warnings.push(`Her wheelhouse is too ${hw - wall - ctab.width < 0.35 ? 'narrow' : 'short'} for the chart table along its port wall: left off.`);
  }
  // The side door (owner): a sliding door in the port wall, aft of the console with room to
  // stand at the helm, forward of the chart table, onto a side deck wide enough to step out on.
  // The house itself is drawn with the opening (vessel/view/hullMesh.ts), and the door slides
  // and is walked through as the starting workboat's does.
  let sideDoor: { z0: number; z1: number; height: number; buttonHeight: number } | null = null;
  if (d.sideDoor) {
    const sdc = dg.sideDoor;
    const z0 = Math.max(cf + sb(hw) + wall + 0.5 + sdc.fromConsole, bowRamp ? at.rampButton[2] + 0.15 : -Infinity);
    // (Forward of the step down into a saloon: the doorway on one floor.)
    const zEnd = Math.min(chartTableAt ? chartTableAt[2] - 0.05 : aft - wall - 0.15, saloonDrop ? helmAft - 0.05 : Infinity);
    // Up to the window band's top edge (the door's opening runs up through the band).
    const height = Math.min(2.0, windowHead - 0.04, roofY - F - 0.12);
    const deckOutside = q.halfBeam(z0 + sdc.width / 2) - hw;
    // On a house raised on a deckhouse as wide as it, the door opens onto the side deck below
    // with no steps (owner: the crew jump in and out; if that's too high it's a bad design).
    // A sliding door wants a flat wall to slide along (owner): not with the windows raked out.
    if (d.flare) warnings.push('The side door slides along an upright wall: it needs upright side windows (not raked out all round): left off.');
    else if (deckhouse && !d.dhNarrow) warnings.push('The side door would open onto the deckhouse’s top, which isn’t walked yet (make the deckhouse as wide as the wheelhouse for one): left off.');
    else if (zEnd - z0 < sdc.width) warnings.push(`Her wheelhouse is too short for a side door between the helm and ${chartTableAt ? 'the chart table' : 'the aft wall'}: left off.`);
    else if (deckOutside < sdc.sideDeck) warnings.push('There\'s no side deck outside her wheelhouse to step out onto (a narrower house leaves one): the side door is left off.');
    else if (height < 1.7) warnings.push('Her wheelhouse is too low inside for a side door: left off.');
    else sideDoor = { z0: r2(z0), z1: r2(z0 + sdc.width), height: r2(height), buttonHeight: sdc.buttonHeight };
  }
  if (sideDoor) layout.wheelhouse!.sideDoor = sideDoor;
  // The life ring on the house's aft wall at the chosen side, its line made fast to that
  // quarter's cleat; the boat-hook clips along that bulwark, aft.
  const ringSide = d.lifeRing === 1 ? -1 : d.lifeRing === 2 ? 1 : 0;
  const ring = ringSide
    ? {
        // At hand height off the deck (on the deckhouse's aft face if she has one, the house's floor being up on it).
        stow: [r2(ringSide * Math.max(0.75, hw - dg.ringFromCorner)), r2(Math.min((deckhouse ? q.deckY(aft) : FA) + 1.15, F + sill - 0.3)), r2(aft + 0.06)] as V3,
        cleat: cleat(ringSide, sternCleat),
        hook: [r2(ringSide * (q.halfBeam(sternCleat - 1.2) - 0.08)), r2(q.deckY(sternCleat - 1.2) + bulwarkHeight - 0.05), r2(Math.max(aft + 0.2, sternCleat - 2.6)), r2(sternCleat - 0.3)] as [number, number, number, number],
      }
    : null;
  const sockets: Socket[] = [
    // (A stern drive: its engine and legs, weighed at the engine.)
    ...(sd ? [{ id: 'sternDrive', type: 'transom.outboards' as const, transform: { position: at.engineBed }, label: 'Against the transom: her engine and its stern drive' }] : []),
    ...(outboards ? [{ id: 'outboards', type: 'transom.outboards' as const, transform: { position: [0, outboards.mount.y, outboards.mount.z] as V3 }, label: 'The bracket off the transom: her outboards' }] : []),
    { id: 'helm', type: 'helm.console', transform: { position: at.console }, capacity: { size: [2 * (hw - wall) - 0.04, 1.6, 1.0] }, label: 'Helm console, across the front of the cabin' },
    { id: 'breakerPanel', type: 'wall.panel', transform: { position: at.breakerPanel, rotationDeg: [-40, -90, 0] }, label: 'Starboard wall, by the helm' },
    { id: 'batteryMaster', type: 'wall.panel', transform: { position: at.batteryMaster, rotationDeg: [0, 180, 0] }, label: 'Aft wall, starboard of the door, low' },
    { id: 'batterySelector', type: 'wall.panel', transform: { position: at.batterySelector, rotationDeg: [0, 180, 0] }, label: 'Aft wall, beside the battery master' },
    { id: 'vhf', type: 'cabin.overhead', transform: { position: at.vhf, rotationDeg: [0, 20, 0] }, label: 'Under the roof, out to port' },
    { id: 'fm', type: 'cabin.overhead', transform: { position: at.fm, rotationDeg: [0, -20, 0] }, label: 'Under the roof, out to starboard: the FM set' },
    { id: 'chartplotter', type: 'cabin.overhead', transform: { position: at.chartplotter, rotationDeg: [0, -35, 0] }, label: 'Under the roof, out to starboard ahead of the helm' },
    { id: 'navDisplay', type: 'cabin.overhead', transform: { position: at.navDisplay }, label: 'Overhead, on the centreline ahead of the helm' },
    { id: 'whiteboard', type: 'cabin.overhead', transform: { position: at.whiteboard, rotationDeg: [0, 180, 0] }, label: 'Under the roof by the aft wall, port of the door: the pull-down whiteboard' },
    { id: 'dutyBoard', type: 'wall.panel', transform: { position: at.dutyBoard, rotationDeg: [0, -90, 0] }, label: 'Starboard wall, aft' },
    ...(chartTableAt ? [{ id: 'chartTable', type: 'cabin.furniture' as const, transform: { position: chartTableAt }, capacity: { size: [ctab.width, roofAt(chartTableAt[2]) - chartTableAt[1], ctab.depth] as V3 }, label: 'Port wall, aft: the chart table' }] : []),
    { id: 'doorIn', type: 'wall.panel', transform: { position: [0.45, FA + 1.1, aft - wall], rotationDeg: [-90, 0, 0] }, label: 'Door frame, inside' },
    { id: 'doorOut', type: 'wall.panel', transform: { position: [0.45, FA + 1.1, aft], rotationDeg: [-90, 180, 0] }, label: 'Door frame, outside' },
    ...(rampBow
      ? ([
          { id: 'rampCabin', type: 'wall.panel', transform: { position: at.rampButton, rotationDeg: [-90, -90, 0] }, label: 'Port wall, by the helm' },
          { id: 'rampBow', type: 'wall.panel', transform: { position: rampBow, rotationDeg: [-90, -90, 0] }, label: 'Port bulwark, by the bow ramp' },
        ] as Socket[])
      : []),
    { id: 'engineHatch', type: 'deck.fitting', transform: { position: [eh.x1, hatchTop, hatchZ] }, capacity: { size: [eh.x1 - eh.x0, 0.035, eh.z1 - eh.z0] }, label: `${hatchIs}, over the engine` },
    { id: 'dipstick', type: 'deck.fitting', transform: { position: dip }, label: "Engine space, the engine's inboard side" },
    { id: 'oilCan', type: 'deck.fitting', transform: { position: [eh.x1 - 0.08, hatchTop - 0.3, eh.z1 - 0.15], rotationDeg: [0, 90, 0] }, label: 'Engine space, the shelf' },
    { id: 'engine', type: 'engine.bay', transform: { position: at.engineBed }, tags: ['inboard'], capacity: { maxPowerKw: 1000 }, label: 'Engine bed, on her shaft line' },
    { id: 'fuelTank', type: 'engine.bay', transform: { position: at.engineSpace }, label: 'Engine space (nominal)' },
    { id: 'batteries', type: 'engine.bay', transform: { position: at.engineSpace }, label: 'Engine space (nominal)' },
    { id: 'bilgePump', type: 'engine.bay', transform: { position: [at.engineSpace[0], rnd(soleY), at.engineSpace[2]] }, label: 'Bottom of the engine space (nominal)' },
    { id: 'rudder', type: 'hull.rudder', transform: { position: rudderPos }, label: 'Rudder stock, under the transom' },
    { id: 'cabinLight', type: 'cabin.overhead', transform: { position: at.cabinLight }, label: 'Cabin ceiling' },
    { id: 'overhead', type: 'cabin.overhead', transform: { position: at.overhead }, label: 'Under the roof, over the helm: the switch panel' },
    { id: 'floodFore', type: 'hull.light', transform: { position: at.floodFore }, label: 'Roof edge, forward: the foredeck flood' },
    { id: 'floodAft', type: 'hull.light', transform: { position: at.floodAft }, label: 'Roof edge, aft: the aft deck flood' },
    lampFoot
      ? { id: 'searchlight', type: 'deck.equipment', transform: { position: lampFoot }, label: `${deckWords(lampFoot)}: the searchlight's pole` }
      : { id: 'searchlight', type: 'roof.mount', transform: { position: lampRoof }, label: lampHand.roof ? 'Cabin roof: the searchlight' : 'Cabin roof, forward' },
    ...(hasMonitor
      ? [
          monitorFoot
            ? { id: 'fireMonitor', type: 'deck.equipment' as const, transform: { position: monitorFoot }, label: `${deckWords(monitorFoot)}: the fire monitor's pole` }
            : { id: 'fireMonitor', type: 'roof.mount' as const, transform: { position: monitorRoof }, label: 'Cabin roof, aft of the masthead light: the fire monitor' },
        ]
      : []),
    { id: 'navLights', type: 'hull.light', transform: { position: at.navLights }, label: 'Cabin roof: the navigation lights' },
    { id: 'horn', type: 'roof.mount', transform: { position: [0, roofTopAt(roofFront + 0.775), roofFront + 0.775] }, label: 'Cabin roof (nominal)' },
    { id: 'wipers', type: 'window.wiper', transform: { position: [0, roofY - 0.2, front] }, label: 'Over the front windows (nominal)' },
    { id: 'cleatFwdPort', type: 'deck.fitting', transform: { position: cleat(-1, bowCleat) }, label: 'Bulwark top, forward, port' },
    { id: 'cleatFwdStbd', type: 'deck.fitting', transform: { position: cleat(1, bowCleat) }, label: 'Bulwark top, forward, starboard' },
    { id: 'cleatAftPort', type: 'deck.fitting', transform: { position: cleat(-1, sternCleat) }, label: 'Bulwark top, aft, port' },
    { id: 'cleatAftStbd', type: 'deck.fitting', transform: { position: cleat(1, sternCleat) }, label: 'Bulwark top, aft, starboard' },
    ...(midCleat !== null && skiffAt
      ? ([
          { id: 'cleatMidPort', type: 'deck.fitting', transform: { position: cleat(-1, midCleat) }, label: "Bulwark top, amidships, port (the skiff's painter)" },
          { id: 'cleatMidStbd', type: 'deck.fitting', transform: { position: cleat(1, midCleat) }, label: "Bulwark top, amidships, starboard (the skiff's painter)" },
        ] as Socket[])
      : []),
    // The working deck gear (version 10).
    ...(winchAt ? [{ id: 'towWinch', type: 'deck.equipment' as const, transform: { position: winchAt, ...(winchFace ? { rotationDeg: [0, -90 * winchFace, 0] as V3 } : {}) }, label: `${deckWords(winchAt)}: the tow winch` }] : []),
    ...(sternRoller ? [{ id: 'sternRoller', type: 'stern.gantry' as const, transform: { position: [0, q.deckY(transom), transom] as V3 }, label: 'Transom, centreline: the notch in the bulwark' }] : []),
    ...(aFrame
      ? [
          { id: 'aFrame', type: 'stern.gantry' as const, transform: { position: [0, q.deckY(transom), transom] as V3 }, label: 'Transom, across the quarters: the A-frame' },
          { id: 'trawl', type: 'deck.equipment' as const, transform: { position: winchAt! }, label: 'Aft deck: the net (nominal)' },
        ]
      : []),
    ...(ring
      ? [
          { id: 'lifeRing', type: 'deck.fitting' as const, transform: { position: ring.stow }, label: `Wheelhouse aft wall, ${ringSide < 0 ? 'port' : 'starboard'}: the life ring (its line on that quarter's cleat)` },
          { id: 'boatHook', type: 'deck.fitting' as const, transform: { position: [ring.hook[0], ring.hook[1], ring.hook[2]] as V3 }, label: `${ringSide < 0 ? 'Port' : 'Starboard'} bulwark, aft: the boat-hook clips` },
        ]
      : []),
    ...(sideDoor
      ? ([
          { id: 'sideDoorIn', type: 'wall.panel', transform: { position: [r2(-hw + wall), r2(F + sideDoor.buttonHeight), r2(sideDoor.z0 - 0.04)], rotationDeg: [-90, -90, 0] }, label: 'Side door jamb, inside' },
          { id: 'sideDoorOut', type: 'wall.panel', transform: { position: [-hw, r2(F + sideDoor.buttonHeight), r2(sideDoor.z0 - 0.04)], rotationDeg: [-90, 90, 0] }, label: 'Side door jamb, outside' },
        ] as Socket[])
      : []),
    ...(craneAt
      ? [
          // The aft one faces aft (its boom rests over the aft deck, not the house).
          { id: 'deckCrane', type: 'deck.equipment' as const, transform: { position: craneAt, ...(craneYaw ? { rotationDeg: [0, craneYaw, 0] as V3 } : {}) }, capacity: { loadRatingKg: 1000 }, label: cranePlaced ? `${deckWords(craneAt)}: the deck crane` : d.deckCrane === 1 ? 'Foredeck, starboard edge: the deck crane' : 'Aft deck, port edge: the deck crane' },
        ]
      : []),
    // Hull protection: the fender basket on deck; the strake or tyres along her sides.
    ...(basketAt ? [{ id: 'fenders', type: 'deck.fitting' as const, transform: { position: [basketAt[0], q.deckY(basketAt[1]), basketAt[1]] as V3 }, label: `${deckWords([basketAt[0], 0, basketAt[1]])}: the fender basket` }] : []),
    ...(pushFender ? [{ id: 'pushFender', type: 'hull.side' as const, transform: { position: [0, pushFender.bottom, pushFender.z] as V3 }, label: 'Her square bow: the push fender' }] : []),
    ...(prot.side ? [{ id: 'hullGuard', type: 'hull.side' as const, transform: { position: [0, q.deckY(0), 0] as V3 }, label: prot.side === 'strake' ? 'Her sheer, all round: the rubbing strake' : 'Her sides: the tyres' }] : []),
    // The deck hydraulics' pump on the engine's power take-off, for the crane and the winch.
    ...(anchorAt ? [{ id: 'anchor', type: (bowRamp ? 'deck.equipment' : 'bow.windlass') as 'deck.equipment', transform: { position: anchorAt.at, rotationDeg: [0, anchorAt.yaw, 0] as V3 }, label: bowRamp ? 'The stern roller for the kedge anchor, port quarter' : 'The bow roller and the windlass behind it' }] : []),
    ...(skiffAt ? [{ id: 'tenderCrane', type: 'deck.equipment' as const, transform: { position: skiffAt }, label: 'The skiff crane\'s column (her cradle forward of it)' }] : []),
    ...(craneAt || winchAt || skiffAt ? [{ id: 'hydraulicPump', type: 'engine.bay' as const, transform: { position: at.engineSpace }, label: 'On the engine\'s power take-off (nominal)' }] : []),
  ];
  // (Her open deck aft of the house, for the rescue places below.)
  const aftDeck = transom - 0.5 - aft;
  // Her rescue places (owner, Oct 2026: a Shipyard boat with a life ring gets the rescue
  // calls, as the workboat does): survivors on the line come aboard over the transom's
  // centre at the waterline (`stern`), and sit on the larger open deck, three abreast.
  const seatZ = r2(aftDeck >= 1.5 ? (aft + transom) / 2 : (stem + front) / 2);
  const seatX = r2(Math.min(0.9, q.halfBeam(seatZ) - 0.5));
  const rescueGear = ring
    ? {
        ringStow: ring.stow,
        ringCleat: ring.cleat,
        hookStow: ring.hook,
        stern: [0, 0.2, r2(transom - 0.05)] as V3,
        seats: [[-seatX, seatZ], [seatX, seatZ], [0, r2(seatZ - 0.2)]] as [number, number][],
      }
    : undefined;
  // What she can carry on deck: what she'd displace sunk by a share of her freeboard
  // (CONFIG.shipyard.weights.payloadFreeboard), less what she weighs. So the same hull in
  // aluminium carries more than in steel: she has more reserve of buoyancy.
  const sunkBy = CONFIG.shipyard.weights.payloadFreeboard * deckMid;
  const payloadKg = Math.max(0, Math.round((atDWL({ ...shape, stations: st.map((s) => ({ ...s, polygon: s.polygon.map(([x, y]) => [x, y - sunkBy] as [number, number]) })) }).volume * rho - mass) / 100) * 100);
  const hull: HullDefinition = {
    id: 'hull.design',
    version: 1,
    name: `Shipyard design ${code}`,
    helm: { stand: [0, F, cf + 1.125], yawDeg: 0 },
    form,
    lightship: lightshipOf(weighed, [
      outboards ? { massKg: obc.massKg * nOb, at: [0, outboards.mount.y, outboards.mount.z] as V3 } : { massKg: (eng.kg + (sd ? sdc.legKg : 0)) * n, at: at.engineBed },
      { massKg: batteriesKg, at: at.engineSpace },
      // The deck crane, if she has one: designed in where its column stands, so she still
      // floats on her lines and upright with it (her hull and ballast lighter by its weight,
      // and trimmed against it: a crane at the starboard edge, her ballast a little to port).
      ...(craneAt ? [{ massKg: cr.massKg, at: [craneAt[0], craneAt[1] + cr.columnHeight / 2, craneAt[2]] as V3 }] : []),
    ]),
    addedMass: lc.addedMass,
    damping,
    // Tyres hanging low catch spray and the odd wave: a little more drag.
    resistance: { ...lc.resistance, lwl: Math.round(h.lwl * 100) / 100, ...(tyres.length ? { formFactor: lc.resistance.formFactor + hg.tyres.formFactorAdd } : {}) },
    ...(base.planing ? { planing: lc.planing } : {}),
    windage: {
      side: Math.round(lengthM * freeboard + houseL * (roofY + 0.3 - level) - saloonL * roofDrop + (deckhouse ? (deckhouse.z1 - deckhouse.z0) * d.dhHeight : 0)),
      front: Math.round(beamDeck * freeboard + 2 * hw * (roofY + 0.3 - level) + (deckhouse ? 2 * Math.max(0, dhW - hw) * d.dhHeight : 0)),
      center: [0, Math.round((freeboard + 0.4) * 100) / 100, Math.round(((front + aft) / 4) * 100) / 100],
    },
    layout,
    cargo: { maxPayloadKg: payloadKg, slots: 0, bowClear: 0.4, aftClear: 0.25, fixed: false },
    spawn: { x: 0, z: -22, dropHeight: 3, headingDeg: 90 },
    fittings: {
      exhaust: { position: [0.55, 0.2, transom + 0.05], direction: [0, -0.12, 1] },
      stowage: {
        extinguisher: [-(hw - 0.2), F + 0.58, aft - 0.15],
        torch: [-(hw - 0.45), F + 0.68, aft - 0.12],
        binoculars: { at: [-(hw - 0.35), F + 1.35, cf + 0.14 + sb(hw - 0.35)], yawDeg: 20 },
      },
      livery: liveryOf(d),
      ...(rescueGear ? { rescueGear } : {}),
    },
    sockets,
    provides: [{ power: 'electrical', circuits: BREAKERS }],
    features: [
      { id: 'door.aft', kind: 'door', openKey: 'door.aft.open' },
      ...(sideDoor ? [{ id: 'door.side', kind: 'door' as const, openKey: 'door.side.open' as const }] : []),
      { id: 'hatch.engine', kind: 'hatch', openKey: 'hatch.engine.open' },
      ...(bowRamp ? [{ id: 'ramp.bow', kind: 'door' as const, openKey: 'ramp.bow.down' as const }] : []),
    ],
  };

  // ── Recipe: the landing craft's, with her machinery, controls and places ──
  const recipe = structuredClone(landingCraftRecipe) as unknown as Recipe;
  recipe.id = 'vessel.design';
  recipe.name = `Shipyard design ${code}`;
  recipe.hull = 'hull.design';
  const k = kw / 150;
  // (A slower-revving engine, ENGINES ratedRpm, `rs` above: every rpm of the 1800 rpm curve
  // scaled by rs, its torque by k / rs (the same power at fewer revs is more torque). Its
  // friction follows the torque; its flywheel is heavier in the same proportion.)
  const kq = k / rs;
  const bySocket = (list: Mount[], id: string) => list.find((m) => m.socket === id);
  const engine = bySocket(recipe.modules, 'engine')!.config as Record<string, any>;
  Object.assign(engine.engine, {
    powerKw: kw,
    torqueCurve: BASE_TORQUE.map(([r, t]) => [Math.round(r * rs), Math.round(t * kq)]),
    frictionTorque: Math.round(40 * kq ** 0.6),
    inertia: Math.round(1.6 * kq * 10) / 10,
    starterTorque: Math.round(280 * Math.sqrt(kq)),
    // (Its own idle if it has one: the tug diesel's 450 rpm. Scaled from the 1800 rpm
    // engine's it was 360, so slow its six fired 18 times a second, heard as one thumping
    // cylinder, owner: "still sounds like a single cylinder"; 450 is usual for its kind.)
    idleRpm: 'idleRpm' in eng ? eng.idleRpm : Math.round(engine.engine.idleRpm * rs),
    ratedRpm: eng.ratedRpm,
    droopRpm: Math.round(engine.engine.droopRpm * rs),
    starterMaxRpm: Math.round(engine.engine.starterMaxRpm * rs),
    rackRiseRate: eng.rackRise,
    gearRatio: gear,
  });
  engine.engine.fuel = { ...engine.engine.fuel, tankL: tankL, startL: Math.round(tankL * 0.7) };
  engine.engine.thermal = { ...engine.engine.thermal, heatCapacity: Math.round(60 * k), exchangerKwPerK: Math.round(1.7 * k * 100) / 100 };
  Object.assign(engine.propeller, { diameter: propD, kt0: prop.kt0, j0: prop.j0, kq0: prop.kq0, jq0: prop.jq0, wake: prop.wake, thrustDeduction: prop.thrustDeduction, position: propPos });
  engine.sampleAt = rudderPos;
  engine.voice = eng.voice;
  engine.massKg = eng.kg;
  if (twin) engine.twin = { x: twinX };
  Object.assign(engine.maintenance, {
    engine: { ...engine.maintenance.engine, x: engX, z: rnd(engMid), length: engL, width: engW, height: engH },
    dipstick: [dip[0], dip[2]],
    filler: [engX, rnd(dipZ)],
    oilCan: [rnd(eh.x1 - 0.08), rnd(eh.z1 - 0.15)],
  });
  // Drawn as built (vessel/view/engineModels.ts): the Shipyard's model of her engine type, on her shaft line.
  engine.installed = { model: d.engine, size: [engL, engW, engH], xs: twin ? [-shaft.x, shaft.x] : [0], flangeY: rnd(shaft.flangeY), flangeZ: rnd(shaft.flangeZ), angleDeg: shaft.angleDeg };
  const rudder = bySocket(recipe.modules, 'rudder')!.config as Record<string, any>;
  Object.assign(rudder.rudder, { area: rudderArea, position: rudderPos });
  rudder.propeller = { wake: prop.wake, diameter: propD };
  rudder.nozzle = nozzle;
  engine.nozzle = nozzle;
  if (sdLegs) {
    // Her stern drives in place of the shaft and rudder: the outboards' module (the legs swing
    // to steer) with her inboard engine package, drawn inside against the transom.
    recipe.modules = recipe.modules.filter((m) => m.socket !== 'engine' && m.socket !== 'rudder');
    recipe.modules.unshift({
      socket: 'sternDrive',
      module: 'propulsion.outboard',
      config: {
        engine: engine.engine,
        propeller: { ...engine.propeller, diameter: sdPropD },
        units: sdLegs.units,
        mount: sdLegs.mount,
        steering: obc.steering,
        look: sdLegs.look,
        // (The inboard's electrics and oil, as its module has them: CONFIG.modules.dieselInboard.)
        alternatorAmps: engine.alternatorAmps ?? CONFIG.modules.dieselInboard.alternatorAmps,
        oilUse: engine.oilUse ?? CONFIG.vessels.workboat.maintenance.use,
        starterAmps: engine.starterAmps ?? CONFIG.modules.dieselInboard.starterAmps,
        massKg: eng.kg + sdc.legKg,
        maintenance: engine.maintenance,
        voice: eng.voice,
        sterndrive: true,
        installed: engine.installed,
      },
    });
  }
  if (outboards) {
    // Her outboards in place of the inboard and its rudder; her upkeep (the oil checks) at the hatch as before.
    const maintenance = engine.maintenance;
    recipe.modules = recipe.modules.filter((m) => m.socket !== 'engine' && m.socket !== 'rudder');
    recipe.modules.unshift({ socket: 'outboards', module: 'propulsion.outboard', config: { ...outboards, maintenance } });
  }
  bySocket(recipe.modules, 'fuelTank')!.config = { tankL, startL: Math.round(tankL * 0.7) };
  for (const m of recipe.modules) {
    if (m.module === 'deck.cleat') (m.config as Record<string, any>).stations = { bow: bowCleat, stern: sternCleat, midship: midCleat ?? 0 };
  }
  // The skiff's painter's cleats (amidships, each side), with the skiff (if she's aboard).
  if (midCleat !== null && skiffAt)
    recipe.modules.push(
      { socket: 'cleatMidPort', module: 'deck.cleat', config: { end: 'midship', side: -1, stations: { bow: bowCleat, stern: sternCleat, midship: midCleat } } },
      { socket: 'cleatMidStbd', module: 'deck.cleat', config: { end: 'midship', side: 1, stations: { bow: bowCleat, stern: sternCleat, midship: midCleat } } },
    );
  // The searchlight on the roof or its pole (or none), and the fire monitor.
  if (lampFoot) bySocket(recipe.modules, 'searchlight')!.config = { position: [lampFoot[0], r2(lampFoot[1] + dp.lampHeight), lampFoot[2]], pole: { deckY: lampFoot[1] } };
  else if (hasLamp) bySocket(recipe.modules, 'searchlight')!.config = { position: lampRoof };
  else recipe.modules = recipe.modules.filter((m) => m.socket !== 'searchlight');
  if (monitorFoot) recipe.modules.push({ socket: 'fireMonitor', module: 'deck.fire-monitor', config: { position: [monitorFoot[0], r2(monitorFoot[1] + dp.nozzleHeight), monitorFoot[2]], pole: { deckY: monitorFoot[1] } } });
  else if (hasMonitor) recipe.modules.push({ socket: 'fireMonitor', module: 'deck.fire-monitor', config: { position: monitorRoof } }); // its gauge: on the console, below
  const fl = houseFlare(layout.wheelhouse!);
  const onFlaredRoof = ([x, y, z]: V3): V3 => (fl ? fl.at(x, y, z) : [x, y, z]).map((v, i) => (i === 1 ? v : r2(v))) as V3;
  bySocket(recipe.modules, 'navLights')!.config = {
    // The masthead light on its own pole from the roof (no signal mast on her).
    mast: { footY: roofTopAt(roofFront + 0.475) },
    lights: {
      masthead: [0, roofTopAt(roofFront + 0.475) + 1.1, roofFront + 0.475],
      // The sidelights on the house sides, above the windows, just aft of the header.
      // The sidelights on the roof's edges (the windows run up to it), just aft of the front glass.
      // (On the chamfered side at mid-thickness, just proud of it.)
      // (A faceted front's roof is cut back at its corners: they go back with it.)
      // (Raked out all round, the roof's edge is further out: they go with it, houseFlare.ts.)
      port: onFlaredRoof([-(hw + 0.15 - roofBack / 2 + 0.03), roofY + roofThickness / 2, Math.max(front, zHead) + 0.175 + sb(hw + 0.15)]),
      starboard: onFlaredRoof([hw + 0.15 - roofBack / 2 + 0.03, roofY + roofThickness / 2, Math.max(front, zHead) + 0.175 + sb(hw + 0.15)]),
      stern: [0, q.deckY(transom) + 0.6, transom - 0.05],
    },
  };
  // The console, laid out across her cabin: the landing craft's dash, widened or narrowed.
  const consoleMount = bySocket(recipe.modules, 'helm')!;
  const cc = consoleMount.config as Record<string, any>;
  // The helm's searchlight and monitor controls: always for a unit on the roof (the only
  // place to work it from); for one on a pole (which has its own) with the advanced controls.
  const lampAtHelm = lampOnRoof || (!!lampFoot && !!d.controls);
  const monitorAtHelm = monitorOnRoof || (!!monitorFoot && !!d.controls);
  const searchGroup = cc.groups.find((gp: { title: string }) => gp.title === 'SEARCH');
  if (!lampAtHelm) {
    consoleMount.modules = consoleMount.modules!.filter((m) => m.socket !== 'spotlight' && m.socket !== 'spotJoystick');
    cc.groups = cc.groups.filter((gp: { title: string }) => gp !== searchGroup);
  }
  if (monitorAtHelm) {
    // FIRE PUMP beside SPOT (or in its place), the monitor's joystick aft on the same pedestal
    // as the searchlight's, and its FIRE gauge between them.
    const [px] = cc.pedestals.x.filter((x: number) => x < 0);
    cc.slots.firePump = { position: [lampAtHelm ? -0.3 : -0.39, 0.01, -0.2] };
    cc.slots.monJoystick = { position: [px, 0.01, 0.23] };
    if (lampAtHelm) cc.slots.spotJoystick.position = [px, 0.01, -0.01];
    consoleMount.modules!.push(
      { socket: 'firePump', module: 'control.toggle', config: { label: 'FIRE PUMP (needs the engine running)', engrave: 'FIRE PUMP' }, bind: { value: 'firePump.on' } },
      { socket: 'monJoystick', module: 'control.joystick', config: { label: 'Fire monitor joystick', engrave: 'MONITOR', knob: '#d8301a', panRateDeg: 40 }, bind: { pan: 'monitor.pan', tilt: 'monitor.tilt' } },
    );
    if (lampAtHelm) Object.assign(searchGroup, { title: 'SEARCH · FIRE', x: [-0.48, -0.24] });
    else cc.groups.push({ ...searchGroup, title: 'FIRE' });
  }
  // The ANCHOR switch, and the skiff crane's button's place, starboard of the wheel (the
  // gap between the SEARCH and ENGINE groups), in a DECK group.
  if (anchorAt || d.skiff) {
    cc.slots.anchor = { position: [0.12, 0.01, -0.2] };
    cc.slots.skiffCrane = { position: [0.27, 0.01, -0.2] };
    cc.groups.push({ title: 'DECK', x: [0.04, 0.35], color: 0x8a6d2a });
    if (anchorAt) consoleMount.modules!.push({ socket: 'anchor', module: 'control.toggle', config: { label: 'Anchor: let go / heave in', engrave: 'ANCHOR' }, bind: { value: 'anchor.letGo' } });
  }
  const dashHalf = hw - wall - 0.11;
  const sx = dashHalf / cc.dash.halfWidth;
  cc.dash.halfWidth = Math.round(dashHalf * 1000) / 1000;
  // The throttle (and its pedestal) beside the wheel, no further out than on the reference console
  // (owner: on a wide console, spread with it, it was out of reach in VR); closer on a narrow one.
  const throttleX = cc.slots.throttle.position[0] as number;
  const throttleAt = Math.round(throttleX * Math.min(1, sx) * 1000) / 1000;
  cc.pedestals.x = cc.pedestals.x.map((x: number) => (x === throttleX ? throttleAt : Math.round(x * sx * 1000) / 1000));
  cc.groups = cc.groups.map((gp: { x: [number, number] }) => ({ ...gp, x: gp.x.map((x) => Math.round(x * sx * 1000) / 1000) }));
  for (const slot of Object.values(cc.slots) as { position: V3 }[]) slot.position = [Math.round(slot.position[0] * sx * 1000) / 1000, slot.position[1], slot.position[2]];
  cc.slots.throttle.position = [throttleAt, cc.slots.throttle.position[1], cc.slots.throttle.position[2]];
  // A faceted front: the dash wraps round with it (console.standard's `wrap`), its wings set back as the outer windows are.
  // Its controls stay square to her (owner: forward is forward); its screens turn with the wings, flush with the dash's face.
  if (house.facet)
    cc.wrap = {
      centre: house.facet.centre,
      k: Math.round((house.facet.depth / (hw - house.facet.centre)) * 1e4) / 1e4,
      turn: consoleMount.modules!.filter((m) => m.module === 'instrument.screen').map((m) => m.socket),
      // The throttle stays beside the wheel where it is on a flat console (owner: set back with the wing it was out of reach in VR).
      fixed: ['throttle'],
    };
  // The advanced instruments (taken off again below for the basic controls), and the chart table.
  recipe.modules.push(
    { socket: 'chartplotter', module: 'nav.chartplotter' },
    { socket: 'navDisplay', module: 'instrument.screen', config: { screen: 'nav', mount: 'hung' } },
    // (As wide as fits port of the door, up to its own width.)
    { socket: 'whiteboard', module: 'furniture.whiteboard', config: { roller: { ...CONFIG.modules.whiteboard.roller, width: Math.round(Math.min(CONFIG.modules.whiteboard.roller.width, hw - wall - 0.1 - 0.2) * 100) / 100 } } },
    { socket: 'dutyBoard', module: 'furniture.duty-board' },
  );
  // The working lights (the workboat's, as modules): the floods aimed at the middle of the
  // foredeck and of the aft deck, and the overhead panel with their two switches (no FM set
  // in it: hers hangs on its own, out to starboard; no rail lights for now, owner).
  const zFore = (stem + front) / 2;
  const zAftDeck = (aft + transom) / 2;
  const lamps = {
    fore: { position: at.floodFore, target: [0, r2(q.deckY(zFore)), r2(zFore)] as V3 },
    aft: { position: at.floodAft, target: [0, r2(q.deckY(zAftDeck)), r2(zAftDeck)] as V3 },
  };
  const ohp = CONFIG.modules.overheadPanel;
  recipe.modules.push(
    { socket: 'floodFore', module: 'light.flood', config: { end: 'fore', lamps }, bind: { on: 'lights.deckFore' } },
    { socket: 'floodAft', module: 'light.flood', config: { end: 'aft', lamps }, bind: { on: 'lights.deckAft' } },
    {
      socket: 'overhead',
      module: 'panel.overhead',
      config: {
        width: 0.32,
        slots: { deckFore: { x: -0.06, hang: true }, deckAft: { x: 0.06, hang: true } },
        legends: [
          { text: 'FOREDECK', x: -0.06 },
          { text: 'AFT DECK', x: 0.06 },
        ],
        legend: ohp.legend,
      },
      modules: [
        { socket: 'deckFore', module: 'control.toggle', config: { label: 'Foredeck floodlight' }, bind: { value: 'lights.deckFore' } },
        { socket: 'deckAft', module: 'control.toggle', config: { label: 'Aft deck floodlight' }, bind: { value: 'lights.deckAft' } },
      ],
    },
  );
  if (chartTableAt) recipe.modules.push({ socket: 'chartTable', module: 'furniture.chart-table' });
  if (!d.controls) {
    // Basic: wheel, throttle, starting (key, START, the lamps and the card), speed with
    // depth, rpm, and the VHF (owner, Oct 2026: every boat answers calls, hears the forecasts
    // and the harbours). No lights, searchlight, horn, wipers, heading, engine monitor or FM radio.
    // The searchlight's and monitor's controls stay if they're worked from here.
    const keep = ['wheel', 'throttle', 'start', 'key', 'lamps', 'card', 'speed', 'rpm', 'spotlight', 'spotJoystick', 'firePump', 'monJoystick', 'anchor'];
    consoleMount.modules = consoleMount.modules!.filter((m) => keep.includes(m.socket));
    cc.groups = cc.groups.filter((gp: { title: string }) => ['ENGINE', 'SEARCH', 'FIRE', 'SEARCH · FIRE', 'DECK'].includes(gp.title));
    // (The FM set and the advanced instruments come with the advanced controls, owner.)
    recipe.modules = recipe.modules.filter((m) => !['cabinLight', 'horn', 'wipers', 'fm', 'navLights', 'chartplotter', 'navDisplay', 'whiteboard', 'dutyBoard', 'overhead', 'floodFore', 'floodAft'].includes(m.socket));
  }
  // Low windows (owner): the console's upright panel comes off, so you see down past it; its
  // screens stay where they were, each on a stalk from the desk (console.standard's `bare`).
  if (d.sills) cc.bare = { screens: consoleMount.modules!.filter((m) => m.module === 'instrument.screen').map((m) => m.socket) };
  if (hasMonitor && !monitorFoot) {
    // The roof monitor's FIRE gauge on the console, between the two joysticks.
    const [mx, , mz] = cc.slots.monJoystick.position as V3;
    const mon = bySocket(recipe.modules, 'fireMonitor')!;
    mon.config = { ...mon.config, gauge: { ...CONFIG.vessels.workboat.fireMonitor.gauge, position: [r2(at.console[0] + mx), r2(at.console[1] + 0.012), r2(at.console[2] + mz - 0.125 + sb(mx))] } };
  }
  if (!bowRamp) recipe.modules = recipe.modules.filter((m) => m.socket !== 'rampCabin' && m.socket !== 'rampBow');
  if (craneAt) {
    // Its control post goes inboard of it by itself (the module's seat), whichever way it faces.
    recipe.modules.push({ socket: 'deckCrane', module: 'deck.crane', ...(cranePlaced ? { config: { side: 'socket' } } : {}) });
  }
  // The working deck gear (version 10), and a hydraulic pump for whatever needs one.
  if (winchAt) recipe.modules.push({ socket: 'towWinch', module: 'deck.tow-winch' });
  if (sternRoller) recipe.modules.push({ socket: 'sternRoller', module: 'deck.stern-roller' });
  if (aFrame) recipe.modules.push({ socket: 'aFrame', module: 'deck.a-frame' }, { socket: 'trawl', module: 'fishing.trawl' });
  if (ring) recipe.modules.push({ socket: 'lifeRing', module: 'rescue.life-ring-station', config: { stow: ring.stow, cleat: ring.cleat } }, { socket: 'boatHook', module: 'rescue.boat-hook-rack', config: { stow: ring.hook } });
  if (sideDoor)
    recipe.modules.push(
      { socket: 'sideDoorIn', module: 'control.door-button', config: { label: 'Side door: open / shut' }, bind: { door: 'door.side.open' } },
      { socket: 'sideDoorOut', module: 'control.door-button', config: { label: 'Side door: open / shut' }, bind: { door: 'door.side.open' } },
    );
  if (anchorAt) recipe.modules.push({ socket: 'anchor', module: 'deck.anchor-windlass', ...(bowRamp ? { config: { aft: ac.kedgeAft } } : {}) });
  if (skiffAt) {
    // Its SKIFF CRANE button on the dash, starboard of the wheel (beside the ANCHOR switch).
    const [bx, , bz] = cc.slots.skiffCrane.position as V3;
    recipe.modules.push({ socket: 'tenderCrane', module: 'deck.tender-crane', config: { consoleButton: [r2(at.console[0] + bx), r2(at.console[1] + 0.01), r2(at.console[2] + bz + sb(bx))] } });
  }
  if (craneAt || winchAt || skiffAt) recipe.modules.push({ socket: 'hydraulicPump', module: 'hydraulics.pto-pump' });
  if (basketAt) recipe.modules.push({ socket: 'fenders', module: 'deck.fenders', config: { z: fenderZs, basket: basketAt } });
  if (pushFender) recipe.modules.push({ socket: 'pushFender', module: 'hull.push-fender', config: pushFender });
  if (prot.side) recipe.modules.push({ socket: 'hullGuard', module: 'hull.guard', config: { kind: prot.side, aroundBow: !bowRamp } });

  // ── Her weights, built up (owner, Oct 2026: aluminium or steel, the houses counted) ──
  // Each part's weight and the height of its centre. Her hull: her plating and framing, by
  // its area (every station's section all round, deck included, and her transom and any
  // square bow plate) at the material's weight a square metre; her bulwarks the same, lighter.
  // Her houses: walls, roof and floor by area. Her machinery, batteries and crane as their
  // modules weigh. Her deck gear, hull protection, fit-out (wiring, interior, windows,
  // fittings, paint, by her deck area), and her load as she's trialled: half her fuel, crew
  // and stores (CONFIG.shipyard.weights).
  const bulwarkRun = 2 * lengthM + 2 * st[0].halfBeamDeck + (bowRamp ? 0 : 2 * st[st.length - 1].halfBeamDeck);
  const houseM2 = 2 * (houseL + 2 * hw) * (roofY - floorY) - 2 * saloonL * roofDrop + 2 * (2 * hw * houseL);
  const machineKg = outboards ? obc.massKg * nOb : eng.kg * n;
  const machineY = outboards ? outboards.mount.y : at.engineBed[1];
  const machineZ = outboards ? outboards.mount.z : at.engineBed[2];
  const gearAt: [number, number][] = [
    ...(winchAt ? [[wc.gear.towWinch, winchAt[2]] as [number, number]] : []),
    ...(aFrame ? [[wc.gear.aFrame, transom - afc.footFromTransom] as [number, number]] : []),
    ...(sternRoller ? [[wc.gear.sternRoller, transom] as [number, number]] : []),
    ...(skiffAt ? [[wc.gear.skiff, skiffAt[2]] as [number, number]] : []),
    ...(anchorAt ? [[wc.gear.anchor, anchorAt.at[2]] as [number, number]] : []),
  ];
  const gearKg = gearAt.reduce((a, [m]) => a + m, 0);
  const gearKgZ = gearAt.reduce((a, [m, z]) => a + m * z, 0);
  const pushKg = pushFender ? pf.knees * pf.kneeWidth * (pushFender.top - pushFender.bottom) * pf.kgPerM2 : 0;
  const items = [
    { name: `Hull: ${material} plating and framing`, kg: shellM2 * mat.shellKgPerM2 * (base.scantlings ?? 1) * grownPlate, y: shellM2y / shellM2, z: shellM2z / shellM2 },
    { name: 'Bulwarks', kg: bulwarkRun * bulwarkHeight * mat.shellKgPerM2 * wc.bulwarkShare, y: deckMid + bulwarkHeight / 2, z: (stem + transom) / 2 },
    { name: 'Wheelhouse', kg: houseM2 * mat.houseKgPerM2, y: (floorY + roofY) / 2, z: (front + aft) / 2 },
    { name: 'Deckhouse', kg: dhArea * mat.houseKgPerM2, y: deckhouse ? (deckMid + deckhouse.top) / 2 : deckMid, z: deckhouse ? (deckhouse.z0 + deckhouse.z1) / 2 : 0 },
    { name: outboards ? 'Outboards' : n > 1 ? 'Engines and gearboxes' : 'Engine and gearbox', kg: machineKg, y: machineY, z: machineZ },
    { name: outboards ? 'Bracket, rigging and tanks' : sd ? 'Stern drive legs, tanks, exhaust' : 'Shafting, propeller, rudder, tanks, exhaust', kg: sd ? sdc.legKg * n + machineKg * wc.machineryShare * 0.4 : machineKg * wc.machineryShare, y: outboards ? deckMid : machineY, z: outboards ? machineZ : sd ? transom : (machineZ + transom) / 2 },
    { name: 'Batteries', kg: batteriesKg, y: at.engineSpace[1], z: at.engineSpace[2] },
    { name: 'Deck crane', kg: craneAt ? cr.massKg : 0, y: craneAt ? craneAt[1] + cr.columnHeight / 2 : deckMid, z: craneAt ? craneAt[2] : 0 },
    { name: 'Deck gear', kg: gearKg, y: deckMid + 0.5, z: gearKg > 0 ? gearKgZ / gearKg : 0 },
    { name: 'Hull protection', kg: guardKg + pushKg, y: guardKg + pushKg > 0 ? (guardKg * guardY + (pushFender ? (pushKg * (pushFender.top + pushFender.bottom)) / 2 : 0)) / (guardKg + pushKg) : deckMid, z: guardKg + pushKg > 0 ? (guardKg * ((stem + transom) / 2) + (pushFender ? pushKg * pushFender.z : 0)) / (guardKg + pushKg) : 0 },
    { name: 'Fit-out: wiring, interior, windows, fittings, paint', kg: wc.outfitKgPerM2 * lengthM * beamDeck * 0.8, y: deckMid + 0.3, z: shellM2z / shellM2 },
    { name: 'Fuel (half her tanks)', kg: tankL * wc.fuelShare * wc.fuelDensity, y: keelMid + 0.35 * (deckMid - keelMid), z: h.lcb },
    { name: 'Crew and stores', kg: wc.crewKg + wc.storesKg, y: deckMid + 0.8, z: (front + aft) / 2 },
    { name: 'Ballast', kg: base.ballastKg ?? 0, y: keelMid + 0.15, z: h.lcb },
  ]
    .filter((it) => it.kg > 0)
    .map((it) => ({ name: it.name, kg: Math.round(it.kg), y: Math.round(it.y * 1000) / 1000, z: Math.round(it.z * 1000) / 1000 }));
  const weighedKg = items.reduce((a, it) => a + it.kg, 0);
  const weights = {
    material,
    items,
    massKg: weighedKg,
    cgY: Math.round((items.reduce((a, it) => a + it.kg * it.y, 0) / weighedKg) * 1000) / 1000,
    // Where her weights put her centre of gravity along her, against her centre of buoyancy
    // (m, + aft): what her tanks and ballast trim out (she's built to float level).
    balanceM: Math.round((items.reduce((a, it) => a + it.kg * it.z, 0) / weighedKg - h.lcb) * 100) / 100,
  };
  // Her build: her structure (hull, bulwarks, houses) at the material's price a kilo, built
  // (aluminium dearer to buy and to weld; steel heavier, cheaper), and her fit-out.
  const buildPrice = items.filter((it) => /^(Hull|Bulwarks|Wheelhouse|Deckhouse)/.test(it.name)).reduce((a, it) => a + it.kg, 0) * mat.pricePerKg + (items.find((it) => it.name.startsWith('Fit-out'))?.kg ?? 0) * wc.outfitPricePerKg;

  const gp = dg.price;
  const gearPrice = (winchAt ? gp.towWinch : 0) + (sternRoller ? gp.sternRoller : 0) + (aFrame ? gp.aFrame : 0) + (ring ? gp.lifeRing : 0) + (sideDoor ? gp.sideDoor : 0) + (anchorAt ? gp.anchor : 0) + (skiffAt ? gp.skiff : 0);
  const guardPrice = (pushFender ? CONFIG.shipyard.pushFenderPrice : 0) + (basketAt ? pc.fendersPrice : 0) + strakeM * pc.strakePerM + (tyres.length ? 2 * tyres.length * pc.tyrePrice + pc.tyreFitting : 0);
  const price = Math.round((buildPrice + (nOb ? powerKw * obc.pricePerKw : kw * n * eng.pricePerKw) + (sd ? sdc.price * n : 0) + (nozzle ? CONFIG.nozzle.price * n : 0) + (d.controls ? 18000 : 6000) + (craneAt ? 25000 : 0) + (hasMonitor ? 15000 : 0) + gearPrice + guardPrice) / 1000) * 1000;
  return {
    hull,
    recipe,
    figures: { lengthM, beamM: beamDeck, massT: mass / 1000, draughtM: -Math.min(...st.map((s) => s.polygon[2][1])), gmM: gm, propellerM: nOb ? obc.propeller.diameter : sd ? sdPropD : propD, engineShortM: nOb ? 0 : shaft.shortM, gear, engine: nOb ? `${['', 'One', 'Two', 'Three', 'Four'][nOb]} ${obc.engine.powerKw} kW petrol V8 outboards` : `${twin ? `Twin ${eng.name}` : eng.name}${sd ? (twin ? ', on stern drives' : ', on a stern drive') : ''}${nozzle ? (twin ? ', in Kort nozzles' : ', in a Kort nozzle') : ''}`, price, floorM: Math.round((floorY - level) * 100) / 100, floorOnDeckhouseM: deckhouse ? Math.round((floorY - onTop) * 100) / 100 : undefined, material, freeboardM: Math.round(deckMid * 100) / 100 },
    warnings,
    placed,
    shaft,
    weights,
  };
}

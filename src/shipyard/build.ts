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
import { CONFIG } from '../config';
import landingCraftRecipe from '../boats/landingCraft.json';
import { DESIGNS } from '../hulls/designs';
import { curveAt, type HullDesign } from '../hulls/loft';
import { hullFormOf, hullQueries, type HullDefinition } from '../modular/hull';
import { inertiaFromGyradius, lightshipOf } from '../modular/massProperties';
import type { Mount, Recipe } from '../modular/recipe';
import type { Socket } from '../modular/socket';
import type { HullForm } from '../vessel/hullForm';
import type { DoorStep, HouseShape, LayoutConfig, Livery } from '../vessel/vesselDef';
import type { DeckhouseLayout } from '../vessel/deckhouse';
import { houseFlare } from '../vessel/houseFlare';
import { BREAKERS } from '../vessel/vesselState';
import { strakeLine, tyreSpots } from '../vessel/physics/guards';
import { guardParts, PLACE_GRID, placeOf, SCALES, SINGLE_ONLY_ENGINES, type PlaceKey, type ShipDesign } from './design';

/** A faceted front's middle pane: between the front windows' mullions (hullMesh.ts, at +-0.5 m). */
const FACET_CENTRE = 0.5;

type V3 = [number, number, number];
const study = (id: string): HullDesign => {
  const d = DESIGNS.find((x) => x.id === id);
  if (!d) throw new Error(`the hull study has no '${id}' design`);
  return d;
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
    // Her bow is her own (the hull study's landing bow: the keel rises from 0.48 m under the
    // water amidships to 0.12 m above it at the bow plate), as the game's landing craft's is.
    form: (L, B, D) => ({ kind: 'lofted', design: scaledStudy(study('landingCraft'), L, B, D, null) }),
    planing: true,
    ramp: true,
    landingBow: true,
    cockpit: 1.0,
    foredeck: 1.6,
    defaults: { length: 8, beam: 8, depth: 8, bulwark: 2, bow: 2, housePos: 4, houseLength: 2, houseWidth: 7, headroom: 3, floor: 2, visor: 1, roofThickness: 0, roofEdge: 1, windowRake: 4, lowerFront: 0, engine: 1, twin: 0 },
  },
  {
    name: 'Gillnetter: 9.75 m, beamy and shallow, flat open foredeck',
    form: (L, B, D, bow) => ({ kind: 'lofted', design: scaledStudy(study('gillnetter'), L, B, D, bow) }),
    planing: true,
    ramp: false,
    cockpit: 1.0,
    foredeck: 1.5,
    // A bowpicker: the house right aft, the open foredeck for the net reel.
    defaults: { length: 8, beam: 8, depth: 8, bulwark: 3, bow: 2, housePos: 0, houseLength: 6, houseWidth: 7, headroom: 3, floor: 3, visor: 1, roofThickness: 0, roofEdge: 1, windowRake: 4, lowerFront: 0, engine: 1, twin: 0 },
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
    defaults: { length: 8, beam: 8, depth: 8, bulwark: 2, bow: 1, housePos: 9, houseLength: 5, houseWidth: 7, headroom: 3, floor: 3, visor: 2, roofThickness: 1, roofEdge: 1, windowRake: 6, lowerFront: 0, engine: 2, twin: 0 },
  },
  // New hull types go on the end: a design's code holds its hull's place in this list.
  {
    name: 'Pilot boat: 14 m deep-V, spray chine, fine entry, well-raked stem',
    form: (L, B, D, bow) => ({ kind: 'lofted', design: scaledStudy(study('pilot'), L, B, D, bow, true) }),
    planing: true,
    ramp: false,
    cockpit: 1.6,
    foredeck: 2.6,
    // A pilot / crew boat: a long house amidships with walkaround side decks (the Targa and
    // Safehaven types), low bulwarks, a well-raked stem, twin engines.
    defaults: { length: 8, beam: 8, depth: 8, bulwark: 0, bow: 4, housePos: 9, houseLength: 12, houseWidth: 6, headroom: 3, floor: 3, visor: 2, roofThickness: 1, roofEdge: 2, windowRake: 6, lowerFront: 0, engine: 2, twin: 1, paint: 1 },
  },
  {
    name: 'Small tug: 13 m, beamy and deep, a square push bow with a rubber push fender',
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
    defaults: { length: 8, beam: 8, depth: 8, bulwark: 4, bow: 0, housePos: 11, houseLength: 4, houseWidth: 4, headroom: 3, floor: 5, visor: 1, roofThickness: 1, roofEdge: 2, windowRake: 5, lowerFront: 0, engine: 3, twin: 0, paint: 7, guard: 2 },
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
 *   about      what the Engine step says about it, if more than its weight.
 */
export const ENGINES = [
  { name: '150 kW diesel (straight six)', kw: 150, kg: 600, voice: 'inlineSix' as const, rackRise: 1.2, ratedRpm: 1800, propMaxM: 1.05, pricePerKw: 120 },
  { name: '280 kW turbo diesel (V8)', kw: 280, kg: 800, voice: 'v8' as const, rackRise: 2.0, ratedRpm: 1800, propMaxM: 1.05, pricePerKw: 120 },
  { name: '400 kW turbo diesel (V8)', kw: 400, kg: 1100, voice: 'v8' as const, rackRise: 2.0, ratedRpm: 1800, propMaxM: 1.05, pricePerKw: 120 },
  { name: '450 kW slow-revving tug diesel (big straight six, 1000 rpm; single only)', kw: 450, kg: 2200, voice: 'inlineSix' as const, rackRise: 1.0, ratedRpm: 1000, propMaxM: 1.4, pricePerKw: 170, about: 'Slow-revving and heavy, for towing: more torque, turning a bigger propeller, so a harder pull for its power. Slower to answer the throttle.' },
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

/** Her livery with the roof's colour chosen (the workboat orange livery is `{}`: the workboat's own orange topsides). */
function liveryOf(d: ShipDesign): Livery {
  const l = LIVERIES[d.paint].livery;
  return { ...l, roof: ROOF_PAINTS[d.roofPaint].colour ?? l.topsides ?? 0xd9622b };
}

/** The designed boat: her hull and recipe, her main figures, and anything to warn about. */
export interface DesignedBoat {
  hull: HullDefinition;
  recipe: Recipe;
  /** floorM: the cabin floor about the deck under the house (as built: a fine hull can bring a low one up). */
  figures: { lengthM: number; beamM: number; massT: number; draughtM: number; gmM: number; propellerM: number; gear: number; engine: string; price: number; floorM: number; floorOnDeckhouseM?: number };
  warnings: string[];
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

/** Her bottom's height at half-breadth x in a station (keel to chine, chine to deck edge). */
function bottomAt(poly: readonly (readonly [number, number])[], x: number): number {
  const [[xd, yd], [xc, yc], [, yk]] = [poly[4], poly[3], poly[2]];
  if (x <= xc) return yk + ((yc - yk) * x) / Math.max(xc, 1e-6);
  return x >= xd ? yd : yc + ((yd - yc) * (x - xc)) / Math.max(xd - xc, 1e-6);
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

export function buildDesign(d: ShipDesign, code = 'design'): DesignedBoat {
  const warnings: string[] = [];
  const base = DESIGN_HULLS[d.hull];
  const L = SCALES.scale(d.length);
  const B = SCALES.scale(d.beam);
  const D = SCALES.scale(d.depth);
  const form = base.form(L, B, D, d.bow);
  const shape = hullFormOf(form);
  const st = shape.stations;
  const transom = st[0].z;
  const stem = st[st.length - 1].z;
  const bulwarkHeight = Math.round(SCALES.bulwark(d.bulwark) * 100) / 100;

  // ── The wheelhouse, within the deck free for it ──
  const q = hullQueries({ hull: shape, layout: { bulwarkHeight, railHeight: 0, deckEdgeMargin: 0.25, bodyRadius: 0.22 } as LayoutConfig });
  const zAft = transom - base.cockpit;
  const zFwd = stem + base.foredeck + (base.ramp ? 0.6 : 0);
  let houseL = SCALES.houseLength(d.houseLength);
  if (houseL > zAft - zFwd) {
    houseL = zAft - zFwd;
    warnings.push(`The wheelhouse is longer than her deck allows: cut to ${houseL.toFixed(1)} m.`);
  }
  const aft = zAft - SCALES.housePos(d.housePos) * (zAft - zFwd - houseL);
  const front = aft - houseL;
  const along = (n: number) => Array.from({ length: n + 1 }, (_, i) => front + ((aft - front) * i) / n);
  const narrowest = Math.min(...along(8).map((z) => q.halfBeam(z)));
  const sideDeck = 0.28;
  let hw = SCALES.houseWidth(d.houseWidth) * (narrowest - sideDeck);
  if (hw < 0.85) {
    warnings.push('Her wheelhouse is too narrow for the console: widened to 1.7 m, leaving narrow side decks.');
    hw = Math.min(0.85, narrowest - 0.12);
  }
  const deckHi = Math.max(...along(8).map((z) => q.deckY(z)));
  const deckLo = Math.min(...along(8).map((z) => q.deckY(z)));
  const headroom = SCALES.headroom(d.headroom);
  // The floor (owner: the house's height, to see over a bow or a ramp): raised from the
  // highest deck under the house, or sunk from the lowest (a step down in, for headroom).
  // A floor below the deck needs her hull at least as wide as the house down there (its
  // walls go down to it); in a fine entry it isn't, and the floor comes up until it is.
  // (Set after the deckhouse, below: with one, the floor is measured from its top.)
  const lift = SCALES.floor(d.floor);
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
    let z0 = front - SCALES.dhLength(d.dhLength);
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
    const side = SCALES.dhWidth(d.dhWidth);
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
    const top = rnd(Math.max(...zs.map((z) => q.deckY(z))) + SCALES.dhHeight(d.dhHeight));
    deckhouse = { z0: rnd(z0), z1: rnd(z1), top, rakeDeg: SCALES.dhRake(d.dhRake), plan };
    // Its plate: the two sides, the top, the front and the aft face (m²), for its weight and price.
    const h = SCALES.dhHeight(d.dhHeight);
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
  // The house's shape (owner): the roof one flat slab reaching forward over the windows (the
  // visor), its front edge cut back underneath; the front windows raked either way.
  const roofThickness = SCALES.roofThickness(d.roofThickness);
  // Its front and sides chamfered (hullMesh.ts chamferedSlab): the top set in this much.
  const roofBack = roofThickness * Math.tan((SCALES.roofEdge(d.roofEdge) * Math.PI) / 180);
  // The window sills, one height all round (owner; they were 1.31 at the front, the dash top,
  // and 1.0 at the sides): the standard height, or low, below the console.
  const sill = d.sills ? CONFIG.shipyard.windowSills.low : CONFIG.shipyard.windowSills.standard;
  // The windows run up to the roof's underside, only their frame between (owner: the roof is
  // one piece, overhanging them, no band of wall above the glass).
  const windowHead = headroom - CONFIG.pixelPaint.frameWidth;
  const doorHeight = Math.min(1.95, headroom - 0.1);
  // The front below the windows stays upright (its choice isn't offered now, owner).
  const house: HouseShape = { lowerRakeDeg: 0, lowerFromY: Math.min(q.deckY(front), floorY), roofEdgeDeg: SCALES.roofEdge(d.roofEdge), visor: SCALES.visor(d.visor) };
  // A three-facet front (owner: a tug's pilot house): the middle pane square across her
  // between the mullions, the outer two angled back `facetDeg` to the side walls; the
  // console wraps round with it, its wings set back as much (sb).
  if (facet) house.facet = facet;
  // Windows raked out all round (owner; houseFlare.ts): the sides and aft lean out above the sill.
  if (d.flare) house.flare = { tan: Math.round(Math.tan((CONFIG.shipyard.flareDeg * Math.PI) / 180) * 1e4) / 1e4 };
  /** How far a faceted front is set back at x (0 across the middle; the console's wings, and what's placed beside them, follow it). */
  const sb = (x: number) => (house.facet ? (Math.max(0, Math.abs(x) - house.facet.centre) * house.facet.depth) / (hw - house.facet.centre) : 0);
  const windowRake = SCALES.windowRake(d.windowRake);
  // Where the front windows' foot and head stand (z), as hullMesh draws them.
  const ahead = Math.max(0, floorY + sill - house.lowerFromY) * Math.tan((house.lowerRakeDeg * Math.PI) / 180);
  const zHead = front - ahead - (windowHead - sill) * Math.tan((windowRake * Math.PI) / 180);
  // Steps at the aft door, no rise over 0.35 m (a player steps up 0.4): outside for a
  // raised floor, inside for a deep sunk one.
  const doorDeck = q.deckY(aft + 0.15);
  const rise = floorY - doorDeck;
  const nSteps = Math.max(0, Math.ceil(Math.abs(rise) / 0.35) - 1);
  const tread = 0.28;
  const steps: DoorStep[] = Array.from({ length: nSteps }, (_, i) => {
    const k = i + 1; // 1: the lowest step; nSteps: the highest, at the door
    const y = Math.min(floorY, doorDeck) + (Math.abs(rise) * k) / (nSteps + 1);
    const out = nSteps - k; // treads between it and the door
    return rise > 0 ? { y, z0: aft + out * tread, z1: aft + (out + 1) * tread } : { y, z0: aft - wall - (out + 1) * tread, z1: aft - wall - out * tread };
  });
  // The engine under a hatch in the cabin floor, aft to starboard (forward of any steps inside).
  const inside = rise < 0 ? nSteps * tread : 0;
  const eh = { x0: 0.15, x1: Math.min(0.85, hw - 0.2), z0: aft - 1.125 - inside, z1: aft - 0.325 - inside, pitDepth: 0.75 };
  const hatchZ = (eh.z0 + eh.z1) / 2;
  // The engine space goes no deeper than her bottom allows under the whole hatch: her vee
  // rises from the keel out to the chine, so its corners (out at the hatch's sides) are
  // what touch first, most of all in a fine entry (it showed through the bottom, owner).
  const bottomUnder = Math.max(
    ...st.filter((s) => s.z >= eh.z0 - 0.4 && s.z <= eh.z1 + 0.4).flatMap((s) => [eh.x0, eh.x1].map((x) => bottomAt(s.polygon, x))),
  );
  eh.pitDepth = Math.min(0.75, floorY - bottomUnder - 0.08);
  if (eh.pitDepth < 0.55) warnings.push(`There's only ${(eh.pitDepth * 100).toFixed(0)} cm under the cabin floor for the engine (it wants 55): raise the floor or deepen her.`);
  const F = floorY;
  /** The roof's top (flat: the same all along). */
  const roofTopAt = (_z: number) => roofY + roofThickness;
  // On the roof, forward: clear of its front edge (the visor's top, set back by its rake) whichever way the windows rake.
  const roofFront = Math.max(front, zHead - house.visor + roofThickness * Math.tan((house.roofEdgeDeg * Math.PI) / 180));

  // Her bow ramp (the landing craft's), across her square bow.
  const bowHalf = st[st.length - 1].halfBeamDeck;
  const lcRamp = CONFIG.vessels.landingCraft.layout.bowRamp;
  const bowRamp = base.ramp ? { ...lcRamp, width: Math.round(2 * (bowHalf - 0.08) * 100) / 100, ram: { ...lcRamp.ram, x: Math.round((bowHalf - 0.07) * 100) / 100 }, button: { z: stem + 0.8, y: 0.42 } } : undefined;

  const layout = {
    // No roof rail or ladder (owner: simpler): the roof isn't walked.
    wheelhouse: { halfWidth: hw, front, aft, floorY, roofY, wall, doorWidth: 0.7, doorHeight, windowSill: sill, windowHead, frontSill: sill, frontRakeDeg: windowRake, ...(d.flare ? { doorHinged: true } : {}), consoleDepth: 0.5, consoleHeight: 0.9, viewSill: d.sills ? 0.9 : Math.max(sill, 0.9 + CONFIG.modules.helmConsole.dash.top), shape: house, ...(steps.length ? { steps } : {}) },
    roof: { thickness: roofThickness, overhang: 0.15, railHeight: 0, edgeMargin: 0.25 },
    doorButtons: { x: 0.45, height: 1.1 },
    engineHatch: eh,
    ...(bowRamp ? { bowRamp } : {}),
    ...(deckhouse ? { deckhouse } : {}),
    bulwarkHeight,
    // Handrails 0.4 m over the bulwarks, or none (owner: an option; bulwarks only).
    railHeight: d.rails ? 0 : bulwarkHeight + 0.4,
    // The notch in the transom bulwark for a stern roller (set below if she has one).
    fairleadGap: d.sternRoller ? CONFIG.vessels.workboat.layout.fairleadGap : 0,
    deckEdgeMargin: 0.25,
    bodyRadius: 0.22,
  } as LayoutConfig;
  if (layout.wheelhouse && roofY - deckHi < 1.8) warnings.push('Her wheelhouse roof is low over the deck outside: the doorway will be a squeeze.');

  // ── Weight, CG, inertia, damping: she floats on her lines ──
  const h = atDWL(shape);
  const rho = CONFIG.ocean.density;
  const g = CONFIG.ocean.gravity;
  const mass = Math.round(rho * h.volume);
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
  const n = twin ? 2 : 1;
  const keelAft = st[0].polygon[2][1];
  const draughtAft = -keelAft;
  // The propeller: as big as her draught aft allows (tip clear below her keel by ~1/4 of
  // it), and no bigger than her engine can turn (0.675 m at 150 kW .. 1.05 m at 400 kW). A
  // slower engine turns a bigger one for its power (a propeller's best diameter grows as its
  // revs fall): the 1000 rpm tug engine up to 1.4 m, as her draught allows (ENGINES propMaxM).
  const twinX = Math.round(0.28 * 2 * Math.max(...st.map((s) => s.halfBeamDeck)) * 100) / 100;
  const propD = Math.round(Math.max(0.45, Math.min(1.25 * draughtAft, 0.45 + (0.0015 * kw) / rs, eng.propMaxM, twin ? 2 * twinX - 0.15 : 9)) * 100) / 100;
  const gear = Math.round(SCALES.gear(d.gear) * 100) / 100;
  const propPos: V3 = [0, keelAft + 0.1, transom - 0.65];
  const rudderPos: V3 = [0, keelAft + 0.15, transom - 0.25];
  const prop = base.planing ? { kt0: 0.6, j0: 1.35, kq0: 0.1, jq0: 1.45, wake: 0.06, thrustDeduction: 0.08 } : { kt0: 0.57, j0: 1.15, kq0: 0.077, jq0: 1.25, wake: 0.18, thrustDeduction: 0.18 };
  // One rudder (or twin rudders, as one of twice the area, each in its own propeller's wash).
  const rudderArea = Math.round(0.07 * h.lwl * Math.max(0.3, draughtAft) * n * 100) / 100;
  const tankL = Math.max(200, Math.round((kw * n * 1.1) / 50) * 50);
  const batteriesKg = 2 * CONFIG.modules.batteryBank.massKg;

  // ── Places (vessel axes), as the landing craft's are from her cabin ──
  const wl = CONFIG.shipyard.workLights;
  const at = {
    console: [0, F + 0.9, front + 0.56] as V3,
    // (Below the window sill: low windows bring it down.)
    breakerPanel: [hw - 0.185, F + Math.min(0.6, sill - 0.2), front + 0.875 + sb(hw - 0.185)] as V3,
    rampButton: [-(hw - 0.07), F + Math.min(0.73, sill - 0.08), front + 0.775 + sb(hw - 0.07)] as V3,
    batteryMaster: [hw - 0.45, F + 0.48, aft - 0.065] as V3,
    batterySelector: [hw - 0.2, F + 0.48, aft - 0.065] as V3,
    vhf: [-(hw - 0.3), roofY - 0.17, front + 0.525 + sb(hw - 0.3)] as V3,
    // The advanced package's instruments (owner): the chartplotter hung out to starboard
    // ahead of the helm, turned toward it (the VHF's mirror); the NAV / WIND screen hung on
    // the centreline ahead of the helm; the FM set further aft to starboard, over your head.
    chartplotter: [hw - 0.35, roofY - 0.17, front + 0.5 + sb(hw - 0.35)] as V3,
    navDisplay: [0, roofY - 0.15, front + 0.42] as V3,
    fm: [hw - 0.35, roofY - 0.11, front + 1.3 + sb(hw - 0.35)] as V3,
    // The task board, on solid wall below the window sill (her walls are glass above it), on
    // the starboard wall, aft (its face's middle; 2 cm off the wall's inside face, clear of
    // its frames: no flicker between them).
    // The whiteboard: a pull-down board hung from the roof just forward of the aft wall
    // (owner: not low on the wall), port of the door, as wide as fits there.
    whiteboard: [(-(hw - wall) + 0.1) / 2, roofY, aft - wall - 0.1] as V3,
    dutyBoard: [hw - wall - 0.02, F + sill - CONFIG.modules.dutyBoard.height / 2 - 0.04, aft - wall - 0.5] as V3,
    engineBed: [(eh.x0 + eh.x1) / 2, F - 0.35, hatchZ] as V3,
    engineSpace: [-0.2, F - 0.47, hatchZ] as V3,
    cabinLight: [0, roofY - 0.12, (front + aft) / 2 + 0.15] as V3,
    searchlight: [0, roofTopAt(roofFront + 0.275) + 0.13, roofFront + 0.275] as V3,
    navLights: [0, roofTopAt(roofFront + 1.275), roofFront + 1.275] as V3,
    // The advanced interior's working lights (owner): the overhead switch panel over the helm
    // (its face), and the deck floods on the roof's front and aft edges, off to port (the
    // fore one set back with a faceted front's corner), each aimed at the middle of its deck.
    overhead: [0, roofY - CONFIG.modules.overheadPanel.drop, front + wl.overheadAft] as V3,
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
  const standsOnRoof = (x: number, z: number) => Math.abs(x) <= Math.min(hw - 0.2, hw + 0.15 - roofBack - 0.15) && z >= roofFront + 0.2 + sb(Math.abs(x) + 0.2) && z <= aft - 0.2 && roofTaken.every(([ox, oz, r]) => Math.hypot(x - ox, z - oz) >= r);
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
  // the column just forward of the house, on the aft deck as far aft as it fits; the cradle
  // on the centreline if there's room, else as far over as the column's side allows.
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
    // The cradle's middle on the centreline, or shifted toward the column's side (to 1 m).
    search: for (const z of zs)
      for (const mid of [0, 0.25, 0.5, 0.75, 1]) {
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


  // The chart table (owner: its own choice): along the port wall at the aft end, its hinge
  // corner forward, if her house is wide enough to pass inboard of it and long enough to
  // leave the helm clear.
  const ctab = CONFIG.modules.chartTable;
  let chartTableAt: V3 | null = null;
  if (d.chartTable) {
    const z0 = aft - wall - 0.3 - ctab.depth;
    if (hw - wall - ctab.width >= 0.35 && z0 >= front + 1.0 + sb(hw)) chartTableAt = [-(hw - wall), F, Math.round(z0 * 1000) / 1000];
    else warnings.push(`Her wheelhouse is too ${hw - wall - ctab.width < 0.35 ? 'narrow' : 'short'} for the chart table along its port wall: left off.`);
  }
  // The side door (owner): a sliding door in the port wall, aft of the console with room to
  // stand at the helm, forward of the chart table, onto a side deck wide enough to step out on.
  // The house itself is drawn with the opening (vessel/view/hullMesh.ts), and the door slides
  // and is walked through as the starting workboat's does.
  let sideDoor: { z0: number; z1: number; height: number; buttonHeight: number } | null = null;
  if (d.sideDoor) {
    const sdc = dg.sideDoor;
    const z0 = Math.max(front + sb(hw) + wall + 0.5 + sdc.fromConsole, bowRamp ? at.rampButton[2] + 0.15 : -Infinity);
    const zEnd = chartTableAt ? chartTableAt[2] - 0.05 : aft - wall - 0.15;
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
        stow: [r2(ringSide * Math.max(0.75, hw - dg.ringFromCorner)), r2(Math.min((deckhouse ? q.deckY(aft) : F) + 1.15, F + sill - 0.3)), r2(aft + 0.06)] as V3,
        cleat: cleat(ringSide, sternCleat),
        hook: [r2(ringSide * (q.halfBeam(sternCleat - 1.2) - 0.08)), r2(q.deckY(sternCleat - 1.2) + bulwarkHeight - 0.05), r2(Math.max(aft + 0.2, sternCleat - 2.6)), r2(sternCleat - 0.3)] as [number, number, number, number],
      }
    : null;
  const sockets: Socket[] = [
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
    ...(chartTableAt ? [{ id: 'chartTable', type: 'cabin.furniture' as const, transform: { position: chartTableAt }, capacity: { size: [ctab.width, roofY - F, ctab.depth] as V3 }, label: 'Port wall, aft: the chart table' }] : []),
    { id: 'doorIn', type: 'wall.panel', transform: { position: [0.45, F + 1.1, aft - wall], rotationDeg: [-90, 0, 0] }, label: 'Door frame, inside' },
    { id: 'doorOut', type: 'wall.panel', transform: { position: [0.45, F + 1.1, aft], rotationDeg: [-90, 180, 0] }, label: 'Door frame, outside' },
    ...(rampBow
      ? ([
          { id: 'rampCabin', type: 'wall.panel', transform: { position: at.rampButton, rotationDeg: [-90, -90, 0] }, label: 'Port wall, by the helm' },
          { id: 'rampBow', type: 'wall.panel', transform: { position: rampBow, rotationDeg: [-90, -90, 0] }, label: 'Port bulwark, by the bow ramp' },
        ] as Socket[])
      : []),
    { id: 'engineHatch', type: 'deck.fitting', transform: { position: [eh.x1, F, hatchZ] }, capacity: { size: [eh.x1 - eh.x0, 0.035, eh.z1 - eh.z0] }, label: 'Cabin floor, over the engine' },
    { id: 'dipstick', type: 'deck.fitting', transform: { position: [eh.x0 + 0.15, F - 0.32, eh.z0 + 0.2] }, label: "Engine space, the engine's inboard side" },
    { id: 'oilCan', type: 'deck.fitting', transform: { position: [eh.x1 - 0.08, F - 0.3, eh.z1 - 0.15], rotationDeg: [0, 90, 0] }, label: 'Engine space, the shelf' },
    { id: 'engine', type: 'engine.bay', transform: { position: at.engineBed }, tags: ['inboard'], capacity: { maxPowerKw: 1000 }, label: 'Engine bed, under the cabin floor' },
    { id: 'fuelTank', type: 'engine.bay', transform: { position: at.engineSpace }, label: 'Engine space (nominal)' },
    { id: 'batteries', type: 'engine.bay', transform: { position: at.engineSpace }, label: 'Engine space (nominal)' },
    { id: 'bilgePump', type: 'engine.bay', transform: { position: [at.engineSpace[0], F - eh.pitDepth, at.engineSpace[2]] }, label: 'Bottom of the engine space (nominal)' },
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
  // Lashing points along the longer stretch of open deck (fore or aft of the house).
  const fore = front - (stem + 0.8);
  const aftDeck = transom - 0.5 - aft;
  const [za, zb] = fore >= aftDeck ? [stem + 0.8, front - 0.3] : [aft + 0.3, transom - 0.5];
  const lashPoints: [number, number][] = [];
  if (Math.abs(zb - za) > 1.2)
    for (const side of [-1, 1]) for (const f of [0.15, 0.5, 0.85]) {
      const z = za + (zb - za) * f;
      lashPoints.push([Math.round(side * (q.halfBeam(z) - 0.25) * 100) / 100, Math.round(z * 100) / 100]);
    }
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
  const hull: HullDefinition = {
    id: 'hull.design',
    version: 1,
    name: `Shipyard design ${code}`,
    helm: { stand: [0, F, front + 1.125], yawDeg: 0 },
    form,
    lightship: lightshipOf(weighed, [
      { massKg: eng.kg * n, at: at.engineBed },
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
      side: Math.round(lengthM * freeboard + houseL * (roofY + 0.3 - level) + (deckhouse ? (deckhouse.z1 - deckhouse.z0) * SCALES.dhHeight(d.dhHeight) : 0)),
      front: Math.round(beamDeck * freeboard + 2 * hw * (roofY + 0.3 - level) + (deckhouse ? 2 * Math.max(0, dhW - hw) * SCALES.dhHeight(d.dhHeight) : 0)),
      center: [0, Math.round((freeboard + 0.4) * 100) / 100, Math.round(((front + aft) / 4) * 100) / 100],
    },
    layout,
    cargo: { maxPayloadKg: Math.round((0.3 * mass) / 100) * 100, slots: 0, bowClear: 0.4, aftClear: 0.25, fixed: false, lashPoints, lashRange: 1.1 },
    spawn: { x: 0, z: -22, dropHeight: 3, headingDeg: 90 },
    fittings: {
      exhaust: { position: [0.55, 0.2, transom + 0.05], direction: [0, -0.12, 1] },
      stowage: {
        extinguisher: [-(hw - 0.2), F + 0.58, aft - 0.15],
        torch: [-(hw - 0.45), F + 0.68, aft - 0.12],
        binoculars: { at: [-(hw - 0.35), F + 1.35, front + 0.14 + sb(hw - 0.35)], yawDeg: 20 },
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
    idleRpm: Math.round(engine.engine.idleRpm * rs),
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
    engine: { ...engine.maintenance.engine, x: at.engineBed[0], z: hatchZ },
    dipstick: [eh.x0 + 0.15, eh.z0 + 0.2],
    filler: [at.engineBed[0], eh.z1 - 0.15],
    oilCan: [eh.x1 - 0.08, eh.z1 - 0.15],
  });
  const rudder = bySocket(recipe.modules, 'rudder')!.config as Record<string, any>;
  Object.assign(rudder.rudder, { area: rudderArea, position: rudderPos });
  rudder.propeller = { wake: prop.wake, diameter: propD };
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
  cc.pedestals.x = cc.pedestals.x.map((x: number) => Math.round(x * sx * 1000) / 1000);
  cc.groups = cc.groups.map((gp: { x: [number, number] }) => ({ ...gp, x: gp.x.map((x) => Math.round(x * sx * 1000) / 1000) }));
  for (const slot of Object.values(cc.slots) as { position: V3 }[]) slot.position = [Math.round(slot.position[0] * sx * 1000) / 1000, slot.position[1], slot.position[2]];
  // A faceted front: the dash wraps round with it (console.standard's `wrap`), its wings set back as the outer windows are.
  // Its controls stay square to her (owner: forward is forward); its screens turn with the wings, flush with the dash's face.
  if (house.facet)
    cc.wrap = {
      centre: house.facet.centre,
      k: Math.round((house.facet.depth / (hw - house.facet.centre)) * 1e4) / 1e4,
      turn: consoleMount.modules!.filter((m) => m.module === 'instrument.screen').map((m) => m.socket),
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

  const gp = dg.price;
  const gearPrice = (winchAt ? gp.towWinch : 0) + (sternRoller ? gp.sternRoller : 0) + (aFrame ? gp.aFrame : 0) + (ring ? gp.lifeRing : 0) + (sideDoor ? gp.sideDoor : 0) + (anchorAt ? gp.anchor : 0) + (skiffAt ? gp.skiff : 0) + dhArea * dhc.pricePerM2;
  const guardPrice = (pushFender ? CONFIG.shipyard.pushFenderPrice : 0) + (basketAt ? pc.fendersPrice : 0) + strakeM * pc.strakePerM + (tyres.length ? 2 * tyres.length * pc.tyrePrice + pc.tyreFitting : 0);
  const price = Math.round((mass * 6 + kw * n * eng.pricePerKw + (d.controls ? 18000 : 6000) + (craneAt ? 25000 : 0) + (hasMonitor ? 15000 : 0) + gearPrice + guardPrice) / 1000) * 1000;
  return {
    hull,
    recipe,
    figures: { lengthM, beamM: beamDeck, massT: mass / 1000, draughtM: -Math.min(...st.map((s) => s.polygon[2][1])), gmM: gm, propellerM: propD, gear, engine: twin ? `Twin ${eng.name}` : eng.name, price, floorM: Math.round((floorY - level) * 100) / 100, floorOnDeckhouseM: deckhouse ? Math.round((floorY - onTop) * 100) / 100 : undefined },
    warnings,
    placed,
  };
}

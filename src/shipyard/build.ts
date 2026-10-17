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
 *     chosen engine and propeller, and the basic or advanced controls.
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
import { BREAKERS } from '../vessel/vesselState';
import { SCALES, type ShipDesign } from './design';

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
function scaledStudy(d: HullDesign, L: number, B: number, D: number, bow: number, chinesRunOn = false): HullDesign {
  const by = (c: [number, number][], k: number) => c.map(([t, v]) => [t, v * k] as [number, number]);
  const sheer = by(d.sheer, D);
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
    form: (L, B, D, bow) => ({ kind: 'lofted', design: scaledStudy(study('landingCraft'), L, B, D, bow) }),
    planing: true,
    ramp: true,
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
];

/** Engine packages: power, weight, sound, and how quickly its governor adds fuel. */
export const ENGINES = [
  { name: '150 kW diesel (straight six)', kw: 150, kg: 600, voice: 'inlineSix' as const, rackRise: 1.2 },
  { name: '280 kW turbo diesel (V8)', kw: 280, kg: 800, voice: 'v8' as const, rackRise: 2.0 },
  { name: '400 kW turbo diesel (V8)', kw: 400, kg: 1100, voice: 'v8' as const, rackRise: 2.0 },
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
  figures: { lengthM: number; beamM: number; massT: number; draughtM: number; gmM: number; propellerM: number; gear: number; engine: string; price: number; floorM: number };
  warnings: string[];
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
  const lift = SCALES.floor(d.floor);
  const level = deckHi + 0.03;
  let floorY = lift >= 0 ? level + lift : Math.min(level, deckLo + 0.01 + lift);
  const tightAt = (y: number) => Math.min(...along(8).map((z) => halfBreadthAt(st.reduce((a, s) => (Math.abs(s.z - z) < Math.abs(a.z - z) ? s : a)).polygon, y)));
  if (floorY < level && tightAt(floorY - 0.15) < hw + 0.02) {
    while (floorY < level && tightAt(floorY - 0.15) < hw + 0.02) floorY = Math.min(level, floorY + 0.2);
    warnings.push(`Her hull is too fine under the wheelhouse for its floor that low: raised to ${(floorY - level).toFixed(1)} m about the deck.`);
  }
  const roofY = floorY + headroom;
  const wall = 0.06;
  // The house's shape (owner): the roof one flat slab reaching forward over the windows (the
  // visor), its front edge cut back underneath; the front windows raked either way.
  const roofThickness = SCALES.roofThickness(d.roofThickness);
  const sill = 1.31; // the front glass's, level with the dash top; the sides' and aft's 1.0
  // The windows run up to the roof's underside, only their frame between (owner: the roof is
  // one piece, overhanging them, no band of wall above the glass).
  const windowHead = headroom - CONFIG.pixelPaint.frameWidth;
  const doorHeight = Math.min(1.95, headroom - 0.1);
  // The front below the windows stays upright (its choice isn't offered now, owner).
  const house: HouseShape = { lowerRakeDeg: 0, lowerFromY: Math.min(q.deckY(front), floorY), roofEdgeDeg: SCALES.roofEdge(d.roofEdge), visor: SCALES.visor(d.visor) };
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
    wheelhouse: { halfWidth: hw, front, aft, floorY, roofY, wall, doorWidth: 0.7, doorHeight, windowSill: 1.0, windowHead, frontSill: sill, frontRakeDeg: windowRake, consoleDepth: 0.5, consoleHeight: 0.9, shape: house, ...(steps.length ? { steps } : {}) },
    roof: { thickness: roofThickness, overhang: 0.15, railHeight: 0, edgeMargin: 0.25 },
    doorButtons: { x: 0.45, height: 1.1 },
    engineHatch: eh,
    ...(bowRamp ? { bowRamp } : {}),
    bulwarkHeight,
    railHeight: bulwarkHeight + 0.4,
    fairleadGap: 0,
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
  // Twin engines: two of the package, their propellers set out ~28 % of her deck beam either
  // side of the centreline (under her bottom, clear of each other), twin rudders behind them.
  const twin = !!d.twin;
  const n = twin ? 2 : 1;
  const keelAft = st[0].polygon[2][1];
  const draughtAft = -keelAft;
  // The propeller: as big as her draught aft allows (tip clear below her keel by ~1/4 of
  // it), and no bigger than her engine can turn (0.675 m at 150 kW .. 1.05 m at 400 kW).
  const twinX = Math.round(0.28 * 2 * Math.max(...st.map((s) => s.halfBeamDeck)) * 100) / 100;
  const propD = Math.round(Math.max(0.45, Math.min(1.25 * draughtAft, 0.45 + 0.0015 * kw, 1.05, twin ? 2 * twinX - 0.15 : 9)) * 100) / 100;
  const gear = Math.round(SCALES.gear(d.gear) * 100) / 100;
  const propPos: V3 = [0, keelAft + 0.1, transom - 0.65];
  const rudderPos: V3 = [0, keelAft + 0.15, transom - 0.25];
  const prop = base.planing ? { kt0: 0.6, j0: 1.35, kq0: 0.1, jq0: 1.45, wake: 0.06, thrustDeduction: 0.08 } : { kt0: 0.57, j0: 1.15, kq0: 0.077, jq0: 1.25, wake: 0.18, thrustDeduction: 0.18 };
  // One rudder (or twin rudders, as one of twice the area, each in its own propeller's wash).
  const rudderArea = Math.round(0.07 * h.lwl * Math.max(0.3, draughtAft) * n * 100) / 100;
  const tankL = Math.max(200, Math.round((kw * n * 1.1) / 50) * 50);
  const batteriesKg = 2 * CONFIG.modules.batteryBank.massKg;

  // ── Places (vessel axes), as the landing craft's are from her cabin ──
  const at = {
    console: [0, F + 0.9, front + 0.56] as V3,
    breakerPanel: [hw - 0.185, F + 0.6, front + 0.875] as V3,
    rampButton: [-(hw - 0.07), F + 0.73, front + 0.775] as V3,
    batteryMaster: [hw - 0.45, F + 0.48, aft - 0.065] as V3,
    batterySelector: [hw - 0.2, F + 0.48, aft - 0.065] as V3,
    vhf: [-(hw - 0.3), roofY - 0.17, front + 0.525] as V3,
    // The advanced package's instruments (owner): the chartplotter hung out to starboard
    // ahead of the helm, turned toward it (the VHF's mirror); the NAV / WIND screen hung on
    // the centreline ahead of the helm; the FM set further aft to starboard, over your head.
    chartplotter: [hw - 0.35, roofY - 0.17, front + 0.5] as V3,
    navDisplay: [0, roofY - 0.15, front + 0.42] as V3,
    fm: [hw - 0.35, roofY - 0.11, front + 1.3] as V3,
    // The task board, on solid wall below the window sill (her walls are glass above it), on
    // the starboard wall, aft (its face's middle; 2 cm off the wall's inside face, clear of
    // its frames: no flicker between them).
    // The whiteboard: a pull-down board hung from the roof just forward of the aft wall
    // (owner: not low on the wall), port of the door, as wide as fits there.
    whiteboard: [(-(hw - wall) + 0.1) / 2, roofY, aft - wall - 0.1] as V3,
    dutyBoard: [hw - wall - 0.02, F + 1.0 - CONFIG.modules.dutyBoard.height / 2 - 0.04, aft - wall - 0.5] as V3,
    engineBed: [(eh.x0 + eh.x1) / 2, F - 0.35, hatchZ] as V3,
    engineSpace: [-0.2, F - 0.47, hatchZ] as V3,
    cabinLight: [0, roofY - 0.12, (front + aft) / 2 + 0.15] as V3,
    searchlight: [0, roofTopAt(roofFront + 0.275) + 0.13, roofFront + 0.275] as V3,
    navLights: [0, roofTopAt(roofFront + 1.275), roofFront + 1.275] as V3,
  };
  const bowCleat = stem + 0.5;
  const sternCleat = transom - 0.4;
  const cleat = (side: number, z: number): V3 => [side * (q.halfBeam(z) - 0.03), q.deckY(z) + bulwarkHeight, z];
  const rampBow: V3 | null = bowRamp ? [-(q.halfBeam(bowRamp.button.z) - 0.06), q.deckY(bowRamp.button.z) + bowRamp.button.y, bowRamp.button.z] : null;

  // ── Hull definition ──
  const weighed = { massKg: mass, cg, inertia: inertiaFromGyradius(mass, gyradius) };
  const freeboard = deckMid;
  // The deck crane (owner: placeable, for cargo; and at the deck edge, to keep the working
  // deck clear): on the foredeck at the starboard edge, clear of the house's front; or on the
  // aft deck at the port edge, clear of the door and its steps. Its control post stands
  // inboard of it. Its socket is put where the column stands (`edgeInset` in from the deck
  // edge), so the crane module keeps it there (its 'auto' side: a socket already off to one
  // side stays), and the builder's clash checks and designed-in weight are where it really is.
  const cr = CONFIG.modules.deckCrane;
  let craneAt: V3 | null = null;
  if (d.deckCrane === 1) {
    const z = front - 0.9;
    if (z - cr.plinthRadius - 0.3 > stem + (bowRamp ? 1.8 : 1.0)) craneAt = [q.halfBeam(z) - cr.edgeInset, q.deckY(z), z];
    else warnings.push('There\'s no room on her foredeck for the deck crane: left off.');
  } else if (d.deckCrane === 2) {
    const z = aft + 0.9;
    if (z + 0.4 < transom - 0.3) craneAt = [-(q.halfBeam(z) - cr.edgeInset), q.deckY(z), z];
    else warnings.push('There\'s no room on her aft deck for the deck crane: left off.');
  }
  // The searchlight and the fire monitor (owner): on the wheelhouse roof, or each on a pole
  // on the foredeck or the aft deck (CONFIG.modules.deckPole), the searchlight to starboard
  // and the monitor to port, a little off the house, with room aft of the pole to stand at
  // its control box. A pole goes where it's clear of the crane and the other pole: its own
  // side first, then the other, then a step further from the house; else it's left off.
  const dp = CONFIG.modules.deckPole;
  type Rect = { x0: number; x1: number; z0: number; z1: number };
  const taken: Rect[] = [];
  if (craneAt) {
    // The crane's plinth, and its control post (inboard of it; aft of it, or forward for a
    // crane on the aft deck, which faces aft) with room to stand at it.
    const r = cr.plinthRadius + 0.1;
    taken.push({ x0: craneAt[0] - r, x1: craneAt[0] + r, z0: craneAt[2] - r, z1: craneAt[2] + r });
    const s = d.deckCrane === 2 ? -1 : 1;
    const [px, pz] = [craneAt[0] - Math.sign(craneAt[0]) * Math.abs(cr.post.x), craneAt[2] + s * cr.post.z];
    taken.push({ x0: px - 0.3, x1: px + 0.3, z0: pz - 0.5, z1: pz + 0.5 });
  }
  const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  /** A pole's foot on deck 1 (fore) or 2 (aft), starting on `side`; null (and a warning) if there's no room. */
  const poleFoot = (deck: number, side: number, what: string): V3 | null => {
    for (const step of [0, 1])
      for (const sd of [side, -side]) {
        const z = deck === 1 ? front - dp.fromHouse - 0.85 * step : aft + dp.fromHouse + 0.85 * step;
        const room = deck === 1 ? z - 0.2 > stem + (bowRamp ? 1.8 : 1.0) : z + dp.box.depth + 0.5 < transom - 0.2;
        const x = sd * (q.halfBeam(z) - dp.inset);
        if (!room || Math.abs(x) < 0.5) continue;
        // The pole, its box aft of it, and room to stand aft of the box.
        const rect = { x0: x - dp.box.width / 2 - 0.05, x1: x + dp.box.width / 2 + 0.05, z0: z - 0.12, z1: z + dp.box.depth + 0.45 };
        if (taken.some((o) => overlaps(o, rect))) continue;
        taken.push(rect);
        return [r2(x), q.deckY(z), r2(z)];
      }
    warnings.push(`There's no room on her ${deck === 1 ? 'foredeck' : 'aft deck'} for the ${what}'s pole: left off.`);
    return null;
  };
  const lampFoot = d.searchlight >= 2 ? poleFoot(d.searchlight - 1, 1, 'searchlight') : null;
  const monitorFoot = d.fireMonitor >= 2 ? poleFoot(d.fireMonitor - 1, -1, 'fire monitor') : null;
  const hasLamp = d.searchlight === 1 || !!lampFoot;
  const hasMonitor = d.fireMonitor === 1 || !!monitorFoot;
  // On the roof: the monitor centred aft of the masthead light's pole, clear of its barrel's swing.
  const monitorRoof: V3 = [0, roofTopAt(0) + 0.38, r2(Math.min(roofFront + 1.25, aft - 0.3))];

  // The chart table (owner: its own choice): along the port wall at the aft end, its hinge
  // corner forward, if her house is wide enough to pass inboard of it and long enough to
  // leave the helm clear.
  const ctab = CONFIG.modules.chartTable;
  let chartTableAt: V3 | null = null;
  if (d.chartTable) {
    const z0 = aft - wall - 0.3 - ctab.depth;
    if (hw - wall - ctab.width >= 0.35 && z0 >= front + 1.0) chartTableAt = [-(hw - wall), F, Math.round(z0 * 1000) / 1000];
    else warnings.push(`Her wheelhouse is too ${hw - wall - ctab.width < 0.35 ? 'narrow' : 'short'} for the chart table along its port wall: left off.`);
  }
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
    { id: 'engine', type: 'engine.bay', transform: { position: at.engineBed }, tags: ['inboard'], capacity: { maxPowerKw: 800 }, label: 'Engine bed, under the cabin floor' },
    { id: 'fuelTank', type: 'engine.bay', transform: { position: at.engineSpace }, label: 'Engine space (nominal)' },
    { id: 'batteries', type: 'engine.bay', transform: { position: at.engineSpace }, label: 'Engine space (nominal)' },
    { id: 'bilgePump', type: 'engine.bay', transform: { position: [at.engineSpace[0], F - eh.pitDepth, at.engineSpace[2]] }, label: 'Bottom of the engine space (nominal)' },
    { id: 'rudder', type: 'hull.rudder', transform: { position: rudderPos }, label: 'Rudder stock, under the transom' },
    { id: 'cabinLight', type: 'cabin.overhead', transform: { position: at.cabinLight }, label: 'Cabin ceiling' },
    lampFoot
      ? { id: 'searchlight', type: 'deck.equipment', transform: { position: lampFoot }, label: `${d.searchlight === 2 ? 'Foredeck' : 'Aft deck'}, starboard: the searchlight's pole` }
      : { id: 'searchlight', type: 'roof.mount', transform: { position: at.searchlight }, label: 'Cabin roof, forward' },
    ...(hasMonitor
      ? [
          monitorFoot
            ? { id: 'fireMonitor', type: 'deck.equipment' as const, transform: { position: monitorFoot }, label: `${d.fireMonitor === 2 ? 'Foredeck' : 'Aft deck'}, port: the fire monitor's pole` }
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
    ...(craneAt
      ? [
          // The aft one faces aft (its boom rests over the aft deck, not the house).
          { id: 'deckCrane', type: 'deck.equipment' as const, transform: { position: craneAt, ...(d.deckCrane === 2 ? { rotationDeg: [0, 180, 0] as V3 } : {}) }, capacity: { loadRatingKg: 1000 }, label: d.deckCrane === 1 ? 'Foredeck, starboard edge: the deck crane' : 'Aft deck, port edge: the deck crane' },
          // Its hydraulic pump on the engine's power take-off.
          { id: 'hydraulicPump', type: 'engine.bay' as const, transform: { position: at.engineSpace }, label: 'On the engine\'s power take-off (nominal)' },
        ]
      : []),
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
    resistance: { ...lc.resistance, lwl: Math.round(h.lwl * 100) / 100 },
    ...(base.planing ? { planing: lc.planing } : {}),
    windage: {
      side: Math.round(lengthM * freeboard + houseL * (roofY + 0.3 - level)),
      front: Math.round(beamDeck * freeboard + 2 * hw * (roofY + 0.3 - level)),
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
        binoculars: { at: [-(hw - 0.35), F + 1.35, front + 0.14], yawDeg: 20 },
      },
      livery: liveryOf(d),
    },
    sockets,
    provides: [{ power: 'electrical', circuits: BREAKERS }],
    features: [
      { id: 'door.aft', kind: 'door', openKey: 'door.aft.open' },
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
  const bySocket = (list: Mount[], id: string) => list.find((m) => m.socket === id);
  const engine = bySocket(recipe.modules, 'engine')!.config as Record<string, any>;
  Object.assign(engine.engine, {
    powerKw: kw,
    torqueCurve: BASE_TORQUE.map(([r, t]) => [r, Math.round(t * k)]),
    frictionTorque: Math.round(40 * k ** 0.6),
    inertia: Math.round(1.6 * k * 10) / 10,
    starterTorque: Math.round(280 * Math.sqrt(k)),
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
    if (m.module === 'deck.cleat') (m.config as Record<string, any>).stations = { bow: bowCleat, stern: sternCleat, midship: 0 };
  }
  // The searchlight on the roof or its pole (or none), and the fire monitor.
  if (lampFoot) bySocket(recipe.modules, 'searchlight')!.config = { position: [lampFoot[0], r2(lampFoot[1] + dp.lampHeight), lampFoot[2]], pole: { deckY: lampFoot[1] } };
  else if (hasLamp) bySocket(recipe.modules, 'searchlight')!.config = { position: at.searchlight };
  else recipe.modules = recipe.modules.filter((m) => m.socket !== 'searchlight');
  if (monitorFoot) recipe.modules.push({ socket: 'fireMonitor', module: 'deck.fire-monitor', config: { position: [monitorFoot[0], r2(monitorFoot[1] + dp.nozzleHeight), monitorFoot[2]], pole: { deckY: monitorFoot[1] } } });
  else if (hasMonitor) recipe.modules.push({ socket: 'fireMonitor', module: 'deck.fire-monitor', config: { position: monitorRoof } }); // its gauge: on the console, below
  bySocket(recipe.modules, 'navLights')!.config = {
    lights: {
      masthead: [0, roofTopAt(roofFront + 0.475) + 1.1, roofFront + 0.475],
      // The sidelights on the house sides, above the windows, just aft of the header.
      // The sidelights on the roof's edges (the windows run up to it), just aft of the front glass.
      port: [-(hw + 0.15 + 0.03), roofY + roofThickness / 2, Math.max(front, zHead) + 0.175],
      starboard: [hw + 0.15 + 0.03, roofY + roofThickness / 2, Math.max(front, zHead) + 0.175],
      stern: [0, q.deckY(transom) + 0.6, transom - 0.05],
    },
  };
  // The console, laid out across her cabin: the landing craft's dash, widened or narrowed.
  const consoleMount = bySocket(recipe.modules, 'helm')!;
  const cc = consoleMount.config as Record<string, any>;
  // The helm's searchlight and monitor controls: always for a unit on the roof (the only
  // place to work it from); for one on a pole (which has its own) with the advanced controls.
  const lampAtHelm = d.searchlight === 1 || (!!lampFoot && !!d.controls);
  const monitorAtHelm = d.fireMonitor === 1 || (!!monitorFoot && !!d.controls);
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
  const dashHalf = hw - wall - 0.11;
  const sx = dashHalf / cc.dash.halfWidth;
  cc.dash.halfWidth = Math.round(dashHalf * 1000) / 1000;
  cc.pedestals.x = cc.pedestals.x.map((x: number) => Math.round(x * sx * 1000) / 1000);
  cc.groups = cc.groups.map((gp: { x: [number, number] }) => ({ ...gp, x: gp.x.map((x) => Math.round(x * sx * 1000) / 1000) }));
  for (const slot of Object.values(cc.slots) as { position: V3 }[]) slot.position = [Math.round(slot.position[0] * sx * 1000) / 1000, slot.position[1], slot.position[2]];
  // The advanced instruments (taken off again below for the basic controls), and the chart table.
  recipe.modules.push(
    { socket: 'chartplotter', module: 'nav.chartplotter' },
    { socket: 'navDisplay', module: 'instrument.screen', config: { screen: 'nav', mount: 'hung' } },
    // (As wide as fits port of the door, up to its own width.)
    { socket: 'whiteboard', module: 'furniture.whiteboard', config: { roller: { ...CONFIG.modules.whiteboard.roller, width: Math.round(Math.min(CONFIG.modules.whiteboard.roller.width, hw - wall - 0.1 - 0.2) * 100) / 100 } } },
    { socket: 'dutyBoard', module: 'furniture.duty-board' },
  );
  if (chartTableAt) recipe.modules.push({ socket: 'chartTable', module: 'furniture.chart-table' });
  if (!d.controls) {
    // Basic: wheel, throttle, starting (key, START, the lamps and the card), speed with
    // depth, rpm. No lights, searchlight, horn, wipers, heading, engine monitor, VHF or FM radio.
    // The searchlight's and monitor's controls stay if they're worked from here.
    const keep = ['wheel', 'throttle', 'start', 'key', 'lamps', 'card', 'speed', 'rpm', 'spotlight', 'spotJoystick', 'firePump', 'monJoystick'];
    consoleMount.modules = consoleMount.modules!.filter((m) => keep.includes(m.socket));
    cc.groups = cc.groups.filter((gp: { title: string }) => ['ENGINE', 'SEARCH', 'FIRE', 'SEARCH · FIRE'].includes(gp.title));
    // (The FM set and the advanced instruments come with the advanced controls, owner.)
    recipe.modules = recipe.modules.filter((m) => !['cabinLight', 'horn', 'wipers', 'vhf', 'fm', 'navLights', 'chartplotter', 'navDisplay', 'whiteboard', 'dutyBoard'].includes(m.socket));
  }
  if (hasMonitor && !monitorFoot) {
    // The roof monitor's FIRE gauge on the console, between the two joysticks.
    const [mx, , mz] = cc.slots.monJoystick.position as V3;
    const mon = bySocket(recipe.modules, 'fireMonitor')!;
    mon.config = { ...mon.config, gauge: { ...CONFIG.vessels.workboat.fireMonitor.gauge, position: [r2(at.console[0] + mx), r2(at.console[1] + 0.012), r2(at.console[2] + mz - 0.125)] } };
  }
  if (!bowRamp) recipe.modules = recipe.modules.filter((m) => m.socket !== 'rampCabin' && m.socket !== 'rampBow');
  if (craneAt) {
    // Its control post goes inboard of it by itself (the module's seat), whichever way it faces.
    recipe.modules.push({ socket: 'deckCrane', module: 'deck.crane' }, { socket: 'hydraulicPump', module: 'hydraulics.pto-pump' });
  }

  const price = Math.round((mass * 6 + kw * n * 120 + (d.controls ? 18000 : 6000) + (craneAt ? 25000 : 0) + (hasMonitor ? 15000 : 0)) / 1000) * 1000;
  return {
    hull,
    recipe,
    figures: { lengthM, beamM: beamDeck, massT: mass / 1000, draughtM: -Math.min(...st.map((s) => s.polygon[2][1])), gmM: gm, propellerM: propD, gear, engine: twin ? `Twin ${eng.name}` : eng.name, price, floorM: Math.round((floorY - level) * 100) / 100 },
    warnings,
  };
}

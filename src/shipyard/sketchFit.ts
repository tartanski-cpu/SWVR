/**
 * From a sketch to a boat (owner, Oct 2026: "maybe you start with sketching, then it
 * suggests a kind of boat"). You draw her profile freehand on a squared sheet, 1 m squares,
 * with the waterline marked: her hull with the hull pen and her wheelhouse with the house
 * pen. This reads the drawing the way a naval architect reads a first sketch, with a few
 * plain measurements, and picks the nearest of the Shipyard's hull types and the slider
 * settings that come closest to it:
 *
 *   length overall   the hull's extent fore and aft
 *   freeboard        the sheer's height above the waterline, amidships
 *   draught          how far below the waterline the hull goes
 *   stem rake        the line from the top of the stem down to where the bow meets the
 *                    keel line, from the vertical (plumb 0°, well raked 40-50°)
 *   flat bow         a landing craft's bow: the forefoot cut up in a long, straight slope
 *                    from far aft (her ramp)
 *   the house        its length, where along her it sits, its height over the sheer, and
 *                    the lean of its front (raked aft, upright, or reverse-raked)
 *
 * Each hull type has a profile of its own at its standard size (its length, depth, draught
 * and usual stem); the sketch goes to the one it differs least from, scored on the shape
 * (proportions and stem), not the size, since the sliders take care of size. Pure: no page
 * code, so it's tested on drawn shapes.
 */
import { SCALES, type ShipDesign } from './design';

export type Pt = [number, number];

/** A hull type's profile at its standard size (the page measures them from the build). */
export interface HullProfile {
  name: string;
  lengthM: number;
  /** Keel to sheer amidships (m). */
  depthM: number;
  draughtM: number;
  /** Its usual stem rake (deg from vertical). */
  stemDeg: number;
  /** A landing-craft bow (a long flat ramp up from the bottom). */
  rampBow: boolean;
  defaults: Partial<ShipDesign>;
}

export interface SketchReading {
  lengthM: number;
  freeboardM: number;
  draughtM: number;
  stemDeg: number;
  rampBow: boolean;
  house: { lengthM: number; centreFrac: number; heightM: number; frontDeg: number } | null;
}

export interface Suggestion {
  hull: number;
  /** The design fields to set (the hull type's layout, then the sizes read off the sketch). */
  patch: Partial<ShipDesign>;
  reading: SketchReading;
  /** What was read and picked, in plain words, for the page. */
  says: string[];
  /** How close each type came (0 best), for "or perhaps…". */
  scores: number[];
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const step = (x: number, f: (i: number) => number, n: number) => {
  let best = 0;
  for (let i = 1; i < n; i++) if (Math.abs(f(i) - x) < Math.abs(f(best) - x)) best = i;
  return best;
};

/** Read the measurements off the strokes (metres; x forward, y up, waterline at y = 0). */
export function readSketch(hull: Pt[][], house: Pt[][]): SketchReading | null {
  const pts = hull.flat();
  if (pts.length < 6) return null;
  const xs = pts.map((p) => p[0]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const L = x1 - x0;
  if (L < 2) return null;
  const at = (fa: number, fb: number) => pts.filter((p) => p[0] >= x0 + fa * L && p[0] <= x0 + fb * L);
  // Amidships (the middle fifth): the sheer is the highest line there, the keel the lowest.
  const mid = at(0.4, 0.6);
  const sheer = mid.length ? Math.max(...mid.map((p) => p[1])) : Math.max(...pts.map((p) => p[1]));
  const keel = Math.min(...pts.map((p) => p[1]));
  // The stem: from the forward-most high point down to where the bow reaches the bottom
  // (the first point, coming aft from the bow, within a fifth of the depth of the keel).
  const depth = Math.max(0.3, sheer - keel);
  const fwd = (list: Pt[]) => list.reduce((a, p) => (p[0] > a[0] ? p : a), list[0]);
  const top = fwd(pts.filter((p) => p[1] >= sheer - 0.25 * depth));
  const low = pts.filter((p) => p[1] <= keel + 0.2 * depth).reduce((a, p) => (p[0] > a[0] ? p : a), [x0, keel] as Pt);
  const run = top[0] - low[0];
  const rise = Math.max(0.05, top[1] - low[1]);
  const stemDeg = clamp((Math.atan2(run, rise) * 180) / Math.PI, 0, 80);
  // A ramp bow: the bottom starts rising a long way aft (over a fifth of her length) in a
  // straight run, and the stem's rake is steep (well over 45°).
  const rampBow = run > 0.2 * L && stemDeg > 55;
  let houseOut: SketchReading['house'] = null;
  const hp = house.flat();
  if (hp.length >= 4) {
    const hx = hp.map((p) => p[0]);
    const h0 = Math.min(...hx);
    const h1 = Math.max(...hx);
    const top2 = Math.max(...hp.map((p) => p[1]));
    // Its front: the points in the forward fifth of the house, top against bottom.
    const front = hp.filter((p) => p[0] >= h1 - 0.25 * (h1 - h0));
    const fTop = front.reduce((a, p) => (p[1] > a[1] ? p : a), front[0]);
    const fLow = front.reduce((a, p) => (p[1] < a[1] ? p : a), front[0]);
    const lean = fTop[1] - fLow[1] > 0.2 ? (Math.atan2(fTop[0] - fLow[0], fTop[1] - fLow[1]) * 180) / Math.PI : 0;
    houseOut = { lengthM: h1 - h0, centreFrac: ((h0 + h1) / 2 - x0) / L, heightM: top2 - sheer, frontDeg: clamp(lean, -35, 35) };
  }
  return { lengthM: L, freeboardM: sheer, draughtM: Math.max(0, -keel), stemDeg, rampBow, house: houseOut };
}

/** The nearest hull type to a reading, and the design fields that come closest to it. */
export function fitSketch(reading: SketchReading, types: HullProfile[]): Suggestion {
  const r = reading;
  const depthR = (r.freeboardM + r.draughtM) / r.lengthM;
  const scores = types.map((t) => {
    // Shape, not size: proportions, the stem, and the draught's share of the depth.
    const dProp = Math.abs(Math.log(depthR / (t.depthM / t.lengthM)));
    const dStem = Math.abs(Math.min(r.stemDeg, 50) - t.stemDeg) / 25;
    const dDraught = Math.abs(r.draughtM / Math.max(0.1, r.freeboardM + r.draughtM) - t.draughtM / t.depthM) * 2;
    const dRamp = r.rampBow === t.rampBow ? 0 : 1.5;
    const dSize = Math.abs(Math.log(r.lengthM / t.lengthM)) * 0.6; // a little: a 14 m sketch leans to the 14 m type
    return dProp + dStem + dDraught + dRamp + dSize;
  });
  const hull = scores.indexOf(Math.min(...scores));
  const t = types[hull];
  const patch: Partial<ShipDesign> = { ...t.defaults, hull };
  // Sizes: the sliders scale the type by x0.80 .. x1.175 (SCALES.scale).
  patch.length = step(clamp(r.lengthM / t.lengthM, 0.8, 1.175), SCALES.scale, 16);
  patch.depth = step(clamp((r.freeboardM + r.draughtM) / t.depthM / SCALES.scale(patch.length), 0.8, 1.175), SCALES.scale, 16);
  if (!t.rampBow) patch.bow = step(Math.min(50, r.stemDeg), SCALES.bow, 5);
  const says = [
    `Read off the sketch: ${r.lengthM.toFixed(1)} m long, ${r.freeboardM.toFixed(1)} m freeboard, ${r.draughtM.toFixed(1)} m draught, the stem ${r.rampBow ? 'cut up in a long ramp' : r.stemDeg < 6 ? 'plumb' : `raked about ${Math.round(r.stemDeg)}°`}.`,
    `Nearest type: ${t.name}, at ${Math.round(SCALES.scale(patch.length) * 100)} % of her standard length.`,
  ];
  if (r.house) {
    const h = r.house;
    patch.houseLength = step(h.lengthM, SCALES.houseLength, 16);
    // The house's place: the sketch's centre along her, mapped onto the slider's free deck (aft 0 .. forward 1).
    patch.housePos = step(clamp((h.centreFrac - 0.25) / 0.5, 0, 1), SCALES.housePos, 16);
    patch.headroom = step(clamp(h.heightM - 0.2, 1.9, 2.6), SCALES.headroom, 8);
    patch.windowRake = step(h.frontDeg, SCALES.windowRake, 9);
    says.push(
      `Her wheelhouse: ${h.lengthM.toFixed(1)} m long, ${h.centreFrac < 0.4 ? 'aft' : h.centreFrac > 0.6 ? 'forward' : 'amidships'}, ${h.heightM.toFixed(1)} m over the deck, its front ${Math.abs(h.frontDeg) < 5 ? 'upright' : h.frontDeg < 0 ? 'raked aft' : 'reverse-raked'}.`,
    );
  } else says.push('No wheelhouse drawn: she keeps her type’s usual one (draw it with the house pen).');
  return { hull, patch, reading: r, says, scores };
}

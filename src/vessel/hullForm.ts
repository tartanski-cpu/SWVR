import { centreBowDrop, loft, type HullDesign } from '../hulls/loft';

/**
 * Procedural hard-chine hull form, described the way a lines plan is: a set of transverse
 * stations, each a closed section polygon. The same stations are used for
 *   - hydrostatics (each station's polygon is clipped against the local water surface), and
 *   - the visible hull mesh (stations are lofted with flat panels),
 * so what you see floating is exactly what the physics floats.
 *
 * Vessel-local axes: +X starboard, +Y up, -Z forward (bow), origin on the centreline,
 * amidships, at the design waterline (DWL). Section polygons are in the (x, y) plane.
 */
export interface HullParams {
  /** Length overall (m): transom at z = +L/2, stem at z = -L/2. */
  length: number;
  /** Maximum beam at deck edge (m). */
  beamDeck: number;
  /** Maximum beam at the chine (m). */
  beamChine: number;
  /** Keel depth below DWL aft (m, negative). */
  keelY: number;
  /** Chine height relative to DWL at the transom and at the bow (m). */
  chineYAft: number;
  chineYBow: number;
  /** Deck-edge (sheer) height at the transom and at the stem (m). */
  deckYAft: number;
  deckYBow: number;
  /** Number of stations, evenly spaced from transom to stem. */
  stations: number;
  /**
   * Fewer stations for the physics (buoyancy, heave and pitch damping, hydrostatics), the
   * drawn hull keeping all of them: each physics station samples the sea three times a
   * tick. Owner: the towed boats needn't float as finely as the boats you drive. Unset:
   * the physics uses every station.
   */
  physicsStations?: number;
  /**
   * How far forward the deck edge runs parallel, as a fraction of the length from the
   * transom (default 0.45); forward of it the deck fines to the stem. Carrying it further
   * forward keeps the side decks wide past a wheelhouse.
   */
  deckParallel?: number;
  /**
   * The forefoot: the keel sweeps up into the stem from `from` (fraction of the length from
   * the transom; default 0.55), `rise` of the way from its depth to 0.3 m under the stem's
   * deck edge (default 1: the workboat's). Or, with `stemDeg` (the Shipyard's bow choice), a
   * straight stem raked that many degrees from vertical, from 0.15 m under the stem head
   * down until it meets the keel, which runs at full depth to it (0: a plumb stem). The chine
   * closes in to the keel as the keel rises within 0.6 m of it (a vee entry, not a flat
   * bottom at the stem).
   */
  forefoot?: { from: number; rise: number; stemDeg?: number };
}

/**
 * One transverse station. Polygon vertex order: port deck, port chine, keel, stbd chine, stbd
 * deck. A catamaran's (`demihull`) has ten: both demihulls and the bridge deck between them,
 * the tunnel under her wet deck a notch in it, still from her port deck edge round under her
 * to her starboard one (see `Station.demihull`).
 */
export interface Station {
  z: number;
  /** Integration weight (m): station spacing, halved at the ends (trapezoidal rule). */
  weight: number;
  polygon: [number, number][];
  halfBeamChine: number;
  halfBeamDeck: number;
  /**
   * A spray chine (a second, upper chine on her topsides, between the chine and the deck
   * edge): its starboard half-breadth and height. Drawn only (owner: decorative): her
   * buoyancy, stability and seakeeping use the five-point section, from the main chine.
   */
  spray?: [number, number];
  /**
   * Her paint line's height here, where it's under her chine (a Shipyard bow whose chine is
   * dragged up the stem: hulls/loft.ts paintKeel): her bottom paint stops here, her topsides'
   * colour above it. Drawn only.
   */
  paintY?: number;
  /**
   * A round bilge drawn as two chines (hulls/loft.ts SectionShape.bilge; the harbour tug):
   * its lower and upper points, starboard [half-breadth, height] each. Drawn only: her
   * polygon's chine is one point on her side line below the bilge's upper point, placed so
   * her section keeps the bilge's area (bilgeChine): she floats on her true waterline breadth
   * and her lines' volume, five points a station as every hull.
   */
  bilge?: [[number, number], [number, number]];
  /**
   * A catamaran's station (a hull-study design with `catamaran`; owner, Oct 2026: the fast
   * work cat). Her polygon is the whole section across both demihulls, ten points: port outer
   * deck edge, port outer chine, port keel, port inner chine, the wet deck's port corner (where
   * the port hull's inner side meets it), its starboard corner, starboard inner chine,
   * starboard keel, starboard outer chine, starboard outer deck edge (thirteen with a centre
   * bow: its sides' tops and its keel between the wet deck's corners, the port half's points
   * staying 0 to 4).
   * So the buoyancy and the
   * hydrostatics (which clip any polygon at the water) float both hulls, and a wet deck driven
   * under adds its buoyancy as the real one's does. `halfBeamChine` and `halfBeamDeck` are her
   * outer ones (what her deck and her extremes need). Here: one demihull's own half-breadths
   * at its chine and deck, and how far its centreline is off hers (half the spacing), for
   * what goes by each hull's own width (the waterline strip's heave damping, the two keels).
   */
  demihull?: { offset: number; halfBeamChine: number; halfBeamDeck: number };
}

export interface HullForm {
  params: HullParams;
  stations: Station[];
  /** A catamaran (her stations have `demihull`): her demihulls' spacing, centre to centre, and the wet deck's height over her DWL. */
  catamaran?: { spacing: number; tunnel: number; centreBow?: { drop: [number, number][]; halfWidth: number } };
  /** The stations the physics floats her on, when fewer than `stations` (HullParams.physicsStations). */
  physics?: Station[];
}

/** The stations a hull's physics (and hydrostatics) use: the coarser set if she has one. */
export const physicsStations = (hull: HullForm): Station[] => hull.physics ?? hull.stations;

const smooth = (t: number) => t * t * (3 - 2 * t);

export function buildHullForm(p: HullParams): HullForm {
  const stations: Station[] = [];
  const n = p.stations;
  const dz = p.length / (n - 1);
  for (let i = 0; i < n; i++) {
    // t = 0 at the transom, 1 at the stem.
    const t = i / (n - 1);
    const z = p.length / 2 - i * dz;

    // Plan view: parallel body aft, fining to the stem forward of `deckParallel` (~55 %).
    const tp = p.deckParallel ?? 0.45;
    const deckTaper = t < tp ? 1 - 0.04 * (1 - t / tp) : Math.pow(Math.cos(((t - tp) / (1 - tp)) * (Math.PI / 2)), 0.75);
    const chineTaper = t < 0.4 ? 1 : Math.pow(Math.cos(((t - 0.4) / 0.6) * (Math.PI / 2)), 0.7);
    const bD = Math.max(0.03, (p.beamDeck / 2) * deckTaper);
    let bC = Math.min(bD, Math.max(0.02, (p.beamChine / 2) * chineTaper));

    // Profile: sheer rises forward; keel sweeps up into the stem (forefoot) over the forward 45 %.
    const yD = p.deckYAft + (p.deckYBow - p.deckYAft) * t * t;
    const ff = p.forefoot ?? { from: 0.55, rise: 1 };
    const chineLine = p.chineYAft + (p.chineYBow - p.chineYAft) * t * t;
    let yK: number;
    if (ff.stemDeg !== undefined) {
      // A straight stem at `stemDeg` from vertical: its height above the keel line falls by
      // 1 / tan(rake) per metre aft of the stem. The keel runs deep until it meets it.
      const aftOfStem = (1 - t) * p.length;
      const stemY = ff.stemDeg > 0.1 ? p.deckYBow - 0.15 - aftOfStem / Math.tan((ff.stemDeg * Math.PI) / 180) : -Infinity;
      yK = Math.max(p.keelY, stemY);
      bC = Math.max(0.02, bC * Math.min(1, Math.max(0, (chineLine - yK) / 0.6)));
    } else {
      const forefoot = t > ff.from ? smooth((t - ff.from) / (1 - ff.from)) : 0;
      yK = p.keelY + (p.deckYBow - 0.3 - p.keelY) * forefoot * ff.rise;
    }
    const yC = Math.min(yD - 0.05, Math.max(yK + 0.01, chineLine));

    stations.push({
      z,
      weight: i === 0 || i === n - 1 ? dz / 2 : dz,
      polygon: [
        [-bD, yD],
        [-bC, yC],
        [0, yK],
        [bC, yC],
        [bD, yD],
      ],
      halfBeamChine: bC,
      halfBeamDeck: bD,
    });
  }
  const np = p.physicsStations;
  if (np && np >= 2 && np < n) return { params: p, stations, physics: buildHullForm({ ...p, stations: np, physicsStations: undefined }).stations };
  return { params: p, stations };
}

/** Each lofted section's station z: where its deck edge is, moved so the deck runs from +length/2 (transom) to -length/2 (bow). */
function stationZs(sections: { pts: { z: number }[] }[]): number[] {
  const raw = sections.map((s) => s.pts[s.pts.length - 1].z);
  const mid = (raw[0] + raw[raw.length - 1]) / 2;
  return raw.map((z) => z - mid);
}

/**
 * A catamaran from a hull-study design (owner, Oct 2026: the fast work cat): the study's
 * sections describe one demihull about its own centreline (loft.ts), and each station here is
 * both of them `spacing` apart with the bridge deck across, its wet deck `tunnel` over the
 * DWL: one ten-point section with the tunnel a notch in it (Station.demihull). Hard chine,
 * no spray chine. Where a demihull's inner side doesn't reach down to the wet deck (her keel
 * rising above it at the bow) the notch closes up to her keel's height, the two corners
 * meeting the keels: the bridge deck's underside comes down to it there.
 */
function catamaranForm(d: HullDesign, cat: NonNullable<HullDesign['catamaran']>): HullForm {
  const sections = loft(d).sections;
  const zs = stationZs(sections);
  const o = cat.spacing / 2;
  const stations: Station[] = sections.map((s, i) => {
    const keel = s.pts[0];
    const chine = s.pts[1];
    const deck = s.pts[s.pts.length - 1];
    const bC = Math.abs(chine.x);
    const bD = Math.max(0.03, Math.abs(deck.x));
    // The wet deck's corner on this demihull's inner side: up her bottom from the keel, then
    // her topsides from the chine, to the wet deck's height (a little under her deck at most).
    const top = Math.min(cat.tunnel, deck.y - 0.05);
    let inChine: [number, number] = [o - bC, chine.y];
    let corner: [number, number];
    if (top <= keel.y) {
      corner = [o, keel.y];
      inChine = corner;
    } else if (top <= chine.y) {
      corner = [o - (bC * (top - keel.y)) / Math.max(chine.y - keel.y, 1e-6), top];
      inChine = corner;
    } else corner = [o - (bC + ((bD - bC) * (top - chine.y)) / Math.max(deck.y - chine.y, 1e-6)), top];
    const dz = i === 0 ? zs[0] - zs[1] : i === sections.length - 1 ? zs[i - 1] - zs[i] : (zs[i - 1] - zs[i + 1]) / 2;
    return {
      z: zs[i],
      weight: i === 0 || i === sections.length - 1 ? dz / 2 : dz,
      polygon: [
        [-(o + bD), deck.y],
        [-(o + bC), chine.y],
        [-o, keel.y],
        [-inChine[0], inChine[1]],
        [-corner[0], corner[1]],
        // A centre bow (HullDesign catamaran.centreBow): where its sides meet the wet deck, and
        // its keel between them (all at the wet deck where it has none).
        ...(cat.centreBow
          ? ([
              [-Math.min(cat.centreBow.halfWidth, corner[0]), corner[1]],
              [0, corner[1] - centreBowDrop(cat, s.t)],
              [Math.min(cat.centreBow.halfWidth, corner[0]), corner[1]],
            ] as [number, number][])
          : []),
        [corner[0], corner[1]],
        [inChine[0], inChine[1]],
        [o, keel.y],
        [o + bC, chine.y],
        [o + bD, deck.y],
      ],
      halfBeamChine: o + bC,
      halfBeamDeck: o + bD,
      demihull: { offset: o, halfBeamChine: bC, halfBeamDeck: bD },
      ...(s.paintY !== undefined ? { paintY: s.paintY } : {}),
    };
  });
  const first = stations[0].polygon;
  const last = stations[stations.length - 1].polygon;
  const params: HullParams = {
    length: zs[0] - zs[zs.length - 1],
    beamDeck: 2 * Math.max(...stations.map((s) => s.halfBeamDeck)),
    beamChine: 2 * Math.max(...stations.map((s) => s.halfBeamChine)),
    keelY: Math.min(...stations.map((s) => s.polygon[2][1])),
    chineYAft: first[1][1],
    chineYBow: last[1][1],
    deckYAft: first[0][1],
    deckYBow: last[0][1],
    stations: stations.length,
  };
  return { params, stations, catamaran: { ...cat } };
}

/**
 * A round bilge's chine for her physics (port side, x <= 0): on her side line, from the
 * bilge's upper point down towards her deck edge's opposite way, as far as keeps her section's
 * area what the drawn bilge gives (keel, lower point, upper point, deck edge): her waterline
 * breadth her side's, her volume her lines'. No further than where her side line meets her
 * bottom line (keel to the lower point), the hard-chine corner the bilge rounds off.
 */
type Pt = { x: number; y: number };
function bilgeChine(keel: Pt, lo: Pt, hi: Pt, deck: Pt): Pt {
  // Area of a half-section from the centreline at the keel, through `pts`, back up the centreline.
  const area = (pts: Pt[]) => {
    const ring = [{ x: 0, y: keel.y }, ...pts, { x: 0, y: deck.y }];
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i];
      const q = ring[(i + 1) % ring.length];
      a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
  };
  const target = area([lo, hi, deck]);
  // Along her side line below the upper point: C(s) = hi + s (hi - deck).
  const at = (s: number) => ({ x: hi.x + s * (hi.x - deck.x), y: hi.y + s * (hi.y - deck.y) });
  // Where it meets her bottom line (the corner): the most it may go.
  const [bx, by] = [lo.x - keel.x, lo.y - keel.y];
  const [dx, dy] = [hi.x - deck.x, hi.y - deck.y];
  const den = dx * by - dy * bx;
  const sMax = Math.abs(den) > 1e-9 ? Math.max(0, ((keel.x - hi.x) * by - (keel.y - hi.y) * bx) / den) : 0;
  const a0 = area([at(0), deck]);
  const a1 = area([at(1), deck]);
  const s = Math.abs(a1 - a0) > 1e-12 ? Math.min(sMax, Math.max(0, (target - a0) / (a1 - a0))) : 0;
  return at(s);
}

/**
 * A hull form from a hull-study design (modular boats M7, src/hulls/): its lofted sections
 * as the game's stations, so the study's lines float and are drawn like any other hull.
 *
 * The game's stations are upright sections with one hard chine a side (five points: port
 * deck, port chine, keel, starboard chine, starboard deck), so the design must have no
 * rounding. A second chine is taken as a spray chine: the lower of the two is her hard chine,
 * the upper is drawn on her topsides (`Station.spray`) but left out of her hydrostatics. A raked section (the study leans each section fore and aft, `rake`) is set
 * upright at its deck edge: the deck, the bulwarks and the walk area stand where the design
 * puts them, and the rake goes into the run of the bottom up to the bow, where it's out of
 * the water (on the landing craft the forefoot is above the waterline). The whole form is
 * then moved fore or aft so her deck runs from +length/2 (transom) to -length/2 (bow), the
 * game's convention, which a raked bow lengthens. Hydrostatics are the
 * game's own, from these stations: the boat's mass is set to float her at her design waterline.
 */
export function hullFormFromDesign(d: HullDesign): HullForm {
  // (A forecastle is a doubled station at its break, the deck stepped up forward of it: loft.)
  if (d.section.round) throw new Error(`hull design '${d.id}': the game's stations take hard chines (no rounding)`);
  if (d.catamaran) return catamaranForm(d, d.catamaran);
  const sections = loft(d).sections;
  // Each section's z where its deck edge is (the last point: keel, chine, deck edge), moved
  // so the deck's ends are at +-length/2, as the game has it (origin amidships).
  const zs = stationZs(sections);
  const stations: Station[] = sections.map((s, i) => {
    // Keel, chine(s) bottom-up, deck edge: with two chines the upper one is the spray chine
    // (or, a round bilge, the bilge's two corners).
    const [keel, lower] = s.pts;
    const deck = s.pts[s.pts.length - 1];
    const roundBilge = d.section.bilge && s.pts.length === 4;
    const spray = s.pts.length === 4 && !roundBilge ? s.pts[2] : undefined;
    const chine = roundBilge ? bilgeChine(keel, lower, s.pts[2], deck) : lower;
    const bilge: [[number, number], [number, number]] | undefined = roundBilge ? [[Math.abs(lower.x), lower.y], [Math.abs(s.pts[2].x), s.pts[2].y]] : undefined;
    const bC = Math.abs(chine.x);
    const bD = Math.max(0.03, Math.abs(deck.x));
    const dz = i === 0 ? zs[0] - zs[1] : i === sections.length - 1 ? zs[i - 1] - zs[i] : (zs[i - 1] - zs[i + 1]) / 2;
    return {
      z: zs[i],
      weight: i === 0 || i === sections.length - 1 ? dz / 2 : dz,
      polygon: [
        [-bD, deck.y],
        [-bC, chine.y],
        [0, keel.y],
        [bC, chine.y],
        [bD, deck.y],
      ],
      halfBeamChine: bC,
      halfBeamDeck: bD,
      ...(spray ? { spray: [Math.abs(spray.x), spray.y] as [number, number] } : {}),
      ...(bilge ? { bilge } : {}),
      ...(s.paintY !== undefined ? { paintY: s.paintY } : {}),
    };
  });
  const first = stations[0].polygon;
  const last = stations[stations.length - 1].polygon;
  // The chine generator's parameters, as a summary of the form: length, beams, keel, the
  // chine and deck heights at the ends (what the rest of the game reads from `params`).
  const params: HullParams = {
    length: zs[0] - zs[zs.length - 1],
    beamDeck: 2 * Math.max(...stations.map((s) => s.halfBeamDeck)),
    beamChine: 2 * Math.max(...stations.map((s) => s.halfBeamChine)),
    keelY: Math.min(...stations.map((s) => s.polygon[2][1])),
    chineYAft: first[1][1],
    chineYBow: last[1][1],
    deckYAft: first[0][1],
    deckYBow: last[0][1],
    stations: stations.length,
  };
  return { params, stations };
}

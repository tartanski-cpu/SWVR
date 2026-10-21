import { loft, type HullDesign } from '../hulls/loft';

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

/** One transverse station. Polygon vertex order: port deck, port chine, keel, stbd chine, stbd deck. */
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
}

export interface HullForm {
  params: HullParams;
  stations: Station[];
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
  if (d.section.round || d.catamaran) throw new Error(`hull design '${d.id}': the game's stations take hard chines (no rounding or second hull)`);
  const sections = loft(d).sections;
  // Each section's z where its deck edge is (the last point: keel, chine, deck edge), moved
  // so the deck's ends are at +-length/2, as the game has it (origin amidships).
  const raw = sections.map((s) => s.pts[s.pts.length - 1].z);
  const mid = (raw[0] + raw[raw.length - 1]) / 2;
  const zs = raw.map((z) => z - mid);
  const stations: Station[] = sections.map((s, i) => {
    // Keel, chine(s) bottom-up, deck edge: with two chines the upper one is the spray chine.
    const [keel, chine] = s.pts;
    const deck = s.pts[s.pts.length - 1];
    const spray = s.pts.length === 4 ? s.pts[2] : undefined;
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

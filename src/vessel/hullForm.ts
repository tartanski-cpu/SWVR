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
   * How far forward the deck edge runs parallel, as a fraction of the length from the
   * transom (default 0.45); forward of it the deck fines to the stem. Carrying it further
   * forward keeps the side decks wide past a wheelhouse.
   */
  deckParallel?: number;
}

/** One transverse station. Polygon vertex order: port deck, port chine, keel, stbd chine, stbd deck. */
export interface Station {
  z: number;
  /** Integration weight (m): station spacing, halved at the ends (trapezoidal rule). */
  weight: number;
  polygon: [number, number][];
  halfBeamChine: number;
  halfBeamDeck: number;
}

export interface HullForm {
  params: HullParams;
  stations: Station[];
}

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
    const bC = Math.min(bD, Math.max(0.02, (p.beamChine / 2) * chineTaper));

    // Profile: sheer rises forward; keel sweeps up into the stem (forefoot) over the forward 45 %.
    const yD = p.deckYAft + (p.deckYBow - p.deckYAft) * t * t;
    const forefoot = t > 0.55 ? smooth((t - 0.55) / 0.45) : 0;
    const yK = p.keelY + (p.deckYBow - 0.3 - p.keelY) * forefoot;
    const yC = Math.min(yD - 0.05, Math.max(yK + 0.01, p.chineYAft + (p.chineYBow - p.chineYAft) * t * t));

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
  return { params: p, stations };
}

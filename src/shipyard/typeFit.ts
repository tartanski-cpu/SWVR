/**
 * Which hull type for a brief (owner, Oct 2026: the hull types are "a result of the jobs":
 * pick the jobs and targets first, then the Shipyard says which types can do it, as a second
 * step). Each type is checked against the brief with what it can do, measured: its engine
 * fits' sea trials and its deck room. Ranked by how many lines it can't meet, then by how
 * many of the brief's jobs it's built for, then by price.
 *
 * The trials are measured, not modelled: each type at its standard size, bare (no deck gear),
 * every engine fit that goes under her deck (a tall engine in a shallow hull is left out),
 * gearbox matched, the game's own sea trials (re-measured 23 Oct 2026 with the 750 kW diesel,
 * then the tug and trawler on a displacement hull's resistance and the catamaran redrawn;
 * docs/progress/shipyard.md). A type passes a line if ONE of its engine fits meets speed,
 * range, price and bollard pull together, so the ranking doesn't promise a boat that can't
 * be built. Deck room passes if she can be made big enough for it (starting from her sizes
 * her to it: deckRoom.ts `sizeForDeck`); her speed, range and price are at standard size,
 * so a stretched boat's own trial has the last word. Re-measure if the hulls or the engines
 * change.
 */
import { TOW_BOLLARD_T, type Brief, type JobId } from './brief';

interface FitTrial {
  engine: number;
  twin: number;
  topKn: number;
  rangeNm: number;
  bollardT: number;
  price: number;
}

export interface TypeFacts {
  /** What she's built for, in a line (shown on her card). */
  what: string;
  /** The game's jobs she's built for (breaks ties between types that can all do the brief). */
  goodFor: JobId[];
  /** Not offered (as build.ts DESIGN_HULLS `retired`: the workboat). */
  retired?: boolean;
  /** Deck room, bare, at standard size and at her largest (length and beam sliders full; deckRoom.ts). */
  crates: number;
  pots: number;
  maxCrates: number;
  maxPots: number;
  fits: FitTrial[];
}

const fit = (engine: number, twin: number, topKn: number, rangeNm: number, bollardT: number, price: number): FitTrial => ({ engine, twin, topKn, rangeNm, bollardT, price });

/** By hull type, in build.ts DESIGN_HULLS order. */
export const TYPE_FACTS: TypeFacts[] = [
  {
    what: 'A ramp bow for beaches with no quay, a flat open deck; light, fast and cheap on her planing bottom.',
    goodFor: ['cargo'],
    crates: 21,
    pots: 10,
    maxCrates: 35,
    maxPots: 23,
    fits: [fit(0, 0, 17.2, 96, 1.19, 114_000), fit(0, 1, 27.8, 136, 1.98, 132_000), fit(1, 0, 25.7, 124, 1.82, 129_000), fit(1, 1, 35.8, 178, 3.03, 163_000), fit(2, 0, 29.8, 163, 2.44, 144_000), fit(2, 1, 40.6, 215, 3.71, 192_000)],
  },
  {
    what: 'Beamy and stable, an open foredeck to work pots and nets over, the house right aft.',
    goodFor: ['potting'],
    crates: 34,
    pots: 18,
    maxCrates: 59,
    maxPots: 34,
    fits: [fit(0, 0, 8.3, 54, 1.56, 118_000), fit(0, 1, 12.1, 63, 3.01, 136_000), fit(1, 0, 11.4, 50, 2.45, 133_000), fit(1, 1, 24.1, 111, 4.24, 167_000), fit(2, 0, 15.2, 77, 3.17, 148_000), fit(2, 1, 29.4, 146, 5.29, 196_000)],
  },
  {
    what: 'Semi-displacement, deep and steady: the biggest working deck aft of the house, and the strongest pull.',
    retired: true,
    goodFor: ['cargo', 'towing', 'fire', 'trawl'],
    crates: 54,
    pots: 31,
    maxCrates: 83,
    maxPots: 49,
    fits: [fit(0, 0, 11.7, 64, 1.51, 174_000), fit(0, 1, 19.5, 103, 2.82, 192_000), fit(1, 0, 18.1, 91, 2.46, 189_000), fit(1, 1, 29.4, 139, 4.06, 223_000), fit(2, 0, 25.5, 118, 2.84, 204_000), fit(2, 1, 35.3, 168, 4.49, 252_000)],
  },
  {
    what: 'A deep-V for speed in a seaway, a long house with room for crew, walkaround side decks.',
    goodFor: ['rescue'],
    crates: 49,
    pots: 29,
    maxCrates: 80,
    maxPots: 49,
    fits: [fit(0, 0, 11.3, 68, 1.50, 192_000), fit(0, 1, 21.1, 102, 2.49, 210_000), fit(1, 0, 18.7, 87, 2.26, 207_000), fit(1, 1, 30.9, 136, 3.25, 241_000), fit(2, 0, 23.5, 119, 2.86, 222_000), fit(2, 1, 36.4, 167, 3.81, 270_000), fit(3, 0, 19.9, 125, 3.56, 250_000)],
  },
  {
    // The small tug (measured Oct 2026, as the others): heavy for her length, so slow, short
    // ranged on the tank her engines get, and dear; a big deck payload.
    what: 'A tug: short, deep and beamy, a rubber push fender on her square bow to push barges and ships; a strong pull for her size, but slow.',
    goodFor: ['towing'],
    crates: 79,
    pots: 53,
    maxCrates: 122,
    maxPots: 83,
    fits: [fit(0, 0, 6.7, 39, 1.56, 213_000), fit(0, 1, 8.1, 43, 3.13, 231_000), fit(1, 0, 8.0, 39, 2.87, 228_000), fit(1, 1, 8.9, 44, 5.73, 262_000), fit(2, 0, 8.4, 43, 3.85, 243_000), fit(2, 1, 9.5, 45, 7.70, 291_000), fit(3, 0, 8.5, 44, 4.32, 271_000), fit(3, 1, 9.5, 49, 9.01, 348_000), fit(4, 0, 9.1, 42, 6.31, 330_000)],
  },
  {
    // The stern trawler (measured Oct 2026, as the others, bare: no deck gear pinned): big,
    // heavy and slow, with the longest working deck and the biggest payload of them all.
    what: 'A stern trawler: 20 m of steel, a whaleback forward, the house forward and a long working deck aft for the trawl.',
    goodFor: ['trawl', 'cargo'],
    crates: 163,
    pots: 105,
    maxCrates: 305,
    maxPots: 198,
    fits: [fit(0, 0, 5.5, 36, 1.91, 476_000), fit(0, 1, 7.9, 39, 3.83, 512_000), fit(1, 0, 7.8, 35, 3.50, 495_000), fit(1, 1, 9.5, 46, 7.01, 543_000), fit(2, 0, 8.8, 43, 5.09, 507_000), fit(2, 1, 10.1, 53, 10.17, 569_000), fit(3, 0, 9.3, 45, 6.65, 527_000), fit(3, 1, 10.4, 53, 13.30, 623_000), fit(4, 0, 10.3, 47, 11.23, 597_000)],
  },
  {
    // The fast catamaran (measured 23 Oct 2026 on her redrawn lines, her plating
    // CONFIG.shipyard.catamaran.scantlings, twin 400 kW as she comes; always twin, one engine a hull:
    // her single fits are built twin, so only the twins are listed): fast for her size, a
    // wide deck.
    what: 'A fast catamaran: two slim hulls under a wide bridge deck, a wide, steady working platform; 25 to 30 knots.',
    goodFor: ['cargo', 'fire'],
    crates: 92,
    pots: 53,
    maxCrates: 161,
    maxPots: 104,
    fits: [fit(0, 1, 17.6, 85, 2.82, 250_000), fit(1, 1, 24.4, 123, 4.61, 281_000), fit(2, 1, 29.7, 152, 5.65, 310_000), fit(3, 1, 31.6, 142, 5.61, 367_000)],
  },
  {
    // The harbour tug (a one-off: her hull, her superstructure and her engines fixed, so one fit;
    // measured 26 Oct 2026, her stand-in shafts in nozzles until her azimuth drives come).
    what: 'A one-off harbour tug: 25 m of steel, a raised bridge on a deckhouse, heavy fendering all round; she tows over her bow and pushes ships.',
    goodFor: ['towing', 'fire'],
    crates: 334,
    pots: 211,
    maxCrates: 334,
    maxPots: 211,
    fits: [fit(5, 1, 11.8, 903, 30.8, 1_408_000)],
  },
];

export interface TypeLine {
  label: string;
  ok: boolean;
  /** What she manages ("up to 24 kn", "54 crates"). */
  value: string;
}

export interface TypeFit {
  hull: number;
  facts: TypeFacts;
  /** The brief's lines this type can meet or not. */
  lines: TypeLine[];
  misses: number;
  /** Which of the brief's jobs she's built for. */
  suits: JobId[];
  /** The cheapest engine fit meeting the brief's numbers (or the nearest), as a guide. */
  best: FitTrial;
}

/** Every type checked against the brief, best first. */
export function rankTypes(brief: Brief, facts: TypeFacts[] = TYPE_FACTS): TypeFit[] {
  const tows = brief.jobs.includes('towing');
  const out = facts.map((f, hull): TypeFit => {
    // One engine fit has to meet the numbers together; how far each falls short, to pick the nearest.
    const shortBy = (t: FitTrial) =>
      (brief.speedKn ? Math.max(0, 1 - t.topKn / brief.speedKn) : 0) +
      (brief.rangeNm ? Math.max(0, 1 - t.rangeNm / brief.rangeNm) : 0) +
      (brief.budget ? Math.max(0, t.price / brief.budget - 1) : 0) +
      (tows ? Math.max(0, 1 - t.bollardT / TOW_BOLLARD_T) : 0);
    const best = f.fits.reduce((a, t) => (shortBy(t) < shortBy(a) || (shortBy(t) === shortBy(a) && t.price < a.price) ? t : a));
    const lines: TypeLine[] = [];
    if (brief.speedKn) lines.push({ label: 'Speed', ok: best.topKn >= brief.speedKn, value: `${best.topKn.toFixed(0)} kn` });
    if (brief.rangeNm) lines.push({ label: 'Range', ok: best.rangeNm >= brief.rangeNm, value: `${best.rangeNm.toFixed(0)} nm` });
    if (brief.budget) lines.push({ label: 'Price', ok: best.price <= brief.budget, value: `£${Math.round(best.price / 1000)}k` });
    if (tows) lines.push({ label: 'Pull', ok: best.bollardT >= TOW_BOLLARD_T, value: `${best.bollardT.toFixed(1)} t` });
    // Deck room: as she is, or stretched to it, or not even at her largest.
    const room = (label: string, need: number, std: number, max: number, unit: string) =>
      lines.push({ label, ok: max >= need, value: std >= need ? `${std} ${unit}` : max >= need ? `${need} ${unit}, stretched` : `${max} ${unit} at most` });
    if (brief.jobs.includes('cargo') && brief.crates) room('Deck', brief.crates, f.crates, f.maxCrates, 'crates');
    if (brief.jobs.includes('potting') && brief.pots) room('Pots', brief.pots, f.pots, f.maxPots, 'pots');
    return { hull, facts: f, lines, misses: lines.filter((l) => !l.ok).length, suits: brief.jobs.filter((j) => f.goodFor.includes(j)), best };
  });
  // Not the retired hull types (build.ts DESIGN_HULLS `retired`: the workboat).
  return out.filter((t) => !t.facts.retired).sort((a, b) => a.misses - b.misses || b.suits.length - a.suits.length || a.best.price - b.best.price);
}

/**
 * Which hull type for a brief (owner, Oct 2026: the hull types are "a result of the jobs":
 * pick the jobs and targets first, then the Shipyard says which types can do it, as a second
 * step). Each type is checked against the brief with what it can do, measured: its engine
 * fits' sea trials and its deck room. Ranked by how many lines it can't meet, then by how
 * many of the brief's jobs it's built for, then by price.
 *
 * The trials are measured, not modelled: each type at its standard size, bare (no deck gear),
 * every engine fit, gearbox matched, the game's own sea trials (Oct 2026, the trial worker;
 * PROGRESS.md has the table). A type passes a line if ONE of its engine fits meets speed,
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
    // Re-measured with her landing bow (Oct 2026; it was the deep raked stem).
    fits: [fit(0, 0, 11.2, 67, 1.34, 84_000), fit(0, 1, 23.6, 125, 2.30, 102_000), fit(1, 0, 20.6, 104, 2.02, 100_000), fit(1, 1, 34.2, 168, 3.25, 134_000), fit(2, 0, 27.7, 140, 2.44, 114_000), fit(2, 1, 34.9, 237, 4.88, 162_000), fit(3, 0, 10.0, 150, 1.50, 143_000)],
  },
  {
    what: 'Beamy and stable, an open foredeck to work pots and nets over, the house right aft.',
    goodFor: ['potting'],
    crates: 34,
    pots: 18,
    maxCrates: 59,
    maxPots: 34,
    fits: [fit(0, 0, 8.4, 55, 1.56, 128_000), fit(0, 1, 15.6, 75, 2.83, 146_000), fit(1, 0, 11.9, 52, 2.36, 143_000), fit(1, 1, 26.2, 118, 3.89, 177_000), fit(2, 0, 18.8, 85, 2.91, 158_000), fit(2, 1, 33.6, 153, 4.35, 206_000), fit(3, 0, 12.2, 85, 3.20, 186_000)],
  },
  {
    what: 'Semi-displacement, deep and steady: the biggest working deck aft of the house, and the strongest pull.',
    goodFor: ['cargo', 'towing', 'fire', 'trawl'],
    crates: 54,
    pots: 31,
    maxCrates: 83,
    maxPots: 49,
    fits: [fit(0, 0, 8.4, 52, 1.56, 166_000), fit(0, 1, 10.9, 52, 3.02, 184_000), fit(1, 0, 10.0, 52, 2.87, 182_000), fit(1, 1, 19.6, 91, 5.11, 216_000), fit(2, 0, 13.2, 64, 3.99, 196_000), fit(2, 1, 25.8, 130, 6.53, 244_000), fit(3, 0, 16.2, 79, 4.63, 225_000)],
  },
  {
    what: 'A deep-V for speed in a seaway, a long house with room for crew, walkaround side decks.',
    goodFor: ['rescue'],
    crates: 49,
    pots: 29,
    maxCrates: 80,
    maxPots: 49,
    fits: [fit(0, 0, 8.7, 57, 1.56, 194_000), fit(0, 1, 10.9, 53, 3.01, 212_000), fit(1, 0, 10.7, 47, 2.74, 210_000), fit(1, 1, 17.6, 82, 5.14, 243_000), fit(2, 0, 12.2, 61, 3.98, 224_000), fit(2, 1, 23.9, 124, 6.53, 272_000), fit(3, 0, 14.2, 69, 4.62, 252_000)],
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
    fits: [fit(0, 0, 6.2, 35, 1.56, 443_000), fit(0, 1, 7.7, 41, 3.13, 461_000), fit(1, 0, 7.6, 36, 2.87, 459_000), fit(1, 1, 9.1, 46, 5.73, 492_000), fit(2, 0, 8.4, 43, 4.16, 473_000), fit(2, 1, 10.1, 56, 8.32, 521_000), fit(3, 0, 9.0, 44, 5.05, 501_000)],
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
  return out.sort((a, b) => a.misses - b.misses || b.suits.length - a.suits.length || a.best.price - b.best.price);
}

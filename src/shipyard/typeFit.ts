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
 * be built. Re-measure if the hulls or the engines change.
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
  /** Deck room, bare, at standard size (deckRoom.ts). */
  crates: number;
  pots: number;
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
    fits: [fit(0, 0, 10.5, 60, 1.34, 86_000), fit(0, 1, 22.8, 116, 1.15, 104_000), fit(1, 0, 19.5, 94, 2.02, 101_000), fit(1, 1, 33.5, 159, 1.63, 135_000), fit(2, 0, 26.6, 130, 2.44, 116_000), fit(2, 1, 34.2, 225, 2.44, 164_000)],
  },
  {
    what: 'Beamy and stable, an open foredeck to work pots and nets over, the house right aft.',
    goodFor: ['potting'],
    crates: 34,
    pots: 18,
    fits: [fit(0, 0, 8.4, 55, 1.56, 124_000), fit(0, 1, 15.6, 75, 1.42, 142_000), fit(1, 0, 11.9, 52, 2.36, 139_000), fit(1, 1, 26.2, 118, 1.94, 173_000), fit(2, 0, 18.8, 85, 2.91, 154_000), fit(2, 1, 33.6, 153, 2.18, 202_000)],
  },
  {
    what: 'Semi-displacement, deep and steady: the biggest working deck aft of the house, and the strongest pull.',
    goodFor: ['cargo', 'towing', 'fire', 'trawl'],
    crates: 54,
    pots: 31,
    fits: [fit(0, 0, 8.4, 52, 1.56, 162_000), fit(0, 1, 10.9, 52, 1.51, 180_000), fit(1, 0, 10.0, 52, 2.87, 178_000), fit(1, 1, 19.6, 91, 2.55, 212_000), fit(2, 0, 13.2, 64, 3.99, 192_000), fit(2, 1, 25.8, 130, 3.27, 240_000)],
  },
  {
    what: 'A deep-V for speed in a seaway, a long house with room for crew, walkaround side decks.',
    goodFor: ['rescue'],
    crates: 49,
    pots: 29,
    fits: [fit(0, 0, 8.6, 56, 1.56, 186_000), fit(0, 1, 10.8, 53, 1.5, 204_000), fit(1, 0, 10.6, 46, 2.74, 202_000), fit(1, 1, 17.8, 84, 2.57, 235_000), fit(2, 0, 12.2, 61, 3.98, 216_000), fit(2, 1, 24.1, 126, 3.27, 264_000)],
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
    if (brief.jobs.includes('cargo') && brief.crates) lines.push({ label: 'Deck', ok: f.crates >= brief.crates, value: `${f.crates} crates` });
    if (brief.jobs.includes('potting') && brief.pots) lines.push({ label: 'Pots', ok: f.pots >= brief.pots, value: `${f.pots} pots` });
    return { hull, facts: f, lines, misses: lines.filter((l) => !l.ok).length, suits: brief.jobs.filter((j) => f.goodFor.includes(j)), best };
  });
  return out.sort((a, b) => a.misses - b.misses || b.suits.length - a.suits.length || a.best.price - b.best.price);
}

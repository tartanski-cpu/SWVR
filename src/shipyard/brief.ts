/**
 * The brief (owner, Oct 2026: the Shipyard as a designer's tool with a workflow, not a
 * sandbox): what she's for and what she has to do, set at the start and checked all the way
 * through. A designer starts from the job, not from the sliders: pick the mission, set the
 * targets (speed, range, budget, stability, a crane), and the Shipyard suggests a boat for it.
 * From then on every change is measured against the brief, line by line, with a hint of
 * which step to go to when a line isn't met.
 *
 * Shared by everyone in a session, and the same for all the variants (it's the client's
 * requirement; the variants are ways of meeting it).
 */
import { DEFAULT_DESIGN, type ShipDesign } from './design';

export type MissionId = 'workboat' | 'landing' | 'fishing' | 'pilot' | 'own';

export interface Brief {
  /** The design's name ("Calder Haven harbour workboat"). */
  name: string;
  mission: MissionId;
  /** Top speed at least (kn), range flat out at least (nm), price at most (GBP), GM at least (m). 0: no target. */
  speedKn: number;
  rangeNm: number;
  budget: number;
  gmM: number;
  /** A deck crane is wanted. */
  crane: boolean;
}

export interface Mission {
  id: MissionId;
  name: string;
  /** What she's for, in a line. */
  what: string;
  /** The usual targets for the job. */
  targets: Pick<Brief, 'speedKn' | 'rangeNm' | 'budget' | 'gmM' | 'crane'>;
  /** The boat the Shipyard suggests for it: a hull type and its layout (design.ts fields). */
  suggest: Partial<ShipDesign>;
}

/**
 * The jobs, each with its usual targets and a suggested starting boat. The suggestions are
 * the hull types' own layouts (build.ts DESIGN_HULLS defaults) with deck gear for the job;
 * the engine is then found by trial (`engineOptions`, run by the page). The targets are set
 * from those trials (Oct 2026: each type's best fit meets its job's targets with a little
 * in hand), so a suggested boat meets its brief.
 */
export const MISSIONS: Mission[] = [
  {
    id: 'workboat',
    name: 'Harbour workboat',
    what: 'Towing, moorings, cargo and odd jobs round the harbour: deck space, a crane, a steady platform.',
    targets: { speedKn: 10, rangeNm: 50, budget: 200_000, gmM: 0.6, crane: true },
    suggest: { hull: 2, deckCrane: 2, controls: 1 },
  },
  {
    id: 'landing',
    name: 'Landing craft',
    what: 'Cargo and vehicles to beaches and islands with no quay: a ramp bow, a flat bottom, a big open deck.',
    targets: { speedKn: 18, rangeNm: 90, budget: 120_000, gmM: 0.6, crane: false },
    suggest: { hull: 0, controls: 1 },
  },
  {
    id: 'fishing',
    name: 'Inshore fishing',
    what: 'Gillnets and creels close inshore: a beamy, stable boat with an open foredeck to work over.',
    targets: { speedKn: 15, rangeNm: 70, budget: 140_000, gmM: 0.6, crane: false },
    suggest: { hull: 1, controls: 0 },
  },
  {
    id: 'pilot',
    name: 'Pilot / crew transfer',
    what: 'Fast runs out to ships in any weather: a deep-V, a fine raked bow, twin engines, a long house.',
    targets: { speedKn: 22, rangeNm: 110, budget: 280_000, gmM: 0.5, crane: false },
    suggest: { hull: 3, controls: 1, twin: 1 },
  },
  {
    id: 'own',
    name: 'Something else',
    what: 'Your own brief: set the targets yourself, or start from a sketch of her.',
    targets: { speedKn: 0, rangeNm: 0, budget: 0, gmM: 0.5, crane: false },
    suggest: {},
  },
];

export function missionOf(id: MissionId): Mission {
  return MISSIONS.find((m) => m.id === id) ?? MISSIONS[MISSIONS.length - 1];
}

export function newBrief(mission: MissionId = 'own'): Brief {
  return { name: '', mission, ...missionOf(mission).targets };
}

/** A brief from storage or the wire, checked (null if it isn't one). */
export function cleanBrief(b: unknown): Brief | null {
  if (!b || typeof b !== 'object') return null;
  const o = b as Record<string, unknown>;
  const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, v) : 0);
  const mission = MISSIONS.some((m) => m.id === o.mission) ? (o.mission as MissionId) : 'own';
  return {
    name: String(o.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
    mission,
    speedKn: num(o.speedKn, 60),
    rangeNm: num(o.rangeNm, 2000),
    budget: num(o.budget, 5_000_000),
    gmM: num(o.gmM, 5),
    crane: !!o.crane,
  };
}

/**
 * The boat suggested for a brief: the mission's hull type in its usual layout, with a crane
 * if one's wanted. Its engine is a first guess (the type's own); the page then tries every
 * engine fit on her by trial (`engineOptions`, `pickEngine`) and fits the best.
 */
export function suggestFor(brief: Brief, hullDefaults: (hull: number) => Partial<ShipDesign>): Partial<ShipDesign> {
  const m = missionOf(brief.mission);
  const hull = m.suggest.hull ?? DEFAULT_DESIGN.hull;
  return { ...hullDefaults(hull), ...m.suggest, hull, deckCrane: brief.crane ? (m.suggest.deckCrane ?? 2) : 0 };
}

/** Every engine fit to try: each engine, single and twin. */
export function engineOptions(): Partial<ShipDesign>[] {
  const out: Partial<ShipDesign>[] = [];
  for (const engine of [0, 1, 2]) for (const twin of [0, 1]) out.push({ engine, twin });
  return out;
}

export interface Tried {
  fit: Partial<ShipDesign>;
  topSpeedKn: number;
  rangeNm: number;
  price: number;
}

/**
 * The engine fit to pick from those tried: the cheapest that meets the brief's speed, range
 * and budget; failing that, the cheapest meeting speed and range; failing that, the fastest
 * (the brief check then says what's still short).
 */
export function pickEngine(brief: Brief, tried: Tried[]): Tried | null {
  if (!tried.length) return null;
  const fast = (t: Tried) => (!brief.speedKn || t.topSpeedKn >= brief.speedKn) && (!brief.rangeNm || t.rangeNm >= brief.rangeNm);
  const cheapest = (list: Tried[]) => list.reduce((a, t) => (t.price < a.price ? t : a));
  const all = tried.filter((t) => fast(t) && (!brief.budget || t.price <= brief.budget));
  if (all.length) return cheapest(all);
  const quick = tried.filter(fast);
  if (quick.length) return cheapest(quick);
  return tried.reduce((a, t) => (t.topSpeedKn > a.topSpeedKn ? t : a));
}

/** One line of the brief, checked against the design as she is. */
export interface Check {
  label: string;
  /** "≥ 15 kn" */
  target: string;
  /** "17.4 kn", or null while her trial is running. */
  value: string | null;
  /** Met, not met, or not known yet. */
  ok: boolean | null;
  /** What to change if it isn't met: the step to go to, and a hint. */
  fix: { step: string; hint: string } | null;
}

export interface Measured {
  topSpeedKn: number | null;
  rangeNm: number | null;
  price: number;
  gmM: number;
  crane: boolean;
}

/** Check the design against the brief, line by line (targets of 0 aren't checked). */
export function checkBrief(brief: Brief, m: Measured): Check[] {
  const out: Check[] = [];
  const kn = (x: number) => `${x.toFixed(1)} kn`;
  if (brief.speedKn > 0) {
    const ok = m.topSpeedKn === null ? null : m.topSpeedKn >= brief.speedKn;
    out.push({ label: 'Top speed', target: `≥ ${kn(brief.speedKn)}`, value: m.topSpeedKn === null ? null : kn(m.topSpeedKn), ok, fix: ok === false ? { step: 'engine', hint: 'More power or twin engines (Engine), or a longer, finer hull (Hull).' } : null });
  }
  if (brief.rangeNm > 0) {
    const ok = m.rangeNm === null ? null : m.rangeNm >= brief.rangeNm;
    out.push({ label: 'Range flat out', target: `≥ ${brief.rangeNm} nm`, value: m.rangeNm === null ? null : `${m.rangeNm.toFixed(0)} nm`, ok, fix: ok === false ? { step: 'engine', hint: 'A smaller engine burns less (Engine); a lighter, finer hull goes further on it (Hull).' } : null });
  }
  if (brief.budget > 0) {
    const ok = m.price <= brief.budget;
    out.push({ label: 'Price', target: `≤ £${brief.budget.toLocaleString('en-GB')}`, value: `£${Math.round(m.price).toLocaleString('en-GB')}`, ok, fix: ok ? null : { step: 'engine', hint: 'A smaller or single engine (Engine), a shorter hull (Hull), basic controls (Controls).' } });
  }
  if (brief.gmM > 0) {
    const ok = m.gmM >= brief.gmM;
    out.push({ label: 'Stability (GM)', target: `≥ ${brief.gmM.toFixed(2)} m`, value: `${m.gmM.toFixed(2)} m`, ok, fix: ok ? null : { step: 'hull', hint: 'More beam (Hull), a lower or lighter house (Wheelhouse), less weight up high.' } });
  }
  if (brief.crane) {
    out.push({ label: 'Deck crane', target: 'wanted', value: m.crane ? 'fitted' : 'none', ok: m.crane, fix: m.crane ? null : { step: 'deck gear', hint: 'Add one on the foredeck or the aft deck (Deck gear).' } });
  }
  return out;
}

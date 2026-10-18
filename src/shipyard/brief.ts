/**
 * The brief (owner, Oct 2026: the Shipyard as a designer's tool with a workflow, not a
 * sandbox): what she's for and what she has to do, set at the start and checked all the way
 * through. A designer starts from the jobs, not from the sliders: tick the game's jobs she's
 * for and set the targets (speed, range, budget, stability, a crane, deck room); the hull
 * types are then ranked against it (typeFit.ts; owner, Oct 2026: the type is a result of the
 * jobs, a second step) and you start from one, a bare hull: her equipment is pinned on her
 * where it's wanted (pinGear.ts). From then on every change is measured against the brief,
 * line by line, with a hint of which step to go to when a line isn't met.
 *
 * Shared by everyone in a session, and the same for all the variants (it's the client's
 * requirement; the variants are ways of meeting it).
 */
import { CONFIG } from '../config';
import type { GearKind } from '../modular/module';
import { ENGINE_TYPES, SINGLE_ONLY_ENGINES, type ShipDesign } from './design';

/**
 * The game's jobs she can be wanted for (owner, Oct 2026: "do you want to do lobster missions?
 * fishing? cargo? fire?"). Each says what the job takes, in the game's own terms: room on
 * deck, a bollard pull, and the gear the game's job code asks the boat for (`gearOf`: the
 * fire job looks for a fire monitor, the tow for a tow point, and so on). So the check is
 * the game's: a boat that passes can do the job when she's taken into the game.
 *
 * Some gear can't be fitted in the Shipyard yet (a tow post, the trawl gantry, the rescue
 * gear): those lines say so, and don't count against her, until the module comes.
 */
export type JobId = 'cargo' | 'potting' | 'towing' | 'fire' | 'rescue' | 'trawl';

export interface Job {
  id: JobId;
  name: string;
  /** What the job is in the game, in a line. */
  what: string;
  /** The gear the game's job asks her for: its kind, what to call it. */
  gear: { kind: GearKind; name: string }[];
}

export const JOBS: Job[] = [
  { id: 'cargo', name: 'Cargo runs', what: 'Crates port to port, up to 6 a job: deck room and payload.', gear: [] },
  { id: 'potting', name: 'Lobster & crab pots', what: 'Pots out, shot, hauled and sold in the pot: deck room.', gear: [] },
  { id: 'towing', name: 'Towing', what: 'Derelicts, log rafts, barges: a tow point and bollard pull.', gear: [{ kind: 'towPoint', name: 'Tow point' }] },
  { id: 'fire', name: 'Fire fighting', what: 'Fires on boats and quays: a fire monitor.', gear: [{ kind: 'fireMonitor', name: 'Fire monitor' }] },
  { id: 'rescue', name: 'Search & rescue', what: 'People in the water, day and night: rescue gear, a searchlight.', gear: [{ kind: 'lifeRing', name: 'Life ring' }, { kind: 'boatHook', name: 'Boat hook' }, { kind: 'searchlight', name: 'Searchlight' }] },
  { id: 'trawl', name: 'Trawling', what: 'Towed and hauled over the stern: an A-frame and the net.', gear: [{ kind: 'trawlGantry', name: 'Trawl gantry and net' }] },
];

/** The gear the Shipyard can fit now (design.ts fields), and where: the rest is "not in the Shipyard yet". */
export const FITTABLE: Partial<Record<GearKind, { field: keyof ShipDesign; value: number; step: string }>> = {
  searchlight: { field: 'searchlight', value: 1, step: 'deck gear' },
  fireMonitor: { field: 'fireMonitor', value: 1, step: 'deck gear' },
  towPoint: { field: 'sternRoller', value: 1, step: 'deck gear' },
  trawlGantry: { field: 'aFrame', value: 1, step: 'deck gear' },
  lifeRing: { field: 'lifeRing', value: 2, step: 'deck gear' },
  boatHook: { field: 'lifeRing', value: 2, step: 'deck gear' },
};

/** Bollard pull a towing boat needs (t): the barge is the heaviest tow; the game's own workboat pulls 3.9 t. */
export const TOW_BOLLARD_T = 3;

/** A standard crate's mass (kg; CONFIG.cargo.kinds). */
const CRATE_KG = CONFIG.cargo.kinds.find((k) => k.name === 'Crate')!.mass;

export function jobOf(id: JobId): Job | undefined {
  return JOBS.find((j) => j.id === id);
}

export interface Brief {
  /** The design's name ("Calder Haven harbour workboat"). */
  name: string;
  /** The hull type she was started from (build.ts DESIGN_HULLS), or null before one's picked. */
  hull: number | null;
  /** Top speed at least (kn), range flat out at least (nm), price at most (GBP), GM at least (m). 0: no target. */
  speedKn: number;
  rangeNm: number;
  budget: number;
  gmM: number;
  /** A deck crane is wanted. */
  crane: boolean;
  /** The jobs she's wanted for (JOBS). */
  jobs: JobId[];
  /** Cargo runs: crates on deck at least. Potting: pots on deck at least. */
  crates: number;
  pots: number;
}

/** A cargo run's biggest load (career cargo jobs: 2, 4 or 6 crates), and a string of pots (the pallet's 5). */
export const DEFAULT_CRATES = 6;
export const DEFAULT_POTS = 5;

/** An empty brief: no jobs, no targets but a floor on stability. */
export function newBrief(): Brief {
  return { name: '', hull: null, speedKn: 0, rangeNm: 0, budget: 0, gmM: 0.5, crane: false, jobs: [], crates: DEFAULT_CRATES, pots: DEFAULT_POTS };
}

/** The hull type each of the first briefs' "missions" stood for (older saved briefs). */
const OLD_MISSION_HULL: Record<string, number> = { landing: 0, fishing: 1, workboat: 2, pilot: 3 };

/** A brief from storage or the wire, checked (null if it isn't one). */
export function cleanBrief(b: unknown): Brief | null {
  if (!b || typeof b !== 'object') return null;
  const o = b as Record<string, unknown>;
  const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, v) : 0);
  const hull = typeof o.hull === 'number' && Number.isInteger(o.hull) && o.hull >= 0 && o.hull < 16 ? o.hull : (OLD_MISSION_HULL[String(o.mission)] ?? null);
  return {
    name: String(o.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
    hull,
    speedKn: num(o.speedKn, 60),
    rangeNm: num(o.rangeNm, 2000),
    budget: num(o.budget, 5_000_000),
    gmM: num(o.gmM, 5),
    crane: !!o.crane,
    jobs: Array.isArray(o.jobs) ? JOBS.map((j) => j.id).filter((id) => (o.jobs as unknown[]).includes(id)) : [],
    crates: o.crates === undefined ? DEFAULT_CRATES : Math.round(num(o.crates, 200)),
    pots: o.pots === undefined ? DEFAULT_POTS : Math.round(num(o.pots, 200)),
  };
}

/**
 * A bare boat of a hull type to start from (owner: "you start with a raw hull and you pin
 * things"): the type in its usual layout, with no deck gear; the equipment is pinned on her
 * where it's wanted (pinGear.ts), and the brief's check lists what her jobs still need. Her
 * engine is a first guess (the type's own); the page then tries every engine fit on her by
 * trial (`engineOptions`, `pickEngine`) and fits the best.
 */
export function bareHull(hull: number, hullDefaults: (hull: number) => Partial<ShipDesign>): Partial<ShipDesign> {
  return { ...hullDefaults(hull), hull, deckCrane: 0, searchlight: 0, fireMonitor: 0 };
}

/** Every engine fit to try: each engine, single and (unless it only goes in singly) twin. */
export function engineOptions(): Partial<ShipDesign>[] {
  const out: Partial<ShipDesign>[] = [];
  for (let engine = 0; engine < ENGINE_TYPES; engine++) for (const twin of SINGLE_ONLY_ENGINES.includes(engine) ? [0] : [0, 1]) out.push({ engine, twin });
  return out;
}

export interface Tried {
  fit: Partial<ShipDesign>;
  topSpeedKn: number;
  rangeNm: number;
  price: number;
  /** Bollard pull ahead (t). */
  bollardT: number;
}

/**
 * The engine fit to pick from those tried: the cheapest that meets the brief's speed, range
 * (and bollard pull, for towing) and budget; failing that, the cheapest meeting speed and range; failing that, the fastest
 * (the brief check then says what's still short).
 */
export function pickEngine(brief: Brief, tried: Tried[]): Tried | null {
  if (!tried.length) return null;
  const tows = brief.jobs.includes('towing');
  const fast = (t: Tried) => (!brief.speedKn || t.topSpeedKn >= brief.speedKn) && (!brief.rangeNm || t.rangeNm >= brief.rangeNm) && (!tows || t.bollardT >= TOW_BOLLARD_T);
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
  /** The Shipyard can't fit this yet (a module still to come): shown, not counted. */
  na?: boolean;
  /** What to change if it isn't met: the step to go to, and a hint. */
  fix: { step: string; hint: string } | null;
}

export interface Measured {
  topSpeedKn: number | null;
  rangeNm: number | null;
  price: number;
  gmM: number;
  crane: boolean;
  /** Bollard pull ahead (t), or null while her trial is running. */
  bollardT: number | null;
  /** Her deck room (deckRoom.ts). */
  crates: number;
  pots: number;
  payloadKg: number;
  /** Has she this gear (boats/sims.ts `gearOf`)? */
  has: (kind: GearKind) => boolean;
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
    out.push({ label: 'Deck crane', target: 'wanted', value: m.crane ? 'fitted' : 'none', ok: m.crane, fix: m.crane ? null : { step: 'deck gear', hint: 'Pin one on her foredeck or aft deck (Deck gear).' } });
  }
  const room = 'More deck: “Size her for the brief’s deck cargo” (Hull) makes her longer and beamier until it fits; or a shorter house (Wheelhouse), or gear off the open deck (Deck gear).';
  for (const id of brief.jobs) {
    const job = jobOf(id);
    if (!job) continue;
    if (id === 'cargo' && brief.crates > 0) {
      const ok = m.crates >= brief.crates;
      const short = m.payloadKg < brief.crates * CRATE_KG;
      out.push({ label: `${job.name}: crates on deck`, target: `≥ ${brief.crates}`, value: `${m.crates}`, ok, fix: ok ? null : { step: 'hull', hint: short ? `She can carry only ${m.payloadKg} kg: a bigger, heavier hull carries more (Hull).` : room } });
    }
    if (id === 'potting' && brief.pots > 0) {
      const ok = m.pots >= brief.pots;
      out.push({ label: `${job.name}: pots on deck`, target: `≥ ${brief.pots}`, value: `${m.pots}`, ok, fix: ok ? null : { step: 'hull', hint: room } });
    }
    if (id === 'towing') {
      const ok = m.bollardT === null ? null : m.bollardT >= TOW_BOLLARD_T;
      out.push({ label: `${job.name}: bollard pull`, target: `≥ ${TOW_BOLLARD_T.toFixed(1)} t`, value: m.bollardT === null ? null : `${m.bollardT.toFixed(1)} t`, ok, fix: ok === false ? { step: 'engine', hint: 'More power, twin engines, or the slow-revving tug diesel, which turns a bigger propeller (Engine).' } : null });
    }
    for (const g of job.gear) {
      const fit = FITTABLE[g.kind];
      const has = m.has(g.kind);
      if (!fit && !has) {
        out.push({ label: `${job.name}: ${g.name.toLowerCase()}`, target: 'needed', value: 'not in the Shipyard yet', ok: null, na: true, fix: null });
        continue;
      }
      out.push({ label: `${job.name}: ${g.name.toLowerCase()}`, target: 'needed', value: has ? 'fitted' : 'none', ok: has, fix: has || !fit ? null : { step: fit.step, hint: 'Pin one on her where you want it (Deck gear).' } });
    }
  }
  return out;
}

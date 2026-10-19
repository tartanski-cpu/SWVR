/**
 * Variants (owner, Oct 2026; collaboration, part 3): forks of a design. "Simon's twin-engine
 * version", "David's long house": each a full copy of the design, with its own pins and
 * marks and a link to the one it came from. A session (or one person on their own) holds
 * the main design and its variants. Any two can be compared, a variant can be promoted to
 * the main design, and one's values can be merged into another field by field.
 */
import { ALL_FIELDS, DEFAULT_DESIGN, fromSteps, type ShipDesign } from './design';
import { designFromFields } from './designDoc';
import { cleanNotes, type Note } from './notes';
import { cleanBrief, type Brief } from './brief';

export interface Variant {
  id: string;
  name: string;
  /** The variant it was forked from (null for the main design). */
  parent: string | null;
  /** Who made it, and when (ms since 1970). */
  by: string;
  t: number;
  design: ShipDesign;
  notes: Note[];
}

/** What a session (or a design on your own) holds: the main design first, then its variants. */
export interface YardDoc {
  /** 3: the wheelhouse's measurements as values (design.ts MEASURES); 2 and 1 held the code's steps. */
  v: 3;
  variants: Variant[];
  /** What she's for and her targets (brief.ts): one for the design and all its variants. */
  brief?: Brief;
  /** The step of the design flow the session is on (page.ts: everyone moves together). */
  step?: string;
}

export const MAIN = 'main';
export const MAX_VARIANTS = 12;
const MAX_NAME = 40;

/**
 * A design from anything shaped like one (a saved project's, a session's): read as a design
 * document's fields (designDoc.ts), every field on its scale, one it lacks as boats were
 * before that field existed. (Not nothing: that's the default design.)
 */
export function cleanDesign(d: unknown): ShipDesign {
  if (!d || typeof d !== 'object') return { ...DEFAULT_DESIGN };
  return designFromFields(d).design;
}

export function cleanVariant(v: unknown): Variant | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || !/^[\w-]{1,40}$/.test(o.id)) return null;
  return {
    id: o.id,
    name: String(o.name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) || 'Variant',
    parent: typeof o.parent === 'string' ? o.parent : null,
    by: String(o.by ?? '').slice(0, 20),
    t: Number(o.t) || 0,
    design: cleanDesign(o.design),
    notes: cleanNotes(o.notes),
  };
}

/** A new doc holding just a main design. */
export function newDoc(design: ShipDesign, notes: Note[] = []): YardDoc {
  return { v: 3, variants: [{ id: MAIN, name: 'Main', parent: null, by: '', t: 0, design: { ...design }, notes }] };
}

/** A doc from storage or the wire, checked. Part 1-2 copies ({ v: 1, design, notes }) become a main design. */
/** A step name (page.ts's data-step: lower-case words), else null. */
export function cleanStep(s: unknown): string | null {
  return typeof s === 'string' && /^[a-z &]{1,30}$/.test(s) ? s : null;
}

export function cleanDoc(raw: unknown): YardDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  // (Saved before the wheelhouse's measurements were values: its designs in the code's steps.)
  const old = (d: unknown) => (d && typeof d === 'object' ? fromSteps(d as Partial<ShipDesign>) : d);
  if (o.v === 1 && o.design) return newDoc(cleanDesign(old(o.design)), cleanNotes(o.notes));
  if ((o.v !== 2 && o.v !== 3) || !Array.isArray(o.variants)) return null;
  const list = o.variants.map((v) => (o.v === 2 && v && typeof v === 'object' ? { ...v, design: old((v as { design?: unknown }).design) } : v)).map(cleanVariant).filter((v): v is Variant => !!v);
  const main = list.find((v) => v.id === MAIN);
  if (!main) return null;
  // Main first; no repeated ids.
  const seen = new Set<string>();
  const rest = list.filter((v) => v.id !== MAIN && !seen.has(v.id) && seen.add(v.id)).slice(0, MAX_VARIANTS - 1);
  const brief = cleanBrief(o.brief);
  const step = cleanStep(o.step);
  return { v: 3, variants: [{ ...main, parent: null }, ...rest], ...(brief ? { brief } : {}), ...(step ? { step } : {}) };
}

/** A fork of `from`: a full copy of its design and notes, with a parent link. */
export function fork(from: Variant, id: string, name: string, by: string, t: number): Variant {
  return { id, name: String(name).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) || `${from.name} copy`, parent: from.id, by, t, design: { ...from.design }, notes: from.notes.map((n) => ({ ...n })) };
}

/** The list with `v` in it (replacing one of the same id, else added at the end). */
export function putVariant(list: readonly Variant[], v: Variant): Variant[] {
  const i = list.findIndex((x) => x.id === v.id);
  if (i >= 0) return list.map((x, k) => (k === i ? v : x));
  return list.length >= MAX_VARIANTS ? [...list] : [...list, v];
}

/** The list without a variant (never the main design). Its children now hang from its parent. */
export function dropVariant(list: readonly Variant[], id: string): Variant[] {
  if (id === MAIN) return [...list];
  const gone = list.find((v) => v.id === id);
  return list.filter((v) => v.id !== id).map((v) => (v.parent === id ? { ...v, parent: gone?.parent ?? MAIN } : v));
}

/**
 * Promote a variant to be the main design: the main takes its design and notes, and the
 * variant keeps the old main's (renamed "Main before …"), so nothing is lost. Returns the
 * two changed variants (main, then the old one).
 */
export function promote(list: readonly Variant[], id: string, now: number): [Variant, Variant] | null {
  const main = list.find((v) => v.id === MAIN);
  const v = list.find((x) => x.id === id);
  if (!main || !v || id === MAIN) return null;
  return [
    { ...main, design: { ...v.design }, notes: v.notes.map((n) => ({ ...n })), t: now },
    { ...v, name: `Main before “${v.name}”`.slice(0, MAX_NAME), design: { ...main.design }, notes: main.notes.map((n) => ({ ...n })), t: now },
  ];
}

/** The fields where two designs differ (in the order of the code's fields; never the gearbox, which follows the rest). */
export function diffFields(a: ShipDesign, b: ShipDesign): (keyof ShipDesign)[] {
  return ALL_FIELDS.map((f) => f.key).filter((k) => k !== 'gear' && a[k] !== b[k]);
}

/** A merge: the patch that gives `into` the values of `from` for the ticked fields. */
export function mergePatch(from: ShipDesign, fields: readonly (keyof ShipDesign)[]): Partial<ShipDesign> {
  const p: Partial<ShipDesign> = {};
  for (const k of fields) if (k !== 'gear') (p as Record<string, number>)[k] = from[k];
  return p;
}

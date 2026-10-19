/**
 * The design document (parametric boats P1, docs/PARAMETRIC_PLAN.md): a Shipyard design as
 * named fields, so a design can travel as a document wherever it travelled as a code.
 *
 *   { "format": "swvr.design", "v": 1, "name": "Kittiwake", "design": { "hull": 3, ... } }
 *
 * Why: the short code (design.ts) holds only whole-number steps on fixed scales, and every new
 * option has to be squeezed into it. A document holds any number of named fields, of any value.
 *
 *   missing     a field a document doesn't have is the starting design's (DEFAULT_DESIGN).
 *               No old designs are kept compatible (owner, Oct 2026: older Shipyard boats may
 *               break), so there's no history to carry: just today's fields.
 *   reading     forgiving, and says what it did: a field it doesn't know (from a newer
 *               Shipyard) is skipped, a value off its scale is brought onto it, each with a
 *               warning; it never throws.
 *   a token     what travels where a code travelled (the game's address, crew joining a host,
 *               favourites, Try her together): her short code while one can hold her, else
 *               `doc.` and her document, compacted (only the fields that differ from the
 *               starting design) in URL-safe characters. `readDesign` takes either, or a link or file
 *               holding one, so when a design can't be coded nothing else has to change.
 */
import { ALL_FIELDS, DEFAULT_DESIGN, decodeDesign, encodeDesign, type ShipDesign } from './design';

export const DOC_FORMAT = 'swvr.design';
/** The document's own version: goes up only if its shape changes (not for new fields: those are just names). */
export const DOC_VERSION = 1;
/** What starts a document token (base64url has no '.', so it can't be mistaken for a code). */
export const DOC_PREFIX = 'doc.';
const MAX_NAME = 40;

export interface DesignDoc {
  format: typeof DOC_FORMAT;
  v: number;
  name?: string;
  design: Partial<Record<keyof ShipDesign, number>>;
}

/** Every field, in the code's order (then the later ones). */
export const DOC_FIELDS = Object.keys(DEFAULT_DESIGN) as (keyof ShipDesign)[];
const STEPS = new Map(ALL_FIELDS.map((f) => [f.key, f.steps]));

/** A tidy name: one line, at most 40 characters. */
export function cleanDocName(name: unknown): string {
  return typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '';
}

/** A read design, and what the reader did to read it. */
export type ReadDesign = { design: ShipDesign; name: string; warnings: string[] } | { error: string };

/**
 * A design from a document's fields (or anything shaped like a design: a saved project's,
 * a session's): every field on its scale, a missing one the starting design's, nothing thrown.
 */
export function designFromFields(fields: unknown): { design: ShipDesign; warnings: string[] } {
  const warnings: string[] = [];
  const o = fields && typeof fields === 'object' ? (fields as Record<string, unknown>) : {};
  const got: Partial<ShipDesign> = {};
  for (const k of DOC_FIELDS) {
    const v = o[k];
    if (v === undefined) continue;
    const steps = STEPS.get(k) ?? 1;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      warnings.push(`'${k}' isn't a number: left as the starting design's`);
      continue;
    }
    const on = Math.min(steps - 1, Math.max(0, Math.round(v)));
    if (on !== v) warnings.push(`'${k}' ${v} is off its scale (0 to ${steps - 1}): ${on}`);
    got[k] = on;
  }
  const unknown = Object.keys(o).filter((k) => !(k in DEFAULT_DESIGN));
  if (unknown.length) warnings.push(`Made in a newer Shipyard: ${unknown.join(', ')} left out`);
  return { design: { ...DEFAULT_DESIGN, ...got }, warnings };
}

/** Her document. `compact`: only the fields that differ from the starting design (a token, a link); else every field (a file). */
export function designDoc(d: ShipDesign, name = '', compact = false): DesignDoc {
  const fields: Partial<Record<keyof ShipDesign, number>> = {};
  for (const k of DOC_FIELDS) if (!compact || d[k] !== DEFAULT_DESIGN[k]) fields[k] = d[k];
  const n = cleanDocName(name);
  return { format: DOC_FORMAT, v: DOC_VERSION, ...(n ? { name: n } : {}), design: fields };
}

/** A design from a parsed document. */
export function readDoc(doc: unknown): ReadDesign {
  if (!doc || typeof doc !== 'object') return { error: 'that isn’t a design' };
  const o = doc as Record<string, unknown>;
  if (o.format !== DOC_FORMAT) return { error: 'that isn’t a Shipyard design' };
  if (typeof o.v !== 'number' || o.v > DOC_VERSION) return { error: `that design is from a newer Shipyard than this game (it reads version ${DOC_VERSION})` };
  const read = designFromFields(o.design);
  return { ...read, name: cleanDocName(o.name) };
}

// ── Tokens ──

const toB64Url = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64Url = (text: string): Uint8Array => {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** Her document as a token: `doc.` and the compact document in URL-safe characters. */
export function docToken(d: ShipDesign, name = ''): string {
  return DOC_PREFIX + toB64Url(new TextEncoder().encode(JSON.stringify(designDoc(d, name, true))));
}

/** Her short code, or null if no code can hold her. */
export function shortCode(d: ShipDesign): string | null {
  try {
    return encodeDesign(d);
  } catch {
    return null;
  }
}

/** What travels where a code did: her short code while one can hold her, else her document token. */
export function designToken(d: ShipDesign): string {
  return shortCode(d) ?? docToken(d);
}

/** Is this a document token (rather than a code)? */
export const isDocToken = (token: string): boolean => token.startsWith(DOC_PREFIX);

/**
 * A design from anything a player might give: a code (typed, grouped, look-alike letters), a
 * document token, the game's or the Shipyard's address holding either (`?design=`, `#...`),
 * or a document's text (a file).
 */
export function readDesign(text: string): ReadDesign {
  const t = text.trim();
  if (t.startsWith('{')) {
    try {
      return readDoc(JSON.parse(t));
    } catch {
      return { error: 'that file isn’t a design (it doesn’t read as one)' };
    }
  }
  const token = t.match(/doc\.([A-Za-z0-9_-]+)/);
  if (token) {
    try {
      return readDoc(JSON.parse(new TextDecoder().decode(fromB64Url(token[1]))));
    } catch {
      return { error: 'that link is cut short or changed (its design doesn’t read)' };
    }
  }
  // A code: on its own, or in an address (?design=CODE or #CODE).
  const code = t.match(/design=([^&#\s]+)/)?.[1] ?? (t.includes('#') ? t.slice(t.indexOf('#') + 1) : t);
  const read = decodeDesign(decodeURIComponent(code));
  return 'design' in read ? { design: read.design, name: '', warnings: [] } : read;
}

/** Two tokens for the same boat? (A code and a document, or two documents, of the same design.) */
export function sameDesign(a: string, b: string): boolean {
  const ra = readDesign(a);
  const rb = readDesign(b);
  return 'design' in ra && 'design' in rb && DOC_FIELDS.every((k) => ra.design[k] === rb.design[k]);
}

/** A file name for her document. */
export function docFileName(name: string): string {
  const base = cleanDocName(name).replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-') || 'shipyard-design';
  return `${base}.swvr-design.json`;
}

/** Her document as a file's text (every field, readable). */
export function docFileText(d: ShipDesign, name = ''): string {
  return JSON.stringify(designDoc(d, name), null, 2) + '\n';
}

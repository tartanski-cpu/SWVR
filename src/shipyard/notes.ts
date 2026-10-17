/**
 * Notes on the boat (owner, Oct 2026; collaboration, part 2): pins and freehand marks that
 * anyone in the session puts on her.
 *
 *   pin   a point with a short note ("searchlight here", "cut the house down"). A pin is a
 *         small task: it's on the design's to-do list with its author until someone marks it
 *         done, and done pins fade.
 *   mark  a quick freehand scribble on her, a line of points.
 *
 * Where they are is kept in **hull fractions**, not metres or pixels: each coordinate as a
 * fraction of her extent (0 at one end of her bounding box, 1 at the other), along her
 * length, across her beam and up her height. Stretch her and a pin on the roof stays on the
 * roof, not in the water. (Later, with modules on the Shipyard, a pin can also link to the
 * socket nearest it, and dropping a module there will resolve it.)
 *
 * Notes are shared in the session like the design (session.ts): each is put or deleted
 * whole, by id, so the last change to a note wins.
 */

export type Frac = [number, number, number];

interface NoteBase {
  id: string;
  /** Author's name and colour (kept with the note: they may have left). */
  by: string;
  colour: string;
  /** When made (ms since 1970), for the list's order. */
  t: number;
}
export interface Pin extends NoteBase {
  kind: 'pin';
  at: Frac;
  text: string;
  /** Marked done: it fades, and moves to the foot of the list. */
  done: boolean;
  /** Who marked it done. */
  doneBy?: string;
}
export interface Mark extends NoteBase {
  kind: 'mark';
  pts: Frac[];
}
export type Note = Pin | Mark;

export const MAX_TEXT = 140;
export const MAX_POINTS = 300;
export const MAX_NOTES = 300;

const frac = (v: unknown): v is Frac => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x) && x > -1 && x < 2);
const str = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** A note as it came over the wire or out of storage, checked; null if it isn't one. */
export function cleanNote(n: unknown): Note | null {
  if (!n || typeof n !== 'object') return null;
  const o = n as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id || o.id.length > 40) return null;
  const base = { id: o.id, by: str(o.by, 20) || '?', colour: /^#[0-9a-f]{6}$/i.test(String(o.colour)) ? String(o.colour) : '#567', t: Number(o.t) || 0 };
  if (o.kind === 'pin' && frac(o.at)) {
    return { ...base, kind: 'pin', at: [o.at[0], o.at[1], o.at[2]], text: str(o.text, MAX_TEXT), done: !!o.done, ...(o.doneBy ? { doneBy: str(o.doneBy, 20) } : {}) };
  }
  if (o.kind === 'mark' && Array.isArray(o.pts)) {
    const pts = o.pts.filter(frac).slice(0, MAX_POINTS).map((p) => [p[0], p[1], p[2]] as Frac);
    return pts.length >= 2 ? { ...base, kind: 'mark', pts } : null;
  }
  return null;
}

/** The notes with `n` put in (replacing one of the same id). */
export function putNote(notes: readonly Note[], n: Note): Note[] {
  const i = notes.findIndex((x) => x.id === n.id);
  if (i >= 0) return notes.map((x, k) => (k === i ? n : x));
  return [...notes, n].slice(-MAX_NOTES);
}

/** The notes without the one with this id. */
export function dropNote(notes: readonly Note[], id: string): Note[] {
  return notes.filter((x) => x.id !== id);
}

/** A list of notes, checked (bad ones skipped). */
export function cleanNotes(list: unknown): Note[] {
  return Array.isArray(list) ? list.map(cleanNote).filter((n): n is Note => !!n).slice(-MAX_NOTES) : [];
}

/** The to-do list: open pins first (oldest first), then done ones. */
export function todo(notes: readonly Note[]): Pin[] {
  const pins = notes.filter((n): n is Pin => n.kind === 'pin');
  return [...pins.filter((p) => !p.done).sort((a, b) => a.t - b.t), ...pins.filter((p) => p.done).sort((a, b) => a.t - b.t)];
}

/** A point (boat axes, m) as hull fractions of her bounding box `min`..`max`. */
export function toFrac(p: readonly number[], min: readonly number[], max: readonly number[]): Frac {
  return [0, 1, 2].map((i) => (p[i] - min[i]) / Math.max(1e-6, max[i] - min[i])) as Frac;
}

/** Hull fractions back to a point on her as she is now. */
export function fromFrac(f: Frac, min: readonly number[], max: readonly number[]): [number, number, number] {
  return [0, 1, 2].map((i) => min[i] + f[i] * (max[i] - min[i])) as [number, number, number];
}

/** A new note id: unique enough for one design (the person's id, the time, a random tail). */
export function noteId(me: string): string {
  return `${me || 'n'}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}`;
}

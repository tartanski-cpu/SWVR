/**
 * Notes on the boat (owner, Oct 2026; collaboration, part 2): pins, and sketches that anyone
 * in the session puts on her.
 *
 *   pin    a point on her with a short note ("searchlight here", "cut the house down"). A pin
 *          is a small task: it's on the design's to-do list with its author until someone
 *          marks it done, and done pins fade. Kept in **hull fractions**, not metres or
 *          pixels: each coordinate as a fraction of her hull's extent (0 at one end, 1 at the
 *          other), along her length, across her beam and up her height, so stretch her and a
 *          pin on the roof stays on the roof, not in the water.
 *   sheet  a flat sketch sheet (owner: draw on a 2D picture, like on a screenshot, not in
 *          3D): a snapshot of the view as it was, or a squared drawing grid for a first
 *          sketch of her profile (sketchFit.ts reads that one).
 *   ink    one pen stroke on a sheet, in the sheet's own 0..1 coordinates (x across, y down).
 *          Each stroke is its own note, so two people can draw on one sheet at once.
 *
 * (The first freehand marks were drawn on her 3D surface; the owner found that confusing,
 * and they're no longer read: old ones are dropped.)
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
export interface Sheet extends NoteBase {
  kind: 'sheet';
  title: string;
  /** The picture under the drawing (a JPEG data URL), or '' for a squared grid. */
  image: string;
  /** Its shape: width / height. */
  aspect: number;
  /** A drawing grid's extent in metres (with the waterline `waterY` m up from its foot). */
  grid?: { wM: number; hM: number; waterY: number };
}
export interface Ink extends NoteBase {
  kind: 'ink';
  sheet: string;
  /** Which part a profile-sketch stroke draws ('hull' or 'house'); none on a snapshot. */
  tag?: 'hull' | 'house';
  pts: [number, number][];
}
export type Note = Pin | Sheet | Ink;

export const MAX_TEXT = 140;
export const MAX_POINTS = 400;
export const MAX_NOTES = 400;
export const MAX_SHEETS = 12;
/** A sheet's picture at most this long as a data URL (about 300 KB): a 800 px JPEG is well inside. */
export const MAX_IMAGE = 400_000;

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
  if (o.kind === 'sheet') {
    const image = typeof o.image === 'string' && o.image.length <= MAX_IMAGE && /^data:image\/(jpeg|png);base64,/.test(o.image) ? o.image : '';
    const aspect = Number(o.aspect);
    const g = o.grid as Record<string, unknown> | undefined;
    const grid = g && [g.wM, g.hM, g.waterY].every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x < 200) ? { wM: Number(g.wM), hM: Number(g.hM), waterY: Number(g.waterY) } : undefined;
    if (!image && !grid) return null;
    return { ...base, kind: 'sheet', title: str(o.title, 60), image, aspect: aspect > 0.2 && aspect < 5 ? aspect : 1.6, ...(grid ? { grid } : {}) };
  }
  if (o.kind === 'ink' && typeof o.sheet === 'string' && Array.isArray(o.pts)) {
    const xy = (p: unknown): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === 'number' && Number.isFinite(x) && x > -0.5 && x < 1.5);
    const pts = o.pts.filter(xy).slice(0, MAX_POINTS).map((p) => [p[0], p[1]] as [number, number]);
    const tag = o.tag === 'hull' || o.tag === 'house' ? o.tag : undefined;
    return pts.length >= 2 ? { ...base, kind: 'ink', sheet: o.sheet.slice(0, 40), pts, ...(tag ? { tag } : {}) } : null;
  }
  return null;
}

/** The notes with `n` put in (replacing one of the same id). */
export function putNote(notes: readonly Note[], n: Note): Note[] {
  const i = notes.findIndex((x) => x.id === n.id);
  if (i >= 0) return notes.map((x, k) => (k === i ? n : x));
  return [...notes, n].slice(-MAX_NOTES);
}

/** The notes without the one with this id (a sheet takes its ink with it). */
export function dropNote(notes: readonly Note[], id: string): Note[] {
  return notes.filter((x) => x.id !== id && !(x.kind === 'ink' && x.sheet === id));
}

/** The sketch sheets, oldest first, and each one's ink. */
export function sheetsOf(notes: readonly Note[]): Sheet[] {
  return notes.filter((n): n is Sheet => n.kind === 'sheet').sort((a, b) => a.t - b.t);
}
export function inkOf(notes: readonly Note[], sheet: string): Ink[] {
  return notes.filter((n): n is Ink => n.kind === 'ink' && n.sheet === sheet).sort((a, b) => a.t - b.t);
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

/**
 * The Shipyard's favourites (owner, Oct 2026): designs you keep, by name, in this browser.
 *
 * Each is just the design's code (design.ts), so a favourite is exactly the boat it was,
 * and still opens after the code format grows (old codes read as the same boats). With it:
 * the name you gave it, when it was saved, a small picture of her and a line of her figures
 * to tell them apart in the list.
 *
 * Saved in the browser's own storage under `swvr.shipyard.favourites` (the game's other
 * saves are `swvr.*` too). That storage belongs to this browser on this device: the Quest's
 * browser and the desktop's keep separate lists. A design moves between them by its code.
 */
import { decodeDesign } from './design';

export interface Favourite {
  name: string;
  code: string;
  /** When saved (ms since 1970). */
  savedAt: number;
  /** A small JPEG of her, as a data URL ('' if none). */
  picture: string;
  /** One line of her figures, e.g. "11.2 m · 8.4 kn". */
  summary: string;
}

export const FAVOURITES_KEY = 'swvr.shipyard.favourites';
/** At most this many are kept (the oldest go first); with pictures, well inside the browser's storage. */
export const MAX_FAVOURITES = 40;
const MAX_NAME = 40;

/** The browser's storage, or anything shaped like it (tests). */
export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The saved list, newest first. Anything unreadable is skipped, never thrown. */
export function readFavourites(store: Store | null): Favourite[] {
  let raw: unknown;
  try {
    raw = JSON.parse(store?.getItem(FAVOURITES_KEY) ?? '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is Favourite => !!f && typeof f.name === 'string' && typeof f.code === 'string' && 'design' in decodeDesign(f.code))
    .map((f) => ({ name: f.name, code: f.code, savedAt: Number(f.savedAt) || 0, picture: typeof f.picture === 'string' ? f.picture : '', summary: typeof f.summary === 'string' ? f.summary : '' }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

/** Write the list. False if the browser wouldn't take it (storage full or switched off). */
export function writeFavourites(store: Store | null, list: Favourite[]): boolean {
  try {
    store?.setItem(FAVOURITES_KEY, JSON.stringify(list));
    return !!store;
  } catch {
    return false;
  }
}

/** A tidy name: trimmed, one line, not too long; empty becomes `fallback`. */
export function cleanName(name: string, fallback: string): string {
  const n = name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  return n || fallback;
}

/**
 * The list with `fav` added at the top. One of the same name is replaced (saving again
 * under a name updates it); past MAX_FAVOURITES the oldest drop off.
 */
export function addFavourite(list: Favourite[], fav: Favourite): Favourite[] {
  const others = list.filter((f) => f.name.toLowerCase() !== fav.name.toLowerCase());
  return [fav, ...others].slice(0, MAX_FAVOURITES);
}

/** The list without the one saved at `savedAt` called `name`. */
export function removeFavourite(list: Favourite[], name: string, savedAt: number): Favourite[] {
  return list.filter((f) => !(f.name === name && f.savedAt === savedAt));
}

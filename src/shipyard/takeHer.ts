/**
 * Bringing a Shipyard boat into the game (owner, Oct 2026): from the game's menu (Office >
 * Your boats), with no pasting needed in VR.
 *
 *   favourites  the Shipyard's favourites (favourites.ts) are kept in this browser's
 *               storage, which the game shares (same site), so it lists them: pick one and
 *               the game restarts in her. Design on the Quest's browser, then play in VR.
 *   a code      for a boat designed on another device: typed on the menu's keypad (VR),
 *               or pasted (desktop: Ctrl+V anywhere in the game, or the Paste button).
 *
 * This is the menu's state and its checks, with no page or scene in it (tested in
 * tests/takeHer.test.ts). The restart itself is the app's (App.ts takeDesign).
 */
import { ALPHABET } from './design';
import { isDocToken, readDesign } from './designDoc';
import { readFavourites, type Favourite, type Store } from './favourites';
import { DESIGN_HULLS } from './build';

/** Longest code the keypad takes (characters): today's are 17-20, more with gear placed by hand. */
export const MAX_CODE = 40;
/** Favourites shown on one page of the menu. */
export const PER_PAGE = 5;

/** A code's characters as the Shipyard writes them: upper case, look-alikes read as it reads them, nothing else. */
export function cleanCode(text: string): string {
  return text
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .split('')
    .filter((c) => ALPHABET.includes(c))
    .join('')
    .slice(0, MAX_CODE);
}

/** A code shown in groups of five, as the Shipyard prints it (a design from a link has no code: said so). */
export function groupCode(code: string): string {
  if (isDocToken(code)) return 'from a link';
  return (code.match(/.{1,5}/g) ?? []).join('-');
}

/**
 * Whether a typed code reads as a boat, and a line to say so. Today's codes are 17 to 20
 * characters (more with gear placed by hand); older, shorter ones (13-16) still read as
 * boats, so a code is only taken from 17 characters, or the first 13 of one being typed
 * would already read as some other, older boat. (Favourites and pasted codes are whole:
 * any version is taken.)
 */
export function checkCode(code: string, whole = false): { ok: boolean; text: string } {
  if (!code) return { ok: false, text: 'Type her code from the Shipyard (it is under her picture there)' };
  const read = readDesign(code);
  if (!whole && code.length < 17) return { ok: false, text: `${code.length} characters so far` };
  if (!('design' in read)) return { ok: false, text: `${code.length} characters: not a whole code yet (${read.error})` };
  const hull = DESIGN_HULLS[read.design.hull]?.name.split(':')[0] ?? 'A Shipyard boat';
  return { ok: true, text: `${read.name ? `${read.name}: ` : ''}${hull}${read.design.twin ? ', twin engines' : ''}: ready to take` };
}

/** The menu's Your boats page: the favourites' page, and the code being typed. */
export class ShipyardCodes {
  code = '';
  page = 0;
  /** The code was pasted whole (any version taken), not typed. */
  pasted = false;

  /** Whether the code reads as a boat, and the line to show. */
  check(): { ok: boolean; text: string } {
    return checkCode(this.code, this.pasted);
  }

  constructor(private readonly store: () => Store | null) {}

  favourites(): Favourite[] {
    return readFavourites(this.store());
  }

  /** The favourite at row `i` of the page shown, if any. */
  favouriteAt(i: number): Favourite | undefined {
    return this.favourites()[this.page * PER_PAGE + i];
  }

  pages(): number {
    return Math.max(1, Math.ceil(this.favourites().length / PER_PAGE));
  }

  turn(by: number): void {
    this.page = Math.min(this.pages() - 1, Math.max(0, this.page + by));
  }

  type(c: string): void {
    this.code = cleanCode(this.code + c);
    this.pasted = false;
  }

  backspace(): void {
    this.code = this.code.slice(0, -1);
    this.pasted = false;
  }

  clear(): void {
    this.code = '';
    this.pasted = false;
  }

  /** Pasted text (a code, the Shipyard's play link with ?design=, or a link to her document): kept if it reads as a boat (true), else left as it was. */
  paste(text: string): boolean {
    const doc = text.match(/doc\.[A-Za-z0-9_-]+/)?.[0];
    const code = doc ?? cleanCode(text.match(/design=([^&#\s]+)/)?.[1] ?? text);
    if (!checkCode(code, true).ok) return false;
    this.code = code;
    this.pasted = true;
    return true;
  }
}

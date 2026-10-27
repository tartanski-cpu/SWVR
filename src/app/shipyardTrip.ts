/**
 * To the Shipyard and back (owner, Oct 2026: "render the whole shipyard web page in the 3D
 * environment ... create and upgrade ships using the same shipyard app"; docs/SHIPYARD_IN_GAME.md).
 * A browser can't draw a live page into VR, so the yard's door opens the real Shipyard page as
 * a flat window (the Quest Browser draws it sharp), on her own design, in its refit mode; its
 * "Back to the boat" brings you back to the game in her as refitted.
 *
 * The address out (the Shipyard reads it):
 *   shipyard.html?refit=career|voyage&back=<the game's address>[&money=<career money>]#<her code>
 *   - `refit`  the mode: the career pays for a refit, Voyage has no money (owner);
 *   - `back`   where "Back to the boat" goes, with `design=<new code>&refitFrom=<old code>` added
 *              (no `refitFrom`: no change, nothing to pay);
 *   - `money`  the career's balance, to show what she can afford.
 * On your own: no shared Shipyard session (owner: no multiplayer for this).
 *
 * The price of a refit is worked out here again on the way back, not taken from the address:
 * her new design's price less her old one's (the Shipyard's own figures, build.ts), nothing
 * back for a cheaper one.
 */
import { buildDesign } from '../shipyard/build';
import { readDesign, sameDesign } from '../shipyard/designDoc';

/**
 * Is this career page a sea trial (CONFIG.career.seaTrialS; the free career boats, review Oct
 * 2026)? A Shipyard design on the address that isn't the career's own boat (`own`:
 * CareerState.design), not a paid refit or purchase coming back (`refitFrom`), and not a
 * crew-mate joining (the host's boat), nor a try-out together (`isTryOut`). Voyage has no
 * trials: it's a sandbox.
 */
export function isSeaTrial(mode: string, search: string, own: string | undefined): boolean {
  const p = new URLSearchParams(search);
  return unpaid(mode, p, own) && !p.has('host') && !p.has('together');
}

/**
 * A try-out together (multiplayer study #4, #26): a career page in a design the career hasn't
 * paid for, hosted (Try her together, or the host changing boat) or followed (the crew sent
 * in, or following the host). No clock (a sea trial's ended everyone's game after five
 * minutes, starting them all again in the beginner boat), and nothing saved: she isn't yours.
 */
export function isTryOut(mode: string, search: string, own: string | undefined): boolean {
  const p = new URLSearchParams(search);
  return unpaid(mode, p, own) && (p.has('host') || p.has('together'));
}

/** In the career, in a Shipyard design that isn't her own and wasn't just paid for. */
function unpaid(mode: string, p: URLSearchParams, own: string | undefined): boolean {
  if (mode !== 'career') return false;
  const code = p.get('design');
  if (!code || p.has('refitFrom') || p.has('join')) return false;
  return !own || !sameDesign(own, code);
}

/** The address of the Shipyard in refit mode, for her design `code`. */
export function shipyardUrl(code: string, mode: 'career' | 'voyage', back: string, money?: number): string {
  const q = new URLSearchParams({ refit: mode, back });
  if (mode === 'career' && money !== undefined) q.set('money', String(Math.round(money)));
  return `./shipyard.html?${q.toString()}#${encodeURIComponent(code)}`;
}

/** The game's own address to come back to: this page without its one-off parameters (or her old design). */
export function backUrl(href: string): string {
  const url = new URL(href);
  for (const k of ['design', 'boat', 'fit', 'refitFrom', 'mv', 'start', 'join', 'host', 'together', 'fresh', 't']) url.searchParams.delete(k);
  return url.toString();
}

/** A design's price in the Shipyard (GBP), or null if the code doesn't read or build. */
export function designPrice(code: string): number | null {
  // Remembered: building a design is a whole boat's work (tens of ms, more on the Quest), and
  // the Your boats board asks for each favourite's price every frame it's shown (owner, Oct
  // 2026: 2 fps on the Quest standing by it). A code always builds the same boat.
  const known = PRICES.get(code);
  if (known !== undefined) return known;
  const read = readDesign(code);
  let price: number | null = null;
  if ('design' in read) {
    try {
      price = buildDesign(read.design).figures.price;
    } catch {
      price = null;
    }
  }
  if (PRICES.size >= 64) PRICES.clear();
  PRICES.set(code, price);
  return price;
}

/** Each design's price by its code (designPrice), up to 64 of them. */
const PRICES = new Map<string, number | null>();

/** What a refit from `oldCode` to `newCode` costs: the difference in price, nothing for a cheaper one; null if either doesn't build. */
export function refitCost(oldCode: string, newCode: string): number | null {
  const a = designPrice(oldCode);
  const b = designPrice(newCode);
  return a === null || b === null ? null : Math.max(0, Math.round(b - a));
}

/** Back from the Shipyard with a refit to settle: her old and new codes, from the address. */
export function refitReturn(search: string): { from: string; to: string } | null {
  const p = new URLSearchParams(search);
  const from = p.get('refitFrom');
  const to = p.get('design');
  return from && to ? { from, to } : null;
}

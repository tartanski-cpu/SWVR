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
import { readDesign } from '../shipyard/designDoc';

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
  const read = readDesign(code);
  if (!('design' in read)) return null;
  try {
    return buildDesign(read.design).figures.price;
  } catch {
    return null;
  }
}

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

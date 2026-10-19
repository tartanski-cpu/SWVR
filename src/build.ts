/**
 * Which build this page is (vite.config.ts stamps `__BUILD__`: the commit and the time), and
 * keeping it the latest one published.
 *
 * Both addresses are rebuilt on every push, and the browser (and GitHub Pages' cache) can
 * keep serving the page it had for some minutes after. Two players then easily hold
 * different builds, and the crew's game refuses the host's as "another version" (App.ts
 * sameVersionAsHost; owner, Oct 2026: hosting "broken" on a day of many pushes). So at
 * start each page asks the site which build is current (`build.json`, written beside the
 * pages by vite.config.ts, fetched past every cache) and, if it's behind, loads itself again
 * past the cache, once (`?fresh=1`), keeping the address it was opened with (a game code, a
 * room, a design, a Shipyard session). That runs from a line of script vite.config.ts puts
 * at the top of each page, before the game loads, using `freshUrl` below (kept here, plain,
 * so it's tested: no imports, nothing of the browser but the URL).
 */
declare const __BUILD__: string | undefined;

/** This page's version: commit and build time; 'dev' when not built. */
export const APP_BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';

/**
 * The address to load again, or null to stay: when the site's current build (`served`) is
 * another than ours and this load wasn't already a fresh one. A page that isn't a build
 * ('dev'), or a site that can't say, stays.
 */
export function freshUrl(mine: string, served: string | null | undefined, href: string): string | null {
  if (mine === 'dev' || !served || served === mine) return null;
  const url = new URL(href);
  if (url.searchParams.has('fresh')) return null; // reloaded once already: the cache has its reasons
  url.searchParams.set('fresh', '1');
  url.searchParams.set('t', String(Date.now())); // a new address: nothing cached under it
  return url.toString();
}

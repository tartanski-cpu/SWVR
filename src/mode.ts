/**
 * Which game this page is (owner, Oct 2026: one landing page, three modes):
 *
 *   career   the game as it was: one boat, the host's career, saves; `career.html`
 *   voyage   a map made from real coastline (tools/coast), no career and no saves: pick a
 *            map, sail; later, several boats in multiplayer; `voyage.html?map=<id>`
 *   training (placeholder on the landing page; not built)
 *
 * The landing page (`index.html`) only chooses. A game address with its old parameters
 * (`?design=`, `?game=`, `?join=` ...) at the root is sent on to `career.html` with them.
 * Read once at load from the page's path; nothing else decides the mode.
 */
export type GameMode = 'career' | 'voyage';

function modeFromPath(): GameMode {
  const path = globalThis.location?.pathname ?? '';
  return /voyage\.html$/.test(path) ? 'voyage' : 'career';
}

export const MODE: GameMode = modeFromPath();

/** Voyage: the map chosen on the landing page (`?map=`), or the first map (world/maps.ts). */
export const VOYAGE_MAP_ID: string | null = MODE === 'voyage' ? (new URLSearchParams(globalThis.location?.search ?? '').get('map') ?? 'oban') : null;

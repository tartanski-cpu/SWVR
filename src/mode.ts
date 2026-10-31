/**
 * Which game this page is (owner, Oct 2026: one landing page, three modes):
 *
 *   career   the game as it was: one boat, the host's career, saves; `career.html`
 *   voyage   a map made from real coastline (tools/coast), no career and no saves: pick a
 *            map, sail; later, several boats in multiplayer; `voyage.html?map=<id>`
 *   training a Voyage on the training harbour (`training.html`, world/regions/training.ts)
 *            with the exercise engine on top (src/training/; docs/TRAINING.md). MODE says
 *            'voyage' there, so it has everything Voyage has and nothing of the career's
 *            (no saves: careerSession.ts); TRAINING says which Voyage it is.
 *
 * The landing page (`index.html`) only chooses. A game address with its old parameters
 * (`?design=`, `?game=`, `?join=` ...) at the root is sent on to `career.html` with them.
 * Read once at load from the page's path; nothing else decides the mode.
 */
export type GameMode = 'career' | 'voyage';

const PATH = globalThis.location?.pathname ?? '';

/** The training page (`training.html`): Training mode, a Voyage on the training harbour. */
export const TRAINING: boolean = /training\.html$/.test(PATH);

function modeFromPath(): GameMode {
  return TRAINING || /voyage\.html$/.test(PATH) ? 'voyage' : 'career';
}

export const MODE: GameMode = modeFromPath();

/** The training harbour's map id (world/maps.ts TRAINING_MAP). */
export const TRAINING_MAP_ID = 'training';

/** Voyage: the map chosen on the landing page (`?map=`), or the first map (world/maps.ts); Training: the training harbour. */
export const VOYAGE_MAP_ID: string | null = TRAINING ? TRAINING_MAP_ID : MODE === 'voyage' ? (new URLSearchParams(globalThis.location?.search ?? '').get('map') ?? 'oban') : null;

import type { WorldState } from '../core/world';

/**
 * The host's world in place of ours, on a crew page (the welcome, each snapshot), keeping the
 * same object (the views and systems hold it). Every part of theirs replaces ours, and a part
 * of ours they haven't got goes (multiplayer study #13: a crew-mate's own Voyage plan and pots
 * stayed on their page after joining, and pressing the plan changed the host's world). The
 * players are the caller's: theirs, with ours put back in.
 */
export function takeWorld(ours: WorldState, theirs: WorldState): void {
  const w = ours as unknown as Record<string, unknown>;
  for (const k of Object.keys(w)) if (k !== 'players' && !(k in theirs)) delete w[k];
  for (const [k, val] of Object.entries(theirs)) if (k !== 'players') w[k] = val;
}

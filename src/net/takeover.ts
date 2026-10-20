import type { WorldState } from '../core/world';
import type { PlayerState } from '../player/playerState';

/**
 * Host handover (owner, Oct 2026): when the host's page dies, the game needn't end. Every
 * crew-mate holds the whole world from the last snapshot, so one of them hosts it on from
 * there under the same game code, and the rest rejoin as they already do when a host is
 * lost (App: the "sent in together" retries). Who: the crew-mate who joined first, by the
 * host's own numbering of players (`player-N`, N in join order), so every page elects the
 * same one without a word between them. The host's own player (their peer id is the room
 * id) is never a candidate: they are the one who has gone.
 */
export function electedHost(world: WorldState, hostPeerId: string): PlayerState | undefined {
  let best: PlayerState | undefined;
  let bestN = Infinity;
  for (const p of Object.values(world.players)) {
    if (p.peerId === hostPeerId) continue;
    const n = Number(/-(\d+)$/.exec(p.id)?.[1] ?? NaN);
    const key = Number.isFinite(n) ? n : Infinity;
    if (key < bestN || (key === bestN && best && p.id < best.id)) {
      best = p;
      bestN = key;
    }
  }
  return best;
}

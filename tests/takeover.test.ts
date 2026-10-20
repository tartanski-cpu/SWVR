/**
 * Host handover (net/takeover.ts; owner, Oct 2026): when the host is lost, every page elects
 * the same crew-mate, the one who joined first, to host the game on; the host's own player
 * is never a candidate.
 */
import { describe, expect, it } from 'vitest';
import { IdFactory } from '../src/core/ids';
import { createWorld } from '../src/core/world';
import { electedHost } from '../src/net/takeover';
import { createPlayerState } from '../src/player/playerState';

describe('host handover', () => {
  it('elects the earliest-joined crew-mate, never the host, the same on every page', () => {
    const { world, localPlayerId } = createWorld(new IdFactory());
    const host = world.players[localPlayerId];
    host.peerId = 'swvr-room-12345';
    const second = createPlayerState('player-2', 'Second');
    const tenth = createPlayerState('player-10', 'Tenth');
    const third = createPlayerState('player-3', 'Third');
    world.players['player-10'] = tenth;
    world.players['player-3'] = third;
    world.players['player-2'] = second;
    expect(electedHost(world, 'swvr-room-12345')?.id).toBe('player-2');
    delete world.players['player-2'];
    expect(electedHost(world, 'swvr-room-12345')?.id).toBe('player-3'); // not player-10 by string order
    delete world.players['player-3'];
    delete world.players['player-10'];
    expect(electedHost(world, 'swvr-room-12345')).toBeUndefined();
  });
});

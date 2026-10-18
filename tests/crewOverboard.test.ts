/**
 * A crew-mate overboard (owner, Oct 2026): they're in the water, someone throws them the
 * life ring, they take it, and the line hauls them in to the boat, where they climb out.
 * Their own game moves their body (it rides with the ring); the host keeps who's in it.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { gearOf } from '../src/boats/sims';
import { ClientSession } from '../src/net/clientSession';
import { HostSession } from '../src/net/hostSession';
import type { PlayerPose } from '../src/net/protocol';
import { LoopbackHost } from '../src/net/transport';
import { createPlayerState } from '../src/player/playerState';
import { vesselToWorld } from '../src/rescue/recovery';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';

const DT = 1 / 60;

function setup() {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, -400, 0); // heading north (-z): the stern to the south (+z)
  const send = (control: string, player: string, opts: { value?: number; args?: number[] } = {}) => {
    const i: Intent = { playerId: player, targetId: v.id, control, value: opts.value ?? 1, args: opts.args };
    stepWorld(world, [i], DT);
  };
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  // A crew-mate in the water, 14 m astern on the starboard quarter.
  const stern = vesselToWorld(v, VESSEL_DEFS[v.defId].rescueGear!.stern);
  const mate = createPlayerState('player-2', 'Mate');
  mate.position = [stern.x + 3, -1.4, stern.z + 14];
  mate.mode = 'swim';
  world.players[mate.id] = mate;
  const ring = () => world.rescue!.ring!;
  return { world, v, send, run, mate, ring, me: localPlayerId };
}

describe('a crew-mate overboard and the life ring', () => {
  it('thrown to them, they take it; while they hold it nobody can take it back; hauled in, it drags them toward the boat', () => {
    const { world, v, send, run, mate, ring, me } = setup();
    send('ringTake', me);
    send('ringThrow', me, { args: [mate.position[0] + 1, 2, mate.position[2], 0, 0, 0] });
    run(1);
    expect(ring().state).toBe('water');
    // Their game sees it within reach and takes it.
    send('ringGrab', mate.id);
    expect(ring().player).toBe(mate.id);
    expect(world.rescue!.shout?.text).toMatch(/Mate has the ring/);
    send('ringTake', me);
    expect(ring().state).toBe('water'); // not snatched out of their hands
    // Hand over hand: the ring comes in toward the cleat (their body follows it in their game).
    const cleat = vesselToWorld(v, gearOf(v, 'lifeRing')!.cleat);
    const far = () => Math.hypot(ring().pos[0] - cleat.x, ring().pos[2] - cleat.z);
    const d0 = far();
    for (let k = 0; k < 6; k++) {
      send('ringPull', me, { value: 1.5 });
      run(0.2);
    }
    expect(far()).toBeLessThan(d0 - 6);
    // Reeled right in with them on it, it isn't stowed out from under them.
    for (let k = 0; k < 20; k++) send('ringPull', me, { value: 5 });
    run(0.5);
    expect(ring().state).toBe('water');
    expect(ring().player).toBe(mate.id);
    // They climb out (aboard): out of the ring, and it goes back on its hook.
    mate.aboardVesselId = v.id;
    run(0.5);
    expect(ring().player).toBeNull();
    expect(ring().state).toBe('stowed');
  });

  it("out of reach they can't take it; letting go frees it; near the stern in gear they shout for neutral", () => {
    const { world, v, send, run, mate, ring, me } = setup();
    send('ringTake', me);
    send('ringThrow', me, { args: [mate.position[0] + 8, 2, mate.position[2], 0, 0, 0] });
    run(1);
    send('ringGrab', mate.id);
    expect(ring().player).toBeFalsy();
    // Closer (they swim to it).
    mate.position[0] = ring().pos[0] - 1;
    mate.position[2] = ring().pos[2];
    send('ringGrab', mate.id);
    expect(ring().player).toBe(mate.id);
    send('ringLetGo', mate.id);
    expect(ring().player).toBeNull();
    send('ringGrab', mate.id);
    // Near her stern with her in gear.
    const stern = vesselToWorld(v, VESSEL_DEFS[v.defId].rescueGear!.stern);
    ring().pos = [stern.x + 0.5, 0, stern.z + 1];
    ring().line = 2;
    send('quickStart', me);
    run(5);
    send('lever', me, { value: 0.2 });
    run(1);
    expect(world.rescue!.shout?.text).toMatch(/neutral/i);
    // Gone from the game: out of the ring.
    delete world.players[mate.id];
    run(0.1);
    expect(ring().player).toBeNull();
    void CONFIG;
  });

  it('crew-mates are told who is in the water: it rides in their pose through the host', async () => {
    const ids = new IdFactory();
    const { world } = createWorld(ids);
    const loop = new LoopbackHost();
    new HostSession(world, ids, loop, '1');
    const c = new ClientSession(loop.client(), 'Mate');
    await new Promise((r) => setTimeout(r, 0));
    const pose: PlayerPose = { name: 'Mate', aboardVesselId: null, position: [0, -1.4, 0], yaw: 0, head: [0, 0.2, 0, 0, 0, 0, 1], left: null, right: null };
    c.sendPose({ ...pose, swimming: true });
    expect(world.players[c.playerId!].avatar!.swimming).toBe(true);
    c.sendPose({ ...pose, swimming: 'yes' } as never);
    expect(world.players[c.playerId!].avatar!.swimming).toBe(false);
  });
});

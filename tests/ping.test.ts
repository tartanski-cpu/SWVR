import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { ENVIRONMENT_ID, IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { ClientSession } from '../src/net/clientSession';
import { HostSession } from '../src/net/hostSession';
import { LoopbackHost } from '../src/net/transport';

describe('pings', () => {
  it('one per player, replaced by their next, gone after their life', () => {
    const { world, vesselId } = createWorld(new IdFactory());
    world.environment.waves = [];
    const ping = (player: string, args: number[], ref?: string) =>
      stepWorld(world, [{ playerId: player, targetId: ENVIRONMENT_ID, control: 'ping', value: 1, args, ref }], 1 / 60);
    ping('a', [10, 0, 20]);
    ping('b', [1, 1, 2], vesselId);
    expect(world.pings!.a.vessel).toBeNull();
    expect(world.pings!.b.vessel).toBe(vesselId);
    ping('a', [30, 0, 40]);
    expect(world.pings!.a.pos).toEqual([30, 0, 40]);
    ping('a', [NaN, 0, 0]); // junk is ignored
    expect(world.pings!.a.pos).toEqual([30, 0, 40]);
    for (let i = 0; i < (CONFIG.ping.life + 0.5) * 60; i++) stepWorld(world, [], 1 / 60);
    expect(Object.keys(world.pings!)).toHaveLength(0);
  });

  it("a crew-mate's ping reaches the host and comes back to everyone in the snapshots", async () => {
    const ids = new IdFactory();
    const { world } = createWorld(ids);
    world.environment.waves = [];
    const loop = new LoopbackHost();
    const host = new HostSession(world, ids, loop, '1');
    const client = new ClientSession(loop.client(), 'Mate', () => 0);
    await new Promise((r) => setTimeout(r, 0));
    client.sendIntents([{ playerId: '', targetId: ENVIRONMENT_ID, control: 'ping', value: 1, args: [5, 0, 5] }]);
    stepWorld(world, host.takeIntents(), 1 / 60);
    host.tick(1);
    expect(client.latest?.pings?.[client.playerId!]?.pos).toEqual([5, 0, 5]);
  });
});

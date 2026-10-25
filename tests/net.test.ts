import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { ClientSession } from '../src/net/clientSession';
import { HostSession } from '../src/net/hostSession';
import type { PlayerPose } from '../src/net/protocol';
import { LoopbackHost } from '../src/net/transport';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function setup() {
  const ids = new IdFactory();
  const { world, localPlayerId, vesselId } = createWorld(ids);
  world.environment.waves = [];
  const loop = new LoopbackHost();
  const host = new HostSession(world, ids, loop, '12345');
  let clock = 0;
  const client = new ClientSession(loop.client(), 'Guest', () => clock);
  await flush();
  return { world, host, client, localPlayerId, vesselId, setClock: (t: number) => (clock = t) };
}

const pose = (aboard: string | null): PlayerPose => ({
  name: 'Bosun',
  aboardVesselId: aboard,
  position: [0.5, 1.2, -0.7],
  yaw: 0.3,
  head: [0.5, 2.9, -0.7, 0, 0, 0, 1],
  left: [0.3, 2.3, -1.0],
  right: null,
});

describe('multiplayer (loopback)', () => {
  it('a joining player gets an id, a body in the host world, and the whole world', async () => {
    const { world, client, localPlayerId } = await setup();
    expect(client.status).toBe('connected');
    expect(client.playerId).toBe('player-2');
    expect(world.players['player-2']).toBeDefined();
    expect(client.latest?.players[localPlayerId]).toBeDefined(); // sees the host
  });

  it('client intents reach the host sim, stamped with the sender', async () => {
    const { world, host, client, vesselId } = await setup();
    client.sendIntents([{ playerId: 'someone-else', targetId: vesselId, control: 'lever', value: 0.4 }]);
    const got = host.takeIntents();
    expect(got).toHaveLength(1);
    expect(got[0].playerId).toBe('player-2');
    stepWorld(world, got, 1 / 60);
    expect(world.vessels[vesselId].controls.lever).toBeCloseTo(0.4);
  });

  it("a client can't move another player", async () => {
    const { host, client, localPlayerId, vesselId } = await setup();
    client.sendIntents([{ playerId: 'player-2', targetId: localPlayerId, control: 'board', value: 1, ref: vesselId }]);
    expect(host.takeIntents()).toHaveLength(0);
  });

  it('poses land in the host world; snapshots carry them back out', async () => {
    const { world, host, client, vesselId } = await setup();
    client.sendPose(pose(vesselId));
    expect(world.players['player-2'].aboardVesselId).toBe(vesselId);
    expect(world.players['player-2'].avatar?.left).toEqual([0.3, 2.3, -1.0]);
    host.tick(0.1);
    expect(client.latest?.players['player-2'].avatar?.head[1]).toBeCloseTo(2.9);
  });

  it('the client renders between snapshots, behind the host clock', async () => {
    const { world, host, client, setClock } = await setup();
    for (let i = 1; i <= 6; i++) {
      for (let k = 0; k < 3; k++) stepWorld(world, [], 1 / 60);
      setClock(i * 0.05);
      host.tick(0.06);
    }
    const t = client.renderTime();
    expect(t).toBeLessThan(world.time);
    expect(t).toBeGreaterThan(world.time - 0.3);
    const br = client.bracket(t)!;
    expect(br.a.time).toBeLessThanOrEqual(t);
    expect(br.b.time).toBeGreaterThanOrEqual(t);
    expect(br.alpha).toBeGreaterThanOrEqual(0);
    expect(br.alpha).toBeLessThanOrEqual(1);
  });

  it("the host changing boat tells the crew which boat to build (they start again in her and join the same code)", async () => {
    const { host, client } = await setup();
    const got: unknown[] = [];
    client.onRestart = (n) => got.push(n);
    host.broadcast({ t: 'restart', boat: 'pilotBoat', fit: 'all' });
    await flush();
    expect(got).toEqual([{ t: 'restart', boat: 'pilotBoat', fit: 'all' }]);
  });

  it('a crew-mate who says goodbye is dropped at once, even if the link still looks open', async () => {
    const { world } = await setup();
    const loop = new LoopbackHost();
    const ids = new IdFactory();
    const host = new HostSession(world, ids, loop, '12345');
    const t = loop.client();
    new ClientSession(t, 'Leaver');
    await flush();
    const ids0 = Object.keys(world.players).length;
    t.send({ t: 'bye' }); // the goodbye alone: no close behind it
    expect(Object.keys(world.players)).toHaveLength(ids0 - 1);
    expect(host.playerCount).toBe(1);
  });

  it('a crew-mate gone quiet (a page closed without saying) is taken out of the world, and back as they were when heard from', async () => {
    const { world, host, client } = await setup();
    client.sendPose(pose(null));
    const before = structuredClone(world.players['player-2']);
    host.tick(CONFIG.net.crewSilentS - 1);
    expect(world.players['player-2']).toBeDefined();
    host.tick(2);
    expect(world.players['player-2']).toBeUndefined(); // no frozen avatar
    client.sendPose(pose(null));
    expect(world.players['player-2']).toEqual(before);
  });

  it('a player who leaves is removed from the world', async () => {
    const { world, client } = await setup();
    expect(world.players['player-2']).toBeDefined();
    client.close();
    expect(world.players['player-2']).toBeUndefined();
  });
});

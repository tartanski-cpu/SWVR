import { describe, expect, it } from 'vitest';
import type { PlayerPose } from '../src/net/protocol';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { ClientSession } from '../src/net/clientSession';
import { HostSession } from '../src/net/hostSession';
import { LoopbackHost } from '../src/net/transport';
import { dipstickReading } from '../src/vessel/maintenance';
import { placeVessel } from '../src/vessel/vesselControl';
import { CONFIG } from '../src/config';
import { BERTHS } from '../src/world/archipelago';

const DT = 1 / 60;
const MT = CONFIG.vessels.workboat.maintenance;

function setup(x = 0, z = -2600) {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  placeVessel(v, x, 0, z, 0);
  const send = (control: string, value: number) => stepWorld(world, [{ playerId: localPlayerId, targetId: v.id, control, value } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  const duty = (kind: string) => world.duties?.items.find((d) => d.kind === kind && d.doneAt === undefined);
  return { world, v, send, run, duty, localPlayerId };
}

describe('transit jobs', () => {
  it('fenders out coming alongside, and in again once clear', () => {
    const b = BERTHS[0];
    const { v, send, run, duty } = setup(b.x - 120, b.z);
    send('quickStart', 1);
    run(10);
    const out = duty('fendersOut')!;
    expect(out).toBeTruthy();
    send('fenders', 1);
    run(0.1);
    expect(out.doneAt).toBeDefined();
    // Away from the harbour under way with them still out.
    placeVessel(v, 0, 0, -2600, 0);
    v.linearVelocity = [0, 0, -3];
    run(0.05);
    const inn = duty('fendersIn')!;
    expect(inn).toBeTruthy();
    send('fenders', 0);
    run(0.1);
    expect(inn.doneAt).toBeDefined();
  });

  it('oil: a check falls due; the dipstick reads it; low oil wants a top-up', () => {
    const { v, send, run, duty } = setup();
    send('quickStart', 1);
    run(10);
    expect(v.engine.oil!).toBeLessThan(MT.oilStart); // burning a little
    send('debugOil', 0.3); // low, and a check due
    run(0.1);
    const d = duty('oil')!;
    expect(d).toBeTruthy();
    expect(dipstickReading(v)).toBe('low');
    send('dipstick', 1);
    run(0.1);
    expect(d.steps[0].done).toBe(true);
    expect(d.doneAt).toBeUndefined(); // still low: top up first
    send('oilTopUp', 1);
    run(0.1);
    expect(v.engine.oil!).toBeGreaterThan(0.9);
    expect(d.doneAt).toBeDefined();
  });
});

describe('multiplayer: tools', () => {
  it('a held tool reaches the others', async () => {
    const ids = new IdFactory();
    const { world } = createWorld(ids);
    const loop = new LoopbackHost();
    new HostSession(world, ids, loop, '1');
    const c = new ClientSession(loop.client(), 'Mate');
    await new Promise((r) => setTimeout(r, 0));
    // The client holds the pencil: the host's world shows it in their hand.
    c.sendPose({ name: 'Mate', aboardVesselId: null, position: [0, 0, 0], yaw: 0, head: [0, 1.7, 0, 0, 0, 0, 1], left: null, right: [0.3, 1.2, 0], tool: { kind: 'pencil', hand: 'right' } });
    expect(world.players[c.playerId!].avatar!.tool).toEqual({ kind: 'pencil', hand: 'right' });
    // The laser pointer rides in the pose too; junk is dropped, letting go clears it.
    const pose: PlayerPose = { name: 'Mate', aboardVesselId: null, position: [0, 0, 0], yaw: 0, head: [0, 1.7, 0, 0, 0, 0, 1], left: null, right: null };
    c.sendPose({ ...pose, laser: [0, 1.4, 0, 5, 0, -20, true] });
    expect(world.players[c.playerId!].avatar!.laser).toEqual([0, 1.4, 0, 5, 0, -20, true]);
    c.sendPose({ ...pose, laser: [0, 1, 0, Number.NaN, 0, 0, true] } as never);
    expect(world.players[c.playerId!].avatar!.laser).toBeNull();
    c.sendPose({ ...pose, laser: null });
    expect(world.players[c.playerId!].avatar!.laser).toBeNull();
  });
});

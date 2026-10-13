import { describe, expect, it } from 'vitest';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { HostSession } from '../src/net/hostSession';
import { ClientSession } from '../src/net/clientSession';
import { LoopbackHost } from '../src/net/transport';

function setup() {
  const ids = new IdFactory();
  const { world, vesselId } = createWorld(ids);
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  const act = (playerId: string, control: string, value: number, ref?: string) => {
    const i: Intent = { playerId, targetId: vesselId, control, value, ref };
    stepWorld(world, [i], 1 / 60);
  };
  return { world, v, act, ids };
}

describe('control ownership (multiplayer)', () => {
  it('the first hand on the lever keeps it; the other player is ignored until it lets go', () => {
    const { v, act } = setup();
    act('a', 'hold', 1, 'lever');
    act('b', 'hold', 1, 'lever'); // too late
    expect(v.holds.lever).toBe('a');
    act('b', 'lever', 0.8);
    expect(v.controls.lever).toBe(0);
    act('a', 'lever', 0.3);
    expect(v.controls.lever).toBeCloseTo(0.3);
    act('b', 'hold', 0, 'lever'); // can't release someone else's hold
    expect(v.holds.lever).toBe('a');
    act('a', 'hold', 0, 'lever');
    act('b', 'lever', -0.5);
    expect(v.controls.lever).toBeCloseTo(-0.5);
  });

  it('the joystick hold covers both pan and tilt; buttons are never held', () => {
    const { v, act } = setup();
    act('a', 'hold', 1, 'spotPan');
    act('b', 'spotTilt', 5);
    act('b', 'spotPan', 40);
    expect(v.controls.spotTilt).toBe(-4);
    expect(v.controls.spotPan).toBe(0);
    act('b', 'hold', 1, 'horn');
    expect(v.holds.horn).toBeUndefined();
    act('b', 'navLights', 1); // anyone can press a switch
    expect(v.controls.navLights).toBe(1);
  });

  it("a player who leaves lets go of what they held", async () => {
    const ids = new IdFactory();
    const { world, vesselId } = createWorld(ids);
    const loop = new LoopbackHost();
    const host = new HostSession(world, ids, loop, '1');
    const transport = loop.client();
    const client = new ClientSession(transport, 'Mate');
    await new Promise((r) => setTimeout(r, 0));
    client.sendIntents([{ playerId: '', targetId: vesselId, control: 'hold', value: 1, ref: 'helm' }]);
    stepWorld(world, host.takeIntents(), 1 / 60);
    expect(world.vessels[vesselId].holds.helm).toBe(client.playerId);
    transport.close();
    expect(world.vessels[vesselId].holds.helm).toBeUndefined();
  });
});

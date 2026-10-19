import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { shouldCall, voiceRoute } from '../src/net/voice';
import { vrFlySpeed, vrFlyStep } from '../src/player/vrFly';
import { HostSession } from '../src/net/hostSession';
import { ClientSession } from '../src/net/clientSession';
import { LoopbackHost } from '../src/net/transport';
import { createWorld } from '../src/core/world';
import { IdFactory } from '../src/core/ids';
import type { PlayerPose } from '../src/net/protocol';

const c = CONFIG.voice;

describe('crew voice: who hears whom', () => {
  it('proximity: full close by, fading to nothing a couple of dozen metres off', () => {
    expect(voiceRoute(1, false, false).near).toBe(1);
    const mid = voiceRoute((c.nearFull + c.nearMax) / 2, false, false).near;
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
    expect(voiceRoute(c.nearMax + 1, false, false).near).toBe(0);
  });

  it('the VHF: heard only while they talk, within range, not while we talk too', () => {
    expect(voiceRoute(3000, false, false).radio).toBe(0);
    expect(voiceRoute(3000, true, false).radio).toBeGreaterThan(0);
    expect(voiceRoute(3000, true, false).near).toBe(0);
    expect(voiceRoute(c.radioRange + 10, true, false).radio).toBe(0);
    expect(voiceRoute(100, true, true).radio).toBe(0);
  });

  it('a hiss comes up only towards the edge of the range', () => {
    expect(voiceRoute(c.radioRange * 0.3, true, false).hiss).toBe(0);
    expect(voiceRoute(c.radioRange * 0.95, true, false).hiss).toBeGreaterThan(0.5);
  });

  it('of each pair exactly one calls', () => {
    const ids = ['swvr-room-12345', 'a1b2', 'zz9', 'k-77'];
    for (const a of ids) for (const b of ids) if (a !== b) expect(shouldCall(a, b) !== shouldCall(b, a)).toBe(true);
  });
});

describe('crew voice: the host passes on network ids and radios', () => {
  it('a joining player gets their network id; their radio pose is checked', async () => {
    const ids = new IdFactory();
    const { world } = createWorld(ids);
    const t = new LoopbackHost();
    const host = new HostSession(world, ids, t, '12345');
    const client = new ClientSession(t.client(), 'Crew');
    await new Promise((r) => setTimeout(r, 0));
    const id = client.playerId!;
    expect(world.players[id].peerId).toBe('loop-1');
    const pose: PlayerPose = { name: 'Crew', aboardVesselId: null, position: [0, 0, 0], yaw: 0, head: [0, 1.6, 0, 0, 0, 0, 1], left: null, right: null };
    client.sendPose({ ...pose, radio: { hand: 'left', tx: true } });
    expect(world.players[id].avatar?.radio).toEqual({ hand: 'left', tx: true });
    client.sendPose({ ...pose, radio: { hand: 'elbow' as never, tx: 'yes' as never } });
    expect(world.players[id].avatar?.radio).toEqual({ hand: null, tx: false });
    host.close();
  });
});

describe('the host hears which build a crew-mate has', () => {
  it('another build than the host\'s is reported; the same, or a dev page, is not', async () => {
    const seen: string[] = [];
    const make = async (ours: string, theirs: string | undefined) => {
      const ids = new IdFactory();
      const { world } = createWorld(ids);
      world.build = { ...(world.build ?? {}), app: ours } as typeof world.build;
      const t = new LoopbackHost();
      const host = new HostSession(world, ids, t, '1');
      host.onOtherBuild = (name, b) => seen.push(`${name}:${b}`);
      new ClientSession(t.client(), 'Crew', undefined, theirs);
      await new Promise((r) => setTimeout(r, 0));
      host.close();
    };
    await make('NEXT aaa', 'NEXT bbb');
    expect(seen).toEqual(['Crew:NEXT bbb']);
    await make('NEXT aaa', 'NEXT aaa');
    await make('dev', 'NEXT bbb');
    await make('NEXT aaa', undefined);
    expect(seen).toHaveLength(1);
  });
});

describe('VR fly', () => {
  it('one trigger fast, both very fast', () => {
    const f = CONFIG.vrFly;
    expect(vrFlySpeed(0, 0)).toBe(f.speed);
    expect(vrFlySpeed(1, 0)).toBe(f.speed * f.fast);
    expect(vrFlySpeed(0, 0.9)).toBe(f.speed * f.fast);
    expect(vrFlySpeed(1, 1)).toBe(f.speed * f.veryFast);
  });

  it('flies where you look, up and down too', () => {
    const up45 = { x: 0, y: Math.SQRT1_2, z: -Math.SQRT1_2 };
    const d = vrFlyStep(0, 1, up45, { x: 1, y: 0, z: 0 }, 10, 1);
    expect(d.y).toBeCloseTo(7.07, 2);
    expect(d.z).toBeCloseTo(-7.07, 2);
    const side = vrFlyStep(1, 0, up45, { x: 1, y: 0, z: 0 }, 10, 0.5);
    expect(side).toEqual({ x: 5, y: 0, z: 0 });
  });
});

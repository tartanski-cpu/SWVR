import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { beachSpots, logOf, salvageStatus } from '../src/salvage/salvage';
import { towReach } from '../src/tow/tow';
import { placeVessel } from '../src/vessel/vesselControl';
import { PORTS } from '../src/world/archipelago';
import { groundHeight } from '../src/world/terrain';

const DT = 1 / 60;

function setup() {
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  const send = (control: string, value = 1, ref?: string, targetId = v.id) => stepWorld(world, [{ playerId: 'player-1', targetId, control, value, ref } as Intent], DT);
  const run = (s: number, each?: () => void) => {
    for (let i = 0; i < s / DT; i++) {
      stepWorld(world, [], DT);
      each?.();
    }
  };
  return { world, v, send, run };
}

describe('log salvage', { timeout: 60000 }, () => {
  it('beach spots: just above the water, deep water within reach, away from ports', () => {
    const spots = beachSpots();
    expect(spots.length).toBeGreaterThan(20);
    for (const b of spots) {
      const g = groundHeight(b.x, b.z);
      expect(g).toBeGreaterThan(0);
      expect(g).toBeLessThan(1.1);
      for (const p of PORTS) expect(Math.hypot(p.x - b.x, p.z - b.z)).toBeGreaterThan(CONFIG.salvage.portClear - 1);
    }
  });

  it('a log on a beach: made fast, pulled off under power, towed into harbour and sold', () => {
    const { world, v, send, run } = setup();
    // The spot on the open shore that's furthest from anything, a log on it.
    const b = beachSpots()[Math.floor(beachSpots().length / 2)];
    placeVessel(v, b.x, 0, b.z, 0);
    send('salvageDebugNear', 1, undefined, 'env');
    const log = world.salvage!.logs[0];
    expect(log).toBeDefined();
    expect(log.afloat).toBe(false);
    // Lie off the beach, stern to it: bow pointing out to sea along the bearing from the island.
    const a = b.yaw - Math.PI / 2; // bearing from the island centre out through the spot
    const out = [Math.sin(a), -Math.cos(a)];
    const off = 26;
    placeVessel(v, log.x + out[0] * off, 0, log.z + out[1] * off, (a * 180) / Math.PI);
    run(2);
    expect(towReach(world, `l:${log.id}`)).toBeLessThan(CONFIG.salvage.line.attach);
    send('towMake', 1, `l:${log.id}`);
    expect(world.tow!.line?.target).toBe(`l:${log.id}`);
    expect(salvageStatus(world)).toMatch(/beach/);
    // Ease ahead: the log stays put until the pull beats friction, then slides off and floats.
    send('engineStartStop');
    run(3);
    send('lever', 0.8);
    let maxT = 0;
    run(90, () => (maxT = Math.max(maxT, world.tow?.line?.tension ?? 0)));
    expect(maxT).toBeGreaterThan(CONFIG.salvage.frictionStatic * CONFIG.salvage.mass * 9.81);
    expect(logOf(world, `l:${log.id}`)?.afloat).toBe(true);
    expect(world.tow!.line?.target).toBe(`l:${log.id}`); // the line held
    // Into a harbour, stopped: sold.
    send('lever', 0);
    const port = PORTS.find((p) => p.id === 'calder')!;
    placeVessel(v, port.x, 0, port.z - 25, 0);
    log.x = port.x;
    log.z = port.z;
    log.vel = [0, 0];
    run(CONFIG.tow.deliverTime + 1);
    expect(world.salvage!.logs.length).toBe(0);
    expect(world.salvage!.sold).toBe(1);
    expect(world.tow!.line ?? null).toBeNull();
  });

  it('logs wash up by themselves (with a radio notice), far from the boat', () => {
    const { world, v, run } = setup();
    world.salvage!.spawn = true;
    placeVessel(v, 0, 0, -400, 0);
    world.salvage!.nextAt = world.time + 0.5;
    run(1);
    const log = world.salvage!.logs[0];
    expect(log).toBeDefined();
    expect(Math.hypot(log.x - v.position[0], log.z - v.position[2])).toBeGreaterThan(CONFIG.salvage.minDistance);
    expect(world.rescue!.radio?.text).toMatch(/timber/);
  });
});

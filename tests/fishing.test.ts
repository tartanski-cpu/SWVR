import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { aboard, GROUND, stackPoint } from '../src/cargo/cargo';
import { fishingStatus, trawlForces } from '../src/fishing/fishing';
import { placeVessel } from '../src/vessel/vesselControl';
import { FISHING_GROUNDS, PORTS } from '../src/world/archipelago';
import { startEngine } from './helpers/engine';

const DT = 1 / 60;
const ground = FISHING_GROUNDS[1];

function setup() {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  startEngine(world, v); // the net drum is hydraulic
  const send = (control: string, value = 1, ref?: string, targetId = v.id, args?: number[]) =>
    stepWorld(world, [{ playerId: localPlayerId, targetId, control, value, ref, args } as Intent], DT);
  /** Run with her held at a speed northward (the test drives her, not the engine). */
  const run = (s: number, speed = 0) => {
    for (let i = 0; i < s / DT; i++) {
      v.linearVelocity = [0, 0, -speed];
      v.angularVelocity = [0, 0, 0];
      stepWorld(world, [], DT);
    }
  };
  return { world, v, send, run, localPlayerId };
}

describe('fishing', { timeout: 60000 }, () => {
  it('shoot the trawl, tow it in a ground at 2-4 kn: boxes of fish come aboard; haul it in', () => {
    const { world, v, send, run } = setup();
    placeVessel(v, ground.x, 0, ground.z + 100, 0);
    send('trawl', 1);
    run(CONFIG.fishing.shootTime + 0.5, 1.5);
    expect(world.fishing!.net).toBe('down');
    const per = CONFIG.fishing.boxEvery / ground.richness;
    run(per + 1, 1.5);
    expect(fishingStatus(world)).toMatch(/Trawling on Skerry Ground/);
    const fish = aboard(world, v.id).filter((c) => c.from === 'trawl');
    expect(fish.length).toBe(1);
    expect(world.fishing!.caught).toBe(1);
    // The net drags on her: a few kN at 3 kn, against her motion.
    const f = trawlForces(world).get(v.id)![0].force;
    expect(f.z).toBeGreaterThan(2000);
    send('trawl', 0);
    run(CONFIG.fishing.haulTime + 0.5);
    expect(world.fishing!.net).toBe('stowed');
    expect(trawlForces(world).size).toBe(0);
  });

  it('nothing too slow, too fast or outside a ground; shallow water fouls the net until hauled', () => {
    const { world, v, send, run } = setup();
    placeVessel(v, ground.x, 0, ground.z, 0);
    send('trawl', 1);
    run(CONFIG.fishing.shootTime + 0.5, 1.5);
    const f0 = world.fishing!.fill;
    run(5, 0.3);
    expect(world.fishing!.status).toBe('slow');
    expect(world.fishing!.fill).toBe(f0);
    run(5, 3);
    expect(world.fishing!.status).toBe('fast');
    const before = world.fishing!.fill;
    placeVessel(v, 0, 0, -1500, 0);
    run(5, 1.5);
    expect(world.fishing!.status).toBe('outside');
    expect(world.fishing!.fill).toBe(before); // nothing caught out there
    // Into the shallows off Calder: fouled, and it stays fouled while down.
    const calder = PORTS.find((p) => p.id === 'calder')!;
    placeVessel(v, calder.x + 10, 0, calder.z, 0);
    run(1, 1.5);
    expect(world.fishing!.status).toBe('fouled');
    expect(fishingStatus(world)).toMatch(/fouled/);
    placeVessel(v, ground.x, 0, ground.z, 0);
    run(2, 1.5);
    expect(world.fishing!.status).toBe('fouled');
    send('trawl', 0);
    run(CONFIG.fishing.haulTime + 0.5);
    expect(world.fishing!.status).toBe('stowed');
  });

  it('a box of fish carried ashore to any goods stack is landed', () => {
    const { world, v, send, run, localPlayerId } = setup();
    placeVessel(v, ground.x, 0, ground.z, 0);
    send('trawl', 1);
    run(CONFIG.fishing.shootTime + CONFIG.fishing.boxEvery / ground.richness + 1, 1.5);
    const box = aboard(world, v.id).find((c) => c.from === 'trawl')!;
    expect(box).toBeDefined();
    const port = PORTS.find((p) => p.id === 'brannock')!;
    const [x, y, z] = stackPoint(port, 0);
    send('cargoTake', 1, box.id);
    send('cargoPlace', 1, box.id, GROUND, [x, y, z, 0]);
    expect(world.cargo[box.id]).toBeUndefined();
    expect(world.fishing!.landed).toBe(1);
    void localPlayerId;
  });

  it('by hand on the gallows: out or in while held, stopping part way; the TRAWL switch then hauls it all in', () => {
    const { world, v, send, run } = setup();
    placeVessel(v, ground.x, 0, ground.z + 100, 0);
    const c = CONFIG.fishing;
    send('netOut', 1);
    run(c.shootTime / 2, 1.5);
    send('netOut', 0);
    const f = world.fishing!;
    expect(f.net).toBe('held');
    expect(f.t).toBeCloseTo(0.5, 1);
    expect(v.controls.trawl).toBe(1); // the switch follows: net out
    run(5, 1.5);
    expect(f.t).toBeCloseTo(0.5, 1); // stopped where it was
    expect(fishingStatus(world)).toMatch(/50 % out, stopped/);
    expect(trawlForces(world).get(v.id)).toBeTruthy(); // part out, it drags
    expect(f.caught).toBe(0); // and doesn't fish
    // All the way out by hand: fishing.
    send('netOut', 1);
    run(c.shootTime / 2 + 0.5, 1.5);
    send('netOut', 0);
    expect(f.net).toBe('down');
    // A bit back in by hand, then the console switch off: hauled all the way in.
    send('netIn', 1);
    run(1, 1.5);
    send('netIn', 0);
    expect(f.net).toBe('held');
    send('trawl', 0);
    run(c.haulTime + 0.5, 1.5);
    expect(f.net).toBe('stowed');
    expect(f.t).toBe(0);
  });
  it('with the net out, a good part of the lever is trawling speed (not just a sliver past idle)', () => {
    const { world, v, send } = setup();
    const c = CONFIG.fishing;
    placeVessel(v, ground.x, 0, ground.z + 100, 0);
    send('trawl', 1);
    /** Steady speed (m/s) at a lever setting, the engine driving her with the net held fully out. */
    const steady = (lever: number) => {
      v.controls.lever = lever;
      for (let i = 0; i < 45 / DT; i++) {
        world.fishing!.t = 1;
        world.fishing!.net = 'down';
        stepWorld(world, [], DT);
      }
      return Math.hypot(v.linearVelocity[0], v.linearVelocity[2]);
    };
    expect(steady(0.1)).toBeLessThan(c.minSpeed + 0.1); // idling in gear: about the bottom of the window
    for (const lever of [0.2, 0.35, 0.5]) {
      const sp = steady(lever);
      expect(sp).toBeGreaterThan(c.minSpeed);
      expect(sp).toBeLessThan(c.maxSpeed);
    }
  });
});


import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { aboard, GROUND, stackPoint } from '../src/cargo/cargo';
import { codendPayload, fishingStatus, trawlForces } from '../src/fishing/fishing';
import { codendAt } from '../src/fishing/codend';
import { gearOf } from '../src/boats/sims';
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
  it('shoot the trawl, tow it in a ground at 2-4 kn: the catch builds up in the codend; haul it, the codend swung aboard; RELEASE empties it on deck, boxed a box at a time; the net stowed', () => {
    const { world, v, send, run } = setup();
    const c = CONFIG.fishing;
    placeVessel(v, ground.x, 0, ground.z + 100, 0);
    send('trawl', 1);
    run(c.shootTime + 0.5, 1.5);
    const f = world.fishing!;
    expect(f.net).toBe('down');
    const per = c.boxEvery / ground.richness;
    run(2 * per + 1, 1.5);
    expect(fishingStatus(world)).toMatch(/Trawling on Skerry Ground: .*2 boxes in the codend/);
    // In the net, not on deck.
    expect(f.catch).toHaveLength(2);
    expect(f.caught).toBe(2);
    expect(aboard(world, v.id).filter((c) => c.from === 'trawl')).toHaveLength(0);
    // The net drags on her: a few kN at 3 kn, against her motion.
    const drag = trawlForces(world).get(v.id)![0].force;
    expect(drag.z).toBeGreaterThan(2000);
    // Hauled: the warps in, then the net up the stern and the codend swung in over the deck.
    send('trawl', 0);
    run(c.haulTime + 0.5);
    expect(f.net).toBe('lifting');
    expect(trawlForces(world).size).toBe(0);
    run(c.liftTime + 0.5);
    expect(f.net).toBe('aboard');
    expect(v.aFrameLuff).toBeCloseTo(1, 6);
    expect(fishingStatus(world)).toMatch(/Codend aboard with 2 boxes of fish: RELEASE/);
    // Its weight hangs on her, over her deck now, inboard of the A-frame's feet.
    const af = gearOf(v, 'trawlGantry')!;
    const hanging = codendPayload(world, v.id);
    expect(hanging).toHaveLength(1);
    expect(hanging[0].mass).toBeCloseTo(2 * CONFIG.cargo.kinds.find((k) => k.name === 'Fish box')!.mass, 6);
    expect(hanging[0].pos.z).toBeLessThan(af.footZ);
    expect(codendAt(af, 1)[2]).toBeLessThan(af.footZ);
    // RELEASE: on deck, then boxed a box every boxTime s; the empty net stowed and the A-frame swung back out.
    send('netRelease', 1);
    expect(f.catch).toHaveLength(0);
    expect(f.pile).toHaveLength(2);
    expect(codendPayload(world, v.id)).toHaveLength(0);
    run(c.boxTime + 0.1);
    expect(aboard(world, v.id).filter((it) => it.from === 'trawl')).toHaveLength(1);
    run(c.boxTime + 0.1);
    const boxes = aboard(world, v.id).filter((it) => it.from === 'trawl');
    expect(boxes).toHaveLength(2);
    expect(boxes[0].species).toBe(ground.species);
    expect(f.pile).toHaveLength(0);
    run(c.stowTime);
    expect(f.net).toBe('stowed');
    expect(v.aFrameLuff).toBeCloseTo(0, 6);
  });

  it('the codend holds only so much: full, it stops fishing until hauled; shot again from aboard, what is in it goes back out with it', () => {
    const { world, v, send, run } = setup();
    const c = CONFIG.fishing;
    placeVessel(v, ground.x, 0, ground.z + 100, 0);
    send('trawl', 1);
    run(c.shootTime + 0.5, 1.5);
    const f = world.fishing!;
    f.catch = Array.from({ length: c.codendBoxes }, () => 'cod');
    run(2, 1.5);
    expect(f.status).toBe('full');
    expect(f.catch).toHaveLength(c.codendBoxes);
    expect(fishingStatus(world)).toMatch(/Codend full/);
    send('trawl', 0);
    run(c.haulTime + c.liftTime + 1);
    expect(f.net).toBe('aboard');
    send('trawl', 1);
    run(c.liftTime + c.shootTime + 1, 1.5);
    expect(f.net).toBe('down');
    expect(f.lift).toBe(0);
    expect(f.catch).toHaveLength(c.codendBoxes);
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
    // (Hauled, up the stern, nothing in it: stowed.)
    run(CONFIG.fishing.haulTime + CONFIG.fishing.liftTime + CONFIG.fishing.stowTime + 0.5);
    expect(world.fishing!.status).toBe('stowed');
  });

  it('a box of fish carried ashore to any goods stack is landed', () => {
    const { world, v, send, run, localPlayerId } = setup();
    placeVessel(v, ground.x, 0, ground.z, 0);
    send('trawl', 1);
    run(CONFIG.fishing.shootTime + CONFIG.fishing.boxEvery / ground.richness + 1, 1.5);
    send('trawl', 0);
    run(CONFIG.fishing.haulTime + CONFIG.fishing.liftTime + 0.5);
    send('netRelease', 1);
    run(CONFIG.fishing.boxTime + 0.1);
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
    run(c.haulTime + c.liftTime + c.stowTime + 0.5, 1.5);
    expect(f.net).toBe('stowed');
    expect(f.t).toBe(0);
    expect(f.lift).toBe(0);
  });

  it('by hand: HAUL with the warps in brings the net up the stern and aboard; PAY OUT lowers it back first', () => {
    const { world, v, send, run } = setup();
    const c = CONFIG.fishing;
    placeVessel(v, ground.x, 0, ground.z + 100, 0);
    send('netOut', 1);
    run(c.shootTime + 0.5, 1.5);
    send('netOut', 0);
    const f = world.fishing!;
    expect(f.net).toBe('down');
    send('netIn', 1);
    run(c.haulTime + c.liftTime / 2, 1.5);
    send('netIn', 0);
    expect(f.t).toBe(0);
    expect(f.lift).toBeCloseTo(0.5, 1);
    expect(f.net).toBe('held');
    expect(fishingStatus(world)).toMatch(/up the stern, stopped/);
    send('netOut', 1);
    run(c.liftTime / 2 + 0.5, 1.5);
    expect(f.lift).toBe(0);
    expect(f.t).toBeGreaterThan(0); // and on out
    send('netOut', 0);
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


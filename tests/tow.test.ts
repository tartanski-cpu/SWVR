import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import type { Intent } from '../src/core/intents';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { placeVessel } from '../src/vessel/vesselControl';
import { TOW_DEFS, VESSEL_DEFS } from '../src/vessel/vesselDef';
import { createVesselState } from '../src/vessel/vesselState';
import { towReach, towStatus, towVessel } from '../src/tow/tow';
import { runStatus } from '../src/rescue/rescue';
import { PORTS } from '../src/world/archipelago';
import { ClientSession } from '../src/net/clientSession';
import { HostSession } from '../src/net/hostSession';
import { LoopbackHost } from '../src/net/transport';

const DT = 1 / 60;

function setup(calls = false) {
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  world.tow!.calls = calls;
  const v = world.vessels[vesselId];
  const send = (control: string, value = 1, ref?: string) => {
    const intent: Intent = { playerId: 'player-1', targetId: v.id, control, value, ref };
    stepWorld(world, [intent], DT);
  };
  const run = (s: number, each?: () => void) => {
    for (let i = 0; i < s / DT; i++) {
      stepWorld(world, [], DT);
      each?.();
    }
  };
  return { world, v, send, run };
}

/** Heel and trim (deg) from a vessel's orientation. */
function attitude(o: number[]): { heel: number; trim: number } {
  const [x, y, z, w] = o;
  // Up vector in world: the y column of the rotation.
  const ux = 2 * (x * y - w * z);
  const uy = 1 - 2 * (x * x + z * z);
  const uz = 2 * (y * z + w * x);
  return { heel: (Math.atan2(Math.hypot(ux, 0), uy) * 180) / Math.PI, trim: (Math.atan2(Math.abs(uz), uy) * 180) / Math.PI };
}

describe('towing missions', { timeout: 30000 }, () => {
  it('every towable hull floats upright and level at about her DWL', () => {
    const { world, run } = setup();
    TOW_DEFS.forEach((id, i) => {
      const s = createVesselState(`t-${id}`, id);
      placeVessel(s, i * 40, 0.1, -400, 0);
      world.vessels[s.id] = s;
    });
    run(25);
    for (const id of TOW_DEFS) {
      const s = world.vessels[`t-${id}`];
      const a = attitude(s.orientation);
      expect(a.heel, id).toBeLessThan(1.5);
      expect(a.trim, id).toBeLessThan(1.5);
      expect(Math.abs(s.position[1]), id).toBeLessThan(0.15);
      expect(VESSEL_DEFS[id].tow?.name).toBeTruthy();
    }
  });

  it('out of harbour a call comes by itself; the handset takes it; unanswered it goes away', () => {
    const { world, v, send, run } = setup(true);
    placeVessel(v, 0, 0, -400, 0);
    run(0.5);
    // The first call is due 4-9 minutes in; skip the wait (simulating it is slow on CI).
    expect(world.tow!.nextAt).toBeGreaterThanOrEqual(CONFIG.tow.every[0]);
    world.tow!.nextAt = world.time + 0.5;
    run(1);
    const job = world.tow!.job!;
    expect(job.phase).toBe('calling');
    expect(world.vessels[job.vesselId]).toBeTruthy();
    expect(world.rescue!.radio?.text).toMatch(/Tow wanted/);
    expect(runStatus(world)).toMatch(/pick up the handset/);
    send('rescueHandset', 1);
    expect(job.phase).toBe('accepted');
    // A second job: let it ring out; the tow is taken away.
    send('towDebugEnd');
    expect(world.tow!.job).toBeNull();
    send('towDebugCall', 1, 'barge');
    const id = world.tow!.job!.vesselId;
    expect(world.vessels[id].defId).toBe('barge');
    // Two minutes unanswered (skipped, as above).
    world.tow!.job!.callT = world.time - CONFIG.tow.callTimeout - 0.5;
    run(0.5);
    expect(world.tow!.job).toBeNull();
    expect(world.vessels[id]).toBeUndefined();
  });

  it('made fast, we tow her: she follows on a taut line that holds at towing speed', () => {
    const { world, v, send, run } = setup();
    placeVessel(v, 0, 0, -400, 0);
    run(1);
    send('towDebugNear', 1, 'derelict');
    const job = world.tow!.job!;
    expect(job.phase).toBe('accepted');
    expect(towReach(world)).toBeLessThan(CONFIG.tow.attachRange);
    send('towMake');
    expect(job.fast).toBe(true);
    expect(towStatus(world)).toMatch(/Towing/);
    send('engineStartStop');
    run(3);
    send('lever', 0.6);
    let maxReach = 0;
    run(60, () => (maxReach = Math.max(maxReach, towReach(world))));
    const tow = towVessel(world)!;
    expect(job.fast).toBe(true);
    // Under way together, northward (-z), the line taut but not snapping.
    expect(-tow.linearVelocity[2]).toBeGreaterThan(1.5);
    expect(job.tension).toBeGreaterThan(100);
    expect(maxReach).toBeLessThan(CONFIG.tow.lineLength + 6);
    // Cast off: no more pull.
    send('towCast');
    run(1);
    expect(job.tension).toBe(0);
  });

  it('too far off to make fast; a snatch parts the line', () => {
    const { world, v, send, run } = setup();
    placeVessel(v, 0, 0, -400, 0);
    run(1);
    send('towDebugNear', 1, 'barge');
    const tow = towVessel(world)!;
    // Out of range: nothing.
    placeVessel(tow, tow.position[0], 0, tow.position[2] + 40, 0);
    send('towMake');
    expect(world.tow!.job!.fast).toBe(false);
    // Back in range, made fast, then yanked away hard.
    placeVessel(tow, tow.position[0], 0, tow.position[2] - 40, 0);
    run(0.5);
    send('towMake');
    expect(world.tow!.job!.fast).toBe(true);
    tow.linearVelocity = [0, 0, 12];
    run(4);
    expect(world.tow!.job!.fast).toBe(false);
    expect(world.rescue!.radio?.text).toMatch(/parted/);
  });

  it('slow in a port it is delivered, counted and logged; the harbour takes it away soon after', () => {
    const { world, v, send, run } = setup();
    placeVessel(v, 0, 0, -400, 0);
    run(1);
    send('towDebugNear', 1, 'logRaft');
    const job = world.tow!.job!;
    const tow = towVessel(world)!;
    const port = PORTS.find((p) => p.id === 'calder')!;
    const before = world.rescue!.completed;
    placeVessel(tow, port.x, 0, port.z, 0);
    run(CONFIG.tow.deliverTime + 1);
    expect(job.phase).toBe('delivered');
    expect(world.tow!.delivered).toBe(1);
    expect(world.rescue!.completed).toBe(before + 1);
    expect(world.rescue!.lastDone).toMatch(/Tow/);
    expect(world.log?.events.some((e) => e.type === 'rescue')).toBe(true);
    // Still there for a moment (even with us right beside her), then gone, and the job is over.
    placeVessel(v, port.x + 30, 0, port.z, 0);
    run(1);
    expect(world.vessels[job.vesselId]).toBeDefined();
    run(CONFIG.tow.removeAfter);
    expect(world.tow!.job).toBeNull();
    expect(world.vessels[job.vesselId]).toBeUndefined();
  });

  it('multiplayer: the tow and its line reach the crew; a crew-mate can make fast', async () => {
    const ids = new IdFactory();
    const { world, vesselId } = createWorld(ids);
    world.environment.waves = [];
    const loop = new LoopbackHost();
    const host = new HostSession(world, ids, loop, '1');
    const c = new ClientSession(loop.client(), 'Mate');
    await new Promise((r) => setTimeout(r, 0));
    placeVessel(world.vessels[vesselId], 0, 0, -400, 0);
    stepWorld(world, [{ playerId: c.playerId!, targetId: vesselId, control: 'towDebugNear', value: 1, ref: 'barge' }], DT);
    // The client's intent goes to the host like any other.
    c.sendIntents([{ playerId: c.playerId!, targetId: vesselId, control: 'towMake', value: 1 }]);
    for (const i of host.takeIntents()) stepWorld(world, [i], DT);
    host.tick(1);
    const job = c.latest!.tow!.job!;
    expect(job.fast).toBe(true);
    expect(c.latest!.vessels[job.vesselId].defId).toBe('barge');
  });
});

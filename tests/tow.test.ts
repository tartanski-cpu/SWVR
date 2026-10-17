import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import type { Intent } from '../src/core/intents';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { placeVessel } from '../src/vessel/vesselControl';
import { TOW_DEFS, VESSEL_DEFS } from '../src/vessel/vesselDef';
import { createVesselState } from '../src/vessel/vesselState';
import { lineLength, towFast, towReach, towStatus, towTargets, towVessel, winchStalled } from '../src/tow/tow';
import { runStatus } from '../src/rescue/rescue';
import { PORTS } from '../src/world/archipelago';
import { ClientSession } from '../src/net/clientSession';
import { HostSession } from '../src/net/hostSession';
import { LoopbackHost } from '../src/net/transport';
import { startEngine } from './helpers/engine';

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
    expect(towFast(world)).toBe(true);
    expect(towStatus(world)).toMatch(/Towing/);
    send('engineStartStop');
    run(3);
    send('lever', 0.6);
    let maxReach = 0;
    run(60, () => (maxReach = Math.max(maxReach, towReach(world))));
    const tow = towVessel(world)!;
    expect(towFast(world)).toBe(true);
    // Under way together, northward (-z), the line taut but not snapping.
    expect(-tow.linearVelocity[2]).toBeGreaterThan(1.5);
    expect((world.tow!.line?.tension ?? 0)).toBeGreaterThan(100);
    expect(maxReach).toBeLessThan(CONFIG.tow.lineLength + 6);
    // Cast off: no more pull.
    send('towCast');
    run(1);
    expect((world.tow!.line?.tension ?? 0)).toBe(0);
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
    expect(towFast(world)).toBe(false);
    // Back in range, made fast, then yanked away hard.
    placeVessel(tow, tow.position[0], 0, tow.position[2] - 40, 0);
    run(0.5);
    send('towMake');
    expect(towFast(world)).toBe(true);
    tow.linearVelocity = [0, 0, 12];
    run(4);
    expect(towFast(world)).toBe(false);
    expect(world.rescue!.radio?.text).toMatch(/parted/);
  });

  it('tows come in three sizes (debug: small, medium, large), each kind at random; a large one passes a heavy hawser', () => {
    const sizes = { small: new Set<string>(), medium: new Set<string>(), large: new Set<string>() };
    for (const id of TOW_DEFS) sizes[VESSEL_DEFS[id].tow!.size].add(id);
    expect([...sizes.small].sort()).toEqual(['derelict', 'dory']);
    expect([...sizes.medium].sort()).toEqual(['barge', 'logRaft', 'yacht']);
    expect([...sizes.large].sort()).toEqual(['pontoon', 'trawler']);
    // Heavier as they go: every large tow outweighs every medium, every medium every small.
    const heaviest = (k: keyof typeof sizes) => Math.max(...[...sizes[k]].map((id) => VESSEL_DEFS[id].mass));
    const lightest = (k: keyof typeof sizes) => Math.min(...[...sizes[k]].map((id) => VESSEL_DEFS[id].mass));
    expect(lightest('medium')).toBeGreaterThan(heaviest('small'));
    expect(lightest('large')).toBeGreaterThan(heaviest('medium'));
    for (const size of ['small', 'medium', 'large'] as const) {
      const { world, v, send } = setup();
      placeVessel(v, 0, 0, -400, 0);
      send('towDebugNear', 1, size);
      const job = world.tow!.job!;
      expect(sizes[size].has(job.defId), `${size}: ${job.defId}`).toBe(true);
    }
    // A pull that parts an ordinary line holds on a large tow's hawser.
    const { world, v, send, run } = setup();
    placeVessel(v, 0, 0, -400, 0);
    run(1);
    send('towDebugNear', 1, 'trawler');
    send('towMake');
    expect(towFast(world)).toBe(true);
    expect(world.rescue!.radio?.text ?? '').not.toMatch(/parted/);
    const tow = towVessel(world)!;
    // Stretch it to 1.5x the ordinary breaking load (under twice), and hold it there a moment.
    const stretch = (1.5 * CONFIG.tow.breakForce) / CONFIG.tow.stiffness;
    const reach = towReach(world);
    placeVessel(tow, tow.position[0], 0, tow.position[2] + (lineLength(world.tow!.line!) - reach) + stretch, 0);
    run(0.1);
    expect(towFast(world)).toBe(true);
    expect(world.tow!.line!.tension).toBeGreaterThan(CONFIG.tow.breakForce);
    // The same on a medium tow (an ordinary line) parts it.
    const b = setup();
    placeVessel(b.v, 0, 0, -400, 0);
    b.run(1);
    b.send('towDebugNear', 1, 'barge');
    b.send('towMake');
    const barge = towVessel(b.world)!;
    const bReach = towReach(b.world);
    placeVessel(barge, barge.position[0], 0, barge.position[2] + (lineLength(b.world.tow!.line!) - bReach) + stretch, 0);
    b.run(0.1);
    expect(towFast(b.world)).toBe(false);
  });

  it('slow in a port it is delivered and counted; the harbour takes it away soon after', () => {
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
    // Still there for a moment (even with us right beside her), then gone, and the job is over.
    placeVessel(v, port.x + 30, 0, port.z, 0);
    run(1);
    expect(world.vessels[job.vesselId]).toBeDefined();
    run(CONFIG.tow.removeAfter);
    expect(world.tow!.job).toBeNull();
    expect(world.vessels[job.vesselId]).toBeUndefined();
  });

  it('tow anything: debris follows us on the line, and towed slow into a harbour it is cleared', () => {
    const { world, v, send, run } = setup();
    placeVessel(v, 0, 0, -400, 0);
    run(1);
    world.traffic!.debris.push({ id: 'dx', x: 0, z: -380 });
    expect(towTargets(world)).toContain('d:dx');
    send('towMake', 1, 'd:dx');
    expect(world.tow!.line?.target).toBe('d:dx');
    expect(towStatus(world)).toMatch(/Towing debris/);
    send('engineStartStop');
    run(3);
    send('lever', 0.5);
    let maxReach = 0;
    run(40, () => (maxReach = Math.max(maxReach, towReach(world))));
    const d = world.traffic!.debris.find((o) => o.id === 'dx')!;
    expect(-380 - d.z).toBeGreaterThan(60); // came along northward with us
    expect(maxReach).toBeLessThan(CONFIG.tow.lineLength + 6);
    expect(world.tow!.line?.tension ?? 0).toBeGreaterThan(50);
    // Into harbour, stopped: cleared.
    send('lever', 0);
    const port = PORTS.find((p) => p.id === 'calder')!;
    placeVessel(v, port.x, 0, port.z - 20, 0);
    d.x = port.x;
    d.z = port.z;
    world.tow!.line!.vel = [0, 0];
    run(CONFIG.tow.deliverTime + 1);
    expect(world.traffic!.debris.some((o) => o.id === 'dx')).toBe(false);
    expect(world.tow!.line ?? null).toBeNull();
    expect(world.tow!.cleared).toBe(1);
  });

  it('tow anything: our skiff once she is afloat (not in her cradle); the menu makes fast to the nearest', () => {
    const ids = new IdFactory();
    const { world, vesselId } = createWorld(ids, undefined, { tender: true });
    world.environment.waves = [];
    const v = world.vessels[vesselId];
    const skiff = Object.values(world.vessels).find((o) => o.tender)!;
    const send = (control: string, ref?: string) => stepWorld(world, [{ playerId: 'player-1', targetId: v.id, control, value: 1, ref }], DT);
    placeVessel(v, 0, 0, -400, 0);
    stepWorld(world, [], DT);
    expect(towTargets(world)).not.toContain(`v:${skiff.id}`); // in her cradle
    send('towMake', `v:${skiff.id}`);
    expect(world.tow!.line ?? null).toBeNull();
    skiff.tender!.phase = 'free';
    placeVessel(skiff, 0, 0, -400 + 18, 0);
    stepWorld(world, [], DT);
    send('towToggle');
    expect(world.tow!.line?.target).toBe(`v:${skiff.id}`);
    expect(towStatus(world)).toMatch(/Towing/);
    send('towToggle');
    expect(world.tow!.line ?? null).toBeNull();
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
    expect(c.latest!.tow!.line?.target).toBe(`v:${job.vesselId}`);
    expect(c.latest!.vessels[job.vesselId].defId).toBe('barge');
  });
});

/** The tow job's vessel as a towline key. */
function vesselKeyOfJob(world: { tow?: { job?: { vesselId: string } | null } }): string {
  return `v:${world.tow!.job!.vesselId}`;
}

describe('the tow winch', { timeout: 30000 }, () => {
  it('heaves in and pays out the line while its buttons are held, within its limits; stalls under a heavy pull', () => {
    const { world, v, send, run } = setup();
    startEngine(world, v); // the tow winch is hydraulic
    placeVessel(v, 0, 0, -400, 0);
    run(1);
    send('towDebugNear', 1, 'derelict');
    const reach0 = towReach(world, world.tow!.line?.target ?? vesselKeyOfJob(world));
    send('towMake');
    const line = world.tow!.line!;
    const w = CONFIG.tow.winch;
    // Made fast at the distance to her plus a little slack (not the full default length).
    const made = lineLength(line);
    expect(made).toBeCloseTo(Math.max(w.minLength, reach0 + w.makeFastSlack), 0);
    // Heave in for 5 s: 3 m less line out, and she comes towards us (the slack is short).
    send('winchHeave', 1);
    run(5);
    send('winchHeave', 0);
    expect(lineLength(line)).toBeCloseTo(made - w.heaveSpeed * 5, 1);
    expect(towReach(world)).toBeLessThan(reach0 - 1);
    expect(towStatus(world)).toMatch(new RegExp(`${Math.round(made - w.heaveSpeed * 5)} m out`));
    // Let go: it stays where it is.
    const held = lineLength(line);
    run(2);
    expect(lineLength(line)).toBe(held);
    // Pay out to the end of the wire, and no further.
    send('winchPayOut', 1);
    run((w.maxLength - held) / w.payOutSpeed + 3);
    send('winchPayOut', 0);
    expect(lineLength(line)).toBe(w.maxLength);
    // Heaving in against more than the winch can pull: it stalls (and says so).
    line.tension = w.pullN * 2;
    v.controls.winchHeave = 1;
    expect(winchStalled(world)).toBe(true);
    expect(towStatus(world)).toMatch(/winch stalled/);
  });
});


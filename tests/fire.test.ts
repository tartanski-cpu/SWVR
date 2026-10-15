import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import type { Intent } from '../src/core/intents';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { jetOn, jetPath } from '../src/fire/fire';
import { placeVessel } from '../src/vessel/vesselControl';
import { groundHeight } from '../src/world/terrain';

const DT = 1 / 60;

function setup(x = 0, z = -400, calls = false) {
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  world.fire!.calls = calls;
  const v = world.vessels[vesselId];
  placeVessel(v, x, 0, z, 0);
  const send = (control: string, value = 1, ref?: string) => stepWorld(world, [{ playerId: 'player-1', targetId: v.id, control, value, ref } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  return { world, v, send, run };
}

const pts = Array.from({ length: 60 }, () => new THREE.Vector3());

/** Where the jet comes down (last point). */
function landing(world: ReturnType<typeof setup>['world'], v: ReturnType<typeof setup>['v']): THREE.Vector3 {
  const n = jetPath(world, v, pts);
  return pts[n - 1].clone();
}

describe('fire missions', { timeout: 30000 }, () => {
  it('the monitor: water only with the pump on and the engine running; a ballistic arc ahead', () => {
    const { world, v, send, run } = setup();
    send('firePump', 1);
    expect(jetOn(v)).toBe(false); // engine off: no pressure
    send('engineStartStop');
    run(3);
    expect(jetOn(v)).toBe(true);
    send('monPan', 0);
    send('monTilt', 30);
    const far = landing(world, v);
    // Ahead (north, -z), tens of metres off, at the sea surface.
    expect(v.position[2] - far.z).toBeGreaterThan(40);
    expect(v.position[2] - far.z).toBeLessThan(110);
    expect(Math.abs(far.x - v.position[0])).toBeLessThan(5);
    expect(far.y).toBeCloseTo(0, 1);
    // Lower: shorter; to starboard (pan +): off to the east (+x).
    send('monTilt', 5);
    expect(v.position[2] - landing(world, v).z).toBeLessThan(v.position[2] - far.z);
    send('monPan', 90);
    send('monTilt', 30);
    expect(landing(world, v).x - v.position[0]).toBeGreaterThan(40);
    send('firePump', 0);
    expect(jetOn(v)).toBe(false);
  });

  it('a burning boat grows unattended; hosed down with the monitor it goes out, counts and logs', () => {
    const { world, v, send, run } = setup();
    send('engineStartStop');
    run(3);
    send('fireDebugNear', 1, 'boat');
    const job = world.fire!.job!;
    expect(job.phase).toBe('accepted');
    const i0 = job.intensity;
    run(10);
    expect(job.intensity).toBeGreaterThan(i0); // grows
    const duty = world.duties!.items.find((d) => d.kind === 'fire')!;
    expect(duty.steps[0].done).toBe(true);
    // Aim: the elevation that brings the jet down on her.
    send('firePump', 1);
    send('monPan', 0);
    let best = 0;
    let bestD = Infinity;
    for (let t = 0; t <= 55; t += 0.5) {
      v.controls.monTilt = t;
      const p = landing(world, v);
      const d = Math.hypot(p.x - job.x, p.z - job.z);
      if (d < bestD) [best, bestD] = [t, d];
    }
    send('monTilt', best);
    run(1);
    expect(job.wetting).toBeGreaterThan(0.3);
    expect(duty.steps[1].done).toBe(true);
    const before = world.rescue!.completed;
    for (let i = 0; i < 180 && job.phase === 'accepted'; i++) run(1);
    expect(job.phase).toBe('out');
    expect(world.fire!.out).toBe(1);
    expect(world.rescue!.completed).toBe(before + 1);
    expect(world.rescue!.lastDone).toMatch(/Fire/);
    run(0.2);
    expect(duty.doneAt).toBeDefined();
    // The wreck smoulders a while, then the job is over.
    run(CONFIG.fire.removeAfter + 1);
    expect(world.fire!.job).toBeNull();
  });

  it('calls come by themselves out of harbour; the handset takes one; unanswered they go', () => {
    const { world, send, run } = setup(0, -400, true);
    run(0.2);
    world.fire!.nextAt = world.time; // skip the wait
    run(0.2);
    const job = world.fire!.job!;
    expect(job.phase).toBe('calling');
    expect(world.rescue!.radio?.text).toMatch(/Fire reported/);
    send('rescueHandset');
    expect(job.phase).toBe('accepted');
    send('fireDebugEnd');
    send('fireDebugCall', 1, 'boat');
    world.fire!.job!.callT = world.time - CONFIG.fire.callTimeout - 1;
    run(0.2);
    expect(world.fire!.job).toBeNull();
  });

  it('a fire ashore is on dry land with deep water within reach of the monitor', () => {
    // Off Calder Haven's coast.
    const { world, send } = setup(400, 300);
    send('fireDebugCall', 1, 'shore');
    const job = world.fire!.job!;
    expect(job.kind).toBe('shore');
    expect(groundHeight(job.x, job.z)).toBeGreaterThan(0.5);
    let reach = false;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (groundHeight(job.x + Math.cos(a) * CONFIG.fire.shoreReach, job.z + Math.sin(a) * CONFIG.fire.shoreReach) < -CONFIG.fire.minDepth) reach = true;
    }
    expect(reach).toBe(true);
  });
});

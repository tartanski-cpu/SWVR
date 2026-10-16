import { describe, expect, it } from 'vitest';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { createFireState, type FireJob } from '../src/fire/fire';
import { placeVessel } from '../src/vessel/vesselControl';

const DT = 1 / 30;

/** A shed fire ashore at (fx, fz), a player standing `dist` m off it (world frame), the boat far away. */
function setup(dist: number) {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory());
  world.environment.waves = [];
  world.geography = 'openSea';
  placeVessel(world.vessels[vesselId], 0, 0, -800, 0);
  const job: FireJob = { kind: 'shore', x: 0, z: 0, y: 0, yawDeg: 0, intensity: 0.6, wetting: 0, phase: 'accepted', callT: 0, alertT: 0 };
  world.fire = { ...createFireState(), job };
  const p = world.players[localPlayerId];
  p.aboardVesselId = null;
  p.position = [0, 0, dist];
  // Held at waist height, aimed at the fire (north, -z), a little up.
  const aim = (on: boolean) => (p.avatar = { head: [0, 1.7, dist, 0, 0, 0, 1], left: null, right: null, gear: { kind: 'extinguisher', on, p: [0, 1.1, dist - 0.3], d: [0, 0.2, -1] } });
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  return { world, job, ship: world.vessels[vesselId], aim, run };
}

describe('the hand fire extinguisher', () => {
  it('sprayed from a few metres, it puts a shed fire out (on one or two charges)', () => {
    const { world, job, ship, aim, run } = setup(9);
    aim(true);
    run(5);
    expect(job.handWet).toBeGreaterThan(0.5);
    expect(ship.extCharge!).toBeLessThan(1);
    let t = 5;
    while (job.phase === 'accepted' && t < 60) {
      run(1);
      t += 1;
    }
    if (job.phase === 'accepted') {
      // Empty: hung back on its bracket for a full one, then finish it.
      for (const p of Object.values(world.players)) delete p.avatar;
      run(0.1);
      aim(true);
      run(60);
    }
    expect(job.phase).toBe('out');
  });

  it('empty, nothing comes out; hung back up, it is full again', () => {
    const { job, ship, aim, run, world } = setup(9);
    aim(true);
    run(62);
    expect(ship.extCharge).toBe(0);
    expect(job.handWet).toBe(0);
    for (const p of Object.values(world.players)) delete p.avatar;
    run(0.1);
    expect(ship.extCharge).toBe(1);
  });

  it('too far off, it falls short; not spraying, the fire grows', () => {
    const { job, aim, run } = setup(20);
    aim(true);
    run(5);
    expect(job.handWet).toBe(0);
    expect(job.intensity).toBeGreaterThan(0.6);
  });
});

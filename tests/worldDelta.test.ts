/**
 * Multiplayer study #3: snapshots by their changes (net/worldDelta.ts). The crew's world,
 * rebuilt from the changes, is the host's exactly, step after step; a send carries only what
 * changed (the crates on the quay, unmoved, aren't in it); nothing on the crew's page shares
 * an object with the next snapshot.
 */
import { describe, expect, it } from 'vitest';
import { createWorld, type WorldState } from '../src/core/world';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { DeltaPacker, DeltaReader } from '../src/net/worldDelta';

const plain = (w: WorldState) => JSON.parse(JSON.stringify(w));

describe('snapshots by their changes', () => {
  it("rebuilds the host's world exactly, sending only what changed", () => {
    const { world } = createWorld(new IdFactory(), 'workboat', { harbour: true, weather: true });
    for (let i = 0; i < 40; i++) world.cargo[`q${i}`] = { id: `q${i}`, kind: 0, mass: 40, from: 'calder', to: 'brannock', at: { ground: [i, 0, 0], yaw: 0 } };
    const packer = new DeltaPacker();
    const reader = new DeltaReader();
    packer.pack(world); // the first send: everything (a newcomer gets the whole world)
    reader.reset(plain(world));
    for (let step = 0; step < 30; step++) {
      stepWorld(world, step === 3 ? [{ playerId: 'player-1', targetId: world.homeVesselId!, control: 'throttle', value: 0.6 }] : [], 1 / 20);
      if (step === 10) delete world.cargo.q5; // a crate taken away
      if (step === 12) world.cargo.n1 = { id: 'n1', kind: 1, mass: 40, from: 'calder', to: 'brannock', at: { ground: [9, 0, 9], yaw: 0 } };
      if (step === 14) (world as unknown as Record<string, unknown>).quietCalls = true; // a part that comes
      if (step === 16) delete (world as unknown as Record<string, unknown>).quietCalls; // and goes
      const d = packer.pack(world);
      if (d) {
        // Through the wire as text.
        const got = reader.apply(JSON.parse(JSON.stringify(d)));
        expect(got).toEqual(plain(world));
        expect(JSON.stringify(d).length).toBeLessThan(JSON.stringify(world).length / 2);
        expect(d.obj?.cargo?.set?.q7).toBeUndefined(); // an unmoved crate isn't sent
      }
    }
    const a = reader.world();
    const b = reader.world();
    expect(a.vessels).not.toBe(b.vessels); // parsed afresh: nothing shared
  });
});

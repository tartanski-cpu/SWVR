/**
 * Multiplayer study #13: a crew page takes the host's world whole. A part of its own the host
 * hasn't got (its Voyage plan, its pots) goes; the host's parts replace its own; the players
 * are left to the caller.
 */
import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/core/world';
import { IdFactory } from '../src/core/ids';
import { takeWorld } from '../src/net/takeWorld';

describe("taking the host's world (crew)", () => {
  it("drops our own parts the host hasn't got, takes theirs, leaves the players", () => {
    const ours = createWorld(new IdFactory()).world;
    const theirs = structuredClone(createWorld(new IdFactory()).world);
    (ours as unknown as Record<string, unknown>).plan = { points: [{ x: 1, z: 2, name: 'CREW OWN STOP' }] };
    delete (theirs as unknown as Record<string, unknown>).plan;
    theirs.time = 123;
    const keep = ours.players;
    takeWorld(ours, theirs);
    expect('plan' in ours).toBe(false);
    expect(ours.time).toBe(123);
    expect(ours.players).toBe(keep);
  });
});

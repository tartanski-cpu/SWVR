import { describe, expect, it } from 'vitest';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { quaySpot } from '../src/world/startSpot';

// The gangway mark (player/gangway.ts) sends the board intent: ashore goes by the berth of the
// boat you're on (owner, Oct 2026: "something where you look at the quay side from the boat").
describe('stepping ashore and aboard', () => {
  it('ashore from a moored boat: onto the quay by her own berth, not the home boat’s', () => {
    const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), undefined, { voyage: true });
    // A second boat, moored at the harbour (Voyage spawns come in made fast).
    stepWorld(world, [{ playerId: localPlayerId, targetId: 'environment', control: 'spawnBoat', value: 1, ref: 'lander' }], 1 / 60);
    const second = Object.values(world.vessels).find((v) => v.id !== vesselId && v.mooring.phase === 'moored')!;
    expect(second).toBeTruthy();
    expect(second.mooring.berthId).not.toBe(world.vessels[vesselId].mooring.berthId);
    stepWorld(world, [{ playerId: localPlayerId, targetId: localPlayerId, control: 'board', value: 1, ref: second.id }], 1 / 60);
    expect(world.players[localPlayerId].aboardVesselId).toBe(second.id);
    stepWorld(world, [{ playerId: localPlayerId, targetId: localPlayerId, control: 'board', value: 0 }], 1 / 60);
    const p = world.players[localPlayerId];
    const q = quaySpot(second.mooring.berthId);
    expect(p.aboardVesselId).toBeNull();
    expect(Math.hypot(p.position[0] - q.x, p.position[2] - q.z)).toBeLessThan(0.5);
  });

  it('ashore from a boat made fast along a quay face with no named berth: beside her, not at the start harbour', async () => {
    const { allBerths } = await import('../src/world/berths');
    const { BERTHS } = await import('../src/world/archipelago');
    const { world, vesselId, localPlayerId } = createWorld(new IdFactory());
    // A berth along some quay face far from the start's, one the regions don't name.
    const start = world.vessels[vesselId];
    const named = new Set(BERTHS.map((b) => b.id));
    const face = allBerths().find((b) => !named.has(b.id) && Math.hypot(b.x - start.position[0], b.z - start.position[2]) > 1500)!;
    expect(face).toBeTruthy();
    start.mooring.phase = 'moored';
    start.mooring.berthId = face.id;
    start.position[0] = face.x;
    start.position[2] = face.z;
    world.players[localPlayerId].aboardVesselId = vesselId;
    stepWorld(world, [{ playerId: localPlayerId, targetId: localPlayerId, control: 'board', value: 0 }], 1 / 60);
    const p = world.players[localPlayerId];
    expect(p.aboardVesselId).toBeNull();
    expect(Math.hypot(p.position[0] - face.x, p.position[2] - face.z)).toBeLessThan(face.shoreDist + 10);
  });
});

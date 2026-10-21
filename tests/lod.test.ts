/**
 * Multi-boat M4 (docs/MULTI_BOAT.md): level of detail by distance to the nearest player
 * (core/lod.ts). Near boats float on every station every tick (the owner: they move exactly
 * in the waves); mid ones on half the stations; far ones on four, and every other tick when
 * nothing holds them. Her displacement is the same at every level.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import { heldInPlace, lodStations, nearestPlayerDistance, reducedStations, vesselLod } from '../src/core/lod';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { physicsStations } from '../src/vessel/hullForm';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { createVesselState } from '../src/vessel/vesselState';

const DT = 1 / 20;

describe('level of detail by distance (multi-boat M4)', { timeout: 60000 }, () => {
  it('reduced stations keep her displacement: the weights carried over, the ends kept; near is every station', () => {
    const hull = VESSEL_DEFS.pilotBoat.hull;
    const full = physicsStations(hull);
    const sum = (s: readonly { weight: number }[]) => s.reduce((a, b) => a + b.weight, 0);
    for (const n of [4, 8, 13]) {
      const r = reducedStations(hull, n);
      expect(r).toHaveLength(n);
      expect(sum(r)).toBeCloseTo(sum(full), 6);
      expect(r[0].z).toBe(full[0].z);
      expect(r[n - 1].z).toBe(full[full.length - 1].z);
    }
    expect(reducedStations(hull, 4)).toBe(reducedStations(hull, 4)); // built once
    expect(lodStations(hull, 'near')).toBe(full);
    expect(lodStations(hull, 'mid').length).toBeLessThan(full.length);
    expect(lodStations(hull, 'far')).toHaveLength(CONFIG.lod.farStations);
  });

  it('the level follows the nearest player: aboard is near; a player aboard another boat counts where she is', () => {
    const ids = new IdFactory();
    const { world, vesselId, localPlayerId } = createWorld(ids, 'pilotBoat');
    const home = world.vessels[vesselId];
    placeVessel(home, 0, 0, 3600, 0);
    world.players[localPlayerId].aboardVesselId = vesselId;
    const other = createVesselState(ids.next('vessel'), 'lander');
    world.vessels[other.id] = other;
    for (const [x, lod] of [
      [100, 'near'],
      [400, 'mid'],
      [2000, 'far'],
    ] as const) {
      placeVessel(other, x, 0, 3600, 0);
      expect(nearestPlayerDistance(world, other)).toBeCloseTo(x, 3);
      expect(vesselLod(world, other)).toBe(lod);
    }
    expect(vesselLod(world, home)).toBe('near');
    // The home boat, a tow and the skiff never get a level, wherever the players are.
    world.players[localPlayerId].aboardVesselId = null;
    world.players[localPlayerId].position = [0, 1.6, 0];
    expect(vesselLod(world, home)).toBe('near');
    const tow = createVesselState(ids.next('vessel'), 'barge');
    placeVessel(tow, 3000, 0, 3600, 0);
    world.vessels[tow.id] = tow;
    expect(vesselLod(world, tow)).toBe('near');
    // Ashore, 50 m from her: near by the body's own position.
    world.players[localPlayerId].aboardVesselId = null;
    world.players[localPlayerId].position = [1950, 1.6, 3600];
    expect(vesselLod(world, other)).toBe('near');
    // Held: moored, or touching.
    expect(heldInPlace(world, other, true)).toBe(true);
    expect(heldInPlace(world, other, false)).toBe(false);
    other.mooring.phase = 'moored';
    expect(heldInPlace(world, other, false)).toBe(true);
  });

  it('a far free boat floats as she does near (within a few centimetres), and is stepped every other tick; the home boat every tick', () => {
    const ids = new IdFactory();
    const { world, vesselId, localPlayerId } = createWorld(ids, 'pilotBoat', { weather: true });
    world.environment.waves = [];
    const home = world.vessels[vesselId];
    placeVessel(home, 0, 0, 3600, 0);
    world.players[localPlayerId].aboardVesselId = vesselId;
    const far = createVesselState(ids.next('vessel'), 'smallTug');
    placeVessel(far, 3000, 0, 3600, 90);
    world.vessels[far.id] = far;
    const near = createVesselState(ids.next('vessel'), 'smallTug');
    placeVessel(near, 60, 0, 3600, 90);
    world.vessels[near.id] = near;
    for (let i = 0; i < 20 / DT; i++) {
      stepWorld(world, [], DT);
      world.environment.waves = [];
    }
    expect(far.lod).toBe('far');
    expect(near.lod).toBe('near');
    expect(Math.abs(far.position[1] - near.position[1])).toBeLessThan(0.05);
    // Under way: the far boat moves only on even ticks.
    for (const v of [far, near]) stepWorld(world, [{ playerId: localPlayerId, targetId: v.id, control: 'quickStart', value: 1 }], DT);
    for (let i = 0; i < 3 / DT; i++) stepWorld(world, [], DT);
    for (const v of [far, near]) stepWorld(world, [{ playerId: localPlayerId, targetId: v.id, control: 'lever', value: 0.6 }], DT);
    for (let i = 0; i < 5 / DT; i++) stepWorld(world, [], DT);
    let farMoves = 0;
    let nearMoves = 0;
    for (let i = 0; i < 10; i++) {
      const fx = far.position[0];
      const nx = near.position[0];
      stepWorld(world, [], DT);
      if (far.position[0] !== fx) farMoves++;
      if (near.position[0] !== nx) nearMoves++;
    }
    expect(nearMoves).toBe(10);
    expect(farMoves).toBe(5);
    // Both making way at a sane speed; the far boat not flung by the doubled step.
    const speed = (v: typeof far) => Math.hypot(v.linearVelocity[0], v.linearVelocity[2]);
    expect(speed(far)).toBeGreaterThan(1);
    expect(speed(far)).toBeLessThan(12);
    expect(Math.abs(speed(far) - speed(near))).toBeLessThan(2);
  });
});

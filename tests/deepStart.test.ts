/**
 * The career's deep-water start (owner, Oct 2026: "a new deep water harbour on the career map
 * ... the new tug's got about 5.5 m draught, and we're going to have vessels up to 10 ...
 * make Brannock Pier the deep water one, where bigger ships spawn by default"): a boat too
 * deep for Calder Haven's 4.5 m basin starts moored at Brannock's T-head, the player on the
 * pier beside her; every boat in the game today still starts at Calder.
 */
import { describe, expect, it } from 'vitest';
import '../src/boats/library';
import { CONFIG } from '../src/config';
import { createWorld } from '../src/core/world';
import { IdFactory } from '../src/core/ids';
import { putVesselDef, VESSEL_DEFS, type VesselDef } from '../src/vessel/vesselDef';
import { berthWithId } from '../src/world/berths';
import { vesselDraught } from '../src/world/slots';
import { startBerthFor } from '../src/world/startSpot';
import { groundHeight } from '../src/world/terrain';

/** A copy of `id` drawn `draught` m deep (her sections stretched below the waterline: each point's height, its second number). */
function deepened(id: string, draught: number): string {
  const def = structuredClone(VESSEL_DEFS[id]) as VesselDef;
  const k = draught / vesselDraught(id);
  for (const s of def.hull.stations) s.polygon = s.polygon.map(([w, h]) => [w, h < 0 ? h * k : h]) as typeof s.polygon;
  const deep = `${id}Deep${draught}`;
  putVesselDef(deep, def);
  return deep;
}

describe('the deep-water start at Brannock Pier', () => {
  it('every boat in the game today starts at Calder Haven, as before', () => {
    for (const id of Object.keys(VESSEL_DEFS)) expect(startBerthFor(id), id).toBe(CONFIG.start.berthId);
  });

  it('a 5.5 m tug starts alongside Brannock\'s T-head in deep water, the player on the pier', () => {
    const tug = deepened('smallTug', 5.5);
    expect(vesselDraught(tug)).toBeCloseTo(5.5, 1);
    const id = startBerthFor(tug);
    expect(berthWithId(id)!.portId).toBe('brannock');
    const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), tug, { harbour: true });
    const v = world.vessels[vesselId];
    expect(v.mooring.phase).toBe('moored');
    expect(v.mooring.berthId).toBe(id);
    expect(groundHeight(v.position[0], v.position[2])).toBeLessThan(-5.5 - CONFIG.spawn.underKeel);
    // Ashore on the T-head, beside her.
    const p = world.players[localPlayerId].position;
    expect(Math.hypot(p[0] - v.position[0], p[2] - v.position[2])).toBeLessThan(15);
    expect(p[1]).toBeGreaterThan(1.5);
  });

  it('a 58 m ship drawing 10 m lies at Brannock (along its long arm, the head too short for her), in deep water', () => {
    const ship = deepened('coaster', 10);
    const { world, vesselId } = createWorld(new IdFactory(), ship, { harbour: true });
    const v = world.vessels[vesselId];
    expect(berthWithId(v.mooring.berthId!)!.portId).toBe('brannock');
    expect(groundHeight(v.position[0], v.position[2])).toBeLessThan(-11);
  });
});

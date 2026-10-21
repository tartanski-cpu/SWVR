/**
 * Voyage mode's start and its remembered place (owner, Oct 2026): a Voyage map starts you
 * ashore on the quay beside the map's start berth, not at Calder's spot (open water on a
 * coast map); and where you are on a map is remembered between sessions (app/voyagePlace.ts).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function loadMap(map = 'oban') {
  vi.stubGlobal('location', { pathname: '/voyage.html', search: `?map=${map}`, href: `https://localhost/voyage.html?map=${map}` });
  vi.resetModules();
  const m = {
    config: await import('../src/config'),
    regions: await import('../src/world/regions'),
    coast: await import('../src/world/coastTerrain'),
    terrain: await import('../src/world/terrain'),
    walk: await import('../src/world/landWalkArea'),
    world: await import('../src/core/world'),
    ids: await import('../src/core/ids'),
    vc: await import('../src/vessel/vesselControl'),
    berths: await import('../src/world/archipelago'),
    spot: await import('../src/world/startSpot'),
    place: await import('../src/app/voyagePlace'),
  };
  const c = m.regions.regionById(map)!.coast!;
  const t = c.pkg.terrain;
  if (t.chunked) throw new Error('whole-mesh map expected');
  const bin = readFileSync(join(root, 'public', t.dir, t.file));
  m.coast.registerCoastTerrain(map, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer, t, c.pkg.box, c.x, c.z);
  return m;
}

function fakeStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k), map };
}

describe('Voyage: the start and the remembered place', { timeout: 60000 }, () => {
  let m: Awaited<ReturnType<typeof loadMap>>;
  beforeAll(async () => {
    m = await loadMap();
  });

  it('starts you on the quay beside the map\'s berth, with ground under your feet, facing her', () => {
    const { world, vesselId, localPlayerId } = m.world.createWorld(new m.ids.IdFactory(), 'pilotBoat', { harbour: true });
    const v = world.vessels[vesselId];
    const p = world.players[localPlayerId];
    const b = m.berths.BERTHS.find((x) => x.id === 'oban-cargo')!;
    expect(v.mooring.phase).toBe('moored');
    expect(v.mooring.berthId).toBe('oban-cargo');
    expect(p.aboardVesselId).toBeNull();
    // On the quay a few metres from the berth's face, not at Calder's spot.
    expect(Math.hypot(p.position[0] - b.x, p.position[2] - b.z)).toBeLessThan(8);
    expect(m.walk.landFloor(p.position[0], p.position[2])).not.toBeNull();
    expect(p.position[1]).toBeCloseTo(b.deckY, 0);
    // Facing the water: her way is opposite the shore's.
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    expect(fx * b.shoreX + fz * b.shoreZ).toBeLessThan(-0.9);
    // The career's spot is unchanged.
    expect(m.spot.quaySpot('calder-cargo')).toEqual(m.config.CONFIG.start.quay);
  });

  it('Tayvallich too: ashore by its berth, on the quay', async () => {
    const t = await loadMap('tayvallich');
    const { world, vesselId, localPlayerId } = t.world.createWorld(new t.ids.IdFactory(), 'pilotBoat', { harbour: true });
    const p = world.players[localPlayerId];
    const b = t.berths.BERTHS.find((x) => x.id === world.vessels[vesselId].mooring.berthId)!;
    expect(b.id).toBe('tayvallich-cargo');
    expect(Math.hypot(p.position[0] - b.x, p.position[2] - b.z)).toBeLessThan(8);
    expect(t.walk.landFloor(p.position[0], p.position[2])).not.toBeNull();
  });

  it('remembers her moored at a berth, or afloat where she was, and you aboard or ashore', () => {
    const { world, vesselId, localPlayerId } = m.world.createWorld(new m.ids.IdFactory(), 'pilotBoat', { harbour: true });
    const v = world.vessels[vesselId];
    const store = fakeStorage();
    // Moored at the start, ashore: saved and taken back.
    const moored = m.place.placeOf(world, v, localPlayerId);
    expect(moored.berthId).toBe('oban-cargo');
    expect(moored.aboard).toBe(false);
    m.place.rememberPlace('oban', moored, store);
    expect(m.place.savedPlace('oban', store)).toEqual(moored);
    // Out in the Sound of Kerrera, aboard, heading south-west.
    m.vc.placeVessel(v, 3900, 0, -6400, 225);
    v.mooring = { phase: 'free', berthId: null, reversed: false, t: 0 };
    world.players[localPlayerId].aboardVesselId = v.id;
    const afloat = m.place.placeOf(world, v, localPlayerId);
    expect(afloat.berthId).toBeNull();
    expect(afloat.aboard).toBe(true);
    expect(afloat.headingDeg).toBeCloseTo(225, 0);
    // A fresh world takes each place back.
    const w2 = m.world.createWorld(new m.ids.IdFactory(), 'pilotBoat', { harbour: true });
    const v2 = w2.world.vessels[w2.vesselId];
    expect(m.place.restorePlace(w2.world, v2, w2.localPlayerId, afloat)).toBe(true);
    expect(v2.position[0]).toBeCloseTo(3900, 0);
    expect(v2.position[2]).toBeCloseTo(-6400, 0);
    expect(m.place.headingOf(v2)).toBeCloseTo(225, 0);
    expect(v2.mooring.phase).toBe('free');
    expect(w2.world.players[w2.localPlayerId].aboardVesselId).toBe(v2.id);
    expect(m.place.restorePlace(w2.world, v2, w2.localPlayerId, moored)).toBe(true);
    expect(v2.mooring.phase).toBe('moored');
    expect(v2.mooring.berthId).toBe('oban-cargo');
    expect(w2.world.players[w2.localPlayerId].aboardVesselId).toBeNull();
    // A spot on land (or a berth that's gone) is refused: the start stays.
    expect(m.place.restorePlace(w2.world, v2, w2.localPlayerId, { ...afloat, x: 4600, z: -6000 })).toBe(false);
    expect(m.place.restorePlace(w2.world, v2, w2.localPlayerId, { ...moored, berthId: 'nowhere' })).toBe(false);
    expect(v2.mooring.berthId).toBe('oban-cargo');
    m.place.forgetPlace('oban', store);
    expect(m.place.savedPlace('oban', store)).toBeNull();
  });
});

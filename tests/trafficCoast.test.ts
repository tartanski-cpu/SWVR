/**
 * AI traffic on the Voyage maps (owner, Oct 2026): in confined waters (Oban Bay, Loch Sween)
 * no ship can run the open-sea 4 km straight track, so ships are put on the longest clear
 * run found round the boat (traffic.ts confinedTrack), keep to water deep enough for their
 * type, and alter course (or go) when it shoals ahead.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DT = 1 / 20;

async function load(map: string) {
  vi.stubGlobal('location', { pathname: '/voyage.html', search: `?map=${map}`, href: `https://localhost/voyage.html?map=${map}` });
  vi.resetModules();
  const m = {
    config: await import('../src/config'),
    regions: await import('../src/world/regions'),
    coast: await import('../src/world/coastTerrain'),
    terrain: await import('../src/world/terrain'),
    traffic: await import('../src/traffic/traffic'),
    sim: await import('../src/core/simulation'),
    world: await import('../src/core/world'),
    ids: await import('../src/core/ids'),
    vc: await import('../src/vessel/vesselControl'),
  };
  const c = m.regions.regionById(map)!.coast!;
  const t = c.pkg.terrain;
  if (t.chunked) throw new Error('whole-mesh maps only here');
  const bin = readFileSync(join(root, 'public', t.dir, t.file));
  m.coast.registerCoastTerrain(map, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer, t, c.pkg.box, c.x, c.z);
  return m;
}

describe('traffic on the Voyage maps', { timeout: 60000 }, () => {
  let oban: Awaited<ReturnType<typeof load>>;
  beforeAll(async () => {
    oban = await load('oban');
  });

  it('at the Oban start a ship can be called on every heading, in water deep enough for her, out of plain view', () => {
    const m = oban;
    const { world, vesselId } = m.world.createWorld(new m.ids.IdFactory(), 'pilotBoat', { harbour: true });
    const v = world.vessels[vesselId];
    const t = m.traffic.createTraffic(0);
    for (const hdg of [0, 90, 180, 270]) {
      m.vc.placeVessel(v, v.position[0], 0, v.position[2], hdg);
      let ok = 0;
      for (let i = 0; i < 10; i++) {
        const s = m.traffic.spawnShip(world, t, v);
        if (!s) continue;
        ok++;
        expect(m.terrain.groundHeight(s.x, s.z)).toBeLessThan(-m.config.CONFIG.traffic.ships[s.type].minDepth);
        expect(Math.hypot(s.x - v.position[0], s.z - v.position[2])).toBeGreaterThanOrEqual(m.config.CONFIG.traffic.confined.minStart);
      }
      expect(ok).toBeGreaterThanOrEqual(8);
      t.ships.length = 0;
    }
  });

  it('over twenty minutes at Oban the ships come and go, and none is ever aground', () => {
    const m = oban;
    const { world, vesselId } = m.world.createWorld(new m.ids.IdFactory(), 'pilotBoat', { harbour: true, weather: true });
    world.environment.waves = [];
    const v = world.vessels[vesselId];
    let seen = 0;
    let steps = 0;
    const ids = new Set<string>();
    for (let s = 0; s < 1200; s += DT) {
      m.sim.stepWorld(world, [], DT);
      world.environment.waves = [];
      steps++;
      for (const sh of world.traffic!.ships) {
        ids.add(sh.id);
        if (steps % 20 === 0) expect(m.terrain.groundHeight(sh.x, sh.z), `${sh.name} ${sh.type} at ${sh.x | 0},${sh.z | 0}`).toBeLessThan(-m.config.CONFIG.traffic.ships[sh.type].minDepth + 1);
      }
      seen = Math.max(seen, world.traffic!.ships.length);
    }
    expect(seen).toBeGreaterThanOrEqual(2);
    expect(ids.size).toBeGreaterThanOrEqual(3);
    expect(v).toBeTruthy();
  });

  it('in Loch Sween (Tayvallich) ships of less draught find a run', async () => {
    const m = await load('tayvallich');
    const { world, vesselId } = m.world.createWorld(new m.ids.IdFactory(), 'pilotBoat', { harbour: true });
    const v = world.vessels[vesselId];
    const t = m.traffic.createTraffic(0);
    let ok = 0;
    for (let i = 0; i < 10; i++) {
      const s = m.traffic.spawnShip(world, t, v);
      if (s) ok++;
    }
    expect(ok).toBeGreaterThanOrEqual(7);
  });
});

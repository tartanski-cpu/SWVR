/**
 * The Saronic Islands (owner, Oct 2026, from a map picture; "include Hydra and Spetses too";
 * "include Ermioni and Porto Heli harbours as ports too"): the biggest map, 44 by 74 km, for
 * Voyage mode only, in chunks (tools/coast/requests/saronic.yaml), the Aegean theme, and the
 * first with its buildings streamed (package.ts `streamBuildings`: one file per chunk).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setRemotePackage, type ChunkedCoastTerrain, type CoastPackage } from '../src/world/coastRegion';
import { coastSample, registerChunkedCoast, type CoastSample } from '../src/world/coastTerrain';
import { coastGeoOf, coastLatLon } from '../src/world/coastGeo';
import { mapRegion, voyageMap } from '../src/world/maps';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public', 'regions', 'saronic');
const region = JSON.parse(readFileSync(join(dir, 'region.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as CoastPackage & Record<string, unknown>;
const terrain = pkg.terrain as ChunkedCoastTerrain;
const buf = (f: string) => {
  const b = readFileSync(join(dir, f));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const S: CoastSample = { h: 0, r: 0, g: 0, b: 0, fine: false };
const h = (x: number, z: number) => (coastSample(x, z, S), S.h);

beforeAll(() => {
  setRemotePackage(pkg);
  registerChunkedCoast('saronic', buf(terrain.coarse.file), terrain, pkg.box, 0, 0);
});

describe('the Saronic Islands: the pipeline files', () => {
  it('is the requested box, full scale, chunked, every chunk within the budget; the Aegean theme', () => {
    expect(region.bbox).toEqual([23.08, 37.22, 23.58, 37.89]);
    expect((pkg.box.x1 - pkg.box.x0) / 1000).toBeCloseTo(44.1, 0);
    expect((pkg.box.z1 - pkg.box.z0) / 1000).toBeCloseTo(74.5, 0);
    for (const c of terrain.chunks) expect(c.drawn).toBeLessThanOrEqual(12000);
    expect(pkg.skylineStyle).toBe('aegean');
  });

  it('its latitude and longitude: Aegina town reads where it is (about 37.745 N, 23.43 E)', () => {
    const r = mapRegion(voyageMap('saronic')!);
    const b = r.berths.find((x) => x.id === 'aegina-cargo')!;
    const ll = coastLatLon(coastGeoOf(r)!, b.x, b.z);
    expect(ll.lat).toBeCloseTo(37.745, 2);
    expect(ll.lon).toBeCloseTo(23.43, 1);
  });
});

describe('the Saronic Islands: its buildings streamed', () => {
  const chunks = pkg.buildingChunks as { dir: string; chunks: number[] };
  it('the package keeps only the few by its berths; each chunk with buildings has its file, each building in its own chunk', () => {
    expect((pkg.buildings as unknown[]).length).toBeLessThan(100);
    expect(chunks.chunks.length).toBeGreaterThan(20);
    let total = 0;
    for (const k of chunks.chunks) {
      const f = join(dir, chunks.dir, `${k}.json`);
      expect(existsSync(f), f).toBe(true);
      const list = JSON.parse(readFileSync(f, 'utf8')) as { x: number; z: number }[];
      const c = terrain.chunks[k];
      for (const b of list) {
        expect(b.x >= c.x0 && b.x < c.x0 + c.size && b.z >= c.z0 && b.z < c.z0 + c.size).toBe(true);
      }
      total += list.length;
    }
    expect(total).toBeGreaterThan(1500);
    // The package is small, its buildings out of it.
    expect(readFileSync(join(dir, 'package.json')).length).toBeLessThan(1_000_000);
  });
});

describe('the Saronic Islands in Voyage', () => {
  it('starts at Aegina, its berth in water deep enough; every island town and the owner\'s harbours are ports', () => {
    const m = voyageMap('saronic')!;
    const r = mapRegion(m);
    const b = r.berths.find((x) => x.id === m.startBerth)!;
    expect(r.ports.find((p) => p.id === b.portId)?.name).toBe('Aegina');
    expect(h(b.x, b.z)).toBeLessThan(-1.5);
    const names = r.ports.map((p) => p.name);
    for (const n of ['Aegina', 'Agistri (Myloi)', 'Agistri (Skala)', 'Methana pier', 'Poros Harbour', 'Galatas', 'Hydra', 'Spetses', 'Ermioni', 'Porto Heli', 'Perdika', 'Korfos pier', 'Marina Neas Epidavrou']) expect(names, n).toContain(n);
  });

  it('the ferry lines each once, over water: Piraeus to Aegina, Poros, Hydra; the Poros strait', () => {
    const ferries = pkg.ferries as { name: string; path: [number, number][] }[];
    expect(new Set(ferries.map((f) => f.name)).size).toBe(ferries.length);
    const names = ferries.map((f) => f.name);
    for (const n of ['Piraeus - Aegina', 'Piraeus - Poros', 'Piraeus - Hydra', 'Galatas - Poros']) expect(names).toContain(n);
    for (const f of ferries) {
      const mid = f.path[Math.floor(f.path.length / 2)];
      expect(h(mid[0], mid[1]), f.name).toBeLessThan(0);
    }
  });
});

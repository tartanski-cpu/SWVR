/**
 * Ålesund and Sunnmøre (owner, Oct 2026, from a map picture: "next area to make into a map"):
 * 55 by 52 km of West Norway's fjords and islands, for Voyage mode only, in chunks
 * (tools/coast/requests/sunnmore.yaml), the West Norwegian theme, its buildings streamed.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setRemotePackage, type ChunkedCoastTerrain, type CoastPackage } from '../src/world/coastRegion';
import { addCoastChunk, coastSample, registerChunkedCoast, type CoastSample } from '../src/world/coastTerrain';
import { coastGeoOf, coastLatLon } from '../src/world/coastGeo';
import { mapRegion, voyageMap } from '../src/world/maps';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public', 'regions', 'sunnmore');
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
  registerChunkedCoast('sunnmore', buf(terrain.coarse.file), terrain, pkg.box, 0, 0);
});

describe('Ålesund and Sunnmøre: the pipeline files', () => {
  it('is the requested box, full scale, chunked, every chunk within the budget (mountains and all); the West Norwegian theme', () => {
    expect(region.bbox).toEqual([5.55, 62.15, 6.62, 62.62]);
    expect((pkg.box.x1 - pkg.box.x0) / 1000).toBeCloseTo(55.4, 0);
    expect((pkg.box.z1 - pkg.box.z0) / 1000).toBeCloseTo(52.3, 0);
    for (const c of terrain.chunks) expect(c.drawn).toBeLessThanOrEqual(12000);
    expect(pkg.skylineStyle).toBe('west-norwegian');
  });

  it('its latitude and longitude: Ålesund\'s harbour reads where it is (about 62.473 N, 6.15 E)', () => {
    const r = mapRegion(voyageMap('sunnmore')!);
    const b = r.berths.find((x) => x.id === 'alesund-cargo')!;
    const ll = coastLatLon(coastGeoOf(r)!, b.x, b.z);
    expect(ll.lat).toBeCloseTo(62.473, 2);
    expect(ll.lon).toBeCloseTo(6.15, 1);
  });

  it('its mountains: the ground rises over 1,000 m (the Sunnmøre Alps), and the fjords run deep (as deep as the game\'s sea floor goes)', () => {
    let top = -Infinity;
    let deep = Infinity;
    for (let x = pkg.box.x0; x < pkg.box.x1; x += 400) {
      for (let z = pkg.box.z0; z < pkg.box.z1; z += 400) {
        const y = h(x, z);
        top = Math.max(top, y);
        deep = Math.min(deep, y);
      }
    }
    expect(top).toBeGreaterThan(1000);
    expect(deep).toBeLessThan(-40);
  });
});

describe('Ålesund and Sunnmøre: its buildings streamed', () => {
  const chunks = pkg.buildingChunks as { dir: string; chunks: number[] };
  it('the package keeps only the few by its berths; each chunk with buildings has its file, each building in its own chunk', () => {
    expect((pkg.buildings as unknown[]).length).toBeLessThan(400);
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
    expect(total).toBeGreaterThan(10000);
    // The package is small, its buildings out of it.
    expect(readFileSync(join(dir, 'package.json')).length).toBeLessThan(1_000_000);
  });
});

describe('Ålesund and Sunnmøre in Voyage', () => {
  it('starts at Ålesund, its berth in water deep enough; the towns round the fjords are ports', () => {
    const m = voyageMap('sunnmore')!;
    const r = mapRegion(m);
    const b = r.berths.find((x) => x.id === m.startBerth)!;
    expect(r.ports.find((p) => p.id === b.portId)?.name).toBe('Ålesund');
    // Its own chunk's detailed ground (the Brosundet is narrower than the coarse grid's cells).
    const k = terrain.chunks.findIndex((c) => b.x >= c.x0 && b.x < c.x0 + c.size && b.z >= c.z0 && b.z < c.z0 + c.size);
    addCoastChunk('sunnmore', k, buf(terrain.chunks[k].file));
    expect(h(b.x, b.z)).toBeLessThan(-1.5);
    const names = r.ports.map((p) => p.name);
    for (const n of ['Ålesund', 'Hareid', 'Ulsteinvik', 'Fosnavåg', 'Ørsta', 'Sykkylven pier', 'Valderøy småbåthavn', 'Lepsøya']) expect(names, n).toContain(n);
  });

  it('the ferry lines each once, over water: across the Storfjorden and the Vartdalsfjorden, Ålesund to Langevåg, the coastal express', () => {
    const ferries = pkg.ferries as { name: string; path: [number, number][] }[];
    expect(new Set(ferries.map((f) => f.name)).size).toBe(ferries.length);
    const names = ferries.map((f) => f.name);
    for (const n of ['Hareid - Sulesund', 'Ålesund - Langevåg', 'Sykkylven - Magerholm', 'Festøya - Solavågen', 'Hurtigruten']) expect(names).toContain(n);
    for (const f of ferries) {
      const mid = f.path[Math.floor(f.path.length / 2)];
      expect(h(mid[0], mid[1]), f.name).toBeLessThan(0);
    }
  });
});

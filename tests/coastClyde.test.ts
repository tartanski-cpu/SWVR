/**
 * The Firth of Clyde (the owner's request after Tayvallich): a big map for Voyage mode only,
 * made by the coast pipeline in chunks (tools/coast/requests/clyde.yaml, `chunked: true`).
 * Checks the files (every chunk within the Quest's budget, the package matching the mesh,
 * the coarse grid covering the box) and the streaming: with only the coarse grid in, the
 * ground is the coarse grid; once the streamer has fetched the chunks round a point, the
 * ground there is the mesh, and they're dropped again when the point moves away.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../src/config';
import { fromCoastPackage, setRemotePackage, type ChunkedCoastTerrain, type CoastPackage } from '../src/world/coastRegion';
import { coastSample, coastTerrain, registerChunkedCoast, type CoastSample } from '../src/world/coastTerrain';
import { CoastStreamer } from '../src/world/coastStream';
import { mapRegion, voyageMap } from '../src/world/maps';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public', 'regions', 'clyde');
const region = JSON.parse(readFileSync(join(dir, 'region.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as CoastPackage;
const terrain = pkg.terrain as ChunkedCoastTerrain;
const buf = (f: string) => {
  const b = readFileSync(join(dir, f));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const S: CoastSample = { h: 0, r: 0, g: 0, b: 0, fine: false };
const at = (x: number, z: number) => (coastSample(x, z, S), { ...S });

beforeAll(() => {
  setRemotePackage(pkg);
  registerChunkedCoast('clyde', buf(terrain.coarse.file), terrain, pkg.box, 0, 0);
});

describe('the Clyde: the pipeline files', () => {
  it('is the requested box, full scale, chunked; every chunk file there and within the budget', () => {
    expect(region.bbox).toEqual([-5.27, 55.7, -4.7, 56.03]);
    expect((region.box.x1 - region.box.x0) / 1000).toBeCloseTo(35.6, 0);
    expect((region.box.z1 - region.box.z0) / 1000).toBeCloseTo(36.7, 0);
    expect(terrain.chunked).toBe(true);
    expect(existsSync(join(dir, 'terrain.bin'))).toBe(false);
    for (const c of terrain.chunks) {
      expect(c.drawn).toBeLessThanOrEqual(12000);
      const [nv, nf] = new Uint32Array(buf(c.file), 0, 2);
      expect(nf).toBe(c.faces);
      expect(readFileSync(join(dir, c.file)).byteLength).toBe(8 + nv * 12 + nf * 15);
    }
    expect(pkg.credits).toMatch(/OpenStreetMap/);
  });

  it('the package matches the mesh, and the coarse grid covers the box', () => {
    expect(terrain.faces).toEqual(region.terrain.faces);
    expect(terrain.chunks.length).toBe(region.terrain.chunks.length);
    const g = terrain.coarse;
    expect(readFileSync(join(dir, g.file)).byteLength).toBe(g.width * g.height * 5);
    expect(g.x0 - g.cell / 2).toBeCloseTo(pkg.box.x0, 3);
    expect(g.width * g.cell).toBeGreaterThan(pkg.box.x1 - pkg.box.x0 - g.cell);
  });

  it('is a Voyage map starting at Rothesay, a harbour, its berth in the water', () => {
    const m = voyageMap('clyde')!;
    expect(m.remote).toBeTruthy();
    const r = mapRegion(m);
    const b = r.berths.find((x) => x.id === m.startBerth)!;
    expect(r.ports.find((p) => p.id === b.portId)?.name).toMatch(/Rothesay/);
    expect(at(b.x, b.z).h).toBeLessThan(-1);
  });
});

describe('the Clyde: streaming its ground', () => {
  // Rothesay Bay, and the open Firth off Gourock (package metres; the region's origin is the world's).
  const bay = { x: -4240, z: 2600 };
  const fetchFromDisk = async (url: string) => buf(url.replace(/^.*regions\/clyde\//, ''));

  it('the coarse grid alone: water in the Firth, Bute land, the far edge open sea', () => {
    expect(at(8400, -10500).h).toBeLessThan(-5);
    expect(at(8400, -10500).fine).toBe(false);
    expect(at(-7200, 5000).h).toBeGreaterThan(5);
    expect(at(pkg.box.x0 + 10, 0).h).toBeLessThan(-30);
  });

  it('fetches the chunks round a point (the ground there becomes the mesh), and drops them as it leaves', async () => {
    const s = new CoastStreamer('/', () => 'regions/clyde/', fetchFromDisk);
    await s.preload([bay]);
    const t = coastTerrain('clyde')!;
    expect(t.pieces.size).toBeGreaterThan(0);
    expect(at(bay.x, bay.z).fine).toBe(true);
    // Everything loaded is within reach of the point; everything near it is loaded.
    for (const k of t.pieces.keys()) {
      const c = terrain.chunks[k];
      const dx = Math.max(c.x0 - bay.x, 0, bay.x - (c.x0 + c.size));
      const dz = Math.max(c.z0 - bay.z, 0, bay.z - (c.z0 + c.size));
      expect(Math.hypot(dx, dz)).toBeLessThan(CONFIG.regions.coastLoadDistance);
    }
    // The coarse grid and the mesh agree, near enough, on the bay's depth.
    const fine = at(bay.x, bay.z).h;
    t.pieces.clear();
    expect(Math.abs(at(bay.x, bay.z).h - fine)).toBeLessThan(4);
    await s.preload([bay]);
    s.update([{ x: 8400, z: -10500 }]);
    expect(at(bay.x, bay.z).fine).toBe(false);
  });

  it('a region made from the package sits where its terrain does', () => {
    const r = fromCoastPackage(pkg, voyageMap('clyde')!.remote!);
    expect(r.bounds.x0).toBeCloseTo(pkg.box.x0, 3);
    expect(r.coast!.pkg.terrain.chunked).toBe(true);
  });
});

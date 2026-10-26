/**
 * Turku and the Archipelago Sea (owner, Oct 2026, after the "Next Waters" research): a big map
 * for Voyage mode only, in chunks (tools/coast/requests/turku.yaml), the first with the Baltic
 * theme. Checks the files (every chunk within the Quest's budget, the package matching the
 * mesh), the start at the Port of Turku, and what keeps a map of thousands of islands to the
 * size of the others: the cottage jetties drawn but not ports, only the named ferry lines,
 * the creel grounds thinned.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setRemotePackage, type ChunkedCoastTerrain, type CoastPackage } from '../src/world/coastRegion';
import { coastSample, registerChunkedCoast, type CoastSample } from '../src/world/coastTerrain';
import { coastGeoOf, coastLatLon } from '../src/world/coastGeo';
import { mapRegion, voyageMap } from '../src/world/maps';
import { CONFIG } from '../src/config';
import { gantryParts } from '../src/world/coastStructures';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public', 'regions', 'turku');
const region = JSON.parse(readFileSync(join(dir, 'region.json'), 'utf8'));
const harbours = JSON.parse(readFileSync(join(dir, 'harbours.json'), 'utf8')) as { harbours: { id: string; private?: boolean; pieces: string[] }[] };
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
  registerChunkedCoast('turku', buf(terrain.coarse.file), terrain, pkg.box, 0, 0);
});

describe('Turku: the pipeline files', () => {
  it('is the requested box, full scale, chunked, every chunk within the budget; the Baltic theme', () => {
    expect(region.bbox).toEqual([21.78, 60.16, 22.45, 60.5]);
    expect((pkg.box.x1 - pkg.box.x0) / 1000).toBeCloseTo(36.9, 0);
    expect((pkg.box.z1 - pkg.box.z0) / 1000).toBeCloseTo(37.8, 0);
    expect(terrain.chunked).toBe(true);
    for (const c of terrain.chunks) expect(c.drawn).toBeLessThanOrEqual(12000);
    expect(terrain.chunks.length).toBe(region.terrain.chunks.length);
    expect(pkg.skylineStyle).toBe('baltic');
    expect(pkg.credits).toMatch(/OpenStreetMap/);
  });

  it('its latitude and longitude: the Port of Turku reads where it is (about 60.44 N, 22.22 E)', () => {
    const r = mapRegion(voyageMap('turku')!);
    const b = r.berths.find((x) => x.id === 'port-of-turku-cargo')!;
    const ll = coastLatLon(coastGeoOf(r)!, b.x, b.z);
    expect(ll.lat).toBeCloseTo(60.44, 1);
    expect(ll.lon).toBeCloseTo(22.22, 1);
  });
});

describe('Turku in Voyage', () => {
  it('starts at the Port of Turku, its cargo berth in water deep enough, the yard at Perno a port too', () => {
    const m = voyageMap('turku')!;
    const r = mapRegion(m);
    const b = r.berths.find((x) => x.id === m.startBerth)!;
    expect(r.ports.find((p) => p.id === b.portId)?.name).toBe('Port of Turku');
    expect(h(b.x, b.z)).toBeLessThan(-3);
    const names = r.ports.map((p) => p.name);
    for (const n of ['Perno shipyard', 'Pargas Guest Harbour', 'Nagu Gästhamn', 'Naantali pier']) expect(names).toContain(n);
  });

  it('the cottage jetties are drawn but are not ports: about as many ports as the Clyde, none named just "D"', () => {
    const priv = harbours.harbours.filter((x) => x.private);
    expect(priv.length).toBeGreaterThan(300);
    const ports = new Set(pkg.ports.map((p) => p.id));
    for (const x of priv) expect(ports.has(x.id)).toBe(false);
    // Their piers are still in the map, solid: every piece the harbours stage built is a block.
    const hbBlocks = (JSON.parse(readFileSync(join(dir, 'harbours.json'), 'utf8')) as { blocks: unknown[] }).blocks;
    expect((pkg.blocks as unknown[]).length).toBe(hbBlocks.length);
    expect(pkg.ports.length).toBeGreaterThan(30);
    expect(pkg.ports.length).toBeLessThan(70);
    expect(pkg.ports.filter((p) => p.name.length < 3)).toEqual([]);
  });

  it('only the named ferry lines, each once, every one over water', () => {
    const ferries = pkg.ferries as { name: string; path: [number, number][] }[];
    expect(ferries.length).toBeGreaterThan(8);
    expect(ferries.length).toBeLessThan(20);
    expect(ferries.every((f) => f.name)).toBe(true);
    expect(new Set(ferries.map((f) => f.name)).size).toBe(ferries.length);
    for (const f of ferries) {
      const mid = f.path[Math.floor(f.path.length / 2)];
      expect(h(mid[0], mid[1]), f.name).toBeLessThan(0);
    }
  });

  it('the creel grounds round the charted rocks, thinned to 1.2 km apart', () => {
    const pots = pkg.pottingGrounds as { x: number; z: number }[];
    expect(pots.length).toBeGreaterThan(50);
    expect(pots.length).toBeLessThan(400);
    for (let i = 0; i < pots.length; i++) for (let j = i + 1; j < pots.length; j++) expect(Math.hypot(pots[i].x - pots[j].x, pots[i].z - pots[j].z)).toBeGreaterThanOrEqual(1200);
  });
});

describe('Turku: the Perno yard\'s gantry cranes (owner, from photos of the yard)', () => {
  it('the map\'s gantry track along the building dock: 743 m, 156 m between the rails, two gantries', () => {
    const r = mapRegion(voyageMap('turku')!);
    expect(r.gantries).toHaveLength(1);
    const g = r.gantries![0];
    expect(g.length).toBeGreaterThan(700);
    expect(g.span).toBeGreaterThan(150);
    expect(g.count).toBe(2);
    // By the Perno shipyard port.
    const perno = r.ports.find((p) => p.id === 'perno-shipyard')!;
    expect(Math.hypot(g.x - perno.x, g.z - perno.z)).toBeLessThan(1000);
  });

  it('each gantry stands its full height over the rails and spans them', () => {
    const g = mapRegion(voyageMap('turku')!).gantries![0];
    const parts = gantryParts(g);
    let y1 = -Infinity;
    let y0 = Infinity;
    for (const p of parts) {
      p.computeBoundingBox();
      y1 = Math.max(y1, p.boundingBox!.max.y);
      y0 = Math.min(y0, p.boundingBox!.min.y);
    }
    expect(y1 - g.base).toBeGreaterThan(CONFIG.structures.gantry.height);
    expect(y0).toBeLessThan(g.base + 1);
    const tris = parts.reduce((t, p) => t + p.attributes.position.count / 3, 0);
    expect(tris).toBeLessThan(2000);
  });
});

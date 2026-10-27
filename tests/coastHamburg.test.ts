/**
 * The Port of Hamburg (owner, Oct 2026: "I'd like a Hamburg harbour map"): a river port for
 * Voyage mode only, in chunks (tools/coast/requests/hamburg.yaml), the first with the
 * Hanseatic theme and the first with no coastline in the map data: its water is the Elbe's,
 * the canals' and the docks' outlines (reconcile.ts `inlandWater`), held to a dredged depth.
 * Checks the files, the start at the Landungsbrücken, the water where the river is and the
 * land where the city is, the harbour ferry lines each once over water, and the
 * Köhlbrandbrücke standing high over the Köhlbrand.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setRemotePackage, type ChunkedCoastTerrain, type CoastPackage } from '../src/world/coastRegion';
import { coastSample, registerChunkedCoast, type CoastSample } from '../src/world/coastTerrain';
import { coastGeoOf, coastLatLon, coastWorld } from '../src/world/coastGeo';
import { mapRegion, voyageMap } from '../src/world/maps';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public', 'regions', 'hamburg');
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
  registerChunkedCoast('hamburg', buf(terrain.coarse.file), terrain, pkg.box, 0, 0);
});

describe('Hamburg: the pipeline files', () => {
  it('is the requested box, full scale, chunked, every chunk within the budget; the Hanseatic theme', () => {
    expect(region.bbox).toEqual([9.82, 53.49, 10.03, 53.56]);
    expect((pkg.box.x1 - pkg.box.x0) / 1000).toBeCloseTo(13.9, 0);
    expect((pkg.box.z1 - pkg.box.z0) / 1000).toBeCloseTo(7.8, 0);
    expect(terrain.chunked).toBe(true);
    for (const c of terrain.chunks) expect(c.drawn).toBeLessThanOrEqual(12000);
    expect(pkg.skylineStyle).toBe('hanseatic');
    expect(pkg.credits).toMatch(/OpenStreetMap/);
  });

  it('its latitude and longitude: the Landungsbrücken read where they are (about 53.545 N, 9.97 E)', () => {
    const r = mapRegion(voyageMap('hamburg')!);
    const b = r.berths.find((x) => x.id === 'landungsbrucken-cargo')!;
    const ll = coastLatLon(coastGeoOf(r)!, b.x, b.z);
    expect(ll.lat).toBeCloseTo(53.545, 2);
    expect(ll.lon).toBeCloseTo(9.97, 1);
  });
});

describe('Hamburg: a river port from the map\'s water outlines', () => {
  const geo = () => coastGeoOf(mapRegion(voyageMap('hamburg')!))!;
  const at = (lat: number, lon: number) => {
    const p = coastWorld(geo(), lat, lon);
    return h(p.x, p.z);
  };

  it('the Elbe is water, dredged no deeper than 15 m; the city is land', () => {
    // The Norderelbe off the Landungsbrücken, and the river off Övelgönne.
    expect(at(53.5435, 9.968)).toBeLessThan(-5);
    expect(at(53.5435, 9.968)).toBeGreaterThanOrEqual(-15.5);
    expect(at(53.5425, 9.92)).toBeLessThan(-5);
    // St. Pauli (above the Landungsbrücken) and Wilhelmsburg are land.
    expect(at(53.552, 9.965)).toBeGreaterThan(0);
    expect(at(53.505, 10.0)).toBeGreaterThan(0);
  });
});

describe('Hamburg in Voyage', () => {
  it('starts at the Landungsbrücken, its berth in water deep enough; the harbour\'s quays and piers are ports', () => {
    const m = voyageMap('hamburg')!;
    const r = mapRegion(m);
    const b = r.berths.find((x) => x.id === m.startBerth)!;
    expect(r.ports.find((p) => p.id === b.portId)?.name).toBe('Landungsbrücken');
    expect(h(b.x, b.z)).toBeLessThan(-3);
    const names = r.ports.map((p) => p.name);
    for (const n of ['Finkenwerder', 'Blohm + Voss', 'Maritimes Museum', 'Burchardkai', 'Teufelsbrücker Hafen']) expect(names).toContain(n);
    expect(r.ports.length).toBeLessThan(100);
  });

  it('the harbour ferry lines, each once, every one over water; a line known by its number reads "Line 62"', () => {
    const ferries = pkg.ferries as { name: string; path: [number, number][] }[];
    expect(ferries.length).toBeGreaterThan(8);
    expect(ferries.length).toBeLessThan(20);
    expect(new Set(ferries.map((f) => f.name)).size).toBe(ferries.length);
    expect(ferries.map((f) => f.name)).toContain('Line 62');
    for (const f of ferries) {
      const mid = f.path[Math.floor(f.path.length / 2)];
      expect(h(mid[0], mid[1]), f.name).toBeLessThan(0);
    }
  });

  it('the Köhlbrandbrücke stands 55 m up, every piece of it, and crosses the Köhlbrand (the map gives no height; the request does)', () => {
    const k = (pkg.bridges as { name: string; deck: number; path: [number, number][] }[]).filter((b) => b.name === 'Köhlbrandbrücke');
    expect(k.length).toBeGreaterThan(0);
    for (const b of k) expect(b.deck).toBe(55);
    expect(k.some((b) => b.path.some(([x, z]) => h(x, z) < -8))).toBe(true);
  });
});

/**
 * Syros (the owner's request, Oct 2026): the first Aegean map, a whole island in the Cyclades,
 * chunked for Voyage mode (tools/coast/requests/syros.yaml). Checks the files (every chunk
 * within the budget), that the Greek names came out in the Latin alphabet (ids too), and that
 * the map starts at Ermoupoli's harbour with water at its berth, the island land and the sea
 * round it deep.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setRemotePackage, type ChunkedCoastTerrain, type CoastPackage } from '../src/world/coastRegion';
import { coastSample, registerChunkedCoast, type CoastSample } from '../src/world/coastTerrain';
import { CoastStreamer } from '../src/world/coastStream';
import { mapRegion, voyageMap } from '../src/world/maps';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'regions', 'syros');
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
  registerChunkedCoast('syros', buf(terrain.coarse.file), terrain, pkg.box, 0, 0);
});

describe('Syros', () => {
  it('is chunked, every chunk within the budget', () => {
    expect(terrain.chunked).toBe(true);
    for (const c of terrain.chunks) expect(c.drawn).toBeLessThanOrEqual(12000);
    expect(pkg.credits).toMatch(/OpenStreetMap/);
  });

  it('names and ids in the Latin alphabet, ids unique', () => {
    const named = [...pkg.ports, ...pkg.berths, ...pkg.lights, ...pkg.landmarks] as { name: string; id?: string }[];
    for (const n of named) {
      expect(n.name, n.name).not.toMatch(/[\u0370-\u03ff]/);
      if (n.id !== undefined) expect(n.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
    expect(new Set(pkg.ports.map((p) => p.id)).size).toBe(pkg.ports.length);
  });

  it('starts at Ermoupoli, the sheltered harbour, in water; the island land, the edge open sea', async () => {
    const m = voyageMap('syros')!;
    const r = mapRegion(m);
    const b = r.berths.find((x) => x.id === m.startBerth)!;
    const port = r.ports.find((p) => p.id === b.portId)!;
    expect(port.name).toBe('Ermoupoli');
    expect(port.kind).toBe('harbour');
    await new CoastStreamer('/', () => 'regions/syros/', async (url) => buf(url.replace(/^.*regions\/syros\//, ''))).preload([{ x: b.x, z: b.z }]);
    expect(at(b.x, b.z).fine).toBe(true);
    expect(at(b.x, b.z).h).toBeLessThan(-1.5);
    expect(at(-2500, 0).h).toBeGreaterThan(20); // the hills west of Ermoupoli
    expect(at(pkg.box.x0 + 10, 0).h).toBeLessThan(-30);
  });

  it('every cargo berth has water under it', async () => {
    const r = mapRegion(voyageMap('syros')!);
    const s = new CoastStreamer('/', () => 'regions/syros/', async (url) => buf(url.replace(/^.*regions\/syros\//, '')));
    for (const p of r.ports) {
      if (!p.cargo.berth) continue;
      await s.preload([{ x: p.cargo.berth.x, z: p.cargo.berth.z }]);
      expect(at(p.cargo.berth.x, p.cargo.berth.z).h, `${p.id} cargo berth`).toBeLessThan(-1.5);
    }
  });
});

/**
 * The coast pipeline's product (tools/coast; milestone 1): the generated Oban region in
 * public/regions/oban/. Reads the files as the viewer (and later the game) does and checks
 * they hang together: every face's corners exist and lie in the box, the chunks cover the
 * faces in order, land and sea are both there, and the credits and licence travel with it.
 * (The pipeline itself needs its own tools and the network; this tests what it wrote.)
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'regions', 'oban');
const region = JSON.parse(readFileSync(join(dir, 'region.json'), 'utf8'));
const bin = readFileSync(join(dir, 'terrain.bin'));
const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer;
const t = region.terrain;
const V = new Float32Array(ab, t.vertices.offset, t.vertices.count * 3);
const F = new Uint32Array(ab, t.faces.offset, t.faces.count * 3);

describe('the Oban coast region (pipeline milestone 1)', () => {
  it('is the requested place: about 11.7 x 11.1 km round Oban, full scale', () => {
    expect(region.id).toBe('oban');
    expect(region.bbox).toEqual([-5.56, 56.375, -5.37, 56.475]);
    expect((region.box.x1 - region.box.x0) / 1000).toBeCloseTo(11.7, 0);
    expect((region.box.z1 - region.box.z0) / 1000).toBeCloseTo(11.1, 0);
  });

  it('every face has real corners inside the box; heights from the seabed to the hills', () => {
    // Counted, then checked once (an expect per vertex made this slow enough to crowd other tests).
    let lo = Infinity;
    let hi = -Infinity;
    let badFace = 0;
    let outside = 0;
    for (let i = 0; i < F.length; i++) if (F[i] >= t.vertices.count) badFace++;
    const b = region.box;
    for (let v = 0; v < t.vertices.count; v++) {
      const [x, y, z] = [V[v * 3], V[v * 3 + 1], V[v * 3 + 2]];
      if (x < b.x0 - 1 || x > b.x1 + 1 || z < b.z0 - 1 || z > b.z1 + 1) outside++;
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    expect(badFace).toBe(0);
    expect(outside).toBe(0);
    expect(lo).toBeLessThan(-10); // the sea floor
    expect(hi).toBeGreaterThan(150); // the hills behind Oban
  });

  it('the chunks run through the faces in order, each within the budget', () => {
    let next = 0;
    for (const c of region.chunks) {
      expect(c.start).toBe(next);
      next += c.count;
      expect(c.count).toBeLessThanOrEqual(12000); // the Quest's budget per chunk (mesh.ts chunkBudget)
    }
    // Then the deep seabed: not drawn, there for the game's physics.
    expect(next).toBe(t.deep.start);
    expect(t.deep.start + t.deep.count).toBe(t.faces.count);
    expect(t.deep.start).toBeLessThan(120000);
  });

  it('the coastline came with it, and the credits and the ODbL licence', () => {
    expect(region.coast.length).toBeGreaterThan(20);
    expect(region.credits).toMatch(/OpenStreetMap/);
    expect(region.licence).toMatch(/ODbL/);
    expect(readFileSync(join(dir, 'sources.yaml'), 'utf8')).toMatch(/Copernicus/);
  });
});

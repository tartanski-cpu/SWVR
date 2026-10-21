/**
 * The trees (the settlements brief, Part B, milestone 4): the coast pipeline's forest map
 * (tools/coast/src/trees.ts, packed) read back (world/forest.ts), and the scatter
 * (world/view/treesView.ts): the same trees every time, never closer than the woods'
 * spacing, a plantation all conifers in rows, a natural wood mixed, and every model small.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { forestCell, registerForest, type Forest } from '../src/world/forest';
import { scatterTile, treeGeometry, type TreeModel } from '../src/world/view/treesView';
import oban from '../src/world/regions/oban.coast.json';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = oban as unknown as { trees: Parameters<typeof registerForest>[2] };
let f: Forest;

beforeAll(() => {
  const b = readFileSync(join(root, 'public', 'regions', 'oban', pkg.trees.file));
  f = registerForest('oban', b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, pkg.trees, 0, 0);
});

/** The first tile of the map (100 m) whose middle is mostly of `kind` (1 plantation ... 6 orchard). */
function tileOf(kind: number): [number, number] {
  const L = f.layout;
  for (let j = 0; j < L.height; j += 5)
    for (let i = 0; i < L.width; i += 5) {
      let n = 0;
      for (let dj = 0; dj < 5; dj++) for (let di = 0; di < 5; di++) if (f.cells[(j + dj) * L.width + i + di] >> 4 === kind && (f.cells[(j + dj) * L.width + i + di] & 15) > 10) n++;
      if (n >= 24) return [L.x0 + i * L.cell, L.z0 + j * L.cell];
    }
  throw new Error(`no tile of kind ${kind}`);
}

describe('the forest map', () => {
  it("Oban's is the whole box, unpacked, with plantations, natural woods and scrub", () => {
    const L = f.layout;
    expect(f.cells.length).toBe(L.width * L.height);
    const kinds = new Set<number>();
    for (const c of f.cells) if (c & 15) kinds.add(c >> 4);
    for (const k of [1, 3, 4, 5]) expect(kinds.has(k), `kind ${k}`).toBe(true);
    // No trees at sea: the open water at the box's edge.
    expect(forestCell(f, L.x0 + 30, L.z0 + 30)).toBe(0);
  });
});

describe('scattering the trees', () => {
  it('the same tile gives the same trees', () => {
    const [x, z] = tileOf(4);
    expect(scatterTile(f, 7, x, z, 100)).toEqual(scatterTile(f, 7, x, z, 100));
    expect(scatterTile(f, 8, x, z, 100)).not.toEqual(scatterTile(f, 7, x, z, 100));
  });

  it('a natural wood: scattered (none closer than its spacing), mixed species, each tree its own size and colour', () => {
    const [x, z] = tileOf(4);
    const trees = scatterTile(f, 7, x, z, 100);
    expect(trees.length).toBeGreaterThan(20);
    const rMin = Math.min(...Object.values(f.layout.styles).filter((s) => !s.rows).map((s) => s.spacing));
    for (let a = 0; a < trees.length; a++) for (let b = a + 1; b < trees.length; b++) expect(Math.hypot(trees[a].x - trees[b].x, trees[a].z - trees[b].z)).toBeGreaterThanOrEqual(rMin - 1e-6);
    expect(new Set(trees.map((t) => t.model)).size).toBeGreaterThan(1);
    expect(new Set(trees.map((t) => t.height.toFixed(2))).size).toBeGreaterThan(trees.length * 0.8);
    expect(new Set(trees.map((t) => t.r.toFixed(3))).size).toBeGreaterThan(3);
  });

  it('a plantation: all conifers, in rows, much of a height', () => {
    const [x, z] = tileOf(1);
    const trees = scatterTile(f, 7, x, z, 100).filter((t) => (forestCell(f, t.x, t.z) >> 4) === 1);
    expect(trees.length).toBeGreaterThan(50);
    expect(new Set(trees.map((t) => t.model))).toEqual(new Set([0]));
    const hs = trees.map((t) => t.height);
    expect(Math.max(...hs) - Math.min(...hs)).toBeLessThan(4);
  });

  it('every model is under 50 triangles', () => {
    for (const m of ['conifer', 'broadleaf', 'birch', 'scrub', 'pine'] as TreeModel[]) expect(treeGeometry(m).attributes.position.count / 3).toBeLessThan(50);
  });
});

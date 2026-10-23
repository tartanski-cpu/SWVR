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

describe('the far bands (milestone 5)', () => {
  it('the middle band is sparser than the near one, and its models cheaper', async () => {
    const { scatterMid, midTreeGeometry } = await import('../src/world/view/treesView');
    const [x, z] = tileOf(4);
    const near = scatterTile(f, 7, x, z, 100).length;
    const mid = scatterMid(f, 7, x, z, 100).length;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(near * 0.75);
    for (const m of ['conifer', 'broadleaf', 'birch', 'scrub', 'pine'] as TreeModel[]) expect(midTreeGeometry(m).attributes.position.count / 3).toBeLessThan(treeGeometry(m).attributes.position.count / 3);
  });

  it('the canopy stands over the woods only, above the ground, highest over a plantation', async () => {
    const { canopyArrays } = await import('../src/world/view/treesView');
    const { CONFIG } = await import('../src/config');
    const [x, z] = tileOf(1);
    const S = CONFIG.trees.canopySquare;
    const sx = Math.floor(x / S) * S;
    const sz = Math.floor(z / S) * S;
    const a = canopyArrays(f, sx, sz);
    expect(a.position.length).toBeGreaterThan(0);
    expect(a.position.length / 9).toBeLessThan((S / CONFIG.trees.canopyCell) ** 2 * 10);
    // Its top stands a plantation's height over its skirts' feet (on the ground).
    let top = -Infinity;
    let foot = Infinity;
    for (let i = 1; i < a.position.length; i += 3) ((top = Math.max(top, a.position[i])), (foot = Math.min(foot, a.position[i])));
    expect(top - foot).toBeGreaterThan(CONFIG.trees.canopyHeight.plantation * 0.6);
    // And a square of open sea has none.
    expect(canopyArrays(f, f.layout.x0 - 4 * S, f.layout.z0 - 4 * S).position.length).toBe(0);
  });
});

describe('tree detail by device', () => {
  it('a standalone headset is the Quest level; a desktop browser far; the setting overrides', async () => {
    const { isStandaloneHeadset } = await import('../src/render/device');
    const { treeLevel, treeSettings } = await import('../src/world/view/treesView');
    const { userSettings } = await import('../src/player/userSettings');
    const { CONFIG } = await import('../src/config');
    expect(isStandaloneHeadset('Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 OculusBrowser/35.0 Chrome/126 VR Safari/537.36')).toBe(true);
    expect(isStandaloneHeadset('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36')).toBe(false);
    userSettings.treeDetail = 'desktop';
    expect(treeLevel()).toBe('desktop');
    expect(treeSettings().nearDistance).toBe(CONFIG.trees.desktop.nearDistance);
    expect(treeSettings().midDistance).toBeGreaterThan(CONFIG.trees.midDistance);
    userSettings.treeDetail = 'quest';
    expect(treeSettings().nearDistance).toBe(CONFIG.trees.nearDistance);
    userSettings.treeDetail = 'auto';
  });

  it("the canopy against shimmering far off: below the crowns, no scrub or orchards in it, drawn a little deeper", async () => {
    const { canopyCellHeight } = await import('../src/world/view/treesView');
    const { CONFIG } = await import('../src/config');
    const t = CONFIG.trees;
    expect(canopyCellHeight('scrub', 15)).toBe(0);
    expect(canopyCellHeight('orchard', 15)).toBe(0);
    // A full plantation's canopy stands below its trees' crowns, by at least a couple of metres.
    expect(canopyCellHeight('plantation', 15)).toBeCloseTo(t.canopyHeight.plantation * t.canopyTop, 5);
    expect(t.canopyHeight.plantation - canopyCellHeight('plantation', 15)).toBeGreaterThanOrEqual(2);
    expect(t.canopyDepthOffset.factor).toBeGreaterThan(0);
  });
});


/**
 * The landmarks and bridges pass (owner: "I would have expected a bridge at the Falls of Lora
 * in the Oban map. And there's actually a very famous landmark in Oban, which is like a mini
 * Colosseum."): Oban's Connel Bridge and McCaig's Tower from the map data, their geometry
 * (world/coastStructures.ts), and McCaig's floodlight poles no longer drawn as radio masts.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../src/config';
import type { WholeCoastTerrain } from '../src/world/coastRegion';
import { bridgeParts, follyParts, structuresGeometry } from '../src/world/coastStructures';
import { registerCoastTerrain } from '../src/world/coastTerrain';
import { mapRegion, VOYAGE_MAPS } from '../src/world/maps';
import { groundHeight } from '../src/world/terrain';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OBAN = mapRegion(VOYAGE_MAPS.find((m) => m.id === 'oban')!);
const bridge = OBAN.bridges![0];
const folly = OBAN.follies![0];

// Oban's ground (its mesh), placed as in the game.
beforeAll(() => {
  const c = OBAN.coast!;
  const t = c.pkg.terrain as WholeCoastTerrain;
  const b = readFileSync(join(root, 'public', t.dir, t.file));
  registerCoastTerrain('oban', b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, t, c.pkg.box, c.x, c.z);
});
const middle = (ps: [number, number][]) => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];
const box = (parts: { computeBoundingBox(): void; boundingBox: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null }[]) => {
  const b = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
  for (const p of parts) {
    p.computeBoundingBox();
    const bb = p.boundingBox!;
    b.x0 = Math.min(b.x0, bb.min.x);
    b.y0 = Math.min(b.y0, bb.min.y);
    b.z0 = Math.min(b.z0, bb.min.z);
    b.x1 = Math.max(b.x1, bb.max.x);
    b.y1 = Math.max(b.y1, bb.max.y);
    b.z1 = Math.max(b.z1, bb.max.z);
  }
  return b;
};

describe('Oban: Connel Bridge and McCaig\'s Tower (the landmarks and bridges pass)', () => {
  it('Connel Bridge over the Falls of Lora: a cantilever road bridge, its deck over the water, from bank to bank', () => {
    expect(bridge.name).toBe('Connel Bridge');
    expect(bridge.structure).toBe('cantilever');
    expect(bridge.deck).toBeGreaterThan(6);
    const [a, e] = [bridge.path[0], bridge.path[bridge.path.length - 1]];
    expect(Math.hypot(e[0] - a[0], e[1] - a[1])).toBeGreaterThan(150);
    // Its ends on land, its middle over the water.
    const [mx, mz] = middle([a, e]);
    expect(groundHeight(mx, mz)).toBeLessThan(0);
    expect(groundHeight(a[0], a[1])).toBeGreaterThan(0);
    expect(groundHeight(e[0], e[1])).toBeGreaterThan(0);
  });

  it('its model: the deck level at the deck height, the trusses under it reaching down to the piers on the banks', () => {
    const b = box(bridgeParts(bridge, groundHeight));
    expect(b.y1).toBeLessThan(bridge.deck + 2); // nothing over the deck but the parapets
    expect(b.y0).toBeLessThan(3); // the piers reach down to the water's edge
    const [a, e] = [bridge.path[0], bridge.path[bridge.path.length - 1]];
    expect(Math.hypot(b.x1 - b.x0, b.z1 - b.z0)).toBeGreaterThan(Math.hypot(e[0] - a[0], e[1] - a[1]));
  });

  it("McCaig's Tower on its hill above the town: its oval footprint, a ring of arches in two tiers round it", () => {
    expect(folly.name).toBe("McCaig's Tower");
    const xs = folly.outline.map((p) => p[0]);
    const zs = folly.outline.map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(45);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(45);
    expect(folly.base).toBeGreaterThan(40);
    const parts = follyParts(folly);
    const b = box(parts);
    expect(b.y1).toBeCloseTo(folly.base + CONFIG.structures.folly.height, 3);
    // A pier, two bands, a sill and a cornice a bay: about 180 m round, a bay every 3.8 m.
    expect(parts.length / 5).toBeGreaterThan(40);
    expect(parts.length / 5).toBeLessThan(60);
  });

  it('one mesh for the lot, a few thousand triangles', () => {
    const g = structuresGeometry(OBAN.bridges!, OBAN.follies!, groundHeight)!;
    const tris = g.attributes.position.count / 3;
    expect(tris).toBeGreaterThan(1000);
    expect(tris).toBeLessThan(10000);
    expect(structuresGeometry([], [], groundHeight)).toBeNull();
  });

  it("McCaig's floodlight poles aren't drawn as radio masts", () => {
    const [cx, cz] = middle(folly.outline);
    expect((OBAN.skyline ?? []).filter((s) => s.kind === 'mast' && Math.hypot(s.x - cx, s.z - cz) < 100)).toEqual([]);
  });
});

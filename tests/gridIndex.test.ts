/**
 * The spatial index (world/gridIndex.ts) the physics uses on big maps for shelter zones,
 * piers and berths: a point query must return every item whose box covers the point (never
 * miss one a full search would find), in the items' own order (the first block covering a
 * point is the one you stand on).
 */
import { describe, expect, it } from 'vitest';
import { GridIndex } from '../src/world/gridIndex';

describe('GridIndex', () => {
  it('finds every item covering a point, in order, anywhere in the world', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const items = Array.from({ length: 400 }, (_, i) => ({ i, x: (rnd() - 0.5) * 40000, z: (rnd() - 0.5) * 40000, r: 5 + rnd() * 900 }));
    const index = new GridIndex(items, (t) => [t.x - t.r, t.z - t.r, t.x + t.r, t.z + t.r]);
    for (let n = 0; n < 3000; n++) {
      const x = (rnd() - 0.5) * 42000;
      const z = (rnd() - 0.5) * 42000;
      const want = items.filter((t) => Math.abs(x - t.x) <= t.r && Math.abs(z - t.z) <= t.r).map((t) => t.i);
      const got = index.at(x, z).filter((t) => Math.abs(x - t.x) <= t.r && Math.abs(z - t.z) <= t.r).map((t) => t.i);
      expect(got).toEqual(want);
    }
  });
});

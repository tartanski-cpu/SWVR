/**
 * Fishing and potting grounds on the Voyage maps (owner, Oct 2026: "I'd like to have some
 * fishing areas on all the maps"; Sunnmøre's 2,746 potting grounds too many; Hamburg, an
 * industrial harbour, none): tools/coast/src/package.ts places them from each map's own water.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VOYAGE_MAPS } from '../src/world/maps';

type Ground = { name: string; x: number; z: number; radius: number; species?: string };
function packageOf(id: string): { fishingGrounds: Ground[]; pottingGrounds: Ground[]; ports: { x: number; z: number }[] } {
  for (const f of [`public/regions/${id}/package.json`, `src/world/regions/${id}.coast.json`]) {
    try {
      return JSON.parse(readFileSync(f, 'utf8'));
    } catch {
      // Not this one.
    }
  }
  throw new Error(`no package for ${id}`);
}

describe('the Voyage maps\' fishing and potting grounds', () => {
  for (const m of VOYAGE_MAPS) {
    const pkg = packageOf(m.id);
    if (m.id === 'hamburg') {
      it('Hamburg, a river port: no grounds', () => {
        expect(pkg.fishingGrounds).toEqual([]);
        expect(pkg.pottingGrounds).toEqual([]);
      });
      continue;
    }
    it(`${m.name}: fishing grounds, each named once, apart, within a day's run of a harbour; potting grounds not too many`, () => {
      expect(pkg.fishingGrounds.length).toBeGreaterThanOrEqual(2);
      const names = pkg.fishingGrounds.map((g) => g.name);
      expect(new Set(names).size).toBe(names.length);
      for (const g of pkg.fishingGrounds) {
        expect(g.species, g.name).toBeTruthy();
        expect(Math.min(...pkg.ports.map((p) => Math.hypot(p.x - g.x, p.z - g.z))), g.name).toBeLessThan(12000);
        for (const o of pkg.fishingGrounds) if (o !== g) expect(Math.hypot(o.x - g.x, o.z - g.z)).toBeGreaterThanOrEqual(2500);
      }
      expect(pkg.pottingGrounds.length).toBeGreaterThan(0);
      expect(pkg.pottingGrounds.length).toBeLessThanOrEqual(150);
    });
  }
});

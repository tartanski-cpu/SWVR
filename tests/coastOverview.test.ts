import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VOYAGE_MAPS } from '../src/world/maps';

// The front page's map picker (world/coastMapPicker.ts) draws regions/overview.json
// (tools/coast/src/overview.ts): it must list every Voyage map as maps.ts does, and offer
// only berths the maps have.
const overview = JSON.parse(readFileSync('public/regions/overview.json', 'utf8')) as {
  world: { land: [number, number][][] };
  maps: { id: string; name: string; blurb: string; startBerth?: string; bbox: number[]; coast: [number, number][][]; ports: { name: string; at: [number, number]; berth?: string }[] }[];
};

function packageOf(id: string): { bbox: number[]; berths: { id: string }[] } {
  for (const f of [`public/regions/${id}/package.json`, `src/world/regions/${id}.coast.json`]) {
    try {
      return JSON.parse(readFileSync(f, 'utf8'));
    } catch {
      // Not this one.
    }
  }
  throw new Error(`no package for ${id}`);
}

describe('the map picker overview', () => {
  it('lists every Voyage map, as maps.ts names them', () => {
    expect(overview.maps.map((m) => m.id)).toEqual(VOYAGE_MAPS.map((m) => m.id));
    for (const m of VOYAGE_MAPS) {
      const o = overview.maps.find((x) => x.id === m.id)!;
      expect(o.name).toBe(m.name);
      expect(o.blurb).toBe(m.blurb);
      expect(o.startBerth).toBe(m.startBerth);
    }
  });

  it("offers only berths the map has, at ports inside its box, and the map's start among them", () => {
    for (const o of overview.maps) {
      const pkg = packageOf(o.id);
      expect(o.bbox).toEqual(pkg.bbox);
      const berths = new Set(pkg.berths.map((b) => b.id));
      // (A port on the box's very edge may sit a few metres beyond it.)
      const [lon0, lat0, lon1, lat1] = [o.bbox[0] - 0.01, o.bbox[1] - 0.01, o.bbox[2] + 0.01, o.bbox[3] + 0.01];
      for (const p of o.ports) {
        if (p.berth) expect(berths.has(p.berth), `${o.id}: ${p.berth}`).toBe(true);
        expect(p.at[0] >= lon0 && p.at[0] <= lon1 && p.at[1] >= lat0 && p.at[1] <= lat1, `${o.id}: ${p.name}`).toBe(true);
      }
      expect(berths.has(o.startBerth!), `${o.id} start`).toBe(true);
      expect(o.coast.length, `${o.id} coast`).toBeGreaterThan(0);
    }
  });

  it('stays small enough for the front page', () => {
    expect(JSON.stringify(overview).length).toBeLessThan(400_000);
    expect(overview.world.land.length).toBeGreaterThan(20);
  });
});

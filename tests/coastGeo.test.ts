/**
 * Real latitude and longitude on the Voyage maps (world/coastGeo.ts; the review, 24 Oct 2026:
 * the GPS and chart gave the career archipelago's made-up positions on every coast map). Each
 * package carries its box in degrees; the game's grid inverts the pipeline's projection.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coastGeoOf, coastLatLon, coastWorld } from '../src/world/coastGeo';
import { setRemotePackage, type CoastPackage } from '../src/world/coastRegion';
import { mapRegion, voyageMap } from '../src/world/maps';
import { latLonOf } from '../src/voyage/metaverse';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const region = (id: string) => {
  const m = voyageMap(id)!;
  if (id === 'clyde' || id === 'syros') setRemotePackage(JSON.parse(readFileSync(join(root, 'public/regions', id, 'package.json'), 'utf8')) as CoastPackage);
  return mapRegion(m);
};

describe('latitude and longitude on the coast maps', () => {
  it('every map: its weather point (a real place) reads back where it is, both ways', () => {
    for (const id of ['oban', 'tayvallich', 'clyde', 'syros']) {
      const g = coastGeoOf(region(id))!;
      expect(g, id).not.toBeNull();
      const at = voyageMap(id)!.weatherAt;
      const p = coastWorld(g, at.lat, at.lon);
      const back = coastLatLon(g, p.x, p.z);
      expect(back.lat, id).toBeCloseTo(at.lat, 9);
      expect(back.lon, id).toBeCloseTo(at.lon, 9);
    }
  });

  it('Syros reads in the Aegean, not Scotland; Oban as the Timber handoff places it', () => {
    const s = coastGeoOf(region('syros'))!;
    const c = coastLatLon(s, s.x, s.z);
    expect(c.lat).toBeCloseTo(37.44, 2);
    expect(c.lon).toBeCloseTo(24.9375, 3);
    const o = coastGeoOf(region('oban'))!;
    for (const [x, z] of [[0, 0], [5000, -7000], [-3000, 2000]]) {
      const a = coastLatLon(o, x, z);
      const b = latLonOf('oban', x, z)!;
      expect(a.lat).toBeCloseTo(b.lat, 9);
      expect(a.lon).toBeCloseTo(b.lon, 9);
    }
  });

  it('north is up and east is right: a kilometre north is about 0.009°, a kilometre east more at Oban\'s latitude', () => {
    const o = coastGeoOf(region('oban'))!;
    const a = coastLatLon(o, 0, 0);
    expect(coastLatLon(o, 0, -1000).lat - a.lat).toBeCloseTo(1000 / 111195, 5);
    expect(coastLatLon(o, 1000, 0).lon - a.lon).toBeGreaterThan(0.016);
  });
});

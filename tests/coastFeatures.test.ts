/**
 * The coast pipeline's features stage (the coast extras plan, C1): each Voyage map's
 * features file is where its package says, holds what its counts say, lies inside the map,
 * and finds the things a sailor there would know; and the package's report names the piers
 * drawn over each other (Rothesay's start spot).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CoastFeatures } from '../src/world/coastFeatures';
import type { CoastPackage } from '../src/world/coastRegion';
import { mapRegion, VOYAGE_MAPS } from '../src/world/maps';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const json = <T>(p: string) => JSON.parse(readFileSync(join(root, p), 'utf8')) as T;
const pkgOf = (id: string): CoastPackage => {
  const m = VOYAGE_MAPS.find((v) => v.id === id)!;
  return m.remote ? json<CoastPackage>(`public/regions/${id}/package.json`) : mapRegion(m).coast!.pkg;
};
const features = (id: string) => json<CoastFeatures>(`public/regions/${id}/${pkgOf(id).features!.file}`);
const near = (p: { x: number; z: number }, q: { x: number; z: number }, d: number) => Math.hypot(p.x - q.x, p.z - q.z) < d;

describe('coast features (C1)', () => {
  for (const m of VOYAGE_MAPS) {
    it(`${m.id}: the file the package names, everything inside the map`, () => {
      const pkg = pkgOf(m.id);
      expect(pkg.features?.file).toBe('features.json');
      const f = features(m.id);
      expect(pkg.features!.counts.fogSignals).toBe(f.fogSignals.length);
      expect(pkg.features!.counts.ferryRoutes).toBe(f.ferries.routes.length);
      const b = pkg.box;
      const inside = (x: number, z: number) => x >= b.x0 - 1 && x <= b.x1 + 1 && z >= b.z0 - 1 && z <= b.z1 + 1;
      for (const p of [...f.landmarks, ...f.names, ...f.fogSignals, ...f.wrecks, ...f.ferries.terminals, ...f.farmland]) expect(inside(p.x, p.z), JSON.stringify(p)).toBe(true);
      expect(f.names.length).toBeGreaterThan(10);
    });
  }

  it('Oban: its castles, its ferries, its cables to Kerrera', () => {
    const f = features('oban');
    const castles = f.landmarks.filter((l) => l.kind === 'castle').map((l) => l.name);
    expect(castles).toEqual(expect.arrayContaining(['Dunstaffnage Castle', 'Dunollie Castle', 'Gylen Castle']));
    expect(f.ferries.routes.map((r) => r.name)).toContain('Oban - Craignure');
    expect(f.names.find((n) => n.name === 'Oban')?.rank).toBe(1);
    expect(f.cables.some((c) => /Kerrera/.test(c.name))).toBe(true);
  });

  it('the Clyde: Rothesay to Wemyss Bay, the fog bell at Rothesay, the sugar boat', () => {
    const f = features('clyde');
    const ports = pkgOf('clyde').ports;
    const rothesay = ports.find((p) => p.id === 'rothesay-harbour')!;
    const route = f.ferries.routes.find((r) => r.name === 'Rothesay - Wemyss Bay')!;
    expect(route).toBeTruthy();
    const ends = [route.path[0], route.path[route.path.length - 1]].map(([x, z]) => ({ x, z }));
    expect(ends.some((e) => near(e, rothesay, 600))).toBe(true);
    expect(f.fogSignals.some((s) => near(s, rothesay, 300))).toBe(true);
    expect(f.wrecks.map((w) => w.name)).toContain('MV Captayannis');
    expect(f.landmarks.filter((l) => l.kind === 'turbine').length).toBeGreaterThan(40);
    expect(f.names.filter((n) => n.rank === 1).map((n) => n.name)).toEqual(expect.arrayContaining(['Rothesay', 'Dunoon', 'Largs', 'Greenock']));
  });

  it('Syros: names in Latin letters, ferries to the other islands', () => {
    const f = features('syros');
    expect(f.names.map((n) => n.name)).toContain('Ermoupoli');
    for (const n of f.names) expect(n.name, n.name).toMatch(/^[\p{Script=Latin}\d\s.'’()-]+$/u);
    expect(f.ferries.routes.length).toBeGreaterThanOrEqual(5);
  });

  it('the report names the piers drawn over each other (Rothesay\'s start spot was, until its harbour pier was built along its outline)', () => {
    const report = json<{ warnings: string[] }>('public/regions/clyde/report.json');
    // Rothesay's harbour pier, one box round its T, covered the low pier inside it (where
    // the owner was stood "underneath the big wooden one"); built along its outline, it doesn't.
    expect(report.warnings.some((w) => w.startsWith('overlapping piers at rothesay-harbour'))).toBe(false);
    // The check itself still finds them where they are (Sandbank's pontoon under its pier).
    expect(report.warnings.some((w) => w.startsWith('overlapping piers at sandbank'))).toBe(true);
    // Each warning once (the stage re-run doesn't pile them up).
    expect(new Set(report.warnings).size).toBe(report.warnings.length);
  });
});

/**
 * The second coast region (the owner's request after M4): Tayvallich and Loch Sween, made by
 * the coast pipeline (tools/coast/requests/tayvallich.yaml) and loaded in the game by the
 * coast region test (`?coast=tayvallich`) in place of the Sounds and the Fjord. Checks the
 * pipeline's files (the box, the chunk budget, the deep seabed, the credits) and the world
 * the game makes of them: the regions apart, ids unique, the ground the mesh, Tayvallich a
 * working harbour, the Fairy Isles anchorage in water at the head of Caol Scotnish, every
 * port workable, and the way in from home open water north of Calder Haven.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WholeCoastTerrain } from '../src/world/coastRegion';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public', 'regions', 'tayvallich');
const region = JSON.parse(readFileSync(join(dir, 'region.json'), 'utf8'));
type Mods = {
  regions: typeof import('../src/world/regions');
  arch: typeof import('../src/world/archipelago');
  terrain: typeof import('../src/world/terrain');
  coast: typeof import('../src/world/coastTerrain');
  geo: typeof import('../src/world/geography');
};
let m: Mods;

beforeAll(async () => {
  // The mode is read once at import (src/mode.ts): a voyage page on this map, then the world fresh.
  vi.stubGlobal('location', { pathname: '/voyage.html', search: '?map=tayvallich', href: 'https://localhost/voyage.html?map=tayvallich' });
  vi.resetModules();
  m = {
    regions: await import('../src/world/regions'),
    arch: await import('../src/world/archipelago'),
    terrain: await import('../src/world/terrain'),
    coast: await import('../src/world/coastTerrain'),
    geo: await import('../src/world/geography'),
  };
  const r = m.regions.regionById('tayvallich')!;
  const c = r.coast!;
  const bin = readFileSync(join(root, 'public', (c.pkg.terrain as WholeCoastTerrain).dir, (c.pkg.terrain as WholeCoastTerrain).file));
  m.coast.registerCoastTerrain('tayvallich', bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer, (c.pkg.terrain as WholeCoastTerrain), c.pkg.box, c.x, c.z);
});

describe('the Tayvallich region: the pipeline files', () => {
  it('is the requested box, full scale, its chunks within the budget, the deep seabed after them', () => {
    expect(region.bbox).toEqual([-5.72, 55.925, -5.54, 56.065]);
    expect((region.box.x1 - region.box.x0) / 1000).toBeCloseTo(11.2, 0);
    expect((region.box.z1 - region.box.z0) / 1000).toBeCloseTo(15.6, 0);
    let next = 0;
    for (const c of region.chunks) {
      expect(c.start).toBe(next);
      expect(c.count).toBeLessThanOrEqual(12000);
      next += c.count;
    }
    expect(next).toBe(region.terrain.deep.start);
    expect(region.credits).toMatch(/OpenStreetMap/);
  });

  it("the package matches the mesh files (re-run the pipeline's package stage after the mesh)", () => {
    const t = m.regions.regionById('tayvallich')!.coast!.pkg.terrain as WholeCoastTerrain;
    expect(t.faces).toEqual(region.terrain.faces);
    expect(t.vertices).toEqual(region.terrain.vertices);
  });
});

describe('Tayvallich in the game (coast region test)', () => {
  const local = (x: number, z: number) => {
    const c = m.regions.regionById('tayvallich')!.coast!;
    return m.terrain.groundHeight(x + c.x, z + c.z);
  };

  it('replaces the Sounds and the Fjord; the regions stand apart; ids unique', () => {
    expect(m.regions.REGIONS.map((r) => r.id)).toEqual(['tayvallich']);
    const R = m.regions.REGIONS;
    for (let i = 0; i < R.length; i++)
      for (let j = i + 1; j < R.length; j++) {
        const a = R[i].bounds;
        const b = R[j].bounds;
        expect(a.x1 < b.x0 || b.x1 < a.x0 || a.z1 < b.z0 || b.z1 < a.z0, `${R[i].id} and ${R[j].id} overlap`).toBe(true);
      }
    for (const list of [m.arch.PORTS, m.arch.BERTHS, m.arch.SLIPWAYS, m.arch.POTTING_GROUNDS]) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('the ground is the mesh: Loch Sween and Caol Scotnish water, Taynish land, the open-sea floor at the edge', () => {
    // In the package's own metres (tools/coast projection): Loch Sween's middle, Caol Scotnish, the Taynish woods.
    expect(local(-112, 1268)).toBeLessThan(-2);
    expect(local(2351, -4959)).toBeLessThan(-1);
    expect(local(-1000, -1500)).toBeGreaterThan(5);
    const b = m.regions.regionById('tayvallich')!.bounds;
    expect(m.terrain.groundHeight(b.x0 + 5, (b.z0 + b.z1) / 2)).toBeLessThan(-30);
  });

  it('Tayvallich is the sheltered harbour, with a cargo berth in the water and its goods ashore', () => {
    const r = m.regions.regionById('tayvallich')!;
    const t = r.ports.find((p) => p.id === 'tayvallich')!;
    expect(t.kind).toBe('harbour');
    expect(m.terrain.groundHeight(t.cargo.berth!.x, t.cargo.berth!.z)).toBeLessThan(-1.5);
    expect(m.geo.standingHeight(t.cargo.stackX, t.cargo.stackZ)).toBeGreaterThan(0.2);
    expect(r.berths.some((b) => b.id === 'tayvallich-cargo')).toBe(true);
  });

  it('the Fairy Isles anchorage lies in water at the head of Caol Scotnish', () => {
    const r = m.regions.regionById('tayvallich')!;
    const a = r.ports.find((p) => p.kind === 'anchorage')!;
    expect(a.name).toMatch(/Fairy Isles/);
    expect(m.terrain.groundHeight(a.cargo.anchorage!.x, a.cargo.anchorage!.z)).toBeLessThan(-1.5);
    expect(m.geo.standingHeight(a.cargo.stackX, a.cargo.stackZ)).toBeGreaterThan(0.2);
  });

  it('every port is workable', () => {
    for (const p of m.regions.regionById('tayvallich')!.ports) {
      if (p.cargo.berth) expect(m.terrain.groundHeight(p.cargo.berth.x, p.cargo.berth.z), `${p.id} cargo berth`).toBeLessThan(-1.5);
      expect(m.geo.standingHeight(p.cargo.stackX, p.cargo.stackZ), `${p.id} stack`).toBeGreaterThan(0.2);
    }
  });

  it('the way in: open water on its south edge, and on into the Sound of Jura', () => {
    const r = m.regions.regionById('tayvallich')!;
    const c = r.coast!;
    // The channel up from the box's south edge to Loch Sween's mouth (x -3500 to -2750 in the
    // package, 800 m in from the edge), Calder Haven due south of it.
    expect(m.terrain.groundHeight(-3100 + c.x, r.bounds.z1 - 800)).toBeLessThan(-2); // open water, a fathom and more (a workboat draws ~1.2 m)
    // The loch's mouth, and the Sound of Jura to the west.
    expect(local(-2400, 5000)).toBeLessThan(-5);
    expect(local(-5400, 5000)).toBeLessThan(-5);
  });
});

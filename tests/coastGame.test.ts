/**
 * The coast region in the game (coast pipeline milestone 4): with the debug toggle on, Oban
 * (src/world/regions/oban.ts, the pipeline's package) takes the place of the Sounds and the
 * Fjord. Its ground is the package's mesh (coastTerrain.ts), read here from disk as the game
 * fetches it. Checks the world it makes: the regions apart, the ids unique, the ground the
 * mesh (and the open-sea floor at its edges), every port workable (water at the cargo berth,
 * the stack ashore, a fuel berth where there's fuel), the marks afloat, and the way in from
 * home: Kerrera Sound's south entrance open water, north of Calder Haven.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
type Mods = {
  regions: typeof import('../src/world/regions');
  arch: typeof import('../src/world/archipelago');
  terrain: typeof import('../src/world/terrain');
  coast: typeof import('../src/world/coastTerrain');
  geo: typeof import('../src/world/geography');
};
let m: Mods;

beforeAll(async () => {
  // The toggle is read once at import: set it, then load the world fresh.
  const store: Record<string, string> = { 'swvr.coastRegion': 'oban' };
  vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v), removeItem: (k: string) => delete store[k] });
  vi.resetModules();
  m = {
    regions: await import('../src/world/regions'),
    arch: await import('../src/world/archipelago'),
    terrain: await import('../src/world/terrain'),
    coast: await import('../src/world/coastTerrain'),
    geo: await import('../src/world/geography'),
  };
  const oban = m.regions.regionById('oban')!;
  const c = oban.coast!;
  const bin = readFileSync(join(root, 'public', c.pkg.terrain.dir, c.pkg.terrain.file));
  m.coast.registerCoastTerrain('oban', bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer, c.pkg.terrain, c.pkg.box, c.x, c.z);
});

describe('Oban in the game (coast region test)', () => {
  it('replaces the Sounds and the Fjord; the regions stand apart', () => {
    expect(m.regions.COAST_REGION).toBe('oban');
    expect(m.regions.REGIONS.map((r) => r.id)).toEqual(['home', 'oban', 'narrows']);
    const R = m.regions.REGIONS;
    for (let i = 0; i < R.length; i++)
      for (let j = i + 1; j < R.length; j++) {
        const a = R[i].bounds;
        const b = R[j].bounds;
        const apart = a.x1 < b.x0 || b.x1 < a.x0 || a.z1 < b.z0 || b.z1 < a.z0;
        expect(apart, `${R[i].id} and ${R[j].id} overlap`).toBe(true);
      }
  });

  it('ids are unique across the world', () => {
    for (const list of [m.arch.PORTS, m.arch.BERTHS, m.arch.SLIPWAYS, m.arch.CURRENTS, m.arch.POTTING_GROUNDS]) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('the ground is the mesh: the town above the water, the bay below, the open-sea floor at the edge', () => {
    const oban = m.regions.regionById('oban')!;
    const at = (x: number, z: number) => m.terrain.groundHeight(x + oban.coast!.x, z + oban.coast!.z);
    // In the package's own metres: Oban's town rises behind its bay; the bay is water.
    expect(at(-200, 1300)).toBeGreaterThan(5);
    expect(at(-1300, 1100)).toBeLessThan(-3);
    // The box's edge has faded to the game's open-sea floor, as the sea outside it.
    const b = oban.bounds;
    expect(m.terrain.groundHeight(b.x0 + 5, (b.z0 + b.z1) / 2)).toBeLessThan(-30);
    expect(m.terrain.groundHeight(b.x0 - 50, (b.z0 + b.z1) / 2)).toBe(-m.arch.MAX_DEPTH);
  });

  it('every port is workable: water at its cargo berth, its goods ashore, fuel where offered', () => {
    const oban = m.regions.regionById('oban')!;
    for (const p of oban.ports) {
      if (p.cargo.berth) {
        expect(m.terrain.groundHeight(p.cargo.berth.x, p.cargo.berth.z), `${p.id} cargo berth`).toBeLessThan(-1.5);
        expect(oban.berths.some((b) => b.id === `${p.id}-cargo`)).toBe(true);
      } else expect(m.terrain.groundHeight(p.cargo.anchorage!.x, p.cargo.anchorage!.z)).toBeLessThan(-3);
      expect(m.geo.standingHeight(p.cargo.stackX, p.cargo.stackZ), `${p.id} stack`).toBeGreaterThan(0.2);
      if (p.fuel) expect(oban.berths.some((b) => b.id === `${p.id}-fuel`)).toBe(true);
    }
    expect(oban.ports.some((p) => p.id === 'oban' && p.kind === 'harbour')).toBe(true);
  });

  it('the marks float, and the race is where the Falls of Lora are', () => {
    const oban = m.regions.regionById('oban')!;
    for (const mk of oban.marks) expect(m.terrain.groundHeight(mk.x, mk.z), mk.name).toBeLessThan(-1);
    expect(oban.currents.map((c) => c.name)).toEqual(['Falls of Lora']);
    expect(m.terrain.groundHeight(oban.currents[0].x, oban.currents[0].z)).toBeLessThan(0);
  });

  it("the way in from home: Kerrera Sound's south entrance is open water, north of Calder Haven", () => {
    const calder = m.arch.PORTS.find((p) => p.id === 'calder')!;
    const oban = m.regions.regionById('oban')!;
    // In the package's metres: the entrance (-4300, 4700), and up the sound (-3700, 3700), as
    // the pipeline's test boat ran it (milestone 2).
    const ex = -4300 + oban.coast!.x;
    expect(Math.abs(ex - calder.x)).toBeLessThan(300);
    expect(m.terrain.groundHeight(ex, 4700 + oban.coast!.z)).toBeLessThan(-3);
    expect(m.terrain.groundHeight(-3700 + oban.coast!.x, 3700 + oban.coast!.z)).toBeLessThan(-3);
    // And the entrance faces the open sea south of it (the box's faded edge, then the sea floor).
    expect(m.terrain.groundHeight(ex, oban.bounds.z1 + 300)).toBeLessThan(-30);
  });

  it('has its own chart sheet, the archipelago sheet takes it in', async () => {
    const { SHEETS } = await import('../src/nav/chartSheets');
    const oban = m.regions.regionById('oban')!;
    const sheet = SHEETS.find((x) => x.id === 'oban')!;
    expect(sheet.title).toBe('OBAN AND LORN');
    for (const v of Object.values(sheet.bounds)) expect(Number.isFinite(v)).toBe(true);
    const arch = SHEETS.find((x) => x.id === 'archipelago')!;
    expect(arch.bounds.z0).toBeLessThan(oban.bounds.z0 + 1000);
    expect(arch.title).toMatch(/OBAN AND LORN/);
  });

  it("the package matches the region's files (re-run the pipeline's package stage after the mesh)", () => {
    const oban = m.regions.regionById('oban')!;
    const region = JSON.parse(readFileSync(join(root, 'public', 'regions', 'oban', 'region.json'), 'utf8'));
    const t = oban.coast!.pkg.terrain;
    expect(t.faces).toEqual(region.terrain.faces);
    expect(t.vertices).toEqual(region.terrain.vertices);
    expect(t.chunks.length).toBe(region.chunks.length);
  });
});


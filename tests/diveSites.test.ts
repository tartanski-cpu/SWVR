/**
 * Dive sites (dive/diveSites.ts; docs/dive-contract.md): wrecks for the submersible game on the
 * career map and the Oban map, some shallow, some mid, some deep (owner, Oct 2026). Each at the
 * depth it says, in the band it says, clear of the potting grounds.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { bandOf, DIVE_SITES, siteWorld, sitesOn } from '../src/dive/diveSites';

describe('dive sites', () => {
  it('eight, ids unique, each in the band its depth puts it, shallow, mid and deep on both maps', () => {
    expect(DIVE_SITES).toHaveLength(8);
    expect(new Set(DIVE_SITES.map((s) => s.id)).size).toBe(DIVE_SITES.length);
    for (const s of DIVE_SITES) expect(bandOf(s.depthM), s.id).toBe(s.band);
    for (const map of ['career', 'oban']) {
      const bands = new Set(sitesOn(map).map((s) => s.band));
      expect([...bands].sort(), map).toEqual(['deep', 'mid', 'shallow']);
    }
    expect(sitesOn(null)).toEqual([]);
  });

  it('the career sites lie at their charted depths, clear of the potting grounds', async () => {
    vi.resetModules();
    const terrain = await import('../src/world/terrain');
    const { POTTING_GROUNDS } = await import('../src/world/archipelago');
    for (const s of sitesOn('career')) {
      const at = siteWorld(s)!;
      expect(-terrain.groundHeight(at.x, at.z), s.id).toBeCloseTo(s.depthM, -0.7); // within about 2.5 m
      for (const p of POTTING_GROUNDS) expect(Math.hypot(p.x - at.x, p.z - at.z), `${s.id} by ${p.name}`).toBeGreaterThan(p.radius + 60);
    }
  });

  it('the Oban sites lie at their charted depths on the real seabed, clear of its potting grounds', async () => {
    vi.stubGlobal('location', { pathname: '/voyage.html', search: '?map=oban', href: 'https://localhost/voyage.html?map=oban' });
    vi.resetModules();
    const regions = await import('../src/world/regions');
    const coast = await import('../src/world/coastTerrain');
    const c = regions.regionById('oban')!.coast!;
    const tt = c.pkg.terrain;
    if (tt.chunked) throw new Error('whole-mesh map expected');
    const bin = readFileSync(`public/${tt.dir}${tt.file}`);
    coast.registerCoastTerrain('oban', bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer, tt, c.pkg.box, c.x, c.z);
    const terrain = await import('../src/world/terrain');
    const dive = await import('../src/dive/diveSites');
    const pots = (JSON.parse(readFileSync('src/world/regions/oban.coast.json', 'utf8')).pottingGrounds as { name: string; x: number; z: number; radius: number }[]).map((p) => ({ ...p, x: p.x + c.x, z: p.z + c.z }));
    for (const s of dive.sitesOn('oban')) {
      const at = dive.siteWorld(s)!;
      expect(-terrain.groundHeight(at.x, at.z), s.id).toBeGreaterThan(s.depthM - 4);
      expect(-terrain.groundHeight(at.x, at.z), s.id).toBeLessThan(s.depthM + 4);
      for (const p of pots) expect(Math.hypot(p.x - at.x, p.z - at.z), `${s.id} by ${p.name}`).toBeGreaterThan(p.radius + 60);
    }
    vi.unstubAllGlobals();
  });
});

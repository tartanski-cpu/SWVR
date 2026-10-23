/**
 * Short, steep seas in enclosed water, long ones in the open (ocean/windSea.ts, world/fetch.ts;
 * docs/FETCH_SEAS.md): the JONSWAP figures, a sheltered bay's sea short and its long waves
 * small next to open water's in the same wind, on the real Oban ground and in the hand-built
 * archipelago; the crests never loop in a storm; Debug's off switch gives the old sea back.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

async function loadOban() {
  vi.stubGlobal('location', { pathname: '/voyage.html', search: '?map=oban', href: 'https://localhost/voyage.html?map=oban' });
  vi.resetModules();
  const regions = await import('../src/world/regions');
  const coast = await import('../src/world/coastTerrain');
  const c = regions.regionById('oban')!.coast!;
  const t = c.pkg.terrain;
  if (t.chunked) throw new Error('whole-mesh map expected');
  const bin = readFileSync(`public/${t.dir}${t.file}`);
  coast.registerCoastTerrain('oban', bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer, t, c.pkg.box, c.x, c.z);
  return {
    ws: await import('../src/ocean/windSea'),
    fetch: await import('../src/world/fetch'),
    env: await import('../src/environment/environmentState'),
    waves: await import('../src/ocean/waves'),
    config: (await import('../src/config')).CONFIG,
  };
}

/** The sea at a spot as the waves give it: its Hs (m) and its energy-weighted mean period (s). */
function seaHere(m: Awaited<ReturnType<typeof loadOban>>, x: number, z: number, wind: number, windFrom: number) {
  const w = m.ws.windSeaField()!;
  const comps = m.env.seaStateWaves(Math.min(3, wind * m.config.weather.seaPerWind), (windFrom + 180) % 360, w.max);
  const here = m.ws.windSeaAt(x, z, { a: [0, 0, 0], e: 1 });
  let e2 = 0;
  let te = 0;
  for (const c of comps) {
    const a = c.chop ? here.a[c.train ?? 0] : c.amplitude * here.e;
    e2 += (a * a) / 2;
    te += ((a * a) / 2) * c.period;
  }
  return { hs: 4 * Math.sqrt(e2), period: te / Math.max(1e-9, e2), e: here.e };
}

describe('short seas by fetch', () => {
  it('the JONSWAP figures: a gale over 3 km, 15 km and 100 km of fetch; capped at the fully developed sea', async () => {
    const { jonswap } = await import('../src/ocean/windSea');
    const loch = jonswap(20, 3000);
    const firth = jonswap(20, 15000);
    const open = jonswap(20, 100000);
    expect(loch.hs).toBeCloseTo(0.56, 1);
    expect(loch.tp).toBeCloseTo(2.5, 0);
    expect(firth.hs).toBeCloseTo(1.25, 1);
    expect(open.hs).toBeCloseTo(3.2, 0);
    expect(open.tp).toBeCloseTo(7.9, 0);
    // Steeper the shorter the fetch (Hs over the deep-water wavelength g Tp^2 / 2 pi).
    const steep = (s: { hs: number; tp: number }) => s.hs / ((9.81 * s.tp * s.tp) / (2 * Math.PI));
    expect(steep(loch)).toBeGreaterThan(steep(firth));
    expect(steep(firth)).toBeGreaterThan(steep(open));
    // Fully developed: no more however long the fetch.
    expect(jonswap(10, 1e7).hs).toBeCloseTo(0.2433 * 100 / 9.81, 3);
    expect(jonswap(0, 5000).hs).toBe(0);
  });

  it('Oban in a south-westerly gale: in Ardantrive Bay a short steep sea, the long waves small; out in the open water the long sea', async () => {
    const m = await loadOban();
    const t0 = performance.now();
    m.ws.updateWindSea(20, 225);
    const ms = performance.now() - t0;
    const g = m.fetch.fetchGrid();
    expect(g.nx * g.nz).toBeLessThanOrEqual(m.config.ocean.fetchSeas.maxCells + g.nx + g.nz);
    // The most open water on the map.
    const f = m.ws.windSeaField()!;
    let best = -1;
    let at = 0;
    for (let i = 0; i < g.nx * g.nz; i++) if (!g.land[i] && f.data[i * 4 + 3] > best) [best, at] = [f.data[i * 4 + 3], i];
    const ox = g.x0 + ((at % g.nx) + 0.5) * g.cell;
    const oz = g.z0 + (Math.floor(at / g.nx) + 0.5) * g.cell;
    const open = seaHere(m, ox, oz, 20, 225);
    const bay = seaHere(m, 2722, -5981, 20, 225);
    expect(bay.e).toBeLessThan(0.5);
    expect(open.e).toBeGreaterThan(bay.e + 0.2);
    expect(bay.period).toBeLessThan(open.period - 1);
    expect(bay.hs).toBeGreaterThan(0.2);
    console.log(`fetch field for Oban: ${g.nx}x${g.nz} cells of ${g.cell.toFixed(0)} m, ${ms.toFixed(0)} ms; open Hs ${open.hs.toFixed(2)} m at ${open.period.toFixed(1)} s, bay Hs ${bay.hs.toFixed(2)} m at ${bay.period.toFixed(1)} s`);
  });

  it("a storm's crests never loop anywhere: the long waves' and short trains' Σ Q·k·A under the cap at every water cell", async () => {
    const m = await loadOban();
    m.ws.updateWindSea(30, 200);
    const f = m.ws.windSeaField()!;
    const comps = m.env.seaStateWaves(3, 20, f.max);
    const g = f.grid;
    let worst = 0;
    for (let j = 0; j < g.nz; j++) {
      for (let i = 0; i < g.nx; i++) {
        if (g.land[j * g.nx + i]) continue;
        const here = m.ws.windSeaAt(g.x0 + (i + 0.5) * g.cell, g.z0 + (j + 0.5) * g.cell, { a: [0, 0, 0], e: 1 });
        let s = 0;
        for (const c of comps) {
          const a = c.chop ? here.a[c.train ?? 0] : c.amplitude * here.e;
          s += c.steepness * m.waves.wavenumberFromPeriod(c.period) * a;
        }
        worst = Math.max(worst, s);
      }
    }
    expect(worst).toBeLessThan(m.waves.LOOP_CAP);
  });

  it('Debug off: no short trains, the long waves everywhere as before; on again: the field back', async () => {
    const m = await loadOban();
    m.ws.updateWindSea(15, 225);
    expect(m.ws.windSeaAt(2722, -5981, { a: [0, 0, 0], e: 1 }).e).toBeLessThan(1);
    m.ws.setShortSeasOff(true);
    m.ws.updateWindSea(15, 225);
    const off = m.ws.windSeaAt(2722, -5981, { a: [0, 0, 0], e: 1 });
    expect(off.e).toBe(1);
    expect(off.a.every((a) => a === 0)).toBe(true);
    m.ws.setShortSeasOff(false);
    m.ws.updateWindSea(15, 225);
    expect(m.ws.windSeaAt(2722, -5981, { a: [0, 0, 0], e: 1 }).e).toBeLessThan(1);
  });
});

describe('short seas in the hand-built archipelago', () => {
  it('the open ocean round the islands fully exposed; in a harbour bay the long waves smaller and a short sea', async () => {
    vi.stubGlobal('location', { pathname: '/career.html', search: '', href: 'https://localhost/career.html' });
    vi.resetModules();
    const ws = await import('../src/ocean/windSea');
    const fetch = await import('../src/world/fetch');
    const { PORTS } = await import('../src/world/archipelago');
    const t0 = performance.now();
    ws.updateWindSea(18, 225);
    const ms = performance.now() - t0;
    const g = fetch.fetchGrid();
    const f = ws.windSeaField()!;
    let full = 0;
    for (let i = 0; i < g.nx * g.nz; i++) if (!g.land[i] && f.data[i * 4 + 3] >= 250) full++;
    expect(full).toBeGreaterThan(0);
    // Some port's water is less exposed than the open ocean.
    const least = Math.min(...PORTS.map((p) => ws.windSeaAt(p.x, p.z, { a: [0, 0, 0], e: 1 }).e));
    expect(least).toBeLessThan(0.9);
    console.log(`fetch field for the archipelago: ${g.nx}x${g.nz} cells of ${g.cell.toFixed(0)} m, ${ms.toFixed(0)} ms; least exposed port ${least.toFixed(2)}`);
  });
});

/**
 * A chart zoomed in on somewhere far from the boats (the planning chart; owner, Oct 2026: "it
 * only seems to load one area in with detail when I scroll around"): the streamer fetches the
 * detailed ground under it too (world/coastStream.ts viewChart), so its coast is sharp there,
 * but not for a chart zoomed out (the coarse grid serves), with a real map's files read from
 * disk in place of the web.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import type { ChunkedCoastTerrain, CoastPackage } from '../src/world/coastRegion';
import { CoastStreamer } from '../src/world/coastStream';
import { clearCoastTerrains, coastTerrain, registerChunkedCoast } from '../src/world/coastTerrain';

const dir = join('public', 'regions', 'sunnmore');
const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as CoastPackage;
const terrain = pkg.terrain as ChunkedCoastTerrain;
const file = (f: string) => {
  const b = readFileSync(join(dir, f));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

beforeAll(() => {
  clearCoastTerrains();
  registerChunkedCoast('sunnmore', file(terrain.coarse.file), terrain, pkg.box, 0, 0);
});
afterAll(() => clearCoastTerrains());

describe('a chart zoomed in fetches the detailed ground it shows', () => {
  // The boat at Ålesund; the chart on Ørsta, 30 km away (the box's south-east).
  const boat = { x: 3500, z: -9400 };
  const chart = { cx: 4000, cz: 21000 };
  const asked: string[] = [];
  const s = new CoastStreamer('', () => '', async (url) => {
    asked.push(url);
    return file(url);
  });

  it('zoomed out: nothing more than round the boat', async () => {
    const view = {};
    expect(s.viewChart(view, chart.cx, chart.cz, CONFIG.regions.coastChartSpan * 2, 800, 600)).toBe(false);
    await s.preload([boat]);
    const t = coastTerrain('sunnmore')!;
    const far = [...t.pieces.keys()].filter((k) => terrain.chunks[k].z0 > 15000);
    expect(far).toEqual([]);
  });

  it('zoomed in: the chunks under it come, and it says so until they have', async () => {
    const view = {};
    expect(s.viewChart(view, chart.cx, chart.cz, 4000, 800, 600)).toBe(true);
    await s.preload([boat]);
    expect(s.viewChart(view, chart.cx, chart.cz, 4000, 800, 600)).toBe(false);
    const t = coastTerrain('sunnmore')!;
    const under = terrain.chunks.map((c, k) => ({ c, k })).filter(({ c }) => c.x0 < chart.cx + 2000 && c.x0 + c.size > chart.cx - 2000 && c.z0 < chart.cz + 1500 && c.z0 + c.size > chart.cz - 1500);
    expect(under.length).toBeGreaterThan(0);
    for (const { k } of under) expect(t.pieces.has(k), `chunk ${k}`).toBe(true);
  });
});

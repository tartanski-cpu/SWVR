/**
 * Fetch: how far the open water runs from each spot to land, each way (owner, Oct 2026: short,
 * steep seas in enclosed water, long ones in the open; docs/FETCH_SEAS.md). The wind sea grows
 * with the wind and its fetch upwind (ocean/windSea.ts, the JONSWAP relations), and the swell
 * gets in only as far as the water is open toward where it comes from.
 *
 * Worked out from the ground the game already has (terrain.ts groundHeight), once per map, the
 * first time it's asked for (the hand-built archipelago and every coast map alike):
 *   - a grid over the regions in play, cells `cellM` square (coarser on a big map, so it stays
 *     at most `maxCells`): land where the ground is above `landDepth` below the surface;
 *   - for each of `sectors` bearings, each water cell's fetch toward it: a ray from the cell's
 *     middle, a cell at a time, to the first land, at most `fetchMaxM`. A ray that leaves the
 *     grid runs on over open sea: off the map's edge there's no land we know of.
 * The effective fetch for a wind (`effectiveFetch`) is the usual one: the rays either side of
 * the wind's bearing, out to `spreadSectors` each way, weighted by cos² of their angle off
 * it (so a narrow gap to the open sea counts for less than open water all round).
 */
import { CONFIG } from '../config';
import { REGIONS } from './regions';
import { groundHeight } from './terrain';

export interface FetchGrid {
  x0: number;
  z0: number;
  cell: number;
  nx: number;
  nz: number;
  /** 1 on land (or too shallow for a sea to run), per cell, row by row (z then x). */
  land: Uint8Array;
  /** Fetch toward each sector's bearing (m), per cell; computed as first asked for. */
  sectors: (Float32Array | null)[];
}

let grid: FetchGrid | null = null;

/** The fetch grid for the regions in play (built on first use). */
export function fetchGrid(): FetchGrid {
  if (grid) return grid;
  const c = CONFIG.ocean.fetchSeas;
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const r of REGIONS) {
    x0 = Math.min(x0, r.bounds.x0);
    z0 = Math.min(z0, r.bounds.z0);
    x1 = Math.max(x1, r.bounds.x1);
    z1 = Math.max(z1, r.bounds.z1);
  }
  if (!Number.isFinite(x0)) {
    x0 = z0 = -1000;
    x1 = z1 = 1000;
  }
  const area = (x1 - x0) * (z1 - z0);
  const cell = Math.max(c.cellM, Math.sqrt(area / c.maxCells));
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell));
  const nz = Math.max(1, Math.ceil((z1 - z0) / cell));
  const land = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    const z = z0 + (j + 0.5) * cell;
    for (let i = 0; i < nx; i++) land[j * nx + i] = groundHeight(x0 + (i + 0.5) * cell, z, false) > -c.landDepth ? 1 : 0;
  }
  grid = { x0, z0, cell, nx, nz, land, sectors: Array.from({ length: c.sectors }, () => null) };
  // Every sector's fetch now, while the map loads (review, Oct 2026: a wind from a new
  // direction ray-marched its sectors mid-voyage, a hitch on the main thread).
  for (let k = 0; k < c.sectors; k++) sectorFetch(grid, k);
  return grid;
}

/** Forget the grid (a test that changes the map, or registers its ground later). */
export function resetFetch(): void {
  grid = null;
}

/** Each cell's fetch toward sector `k`'s bearing (k × 360/sectors degrees true, 0 north). */
export function sectorFetch(g: FetchGrid, k: number): Float32Array {
  const n = g.sectors.length;
  const kk = ((k % n) + n) % n;
  const have = g.sectors[kk];
  if (have) return have;
  const c = CONFIG.ocean.fetchSeas;
  const out = new Float32Array(g.nx * g.nz);
  const b = (kk * 2 * Math.PI) / n;
  // A step of one cell toward the bearing, in cells (x east, z south: north is -z).
  const sx = Math.sin(b);
  const sz = -Math.cos(b);
  const maxSteps = Math.ceil(c.fetchMaxM / g.cell);
  for (let j = 0; j < g.nz; j++) {
    for (let i = 0; i < g.nx; i++) {
      const at = j * g.nx + i;
      if (g.land[at]) continue;
      let x = i + 0.5;
      let z = j + 0.5;
      let f = c.fetchMaxM;
      for (let s = 1; s <= maxSteps; s++) {
        x += sx;
        z += sz;
        const ci = Math.floor(x);
        const cj = Math.floor(z);
        // Off the grid: open sea the rest of the way.
        if (ci < 0 || cj < 0 || ci >= g.nx || cj >= g.nz) break;
        if (g.land[cj * g.nx + ci]) {
          f = s * g.cell;
          break;
        }
      }
      out[at] = f;
    }
  }
  g.sectors[kk] = out;
  return out;
}

/**
 * Each cell's effective fetch (m) toward a bearing (deg true: for a wind, the way it blows
 * FROM): the rays round it weighted by cos² of their angle off it, between the two sectors
 * either side of the bearing. Land cells: 0.
 */
export function effectiveFetch(g: FetchGrid, bearingDeg: number, out = new Float32Array(g.nx * g.nz)): Float32Array {
  const c = CONFIG.ocean.fetchSeas;
  const n = g.sectors.length;
  const step = 360 / n;
  const at = ((bearingDeg % 360) + 360) % 360 / step;
  const k0 = Math.floor(at);
  const t = at - k0;
  out.fill(0);
  for (const [k, part] of [
    [k0, 1 - t],
    [k0 + 1, t],
  ] as const) {
    if (part <= 0) continue;
    let wsum = 0;
    const rays: [Float32Array, number][] = [];
    for (let d = -c.spreadSectors; d <= c.spreadSectors; d++) {
      const w = Math.cos(((d * step) * Math.PI) / 180) ** 2;
      rays.push([sectorFetch(g, k + d), w]);
      wsum += w;
    }
    for (let i = 0; i < out.length; i++) {
      if (g.land[i]) continue;
      let f = 0;
      for (const [r, w] of rays) f += r[i] * w;
      out[i] += (part * f) / wsum;
    }
  }
  return out;
}

/**
 * The wind sea by fetch (owner, Oct 2026; docs/FETCH_SEAS.md): short, steep seas in enclosed
 * water, long ones in the open, worked out at every spot from the wind and its fetch there
 * (world/fetch.ts), by the JONSWAP relations for fetch-limited growth:
 *
 *   g·Hs / U² = 0.0016 · (g·F / U²)^½        g·Tp / U = 0.286 · (g·F / U²)^⅓
 *
 * capped at the fully developed sea of that wind (g·Hs/U² 0.243, g·Tp/U 8.13), U the 10 m
 * wind and F the effective fetch upwind. Height grows with the square root of the fetch,
 * period only with its cube root: a short fetch makes a short, steep sea.
 *
 * How it's carried in the game's waves (ocean/waves.ts):
 *   - The long waves (CONFIG.ocean.waves) are the open sea: at a spot they're scaled by its
 *     exposure, e = F/openFetchM toward where they come from (at most 1): full in the open,
 *     a little in a sound, next to nothing in a loch. (In proportion to the fetch, not its
 *     square root as a wind sea's height grows: a short-fetch sea has next to no energy at
 *     the long waves' periods, and swell barely gets into a sheltered bay.)
 *   - Three short wave trains (CONFIG.ocean.fetchSeas.trains, about 4.4, 3.1 and 2.2 s, down
 *     the wind) carry the wind sea where the long waves don't: its energy at a spot, less the
 *     part the open sea already carries there (× 1 - e² for the wind's own exposure), shared
 *     among them by a narrow spread about its peak period in log-period.
 * The field is a grid (the fetch grid's), of the trains' heights and the exposure, refreshed
 * when the wind changes enough (`refreshWindPct`, `refreshDirDeg`). The physics reads it
 * here (windSeaAt), the ocean shader as a texture of the same numbers (oceanView.ts).
 */
import { CONFIG } from '../config';
import { effectiveFetch, fetchGrid, sectorFetch, type FetchGrid } from '../world/fetch';

const G = 9.81;

/** The fetch-limited (JONSWAP) sea of a wind: significant height (m) and peak period (s). */
export function jonswap(wind: number, fetch: number): { hs: number; tp: number } {
  if (wind < 0.3 || fetch <= 0) return { hs: 0, tp: 0 };
  const u2 = wind * wind;
  const chi = (G * fetch) / u2;
  const hs = Math.min(0.0016 * Math.sqrt(chi), 0.2433) * (u2 / G);
  const tp = Math.min(0.286 * Math.cbrt(chi), 8.134) * (wind / G);
  return { hs, tp };
}

/** The bearing the long waves come FROM (deg true): opposite the main one's travel. */
export function swellFromDeg(): number {
  return ((CONFIG.ocean.waves[0]?.directionDeg ?? 0) + 180) % 360;
}

/** The short trains' share of a sea peaking at `tp`: weights over the trains, summing to 1. */
export function trainShares(tp: number, out: number[] = []): number[] {
  const c = CONFIG.ocean.fetchSeas;
  const periods = c.trains.map((t) => t.period);
  const lo = Math.min(...periods);
  const hi = Math.max(...periods);
  // A peak beyond the trains puts its energy on the nearest of them.
  const lp = Math.log(Math.min(hi, Math.max(lo, tp)));
  let sum = 0;
  c.trains.forEach((t, i) => {
    const d = (Math.log(t.period) - lp) / c.spreadLn;
    out[i] = Math.exp(-d * d);
    sum += out[i];
  });
  for (let i = 0; i < c.trains.length; i++) out[i] /= sum;
  out.length = c.trains.length;
  return out;
}

export interface WindSeaField {
  /** The wind it's for (m/s) and the bearing it blows from (deg). */
  wind: number;
  windFrom: number;
  grid: FetchGrid;
  /** Per cell: each short train's amplitude as a share (0..255) of its largest anywhere (`max`), then the long waves' exposure (0..255 of 1). RGBA, row by row. */
  data: Uint8Array;
  /** Each train's largest amplitude anywhere on the grid (m). */
  max: number[];
  /** Counts up with each refresh (the ocean view re-uploads its texture). */
  version: number;
  /** Each cell's effective fetch upwind (m), for the Debug readout. */
  fetch: Float32Array;
}

let field: WindSeaField | null = null;
let version = 0;
let off = false;

/** Short seas off (Debug's comparison: the sea as it was, the long waves everywhere): no field. */
export function setShortSeasOff(v: boolean): void {
  if (off === v) return;
  off = v;
  field = null;
  job = null;
  version++;
}
export const shortSeasOff = (): boolean => off;

/** The field now, or null (none worked out yet, or short seas off). */
export function windSeaField(): WindSeaField | null {
  return field;
}

/** The long waves' exposure per cell (F/openFetchM toward where they come from, at most 1): fixed for a map, kept with its grid. */
const EXPOSURE = new WeakMap<FetchGrid, { from: number; expo: Float32Array }>();
function swellExposure(g: FetchGrid): Float32Array {
  const from = swellFromDeg();
  const have = EXPOSURE.get(g);
  if (have && have.from === from) return have.expo;
  const c = CONFIG.ocean.fetchSeas;
  const f = effectiveFetch(g, from);
  const expo = new Float32Array(f.length);
  for (let i = 0; i < f.length; i++) expo[i] = g.land[i] ? 0 : Math.min(1, f[i] / c.openFetchM);
  EXPOSURE.set(g, { from, expo });
  return expo;
}

/** A field being worked out a slice at a time (review, Oct 2026: a whole refresh on the main thread was a hitch). */
interface FieldJob {
  wind: number;
  windFrom: number;
  g: FetchGrid;
  /** The sector fetches round the wind's bearing and each one's weight (fetch.ts effectiveFetch, written out per cell). */
  rays: { f: Float32Array; w: number }[];
  windFetch: Float32Array;
  amps: Float32Array;
  max: number[];
  /** The next cell to do. */
  next: number;
}
let job: FieldJob | null = null;

/** Start a field for this wind: the rays round its bearing and their weights, as effectiveFetch takes them. */
function startJob(wind: number, windFrom: number): FieldJob {
  const c = CONFIG.ocean.fetchSeas;
  const g = fetchGrid();
  const cells = g.nx * g.nz;
  const n = g.sectors.length;
  const step = 360 / n;
  const at = (((windFrom % 360) + 360) % 360) / step;
  const k0 = Math.floor(at);
  const t = at - k0;
  const rays: { f: Float32Array; w: number }[] = [];
  let wsum = 0;
  for (let d = -c.spreadSectors; d <= c.spreadSectors; d++) wsum += Math.cos((d * step * Math.PI) / 180) ** 2;
  for (const [k, part] of [
    [k0, 1 - t],
    [k0 + 1, t],
  ] as const) {
    if (part <= 0) continue;
    for (let d = -c.spreadSectors; d <= c.spreadSectors; d++) rays.push({ f: sectorFetch(g, k + d), w: (part * Math.cos((d * step * Math.PI) / 180) ** 2) / wsum });
  }
  return { wind, windFrom, g, rays, windFetch: new Float32Array(cells), amps: new Float32Array(cells * c.trains.length), max: new Array<number>(c.trains.length).fill(0), next: 0 };
}

/** Work out up to `count` more cells of the job: each one's fetch upwind, its JONSWAP sea, the trains' amplitudes. Whether it's done. */
function advanceJob(j: FieldJob, count: number): boolean {
  const c = CONFIG.ocean.fetchSeas;
  const g = j.g;
  const cells = g.nx * g.nz;
  const n = c.trains.length;
  const wind = j.wind;
  const u2 = wind * wind;
  let lo = Infinity;
  let hi = -Infinity;
  for (const t of c.trains) {
    lo = Math.min(lo, t.period);
    hi = Math.max(hi, t.period);
  }
  const share = SHARE.length >= n ? SHARE : (SHARE = new Float64Array(n));
  const end = Math.min(cells, j.next + count);
  for (let i = j.next; i < end; i++) {
    if (g.land[i]) continue;
    let F = 0;
    for (const r of j.rays) F += r.f[i] * r.w;
    j.windFetch[i] = F;
    if (wind < 0.3 || F <= 0) continue;
    // JONSWAP (jonswap() above, written out).
    const chi = (G * F) / u2;
    const hs = Math.min(0.0016 * Math.sqrt(chi), 0.2433) * (u2 / G);
    const tp = Math.min(0.286 * Math.cbrt(chi), 8.134) * (wind / G);
    // What the open sea doesn't carry here, by the wind's own exposure.
    const ew = Math.min(1, F / c.openFetchM);
    const hShort = hs * Math.sqrt(Math.max(0, 1 - ew * ew));
    // The trains' shares (trainShares() above, written out).
    const lp = Math.log(Math.min(hi, Math.max(lo, tp)));
    let sum = 0;
    for (let k = 0; k < n; k++) {
      const d = (Math.log(c.trains[k].period) - lp) / c.spreadLn;
      share[k] = Math.exp(-d * d);
      sum += share[k];
    }
    // Hs = 4√(Σ A²/2): each train's A = Hs/(2√2) × √share.
    for (let k = 0; k < n; k++) {
      const a = (hShort / (2 * Math.SQRT2)) * Math.sqrt(share[k] / sum);
      j.amps[i * n + k] = a;
      if (a > j.max[k]) j.max[k] = a;
    }
  }
  j.next = end;
  return end >= cells;
}
let SHARE = new Float64Array(4);

/** A finished job as the field: the trains' amplitudes as shares of their largest, the exposure; land cells their water neighbours' mean. */
function finishJob(j: FieldJob): WindSeaField {
  const g = j.g;
  const cells = g.nx * g.nz;
  const n = CONFIG.ocean.fetchSeas.trains.length;
  const expo = swellExposure(g);
  const max = j.max;
  const data = new Uint8Array(cells * 4);
  for (let i = 0; i < cells; i++) {
    for (let k = 0; k < Math.min(3, n); k++) data[i * 4 + k] = max[k] > 0 ? Math.round((255 * j.amps[i * n + k]) / max[k]) : 0;
    data[i * 4 + 3] = Math.round(255 * expo[i]);
  }
  // A land cell takes its water neighbours' mean, so the sea between a shore cell's middle and
  // the land's isn't blended toward nothing (the grid is coarser than a beach).
  for (let jj0 = 0; jj0 < g.nz; jj0++) {
    for (let i = 0; i < g.nx; i++) {
      const at = jj0 * g.nx + i;
      if (!g.land[at]) continue;
      let s0 = 0;
      let s1 = 0;
      let s2 = 0;
      let s3 = 0;
      let m = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = i + di;
          const jj = jj0 + dj;
          if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.nz || g.land[jj * g.nx + ii]) continue;
          const q = (jj * g.nx + ii) * 4;
          s0 += data[q];
          s1 += data[q + 1];
          s2 += data[q + 2];
          s3 += data[q + 3];
          m++;
        }
      }
      if (m) {
        data[at * 4] = Math.round(s0 / m);
        data[at * 4 + 1] = Math.round(s1 / m);
        data[at * 4 + 2] = Math.round(s2 / m);
        data[at * 4 + 3] = Math.round(s3 / m);
      }
    }
  }
  return { wind: j.wind, windFrom: j.windFrom, grid: g, data, max, version: ++version, fetch: j.windFetch };
}

/**
 * The field for this wind, worked out again if the wind has changed enough since; whether it
 * changed (the waves are rebuilt for it then: their trains' directions and sizes).
 *
 * The first field (and after Debug turns the short seas back on) is worked out at once. A
 * refresh as the wind moves on is worked out `sliceCells` cells a call (each tick and frame),
 * the old field in use meanwhile, and swapped in whole when it's done: the Clyde's 25,000
 * cells in a tenth of a second or so, with no hitch (review, Oct 2026: 10-20 ms at once, and a
 * rising wind made dozens). The swell's exposure is kept for the map, and the sectors' fetch
 * is ready from the grid's making (world/fetch.ts).
 */
export function updateWindSea(wind: number, windFrom: number): boolean {
  const c = CONFIG.ocean.fetchSeas;
  if (off || !c.enabled) {
    job = null;
    if (!field) return false;
    field = null;
    version++;
    return true;
  }
  if (!field) {
    // The first: all at once (the map's loading).
    const j = startJob(wind, windFrom);
    advanceJob(j, Infinity);
    job = null;
    field = finishJob(j);
    return true;
  }
  if (!job) {
    const dw = Math.abs(wind - field.wind) / Math.max(1, field.wind);
    const dd = Math.abs(((windFrom - field.windFrom + 540) % 360) - 180);
    if (dw * 100 < c.refreshWindPct && dd < c.refreshDirDeg) return false;
    job = startJob(wind, windFrom);
  }
  if (!advanceJob(job, c.sliceCells)) return false;
  field = finishJob(job);
  job = null;
  return true;
}

/**
 * The wind sea at (x, z) (rest position): each train's amplitude (m) and the long waves'
 * exposure, from the field's grid by bilinear interpolation between cell middles, as the
 * shader's texture filter does. No field: no short trains, exposure 1 (the sea as before).
 */
export function windSeaAt(x: number, z: number, out: { a: number[]; e: number }): { a: number[]; e: number } {
  const f = field;
  const n = CONFIG.ocean.fetchSeas.trains.length;
  if (!f) {
    for (let k = 0; k < n; k++) out.a[k] = 0;
    out.e = 1;
    return out;
  }
  const g = f.grid;
  const u = Math.min(g.nx - 1, Math.max(0, (x - g.x0) / g.cell - 0.5));
  const v = Math.min(g.nz - 1, Math.max(0, (z - g.z0) / g.cell - 0.5));
  const i0 = Math.floor(u);
  const j0 = Math.floor(v);
  const i1 = Math.min(g.nx - 1, i0 + 1);
  const j1 = Math.min(g.nz - 1, j0 + 1);
  const tu = u - i0;
  const tv = v - j0;
  // Bilinear between the four cells, written out (no closures: this runs thousands of times a
  // frame, and throwaway functions were a steady stream of garbage on the Quest).
  const d = f.data;
  const c00 = (j0 * g.nx + i0) * 4;
  const c10 = (j0 * g.nx + i1) * 4;
  const c01 = (j1 * g.nx + i0) * 4;
  const c11 = (j1 * g.nx + i1) * 4;
  const w00 = ((1 - tu) * (1 - tv)) / 255;
  const w10 = (tu * (1 - tv)) / 255;
  const w01 = ((1 - tu) * tv) / 255;
  const w11 = (tu * tv) / 255;
  for (let k = 0; k < n; k++) out.a[k] = k < 3 ? (d[c00 + k] * w00 + d[c10 + k] * w10 + d[c01 + k] * w01 + d[c11 + k] * w11) * f.max[k] : 0;
  out.e = d[c00 + 3] * w00 + d[c10 + 3] * w10 + d[c01 + 3] * w01 + d[c11 + 3] * w11;
  return out;
}

/**
 * The sea at (x, z) in words, for Debug: the short sea's height and period (the wind sea the
 * trains carry), the long waves' exposure and the fetch upwind. Empty with no field.
 */
export function windSeaText(x: number, z: number): string {
  const f = field;
  if (!f) return off ? 'Short seas off: the long waves everywhere' : '';
  const here = windSeaAt(x, z, { a: [0, 0, 0], e: 1 });
  const c = CONFIG.ocean.fetchSeas;
  let e2 = 0;
  let te = 0;
  here.a.forEach((a, k) => {
    e2 += (a * a) / 2;
    te += ((a * a) / 2) * (c.trains[k]?.period ?? 0);
  });
  const g = f.grid;
  const i = Math.min(g.nx - 1, Math.max(0, Math.floor((x - g.x0) / g.cell)));
  const j = Math.min(g.nz - 1, Math.max(0, Math.floor((z - g.z0) / g.cell)));
  // The fetch of the nearest water cell (the grid is coarser than the shore).
  let fetchM = 0;
  for (let r = 0; r <= 2 && fetchM === 0; r++)
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        const ii = i + di;
        const jj = j + dj;
        if (ii >= 0 && jj >= 0 && ii < g.nx && jj < g.nz && !g.land[jj * g.nx + ii]) fetchM = Math.max(fetchM, f.fetch[jj * g.nx + ii]);
      }
  const fetchKm = fetchM / 1000;
  const hs = 4 * Math.sqrt(e2);
  return `Here: short sea ${hs.toFixed(2)} m${hs > 0.005 ? ` at ${(te / e2).toFixed(1)} s` : ''} · long waves × ${here.e.toFixed(2)} · fetch upwind ${fetchKm.toFixed(1)} km`;
}

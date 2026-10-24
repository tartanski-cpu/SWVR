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
import { effectiveFetch, fetchGrid, type FetchGrid } from '../world/fetch';

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
  version++;
}
export const shortSeasOff = (): boolean => off;

/** The field now, or null (none worked out yet, or short seas off). */
export function windSeaField(): WindSeaField | null {
  return field;
}

/**
 * The field for this wind, worked out again if the wind has changed enough since; whether it
 * changed (the waves are rebuilt for it then: their trains' directions and sizes).
 */
export function updateWindSea(wind: number, windFrom: number): boolean {
  const c = CONFIG.ocean.fetchSeas;
  if (off || !c.enabled) {
    if (!field) return false;
    field = null;
    version++;
    return true;
  }
  if (field) {
    const dw = Math.abs(wind - field.wind) / Math.max(1, field.wind);
    const dd = Math.abs(((windFrom - field.windFrom + 540) % 360) - 180);
    if (dw * 100 < c.refreshWindPct && dd < c.refreshDirDeg) return false;
  }
  const g = fetchGrid();
  const cells = g.nx * g.nz;
  const windFetch = effectiveFetch(g, windFrom);
  const swellFetch = effectiveFetch(g, swellFromDeg());
  const n = c.trains.length;
  const amps = new Float32Array(cells * n);
  const expo = new Float32Array(cells);
  const max = new Array<number>(n).fill(0);
  const share: number[] = [];
  for (let i = 0; i < cells; i++) {
    if (g.land[i]) continue;
    expo[i] = Math.min(1, swellFetch[i] / c.openFetchM);
    const { hs, tp } = jonswap(wind, windFetch[i]);
    if (hs <= 0) continue;
    // What the open sea doesn't carry here, by the wind's own exposure.
    const ew = Math.min(1, windFetch[i] / c.openFetchM);
    const hShort = hs * Math.sqrt(Math.max(0, 1 - ew * ew));
    trainShares(tp, share);
    // Hs = 4√(Σ A²/2): each train's A = Hs/(2√2) × √share.
    for (let k = 0; k < n; k++) {
      const a = (hShort / (2 * Math.SQRT2)) * Math.sqrt(share[k]);
      amps[i * n + k] = a;
      if (a > max[k]) max[k] = a;
    }
  }
  const data = new Uint8Array(cells * 4);
  for (let i = 0; i < cells; i++) {
    for (let k = 0; k < Math.min(3, n); k++) data[i * 4 + k] = max[k] > 0 ? Math.round((255 * amps[i * n + k]) / max[k]) : 0;
    data[i * 4 + 3] = Math.round(255 * expo[i]);
  }
  // A land cell takes its water neighbours' mean, so the sea between a shore cell's middle and
  // the land's isn't blended toward nothing (the grid is coarser than a beach).
  for (let j = 0; j < g.nz; j++) {
    for (let i = 0; i < g.nx; i++) {
      const at = j * g.nx + i;
      if (!g.land[at]) continue;
      const sum = [0, 0, 0, 0];
      let m = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.nz || g.land[jj * g.nx + ii]) continue;
          const q = (jj * g.nx + ii) * 4;
          for (let ch = 0; ch < 4; ch++) sum[ch] += data[q + ch];
          m++;
        }
      }
      if (m) for (let ch = 0; ch < 4; ch++) data[at * 4 + ch] = Math.round(sum[ch] / m);
    }
  }
  field = { wind, windFrom, grid: g, data, max, version: ++version, fetch: windFetch };
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

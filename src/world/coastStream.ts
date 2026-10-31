/**
 * Streaming a chunked coast region's ground (a big Voyage map, the Clyde): its 2 km chunks'
 * detailed meshes are fetched as the viewer or a boat comes near and dropped as they leave
 * (coastTerrain.ts `addCoastChunk` / `removeCoastChunk`); everywhere else the ground is the
 * map's coarse grid, which is in from the start. Nearest chunks first, a few downloads at a
 * time (CONFIG.regions.coastLoadDistance, coastUnloadDistance, coastLoadsAtOnce).
 *
 * The ground is part of the simulation (a hull grounds on it), so the host streams round
 * every boat as well as round its own eye; a crew's game round its own eye and boat. No
 * drawing here: the view (coastView.ts) draws whatever chunks are in.
 *
 * A chart zoomed in on somewhere else (the planning chart, voyage/planChart.ts; owner, Oct
 * 2026: "it only seems to load one area in with detail when I scroll around") asks for the
 * chunks it shows too (`viewChart`), so its coast is cut from the detailed ground there as
 * well (nav/chartLand.ts): only within `coastChartSpan` across (wider, the coarse grid is as
 * sharp as the chart can show), and kept while it's looked at (`coastChartHold` s).
 */
import { CONFIG } from '../config';
import { addCoastChunk, coastTerrains, removeCoastChunk, type CoastTerrain } from './coastTerrain';

type Fetcher = (url: string) => Promise<ArrayBuffer>;
const defaultFetch: Fetcher = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.arrayBuffer();
};

/** Distance (m) from (x, z) to a chunk's square (0 inside it). */
function toSquare(t: CoastTerrain, k: number, x: number, z: number): number {
  const c = t.chunked!.chunks[k];
  const x0 = c.x0 + t.ox;
  const z0 = c.z0 + t.oz;
  const dx = Math.max(x0 - x, 0, x - (x0 + c.size));
  const dz = Math.max(z0 - z, 0, z - (z0 + c.size));
  return Math.hypot(dx, dz);
}

/** Whether a chunk's square and a chart's view (world m) overlap. */
function overlaps(t: CoastTerrain, k: number, v: { x0: number; z0: number; x1: number; z1: number }): boolean {
  const c = t.chunked!.chunks[k];
  const x0 = c.x0 + t.ox;
  const z0 = c.z0 + t.oz;
  return x0 < v.x1 && x0 + c.size > v.x0 && z0 < v.z1 && z0 + c.size > v.z0;
}

export class CoastStreamer {
  /** Chunks being fetched now, by "<region>:<index>". */
  private loading = new Map<string, Promise<void>>();
  /** Chunks that failed: not tried again this session (the coarse grid stands in). */
  private failed = new Set<string>();
  /** The charts zoomed in, by chart: the ground they show (world m) and when they last asked (ms). */
  private charts = new Map<object, { x0: number; z0: number; x1: number; z1: number; at: number }>();

  /** `base`: the site's root (import.meta.env.BASE_URL), where the region's `dir` is. */
  constructor(
    private base: string,
    private dirOf: (regionId: string) => string,
    private get: Fetcher = defaultFetch,
  ) {}

  /** Downloads under way (for a loading note, and the tests). */
  get busy(): number {
    return this.loading.size;
  }

  /**
   * Once a frame or so: fetch the chunks near any of `points` (world x, z), drop the far
   * ones. Returns the fetches it started, to await (start, tests).
   */
  update(points: readonly { x: number; z: number }[]): Promise<void>[] {
    const r = CONFIG.regions;
    const started: Promise<void>[] = [];
    const now = performance.now();
    for (const [key, v] of this.charts) if (now - v.at > r.coastChartHold * 1000) this.charts.delete(key);
    const charts = [...this.charts.values()];
    for (const t of coastTerrains()) {
      if (!t.chunked) continue;
      const want: { k: number; d: number }[] = [];
      t.chunked.chunks.forEach((_, k) => {
        let d = Infinity;
        for (const p of points) d = Math.min(d, toSquare(t, k, p.x, p.z));
        // A chart showing its square: wanted (after those near the boats), and kept.
        if (d >= r.coastLoadDistance && charts.some((v) => overlaps(t, k, v))) d = r.coastLoadDistance - 1;
        if (t.pieces.has(k)) {
          if (d > r.coastUnloadDistance) removeCoastChunk(t.id, k);
        } else if (d < r.coastLoadDistance) want.push({ k, d });
      });
      want.sort((a, b) => a.d - b.d);
      for (const { k } of want) {
        const key = `${t.id}:${k}`;
        if (this.loading.has(key) || this.failed.has(key)) continue;
        if (this.loading.size >= r.coastLoadsAtOnce) break;
        const id = t.id;
        const job = this.get(`${this.base}${this.dirOf(id)}${t.chunked.chunks[k].file}`)
          .then((bin) => addCoastChunk(id, k, bin))
          .catch((e) => {
            this.failed.add(key);
            console.warn(`coast chunk ${key} not loaded:`, e);
          })
          .finally(() => this.loading.delete(key));
        this.loading.set(key, job);
        started.push(job);
      }
    }
    return started;
  }

  /**
   * A chart (any object, one per chart) showing `span` m across (W x H pixels) round (cx, cz):
   * when zoomed in to `coastChartSpan` or closer, the chunks under it are fetched (the next
   * `update`) and kept while it keeps asking. Returns whether any of them is still to come
   * (draw the chart again when it is).
   */
  viewChart(chart: object, cx: number, cz: number, span: number, W: number, H: number): boolean {
    const r = CONFIG.regions;
    if (span > r.coastChartSpan) {
      this.charts.delete(chart);
      return false;
    }
    const v = { x0: cx - span / 2, x1: cx + span / 2, z0: cz - (span * H) / W / 2, z1: cz + (span * H) / W / 2, at: performance.now() };
    this.charts.set(chart, v);
    for (const t of coastTerrains()) {
      if (!t.chunked) continue;
      for (let k = 0; k < t.chunked.chunks.length; k++) if (overlaps(t, k, v) && !t.pieces.has(k) && !this.failed.has(`${t.id}:${k}`)) return true;
    }
    return false;
  }

  /** One of a region's own files (a streamed chunk's buildings, `buildings/<n>.json`), parsed. */
  async fetchJson<T>(regionId: string, file: string): Promise<T> {
    const buf = await this.get(`${this.base}${this.dirOf(regionId)}${file}`);
    return JSON.parse(new TextDecoder().decode(buf)) as T;
  }

  /** Fetch everything near `points` and wait for it (before the game starts: the start berth). */
  async preload(points: readonly { x: number; z: number }[]): Promise<void> {
    for (;;) {
      this.update(points);
      if (!this.loading.size) return;
      await Promise.all(this.loading.values());
    }
  }
}

/** The game's one streamer (main.ts makes it when a chunked region is in; App drives it). */
let STREAMER: CoastStreamer | null = null;
export function startCoastStreaming(base: string, dirOf: (regionId: string) => string): CoastStreamer {
  return (STREAMER = new CoastStreamer(base, dirOf));
}
export function coastStreamer(): CoastStreamer | null {
  return STREAMER;
}

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

export class CoastStreamer {
  /** Chunks being fetched now, by "<region>:<index>". */
  private loading = new Map<string, Promise<void>>();
  /** Chunks that failed: not tried again this session (the coarse grid stands in). */
  private failed = new Set<string>();

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
    for (const t of coastTerrains()) {
      if (!t.chunked) continue;
      const want: { k: number; d: number }[] = [];
      t.chunked.chunks.forEach((_, k) => {
        let d = Infinity;
        for (const p of points) d = Math.min(d, toSquare(t, k, p.x, p.z));
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

/**
 * Coast terrain (the coast pipeline's regions, milestone 4): a region whose ground is a
 * ready-made triangle mesh from tools/coast (real coastline from open map data) instead of
 * the analytic islands of terrain.ts. The same mesh is drawn and is what a hull runs aground
 * on, so what you see is what you hit, as for the islands.
 *
 * Two kinds:
 *   whole    the region's mesh in one file (public/regions/<id>/terrain.bin, ~2.5 MB: Oban,
 *            Tayvallich), fetched once at start (main.ts) and handed here with
 *            `registerCoastTerrain`.
 *   chunked  a big region (the Clyde, Voyage mode only): a coarse grid of the whole region
 *            (heights and colours every few tens of metres, coarse.bin) fetched at start, and
 *            its mesh in 2 km chunks (chunks/<n>.bin) fetched round the viewer and the boat
 *            as they come near and dropped as they leave (coastStream.ts). Where a chunk is
 *            in, the ground is its mesh; elsewhere the coarse grid (the charts, the far view,
 *            the traffic's depth checks, which need no more).
 * In tests they're read from disk. terrain.ts's `groundHeight` asks `coastHeight` first
 * inside a registered region's box.
 *
 * Lookup: a mesh's faces are sorted into square buckets (`BUCKET` m) by the box round each;
 * a query tests the faces in its bucket (a few dozen) for the one under the point and
 * interpolates its corners. The deep faces (not drawn: the sea is opaque) are included, so
 * the depth sounder and the anchor find the real seabed.
 */

/** How terrain.bin is laid out, and the region's box in its own metres (the package's `terrain` and `box`). */
export interface CoastTerrainLayout {
  vertices: { offset: number; count: number };
  faces: { offset: number; count: number };
  colours: { offset: number };
  chunks: { id: number; x0: number; z0: number; size: number; start: number; count: number }[];
  deep?: { start: number; count: number };
}

/** A chunked region's files (the package's `terrain` when `chunked`). */
export interface ChunkedCoastLayout {
  chunked: true;
  /** The coarse grid: its north-west corner (z runs south) in the region's metres, its cell size and cells. */
  coarse: { file: string; x0: number; z0: number; cell: number; width: number; height: number };
  /** Each chunk: its square, its file, how many faces are drawn (first) of how many. */
  chunks: { id: number; x0: number; z0: number; size: number; file: string; drawn: number; faces: number }[];
  /** The whole mesh's counts (for the record). */
  vertices?: { count: number };
  faces?: { count: number };
  deep?: { count: number };
}

/** A mesh with its bucket index: a whole region's, or one chunk's. */
export interface CoastPiece {
  /** Vertices in world metres (x, y, z), faces (a, b, c), colours per face (r, g, b bytes). */
  V: Float32Array;
  F: Uint32Array;
  C: Uint8Array;
  /** The bucket grid's corner (world) and size; faces of bucket k are faceList[start[k] .. start[k + 1]). */
  x0: number;
  z0: number;
  bw: number;
  bh: number;
  start: Uint32Array;
  faceList: Uint32Array;
}

export interface CoastTerrain {
  id: string;
  /** World position of the region's local origin (the package's metres are about the box's centre). */
  ox: number;
  oz: number;
  /** The box in world metres. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** A whole region: its mesh and layout. */
  piece: CoastPiece | null;
  layout: CoastTerrainLayout | null;
  /** A chunked region: its coarse grid, its chunks' layout, and the chunks loaded now (by index in the layout). */
  chunked: ChunkedCoastLayout | null;
  coarseH: Int16Array | null;
  coarseC: Uint8Array | null;
  pieces: Map<number, CoastPiece>;
  /** Chunk lookup: the index (in `chunked.chunks`) of the chunk at grid cell (i, j), -1 for none. */
  chunkGrid: Int32Array | null;
  chunkW: number;
  chunkSize: number;
  chunkX0: number;
  chunkZ0: number;
}

const BUCKET = 40;
const TERRAINS: CoastTerrain[] = [];

/** Sort a mesh's faces into buckets over the box (x0, z0)-(x1, z1) (world). */
function buildPiece(V: Float32Array, F: Uint32Array, C: Uint8Array, nf: number, x0: number, z0: number, x1: number, z1: number): CoastPiece {
  const bw = Math.max(1, Math.ceil((x1 - x0) / BUCKET));
  const bh = Math.max(1, Math.ceil((z1 - z0) / BUCKET));
  // Two passes: count each bucket's faces, then fill (compressed rows).
  const count = new Uint32Array(bw * bh + 1);
  const range = (f: number, visit: (k: number) => void) => {
    const a = F[3 * f] * 3;
    const b = F[3 * f + 1] * 3;
    const c = F[3 * f + 2] * 3;
    const i0 = Math.max(0, Math.floor((Math.min(V[a], V[b], V[c]) - x0) / BUCKET));
    const i1 = Math.min(bw - 1, Math.floor((Math.max(V[a], V[b], V[c]) - x0) / BUCKET));
    const j0 = Math.max(0, Math.floor((Math.min(V[a + 2], V[b + 2], V[c + 2]) - z0) / BUCKET));
    const j1 = Math.min(bh - 1, Math.floor((Math.max(V[a + 2], V[b + 2], V[c + 2]) - z0) / BUCKET));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) visit(j * bw + i);
  };
  for (let f = 0; f < nf; f++) range(f, (k) => count[k + 1]++);
  const start = new Uint32Array(bw * bh + 1);
  for (let k = 0; k < bw * bh; k++) start[k + 1] = start[k] + count[k + 1];
  const fill = start.slice(0, bw * bh);
  const faceList = new Uint32Array(start[bw * bh]);
  for (let f = 0; f < nf; f++) range(f, (k) => (faceList[fill[k]++] = f));
  return { V, F, C, x0, z0, bw, bh, start, faceList };
}

function place(t: CoastTerrain): CoastTerrain {
  const old = TERRAINS.findIndex((x) => x.id === t.id);
  if (old >= 0) TERRAINS.splice(old, 1);
  TERRAINS.push(t);
  return t;
}

const blank = { piece: null, layout: null, chunked: null, coarseH: null, coarseC: null, pieces: new Map<number, CoastPiece>(), chunkGrid: null, chunkW: 0, chunkSize: 0, chunkX0: 0, chunkZ0: 0 };

/**
 * Take a whole coast region's terrain.bin (the whole file) and place it with its local
 * origin at world (ox, oz). Replaces any earlier one with the same id.
 */
export function registerCoastTerrain(id: string, bin: ArrayBuffer, layout: CoastTerrainLayout, box: { x0: number; x1: number; z0: number; z1: number }, ox: number, oz: number): CoastTerrain {
  const local = new Float32Array(bin, layout.vertices.offset, layout.vertices.count * 3);
  const V = new Float32Array(local.length);
  for (let i = 0; i < local.length; i += 3) {
    V[i] = local[i] + ox;
    V[i + 1] = local[i + 1];
    V[i + 2] = local[i + 2] + oz;
  }
  const F = new Uint32Array(bin, layout.faces.offset, layout.faces.count * 3);
  const C = new Uint8Array(bin, layout.colours.offset, layout.faces.count * 3);
  const x0 = box.x0 + ox;
  const z0 = box.z0 + oz;
  const piece = buildPiece(V, F, C, layout.faces.count, x0, z0, box.x1 + ox, box.z1 + oz);
  return place({ ...blank, pieces: new Map(), id, ox, oz, x0, x1: box.x1 + ox, z0, z1: box.z1 + oz, piece, layout });
}

/**
 * Take a chunked region's coarse grid (coarse.bin: Int16 heights in decimetres, then RGB
 * bytes, a cell each, rows running south) and its chunks' layout; its chunks come later
 * (`addCoastChunk`).
 */
export function registerChunkedCoast(id: string, coarse: ArrayBuffer, layout: ChunkedCoastLayout, box: { x0: number; x1: number; z0: number; z1: number }, ox: number, oz: number): CoastTerrain {
  const g = layout.coarse;
  const n = g.width * g.height;
  const coarseH = new Int16Array(coarse, 0, n);
  const coarseC = new Uint8Array(coarse, n * 2, n * 3);
  const size = layout.chunks[0]?.size ?? 2000;
  const cx0 = Math.min(...layout.chunks.map((c) => c.x0));
  const cz0 = Math.min(...layout.chunks.map((c) => c.z0));
  const chunkW = Math.round((Math.max(...layout.chunks.map((c) => c.x0)) - cx0) / size) + 1;
  const chunkH = Math.round((Math.max(...layout.chunks.map((c) => c.z0)) - cz0) / size) + 1;
  const chunkGrid = new Int32Array(chunkW * chunkH).fill(-1);
  layout.chunks.forEach((c, k) => (chunkGrid[Math.round((c.z0 - cz0) / size) * chunkW + Math.round((c.x0 - cx0) / size)] = k));
  return place({ ...blank, pieces: new Map(), id, ox, oz, x0: box.x0 + ox, x1: box.x1 + ox, z0: box.z0 + oz, z1: box.z1 + oz, chunked: layout, coarseH, coarseC, chunkGrid, chunkW, chunkSize: size, chunkX0: cx0 + ox, chunkZ0: cz0 + oz });
}

/**
 * A chunk's file (chunks/<n>.bin: Uint32 vertex and face counts, then Float32 vertices in the
 * region's metres, Uint32 faces, RGB bytes per face) for chunk `k` (its index in the layout).
 */
export function addCoastChunk(id: string, k: number, bin: ArrayBuffer): void {
  const t = coastTerrain(id);
  if (!t?.chunked) return;
  const [nv, nf] = new Uint32Array(bin, 0, 2);
  const local = new Float32Array(bin, 8, nv * 3);
  const V = new Float32Array(nv * 3);
  for (let i = 0; i < local.length; i += 3) {
    V[i] = local[i] + t.ox;
    V[i + 1] = local[i + 1];
    V[i + 2] = local[i + 2] + t.oz;
  }
  const F = new Uint32Array(bin, 8 + nv * 12, nf * 3);
  const C = new Uint8Array(bin, 8 + nv * 12 + nf * 12, nf * 3);
  const c = t.chunked.chunks[k];
  // The bucket grid reaches past the chunk's square: its faces straddle the edges.
  const m = 400;
  t.pieces.set(k, buildPiece(V, F, C, nf, c.x0 + t.ox - m, c.z0 + t.oz - m, c.x0 + c.size + t.ox + m, c.z0 + c.size + t.oz + m));
}

export function removeCoastChunk(id: string, k: number): void {
  coastTerrain(id)?.pieces.delete(k);
}

/** The registered coast terrains (for drawing and charts). */
export function coastTerrains(): readonly CoastTerrain[] {
  return TERRAINS;
}

export function coastTerrain(id: string): CoastTerrain | undefined {
  return TERRAINS.find((t) => t.id === id);
}

/** Forget them all (tests). */
export function clearCoastTerrains(): void {
  TERRAINS.length = 0;
}

/** Is (x, z) inside a registered coast region's box? Quick, for callers that skip analytic work there. */
export function inCoastTerrain(x: number, z: number): boolean {
  for (const t of TERRAINS) if (x >= t.x0 && x < t.x1 && z >= t.z0 && z < t.z1) return true;
  return false;
}

/**
 * Ground height at world (x, z) from a coast region's mesh (or a chunked region's coarse
 * grid where its chunk isn't in), or null outside every one.
 */
export function coastHeight(x: number, z: number): number | null {
  return coastSample(x, z, SAMPLE) ? SAMPLE.h : null;
}

/** What `coastSample` finds: the height, and the colour there (sRGB bytes; a mesh face's or the coarse grid's). */
export interface CoastSample {
  h: number;
  r: number;
  g: number;
  b: number;
  /** From a mesh (true), or a chunked region's coarse grid (false). */
  fine: boolean;
}
const SAMPLE: CoastSample = { h: 0, r: 0, g: 0, b: 0, fine: false };

/** The face of `p` under (x, z): the height and colour into `out`; false if none (outside its faces). */
function samplePiece(p: CoastPiece, x: number, z: number, out: CoastSample): boolean {
  const bi = Math.floor((x - p.x0) / BUCKET);
  const bj = Math.floor((z - p.z0) / BUCKET);
  if (bi < 0 || bj < 0 || bi >= p.bw || bj >= p.bh) return false;
  const k = bj * p.bw + bi;
  const { V, F, C } = p;
  for (let q = p.start[k]; q < p.start[k + 1]; q++) {
    const f = p.faceList[q];
    const a = F[3 * f] * 3;
    const b = F[3 * f + 1] * 3;
    const c = F[3 * f + 2] * 3;
    const ax = V[a], az = V[a + 2], bx = V[b], bz = V[b + 2], cx = V[c], cz = V[c + 2]; // prettier-ignore
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (det === 0) continue;
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
    if (l1 < -1e-6) continue;
    const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
    if (l2 < -1e-6) continue;
    const l3 = 1 - l1 - l2;
    if (l3 < -1e-6) continue;
    out.h = l1 * V[a + 1] + l2 * V[b + 1] + l3 * V[c + 1];
    out.r = C[3 * f];
    out.g = C[3 * f + 1];
    out.b = C[3 * f + 2];
    out.fine = true;
    return true;
  }
  return false;
}

/** A chunked region's coarse grid at world (x, z): heights bilinear, the colour of the nearest cell. */
function sampleCoarse(t: CoastTerrain, x: number, z: number, out: CoastSample): void {
  const g = t.chunked!.coarse;
  const H = t.coarseH!;
  const fx = Math.min(g.width - 1.001, Math.max(0, (x - t.ox - g.x0) / g.cell));
  const fz = Math.min(g.height - 1.001, Math.max(0, (z - t.oz - g.z0) / g.cell));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const k = j * g.width + i;
  const top = H[k] * (1 - tx) + H[k + 1] * tx;
  const bot = H[k + g.width] * (1 - tx) + H[k + g.width + 1] * tx;
  out.h = (top * (1 - tz) + bot * tz) / 10;
  const n = Math.round(fz) * g.width + Math.round(fx);
  out.r = t.coarseC![3 * n];
  out.g = t.coarseC![3 * n + 1];
  out.b = t.coarseC![3 * n + 2];
  out.fine = false;
}

/** A chunk, then its eight neighbours. */
const NEIGHBOURS: [number, number][] = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];

/** The ground under world (x, z) into `out`; false outside every coast region (or, rarely, in a crack between a whole mesh's faces). */
export function coastSample(x: number, z: number, out: CoastSample): boolean {
  for (let n = 0; n < TERRAINS.length; n++) {
    const t = TERRAINS[n];
    if (x < t.x0 || x >= t.x1 || z < t.z0 || z >= t.z1) continue;
    if (t.piece) return samplePiece(t.piece, x, z, out);
    // Chunked: the chunk the point is in, then (a face straddling the edge) its neighbours,
    // then the coarse grid.
    const ci = Math.floor((x - t.chunkX0) / t.chunkSize);
    const cj = Math.floor((z - t.chunkZ0) / t.chunkSize);
    const grid = t.chunkGrid!;
    const H = grid.length / t.chunkW;
    for (const [di, dj] of NEIGHBOURS) {
      const i = ci + di;
      const j = cj + dj;
      if (i < 0 || j < 0 || i >= t.chunkW || j >= H) continue;
      const k = grid[j * t.chunkW + i];
      const p = k >= 0 ? t.pieces.get(k) : undefined;
      if (p && samplePiece(p, x, z, out)) return true;
    }
    sampleCoarse(t, x, z, out);
    return true;
  }
  return false;
}

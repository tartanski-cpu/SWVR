/**
 * Coast terrain (the coast pipeline's regions, milestone 4): a region whose ground is a
 * ready-made triangle mesh from tools/coast (real coastline from open map data) instead of
 * the analytic islands of terrain.ts. The same mesh is drawn and is what a hull runs aground
 * on, so what you see is what you hit, as for the islands.
 *
 * The mesh (public/regions/<id>/terrain.bin) is fetched once at start (App) and handed here
 * with `registerCoastTerrain`; in tests it's read from disk. Until it is, the region's
 * ground is the open-sea floor. terrain.ts's `groundHeight` asks `coastHeight` first inside
 * a registered region's box.
 *
 * Lookup: the faces are sorted into square buckets (`BUCKET` m) by the box round each; a
 * query tests the faces in its bucket (a few dozen) for the one under the point and
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
  /** Vertices in world metres (x, y, z), faces (a, b, c), colours per face (r, g, b bytes). */
  V: Float32Array;
  F: Uint32Array;
  C: Uint8Array;
  layout: CoastTerrainLayout;
  /** Bucket grid: faces of bucket k are faceList[start[k] .. start[k + 1]). */
  bw: number;
  bh: number;
  start: Uint32Array;
  faceList: Uint32Array;
}

const BUCKET = 40;
const TERRAINS: CoastTerrain[] = [];

/**
 * Take a coast region's terrain.bin (the whole file) and place it with its local origin at
 * world (ox, oz). Replaces any earlier one with the same id.
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
  const bw = Math.ceil((box.x1 - box.x0) / BUCKET);
  const bh = Math.ceil((box.z1 - box.z0) / BUCKET);
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
  const nf = layout.faces.count;
  for (let f = 0; f < nf; f++) range(f, (k) => count[k + 1]++);
  const start = new Uint32Array(bw * bh + 1);
  for (let k = 0; k < bw * bh; k++) start[k + 1] = start[k] + count[k + 1];
  const fill = start.slice(0, bw * bh);
  const faceList = new Uint32Array(start[bw * bh]);
  for (let f = 0; f < nf; f++) range(f, (k) => (faceList[fill[k]++] = f));
  const t: CoastTerrain = { id, ox, oz, x0, x1: box.x1 + ox, z0, z1: box.z1 + oz, V, F, C, layout, bw, bh, start, faceList };
  const old = TERRAINS.findIndex((x) => x.id === id);
  if (old >= 0) TERRAINS.splice(old, 1);
  TERRAINS.push(t);
  return t;
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
 * Ground height at world (x, z) from a coast region's mesh, or null outside every one (or,
 * at worst, in a crack between faces: the caller falls back to its own ground).
 */
export function coastHeight(x: number, z: number): number | null {
  return coastSample(x, z, SAMPLE) ? SAMPLE.h : null;
}

/** What `coastSample` finds: the height, the terrain and the face under the point. */
export interface CoastSample {
  h: number;
  t: CoastTerrain | null;
  f: number;
}
const SAMPLE: CoastSample = { h: 0, t: null, f: -1 };

/** The face under world (x, z) and the height there, into `out`; false outside every coast region. */
export function coastSample(x: number, z: number, out: CoastSample): boolean {
  for (let n = 0; n < TERRAINS.length; n++) {
    const t = TERRAINS[n];
    if (x < t.x0 || x >= t.x1 || z < t.z0 || z >= t.z1) continue;
    const k = Math.floor((z - t.z0) / BUCKET) * t.bw + Math.floor((x - t.x0) / BUCKET);
    const { V, F } = t;
    for (let q = t.start[k]; q < t.start[k + 1]; q++) {
      const f = t.faceList[q];
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
      out.t = t;
      out.f = f;
      return true;
    }
    return false;
  }
  return false;
}

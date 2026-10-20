/**
 * Stages 2 and 3, project and reconcile: everything onto one local metric grid (CELL m,
 * the game's axes), and the land/sea line and the heights made to agree.
 *
 *   The coast    OpenStreetMap's coastline is the truth for where land meets sea. Its ways
 *                have the land on their left. Each segment is drawn into the grid as a
 *                barrier, with a land seed a little to its left and a sea seed to its right;
 *                each patch of cells the barriers enclose takes the side most of its seeds
 *                say. (No polygon assembly, so a coast running off the box needs no closing.)
 *   Land         the DEM's height, held at least a little above the water at the shore
 *                (CONFIG shoreRise) and blending up into the DEM; a cliff stays a cliff (only
 *                low ground is lifted, never high ground lowered).
 *   Sea          always under water: near the shore a gentle procedural shelf (the coarse
 *                bathymetry misses the shallows), blending out into the bathymetry.
 *   Cover        ESA WorldCover's class per cell, for the colours.
 *
 * Writes data/work/<id>/grid.json and heights.bin (Float32), cover.bin and land.bin (Uint8),
 * coast.json (the coastline as local polylines). Run: node src/reconcile.ts [requestId].
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dirs, loadRequest, projection } from './common.ts';
import { bilinear, loadRaster, nearest } from './raster.ts';

/** Tunables (m). */
const T = {
  cell: 10,
  /** Shore lift: within `reach` m of the coast, land is at least `base` m above the water, rising `slope` per metre inland (the DEM smears a low shore into the sea). */
  shoreRise: { base: 0.4, slope: 0.04, reach: 40 },
  /** Offshore shelf: `base` m deep at the coast, `slope` deeper per metre out; blended into the bathymetry over `blend` m. */
  shelf: { base: 0.8, slope: 0.1, blend: 300 },
  /** Never shallower than this in the sea (m below MSL), never deeper than `floor`. */
  minDepth: 0.5,
  floor: 60,
};

const req = loadRequest(process.argv[2]);
const D = dirs(req.id);
const P = projection(req.bbox);
const W = Math.ceil((P.x1 - P.x0) / T.cell);
const H = Math.ceil((P.z1 - P.z0) / T.cell);
const N = W * H;
const cx = (i: number) => P.x0 + (i + 0.5) * T.cell;
const cz = (j: number) => P.z0 + (j + 0.5) * T.cell;
console.log(`grid ${W} x ${H} cells of ${T.cell} m (${((W * T.cell) / 1000).toFixed(1)} x ${((H * T.cell) / 1000).toFixed(1)} km)`);

// ── Rasters onto the grid ──
const dem = loadRaster(D.raw, 'dem');
const cover = loadRaster(D.raw, 'landcover');
const bathy = loadRaster(D.raw, 'bathymetry');
const demH = new Float32Array(N);
const bathyH = new Float32Array(N);
const coverC = new Uint8Array(N);
for (let j = 0; j < H; j++)
  for (let i = 0; i < W; i++) {
    const [lon, lat] = P.inv(cx(i), cz(j));
    const k = j * W + i;
    demH[k] = bilinear(dem, lon, lat);
    bathyH[k] = bilinear(bathy, lon, lat);
    coverC[k] = nearest(cover, lon, lat);
  }

// ── The coastline ──
const osm = JSON.parse(readFileSync(join(D.raw, 'osm.json'), 'utf8')) as {
  nodes: Record<string, [number, number]>;
  ways: Record<string, { nodes: number[]; tags: Record<string, string> }>;
};
const coast: [number, number][][] = [];
for (const w of Object.values(osm.ways)) {
  if (w.tags.natural !== 'coastline') continue;
  const line = w.nodes.map((n) => osm.nodes[n]).filter(Boolean).map(([lon, lat]) => P.fwd(lon, lat));
  if (line.length >= 2) coast.push(line);
}
console.log(`coastline: ${coast.length} ways, ${coast.reduce((n, l) => n + l.length, 0)} points`);

const BARRIER = 255;
const label = new Uint8Array(N); // 0 free, BARRIER coast
const landSeed = new Int32Array(N).fill(0);
const seaSeed = new Int32Array(N).fill(0);
const cellOf = (x: number, z: number) => {
  const i = Math.floor((x - P.x0) / T.cell);
  const j = Math.floor((z - P.z0) / T.cell);
  return i < 0 || j < 0 || i >= W || j >= H ? -1 : j * W + i;
};
for (const line of coast) {
  for (let s = 0; s + 1 < line.length; s++) {
    const [ax, az] = line[s];
    const [bx, bz] = line[s + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-6) continue;
    const n = Math.ceil(L / (T.cell * 0.3));
    // Left of the direction of travel in x-east, z-south axes: (dz, -dx) points to the left
    // of a walker... in a north-up view (x right, north up = -z) the left of (dx, dz) is
    // (dz, -dx) * -1? Work it out: heading east (1, 0): left is north = (0, -1). (dz, -dx) = (0, -1). Yes.
    const lx = (bz - az) / L;
    const lz = -(bx - ax) / L;
    for (let t = 0; t <= n; t++) {
      const x = ax + ((bx - ax) * t) / n;
      const z = az + ((bz - az) * t) / n;
      const k = cellOf(x, z);
      if (k >= 0) label[k] = BARRIER;
      const kl = cellOf(x + lx * T.cell * 1.6, z + lz * T.cell * 1.6);
      const ks = cellOf(x - lx * T.cell * 1.6, z - lz * T.cell * 1.6);
      if (kl >= 0) landSeed[kl]++;
      if (ks >= 0) seaSeed[ks]++;
    }
  }
}

// Patches between the barriers: flood fill, then each takes the side most of its seeds say.
const patch = new Int32Array(N).fill(-1);
const patchLand: number[] = [];
const patchSea: number[] = [];
const patchDem: number[] = [];
const patchSize: number[] = [];
const stack = new Int32Array(N);
for (let start = 0; start < N; start++) {
  if (label[start] === BARRIER || patch[start] >= 0) continue;
  const id = patchSize.length;
  let land = 0;
  let sea = 0;
  let demSum = 0;
  let size = 0;
  let sp = 0;
  stack[sp++] = start;
  patch[start] = id;
  while (sp) {
    const k = stack[--sp];
    size++;
    land += label[k] === BARRIER ? 0 : landSeed[k];
    sea += label[k] === BARRIER ? 0 : seaSeed[k];
    demSum += Number.isFinite(demH[k]) ? demH[k] : 0;
    const i = k % W;
    const j = (k - i) / W;
    const nb = [i > 0 ? k - 1 : -1, i < W - 1 ? k + 1 : -1, j > 0 ? k - W : -1, j < H - 1 ? k + W : -1];
    for (const q of nb) if (q >= 0 && label[q] !== BARRIER && patch[q] < 0) ((patch[q] = id), (stack[sp++] = q));
  }
  patchLand.push(land);
  patchSea.push(sea);
  patchDem.push(demSum / size);
  patchSize.push(size);
}
const isLandPatch = patchSize.map((_, p) => (patchLand[p] + patchSea[p] > 0 ? patchLand[p] >= patchSea[p] : patchDem[p] > 2));
const land = new Uint8Array(N);
for (let k = 0; k < N; k++) if (label[k] !== BARRIER) land[k] = isLandPatch[patch[k]] ? 1 : 0;
// The barrier cells themselves: the side most of their neighbours are on.
for (let k = 0; k < N; k++) {
  if (label[k] !== BARRIER) continue;
  const i = k % W;
  const j = (k - i) / W;
  let l = 0;
  let s = 0;
  for (let dj = -1; dj <= 1; dj++)
    for (let di = -1; di <= 1; di++) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      const q = jj * W + ii;
      if (label[q] === BARRIER) continue;
      if (land[q]) l++;
      else s++;
    }
  land[k] = l >= s ? 1 : 0;
}
const conflicts = patchSize.filter((_, p) => patchLand[p] > 0 && patchSea[p] > 0 && Math.min(patchLand[p], patchSea[p]) > 0.2 * Math.max(patchLand[p], patchSea[p])).length;

// ── Distance to the coast (m), signed: + on land, - at sea (two-pass chamfer, 3-4 weights) ──
const dist = new Float32Array(N).fill(1e9);
for (let k = 0; k < N; k++) {
  const i = k % W;
  const j = (k - i) / W;
  const other = (q: number) => land[q] !== land[k];
  if ((i > 0 && other(k - 1)) || (i < W - 1 && other(k + 1)) || (j > 0 && other(k - W)) || (j < H - 1 && other(k + W))) dist[k] = T.cell / 2;
}
const a = T.cell;
const b = T.cell * Math.SQRT2;
for (let j = 0; j < H; j++)
  for (let i = 0; i < W; i++) {
    const k = j * W + i;
    let d = dist[k];
    if (i > 0) d = Math.min(d, dist[k - 1] + a);
    if (j > 0) d = Math.min(d, dist[k - W] + a);
    if (i > 0 && j > 0) d = Math.min(d, dist[k - W - 1] + b);
    if (i < W - 1 && j > 0) d = Math.min(d, dist[k - W + 1] + b);
    dist[k] = d;
  }
for (let j = H - 1; j >= 0; j--)
  for (let i = W - 1; i >= 0; i--) {
    const k = j * W + i;
    let d = dist[k];
    if (i < W - 1) d = Math.min(d, dist[k + 1] + a);
    if (j < H - 1) d = Math.min(d, dist[k + W] + a);
    if (i < W - 1 && j < H - 1) d = Math.min(d, dist[k + W + 1] + b);
    if (i > 0 && j < H - 1) d = Math.min(d, dist[k + W - 1] + b);
    dist[k] = d;
  }

// ── Heights ──
const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
const heights = new Float32Array(N);
let missingDepth = 0;
for (let k = 0; k < N; k++) {
  const d = dist[k];
  if (land[k]) {
    const h = Number.isFinite(demH[k]) ? demH[k] : 0;
    heights[k] = d < T.shoreRise.reach ? Math.max(h, T.shoreRise.base + T.shoreRise.slope * d) : Math.max(h, T.shoreRise.base + T.shoreRise.slope * T.shoreRise.reach);
  } else {
    const shelf = -(T.shelf.base + T.shelf.slope * d);
    let deep = bathyH[k];
    if (!Number.isFinite(deep)) {
      missingDepth++;
      deep = shelf;
    }
    deep = Math.min(deep, -T.minDepth);
    const h = shelf + (deep - shelf) * smooth(d / T.shelf.blend);
    heights[k] = Math.max(-T.floor, Math.min(-T.minDepth, h));
  }
}

writeFileSync(join(D.work, 'heights.bin'), Buffer.from(heights.buffer));
writeFileSync(join(D.work, 'cover.bin'), Buffer.from(coverC.buffer));
writeFileSync(join(D.work, 'land.bin'), Buffer.from(land.buffer));
writeFileSync(join(D.work, 'dist.bin'), Buffer.from(dist.buffer));
writeFileSync(join(D.work, 'coast.json'), JSON.stringify(coast.map((l) => l.map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]))));
const landShare = land.reduce((s, v) => s + v, 0) / N;
const grid = { id: req.id, cell: T.cell, width: W, height: H, x0: P.x0, z0: P.z0, lon0: P.lon0, lat0: P.lat0, landShare, conflicts, missingDepth };
writeFileSync(join(D.work, 'grid.json'), JSON.stringify(grid, null, 1));
console.log(`land ${(landShare * 100).toFixed(0)} %, ${patchSize.length} patches, ${conflicts} disputed, depth missing in ${missingDepth} cells`);
console.log(`heights: ${heights.reduce((m, v) => Math.min(m, v), Infinity).toFixed(1)} .. ${heights.reduce((m, v) => Math.max(m, v), -Infinity).toFixed(1)} m`);

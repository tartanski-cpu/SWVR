/**
 * Stages 4 and 5, simplify, mesh and style: the reconciled height grid as a low-poly,
 * flat-shaded triangle mesh within a triangle budget, coloured per face from the land cover,
 * cut into chunks for the game's streaming.
 *
 *   Triangulation  greedy insertion (Garland and Heckbert's "fast polygonal approximation of
 *                  terrains"): start from the coastline's own points (OpenStreetMap's vertices,
 *                  thinned only where they lie within `coastTol` of straight, filled in on long
 *                  straight runs), a shore band of points just inland and just out from it (so
 *                  the waterline is crisp), and the box's edges; triangulate (Delaunay); find
 *                  in each triangle the grid cell it misses most; add the worst points; repeat
 *                  until the budget or the tolerance is met. How much an error counts: double
 *                  at the shore, falling off inland with distance from the water, almost
 *                  nothing on ground no boat can see (a viewshed from the sea), half in the
 *                  shallows, nothing in deep water (the sea is opaque). So the shore, cliffs
 *                  and harbours get the triangles; hidden glens get a few big ones.
 *   Colour         per face, from the land cover at its middle and the theme's palette; where
 *                  the map says what the shore is (shore.ts), sand, shingle, rock or cliff;
 *                  else steep faces are rock, and low, gentle ground by the water is foreshore
 *                  (not drawn as a beach: the map doesn't say it is one); mapped fields on open
 *                  grassland greener; the ground under a wood in the wood's own colour (the
 *                  forest map, trees.ts); under water the seabed shades from sand to dark by depth.
 *   Chunks         CHUNK m squares; a face belongs to the one its middle is in.
 *
 * Writes public/regions/<id>/terrain.bin (vertices Float32 x, y, z; faces Uint32 a, b, c;
 * colours Uint8 r, g, b per face; land-cover class Uint8 per face; faces sorted by chunk) and region.json (where each array
 * starts, the chunks, the counts, the credits). Run: node src/mesh.ts [requestId] (after harbours, whose basins it dredges, shore and trees).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Delaunator from 'delaunator';
import { dirs, loadRequest, projection } from './common.ts';
import { THEMES } from './themes.ts';

const T = {
  /** Triangles in the whole region before the deep-water ones are dropped. */
  budget: 110000,
  /** Stop refining where every triangle is within this (m, weighted). */
  tolerance: 0.8,
  /** The coast: OSM's vertices kept where they bend more than this off a straight line (m)... */
  coastTol: 0.5,
  /** ...and points filled in on straight runs longer than this (m). */
  coastStep: 25,
  /** The shore band: rows this far inland and out from the coast (m)... */
  band: 6,
  /** ...with points at least this far apart along them (m). */
  bandSpacing: 8,
  /** Land the land cover calls water within this of the sea coast is shore, not a loch (m). */
  shoreWater: 60,
  edgeStep: 300,
  chunk: 2000,
  /** Faces wholly deeper than this aren't drawn (the sea is opaque; as the game's terrain). */
  skipBelow: -3,
  /** The box's edges ease down to this (the game's open-sea floor, world/terrain.ts MAX_DEPTH) over this far (m). */
  edgeFloor: -40,
  edgeFade: 400,
  /** A modelled landmark's footprint, and this much round it (m), comes down to the ground about it: the land between these distances outside (m). */
  landmarkPad: 6,
  landmarkRing: [15, 45] as [number, number],
  /** Most faces a chunk may draw: more and the stage fails (and the game's test with it). The Quest's budget. */
  chunkBudget: 12000,
  /** Refinement stops adding points to a chunk at this share of its budget (the rest of the refinement goes elsewhere). */
  chunkFill: 0.9,
  /** A lost skerry stands this high at its middle (m above MSL). */
  skerryHeight: 1.8,
  /** Error weight in the shallows (0 > h > shallowTo); none deeper. */
  shallowWeight: 0.5,
  shallowTo: -5,
  /** Land within shoreReach m of the coast: error counts shoreWeight times (more triangles at the shore). */
  shoreReach: 80,
  shoreWeight: 2,
  /** Seen land farther in: weight 1 / (1 + distance / farHalf), so half at farHalf m. */
  farHalf: 1000,
  /** Land no boat can see: almost nothing (big triangles still cover it). */
  hiddenWeight: 0.03,
  /** The viewshed: eye height above the water (m), bearings tried, how far out (m), coarse cells a side. */
  eyeHeight: 3,
  viewRays: 32,
  viewReach: 8000,
  viewCoarse: 3,
  /** A chunked (big) region: its triangle budget by area instead (per km², about Oban's density), a coarser viewshed (for speed), and its coarse grid's cell (m). */
  budgetPerKm2: 850,
  viewCoarseChunked: 6,
  coarseCell: 50,
};

const req = loadRequest(process.argv[2]);
const D = dirs(req.id);
const P = projection(req.bbox);
const theme = THEMES[req.theme];
if (!theme) throw new Error(`no theme "${req.theme}"`);
const grid = JSON.parse(readFileSync(join(D.work, 'grid.json'), 'utf8'));
const { width: W, height: H, cell } = grid;
if (req.chunked) {
  T.budget = Math.round(((W * cell * H * cell) / 1e6) * T.budgetPerKm2);
  T.viewCoarse = T.viewCoarseChunked;
}
const rd = (name: string, Ctor: Float32ArrayConstructor | Uint8ArrayConstructor) => {
  const b = readFileSync(join(D.work, name));
  return new Ctor(b.buffer, b.byteOffset, b.byteLength / Ctor.BYTES_PER_ELEMENT);
};
const heights = rd('heights.bin', Float32Array) as Float32Array;
const cover = rd('cover.bin', Uint8Array) as Uint8Array;
const dist = rd('dist.bin', Float32Array) as Float32Array;
// What the shore is made of (shore.ts, run first; the coast extras plan, C3): the shore's
// class in bits 0-2 (1 sand, 2 shingle, 3 rock, 4 cliff), bit 3 the map says so, bit 4 a
// mapped field. Absent (an older run): none, and the shore is drawn as before.
const shore = new Uint8Array(W * H);
if (existsSync(join(D.out, 'shore.bin'))) {
  const src = readFileSync(join(D.out, 'shore.bin'));
  for (let i = 0, k = 0; i + 1 < src.length && k < shore.length; i += 2) {
    shore.fill(src[i + 1], k, Math.min(shore.length, k + src[i]));
    k += src[i];
  }
}
const SHORE_COLOUR = [0, theme.sand, theme.shingle, theme.rock, theme.cliff];
// The woods (trees.ts's forest map, run first): the ground under a wood takes the wood's own
// colour, its species' colours mixed by their shares a shade darker, as the game's canopy is
// coloured (world/view/treesView.ts canopyArrays). Far off the game draws no canopy, only
// this (owner: "after a certain distance ... it can literally become a flat vector color"):
// nothing a few metres over the ground to shimmer, and no triangles. A thin wood (density
// under FOREST_MIN of 15) is left to the land cover; scrub and orchards, too low to be in the
// canopy (CONFIG.trees.canopyMinHeight), tint the ground only part way (FOREST_LOW).
const FOREST_MIN = 6;
const FOREST_LOW = 0.45;
const FOREST_KINDS = ['plantation', 'broadleaf', 'mixed', 'natural', 'scrub', 'orchard'] as const;
const forestPath = join(D.out, 'forest.bin');
const forestLayout = existsSync(join(D.out, 'trees.json')) ? JSON.parse(readFileSync(join(D.out, 'trees.json'), 'utf8')) : null;
const forest = forestLayout && existsSync(forestPath) ? new Uint8Array(forestLayout.width * forestLayout.height) : null;
if (forest) {
  const src = readFileSync(forestPath);
  for (let i = 0, k = 0; i + 1 < src.length && k < forest.length; i += 2) {
    forest.fill(src[i + 1], k, Math.min(forest.length, k + src[i]));
    k += src[i];
  }
}
const woodColour = FOREST_KINDS.map((kind) => {
  const st = theme.forest.kinds[kind];
  const total = st.species.reduce((t, [, w]) => t + w, 0);
  const c = [0, 0, 0];
  for (const [sp, w] of st.species) {
    const hex = (theme.forest.colours[sp] ?? [0x4a6a34])[0];
    const [r, g, b] = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    c[0] += (r * w) / total;
    c[1] += (g * w) / total;
    c[2] += (b * w) / total;
  }
  return c.map((v) => v * 0.88) as [number, number, number];
});
/** The wood at (x, z): its kind (0-5) and whether it's thick enough to colour the ground, or null. */
const woodAt = (x: number, z: number): number | null => {
  if (!forest) return null;
  const i = Math.floor((x - forestLayout.x0) / forestLayout.cell);
  const j = Math.floor((z - forestLayout.z0) / forestLayout.cell);
  if (i < 0 || j < 0 || i >= forestLayout.width || j >= forestLayout.height) return null;
  const v = forest[j * forestLayout.width + i];
  return v >> 4 && (v & 15) >= FOREST_MIN ? (v >> 4) - 1 : null;
};
const coast = JSON.parse(readFileSync(join(D.work, 'coast.json'), 'utf8')) as [number, number][][];
// The harbours' dredged basins (harbours.ts): at least their depth round the piers and quays.
const dredgeFile = join(D.work, 'dredge.json');
let dredged = 0;
const basins = existsSync(dredgeFile) ? (JSON.parse(readFileSync(dredgeFile, 'utf8')) as { x: number; z: number; halfLength: number; halfWidth: number; yawDeg: number; depth: number; wall?: boolean }[]) : [];
/** Inside a dredged area (m of margin), and is it a quay wall (land goes down too)? */
const inArea = (p: (typeof basins)[number], x: number, z: number, margin = 0) => {
  const a = (p.yawDeg * Math.PI) / 180;
  const dx = x - p.x;
  const dz = z - p.z;
  return Math.abs(dx * Math.sin(a) - dz * Math.cos(a)) <= p.halfLength + margin && Math.abs(dx * Math.cos(a) + dz * Math.sin(a)) <= p.halfWidth + margin;
};
const wallDepth = (x: number, z: number): number | null => {
  for (const p of basins) if (p.wall && inArea(p, x, z)) return -p.depth;
  return null;
};
{
  for (const p of basins) {
    const a = (p.yawDeg * Math.PI) / 180;
    const ux = Math.sin(a);
    const uz = -Math.cos(a);
    const r = Math.hypot(p.halfLength, p.halfWidth);
    for (let j = Math.floor((p.z - r - grid.z0) / cell); j <= Math.ceil((p.z + r - grid.z0) / cell); j++)
      for (let i = Math.floor((p.x - r - grid.x0) / cell); i <= Math.ceil((p.x + r - grid.x0) / cell); i++) {
        if (i < 0 || j < 0 || i >= W || j >= H) continue;
        const dx = grid.x0 + (i + 0.5) * cell - p.x;
        const dz = grid.z0 + (j + 0.5) * cell - p.z;
        if (Math.abs(dx * ux + dz * uz) > p.halfLength || Math.abs(-dx * uz + dz * ux) > p.halfWidth) continue;
        const k = j * W + i;
        if ((p.wall || heights[k] < 0) && heights[k] > -p.depth) (heights[k] = -p.depth), dredged++;
      }
  }
}

// The skerries the 10 m grid lost (nav.ts lists them with drawn: false): stood back up as
// low rocks, `skerryHeight` m at the middle falling to the seabed at their radius, so the
// mesh draws them and a boat in the game runs onto them like any shore.
const navFile = join(D.out, 'nav.json');
const skerries = existsSync(navFile) ? (JSON.parse(readFileSync(navFile, 'utf8')).hazards as { kind: string; x: number; z: number; radius?: number; drawn?: boolean }[]).filter((h) => h.kind === 'skerry' && !h.drawn) : [];
for (const sk of skerries) {
  if (sk.x - grid.x0 < T.edgeFade || grid.x0 + W * cell - sk.x < T.edgeFade || sk.z - grid.z0 < T.edgeFade || grid.z0 + H * cell - sk.z < T.edgeFade) continue;
  const r = Math.min(30, Math.max(8, sk.radius ?? 8));
  for (let j = Math.floor((sk.z - r - grid.z0) / cell); j <= Math.ceil((sk.z + r - grid.z0) / cell); j++)
    for (let i = Math.floor((sk.x - r - grid.x0) / cell); i <= Math.ceil((sk.x + r - grid.x0) / cell); i++) {
      if (i < 0 || j < 0 || i >= W || j >= H) continue;
      const d = Math.hypot(grid.x0 + (i + 0.5) * cell - sk.x, grid.z0 + (j + 0.5) * cell - sk.z);
      if (d >= r) continue;
      const k = j * W + i;
      const top = T.skerryHeight - (T.skerryHeight - heights[k]) * (d / r) ** 1.5;
      heights[k] = Math.max(heights[k], top);
    }
}

// Under a modelled landmark (features.ts `landmarkModels`): the height data is a surface
// model, so a big building is in it as a mound (the Elbphilharmonie's, 25-30 m), which would
// bury the model drawn on it. Its footprint (and `landmarkPad` m round it) comes down to the
// ground about it: the lower quarter of the land's heights `landmarkRing` m outside. Water
// isn't raised; nothing else changes.
const featFile = join(D.out, 'features.json');
const models = existsSync(featFile) ? ((JSON.parse(readFileSync(featFile, 'utf8')).landmarkModels ?? []) as { parts: { outline: [number, number][] }[] }[]) : [];
const inPoly = (ring: [number, number][], x: number, z: number) => {
  let inside = false;
  for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
    const [xa, za] = ring[a];
    const [xb, zb] = ring[b];
    if (za > z !== zb > z && x < ((xb - xa) * (z - za)) / (zb - za) + xa) inside = !inside;
  }
  return inside;
};
const nearPoly = (ring: [number, number][], x: number, z: number, d: number) =>
  inPoly(ring, x, z) ||
  ring.some((q, a) => {
    if (!a) return false;
    const p0 = ring[a - 1];
    const [dx, dz] = [q[0] - p0[0], q[1] - p0[1]];
    const t = Math.max(0, Math.min(1, ((x - p0[0]) * dx + (z - p0[1]) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(p0[0] + dx * t - x, p0[1] + dz * t - z) < d;
  });
let flattened = 0;
for (const m of models) {
  const rings = m.parts.map((q) => q.outline);
  const xs = rings.flat().map((q) => q[0]);
  const zs = rings.flat().map((q) => q[1]);
  const pad = T.landmarkRing[1];
  const [i0, i1] = [Math.floor((Math.min(...xs) - pad - grid.x0) / cell), Math.ceil((Math.max(...xs) + pad - grid.x0) / cell)];
  const [j0, j1] = [Math.floor((Math.min(...zs) - pad - grid.z0) / cell), Math.ceil((Math.max(...zs) + pad - grid.z0) / cell)];
  const under: number[] = [];
  const around: number[] = [];
  for (let j = Math.max(0, j0); j <= Math.min(H - 1, j1); j++)
    for (let i = Math.max(0, i0); i <= Math.min(W - 1, i1); i++) {
      const [x, z] = [grid.x0 + (i + 0.5) * cell, grid.z0 + (j + 0.5) * cell];
      const k = j * W + i;
      if (rings.some((r) => nearPoly(r, x, z, T.landmarkPad))) under.push(k);
      else if (heights[k] > 0 && rings.some((r) => nearPoly(r, x, z, T.landmarkRing[1])) && !rings.some((r) => nearPoly(r, x, z, T.landmarkRing[0]))) around.push(heights[k]);
    }
  if (!around.length) continue;
  around.sort((a, b) => a - b);
  const ground = Math.max(0.5, around[Math.floor(around.length / 4)]);
  for (const k of under) if (heights[k] > ground) (heights[k] = ground), flattened++;
}

// The box's edges: land and sea ease to the game's open-sea floor (`edgeFloor`) over the
// last `edgeFade` m, so in the game the region ends in open sea, as its islands do, not in
// a sheer cut-off face with nothing beyond it.
const edgeDist = (x: number, z: number) => Math.min(x - grid.x0, grid.x0 + W * cell - x, z - grid.z0, grid.z0 + H * cell - z);
for (let j = 0; j < H; j++)
  for (let i = 0; i < W; i++) {
    const d = edgeDist(grid.x0 + (i + 0.5) * cell, grid.z0 + (j + 0.5) * cell);
    if (d >= T.edgeFade) continue;
    const t = Math.max(0, d / T.edgeFade);
    const w = t * t * (3 - 2 * t);
    const k = j * W + i;
    heights[k] = T.edgeFloor + (heights[k] - T.edgeFloor) * w;
  }

/** Grid height at a point (bilinear between cell centres). */
function hAt(x: number, z: number): number {
  const fx = (x - grid.x0) / cell - 0.5;
  const fz = (z - grid.z0) / cell - 0.5;
  const i = Math.max(0, Math.min(W - 2, Math.floor(fx)));
  const j = Math.max(0, Math.min(H - 2, Math.floor(fz)));
  const tx = Math.max(0, Math.min(1, fx - i));
  const tz = Math.max(0, Math.min(1, fz - j));
  const k = j * W + i;
  const a = heights[k] * (1 - tx) + heights[k + 1] * tx;
  const b = heights[k + W] * (1 - tx) + heights[k + W + 1] * tx;
  return a * (1 - tz) + b * tz;
}

// ── Starting points: the box's edges and the coastline ──
const xs: number[] = [];
const zs: number[] = [];
const hs: number[] = [];
const add = (x: number, z: number, h = hAt(x, z)) => (xs.push(x), zs.push(z), hs.push(h));
const X0 = grid.x0;
const Z0 = grid.z0;
const X1 = grid.x0 + W * cell;
const Z1 = grid.z0 + H * cell;
for (let x = X0; x < X1; x += T.edgeStep) (add(x, Z0), add(x, Z1));
for (let z = Z0 + T.edgeStep; z < Z1; z += T.edgeStep) (add(X0, z), add(X1, z));
add(X1, Z0);
add(X1, Z1);
const inside = (x: number, z: number) => x > X0 && x < X1 && z > Z0 && z < Z1;
// The coast: OpenStreetMap's own vertices (thinned where they lie within `coastTol` of a
// straight line, so the shape is kept, not resampled away), with points filled in on long
// straight runs. Then a shore band: a row of points a few metres inland (at least just above
// the water) and one a few metres out (just under it), so the waterline runs crisply along
// the real coast instead of wherever a big triangle happens to cross it.
const land = rd('land.bin', Uint8Array) as Uint8Array;
const isLand = (x: number, z: number) => {
  const i = Math.floor((x - X0) / cell);
  const j = Math.floor((z - Z0) / cell);
  return i >= 0 && j >= 0 && i < W && j < H && land[j * W + i] === 1;
};
const distAt = (x: number, z: number) => {
  const i = Math.max(0, Math.min(W - 1, Math.floor((x - X0) / cell)));
  const j = Math.max(0, Math.min(H - 1, Math.floor((z - Z0) / cell)));
  return dist[j * W + i];
};
function simplify(pts: [number, number][], tol: number): [number, number][] {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, az] = pts[a];
    const [bx, bz] = pts[b];
    const L = Math.hypot(bx - ax, bz - az) || 1;
    let m = -1;
    let mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / L;
      if (d > m) ((m = d), (mi = i));
    }
    if (m > tol) (keep[mi] = 1, stack.push([a, mi], [mi, b]));
  }
  return pts.filter((_, i) => keep[i]);
}
let coastPts = 0;
let bandPts = 0;
for (const raw of coast) {
  const line = simplify(raw, T.coastTol);
  const pts: [number, number][] = [];
  for (let s = 0; s + 1 < line.length; s++) {
    const [ax, az] = line[s];
    const [bx, bz] = line[s + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / T.coastStep));
    for (let k = 0; k < n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  pts.push(line[line.length - 1]);
  let lastBand: [number, number][] = [];
  for (let s = 0; s < pts.length; s++) {
    const [x, z] = pts[s];
    if (!inside(x, z) || edgeDist(x, z) < T.edgeFade) continue; // the edge fade has put it under water
    // On the coast: just above the water (the reconciled shore is lifted to this); at a quay, the foot of its wall.
    add(x, z, wallDepth(x, z) ?? 0.3);
    coastPts++;
    // The shore band, across the coast's direction here.
    const [px, pz] = pts[Math.max(0, s - 1)];
    const [nx, nz] = pts[Math.min(pts.length - 1, s + 1)];
    const L = Math.hypot(nx - px, nz - pz);
    if (L < 1e-6) continue;
    const ox = (-(nz - pz) / L) * T.band;
    const oz = ((nx - px) / L) * T.band;
    for (const sgn of [1, -1]) {
      const bx = x + ox * sgn;
      const bz = z + oz * sgn;
      // Only where the band lies clear of other coast (not across a narrow spit or gut),
      // and not crowding the last band point on this line.
      if (!inside(bx, bz) || edgeDist(bx, bz) < T.edgeFade || distAt(bx, bz) < T.band * 0.6) continue;
      if (lastBand.some(([qx, qz]) => Math.hypot(qx - bx, qz - bz) < T.bandSpacing)) continue;
      // Inland: at least just above the water, at most a 1-in-2 rise from the coast (the
      // height data is a surface model: trees and walls at the shore made needle-steep slivers).
      const h = wallDepth(bx, bz) ?? (isLand(bx, bz) ? Math.min(0.8 + T.band / 2, Math.max(0.8, hAt(bx, bz))) : Math.min(-0.8, hAt(bx, bz)));
      add(bx, bz, h);
      bandPts++;
      lastBand.push([bx, bz]);
      if (lastBand.length > 4) lastBand.shift();
    }
  }
}
// The basins: points inside their corners, so the mesh holds the dredged depth.
for (const p of basins) {
  const a = (p.yawDeg * Math.PI) / 180;
  const ux = Math.sin(a);
  const uz = -Math.cos(a);
  for (const sa of [-0.8, 0.8])
    for (const sc of [-0.6, 0.6]) {
      const x = p.x + ux * sa * p.halfLength - uz * sc * p.halfWidth;
      const z = p.z + uz * sa * p.halfLength + ux * sc * p.halfWidth;
      if (inside(x, z) && !isLand(x, z)) add(x, z, Math.min(-p.depth, hAt(x, z)));
    }
}
// Each skerry's top as a point, so it isn't smoothed away.
// (Not in the faded edge: there the ground round it has gone down to the open-sea floor.)
for (const sk of skerries) if (inside(sk.x, sk.z) && edgeDist(sk.x, sk.z) >= T.edgeFade) add(sk.x, sk.z, T.skerryHeight);
const fixedCount = xs.length;
console.log(`start: ${fixedCount} points (${coastPts} on the coast, ${bandPts} in the shore band)`);

// ── What the water sees ──
// A viewshed from the sea: a land cell counts as seen if, looking out from its top along any
// of `viewRays` bearings, some sea point within `viewReach` has a clear line to it from a
// wheelhouse eye (`eyeHeight` above the water). Worked on a coarse grid (`viewCoarse` cells
// a side) for speed. Ground no boat can see gets almost no triangles (big flat ones still
// cover it, so there are no holes from the air); seen ground gets fewer the farther it lies
// from the shore; the shore itself gets more.
const seen = (() => {
  const F = T.viewCoarse;
  const CWc = Math.ceil(W / F);
  const CHc = Math.ceil(H / F);
  const top = new Float32Array(CWc * CHc);
  const sea = new Uint8Array(CWc * CHc);
  for (let cj = 0; cj < CHc; cj++)
    for (let ci = 0; ci < CWc; ci++) {
      let m = -Infinity;
      let any = 0;
      for (let j = cj * F; j < Math.min(H, cj * F + F); j++)
        for (let i = ci * F; i < Math.min(W, ci * F + F); i++) {
          m = Math.max(m, heights[j * W + i]);
          if (!land[j * W + i]) any++;
        }
      top[cj * CWc + ci] = Math.max(0, m);
      sea[cj * CWc + ci] = any > (F * F) / 2 ? 1 : 0;
    }
  const vis = new Uint8Array(CWc * CHc);
  const step = F * cell;
  const steps = Math.ceil(T.viewReach / step);
  for (let cj = 0; cj < CHc; cj++)
    for (let ci = 0; ci < CWc; ci++) {
      const c = cj * CWc + ci;
      if (sea[c]) {
        vis[c] = 1;
        continue;
      }
      const h0 = top[c];
      rays: for (let r = 0; r < T.viewRays; r++) {
        const a = (r / T.viewRays) * Math.PI * 2;
        const dx = Math.cos(a);
        const dz = Math.sin(a);
        let maxA = -Infinity;
        for (let s = 1; s <= steps; s++) {
          const i = Math.round(ci + dx * s);
          const j = Math.round(cj + dz * s);
          if (i < 0 || j < 0 || i >= CWc || j >= CHc) break;
          const d = s * step;
          const k = j * CWc + i;
          const eye = (T.eyeHeight - h0) / d;
          if (sea[k]) {
            if (eye >= maxA) {
              vis[c] = 1;
              break rays;
            }
          } else maxA = Math.max(maxA, (top[k] - h0) / d);
          if (maxA > 0 && maxA >= eye) break; // blocked for good along this bearing
        }
      }
    }
  // Grow the seen area by a coarse cell, so faces on its rim count as seen.
  const grown = vis.slice();
  for (let cj = 0; cj < CHc; cj++)
    for (let ci = 0; ci < CWc; ci++)
      if (vis[cj * CWc + ci])
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const i = ci + di;
            const j = cj + dj;
            if (i >= 0 && j >= 0 && i < CWc && j < CHc) grown[j * CWc + i] = 1;
          }
  const out = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) out[j * W + i] = grown[Math.floor(j / F) * CWc + Math.floor(i / F)];
  return out;
})();
let landCells = 0;
let seenCells = 0;
for (let k = 0; k < W * H; k++) if (land[k]) (landCells++, seen[k] && seenCells++);
console.log(`viewshed: ${((100 * seenCells) / landCells).toFixed(0)} % of the land is seen from the water`);

// ── Greedy refinement ──
/** How much a height error at grid cell k counts (see the header and `T`). */
const cellWeight = new Float32Array(W * H);
for (let k = 0; k < W * H; k++) {
  const h = heights[k];
  if (h <= 0) cellWeight[k] = h > T.shallowTo ? T.shallowWeight : 0;
  else if (!seen[k]) cellWeight[k] = T.hiddenWeight;
  else if (dist[k] < T.shoreReach) cellWeight[k] = T.shoreWeight;
  else cellWeight[k] = 1 / (1 + dist[k] / T.farHalf);
}
let tri: Uint32Array = new Uint32Array();
for (let round = 0; ; round++) {
  const coords = new Float64Array(xs.length * 2);
  for (let i = 0; i < xs.length; i++) ((coords[2 * i] = xs[i]), (coords[2 * i + 1] = zs[i]));
  tri = new Delaunator(coords).triangles;
  const nt = tri.length / 3;
  if (nt >= T.budget) break;
  // Each triangle's worst cell.
  const cand: { err: number; x: number; z: number; h: number }[] = [];
  for (let t = 0; t < nt; t++) {
    const a = tri[3 * t];
    const b = tri[3 * t + 1];
    const c = tri[3 * t + 2];
    const ax = xs[a], az = zs[a], bx = xs[b], bz = zs[b], cx = xs[c], cz = zs[c]; // prettier-ignore
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(det) < 1e-9) continue;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - X0) / cell));
    const i1 = Math.min(W - 1, Math.ceil((Math.max(ax, bx, cx) - X0) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - Z0) / cell));
    const j1 = Math.min(H - 1, Math.ceil((Math.max(az, bz, cz) - Z0) / cell));
    let best = 0;
    let bi = -1;
    let bj = -1;
    for (let j = j0; j <= j1; j++) {
      const z = Z0 + (j + 0.5) * cell;
      for (let i = i0; i <= i1; i++) {
        const x = X0 + (i + 0.5) * cell;
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
        const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const g = heights[j * W + i];
        const p = l1 * hs[a] + l2 * hs[b] + l3 * hs[c];
        // Land where the sea should be (or sea where land should be) always counts in full.
        const w = (p > 0) !== (g > 0) ? Math.max(1, cellWeight[j * W + i]) : cellWeight[j * W + i];
        const e = Math.abs(g - p) * w;
        if (e > best) ((best = e), (bi = i), (bj = j));
      }
    }
    if (best > T.tolerance && bi >= 0) cand.push({ err: best, x: X0 + (bi + 0.5) * cell, z: Z0 + (bj + 0.5) * cell, h: heights[bj * W + bi] });
  }
  if (!cand.length) break;
  cand.sort((p, q) => q.err - p.err);
  // Each chunk's triangles so far (by their middles; each point added makes about two more):
  // a chunk filled to `chunkFill` of its budget takes no more points (Sunnmøre: steep mountains
  // straight out of an intricate coast put chunks over the Quest's budget).
  const chunkKey = (x: number, z: number) => Math.floor((z - Z0) / T.chunk) * 100000 + Math.floor((x - X0) / T.chunk);
  const perChunk = new Map<number, number>();
  for (let t = 0; t < nt; t++) {
    const a = tri[3 * t];
    const b = tri[3 * t + 1];
    const c = tri[3 * t + 2];
    const k = chunkKey((xs[a] + xs[b] + xs[c]) / 3, (zs[a] + zs[b] + zs[c]) / 3);
    perChunk.set(k, (perChunk.get(k) ?? 0) + 1);
  }
  const chunkCap = T.chunkBudget * T.chunkFill;
  const room = Math.floor((T.budget - nt) / 2);
  const most = Math.min(cand.length, room, Math.max(400, Math.floor(xs.length * 0.25)));
  let take = 0;
  for (let k = 0; k < cand.length && take < most; k++) {
    const key = chunkKey(cand[k].x, cand[k].z);
    const n = perChunk.get(key) ?? 0;
    if (n + 2 > chunkCap) continue;
    perChunk.set(key, n + 2);
    add(cand[k].x, cand[k].z, cand[k].h);
    take++;
  }
  console.log(`round ${round}: ${nt} triangles, worst ${cand[0].err.toFixed(1)} m, +${take} points`);
  if (take < 1) break;
}

// ── Faces: drop the deep ones, colour the rest, sort into chunks ──
const rgb = (hex: number): [number, number, number] => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const hash = (x: number, z: number) => {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
};
interface Face {
  a: number;
  b: number;
  c: number;
  chunk: number;
  col: [number, number, number];
  /** WorldCover class at its middle (0 under water), for the viewer's land-cover overlay. */
  cls: number;
}
const CW = Math.ceil((X1 - X0) / T.chunk);
const faces: Face[] = [];
const DEEP = 1e9;
for (let t = 0; t < tri.length / 3; t++) {
  const a = tri[3 * t];
  const b = tri[3 * t + 1];
  const c = tri[3 * t + 2];
  const deep = Math.max(hs[a], hs[b], hs[c]) < T.skipBelow;
  const mx = (xs[a] + xs[b] + xs[c]) / 3;
  const mz = (zs[a] + zs[b] + zs[c]) / 3;
  const mh = (hs[a] + hs[b] + hs[c]) / 3;
  // Steepness: the face normal's up component.
  const ux = xs[b] - xs[a], uy = hs[b] - hs[a], uz = zs[b] - zs[a]; // prettier-ignore
  const vx = xs[c] - xs[a], vy = hs[c] - hs[a], vz = zs[c] - zs[a]; // prettier-ignore
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const up = Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1);
  const ci = Math.max(0, Math.min(W - 1, Math.floor((mx - X0) / cell)));
  const cj = Math.max(0, Math.min(H - 1, Math.floor((mz - Z0) / cell)));
  const k = cj * W + ci;
  let col: [number, number, number];
  if (mh < -0.3) {
    const s = Math.min(1, -mh / 6);
    const [r1, g1, b1] = rgb(theme.shallow);
    const [r2, g2, b2] = rgb(theme.deep);
    col = [r1 + (r2 - r1) * s, g1 + (g2 - g1) * s, b1 + (b2 - b1) * s];
  } else if (shore[k] & 8) col = rgb(SHORE_COLOUR[shore[k] & 7]); // the map says what the shore is
  else if (up < 0.7) col = rgb(theme.rock);
  else if (mh < 2.2 && dist[k] < 30 && up > 0.85 && cover[k] !== 10 && cover[k] !== 50) col = rgb(theme.foreshore); // low shore the map is silent on: not drawn as a beach
  else {
    // Land the land cover calls water: right at the sea coast that's the satellite's coastline
    // disagreeing with the map's by a few metres (it would show as blue holes in the shore),
    // so it takes the shore's colour; inland, a loch (drawn as land in water colour for now).
    const cls = (cover[k] === 80 || cover[k] === 0) && dist[k] < T.shoreWater ? (up < 0.7 ? 60 : 30) : cover[k];
    col = rgb(theme.cover[cls] ?? theme.cover[30]);
    // Open hill above the fields: grass shading into moor (themes.ts moor).
    const wood = woodAt(mx, mz);
    if (wood !== null) {
      const w = woodColour[wood];
      const t = FOREST_KINDS[wood] === 'scrub' || FOREST_KINDS[wood] === 'orchard' ? FOREST_LOW : 1;
      col = [col[0] + (w[0] - col[0]) * t, col[1] + (w[1] - col[1]) * t, col[2] + (w[2] - col[2]) * t];
    } else if (shore[k] & 16 && cover[k] === 30) {
      // A mapped field on open grassland: greener, the improved pasture of the low ground.
      const f = rgb(theme.fields);
      col = [col[0] + (f[0] - col[0]) * 0.7, col[1] + (f[1] - col[1]) * 0.7, col[2] + (f[2] - col[2]) * 0.7];
    } else if (theme.moor && (cover[k] === 30 || cover[k] === 100)) {
      const t = Math.min(1, Math.max(0, (mh - theme.moor.from) / (theme.moor.to - theme.moor.from)));
      const m = rgb(theme.moor.colour);
      col = [col[0] + (m[0] - col[0]) * t, col[1] + (m[1] - col[1]) * t, col[2] + (m[2] - col[2]) * t];
    }
  }
  const v = 0.93 + 0.14 * hash(Math.round(mx), Math.round(mz));
  col = [Math.min(255, col[0] * v), Math.min(255, col[1] * v), Math.min(255, col[2] * v)];
  const chunk = Math.floor((mz - Z0) / T.chunk) * CW + Math.floor((mx - X0) / T.chunk);
  // Deep faces aren't drawn (the sea is opaque) but the game's physics and depth sounder
  // need the seabed there: they go after all the chunks, in a range of their own.
  faces.push({ a, b, c, chunk: deep ? DEEP : chunk, col, cls: mh < -0.3 ? 0 : cover[k] });
}
faces.sort((p, q) => p.chunk - q.chunk);
const deepStart = faces.findIndex((f) => f.chunk === DEEP);
const drawn = deepStart < 0 ? faces.length : deepStart;

// ── Write ──
const nv = xs.length;
const vbuf = new Float32Array(nv * 3);
for (let i = 0; i < nv; i++) ((vbuf[3 * i] = xs[i]), (vbuf[3 * i + 1] = hs[i]), (vbuf[3 * i + 2] = zs[i]));
const ibuf = new Uint32Array(faces.length * 3);
const cbuf = new Uint8Array(faces.length * 3);
const kbuf = new Uint8Array(faces.length);
const chunks: { id: number; x0: number; z0: number; size: number; start: number; count: number }[] = [];
faces.forEach((f, n) => {
  ibuf.set([f.a, f.b, f.c], n * 3);
  cbuf.set(f.col.map(Math.round), n * 3);
  kbuf[n] = f.cls;
  if (f.chunk === DEEP) return;
  const last = chunks[chunks.length - 1];
  if (!last || last.id !== f.chunk) chunks.push({ id: f.chunk, x0: X0 + (f.chunk % CW) * T.chunk, z0: Z0 + Math.floor(f.chunk / CW) * T.chunk, size: T.chunk, start: n, count: 1 });
  else last.count++;
});
// A whole region: one file. A chunked one (a big region, Voyage mode): a file per chunk and
// a coarse grid of the whole (writeChunked, below).
let bytes = 0;
let terrain: Record<string, unknown>;
if (!req.chunked) {
  const parts = [vbuf, ibuf, cbuf, kbuf];
  const offsets: number[] = [];
  let off = 0;
  for (const p of parts) {
    offsets.push(off);
    off += p.byteLength;
    off = Math.ceil(off / 4) * 4;
  }
  const out = Buffer.alloc(off);
  parts.forEach((p, i) => Buffer.from(p.buffer, p.byteOffset, p.byteLength).copy(out, offsets[i]));
  writeFileSync(join(D.out, 'terrain.bin'), out);
  bytes = out.byteLength;
  terrain = {
    file: 'terrain.bin',
    vertices: { offset: offsets[0], count: nv },
    faces: { offset: offsets[1], count: faces.length },
    /** Faces after the chunks: the deep seabed, not drawn, for the physics and the depth sounder. */
    deep: { start: drawn, count: faces.length - drawn },
    colours: { offset: offsets[2] },
    classes: { offset: offsets[3], note: 'ESA WorldCover class per face; 0 under water' },
  };
  if (existsSync(join(D.out, 'chunks'))) rmSync(join(D.out, 'chunks'), { recursive: true });
} else terrain = writeChunked();

/**
 * The chunked files. Each chunk (`T.chunk` m square) gets chunks/<id>.bin: Uint32 vertex and
 * face counts, Float32 vertices (x, y, z, region metres; only the ones its faces use), Uint32
 * faces (its drawn faces first, then its deep ones), RGB bytes per face. A face belongs to the
 * chunk its middle is in. And coarse.bin: the whole region every `coarseCell` m, rasterised from
 * the same mesh (so it agrees with it), Int16 heights in decimetres then RGB bytes, rows
 * running south from the north-west corner: the game's far view, charts, and the ground
 * wherever a chunk isn't loaded.
 */
function writeChunked() {
  const dir = join(D.out, 'chunks');
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  mkdirSync(dir, { recursive: true });
  if (existsSync(join(D.out, 'terrain.bin'))) rmSync(join(D.out, 'terrain.bin'));
  const home = (f: Face) => {
    const mx = (xs[f.a] + xs[f.b] + xs[f.c]) / 3;
    const mz = (zs[f.a] + zs[f.b] + zs[f.c]) / 3;
    return Math.min(CH - 1, Math.floor((mz - Z0) / T.chunk)) * CW + Math.min(CW - 1, Math.floor((mx - X0) / T.chunk));
  };
  const CH = Math.ceil((Z1 - Z0) / T.chunk);
  const byChunk = new Map<number, Face[]>();
  for (const f of faces) {
    const k = home(f);
    if (!byChunk.has(k)) byChunk.set(k, []);
    byChunk.get(k)!.push(f); // faces are sorted drawn first, so each list is too
  }
  const list: { id: number; x0: number; z0: number; size: number; file: string; drawn: number; faces: number }[] = [];
  for (const id of [...byChunk.keys()].sort((p, q) => p - q)) {
    const fs = byChunk.get(id)!;
    const remap = new Map<number, number>();
    const vs: number[] = [];
    const ix = new Uint32Array(fs.length * 3);
    const col = new Uint8Array(fs.length * 3);
    fs.forEach((f, n) => {
      [f.a, f.b, f.c].forEach((v, q) => {
        let r = remap.get(v);
        if (r === undefined) (remap.set(v, (r = remap.size)), vs.push(xs[v], hs[v], zs[v]));
        ix[n * 3 + q] = r;
      });
      col.set(f.col.map(Math.round), n * 3);
    });
    const head = new Uint32Array([remap.size, fs.length]);
    const buf = Buffer.concat([head, new Float32Array(vs), ix, col].map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength)));
    const file = `chunks/${id}.bin`;
    writeFileSync(join(D.out, file), buf);
    bytes += buf.byteLength;
    list.push({ id, x0: X0 + (id % CW) * T.chunk, z0: Z0 + Math.floor(id / CW) * T.chunk, size: T.chunk, file, drawn: fs.filter((f) => f.chunk !== DEEP).length, faces: fs.length });
  }
  // The coarse grid: each cell centre takes the height and colour of the face over it.
  const c = T.coarseCell;
  const gw = Math.floor((X1 - X0) / c);
  const gh = Math.floor((Z1 - Z0) / c);
  const gx0 = X0 + c / 2;
  const gz0 = Z0 + c / 2;
  const gH = new Int16Array(gw * gh);
  const gC = new Uint8Array(gw * gh * 3);
  for (const f of faces) {
    const ax = xs[f.a], az = zs[f.a], bx = xs[f.b], bz = zs[f.b], cx = xs[f.c], cz = zs[f.c]; // prettier-ignore
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(det) < 1e-9) continue;
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - gx0) / c));
    const i1 = Math.min(gw - 1, Math.floor((Math.max(ax, bx, cx) - gx0) / c));
    const j0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - gz0) / c));
    const j1 = Math.min(gh - 1, Math.floor((Math.max(az, bz, cz) - gz0) / c));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = gx0 + i * c;
        const z = gz0 + j * c;
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
        const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
        const k = j * gw + i;
        gH[k] = Math.round((l1 * hs[f.a] + l2 * hs[f.b] + l3 * hs[f.c]) * 10);
        gC.set(f.col.map(Math.round), k * 3);
      }
  }
  const coarse = Buffer.concat([Buffer.from(gH.buffer), Buffer.from(gC.buffer)]);
  writeFileSync(join(D.out, 'coarse.bin'), coarse);
  bytes += coarse.byteLength;
  console.log(`chunked: ${list.length} chunk files, coarse grid ${gw} x ${gh} at ${c} m (${(coarse.byteLength / 1e6).toFixed(2)} MB)`);
  return { chunked: true, coarse: { file: 'coarse.bin', x0: gx0, z0: gz0, cell: c, width: gw, height: gh }, chunks: list, vertices: { count: nv }, faces: { count: faces.length }, deep: { count: faces.length - drawn } };
}
const sources = readFileSync(join(D.raw, 'sources.yaml'), 'utf8');
const region = {
  format: 'swvr-coast-region/0.1',
  id: req.id,
  name: req.name,
  bbox: req.bbox,
  projection: { lon0: P.lon0, lat0: P.lat0, note: 'equirectangular about (lon0, lat0); x east, z south, metres' },
  box: { x0: X0, x1: X1, z0: Z0, z1: Z1 },
  terrain,
  /** The coastline (OpenStreetMap), local metres, 0.1 m: for charts and the viewer. */
  coast: coast.map((l) => l.flat()),
  chunks,
  credits: '© OpenStreetMap contributors (ODbL), OpenSeaMap, Copernicus DEM GLO-30 (© DLR, © Airbus), EMODnet Bathymetry, ESA WorldCover (CC BY 4.0)',
  licence: 'Region data derived from OpenStreetMap: Open Database License (ODbL) 1.0. See sources.yaml.',
};
// Keep what the later stages added (nav.ts, harbours.ts), so re-meshing alone doesn't drop them.
const regionPath = join(D.out, 'region.json');
if (existsSync(regionPath)) {
  const before = JSON.parse(readFileSync(regionPath, 'utf8'));
  for (const k of ['nav', 'harbours']) if (before[k]) (region as Record<string, unknown>)[k] = before[k];
}
for (const k of ['nav', 'harbours']) if (existsSync(join(D.out, `${k}.json`))) (region as Record<string, unknown>)[k] = `${k}.json`;
writeFileSync(regionPath, JSON.stringify(region, null, 1));
writeFileSync(join(D.out, 'sources.yaml'), sources);
const reportPath = join(D.out, 'report.json');
const earlier = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : {};
const report = {
  ...earlier,
  dredgedCells: dredged,
  landmarkCellsLowered: flattened,
  triangles: drawn,
  deepTriangles: faces.length - drawn,
  vertices: nv,
  bytes,
  chunks: chunks.map((c) => ({ id: c.id, triangles: c.count })),
  landShare: grid.landShare,
  /** Share of the land a boat can see (the rest gets almost no triangles), and the coast's points. */
  seenFromWater: Math.round((100 * seenCells) / landCells) / 100,
  coastPoints: coastPts,
  shoreBandPoints: bandPts,
  chunkBudget: T.chunkBudget,
  warnings: [...(earlier.warnings ?? []).filter((w: string) => !/coastline's sides|without bathymetry|over the triangle budget/.test(w)), ...chunks.filter((c) => c.count > T.chunkBudget).map((c) => `chunk ${c.id} is over the triangle budget (${c.count} > ${T.chunkBudget})`), ...(grid.conflicts ? [`${grid.conflicts} patches where the coastline's sides disagree (check the coast there)`] : []), ...(grid.missingDepth ? [`${grid.missingDepth} sea cells without bathymetry (shelf used)`] : [])],
};
writeFileSync(reportPath, JSON.stringify(report, null, 1));
console.log(`mesh: ${drawn} faces drawn, ${faces.length - drawn} deep (physics only), ${nv} vertices, ${chunks.length} chunks, ${(bytes / 1e6).toFixed(2)} MB`);
console.log(`chunk faces: max ${Math.max(...chunks.map((c) => c.count))}, mean ${Math.round(drawn / chunks.length)}`);
// The budget: a chunk over it fails the stage (the game's tests check the same, so its build fails too).
const over = chunks.filter((c) => c.count > T.chunkBudget);
if (over.length) {
  console.error(`over budget: ${over.map((c) => `chunk ${c.id} ${c.count} faces`).join(', ')} (budget ${T.chunkBudget})`);
  process.exitCode = 1;
}

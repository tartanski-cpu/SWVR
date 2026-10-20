/**
 * Stages 4 and 5, simplify, mesh and style: the reconciled height grid as a low-poly,
 * flat-shaded triangle mesh within a triangle budget, coloured per face from the land cover,
 * cut into chunks for the game's streaming.
 *
 *   Triangulation  greedy insertion (Garland and Heckbert's "fast polygonal approximation of
 *                  terrains"): start from the coastline's points (resampled every
 *                  `coastStep` m, so the mesh edge follows the real coast) and the box's
 *                  edges; triangulate (Delaunay); find in each triangle the grid cell it misses
 *                  most; add the worst points; repeat until the budget or the tolerance is met.
 *                  Error counts fully on land, half in the shallows, nothing in deep water (the
 *                  sea is opaque). So cliffs, shores and harbours get triangles; gentle hills few.
 *   Colour         per face, from the land cover at its middle and the theme's palette; steep
 *                  faces are rock; low, gentle ground by the water is sand; under water the
 *                  seabed shades from sand to dark by depth.
 *   Chunks         CHUNK m squares; a face belongs to the one its middle is in.
 *
 * Writes public/regions/<id>/terrain.bin (vertices Float32 x, y, z; faces Uint32 a, b, c;
 * colours Uint8 r, g, b per face; land-cover class Uint8 per face; faces sorted by chunk) and region.json (where each array
 * starts, the chunks, the counts, the credits). Run: node src/mesh.ts [requestId].
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Delaunator from 'delaunator';
import { dirs, loadRequest, projection } from './common.ts';
import { THEMES } from './themes.ts';

const T = {
  /** Triangles in the whole region before the deep-water ones are dropped. */
  budget: 110000,
  /** Stop refining where every triangle is within this (m, weighted). */
  tolerance: 0.8,
  coastStep: 20,
  edgeStep: 300,
  chunk: 2000,
  /** Faces wholly deeper than this aren't drawn (the sea is opaque; as the game's terrain). */
  skipBelow: -3,
  /** Error weight in the shallows (0 > h > shallowTo) and below. */
  shallowWeight: 0.5,
  shallowTo: -5,
};

const req = loadRequest(process.argv[2]);
const D = dirs(req.id);
const P = projection(req.bbox);
const theme = THEMES[req.theme];
if (!theme) throw new Error(`no theme "${req.theme}"`);
const grid = JSON.parse(readFileSync(join(D.work, 'grid.json'), 'utf8'));
const { width: W, height: H, cell } = grid;
const rd = (name: string, Ctor: Float32ArrayConstructor | Uint8ArrayConstructor) => {
  const b = readFileSync(join(D.work, name));
  return new Ctor(b.buffer, b.byteOffset, b.byteLength / Ctor.BYTES_PER_ELEMENT);
};
const heights = rd('heights.bin', Float32Array) as Float32Array;
const cover = rd('cover.bin', Uint8Array) as Uint8Array;
const dist = rd('dist.bin', Float32Array) as Float32Array;
const coast = JSON.parse(readFileSync(join(D.work, 'coast.json'), 'utf8')) as [number, number][][];

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
for (const line of coast) {
  let carry = 0;
  for (let s = 0; s + 1 < line.length; s++) {
    const [ax, az] = line[s];
    const [bx, bz] = line[s + 1];
    const L = Math.hypot(bx - ax, bz - az);
    for (let t = carry; t < L; t += T.coastStep) {
      const x = ax + ((bx - ax) * t) / L;
      const z = az + ((bz - az) * t) / L;
      // On the coast: just above the water (the reconciled shore is lifted to this).
      if (inside(x, z)) add(x, z, 0.3);
    }
    carry = (carry + Math.ceil((L - carry) / T.coastStep) * T.coastStep) - L;
  }
}
const fixedCount = xs.length;
console.log(`start: ${fixedCount} points (${fixedCount - 4 * Math.ceil((X1 - X0) / T.edgeStep)} on the coast)`);

// ── Greedy refinement ──
function weight(h: number): number {
  if (h > 0) return 1;
  if (h > T.shallowTo) return T.shallowWeight;
  return 0;
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
        const e = Math.abs(g - p) * Math.max(weight(g), weight(p));
        if (e > best) ((best = e), (bi = i), (bj = j));
      }
    }
    if (best > T.tolerance && bi >= 0) cand.push({ err: best, x: X0 + (bi + 0.5) * cell, z: Z0 + (bj + 0.5) * cell, h: heights[bj * W + bi] });
  }
  if (!cand.length) break;
  cand.sort((p, q) => q.err - p.err);
  const room = Math.floor((T.budget - nt) / 2);
  const take = Math.min(cand.length, room, Math.max(400, Math.floor(xs.length * 0.25)));
  for (let k = 0; k < take; k++) add(cand[k].x, cand[k].z, cand[k].h);
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
for (let t = 0; t < tri.length / 3; t++) {
  const a = tri[3 * t];
  const b = tri[3 * t + 1];
  const c = tri[3 * t + 2];
  if (Math.max(hs[a], hs[b], hs[c]) < T.skipBelow) continue;
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
  } else if (up < 0.7) col = rgb(theme.rock);
  else if (mh < 2.2 && dist[k] < 30 && up > 0.85 && cover[k] !== 10 && cover[k] !== 50) col = rgb(theme.sand);
  else {
    col = rgb(theme.cover[cover[k]] ?? theme.cover[30]);
    // Open hill above the fields: grass shading into moor (themes.ts moor).
    if (theme.moor && (cover[k] === 30 || cover[k] === 100)) {
      const t = Math.min(1, Math.max(0, (mh - theme.moor.from) / (theme.moor.to - theme.moor.from)));
      const m = rgb(theme.moor.colour);
      col = [col[0] + (m[0] - col[0]) * t, col[1] + (m[1] - col[1]) * t, col[2] + (m[2] - col[2]) * t];
    }
  }
  const v = 0.93 + 0.14 * hash(Math.round(mx), Math.round(mz));
  col = [Math.min(255, col[0] * v), Math.min(255, col[1] * v), Math.min(255, col[2] * v)];
  const chunk = Math.floor((mz - Z0) / T.chunk) * CW + Math.floor((mx - X0) / T.chunk);
  faces.push({ a, b, c, chunk, col, cls: mh < -0.3 ? 0 : cover[k] });
}
faces.sort((p, q) => p.chunk - q.chunk);

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
  const last = chunks[chunks.length - 1];
  if (!last || last.id !== f.chunk) chunks.push({ id: f.chunk, x0: X0 + (f.chunk % CW) * T.chunk, z0: Z0 + Math.floor(f.chunk / CW) * T.chunk, size: T.chunk, start: n, count: 1 });
  else last.count++;
});
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
const sources = readFileSync(join(D.raw, 'sources.yaml'), 'utf8');
const region = {
  format: 'swvr-coast-region/0.1',
  id: req.id,
  name: req.name,
  bbox: req.bbox,
  projection: { lon0: P.lon0, lat0: P.lat0, note: 'equirectangular about (lon0, lat0); x east, z south, metres' },
  box: { x0: X0, x1: X1, z0: Z0, z1: Z1 },
  terrain: {
    file: 'terrain.bin',
    vertices: { offset: offsets[0], count: nv },
    faces: { offset: offsets[1], count: faces.length },
    colours: { offset: offsets[2] },
    classes: { offset: offsets[3], note: 'ESA WorldCover class per face; 0 under water' },
  },
  /** The coastline (OpenStreetMap), local metres, 0.1 m: for charts and the viewer. */
  coast: coast.map((l) => l.flat()),
  chunks,
  credits: '© OpenStreetMap contributors (ODbL), OpenSeaMap, Copernicus DEM GLO-30 (© DLR, © Airbus), EMODnet Bathymetry, ESA WorldCover (CC BY 4.0)',
  licence: 'Region data derived from OpenStreetMap: Open Database License (ODbL) 1.0. See sources.yaml.',
};
writeFileSync(join(D.out, 'region.json'), JSON.stringify(region, null, 1));
writeFileSync(join(D.out, 'sources.yaml'), sources);
const report = {
  triangles: faces.length,
  vertices: nv,
  bytes: out.byteLength,
  chunks: chunks.map((c) => ({ id: c.id, triangles: c.count })),
  landShare: grid.landShare,
  warnings: [...(grid.conflicts ? [`${grid.conflicts} patches where the coastline's sides disagree (check the coast there)`] : []), ...(grid.missingDepth ? [`${grid.missingDepth} sea cells without bathymetry (shelf used)`] : [])],
};
writeFileSync(join(D.out, 'report.json'), JSON.stringify(report, null, 1));
console.log(`mesh: ${faces.length} faces drawn (${tri.length / 3} before deep water dropped), ${nv} vertices, ${chunks.length} chunks, ${(out.byteLength / 1e6).toFixed(2)} MB`);
console.log(`chunk faces: max ${Math.max(...chunks.map((c) => c.count))}, mean ${Math.round(faces.length / chunks.length)}`);

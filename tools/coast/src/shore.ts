/**
 * Stage 12, the shore (the coast extras plan, C3): what the shore is made of, as a map the
 * mesh colours its faces from and the game reads for a boat running onto it (a bow-ramp boat
 * may beach on sand or shingle; world/coastShore.ts). One byte a cell of the reconciled grid:
 *
 *   bits 0-2  the shore: 0 none (inland, or open water), 1 sand, 2 shingle, 3 rock, 4 cliff
 *   bit 3     the map says so (a beach, shingle or bare rock area, or a cliff line); else the
 *             mesh's own rule decided it
 *   bit 4     a mapped field (landuse farmland / meadow): the mesh greens open grassland there
 *
 * Only the shore band is classed: cells within `band` m of the coastline, from `below` m deep
 * to `above` m high (where a hull meets the ground). Nothing is guessed:
 *   - the map's areas: beaches by surface (sand; shingle, pebbles and gravel as shingle; rock;
 *     a beach with no surface tagged is sand), shingle, bare rock;
 *   - within `cliffReach` m of a mapped cliff line, cliff (over anything else);
 *   - steep ground (rise over run above `steep`), rock, as the mesh draws it;
 *   - any other shore is 0: foreshore the map says nothing about (the mesh draws it in the
 *     theme's foreshore colour, not as a beach), neither beach nor rock;
 *   - the shallow seabed off the shore (under water, in the band) takes the class of the
 *     nearest classed shore within `offshore` m: the sand off a beach is where a beaching
 *     bow touches first.
 * Run-length packed (pairs: count 1-255, value), like the forest map.
 *
 * Writes public/regions/<id>/shore.bin and shore.json (its layout and counts). Run: node
 * src/shore.ts [requestId] (after features, before mesh).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dirs, loadRequest, projection } from './common.ts';

const T = {
  band: 40,
  below: -3,
  above: 8,
  cliffReach: 12,
  steep: 1.0,
  offshore: 30,
};
export const SHORE = { none: 0, sand: 1, shingle: 2, rock: 3, cliff: 4 } as const;
const MAPPED = 8;
const FIELD = 16;

const req = loadRequest(process.argv[2]);
const D = dirs(req.id);
const P = projection(req.bbox);
const grid = JSON.parse(readFileSync(join(D.work, 'grid.json'), 'utf8'));
const rd = (name: string, Ctor: Float32ArrayConstructor | Uint8ArrayConstructor) => {
  const b = readFileSync(join(D.work, name));
  return new Ctor(b.buffer, b.byteOffset, b.byteLength / Ctor.BYTES_PER_ELEMENT);
};
const heights = rd('heights.bin', Float32Array) as Float32Array;
const dist = rd('dist.bin', Float32Array) as Float32Array;
const W: number = grid.width;
const H: number = grid.height;
const C: number = grid.cell;
const features = JSON.parse(readFileSync(join(D.out, 'features.json'), 'utf8')) as { shore: { surface: string; outline: [number, number][] }[]; cliffs: [number, number][][] };
const osm = JSON.parse(readFileSync(join(D.raw, 'osm.json'), 'utf8')) as {
  nodes: Record<string, [number, number]>;
  ways: Record<string, { nodes: number[]; tags?: Record<string, string> }>;
  relations: Record<string, { members: { type: string; ref: number; role: string }[]; tags?: Record<string, string> }>;
};

const out = new Uint8Array(W * H);
const inBand = (k: number) => dist[k] <= T.band && heights[k] > T.below && heights[k] < T.above;

/** Each cell whose middle is inside the ring (scanlines), handed to `set`. */
function fill(ring: [number, number][], set: (k: number) => void): void {
  if (ring.length < 3) return;
  const zs = ring.map((p) => p[1]);
  const j0 = Math.max(0, Math.floor((Math.min(...zs) - grid.z0) / C));
  const j1 = Math.min(H - 1, Math.floor((Math.max(...zs) - grid.z0) / C));
  for (let j = j0; j <= j1; j++) {
    const z = grid.z0 + (j + 0.5) * C;
    const xs: number[] = [];
    for (let i = 0, k = ring.length - 1; i < ring.length; k = i++) {
      const [xa, za] = ring[i];
      const [xb, zb] = ring[k];
      if (za > z !== zb > z) xs.push(xa + ((z - za) * (xb - xa)) / (zb - za));
    }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xs[q] - grid.x0) / C - 0.5));
      const i1 = Math.min(W - 1, Math.floor((xs[q + 1] - grid.x0) / C - 0.5));
      for (let i = i0; i <= i1; i++) set(j * W + i);
    }
  }
}

// ── Steep ground in the band: rock (as the mesh draws it) ──
let ruled = 0;
for (let j = 1; j < H - 1; j++)
  for (let i = 1; i < W - 1; i++) {
    const k = j * W + i;
    if (!inBand(k) || heights[k] <= 0) continue;
    const gx = (heights[k + 1] - heights[k - 1]) / (2 * C);
    const gz = (heights[k + W] - heights[k - W]) / (2 * C);
    if (Math.hypot(gx, gz) > T.steep) {
      out[k] = SHORE.rock;
      ruled++;
    }
  }

// ── The map's own: beaches by surface, shingle, bare rock; then cliffs over them ──
const surfaceClass: Record<string, number> = { sand: SHORE.sand, beach: SHORE.sand, shingle: SHORE.shingle, pebbles: SHORE.shingle, gravel: SHORE.shingle, rock: SHORE.rock };
let mapped = 0;
for (const s of features.shore) {
  const cls = surfaceClass[s.surface] ?? SHORE.sand;
  fill(s.outline, (k) => {
    if (!inBand(k)) return;
    out[k] = cls | MAPPED;
    mapped++;
  });
}
let cliffCells = 0;
const reach = Math.ceil(T.cliffReach / C);
for (const line of features.cliffs)
  for (let n = 0; n + 1 < line.length; n++) {
    const [ax, az] = line[n];
    const [bx, bz] = line[n + 1];
    const len = Math.hypot(bx - ax, bz - az);
    for (let s = 0; s <= len; s += C / 2) {
      const x = ax + ((bx - ax) * s) / (len || 1);
      const z = az + ((bz - az) * s) / (len || 1);
      const ci = Math.floor((x - grid.x0) / C);
      const cj = Math.floor((z - grid.z0) / C);
      for (let dj = -reach; dj <= reach; dj++)
        for (let di = -reach; di <= reach; di++) {
          const i = ci + di;
          const j = cj + dj;
          if (i < 0 || j < 0 || i >= W || j >= H || Math.hypot(di, dj) * C > T.cliffReach) continue;
          const k = j * W + i;
          if (!inBand(k) || (out[k] & 7) === SHORE.cliff) continue;
          out[k] = SHORE.cliff | MAPPED;
          cliffCells++;
        }
    }
  }

// ── The shallow seabed off the shore: the nearest classed shore's class ──
let offshore = 0;
const R = Math.ceil(T.offshore / C);
const shoreOnly = out.slice();
for (let j = 0; j < H; j++)
  for (let i = 0; i < W; i++) {
    const k = j * W + i;
    if (!inBand(k) || heights[k] > 0 || shoreOnly[k]) continue;
    let best = 0;
    let bd = Infinity;
    for (let dj = -R; dj <= R; dj++)
      for (let di = -R; di <= R; di++) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
        const q = jj * W + ii;
        const d = di * di + dj * dj;
        if (heights[q] > 0 && shoreOnly[q] & 7 && d < bd && d * C * C <= T.offshore * T.offshore) [best, bd] = [shoreOnly[q], d];
      }
    if (best) {
      out[k] = best;
      offshore++;
    }
  }

// ── Mapped fields (any height: the mesh greens open grassland in them) ──
const pt = (n: number): [number, number] | null => {
  const ll = osm.nodes[n];
  return ll ? P.fwd(ll[0], ll[1]) : null;
};
const isField = (t?: Record<string, string>) => t?.landuse === 'farmland' || t?.landuse === 'meadow';
const ringsOf = (ways: number[][]) => {
  const open = ways.map((w) => [...w]);
  const rings: number[][] = [];
  while (open.length) {
    const ring = open.shift()!;
    for (let g = 0; ring[0] !== ring[ring.length - 1] && g < 1000; g++) {
      const end = ring[ring.length - 1];
      const i = open.findIndex((w) => w[0] === end || w[w.length - 1] === end);
      if (i < 0) break;
      const w = open.splice(i, 1)[0];
      ring.push(...(w[0] === end ? w.slice(1) : w.reverse().slice(1)));
    }
    rings.push(ring);
  }
  return rings;
};
let fieldCells = 0;
const fieldRings: number[][] = [];
for (const w of Object.values(osm.ways)) if (isField(w.tags) && w.nodes[0] === w.nodes[w.nodes.length - 1]) fieldRings.push(w.nodes);
for (const r of Object.values(osm.relations)) if (isField(r.tags)) fieldRings.push(...ringsOf(r.members.filter((m) => m.type === 'way' && m.role !== 'inner' && osm.ways[m.ref]).map((m) => osm.ways[m.ref].nodes)));
for (const ring of fieldRings) {
  const ps = ring.map(pt).filter((p): p is [number, number] => !!p);
  fill(ps, (k) => {
    if (heights[k] <= 0 || out[k] & FIELD) return;
    out[k] |= FIELD;
    fieldCells++;
  });
}

// ── Pack and write ──
const packed: number[] = [];
for (let k = 0; k < out.length; ) {
  const v = out[k];
  let n = 1;
  while (n < 255 && k + n < out.length && out[k + n] === v) n++;
  packed.push(n, v);
  k += n;
}
writeFileSync(join(D.out, 'shore.bin'), Buffer.from(Uint8Array.from(packed)));
const counts: Record<string, number> = { sand: 0, shingle: 0, rock: 0, cliff: 0 };
const names = ['none', 'sand', 'shingle', 'rock', 'cliff'];
for (const v of out) if (v & 7) counts[names[v & 7]]++;
const layout = { file: 'shore.bin', cell: C, x0: grid.x0, z0: grid.z0, width: W, height: H, kinds: names, counts, mappedCells: mapped + cliffCells, steepCells: ruled, offshoreCells: offshore, fieldCells };
writeFileSync(join(D.out, 'shore.json'), JSON.stringify(layout));
console.log(`shore: ${JSON.stringify(counts)} (cells: ${mapped} mapped areas, ${cliffCells} by cliff lines, ${ruled} steep, ${offshore} seabed off them; ${fieldCells} field cells); ${(packed.length / 1024).toFixed(0)} kB`);

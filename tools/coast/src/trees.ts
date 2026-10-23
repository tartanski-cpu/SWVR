/**
 * Stage 9, trees (the settlements brief, Part B1): where the woods are, as a map the game
 * scatters its trees from (world/forest.ts, world/view/treesView.ts).
 *
 * A grid over the region every `cell` m, one byte a cell: the kind of wood in the high four
 * bits (0 none, then themes.ts ForestStyle's kinds: 1 plantation, 2 broadleaf, 3 mixed,
 * 4 natural, 5 scrub, 6 orchard) and how thickly it's wooded in the low four (0-15).
 *   - OpenStreetMap's woods: landuse=forest, natural=wood (by leaf_type: needle-leaved is a
 *     plantation where landuse=forest, a mixed wood where natural=wood; broad-leaved,
 *     mixed; untagged as the theme says: in the West Highlands a forest is a plantation),
 *     natural=scrub, landuse=orchard. Closed ways and multipolygons (their outer ways joined
 *     into rings; holes left wooded).
 *   - Elsewhere, ESA WorldCover's tree cover is natural woodland (as thick as the share of
 *     tree-cover pixels in the cell), its shrubland sparse scrub.
 *   - Cleared: above the theme's treeline, on slopes steeper than `steep` (thinned from
 *     `thin`), at the water's edge (within `shore` m of the coast or below `minHeight` m),
 *     along roads and tracks, and round every building.
 * Run-length packed (pairs: count 1-255, value), since most of it is empty or one kind for
 * long runs: Oban's map is a few tens of kB.
 *
 * Writes public/regions/<id>/forest.bin and trees.json (the layout, the kinds' spacing and
 * species, their colours, and counts for the report). Run: node src/trees.ts [requestId]
 * (after reconcile, before mesh, which colours the ground under the woods from it; the
 * package stage puts it in the game's package).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dirs, loadRequest, projection } from './common.ts';
import { THEMES } from './themes.ts';

const T = {
  /** The map's cell (m). */
  cell: 20,
  /** No trees within this of the coast (m), nor on ground below this (m above MSL). */
  shore: 12,
  minHeight: 2,
  /** WorldCover shrubland as scrub this thick (0-15). */
  shrubDensity: 5,
  /** Roads and tracks that clear the woods (OpenStreetMap highway=*). */
  roads: ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'track', 'living_street', 'road'],
};

export const KINDS = ['plantation', 'broadleaf', 'mixed', 'natural', 'scrub', 'orchard'] as const;
const KIND_ID = Object.fromEntries(KINDS.map((k, i) => [k, i + 1])) as Record<(typeof KINDS)[number], number>;

const req = loadRequest(process.argv[2]);
const D = dirs(req.id);
const P = projection(req.bbox);
const theme = THEMES[req.theme];
const style = theme.forest;
const grid = JSON.parse(readFileSync(join(D.work, 'grid.json'), 'utf8'));
const rd = (name: string, Ctor: Float32ArrayConstructor | Uint8ArrayConstructor) => {
  const b = readFileSync(join(D.work, name));
  return new Ctor(b.buffer, b.byteOffset, b.byteLength / Ctor.BYTES_PER_ELEMENT);
};
const heights = rd('heights.bin', Float32Array) as Float32Array;
const cover = rd('cover.bin', Uint8Array) as Uint8Array;
const dist = rd('dist.bin', Float32Array) as Float32Array;
const osm = JSON.parse(readFileSync(join(D.raw, 'osm.json'), 'utf8')) as {
  nodes: Record<string, [number, number]>;
  ways: Record<string, { nodes: number[]; tags?: Record<string, string> }>;
  relations: Record<string, { members: { type: string; ref: number; role: string }[]; tags?: Record<string, string> }>;
};

// The forest map's grid: the region's box in `cell` m cells.
const C = T.cell;
const X0 = grid.x0;
const Z0 = grid.z0;
const W = Math.ceil((grid.width * grid.cell) / C);
const H = Math.ceil((grid.height * grid.cell) / C);
const kind = new Uint8Array(W * H);
const dens = new Uint8Array(W * H);

// ── OpenStreetMap's woods, rasterised ──
const pt = (n: number) => {
  const ll = osm.nodes[n];
  return ll ? P.fwd(ll[0], ll[1]) : null;
};
/** Join ways into closed rings (a multipolygon's outer edge is often several ways end to end). */
function rings(ways: number[][]): number[][] {
  const out: number[][] = [];
  const open = ways.filter((w) => w.length > 1).map((w) => [...w]);
  while (open.length) {
    const ring = open.shift()!;
    for (let guard = 0; ring[0] !== ring[ring.length - 1] && guard < 1000; guard++) {
      const end = ring[ring.length - 1];
      const i = open.findIndex((w) => w[0] === end || w[w.length - 1] === end);
      if (i < 0) break;
      const w = open.splice(i, 1)[0];
      ring.push(...(w[0] === end ? w.slice(1) : w.reverse().slice(1)));
    }
    if (ring[0] === ring[ring.length - 1] && ring.length >= 4) out.push(ring);
  }
  return out;
}
/** Fill a ring's cells (by their middles) with a kind and a density. Later areas overwrite earlier ones. */
function fill(nodes: number[], k: number, d: number): number {
  const p = nodes.map(pt).filter((q): q is [number, number] => !!q);
  if (p.length < 4) return 0;
  let n = 0;
  const zs = p.map((q) => q[1]);
  const j0 = Math.max(0, Math.floor((Math.min(...zs) - Z0) / C));
  const j1 = Math.min(H - 1, Math.floor((Math.max(...zs) - Z0) / C));
  for (let j = j0; j <= j1; j++) {
    const z = Z0 + (j + 0.5) * C;
    const xs: number[] = [];
    for (let i = 0, k2 = p.length - 1; i < p.length; k2 = i++) {
      const [xa, za] = p[i];
      const [xb, zb] = p[k2];
      if (za > z !== zb > z) xs.push(xa + ((z - za) * (xb - xa)) / (zb - za));
    }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xs[q] - X0) / C - 0.5));
      const i1 = Math.min(W - 1, Math.floor((xs[q + 1] - X0) / C - 0.5));
      for (let i = i0; i <= i1; i++) {
        kind[j * W + i] = k;
        dens[j * W + i] = d;
        n++;
      }
    }
  }
  return n;
}
/** A wood's kind from its tags (null: not a wood). */
function woodKind(t: Record<string, string>): number | null {
  const leaf = t.leaf_type;
  if (t.landuse === 'orchard') return KIND_ID.orchard;
  if (t.natural === 'scrub') return KIND_ID.scrub;
  if (t.landuse === 'forest') return leaf === 'needleleaved' ? KIND_ID.plantation : leaf === 'broadleaved' ? KIND_ID.broadleaf : leaf === 'mixed' ? KIND_ID.mixed : KIND_ID[style.forestIs];
  if (t.natural === 'wood') return leaf === 'broadleaved' ? KIND_ID.broadleaf : leaf === 'needleleaved' || leaf === 'mixed' ? KIND_ID.mixed : KIND_ID[style.woodIs];
  return null;
}
// WorldCover first (the background), then the mapped woods over it (scrub first, so a wood
// drawn over scrub wins), so the map's own woods decide where they are.
for (let j = 0; j < H; j++)
  for (let i = 0; i < W; i++) {
    let trees = 0;
    let shrub = 0;
    let n = 0;
    for (let dj = 0; dj < C / grid.cell; dj++)
      for (let di = 0; di < C / grid.cell; di++) {
        const gi = i * (C / grid.cell) + di;
        const gj = j * (C / grid.cell) + dj;
        if (gi >= grid.width || gj >= grid.height) continue;
        const c = cover[gj * grid.width + gi];
        n++;
        if (c === 10) trees++;
        else if (c === 20) shrub++;
      }
    if (!n) continue;
    if (trees / n >= 0.25) {
      kind[j * W + i] = KIND_ID.natural;
      dens[j * W + i] = Math.round((15 * trees) / n);
    } else if (shrub / n >= 0.5) {
      kind[j * W + i] = KIND_ID.scrub;
      dens[j * W + i] = T.shrubDensity;
    }
  }
const mapped: Record<string, number> = {};
const areas: { nodes: number[]; k: number }[] = [];
for (const w of Object.values(osm.ways)) {
  const k = w.tags && woodKind(w.tags);
  if (k && w.nodes[0] === w.nodes[w.nodes.length - 1]) areas.push({ nodes: w.nodes, k });
}
for (const r of Object.values(osm.relations ?? {})) {
  const k = r.tags && woodKind(r.tags);
  if (!k) continue;
  for (const ring of rings(r.members.filter((m) => m.type === 'way' && m.role !== 'inner' && osm.ways[m.ref]).map((m) => osm.ways[m.ref].nodes))) areas.push({ nodes: ring, k });
}
areas.sort((a, b) => (a.k === KIND_ID.scrub ? 0 : 1) - (b.k === KIND_ID.scrub ? 0 : 1));
for (const a of areas) {
  const n = fill(a.nodes, a.k, a.k === KIND_ID.scrub ? 11 : 15);
  mapped[KINDS[a.k - 1]] = (mapped[KINDS[a.k - 1]] ?? 0) + n;
}

// ── Cleared: high ground, steep ground, the water's edge, roads, buildings ──
const hAt = (x: number, z: number) => {
  const i = Math.max(0, Math.min(grid.width - 1, Math.floor((x - grid.x0) / grid.cell)));
  const j = Math.max(0, Math.min(grid.height - 1, Math.floor((z - grid.z0) / grid.cell)));
  return heights[j * grid.width + i];
};
const distAt = (x: number, z: number) => {
  const i = Math.max(0, Math.min(grid.width - 1, Math.floor((x - grid.x0) / grid.cell)));
  const j = Math.max(0, Math.min(grid.height - 1, Math.floor((z - grid.z0) / grid.cell)));
  return dist[j * grid.width + i];
};
let cleared = 0;
for (let j = 0; j < H; j++)
  for (let i = 0; i < W; i++) {
    const k = j * W + i;
    if (!kind[k]) continue;
    const x = X0 + (i + 0.5) * C;
    const z = Z0 + (j + 0.5) * C;
    const h = hAt(x, z);
    const slope = Math.hypot(hAt(x + C / 2, z) - hAt(x - C / 2, z), hAt(x, z + C / 2) - hAt(x, z - C / 2)) / C;
    if (h > style.treeline || h < T.minHeight || distAt(x, z) < T.shore || slope > style.steep) {
      kind[k] = 0;
      dens[k] = 0;
      cleared++;
    } else if (slope > style.thin) dens[k] = Math.round(dens[k] * (1 - (slope - style.thin) / (style.steep - style.thin)));
    // Thin out at the treeline's last 60 m.
    if (kind[k] && h > style.treeline - 60) dens[k] = Math.round(dens[k] * ((style.treeline - h) / 60));
  }
const clearAt = (x: number, z: number) => {
  const i = Math.floor((x - X0) / C);
  const j = Math.floor((z - Z0) / C);
  if (i < 0 || j < 0 || i >= W || j >= H) return;
  if (kind[j * W + i]) cleared++;
  kind[j * W + i] = 0;
  dens[j * W + i] = 0;
};
for (const w of Object.values(osm.ways)) {
  const t = w.tags ?? {};
  const road = t.highway && T.roads.includes(t.highway);
  const building = t.building && t.building !== 'no';
  if (!road && !building) continue;
  const p = w.nodes.map(pt).filter((q): q is [number, number] => !!q);
  if (building) {
    // The building and a garden's width round it.
    const xs = p.map((q) => q[0]);
    const zs = p.map((q) => q[1]);
    for (let x = Math.min(...xs) - 4; x <= Math.max(...xs) + 4; x += C / 2) for (let z = Math.min(...zs) - 4; z <= Math.max(...zs) + 4; z += C / 2) clearAt(x, z);
    continue;
  }
  // A road: every cell it passes through.
  for (let s = 0; s + 1 < p.length; s++) {
    const [xa, za] = p[s];
    const [xb, zb] = p[s + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(xb - xa, zb - za) / (C / 3)));
    for (let q = 0; q <= n; q++) clearAt(xa + ((xb - xa) * q) / n, za + ((zb - za) * q) / n);
  }
}

// ── Write ──
const bytes = new Uint8Array(W * H);
const byKind: Record<string, number> = {};
for (let k = 0; k < W * H; k++) {
  bytes[k] = (kind[k] << 4) | Math.min(15, dens[k]);
  if (kind[k] && dens[k]) byKind[KINDS[kind[k] - 1]] = (byKind[KINDS[kind[k] - 1]] ?? 0) + 1;
}
const rle: number[] = [];
for (let k = 0; k < bytes.length; ) {
  let n = 1;
  while (n < 255 && k + n < bytes.length && bytes[k + n] === bytes[k]) n++;
  rle.push(n, bytes[k]);
  k += n;
}
writeFileSync(join(D.out, 'forest.bin'), Buffer.from(rle));
const layout = {
  file: 'forest.bin',
  cell: C,
  x0: X0,
  z0: Z0,
  width: W,
  height: H,
  kinds: KINDS,
  styles: style.kinds,
  colours: style.colours,
};
writeFileSync(join(D.out, 'trees.json'), JSON.stringify(layout));
const km2 = (n: number) => Math.round((n * C * C) / 1e4) / 100;
const reportPath = join(D.out, 'report.json');
const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : {};
report.trees = { woodedKm2: Object.fromEntries(Object.entries(byKind).map(([k, n]) => [k, km2(n)])), mappedKm2: Object.fromEntries(Object.entries(mapped).map(([k, n]) => [k, km2(n)])), clearedCells: cleared, bytes: rle.length };
writeFileSync(reportPath, JSON.stringify(report, null, 1));
console.log(`trees: ${W} x ${H} cells of ${C} m; wooded ${Object.entries(byKind).map(([k, n]) => `${k} ${km2(n)} km²`).join(', ')}; ${areas.length} mapped woods; ${(rle.length / 1000).toFixed(0)} kB`);

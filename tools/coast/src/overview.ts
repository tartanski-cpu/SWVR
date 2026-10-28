/**
 * The overview of every Voyage map, for the front page's map picker (src/world/coastMapPicker.ts;
 * owner, Oct 2026: "an interactive map there so you can look around the map and choose an
 * area"): one small file, public/regions/overview.json, with
 *   - Europe's land and borders, from Natural Earth's 1:50 million set (public domain), cut to
 *     the part of the world the maps are in and thinned, for the view zoomed out;
 *   - for each map: its name, blurb and start berth (read from src/world/maps.ts, so the two
 *     can't drift: tests/coastOverview.test.ts checks them), its box in lon/lat, its coastline
 *     (the land of the reconciled 10 m grid, data/work/<id>/land.bin, coarsened and traced
 *     round, then thinned), and its ports, each with the berth a voyage there starts at.
 *
 *   node src/overview.ts            # every map in maps.ts (each needs its data/work/<id>/)
 *
 * Coordinates are lon/lat, rounded to about 10 m (4 decimals) for the coasts and 1 km for
 * Europe. The picker draws them in Mercator.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, projection } from './common.ts';

/** Cells across a map's coarsened land grid, at most (its longer side). */
const COAST_CELLS = 700;
/** Douglas-Peucker tolerance for a map's coastline, in coarse cells. */
const COAST_TOLERANCE = 0.8;
/** Islands (and lakes) smaller than this, in coarse cells, left out: a skerry is a speck at this scale. */
const MIN_ISLAND = 3;
/** The part of the world the picker shows zoomed out (lon/lat min, max) and Europe's tolerance (deg). */
const WORLD_BOX: [number, number, number, number] = [-14, 33, 36, 68];
const WORLD_TOLERANCE = 0.03;
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';

type Pt = [number, number];

/** The maps as maps.ts lists them: id, name, blurb, start berth (in its order). */
function mapsFromSource(): { id: string; name: string; blurb: string; startBerth?: string }[] {
  const src = readFileSync(join(ROOT, '..', '..', 'src', 'world', 'maps.ts'), 'utf8');
  const out: { id: string; name: string; blurb: string; startBerth?: string }[] = [];
  for (const line of src.split('\n')) {
    const m = /^\s*\{ id: '([^']+)', name: '((?:[^'\\]|\\.)*)', blurb: '((?:[^'\\]|\\.)*)'/.exec(line);
    if (!m) continue;
    const start = /startBerth: '([^']+)'/.exec(line);
    const un = (s: string) => s.replace(/\\'/g, "'");
    out.push({ id: m[1], name: un(m[2]), blurb: un(m[3]), ...(start ? { startBerth: start[1] } : {}) });
  }
  return out;
}

/** A map's game package: on the server for a fetched map, else built into the game. */
function packageOf(id: string): { bbox: [number, number, number, number]; ports: { id: string; name: string; kind: string; x: number; z: number }[]; berths: { id: string; portId: string }[] } {
  const remote = join(ROOT, '..', '..', 'public', 'regions', id, 'package.json');
  const local = join(ROOT, '..', '..', 'src', 'world', 'regions', `${id}.coast.json`);
  return JSON.parse(readFileSync(existsSync(remote) ? remote : local, 'utf8'));
}

/** A ring's area (shoelace; its sign says which way round it runs). */
function ringArea(r: Pt[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return a / 2;
}

/** Douglas-Peucker: the points of `pts` that keep it within `tol` of itself. */
function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, az] = pts[a];
    const [bx, bz] = pts[b];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1e-12;
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - az) * dz) / len2));
      const ex = ax + t * dx - pts[i][0];
      const ez = az + t * dz - pts[i][1];
      const d = ex * ex + ez * ez;
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > t2) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Trace round the land of a 0/1 grid (marching squares, cell corners at the cell middles), the
 * grid ringed by sea so every outline closes: rings in grid units (x across, z down).
 */
function traceLand(land: Uint8Array, nx: number, nz: number): Pt[][] {
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= nz ? 0 : land[j * nx + i]);
  // Each segment from one edge midpoint to another, keyed by its start; land kept on the left.
  const next = new Map<string, string>();
  const pos = new Map<string, Pt>();
  const key = (x: number, z: number) => `${x * 2},${z * 2}`;
  const seg = (x0: number, z0: number, x1: number, z1: number) => {
    const a = key(x0, z0);
    const b = key(x1, z1);
    next.set(a, b);
    pos.set(a, [x0, z0]);
    pos.set(b, [x1, z1]);
  };
  for (let j = -1; j < nz; j++) {
    for (let i = -1; i < nx; i++) {
      // Corners: tl (i,j), tr (i+1,j), br (i+1,j+1), bl (i,j+1).
      const tl = at(i, j);
      const tr = at(i + 1, j);
      const br = at(i + 1, j + 1);
      const bl = at(i, j + 1);
      const c = tl * 8 + tr * 4 + br * 2 + bl;
      if (c === 0 || c === 15) continue;
      const x = i + 0.5;
      const z = j + 0.5;
      const T: Pt = [x + 0.5, z];
      const R: Pt = [x + 1, z + 0.5];
      const B: Pt = [x + 0.5, z + 1];
      const L: Pt = [x, z + 0.5];
      const s = (p: Pt, q: Pt) => seg(p[0], p[1], q[0], q[1]);
      switch (c) {
        case 1: s(L, B); break;
        case 2: s(B, R); break;
        case 3: s(L, R); break;
        case 4: s(R, T); break;
        case 5: s(L, T); s(R, B); break;
        case 6: s(B, T); break;
        case 7: s(L, T); break;
        case 8: s(T, L); break;
        case 9: s(T, B); break;
        case 10: s(T, R); s(B, L); break;
        case 11: s(T, R); break;
        case 12: s(R, L); break;
        case 13: s(R, B); break;
        case 14: s(B, L); break;
      }
    }
  }
  const rings: Pt[][] = [];
  const seen = new Set<string>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const ring: Pt[] = [];
    let k: string | undefined = start;
    while (k && !seen.has(k)) {
      seen.add(k);
      ring.push(pos.get(k)!);
      k = next.get(k);
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

/** A map's coastline in lon/lat: its land grid coarsened to at most COAST_CELLS across, traced and thinned. */
function coastOf(id: string, bbox: [number, number, number, number]): Pt[][] {
  const work = join(ROOT, 'data', 'work', id);
  const g = JSON.parse(readFileSync(join(work, 'grid.json'), 'utf8')) as { cell: number; width: number; height: number; x0: number; z0: number };
  const land = new Uint8Array(readFileSync(join(work, 'land.bin')));
  const f = Math.max(1, Math.ceil(Math.max(g.width, g.height) / COAST_CELLS));
  const nx = Math.ceil(g.width / f);
  const nz = Math.ceil(g.height / f);
  const coarse = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      let n = 0;
      let l = 0;
      for (let jj = j * f; jj < Math.min(g.height, (j + 1) * f); jj++) {
        for (let ii = i * f; ii < Math.min(g.width, (i + 1) * f); ii++) {
          n++;
          if (land[jj * g.width + ii]) l++;
        }
      }
      coarse[j * nx + i] = l * 2 >= n ? 1 : 0;
    }
  }
  const proj = projection(bbox);
  const cell = g.cell * f;
  const rings = traceLand(coarse, nx, nz)
    .map((r) => simplify([...r, r[0]], COAST_TOLERANCE).slice(0, -1))
    .filter((r) => r.length >= 3 && Math.abs(ringArea(r)) >= MIN_ISLAND);
  return rings.map((r) =>
    r.map(([i, j]) => {
      const [lon, lat] = proj.inv(g.x0 + i * cell, g.z0 + j * cell);
      return [Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4] as Pt;
    }),
  );
}

async function naturalEarth(name: string): Promise<{ features: { geometry: { type: string; coordinates: unknown } }[] }> {
  const dir = join(ROOT, 'data', 'raw', 'world');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.geojson`);
  if (!existsSync(file)) {
    const res = await fetch(`${NE}${name}.geojson`);
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    writeFileSync(file, await res.text());
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Lines and rings with any point in the world box, thinned and rounded to 0.01 deg. */
function cutWorld(lines: Pt[][]): Pt[][] {
  const [a, b, c, d] = WORLD_BOX;
  const out: Pt[][] = [];
  for (const l of lines) {
    if (!l.some(([x, y]) => x >= a && x <= c && y >= b && y <= d)) continue;
    const s = simplify(l, WORLD_TOLERANCE).map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100] as Pt);
    if (s.length >= 2) out.push(s);
  }
  return out;
}

async function main(): Promise<void> {
  const land = await naturalEarth('ne_50m_land');
  const borders = await naturalEarth('ne_50m_admin_0_boundary_lines_land');
  const ringsOf = (geo: { type: string; coordinates: unknown }): Pt[][] =>
    geo.type === 'Polygon' ? (geo.coordinates as Pt[][]) : geo.type === 'MultiPolygon' ? (geo.coordinates as Pt[][][]).flat() : geo.type === 'LineString' ? [geo.coordinates as Pt[]] : geo.type === 'MultiLineString' ? (geo.coordinates as Pt[][]) : [];
  const world = {
    box: WORLD_BOX,
    land: cutWorld(land.features.flatMap((f) => ringsOf(f.geometry))).filter((r) => r.length >= 4),
    borders: cutWorld(borders.features.flatMap((f) => ringsOf(f.geometry))),
  };
  const maps = [];
  for (const m of mapsFromSource()) {
    const pkg = packageOf(m.id);
    const proj = projection(pkg.bbox);
    const ll = (x: number, z: number) => proj.inv(x, z).map((v) => Math.round(v * 1e4) / 1e4) as Pt;
    const ports = pkg.ports.map((p) => {
      const berth = pkg.berths.find((b) => b.id === `${p.id}-cargo`) ?? pkg.berths.find((b) => b.portId === p.id);
      return { name: p.name, kind: p.kind, at: ll(p.x, p.z), ...(berth ? { berth: berth.id } : {}) };
    });
    const coast = coastOf(m.id, pkg.bbox);
    maps.push({ ...m, bbox: pkg.bbox, ports, coast });
    console.log(`${m.id}: ${coast.length} rings, ${coast.reduce((n, r) => n + r.length, 0)} points, ${ports.length} ports`);
  }
  const out = join(ROOT, '..', '..', 'public', 'regions', 'overview.json');
  const text = JSON.stringify({ format: 1, credits: 'Europe: Natural Earth. Coasts: OpenStreetMap contributors (ODbL), Copernicus.', world, maps });
  writeFileSync(out, text);
  console.log(`overview.json: ${(text.length / 1024).toFixed(0)} KB (Europe ${world.land.length} rings, ${world.borders.length} borders)`);
}
void main();

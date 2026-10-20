/**
 * Stages 7 and 8, harbours and buildings: OpenStreetMap's piers, pontoons, quays, breakwaters,
 * slipways and marinas as the game's harbour kit, the harbours that play the region's spine
 * roles, and the buildings near them as simple blocks.
 *
 *   Kit        Each piece is one of the game's own (world/defs.ts): a pier or quay is a solid
 *              block (BlockDef: an oriented box with a deck height), a slipway a SlipwayDef,
 *              a berth a BerthDef. A pier mapped as a line becomes a box per straight run
 *              (tagged width, else `pierWidth`); as an area, the smallest box round it. A
 *              floating pier (floating=yes) is a pontoon: narrow, its deck just above the
 *              water; so is an untagged pier inside a marina's outline. A quay
 *              (man_made=quay, mostly a stretch of coastline) is a wall: boxes standing on
 *              the line and reaching `quayDepth` inland, so their seaward face is
 *              the real quay face. Breakwaters are wide, high boxes. Bollards, cleats and
 *              fenders come with the berths when drawn.
 *   Basins     The water within `basinReach` m of each pier, quay and pontoon is dredged to
 *              working depth (`berthDepth`, pontoons `pontoonDepth`, plus half a metre):
 *              real harbours are, but the pipeline's procedural shelf would leave a metre of
 *              water at the wall. The basins go to the mesh stage (data/work/<id>/dredge.json),
 *              so run this stage before it. At a quay the ground from 2 m out to 4 m in
 *              goes down too, so the quay face is a wall (the quay block hides the cut).
 *   Berths     Along every long face of a pier, pontoon or quay that looks onto open water
 *              (that depth `pocketReach` m off it, no land between), one every `berthSpacing` m.
 *   Harbours   Kit pieces within `clusterGap` m of each other make one harbour, named after
 *              its marina, ferry terminal or named pier, else the nearest place. Its kind:
 *              harbour (quays, a marina, or a big pier), else pier.
 *   Spine      The request's spine roles (harbour.sheltered, pier.exposed, anchorage), by a
 *              harbour's name or "auto": the sheltered harbour is the one with the least
 *              fetch (open water it can see across, averaged round the compass); the exposed
 *              pier the most; the anchorage is chosen in the sea: 4 to 15 m of water, the
 *              least fetch, clear of the harbours and the marks.
 *   Buildings  Within `buildingReach` m of a harbour, each OpenStreetMap footprint as the
 *              smallest box round it (the game's BuildingDef: a block with a pitched roof),
 *              its height from height or building:levels tags, else by kind; walls and roof
 *              coloured from the theme; standing on the lowest ground under it.
 *   Hand edits requests/<id>.edits.yaml, applied last, so re-running keeps them: remove
 *              pieces by OSM id, change any field of a piece or harbour, add pieces.
 *
 * Writes public/regions/<id>/harbours.json and points region.json at it; the counts and
 * warnings go into report.json. Run: node src/harbours.ts [requestId] (after reconcile and nav, before mesh).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { ROOT, dirs, loadRequest, projection } from './common.ts';
import { THEMES } from './themes.ts';

const T = {
  /** Deck heights above mean sea level (m): fixed piers and quays stand clear of high water; a pontoon floats. */
  pierTop: 2.4,
  quayTop: 2.6,
  pontoonTop: 0.5,
  breakwaterTop: 3.5,
  /** Widths when untagged (m). */
  pierWidth: 6,
  pontoonWidth: 2.5,
  breakwaterWidth: 10,
  /** A quay wall's boxes reach this far inland from the quay face (m). */
  quayDepth: 10,
  /** Runs of a line within this of straight make one box (m off the chord). */
  straightTol: 1.5,
  /** Berths: water at least this deep beside the face (m), one every so many metres, the boat's half-beam off the face. */
  berthDepth: 2,
  berthSpacing: 16,
  berthOff: 2.2,
  /** Pontoons float in shallower water (m). */
  pontoonDepth: 1.5,
  /** A berth needs open water this far off its face (m); the basin is dredged this far round each piece (m). */
  pocketReach: 14,
  basinReach: 30,
  /** Pieces this close together are one harbour (m). */
  clusterGap: 250,
  /** Buildings this close to a harbour piece are built (m); smaller footprints are skipped (m²). */
  buildingReach: 400,
  minFootprint: 15,
  /** Fetch: bearings tried, the farthest counted (m; the box's edge counts as open sea). */
  fetchRays: 36,
  fetchMax: 20000,
  /** The anchorage: depth range (m), clear of harbours and marks by (m). */
  anchorDepth: [4, 15] as [number, number],
  anchorClear: 250,
};

const req = loadRequest(process.argv[2]);
const D = dirs(req.id);
const P = projection(req.bbox);
const theme = THEMES[req.theme];
const osm = JSON.parse(readFileSync(join(D.raw, 'osm.json'), 'utf8')) as {
  nodes: Record<string, [number, number]>;
  nodeTags: Record<string, Record<string, string>>;
  ways: Record<string, { nodes: number[]; tags: Record<string, string> }>;
};
const grid = JSON.parse(readFileSync(join(D.work, 'grid.json'), 'utf8'));
const rd = (name: string, Ctor: Float32ArrayConstructor | Uint8ArrayConstructor) => {
  const b = readFileSync(join(D.work, name));
  return new Ctor(b.buffer, b.byteOffset, b.byteLength / Ctor.BYTES_PER_ELEMENT);
};
const heights = rd('heights.bin', Float32Array) as Float32Array;
const land = rd('land.bin', Uint8Array) as Uint8Array;
const nav = existsSync(join(D.out, 'nav.json')) ? JSON.parse(readFileSync(join(D.out, 'nav.json'), 'utf8')) : { marks: [] };

const cellOf = (x: number, z: number) => {
  const i = Math.floor((x - grid.x0) / grid.cell);
  const j = Math.floor((z - grid.z0) / grid.cell);
  return i < 0 || j < 0 || i >= grid.width || j >= grid.height ? -1 : j * grid.width + i;
};
const hAt = (x: number, z: number) => {
  const k = cellOf(x, z);
  return k < 0 ? -50 : heights[k];
};
const isLand = (x: number, z: number) => {
  const k = cellOf(x, z);
  return k >= 0 && land[k] === 1;
};
const inBox = (x: number, z: number) => x >= P.x0 && x <= P.x1 && z >= P.z0 && z <= P.z1;
const r1 = (v: number) => Math.round(v * 10) / 10;
const bearing = (dx: number, dz: number) => (((Math.atan2(dx, -dz) * 180) / Math.PI) % 360 + 360) % 360;
const pts = (w: { nodes: number[] }) => w.nodes.map((n) => osm.nodes[n]).filter(Boolean).map(([lon, lat]) => P.fwd(lon, lat));

export interface Block {
  source: string;
  kind: 'quay' | 'pier' | 'pontoon' | 'breakwater';
  x: number;
  z: number;
  halfLength: number;
  halfWidth: number;
  /** Compass bearing of the long axis (as the game's BlockDef). */
  yawDeg: number;
  top: number;
  fendered: boolean;
  name?: string;
}

/** The smallest box round some points (rotating calipers over the hull's edges). */
function minBox(p: [number, number][]): { x: number; z: number; halfLength: number; halfWidth: number; yawDeg: number; area: number } {
  // Convex hull (monotone chain).
  const s = [...p].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [];
  for (const q of s) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: [number, number][] = [];
  for (const q of [...s].reverse()) {
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  const hull = [...lo.slice(0, -1), ...up.slice(0, -1)];
  let best = { x: 0, z: 0, halfLength: 0, halfWidth: 0, yawDeg: 0, area: Infinity };
  for (let i = 0; i < hull.length; i++) {
    const [ax, az] = hull[i];
    const [bx, bz] = hull[(i + 1) % hull.length];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-6) continue;
    const ux = (bx - ax) / L;
    const uz = (bz - az) / L;
    let a0 = Infinity, a1 = -Infinity, c0 = Infinity, c1 = -Infinity; // prettier-ignore
    for (const [x, z] of hull) {
      const a = x * ux + z * uz;
      const c = -x * uz + z * ux;
      a0 = Math.min(a0, a), a1 = Math.max(a1, a), c0 = Math.min(c0, c), c1 = Math.max(c1, c); // prettier-ignore
    }
    const area = (a1 - a0) * (c1 - c0);
    if (area < best.area) {
      const am = (a0 + a1) / 2;
      const cm = (c0 + c1) / 2;
      // Long axis along the box's longer side.
      const along = a1 - a0 >= c1 - c0;
      const [lx, lz] = along ? [ux, uz] : [-uz, ux];
      best = { x: am * ux - cm * uz, z: am * uz + cm * ux, halfLength: Math.max(a1 - a0, c1 - c0) / 2, halfWidth: Math.min(a1 - a0, c1 - c0) / 2, yawDeg: bearing(lx, lz) % 180, area };
    }
  }
  return best;
}

/** A line as its straight runs (Douglas-Peucker to `tol`). */
function runs(p: [number, number][], tol: number): [number, number][][] {
  const keep = new Uint8Array(p.length);
  keep[0] = keep[p.length - 1] = 1;
  const stack: [number, number][] = [[0, p.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const L = Math.hypot(p[b][0] - p[a][0], p[b][1] - p[a][1]) || 1;
    let m = -1, mi = -1; // prettier-ignore
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((p[b][0] - p[a][0]) * (p[a][1] - p[i][1]) - (p[a][0] - p[i][0]) * (p[b][1] - p[a][1])) / L;
      if (d > m) (m = d), (mi = i);
    }
    if (m > tol) (keep[mi] = 1), stack.push([a, mi], [mi, b]);
  }
  const k = p.filter((_, i) => keep[i]);
  const out: [number, number][][] = [];
  for (let i = 0; i + 1 < k.length; i++) out.push([k[i], k[i + 1]]);
  return out;
}

/** A box along a straight run, `side` 0 centred on it, +1 / -1 standing to its left / right. */
function runBox(a: [number, number], b: [number, number], width: number, side: number, extra: number): Omit<Block, 'source' | 'kind' | 'top' | 'fendered'> {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / L;
  const uz = (b[1] - a[1]) / L;
  // Left of travel in the game's axes (x east, z south), as seen on a north-up map.
  const lx = uz;
  const lz = -ux;
  const off = (side * width) / 2;
  return { x: (a[0] + b[0]) / 2 + lx * off, z: (a[1] + b[1]) / 2 + lz * off, halfLength: L / 2 + extra, halfWidth: width / 2, yawDeg: bearing(ux, uz) % 180 };
}

/** Is (x, z) inside a polygon (even-odd rule)? */
function inPoly(poly: [number, number][], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// Marinas' outlines first: a pier inside one, not tagged floating=no, is taken as a pontoon
// (marina berths almost always are, and OpenStreetMap often leaves floating untagged).
const marinas = Object.values(osm.ways)
  .filter((w) => w.tags?.leisure === 'marina' && w.nodes[0] === w.nodes[w.nodes.length - 1])
  .map((w) => pts(w));

// ── The kit ──
const blocks: Block[] = [];
const slipways: { source: string; name: string; x: number; z: number; headingDeg: number; width: number; length: number; top: number; slope: number }[] = [];
const areas: { source: string; kind: string; name: string; x: number; z: number }[] = [];
const walls: { x: number; z: number; halfLength: number; halfWidth: number; yawDeg: number; depth: number; wall: true }[] = [];
const warnings: string[] = [];
for (const [id, w] of Object.entries(osm.ways)) {
  const t = w.tags ?? {};
  const p = pts(w);
  if (p.length < 2) continue;
  const c = p.reduce(([sx, sz], [x, z]) => [sx + x / p.length, sz + z / p.length], [0, 0]);
  if (!inBox(c[0], c[1])) continue;
  const source = `way/${id}`;
  const closed = w.nodes[0] === w.nodes[w.nodes.length - 1] && p.length > 3;
  const name = t.name ?? '';
  const width = Number.parseFloat(t.width ?? '') || 0;
  if (t.leisure === 'marina' || t.amenity === 'ferry_terminal' || t.landuse === 'harbour' || t['seamark:type'] === 'harbour') {
    areas.push({ source, kind: t.leisure === 'marina' ? 'marina' : t.amenity === 'ferry_terminal' ? 'ferry terminal' : 'harbour', name, x: c[0], z: c[1] });
    continue;
  }
  const floating = t.floating === 'yes' || (t.floating !== 'no' && t.man_made === 'pier' && marinas.some((m) => inPoly(m, c[0], c[1])));
  if (t.man_made === 'pier' || t.man_made === 'breakwater' || t.man_made === 'groyne') {
    const kind: Block['kind'] = t.man_made !== 'pier' ? 'breakwater' : floating ? 'pontoon' : 'pier';
    const top = kind === 'pontoon' ? T.pontoonTop : kind === 'breakwater' ? T.breakwaterTop : T.pierTop;
    if (closed && t.area !== 'no') {
      const b = minBox(p);
      blocks.push({ source, kind, x: b.x, z: b.z, halfLength: b.halfLength, halfWidth: Math.max(1, b.halfWidth), yawDeg: b.yawDeg, top, fendered: kind !== 'breakwater', ...(name ? { name } : {}) });
    } else {
      const wd = width || (kind === 'pontoon' ? T.pontoonWidth : kind === 'breakwater' ? T.breakwaterWidth : T.pierWidth);
      for (const [a, b] of runs(p, T.straightTol)) {
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) continue;
        blocks.push({ source, kind, ...runBox(a, b, wd, 0, wd / 2), top, fendered: kind !== 'breakwater', ...(name ? { name } : {}) });
      }
    }
    continue;
  }
  if (t.man_made === 'quay') {
    // The wall stands on the line, reaching inland: find which side is land from a probe.
    for (const [a, b] of runs(p, T.straightTol)) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 2) continue;
      const mx = (a[0] + b[0]) / 2;
      const mz = (a[1] + b[1]) / 2;
      const lx = (b[1] - a[1]) / L;
      const lz = -(b[0] - a[0]) / L;
      const side = isLand(mx + lx * 8, mz + lz * 8) ? 1 : isLand(mx - lx * 8, mz - lz * 8) ? -1 : 0;
      if (!side) continue;
      // The wall: the ground from 2 m out to 4 m in drops to working depth, so the quay
      // face stands straight up out of the water instead of a beach sloping up to it.
      const ix = lx * side;
      const iz = lz * side;
      walls.push({ x: r1(mx + ix), z: r1(mz + iz), halfLength: r1(L / 2), halfWidth: 3, yawDeg: bearing(b[0] - a[0], b[1] - a[1]) % 180, depth: T.berthDepth + 0.5, wall: true });
      blocks.push({ source, kind: 'quay', ...runBox(a, b, T.quayDepth, side, 0), top: T.quayTop, fendered: false, ...(name ? { name } : {}) });
    }
    continue;
  }
  if (t.leisure === 'slipway') {
    // Up the slip: from its lower end (the deeper one) to its upper.
    let [a, b] = [p[0], p[p.length - 1]];
    if (hAt(a[0], a[1]) > hAt(b[0], b[1])) [a, b] = [b, a];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 4) continue;
    const top = Math.max(1, hAt(b[0], b[1]));
    slipways.push({ source, name, x: r1((a[0] + b[0]) / 2), z: r1((a[1] + b[1]) / 2), headingDeg: Math.round(bearing(b[0] - a[0], b[1] - a[1])), width: width || 4, length: r1(L), top: r1(top), slope: r1((top - Math.min(0, hAt(a[0], a[1]))) / L) });
  }
}

// ── The harbour basins: dredged round the pieces ──
// Water within `basinReach` m of a pier, quay or pontoon is at least deep enough to work in
// (a working harbour is dredged; the pipeline's procedural shelf would make it a beach).
// Applied here, in memory, so the berths below see it, and written for the mesh stage.
const dredge: { x: number; z: number; halfLength: number; halfWidth: number; yawDeg: number; depth: number }[] = [];
for (const b of blocks) {
  if (b.kind === 'breakwater') continue;
  dredge.push({ x: r1(b.x), z: r1(b.z), halfLength: r1(b.halfLength + T.basinReach), halfWidth: r1(b.halfWidth + T.basinReach), yawDeg: b.yawDeg, depth: (b.kind === 'pontoon' ? T.pontoonDepth : T.berthDepth) + 0.5 });
}
function applyDredge(p: (typeof dredge)[number], wall: boolean): void {
  const a = (p.yawDeg * Math.PI) / 180;
  const ux = Math.sin(a);
  const uz = -Math.cos(a);
  const r = Math.hypot(p.halfLength, p.halfWidth);
  for (let z = p.z - r; z <= p.z + r; z += grid.cell)
    for (let x = p.x - r; x <= p.x + r; x += grid.cell) {
      const dx = x - p.x;
      const dz = z - p.z;
      if (Math.abs(dx * ux + dz * uz) > p.halfLength || Math.abs(-dx * uz + dz * ux) > p.halfWidth) continue;
      const k = cellOf(x, z);
      if (k >= 0 && (wall || !land[k]) && heights[k] > -p.depth) heights[k] = -p.depth;
    }
}
dredge.forEach((p) => applyDredge(p, false));
walls.forEach((p) => applyDredge(p, true));

// ── Berths along the long faces with water beside them ──
const berths: { id: string; source: string; x: number; z: number; headingDeg: number; shoreX: number; shoreZ: number; shoreDist: number; deckY: number }[] = [];
for (const b of blocks) {
  if (b.kind === 'breakwater') continue;
  const a = (b.yawDeg * Math.PI) / 180;
  const ux = Math.sin(a);
  const uz = -Math.cos(a);
  for (const side of [1, -1]) {
    // The face's outward normal, and a point a few metres off it.
    const nx = -uz * side;
    const nz = ux * side;
    const n = Math.floor((2 * b.halfLength) / T.berthSpacing);
    for (let i = 0; i < n; i++) {
      const s = -b.halfLength + T.berthSpacing * (i + 0.5);
      const fx = b.x + ux * s + nx * b.halfWidth;
      const fz = b.z + uz * s + nz * b.halfWidth;
      // Open water off the face: deep enough out at the berth's reach, and no land in between.
      const need = b.kind === 'pontoon' ? T.pontoonDepth : T.berthDepth;
      if (hAt(fx + nx * T.pocketReach, fz + nz * T.pocketReach) > -need) continue;
      if ([1, 4, 8, 12].some((d) => isLand(fx + nx * d, fz + nz * d))) continue;
      // Not inside another piece (a face against a neighbouring pier or the quay).
      if (blocks.some((o) => o !== b && insideBlock(o, fx + nx * T.berthOff, fz + nz * T.berthOff, 1))) continue;
      berths.push({ id: `${b.source}#${berths.length}`, source: b.source, x: r1(fx + nx * T.berthOff), z: r1(fz + nz * T.berthOff), headingDeg: Math.round(b.yawDeg), shoreX: r1(-nx), shoreZ: r1(-nz), shoreDist: T.berthOff, deckY: b.top });
    }
  }
}

function insideBlock(o: Block, x: number, z: number, margin: number): boolean {
  const a = (o.yawDeg * Math.PI) / 180;
  const ux = Math.sin(a);
  const uz = -Math.cos(a);
  const dx = x - o.x;
  const dz = z - o.z;
  return Math.abs(dx * ux + dz * uz) <= o.halfLength + margin && Math.abs(-dx * uz + dz * ux) <= o.halfWidth + margin;
}

// ── Harbours: clusters of pieces ──
interface Harbour {
  id: string;
  name: string;
  kind: 'harbour' | 'pier' | 'anchorage';
  x: number;
  z: number;
  pieces: string[];
  berths: number;
  fetch: number;
  role?: string;
}
const items = [
  ...blocks.map((b) => ({ x: b.x, z: b.z, source: b.source, kind: b.kind, len: b.halfLength * 2, name: b.name ?? '' })),
  ...slipways.map((s) => ({ x: s.x, z: s.z, source: s.source, kind: 'slipway', len: s.length, name: s.name })),
];
const group = items.map((_, i) => i);
const find = (i: number): number => (group[i] === i ? i : (group[i] = find(group[i])));
for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (Math.hypot(items[i].x - items[j].x, items[i].z - items[j].z) < T.clusterGap) group[find(i)] = find(j);
const clusters = new Map<number, typeof items>();
items.forEach((it, i) => clusters.set(find(i), [...(clusters.get(find(i)) ?? []), it]));
const places = Object.values(osm.nodeTags)
  .map((t, i) => ({ t, p: osm.nodes[Object.keys(osm.nodeTags)[i]] }))
  .filter(({ t, p }) => p && t.name && ['town', 'village', 'hamlet', 'suburb', 'locality'].includes(t.place))
  .map(({ t, p }) => ({ name: t.name, at: P.fwd(p[0], p[1]) }));

/** Open water seen from (x, z): the mean fetch round the compass (m). The box's edge counts as open sea. */
function fetch(x: number, z: number): number {
  let sum = 0;
  for (let r = 0; r < T.fetchRays; r++) {
    const a = (r / T.fetchRays) * Math.PI * 2;
    let d = 20;
    for (; d < T.fetchMax; d += 20) {
      const px = x + Math.sin(a) * d;
      const pz = z - Math.cos(a) * d;
      if (!inBox(px, pz)) {
        d = T.fetchMax;
        break;
      }
      if (isLand(px, pz)) break;
    }
    sum += d;
  }
  return sum / T.fetchRays;
}

const harbours: Harbour[] = [];
for (const list of clusters.values()) {
  const solid = list.filter((it) => it.kind !== 'slipway');
  if (!solid.length && list.every((it) => it.len < 30)) continue; // a lone small slip: not a harbour
  const cx = list.reduce((s, it) => s + it.x, 0) / list.length;
  const cz = list.reduce((s, it) => s + it.z, 0) / list.length;
  const area = areas.filter((a) => Math.hypot(a.x - cx, a.z - cz) < T.clusterGap * 1.5).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0];
  const named = list.find((it) => it.name);
  const place = places.sort((a, b) => Math.hypot(a.at[0] - cx, a.at[1] - cz) - Math.hypot(b.at[0] - cx, b.at[1] - cz))[0];
  const name = area?.name || named?.name || (place ? `${place.name} ${solid.length ? 'pier' : 'slip'}` : 'Harbour');
  const isHarbour = list.some((it) => it.kind === 'quay') || !!area || solid.reduce((s, it) => s + it.len, 0) > 120;
  const sources = list.map((it) => it.source);
  const nb = berths.filter((b) => sources.includes(b.source));
  // Fetch from the harbour's berths (where boats lie), else its middle.
  const at = nb.length ? nb : [{ x: cx, z: cz }];
  const f = at.reduce((s, b) => s + fetch(b.x, b.z), 0) / at.length;
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  harbours.push({ id, name, kind: isHarbour ? 'harbour' : 'pier', x: r1(cx), z: r1(cz), pieces: [...new Set(sources)], berths: nb.length, fetch: Math.round(f) });
}
// Unique ids.
const seenIds = new Map<string, number>();
for (const h of harbours) {
  const n = seenIds.get(h.id) ?? 0;
  seenIds.set(h.id, n + 1);
  if (n) h.id = `${h.id}-${n + 1}`;
}

// ── Spine roles ──
const spine = req.spine ?? {};
const byName = (v: string) => harbours.find((h) => h.name.toLowerCase() === v.toLowerCase() || h.id === v);
const usable = harbours.filter((h) => h.berths > 0);
const assign = (role: string, pick: () => Harbour | undefined) => {
  const v = spine[role];
  if (!v) return;
  const h = v === 'auto' ? pick() : byName(v);
  if (h) h.role = role;
  else warnings.push(`spine role ${role}: no harbour "${v}" found`);
};
assign('harbour.sheltered', () => usable.filter((h) => h.kind === 'harbour' && !h.role).sort((a, b) => a.fetch - b.fetch)[0]);
assign('pier.exposed', () => usable.filter((h) => !h.role).sort((a, b) => b.fetch - a.fetch)[0]);
if (spine.anchorage) {
  // The anchorage: the most sheltered water of the right depth, clear of harbours and marks.
  let best: { x: number; z: number; f: number } | null = null;
  for (let z = P.z0 + 200; z < P.z1 - 200; z += 100)
    for (let x = P.x0 + 200; x < P.x1 - 200; x += 100) {
      const d = -hAt(x, z);
      if (d < T.anchorDepth[0] || d > T.anchorDepth[1]) continue;
      if (harbours.some((h) => Math.hypot(h.x - x, h.z - z) < T.anchorClear)) continue;
      if (nav.marks.some((m: { x: number; z: number }) => Math.hypot(m.x - x, m.z - z) < T.anchorClear)) continue;
      // Room to swing: no land within 120 m.
      if ([0, 1, 2, 3, 4, 5, 6, 7].some((k) => isLand(x + Math.cos((k * Math.PI) / 4) * 120, z + Math.sin((k * Math.PI) / 4) * 120))) continue;
      const f = fetch(x, z);
      if (!best || f < best.f) best = { x, z, f };
    }
  if (best) {
    const place = places.sort((a, b) => Math.hypot(a.at[0] - best!.x, a.at[1] - best!.z) - Math.hypot(b.at[0] - best!.x, b.at[1] - best!.z))[0];
    harbours.push({ id: 'anchorage', name: `${place?.name ?? 'The'} anchorage`, kind: 'anchorage', x: best.x, z: best.z, pieces: [], berths: 0, fetch: Math.round(best.f), role: 'anchorage' });
  } else warnings.push('anchorage: no sheltered water 4-15 m deep found');
}
if (!harbours.some((h) => h.role === 'harbour.sheltered') && spine['harbour.sheltered']) warnings.push('no sheltered harbour found');

// ── Buildings near the harbours ──
const pieces = [...blocks.map((b) => [b.x, b.z]), ...slipways.map((s) => [s.x, s.z])];
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
};
const HEIGHT_BY_KIND: Record<string, number> = { house: 6, detached: 6, semidetached_house: 6, terrace: 8, residential: 7, apartments: 11, church: 11, cathedral: 14, hotel: 12, retail: 6, commercial: 8, industrial: 7, warehouse: 7, garage: 3, garages: 3, shed: 3, hut: 3, boathouse: 4, roof: 4, school: 8, yes: 6 };
const buildings: { source: string; x: number; z: number; width: number; depth: number; height: number; yawDeg: number; base: number; wall: number; roof: number; cladding: 'boards' | 'render' | 'sheet' }[] = [];
let skippedFar = 0;
for (const [id, w] of Object.entries(osm.ways)) {
  const t = w.tags ?? {};
  if (!t.building || t.building === 'no') continue;
  const p = pts(w);
  if (p.length < 4) continue;
  const c = p.reduce(([sx, sz], [x, z]) => [sx + x / p.length, sz + z / p.length], [0, 0]);
  if (!inBox(c[0], c[1])) continue;
  if (!pieces.some(([x, z]) => Math.hypot(x - c[0], z - c[1]) < T.buildingReach)) {
    skippedFar++;
    continue;
  }
  const b = minBox(p);
  if (b.area < T.minFootprint || b.area > 6000) continue;
  const levels = Number.parseFloat(t['building:levels'] ?? '');
  const height = Number.parseFloat(t.height ?? '') || (levels ? levels * 3 + 0.5 : HEIGHT_BY_KIND[t.building] ?? 6);
  const ground = Math.min(...[[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sa, sc]) => {
    const a = (b.yawDeg * Math.PI) / 180;
    return hAt(b.x + Math.sin(a) * sa * b.halfLength - Math.cos(a) * sc * b.halfWidth, b.z - Math.cos(a) * sa * b.halfLength - Math.sin(a) * sc * b.halfWidth);
  }));
  const shed = ['industrial', 'warehouse', 'garage', 'garages', 'shed', 'roof', 'boathouse'].includes(t.building);
  const pal = theme.buildings;
  const k = hash(id);
  buildings.push({
    source: `way/${id}`,
    x: r1(b.x),
    z: r1(b.z),
    width: r1(b.halfWidth * 2),
    depth: r1(b.halfLength * 2),
    height: r1(Math.min(30, height)),
    yawDeg: Math.round(b.yawDeg),
    base: r1(Math.max(0.3, ground)),
    wall: shed ? pal.shedWalls[Math.floor(k * pal.shedWalls.length)] : pal.walls[Math.floor(k * pal.walls.length)],
    roof: shed ? pal.shedRoof : pal.roofs[Math.floor(((k * 7) % 1) * pal.roofs.length)],
    cladding: shed ? 'sheet' : 'render',
  });
}

// ── Hand edits ──
interface Edits {
  remove?: string[];
  change?: { match: string; set: Record<string, unknown> }[];
  add?: { blocks?: Block[]; berths?: typeof berths; buildings?: typeof buildings; slipways?: typeof slipways };
}
const editsFile = join(ROOT, 'requests', `${req.id}.edits.yaml`);
let editCount = 0;
let out = { harbours, blocks, berths, slipways, buildings };
if (existsSync(editsFile)) {
  const ed = (yaml.load(readFileSync(editsFile, 'utf8')) ?? {}) as Edits;
  const gone = new Set(ed.remove ?? []);
  const keep = <X extends { source?: string; id?: string }>(a: X[]) => a.filter((x) => !gone.has(x.source ?? '') && !gone.has(x.id ?? ''));
  out = { harbours: keep(harbours), blocks: keep(blocks), berths: keep(berths), slipways: keep(slipways), buildings: keep(buildings) };
  editCount += gone.size;
  for (const c of ed.change ?? []) {
    const hits = [...out.harbours, ...out.blocks, ...out.berths, ...out.slipways, ...out.buildings].filter((x) => (x as { source?: string }).source === c.match || (x as { id?: string }).id === c.match || (x as { name?: string }).name === c.match);
    if (!hits.length) warnings.push(`edit: nothing matches "${c.match}"`);
    for (const h of hits) Object.assign(h, c.set);
    editCount++;
  }
  for (const [k, list] of Object.entries(ed.add ?? {})) {
    (out as unknown as Record<string, unknown[]>)[k].push(...(list as unknown[]).map((x) => ({ source: 'hand', ...(x as object) })));
    editCount += (list as unknown[]).length;
  }
}

// ── Write ──
const round = <X>(a: X[]) => a.map((x) => Object.fromEntries(Object.entries(x as object).map(([k, v]) => [k, typeof v === 'number' && !Number.isInteger(v) ? r1(v) : v])));
writeFileSync(join(D.out, 'harbours.json'), JSON.stringify({ harbours: out.harbours, blocks: round(out.blocks), berths: out.berths, slipways: out.slipways, buildings: out.buildings }, null, 0));
writeFileSync(join(D.work, 'dredge.json'), JSON.stringify([...dredge, ...walls]));
// Point region.json at it (the mesh stage does this too, when it writes region.json).
const regionPath = join(D.out, 'region.json');
if (existsSync(regionPath)) {
  const region = JSON.parse(readFileSync(regionPath, 'utf8'));
  region.harbours = 'harbours.json';
  writeFileSync(regionPath, JSON.stringify(region, null, 1));
}
if (!out.harbours.some((h) => h.kind !== 'anchorage')) warnings.push('no harbours found in OpenStreetMap for this box');
const reportPath = join(D.out, 'report.json');
const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : {};
report.harbours = { harbours: out.harbours.length, blocks: out.blocks.length, berths: out.berths.length, slipways: out.slipways.length, buildings: out.buildings.length, edits: editCount, roles: Object.fromEntries(out.harbours.filter((h) => h.role).map((h) => [h.role, h.name])) };
report.warnings = [...(report.warnings ?? []).filter((w: string) => !/^(spine|anchorage|edit|no harbours|no sheltered)/.test(w)), ...warnings];
writeFileSync(reportPath, JSON.stringify(report, null, 1));
console.log(`harbours: ${out.harbours.length} harbours, ${out.blocks.length} kit blocks, ${out.berths.length} berths, ${out.slipways.length} slipways, ${out.buildings.length} buildings (${skippedFar} farther out left to the land cover), ${editCount} hand edits`);
for (const h of out.harbours) console.log(`  ${h.kind.padEnd(9)} ${h.name}${h.role ? ` [${h.role}]` : ''}: ${h.berths} berths, fetch ${h.fetch} m`);
for (const w of warnings) console.log(`warning: ${w}`);

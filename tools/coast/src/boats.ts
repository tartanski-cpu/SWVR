/**
 * Stage 10, boats (the settlements brief, Part C: harbour boats): where boats lie on
 * moorings and at anchor, for the game to put its harbour boats on (world/harbourBoats.ts).
 * The boats alongside need nothing from here: the game fills a share of the berths it
 * already finds along the pontoon and quay faces.
 *
 *   Moorings   OpenStreetMap's mooring buoys (seamark:type=mooring) where mapped: few are
 *              (two in the whole Clyde). So in every harbour and pier's water the stage lays
 *              a mooring field of its own, as harbour authorities do: on a grid `spacing` m
 *              apart within `reach` m of the harbour, where there's `minDepth`-`maxDepth` m of
 *              water, `landClear` m from the shore, `blockClear` m from any pier or quay,
 *              `berthClear` m from any berth (the water in front of a face is kept clear for
 *              boats coming alongside), outside the marinas (leisure=marina: pontoons) and
 *              `blockClear` m clear of the fish farms' leases (the features stage's),
 *              sheltered (land within `shelterRange` m in at least `minShelter` of 16
 *              directions), and out of every harbour's fairway (`fairwayHalf` m either side
 *              of the line out along its most open way to sea, from its middle and from the
 *              middle of its berths, where boats come and go). The most sheltered first, up
 *              to a number by the harbour's size, times the theme's `moorings` share.
 *   Anchored   in each anchorage (the spine's, and seamark:type=anchorage areas): a few
 *              boats `anchorSpacing` m apart in `minDepth`-`anchorMaxDepth` m of water.
 *   Style      the theme's boat mix (themes.ts BoatStyle): which kinds lie where, and their colours.
 *
 * Writes public/regions/<id>/boats.json. Run: node src/boats.ts [requestId] (after harbours and features;
 * the package stage puts it in the game's package).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dirs, loadRequest, projection } from './common.ts';
import { THEMES } from './themes.ts';

const T = {
  /** The mooring field's grid (m) and how far from a harbour it reaches (m; a pier's less). */
  spacing: 40,
  reach: 500,
  pierReach: 280,
  /** Water for a mooring (m deep), and for anchoring. */
  minDepth: 2.5,
  maxDepth: 14,
  anchorMaxDepth: 18,
  /** Kept this far (m) from the shore, any pier or quay, and any berth. */
  landClear: 30,
  blockClear: 40,
  berthClear: 60,
  /** The fairway kept clear from each harbour out to sea (half its width, m), along its most open way (searched to `fairwayLook` m). */
  fairwayHalf: 70,
  fairwayLook: 3000,
  /** Sheltered: land within `shelterRange` m in at least `minShelter` of 16 directions. */
  shelterRange: 2500,
  minShelter: 7,
  /** Moorings per harbour: `base` + `perBerth` x its berths, at most `max` (a pier's at most `pierMax`). */
  base: 6,
  perBerth: 0.5,
  max: 40,
  pierMax: 8,
  /** Boats at anchor in each anchorage, and how far apart (m). */
  anchored: 4,
  anchorSpacing: 80,
};

const req = loadRequest(process.argv[2]);
const D = dirs(req.id);
const P = projection(req.bbox);
const theme = THEMES[req.theme];
const grid = JSON.parse(readFileSync(join(D.work, 'grid.json'), 'utf8'));
const rd = (name: string, Ctor: Float32ArrayConstructor | Uint8ArrayConstructor) => {
  const b = readFileSync(join(D.work, name));
  return new Ctor(b.buffer, b.byteOffset, b.byteLength / Ctor.BYTES_PER_ELEMENT);
};
const heights = rd('heights.bin', Float32Array) as Float32Array;
const land = rd('land.bin', Uint8Array) as Uint8Array;
const dist = rd('dist.bin', Float32Array) as Float32Array;
const hb = JSON.parse(readFileSync(join(D.out, 'harbours.json'), 'utf8')) as {
  harbours: { id: string; name: string; kind: 'harbour' | 'pier' | 'anchorage'; x: number; z: number; berths: number; pieces: string[] }[];
  blocks: { x: number; z: number; halfLength: number; halfWidth: number; yawDeg: number }[];
  berths: { x: number; z: number; source: string }[];
};
const osm = JSON.parse(readFileSync(join(D.raw, 'osm.json'), 'utf8')) as {
  nodes: Record<string, [number, number]>;
  nodeTags: Record<string, Record<string, string>>;
  ways: Record<string, { nodes: number[]; tags?: Record<string, string> }>;
};

const cellOf = (x: number, z: number) => {
  const i = Math.floor((x - grid.x0) / grid.cell);
  const j = Math.floor((z - grid.z0) / grid.cell);
  return i < 0 || j < 0 || i >= grid.width || j >= grid.height ? -1 : j * grid.width + i;
};
const depthAt = (x: number, z: number) => {
  const k = cellOf(x, z);
  return k < 0 || land[k] ? -1 : -heights[k];
};
const shoreDist = (x: number, z: number) => {
  const k = cellOf(x, z);
  return k < 0 || land[k] ? 0 : dist[k];
};
const isLand = (x: number, z: number) => {
  const k = cellOf(x, z);
  return k >= 0 && land[k] === 1;
};
const r1 = (v: number) => Math.round(v * 10) / 10;
/** A small hash of a point, 0-1 (the same spot jitters the same way every run). */
const hash = (x: number, z: number, s = 0) => {
  const v = Math.sin(x * 12.9898 + z * 78.233 + s * 37.719) * 43758.5453;
  return v - Math.floor(v);
};

/** How many of 16 directions meet land within `shelterRange` m (the more, the more sheltered). */
function shelter(x: number, z: number): number {
  let n = 0;
  for (let r = 0; r < 16; r++) {
    const a = (r / 16) * Math.PI * 2;
    for (let d = 40; d <= T.shelterRange; d += 40)
      if (isLand(x + Math.sin(a) * d, z - Math.cos(a) * d)) {
        n++;
        break;
      }
  }
  return n;
}

/** Distance (m) from a point to a pier or quay's rectangle (0 inside). */
function blockDist(b: (typeof hb.blocks)[number], x: number, z: number): number {
  const a = (b.yawDeg * Math.PI) / 180;
  const dx = x - b.x;
  const dz = z - b.z;
  const l = dx * Math.sin(a) - dz * Math.cos(a);
  const w = dx * Math.cos(a) + dz * Math.sin(a);
  return Math.hypot(Math.max(0, Math.abs(l) - b.halfLength), Math.max(0, Math.abs(w) - b.halfWidth));
}

// ── The map's own: mooring buoys, marinas, anchorage areas ──
const pt = (n: number) => {
  const ll = osm.nodes[n];
  return ll ? P.fwd(ll[0], ll[1]) : null;
};
const mapMoorings: [number, number][] = [];
for (const [id, t] of Object.entries(osm.nodeTags)) {
  if (t['seamark:type'] !== 'mooring') continue;
  // A mooring buoy, not a pile, dolphin or bollard a ship lies against (Hamburg's 1,100: none buoys).
  if (['pile', 'dolphin', 'bollard', 'post'].includes(t['seamark:mooring:category'] ?? '')) continue;
  const p = pt(Number(id));
  if (p && depthAt(p[0], p[1]) >= 1) mapMoorings.push(p);
}
const polygons = (want: (t: Record<string, string>) => boolean) =>
  Object.values(osm.ways)
    .filter((w) => w.tags && want(w.tags) && w.nodes.length > 3 && w.nodes[0] === w.nodes[w.nodes.length - 1])
    .map((w) => w.nodes.map(pt).filter((p): p is [number, number] => !!p));
const marinas = polygons((t) => t.leisure === 'marina');
// The fish farms' leases (the features stage, run first), kept clear by `blockClear`.
const farmLeases: [number, number][][] = existsSync(join(D.out, 'features.json')) ? JSON.parse(readFileSync(join(D.out, 'features.json'), 'utf8')).farms.map((f: { outline: [number, number][] }) => f.outline) : [];
const nearLease = (x: number, z: number) =>
  farmLeases.some((o) => inside(o, x, z) || o.some((p, i) => i > 0 && segDist(o[i - 1], p, x, z) < T.blockClear));
function segDist(a: [number, number], b: [number, number], x: number, z: number): number {
  const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
}
const anchorAreas = polygons((t) => t['seamark:type'] === 'anchorage');
function inside(poly: [number, number][], x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// ── Fairways: from each harbour out along its most open way ──
// (From the harbour's middle, and from the middle of its berths: a harbour's middle can be off
// to one side of where the boats come alongside.)
const berthsOf = (h: (typeof hb.harbours)[number]) => hb.berths.filter((b) => h.pieces.includes(b.source));
const fairways = hb.harbours
  .filter((h) => h.kind !== 'anchorage')
  .flatMap((h) => {
    const bs = berthsOf(h);
    return bs.length ? [h, { x: bs.reduce((t, b) => t + b.x, 0) / bs.length, z: bs.reduce((t, b) => t + b.z, 0) / bs.length }] : [h];
  })
  .map((h) => {
    let best = { a: 0, d: 0 };
    for (let r = 0; r < 32; r++) {
      const a = (r / 32) * Math.PI * 2;
      let d = 20;
      while (d < T.fairwayLook && !isLand(h.x + Math.sin(a) * d, h.z - Math.cos(a) * d)) d += 20;
      if (d > best.d) best = { a, d };
    }
    return { x: h.x, z: h.z, ux: Math.sin(best.a), uz: -Math.cos(best.a), len: best.d };
  });
const inFairway = (x: number, z: number) =>
  fairways.some((f) => {
    const along = (x - f.x) * f.ux + (z - f.z) * f.uz;
    const across = Math.abs(-(x - f.x) * f.uz + (z - f.z) * f.ux);
    return along > -T.fairwayHalf && along < f.len && across < T.fairwayHalf;
  });

// ── Moorings ──
interface Spot {
  x: number;
  z: number;
  depth: number;
  harbour: string;
  kind: 'mooring' | 'anchor';
  /** From the map's own mooring buoy (else laid by this stage). */
  mapped?: boolean;
}
const spots: Spot[] = [];
const taken = (x: number, z: number, r: number) => spots.some((s) => Math.hypot(s.x - x, s.z - z) < r);
const clearOfHarbours = (x: number, z: number) =>
  shoreDist(x, z) >= T.landClear && hb.blocks.every((b) => blockDist(b, x, z) >= T.blockClear) && hb.berths.every((b) => Math.hypot(b.x - x, b.z - z) >= T.berthClear) && !marinas.some((m) => inside(m, x, z)) && !nearLease(x, z) && !inFairway(x, z);

const nearestHarbour = (x: number, z: number) => hb.harbours.reduce((a, h) => (Math.hypot(h.x - x, h.z - z) < Math.hypot(a.x - x, a.z - z) ? h : a));
for (const [x, z] of mapMoorings) spots.push({ x: r1(x), z: r1(z), depth: r1(depthAt(x, z)), harbour: nearestHarbour(x, z).id, kind: 'mooring', mapped: true });

const fields: { harbour: string; moorings: number }[] = [];
for (const h of hb.harbours) {
  // (Not round a private jetty, the request's `privateJetties`: its boat is the cottage's own.)
  if (h.kind === 'anchorage' || (h as { private?: boolean }).private) continue;
  const pier = h.kind === 'pier';
  const reach = pier ? T.pierReach : T.reach;
  const want = Math.round(Math.min(pier ? T.pierMax : T.max, T.base + T.perBerth * h.berths) * theme.boats.moorings);
  const cands: { x: number; z: number; depth: number; score: number }[] = [];
  for (let gz = -reach; gz <= reach; gz += T.spacing)
    for (let gx = -reach; gx <= reach; gx += T.spacing) {
      // A little off the grid, so a field doesn't look ruled.
      const x = h.x + gx + (hash(gx, gz, 1) - 0.5) * T.spacing * 0.3;
      const z = h.z + gz + (hash(gx, gz, 2) - 0.5) * T.spacing * 0.3;
      const r = Math.hypot(x - h.x, z - h.z);
      if (r > reach) continue;
      const depth = depthAt(x, z);
      if (depth < T.minDepth || depth > T.maxDepth || !clearOfHarbours(x, z)) continue;
      const sh = shelter(x, z);
      if (sh < T.minShelter) continue;
      cands.push({ x, z, depth, score: sh - (r / reach) * 4 });
    }
  cands.sort((a, b) => b.score - a.score);
  let n = 0;
  for (const c of cands) {
    if (n >= want) break;
    if (taken(c.x, c.z, T.spacing * 0.9)) continue;
    spots.push({ x: r1(c.x), z: r1(c.z), depth: r1(c.depth), harbour: h.id, kind: 'mooring' });
    n++;
  }
  fields.push({ harbour: h.id, moorings: n });
}

// ── At anchor ──
const anchorages: { id: string; x: number; z: number; poly?: [number, number][] }[] = hb.harbours.filter((h) => h.kind === 'anchorage').map((h) => ({ id: h.id, x: h.x, z: h.z }));
for (const [i, poly] of anchorAreas.entries()) {
  const x = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const z = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  anchorages.push({ id: `${req.id}-anchorage-area-${i + 1}`, x, z, poly });
}
for (const a of anchorages) {
  let n = 0;
  for (let ring = 0; ring < 6 && n < T.anchored; ring++)
    for (let k = 0; k < 8 && n < T.anchored; k++) {
      const ang = ((k + hash(a.x, a.z, ring) * 0.8) / 8) * Math.PI * 2;
      const d = ring * T.anchorSpacing * 0.7;
      const x = a.x + Math.sin(ang) * d;
      const z = a.z - Math.cos(ang) * d;
      const depth = depthAt(x, z);
      if (depth < T.minDepth || depth > T.anchorMaxDepth || shoreDist(x, z) < T.landClear) continue;
      if (a.poly && !inside(a.poly, x, z)) continue;
      if (taken(x, z, T.anchorSpacing)) continue;
      spots.push({ x: r1(x), z: r1(z), depth: r1(depth), harbour: a.id, kind: 'anchor' });
      n++;
      if (ring === 0) break;
    }
}

const moorings = spots.filter((s) => s.kind === 'mooring').length;
const out = { style: theme.boats, spots, counts: { moorings, mapped: mapMoorings.length, anchored: spots.length - moorings, fields } };
writeFileSync(join(D.out, 'boats.json'), JSON.stringify(out));
console.log(`boats: ${moorings} moorings (${mapMoorings.length} from the map) in ${fields.filter((f) => f.moorings).length} of ${fields.length} harbours, ${spots.length - moorings} at anchor in ${anchorages.length} anchorages`);

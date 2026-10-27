/**
 * Stage 11, features (the coast extras plan, C1): everything else in the map data that
 * the later milestones draw, sound or play with, read in one pass and kept for the game.
 * Nothing guessed: where the map is silent, there's nothing (a cable with no clearance
 * tagged has none; a coast with no wrecks mapped has none).
 *
 *   farms       marine farms (nav.ts reads their outlines): their kind (fish cages,
 *               mussel lines, other) from seamark:marine_farm:category      (C2)
 *   bridges     roads and railways bridging the sea (at least `bridgeWater` m of it): deck
 *               line, width, name, structure (cantilever, arch, beam ...)
 *   follies     follies mapped as buildings (McCaig's Tower), with their footprint
 *   gantries    a shipyard's gantry cranes over its building dock (Perno), from their track's area
 *   landmarks   castles, towers, masts, chimneys, water towers, monuments, lighthouses,
 *               wind turbines, churches: where, and their height where tagged (C2)
 *   shore       beaches by surface (sand, shingle, pebbles...), shingle, bare rock, and
 *               cliff lines along the shore (C3)
 *   farmland    each field's middle and area (the livestock heard in C5)
 *   names       places (towns, villages, hamlets, islands, islets) and the sea's own
 *               names (bays, headlands, straits, peninsulas), ranked for the chart (C4)
 *   fogSignals  lights with a fog signal tagged, and stand-alone fog signals: its
 *               category, group and period (C5)
 *   wrecks      the charted wrecks (nav.ts's hazards), their depth and category (C6)
 *   cables      submarine cables and pipelines (seamark:type, or power=cable /
 *               man_made=pipeline laid under the water) as lines (C6)
 *   overhead    power lines' spans over the water, with their charted clearance where
 *               tagged, else none (C6)
 *   ferries     ferry routes (route=ferry ways and relations) as lines, and the ferry
 *               terminals (C7)
 *
 * Lines and outlines are thinned to `simplify` m (Douglas-Peucker) and cut to the box.
 * Writes public/regions/<id>/features.json. Run: node src/features.ts [requestId] (after
 * nav, before shore and boats; the package stage names it in the game's package).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dirs, loadRequest, nameOf, projection } from './common.ts';

const T = {
  /** Lines and outlines thinned to this (m). */
  simplify: 5,
  /** A span of a power line counts as over the water when at least this much of it is (m). */
  overWater: 30,
  /** A road or railway bridge is kept when at least this much of its length (m) is over the sea: a crossing (Connel Bridge, about 150 m), not
   * a burn's bridge, the road onto a pier (the pier is drawn already) or a dock gate's swing bridge (it opens; the game can't, yet). */
  bridgeWater: 60,
  /** An untagged bridge deck's width (m): a railway's, a main road's, any other road's. */
  bridgeWidth: { rail: 5, main: 9, road: 7 },
  /** No road deck narrower than this (m): a width tag under it is a lane's (Connel Bridge's says 2). */
  bridgeMinWidth: 4,
  /** A folly is built as a ring of arches only when it spans at least this (m): McCaig's Tower (58 m); a garden grotto (5 m) isn't one. */
  follyMinSpan: 25,
  /** A gantry crane this wide between its rails or more (m) is a landmark (a shipyard's goliath). */
  gantryMinSpan: 40,
  /** An island or archipelago whose outline spans more than this (m) isn't named: bigger than any map. */
  biggestIsland: 60000,
};

const req = loadRequest(process.argv[2]);
const D = dirs(req.id);
const P = projection(req.bbox);
const grid = JSON.parse(readFileSync(join(D.work, 'grid.json'), 'utf8'));
const lb = readFileSync(join(D.work, 'land.bin'));
const land = new Uint8Array(lb.buffer, lb.byteOffset, lb.byteLength);
const nav = JSON.parse(readFileSync(join(D.out, 'nav.json'), 'utf8')) as {
  farms: { name: string; category: string | null; outline: [number, number][] }[];
  hazards: { name: string; kind: string; x: number; z: number; depth: number; category: string | null; waterLevel: string | null }[];
};
type Tags = Record<string, string>;
const osm = JSON.parse(readFileSync(join(D.raw, 'osm.json'), 'utf8')) as {
  nodes: Record<string, [number, number]>;
  nodeTags: Record<string, Tags>;
  ways: Record<string, { nodes: number[]; tags?: Tags }>;
  relations: Record<string, { members: { type: string; ref: number; role: string }[]; tags?: Tags }>;
};

type XZ = [number, number];
const r1 = (v: number) => Math.round(v * 10) / 10;
const pt = (n: number | string): XZ | null => {
  const ll = osm.nodes[n];
  return ll ? P.fwd(ll[0], ll[1]) : null;
};
const inBox = ([x, z]: XZ) => x >= P.x0 && x <= P.x1 && z >= P.z0 && z <= P.z1;
const isLand = ([x, z]: XZ) => {
  const i = Math.floor((x - grid.x0) / grid.cell);
  const j = Math.floor((z - grid.z0) / grid.cell);
  return i >= 0 && j >= 0 && i < grid.width && j < grid.height && land[j * grid.width + i] === 1;
};
/** Water inside the box (outside it the land mask says nothing). */
const isWet = (p: XZ) => inBox(p) && !isLand(p);
const wayPts = (nodes: number[]) => nodes.map(pt).filter((p): p is XZ => !!p);
const middle = (ps: XZ[]): XZ => [ps.reduce((t, p) => t + p[0], 0) / ps.length, ps.reduce((t, p) => t + p[1], 0) / ps.length];
const area = (ps: XZ[]) => Math.abs(ps.reduce((t, p, i) => t + p[0] * ps[(i + 1) % ps.length][1] - ps[(i + 1) % ps.length][0] * p[1], 0) / 2);
const span = (ps: XZ[]) => Math.hypot(Math.max(...ps.map((p) => p[0])) - Math.min(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[1])) - Math.min(...ps.map((p) => p[1])));

/**
 * Douglas-Peucker: drop the points within `tol` m of the line through their neighbours. A
 * closed outline (its ends together) is split at its point farthest from the start and each
 * half thinned, so it stays an outline.
 */
function simplify(ps: XZ[], tol = T.simplify): XZ[] {
  if (ps.length < 3) return ps.map(([x, z]) => [r1(x), r1(z)]);
  const [sx, sz] = ps[0];
  const [ex, ez] = ps[ps.length - 1];
  if (Math.hypot(ex - sx, ez - sz) < 0.01) {
    let far = 1;
    for (let i = 1; i < ps.length - 1; i++) if (Math.hypot(ps[i][0] - sx, ps[i][1] - sz) > Math.hypot(ps[far][0] - sx, ps[far][1] - sz)) far = i;
    return [...simplify(ps.slice(0, far + 1), tol).slice(0, -1), ...simplify(ps.slice(far), tol)];
  }
  const keep = new Uint8Array(ps.length);
  keep[0] = keep[ps.length - 1] = 1;
  const stack: [number, number][] = [[0, ps.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, az] = ps[a];
    const [bx, bz] = ps[b];
    const L = Math.hypot(bx - ax, bz - az) || 1;
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (az - ps[i][1]) - (ax - ps[i][0]) * (bz - az)) / L;
      if (d > worst) [worst, at] = [d, i];
    }
    if (worst > tol) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return ps.filter((_, i) => keep[i]).map(([x, z]) => [r1(x), r1(z)]);
}

/** A relation's outer ways joined into rings (a multipolygon's edge is often several ways end to end). */
function rings(relation: { members: { type: string; ref: number; role: string }[] }): XZ[][] {
  const open = relation.members.filter((m) => m.type === 'way' && m.role !== 'inner' && osm.ways[m.ref]).map((m) => [...osm.ways[m.ref].nodes]);
  const out: XZ[][] = [];
  while (open.length) {
    const ring = open.shift()!;
    for (let guard = 0; ring[0] !== ring[ring.length - 1] && guard < 1000; guard++) {
      const end = ring[ring.length - 1];
      const i = open.findIndex((w) => w[0] === end || w[w.length - 1] === end);
      if (i < 0) break;
      const w = open.splice(i, 1)[0];
      ring.push(...(w[0] === end ? w.slice(1) : w.reverse().slice(1)));
    }
    const ps = wayPts(ring);
    if (ps.length >= 3) out.push(ps);
  }
  return out;
}

/** Every tagged thing in the map as its tags and its points (a node one point; a way its line; a relation its rings). */
interface Thing {
  tags: Tags;
  kind: 'node' | 'way' | 'relation';
  /** Its lines (a node: one line of one point). */
  lines: XZ[][];
  /** A relation whose outline lies mostly outside the map (most of its member ways not in the download). */
  partial?: boolean;
}
const things: Thing[] = [];
for (const [id, tags] of Object.entries(osm.nodeTags)) {
  const p = pt(id);
  if (p) things.push({ tags, kind: 'node', lines: [[p]] });
}
for (const w of Object.values(osm.ways)) if (w.tags) things.push({ tags: w.tags, kind: 'way', lines: [wayPts(w.nodes)] });
for (const r of Object.values(osm.relations)) {
  if (!r.tags) continue;
  const ways = r.members.filter((m) => m.type === 'way');
  const partial = ways.filter((m) => !osm.ways[m.ref]).length > ways.length / 2;
  things.push({ tags: r.tags, kind: 'relation', partial, lines: r.tags.type === 'route' ? ways.filter((m) => osm.ways[m.ref]).map((m) => wayPts(osm.ways[m.ref].nodes)) : rings(r) });
}
const allPts = (t: Thing) => t.lines.flat();
const where = (t: Thing): XZ | null => {
  const ps = allPts(t);
  return ps.length ? middle(ps) : null;
};

// ── Farms (C2) ──
const farmKind = (c: string | null) => (!c ? 'other' : /fish|salmon|finfish/i.test(c) ? 'fish' : /mussel|shellfish|oyster|crustacean/i.test(c) ? 'shellfish' : /seaweed|kelp/i.test(c) ? 'seaweed' : 'other');
const farms = nav.farms.map((f) => ({ name: f.name, kind: farmKind(f.category), outline: simplify(f.outline) }));

// ── Landmarks (C2) ──
const landmarkKind = (t: Tags): string | null =>
  t['generator:source'] === 'wind' || (t.power === 'generator' && t['generator:method'] === 'wind_turbine')
    ? 'turbine'
    : t.historic === 'castle'
      ? 'castle'
      : t.man_made === 'lighthouse'
        ? 'lighthouse'
        : // (A floodlight's pole, tagged a mast of the lighting kind, isn't one: McCaig's Tower has four.)
          (t.man_made === 'mast' && !/lighting|flagpole/.test(t['tower:type'] ?? '')) || t.man_made === 'communications_tower' || (t.man_made === 'tower' && /communication|telecom/.test(t['tower:type'] ?? ''))
          ? 'mast'
          : t.man_made === 'tower'
            ? 'tower'
            : t.man_made === 'chimney'
              ? 'chimney'
              : t.man_made === 'water_tower'
                ? 'water_tower'
                : t.historic === 'monument'
                  ? 'monument'
                  : t.amenity === 'place_of_worship' && t.building
                    ? 'church'
                    : null;
const heightOf = (t: Tags) => {
  const h = parseFloat(t.height ?? t['seamark:landmark:height'] ?? '');
  return Number.isFinite(h) ? h : null;
};
const landmarks: { kind: string; name: string; x: number; z: number; height: number | null; size: number }[] = [];
for (const t of things) {
  const kind = landmarkKind(t.tags);
  if (!kind) continue;
  const p = where(t);
  if (!p || !inBox(p)) continue;
  const ps = allPts(t);
  landmarks.push({ kind, name: nameOf(t.tags), x: r1(p[0]), z: r1(p[1]), height: heightOf(t.tags), size: ps.length > 1 ? Math.round(span(ps)) : 0 });
}

// ── The shore (C3) ──
const shoreSurface = (t: Tags): string | null => {
  if (t.natural === 'beach') return t.surface === 'sand' || t.surface === 'shingle' || t.surface === 'pebbles' || t.surface === 'gravel' || t.surface === 'rock' ? (t.surface === 'gravel' ? 'shingle' : t.surface) : 'beach';
  if (t.natural === 'shingle') return 'shingle';
  if (t.natural === 'bare_rock') return 'rock';
  return null;
};
const shore: { surface: string; outline: XZ[] }[] = [];
const cliffs: XZ[][] = [];
for (const t of things) {
  if (t.kind === 'node') continue;
  if (t.tags.natural === 'cliff') {
    for (const l of t.lines) if (l.length > 1 && l.some(inBox)) cliffs.push(simplify(l));
    continue;
  }
  const s = shoreSurface(t.tags);
  if (!s) continue;
  for (const l of t.lines) if (l.length > 2 && l.some(inBox)) shore.push({ surface: s, outline: simplify(l) });
}

// ── Farmland (C5's livestock) ──
const farmland: { x: number; z: number; area: number }[] = [];
for (const t of things) {
  if (t.kind === 'node' || !(t.tags.landuse === 'farmland' || t.tags.landuse === 'meadow' || t.tags.landuse === 'farmyard')) continue;
  for (const l of t.lines) {
    if (l.length < 3) continue;
    const m = middle(l);
    if (inBox(m)) farmland.push({ x: r1(m[0]), z: r1(m[1]), area: Math.round(area(l)) });
  }
}

// ── Names (C4) ──
// Rank 1 is shown farthest out: towns and the big waters; 4 only close in.
const RANK: Record<string, number> = { city: 1, town: 1, archipelago: 1, sea: 1, strait: 2, island: 2, village: 2, bay: 2, peninsula: 2, suburb: 3, hamlet: 3, cape: 3, quarter: 3, islet: 4, locality: 4, neighbourhood: 4, isolated_dwelling: 4, farm: 4 };
const names: { name: string; kind: string; x: number; z: number; rank: number }[] = [];
for (const t of things) {
  const kind = t.tags.place ?? (['bay', 'cape', 'strait', 'peninsula'].includes(t.tags.natural ?? '') ? t.tags.natural : undefined);
  if (!kind || !RANK[kind]) continue;
  const name = nameOf(t.tags);
  const p = where(t);
  if (!name || !p || !inBox(p)) continue;
  if (names.some((n) => n.name === name && Math.hypot(n.x - p[0], n.z - p[1]) < 2000)) continue; // a place mapped twice (node and area)
  // An island or archipelago far bigger than the map (Great Britain, the Inner Hebrides: most of
  // its outline isn't in the map's download): its middle says nothing about where it is here,
  // and a chart of the coast doesn't name it.
  const ps = allPts(t);
  if (t.partial || (ps.length > 1 && span(ps) > T.biggestIsland)) continue;
  names.push({ name, kind, x: r1(p[0]), z: r1(p[1]), rank: RANK[kind] });
}

// ── Fog signals (C5) ──
const fogSignals: { name: string; x: number; z: number; category: string | null; group: string | null; period: number | null }[] = [];
for (const t of things) {
  if (t.kind !== 'node') continue;
  const fog = Object.keys(t.tags).some((k) => k.startsWith('seamark:fog_signal')) || t.tags['seamark:type'] === 'fog_signal';
  if (!fog) continue;
  const p = t.lines[0][0];
  if (!inBox(p)) continue;
  const period = parseFloat(t.tags['seamark:fog_signal:period'] ?? '');
  fogSignals.push({ name: nameOf(t.tags) || nameOf(t.tags, 'seamark:name'), x: r1(p[0]), z: r1(p[1]), category: t.tags['seamark:fog_signal:category'] ?? null, group: t.tags['seamark:fog_signal:group'] ?? null, period: Number.isFinite(period) ? period : null });
}

// ── Wrecks (C6) ──
const wrecks = nav.hazards.filter((h) => h.kind === 'wreck').map((h) => ({ name: h.name, x: h.x, z: h.z, depth: h.depth, category: h.category }));

// ── Cables and pipelines under the water, power lines over it (C6) ──
const cables: { kind: 'cable' | 'pipeline'; name: string; path: XZ[] }[] = [];
const overhead: { name: string; path: XZ[]; clearance: number | null }[] = [];
const wetShare = (l: XZ[]) => l.filter(isWet).length / l.length;
for (const t of things) {
  if (t.kind !== 'way') continue;
  const tg = t.tags;
  const l = t.lines[0];
  if (l.length < 2 || !l.some(inBox)) continue;
  const under = tg.location === 'underwater' || tg.location === 'submarine';
  if (tg['seamark:type'] === 'cable_submarine' || (tg.power === 'cable' && (under || wetShare(l) > 0.5))) cables.push({ kind: 'cable', name: nameOf(tg), path: simplify(l) });
  else if (tg['seamark:type'] === 'pipeline_submarine' || (tg.man_made === 'pipeline' && (under || wetShare(l) > 0.5))) cables.push({ kind: 'pipeline', name: nameOf(tg), path: simplify(l) });
  else if (tg.power === 'line' || tg.power === 'minor_line' || tg['seamark:type'] === 'cable_overhead') {
    const c = parseFloat(tg['seamark:cable_overhead:vertical_clearance_safe'] ?? tg['seamark:cable_overhead:vertical_clearance'] ?? tg.vertical_clearance ?? '');
    // Each span between two pylons that crosses water (sampled every 10 m).
    for (let i = 0; i + 1 < l.length; i++) {
      const [a, b] = [l[i], l[i + 1]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let wet = 0;
      for (let s = 5; s < len; s += 10) if (isWet([a[0] + ((b[0] - a[0]) * s) / len, a[1] + ((b[1] - a[1]) * s) / len])) wet += 10;
      if (wet >= T.overWater) overhead.push({ name: nameOf(tg), path: [a, b].map(([x, z]) => [r1(x), r1(z)] as XZ), clearance: Number.isFinite(c) ? c : null });
    }
  }
}

// ── Ferries (C7) ──
// (Each with who runs it and whether it carries cars: the game's ferries take their livery and
// their size from these.)
const routes: { name: string; operator: string; foot: boolean; path: XZ[] }[] = [];
for (const t of things) {
  if (t.tags.route !== 'ferry' || t.kind === 'node') continue;
  const name = nameOf(t.tags);
  const foot = t.tags.motor_vehicle === 'no' || t.tags.motorcar === 'no' || /passenger/i.test(name);
  for (const l of t.lines) if (l.length > 1 && l.some(inBox)) routes.push({ name, operator: t.tags.operator ?? '', foot, path: simplify(l) });
}
// (A route mapped twice, as ways and as a relation, or once each way: one copy, by its ends within 100 m.)
const near = (a: XZ, b: XZ) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 100;
const ferryRoutes: typeof routes = [];
for (const r of routes) {
  const [a, b] = [r.path[0], r.path[r.path.length - 1]];
  const dup = ferryRoutes.some((q) => {
    const [c, d] = [q.path[0], q.path[q.path.length - 1]];
    return (near(a, c) && near(b, d)) || (near(a, d) && near(b, c));
  });
  if (!dup) ferryRoutes.push(r);
}
const terminals: { name: string; x: number; z: number }[] = [];
for (const t of things) {
  if (t.tags.amenity !== 'ferry_terminal') continue;
  const p = where(t);
  if (p && inBox(p) && !terminals.some((q) => Math.hypot(q.x - p[0], q.z - p[1]) < 100)) terminals.push({ name: nameOf(t.tags), x: r1(p[0]), z: r1(p[1]) });
}

const count = <T extends { kind: string }>(l: T[]) => Object.fromEntries([...new Set(l.map((x) => x.kind))].map((k) => [k, l.filter((x) => x.kind === k).length]));
const counts = {
  farms: count(farms),
  landmarks: count(landmarks),
  shore: Object.fromEntries([...new Set(shore.map((s) => s.surface))].map((k) => [k, shore.filter((s) => s.surface === k).length])),
  cliffs: cliffs.length,
  farmland: farmland.length,
  names: count(names),
  fogSignals: fogSignals.length,
  wrecks: wrecks.length,
  cables: count(cables),
  overhead: overhead.length,
  overheadWithClearance: overhead.filter((o) => o.clearance !== null).length,
  ferryRoutes: ferryRoutes.length,
  ferryTerminals: terminals.length,
};
// ── Bridges over the sea, and follies (landmarks and bridges pass) ──
// A road or railway marked as a bridge whose line runs at least `bridgeWater` m over the sea:
// its deck line, width, name and structure (from its own tags, or the bridge's outline mapped
// round it: Connel Bridge's says cantilever). The same crossing mapped twice (a road and an old
// railway on one deck, the approaches) is kept once, the longest over the water.
const wetLength = (l: XZ[]) => {
  let wet = 0;
  for (let i = 1; i < l.length; i++) {
    const [a, b] = [l[i - 1], l[i]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let s = 1; s < len; s += 2) if (isWet([a[0] + ((b[0] - a[0]) * s) / len, a[1] + ((b[1] - a[1]) * s) / len])) wet += 2;
  }
  return wet;
};
const inRing = (ring: XZ[], [x, z]: XZ) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};
const bridgeOutlines = things.filter((t) => t.tags.man_made === 'bridge' && t.kind !== 'node').flatMap((t) => t.lines.filter((l) => l.length > 3).map((l) => ({ tags: t.tags, ring: l })));
const bridgeCandidates: { name: string; structure: string; carries: string; width: number; path: XZ[]; wet: number }[] = [];
for (const t of things) {
  const g = t.tags;
  if (t.kind !== 'way' || !g.bridge || g.bridge === 'no' || !(g.highway || g.railway)) continue;
  const l = t.lines[0];
  if (l.length < 2 || !l.some(inBox)) continue;
  const wet = wetLength(l);
  if (wet < T.bridgeWater) continue;
  const mid = middle(l);
  const outline = bridgeOutlines.find((o) => inRing(o.ring, mid));
  const rail = !g.highway && !!g.railway;
  const main = /^(motorway|trunk|primary)/.test(g.highway ?? '');
  const width = Math.max(T.bridgeMinWidth, parseFloat(g.width ?? outline?.tags.width ?? '') || (rail ? T.bridgeWidth.rail : main ? T.bridgeWidth.main : T.bridgeWidth.road));
  bridgeCandidates.push({ name: nameOf(g) || (outline ? nameOf(outline.tags) : ''), structure: g['bridge:structure'] ?? outline?.tags['bridge:structure'] ?? (g.bridge === 'viaduct' ? 'arch' : 'beam'), carries: rail ? 'rail' : 'road', width, path: simplify(l, 1), wet });
}
bridgeCandidates.sort((a, b) => b.wet - a.wet);
const bridges: typeof bridgeCandidates = [];
for (const c of bridgeCandidates) {
  const m = middle(c.path);
  if (bridges.some((b) => Math.hypot(middle(b.path)[0] - m[0], middle(b.path)[1] - m[1]) < 40)) continue;
  bridges.push(c);
}
// Follies drawn as buildings (McCaig's Tower above Oban): their footprint, for a model made to it.
const follies: { name: string; outline: XZ[]; height: number | null }[] = [];
for (const t of things) {
  if (t.tags.historic !== 'folly' || !t.tags.building || t.kind === 'node') continue;
  const ring = t.lines.filter((l) => l.length > 3).sort((a, b) => area(b) - area(a))[0];
  if (!ring || !inBox(middle(ring)) || span(ring) < T.follyMinSpan) continue;
  follies.push({ name: nameOf(t.tags), outline: simplify(ring, 0.5), height: heightOf(t.tags) });
}

// Gantry cranes over a building dock (Perno, Turku): the map draws their track as an area.
// Its long side is the way the gantry runs; across it, the span between the rails. `count`
// gantries share the track. Only the big ones (a span of `gantryMinSpan` m or more).
/** An area's box along its longest edge: its middle, the bearing of that edge (deg, 0-180), its length along it and width across. */
function edgeBox(ring: XZ[]): { x: number; z: number; yawDeg: number; length: number; width: number } {
  let best = [0, 0];
  let bestLen = 0;
  for (let i = 1; i < ring.length; i++) {
    const d = [ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]];
    const l = Math.hypot(d[0], d[1]);
    if (l > bestLen) [best, bestLen] = [[d[0] / l, d[1] / l], l];
  }
  const along = ring.map(([x, z]) => x * best[0] + z * best[1]);
  const across = ring.map(([x, z]) => -x * best[1] + z * best[0]);
  const [a0, a1, c0, c1] = [Math.min(...along), Math.max(...along), Math.min(...across), Math.max(...across)];
  const [ma, mc] = [(a0 + a1) / 2, (c0 + c1) / 2];
  return { x: ma * best[0] - mc * best[1], z: ma * best[1] + mc * best[0], yawDeg: Math.round(((Math.atan2(best[0], -best[1]) * 180) / Math.PI + 360) % 180), length: Math.round(a1 - a0), width: Math.round(c1 - c0) };
}
const gantries: { name: string; x: number; z: number; yawDeg: number; length: number; span: number; count: number }[] = [];
// A shipyard's building docks (for the yard's ships under construction: package.ts `yardShips`).
const drydocks: { name: string; x: number; z: number; yawDeg: number; length: number; width: number }[] = [];
for (const t of things) {
  if (t.kind === 'node') continue;
  const crane = t.tags.man_made === 'crane' && t.tags['crane:type'] === 'gantry_crane';
  const dock = t.tags.waterway === 'dock' && t.tags.dock === 'drydock';
  if (!crane && !dock) continue;
  const ring = t.lines.filter((l) => l.length > 3).sort((a, b) => area(b) - area(a))[0];
  if (!ring || !inBox(middle(ring))) continue;
  const b = edgeBox(ring);
  if (dock) drydocks.push({ name: nameOf(t.tags), ...b });
  else if (b.width >= T.gantryMinSpan) gantries.push({ name: nameOf(t.tags), x: b.x, z: b.z, yawDeg: b.yawDeg, length: b.length, span: b.width, count: Math.max(1, Number.parseInt(t.tags.count ?? '1', 10) || 1) });
}
const out = { farms, landmarks, bridges: bridges.map(({ wet: _wet, ...b }) => b), follies, gantries, drydocks, shore, cliffs, farmland, names, fogSignals, wrecks, cables, overhead, ferries: { routes: ferryRoutes, terminals }, counts };
writeFileSync(join(D.out, 'features.json'), JSON.stringify(out));

// Thin data, said plainly in the report (the milestones that use it have little to work with).
const reportPath = join(D.out, 'report.json');
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const thin: string[] = [];
if (!fogSignals.length) thin.push('features: no fog signals mapped (C5 foghorns: none here)');
if (!wrecks.length) thin.push('features: no wrecks mapped (C6: none here)');
if (overhead.length && !counts.overheadWithClearance) thin.push(`features: ${overhead.length} power-line spans over the water, none with a clearance tagged (C6: no strike rule for them)`);
report.features = counts;
report.warnings = [...(report.warnings ?? []).filter((w: string) => !w.startsWith('features:')), ...thin];
writeFileSync(reportPath, JSON.stringify(report, null, 1));
console.log(`features: ${JSON.stringify(counts)}`);

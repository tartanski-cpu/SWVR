/**
 * Stage 10, package: the region in the game's own shapes (world/defs.ts RegionDef), for the
 * game to load as a region. Writes src/world/regions/<id>.coast.json (a chunked region:
 * public/regions/<id>/package.json, fetched when its Voyage map is chosen), in the region's local
 * metres (x east, z south, about the box's centre); the game places it in its world
 * (world/coastRegion.ts) and fetches the terrain (public/regions/<id>/terrain.bin) at start.
 *
 *   Kit        harbours.json's blocks (a pontoon as a low pier, a breakwater as a quay box),
 *              buildings, slipways (the game's (x, z) is the middle of the slip's top edge).
 *   Ports      every harbour with berths, and the anchorage: a cargo berth and its stack on
 *              the deck, a fuel berth at the bigger harbours (fixed faces first, of the
 *              `berthsPerPort` nearest its middle), a lamp and the berths' flood light, trade
 *              from the request's `economy`. Only those two berths are named: the game makes
 *              a berth at every face with water by itself (world/berths.ts).
 *   Sea        the marks (buoys and beacons with a game kind), the lights (one colour each:
 *              the game has no sector lights yet, so a sector light shows white), the race
 *              zones, shelter round each harbour by its fetch, fishing and potting grounds
 *              for the request's fish, the region's landmarks (its highest named summit and
 *              its tallest lighthouse).
 *   Terrain    where terrain.bin keeps what, the chunks, the box; the credits and licence.
 *
 * Run: node src/package.ts [requestId] (last, after mesh, trees, boats, features and shore).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, dirs, latin, loadRequest, nameOf, projection, slug } from './common.ts';
import { addCoastChunk, coastHeight, coastTerrain, registerChunkedCoast, registerCoastTerrain } from '../../../src/world/coastTerrain.ts';

const T = {
  berthsPerPort: 10,
  /** A berth faces the way a request asks (`berthFacing`) within this (deg); the cargo and fuel berths at least `namedApart` m apart. */
  facingTolerance: 30,
  namedApart: 30,
  /** A bridge's deck stands at least this high over the sea (m), whatever the ground at its ends. */
  bridgeMinDeck: 6,
  /** A cargo or fuel berth wants this much deck behind its face (m): room to step ashore
   * (the game puts you 2 m in): a pontoon (2.5 m) has; a narrower walkway's berths aren't chosen. */
  namedDeck: 2.4,
  /**
   * A named berth must have room for a whole boat: clear water this far either way along the
   * face from the berth (m: the biggest boats are about 14 m long, and a margin) and out to
   * `berthBeam` m from it. Checked every 2 m against the land and the other piers.
   */
  berthClear: 11,
  berthBeam: 5,
  /** Port colours for cargo bound there (the game's palette style). */
  colours: [0x3f7fd0, 0xd06a2f, 0x2f9a5a, 0xc8a030, 0x9a3fb0, 0x30a8b8, 0xb83040, 0x7a8a30, 0x606870],
  /** Fishing grounds: depth range by species (m), radius (m), kept this far from harbours and each other (m). */
  grounds: { mackerel: [15, 60], haddock: [30, 120], cod: [20, 80], pollack: [10, 40] } as Record<string, [number, number]>,
  groundRadius: 350,
  groundClear: 900,
  /** Potting grounds: rocky water this deep (m) round the skerries and points. */
  potDepth: [6, 25] as [number, number],
};

const req = loadRequest(process.argv[2]);
const D = dirs(req.id);
const P = projection(req.bbox);
const read = (f: string) => JSON.parse(readFileSync(join(D.out, f), 'utf8'));
const region = read('region.json');
// The region's ground as the game will have it (its mesh, through the game's own lookup,
// src/world/coastTerrain.ts): the named berths are checked against it, not the coarser
// 10 m grid. A chunked region's chunks are read as the checks need them.
const ab = (f: string) => {
  const b = readFileSync(join(D.out, f));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
if (region.terrain.chunked) registerChunkedCoast(req.id, ab(region.terrain.coarse.file), region.terrain, region.box, 0, 0);
else registerCoastTerrain(req.id, ab(region.terrain.file), { ...region.terrain, chunks: region.chunks }, region.box, 0, 0);
const meshHeight = (x: number, z: number): number => {
  const t = coastTerrain(req.id)!;
  if (t.chunked) {
    const k = t.chunked.chunks.findIndex((c: { x0: number; z0: number; size: number }) => x >= c.x0 && x < c.x0 + c.size && z >= c.z0 && z < c.z0 + c.size);
    if (k >= 0 && !t.pieces.has(k)) addCoastChunk(req.id, k, ab(t.chunked.chunks[k].file));
  }
  return coastHeight(x, z) ?? -40;
};
const nav = read('nav.json');
const hb = read('harbours.json');
const grid = JSON.parse(readFileSync(join(D.work, 'grid.json'), 'utf8'));
const rd = (name: string, Ctor: Float32ArrayConstructor | Uint8ArrayConstructor) => {
  const b = readFileSync(join(D.work, name));
  return new Ctor(b.buffer, b.byteOffset, b.byteLength / Ctor.BYTES_PER_ELEMENT);
};
const heights = rd('heights.bin', Float32Array) as Float32Array;
const land = rd('land.bin', Uint8Array) as Uint8Array;
const osm = JSON.parse(readFileSync(join(D.raw, 'osm.json'), 'utf8'));
const cellOf = (x: number, z: number) => {
  const i = Math.floor((x - grid.x0) / grid.cell);
  const j = Math.floor((z - grid.z0) / grid.cell);
  return i < 0 || j < 0 || i >= grid.width || j >= grid.height ? -1 : j * grid.width + i;
};
const hAt = (x: number, z: number) => {
  const k = cellOf(x, z);
  return k < 0 ? -40 : heights[k];
};
const isLand = (x: number, z: number) => {
  const k = cellOf(x, z);
  return k >= 0 && land[k] === 1;
};
const r1 = (v: number) => Math.round(v * 10) / 10;
const box = region.box;
/** Away from the box's faded edges (m). */
const interior = (x: number, z: number, m: number) => x > box.x0 + m && x < box.x1 - m && z > box.z0 + m && z < box.z1 - m;
const warnings: string[] = [];

// ── Kit ──
const blocks = hb.blocks.map((b: { kind: string; x: number; z: number; halfLength: number; halfWidth: number; yawDeg: number; top: number; fendered: boolean }) => ({
  kind: b.kind === 'quay' || b.kind === 'breakwater' ? 'quay' : 'pier',
  x: r1(b.x),
  z: r1(b.z),
  halfLength: r1(b.halfLength),
  halfWidth: r1(b.halfWidth),
  yawDeg: Math.round(b.yawDeg),
  top: b.top,
  fendered: b.kind === 'pontoon' ? false : b.fendered, // a pontoon has a rubbing strip, not fenders
}));
// Piers drawn over each other at different deck heights (the coast extras plan, C1): the
// game stands you on the higher (geography.ts blockTop), but the map is worth a look (Rothesay's
// start spot had a low pier inside the harbour pier's outline). Sampled every 2 m over each
// block; reported once a pair, by the nearest harbour, when they share at least 40 m².
type Box = { x: number; z: number; halfLength: number; halfWidth: number; yawDeg: number; top: number };
const insideBox = (o: Box, x: number, z: number) => {
  const a = (o.yawDeg * Math.PI) / 180;
  const dx = x - o.x;
  const dz = z - o.z;
  return Math.abs(dx * Math.sin(a) - dz * Math.cos(a)) <= o.halfLength && Math.abs(dx * Math.cos(a) + dz * Math.sin(a)) <= o.halfWidth;
};
const overlaps: string[] = [];
for (let i = 0; i < blocks.length; i++) {
  const A: Box = blocks[i];
  const a = (A.yawDeg * Math.PI) / 180;
  const [ux, uz, vx, vz] = [Math.sin(a), -Math.cos(a), Math.cos(a), Math.sin(a)];
  for (let j = i + 1; j < blocks.length; j++) {
    const B: Box = blocks[j];
    if (Math.abs(A.top - B.top) < 0.3 || Math.hypot(A.x - B.x, A.z - B.z) > Math.hypot(A.halfLength, A.halfWidth) + Math.hypot(B.halfLength, B.halfWidth)) continue;
    // The overlap's area (m², 2 m samples), and where it is: a pontoon's end resting on a quay's
    // edge is a few square metres and normal; a pier inside another's outline is much more.
    let n = 0;
    let at: [number, number] = [0, 0];
    for (let l = -A.halfLength; l <= A.halfLength; l += 2)
      for (let w = -A.halfWidth; w <= A.halfWidth; w += 2) {
        const x = A.x + ux * l + vx * w;
        const z = A.z + uz * l + vz * w;
        if (insideBox(B, x, z)) {
          n++;
          at = [at[0] + x, at[1] + z];
        }
      }
    if (n * 4 < 40) continue;
    const hit: [number, number] = [at[0] / n, at[1] / n];
    const h = (hb.harbours as { id: string; x: number; z: number }[]).reduce((p, q) => (Math.hypot(q.x - hit[0], q.z - hit[1]) < Math.hypot(p.x - hit[0], p.z - hit[1]) ? q : p));
    overlaps.push(`overlapping piers at ${h.id} (${Math.round(hit[0])}, ${Math.round(hit[1])}): decks ${Math.max(A.top, B.top)} m and ${Math.min(A.top, B.top)} m over ${n * 4} m²`);
  }
}
warnings.push(...overlaps);
const blockOf = new Map<string, { kind: string; halfWidth: number }>();
for (const b of hb.blocks) blockOf.set(b.source, blockOf.get(b.source) ?? b);
// The buildings for the game's house kit (world/view/houseKit.ts): what harbours.ts worked
// out, less its own bookkeeping (where it came from, its ground).
const buildings = hb.buildings.map(({ source: _s, base: _b, tagged: _t, ...b }: Record<string, unknown>) => b);

// ── Ports ──
type HB = { id: string; name: string; kind: string; x: number; z: number; berths: number; fetch: number; role?: string };
type Berth = { id: string; source: string; x: number; z: number; headingDeg: number; shoreX: number; shoreZ: number; shoreDist: number; deckY: number; deckW?: number };
const harbours = (hb.harbours as HB[]).filter((h) => h.berths > 0 || h.kind === 'anchorage');
const near = (h: HB, b: Berth) => Math.hypot(b.x - h.x, b.z - h.z);
const ports: object[] = [];
const berths: object[] = [];
const lamps: object[] = [];
const portFloods: object[] = [];
const shelters: object[] = [];
/** A spot on the deck behind a berth: `back` m in from the face (kept on a narrow pontoon). */
const onDeck = (b: Berth, back: number) => {
  const w = blockOf.get(b.source)?.halfWidth ?? 3;
  const d = b.shoreDist + Math.min(back, w);
  return { x: r1(b.x + b.shoreX * d), z: r1(b.z + b.shoreZ * d) };
};
// Each harbour's own berths: those whose piece is one of its pieces.
const pieceOf = new Map<string, string>();
for (const h of hb.harbours) for (const p of h.pieces ?? []) pieceOf.set(p, h.id);
type KitBlock = { x: number; z: number; halfLength: number; halfWidth: number; yawDeg: number };
const insideBlock = (k: KitBlock, x: number, z: number) => {
  const a = (k.yawDeg * Math.PI) / 180;
  const dx = x - k.x;
  const dz = z - k.z;
  return Math.abs(dx * Math.sin(a) - dz * Math.cos(a)) < k.halfLength && Math.abs(dx * Math.cos(a) + dz * Math.sin(a)) < k.halfWidth;
};
/**
 * Inside a kit block other than the ones the berth lies against (those under a point just
 * inside its face)? (Not "other than its own pier": a pier drawn as one line is several
 * boxes, and an L-shaped one's arm can stand right across a berth on its stem.)
 */
const inOtherBlock = (x: number, z: number, b: Berth) => {
  const fx = b.x + b.shoreX * (b.shoreDist + 0.5);
  const fz = b.z + b.shoreZ * (b.shoreDist + 0.5);
  return (hb.blocks as KitBlock[]).some((k) => !insideBlock(k, fx, fz) && insideBlock(k, x, z));
};
/**
 * How much of a boat's berth is blocked: of the points every 2 m along the face from
 * `berthClear` m one way to as far the other, at the berth and out to `berthBeam` m from the
 * face, those where the ground (the game's mesh) stands above the water, or inside another
 * pier. 0: a whole boat fits.
 */
const blocked = (b: Berth) => {
  const ax = -b.shoreZ;
  const az = b.shoreX;
  let n = 0;
  for (let s = -T.berthClear; s <= T.berthClear; s += 2)
    for (const out of [0, T.berthBeam - b.shoreDist]) {
      const x = b.x + ax * s - b.shoreX * out;
      const z = b.z + az * s - b.shoreZ * out;
      if (meshHeight(x, z) > -0.3 || inOtherBlock(x, z, b)) n++;
    }
  return n;
};
const roomRank = (b: Berth) => {
  const n = blocked(b);
  return n === 0 ? 0 : n <= 2 ? 1 : 2;
};
harbours.forEach((h, n) => {
  // (Not on a deck too narrow to step ashore and stack goods on: a walkway's berths are moorings, not a port's.)
  const own = (hb.berths as Berth[]).filter((b) => pieceOf.get(b.source) === h.id && (b.deckW ?? Infinity) >= T.namedDeck);
  // Room for a whole boat first (no bow on the rocks), then fixed faces (cargo wants a quay
  // or a pier) before pontoons, then nearest the harbour's middle.
  const rank = new Map(own.map((b) => [b, roomRank(b)]));
  own.sort((a, b) => rank.get(a)! - rank.get(b)! || Number(blockOf.get(a.source)?.kind === 'pontoon') - Number(blockOf.get(b.source)?.kind === 'pontoon') || near(h, a) - near(h, b));
  const pick = own.slice(0, T.berthsPerPort);
  const color = T.colours[n % T.colours.length];
  const economy = req.economy?.[h.id];
  if (h.kind === 'anchorage') {
    // The goods wait on the nearest low shore.
    let stack = { x: h.x, z: h.z };
    let best = Infinity;
    for (let r = 50; r < 1500 && best === Infinity; r += 25)
      for (let a = 0; a < 48; a++) {
        const x = h.x + Math.cos((a * Math.PI) / 24) * r;
        const z = h.z + Math.sin((a * Math.PI) / 24) * r;
        const g = hAt(x, z);
        if (isLand(x, z) && g > 1 && g < 6 && r < best) (best = r), (stack = { x: r1(x), z: r1(z) });
      }
    ports.push({ id: h.id, name: h.name, kind: 'anchorage', x: h.x, z: h.z, clearRadius: 50, cargo: { anchorage: { x: h.x, z: h.z, radius: 120 }, stackX: stack.x, stackZ: stack.z, stackYawDeg: 0, color }, bottom: 'mud', ...(economy ? { economy } : {}) });
    shelters.push({ x: h.x, z: h.z, rIn: 150, rOut: 400, factor: Math.min(0.6, Math.max(0.2, h.fetch / 2500)) });
    portFloods.push({ portId: h.id, x: stack.x, y: hAt(stack.x, stack.z) + 6, z: stack.z });
    return;
  }
  if (!pick.length) {
    if ((hb.berths as Berth[]).some((b) => pieceOf.get(b.source) === h.id)) warnings.push(`${h.id}: its berths are all on decks under ${T.namedDeck} m wide: not a port`);
    return;
  }
  // No berth with room for a boat (a drying pier, say): drawn, but not a port the game sends work to.
  if (rank.get(pick[0]) === 2) {
    warnings.push(`${h.id}: no berth with room for a boat (best blocked at ${blocked(pick[0])} points): not a port`);
    return;
  }
  let cargo = pick[0];
  let fuel = h.kind === 'harbour' && pick.length > 1 ? pick[1] : null;
  // The request can ask for the cargo berth on a face looking a given way (`berthFacing`:
  // Oban's on the North Pier's south-west side, open to the bay, not in the corner of its
  // arms): the fixed face with the most such berths with room for a whole boat, at its middle
  // (room either side). The fuel berth stays as it would be, unless that's within `namedApart`.
  const wanted = req.berthFacing?.[h.id];
  if (wanted !== undefined) {
    const facing = (b: Berth) => Math.abs(((((Math.atan2(-b.shoreX, b.shoreZ) * 180) / Math.PI - wanted) % 360) + 540) % 360 - 180) <= T.facingTolerance;
    const ok = own.filter((b) => rank.get(b) === 0 && facing(b) && blockOf.get(b.source)?.kind !== 'pontoon');
    const bySource = new Map<string, Berth[]>();
    for (const b of ok) bySource.set(b.source, [...(bySource.get(b.source) ?? []), b]);
    const run = [...bySource.values()].sort((a, b) => b.length - a.length)[0];
    if (run) {
      // Along the face (square to the way it looks), and its middle berth.
      const ax = -run[0].shoreZ;
      const az = run[0].shoreX;
      run.sort((a, b) => a.x * ax + a.z * az - (b.x * ax + b.z * az));
      cargo = run[Math.floor(run.length / 2)];
      if (fuel) fuel = [pick[1], ...pick.slice(2), pick[0]].find((b) => b !== cargo && Math.hypot(b.x - cargo.x, b.z - cargo.z) >= T.namedApart) ?? null;
    } else warnings.push(`${h.id}: no berth with room facing ${wanted}°: its cargo berth as before`);
  }
  const stack = onDeck(cargo, 3);
  const pump = fuel ? onDeck(fuel, 1.2) : null;
  const ax = r1(pick.reduce((s, b) => s + b.x, 0) / pick.length);
  const az = r1(pick.reduce((s, b) => s + b.z, 0) / pick.length);
  ports.push({
    id: h.id,
    name: h.name,
    kind: h.kind === 'harbour' ? 'harbour' : 'pier',
    x: ax,
    z: az,
    ...(fuel && pump ? { fuel: { x: fuel.x, z: fuel.z, radius: 14, pumpX: pump.x, pumpZ: pump.z } } : {}),
    clearRadius: h.kind === 'harbour' ? 150 : 70,
    cargo: { berth: { x: cargo.x, z: cargo.z, radius: 16 }, stackX: stack.x, stackZ: stack.z, stackYawDeg: cargo.headingDeg, color },
    ...(economy ? { economy } : {}),
  });
  // The named berths: cargo and fuel (the game makes a berth at every face with water by
  // itself, world/berths.ts; these are where things happen, marked yellow on the deck).
  for (const [b, role] of [[cargo, 'cargo'], [fuel, 'fuel']] as [Berth | null, string][]) {
    if (b) berths.push({ id: `${h.id}-${role}`, portId: h.id, name: `${h.name} (${role})`, x: b.x, z: b.z, headingDeg: b.headingDeg, shoreX: b.shoreX, shoreZ: b.shoreZ, shoreDist: b.shoreDist, deckY: b.deckY });
  }
  lamps.push({ x: stack.x, z: stack.z, y: cargo.deckY + 5.5 });
  portFloods.push({ portId: h.id, x: stack.x, y: cargo.deckY + 8, z: stack.z });
  // Shelter: the more open water a harbour looks across, the less it is sheltered.
  shelters.push({ x: ax, z: az, rIn: 80, rOut: 220, factor: Math.min(0.7, Math.max(0.15, h.fetch / 2500)) });
});
const portIds = new Set((ports as { id: string }[]).map((p) => p.id));
const nearestPort = (x: number, z: number) => (ports as { id: string; x: number; z: number }[]).reduce((a, p) => (Math.hypot(p.x - x, p.z - z) < Math.hypot(a.x - x, a.z - z) ? p : a));

const slipways = (hb.slipways as { x: number; z: number; headingDeg: number; width: number; length: number; top: number; slope: number; name: string }[]).map((s, i) => {
  const a = (s.headingDeg * Math.PI) / 180;
  // The game's (x, z) is the middle of the slip's top edge (ashore).
  const tx = s.x + (Math.sin(a) * s.length) / 2;
  const tz = s.z - (Math.cos(a) * s.length) / 2;
  const port = nearestPort(tx, tz);
  return { id: `${req.id}-slip-${i + 1}`, portId: port.id, name: s.name || `${(ports as { id: string; name: string }[]).find((p) => p.id === port.id)!['name']} slipway`, x: r1(tx), z: r1(tz), headingDeg: s.headingDeg, width: s.width, length: s.length, top: s.top, slope: Math.max(0.05, s.slope) };
});

// ── Sea ──
const marks = (nav.marks as { name: string; gameKind: string | null; category: string; x: number; z: number }[])
  .filter((m) => m.gameKind)
  .map((m, i) => ({ name: m.name || `${m.category} No ${i + 1}`, kind: m.gameKind, x: m.x, z: m.z }));
const COLOUR: Record<string, 'red' | 'green' | 'white'> = { red: 'red', green: 'green' };
const lights = (nav.lights as { name: string; x: number; z: number; height?: number; period?: number; sectors: { colour: string; from?: number }[]; label: string; on: string }[])
  .filter((l) => l.on !== 'buoy') // a buoy's light is the mark's own (the game lights its marks)
  .map((l) => {
    const sectored = l.sectors.some((s) => s.from !== undefined);
    const colour = sectored ? 'white' : COLOUR[l.sectors[0]?.colour] ?? 'white';
    const ground = Math.max(0, hAt(l.x, l.z));
    return { name: `${l.name || 'Light'} ${l.label}`, x: l.x, z: l.z, y: r1(Math.max(ground + 4, l.height ?? ground + 6)), color: colour, period: l.label.startsWith('F') && !l.label.startsWith('Fl') ? 0 : l.period ?? 4, tower: l.on === 'lighthouse' ? 'lighthouse' : 'post' };
  });
// ── Fish farms and the skyline (the coast extras plan, C2; from features.ts) ──
// A farm's mapped outline is its lease. Its smallest enclosing rectangle (tried along each of
// the outline's edges) holds, `farmInset` m in from its edges: for a fish farm, cage rings
// in a grid (as the Fjord's, FarmDef: 12 m rings 32 m apart, up to 2 rows of 6); for a
// shellfish farm, or one whose kind isn't mapped, rows of mussel long-lines (floats on a line,
// 25 m apart, up to 6). (A kind not mapped is drawn as the lines, the plainer of the two:
// cages would claim a salmon farm the map doesn't say is there.) At each corner a yellow
// special mark with its light, Fl Y 5s: farms are marked so, though the map doesn't chart
// the marks themselves.
const F = existsSync(join(D.out, 'features.json')) ? JSON.parse(readFileSync(join(D.out, 'features.json'), 'utf8')) : null;
const farmInset = 30;
function leaseRect(o: [number, number][]) {
  let best: { a: number; x: number; z: number; L: number; W: number } | null = null;
  for (let i = 0; i + 1 < o.length; i++) {
    const a = Math.atan2(o[i + 1][0] - o[i][0], -(o[i + 1][1] - o[i][1]));
    const [ux, uz, vx, vz] = [Math.sin(a), -Math.cos(a), Math.cos(a), Math.sin(a)];
    const us = o.map(([x, z]) => x * ux + z * uz);
    const vs = o.map(([x, z]) => x * vx + z * vz);
    const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
    const L = u1 - u0;
    const W = v1 - v0;
    if (!best || L * W < best.L * best.W) {
      const um = (u0 + u1) / 2;
      const vm = (v0 + v1) / 2;
      // The long side along the farm's bearing.
      best = L >= W ? { a, x: um * ux + vm * vx, z: um * uz + vm * vz, L, W } : { a: a + Math.PI / 2, x: um * ux + vm * vx, z: um * uz + vm * vz, L: W, W: L };
    }
  }
  return best!;
}
const farms: object[] = [];
const farmLights: object[] = [];
for (const f of (F?.farms ?? []) as { name: string; kind: string; outline: [number, number][] }[]) {
  if (f.outline.length < 3) continue;
  const r = leaseRect(f.outline);
  const [ux, uz, vx, vz] = [Math.sin(r.a), -Math.cos(r.a), Math.cos(r.a), Math.sin(r.a)];
  const L = Math.max(10, r.L - 2 * farmInset);
  const W = Math.max(0, r.W - 2 * farmInset);
  const name = f.name || (f.kind === 'fish' ? 'Fish farm' : f.kind === 'shellfish' ? 'Mussel farm' : 'Marine farm');
  const yawDeg = Math.round(((r.a * 180) / Math.PI + 360) % 360);
  const corners = [-1, 1].flatMap((su) => [-1, 1].map((sv) => [r1(r.x + ux * su * (r.L / 2) + vx * sv * (r.W / 2)), r1(r.z + uz * su * (r.L / 2) + vz * sv * (r.W / 2))]));
  if (f.kind === 'fish') {
    const spacing = 32;
    const cols = Math.max(1, Math.min(6, Math.floor(L / spacing) + 1));
    const rows = Math.max(1, Math.min(2, Math.floor(W / spacing) + 1));
    // FarmDef's x, z is its first ring; the grid runs along the bearing and across to the right.
    const x = r.x - ux * ((cols - 1) * spacing) / 2 - vx * ((rows - 1) * spacing) / 2;
    const z = r.z - uz * ((cols - 1) * spacing) / 2 - vz * ((rows - 1) * spacing) / 2;
    farms.push({ name, kind: 'cages', x: r1(x), z: r1(z), yawDeg, rows, cols, spacing, ringRadius: 12, corners });
  } else {
    const spacing = 25;
    const rows = Math.max(1, Math.min(6, Math.floor(W / spacing) + 1));
    const x = r.x - ux * (L / 2) - vx * ((rows - 1) * spacing) / 2;
    const z = r.z - uz * (L / 2) - vz * ((rows - 1) * spacing) / 2;
    farms.push({ name, kind: 'lines', x: r1(x), z: r1(z), yawDeg, rows, cols: 1, spacing, ringRadius: 0, lineLength: Math.round(L), corners });
  }
  for (const [x, z] of corners) farmLights.push({ name: `${name} Fl Y 5s`, x, z, y: 1.6, color: 'yellow', period: 5, tower: 'none' });
}
// The skyline: what stands up against the sky from the sea. Lighthouses are drawn from the
// lights already; a church the house kit builds (its building in the package) isn't drawn twice.
const kitChurch = (x: number, z: number) => buildings.some((b: { kind?: string; x: number; z: number }) => b.kind === 'church' && Math.hypot(b.x - x, b.z - z) < 40);
const skyline = ((F?.landmarks ?? []) as { kind: string; name: string; x: number; z: number; height: number | null; size: number }[])
  .filter((l) => l.kind !== 'lighthouse' && !(l.kind === 'church' && kitChurch(l.x, l.z)))
  .map((l) => ({ kind: l.kind, name: l.name, x: l.x, z: l.z, ...(l.height ? { height: l.height } : {}), ...(l.size ? { size: l.size } : {}) }));
const skylineStyle = req.theme;
// Bridges over the sea and follies (the landmarks and bridges pass; features.ts). A bridge's
// deck stands level with the higher of the ground at its two ends (its abutments), at least
// `bridgeMinDeck` m over the sea. A folly stands on the lowest ground round its footprint
// (its walls reach down to it).
const bridges = ((F?.bridges ?? []) as { name: string; structure: string; carries: string; width: number; path: [number, number][] }[]).map((b) => {
  const [a, e] = [b.path[0], b.path[b.path.length - 1]];
  return { ...b, deck: r1(Math.max(T.bridgeMinDeck, hAt(a[0], a[1]), hAt(e[0], e[1]))) };
});
const follies = ((F?.follies ?? []) as { name: string; outline: [number, number][]; height: number | null }[]).map((f) => ({
  name: f.name,
  outline: f.outline,
  base: r1(Math.min(...f.outline.map(([x, z]) => hAt(x, z)))),
  ...(f.height ? { height: f.height } : {}),
}));
// Ferries (the coast extras plan, C7): each mapped ferry route, cut to the map (its longest
// stretch `ferryMargin` m inside the box's edge), each end a terminal where she berths (an
// end of the route inside the map, named from the nearest ferry terminal or port) or the
// map's edge, where she sails in from beyond or out of sight. Her class: a passenger launch
// (a foot-passenger route), a small double-ended car ferry (a crossing under `smallRoute` m
// in all), or a large ro-ro ferry. Her livery by who runs her (the map's operator) and the
// region: a Clyde or Hebridean ferry's colours (the owner's choice), another company's own
// (the game's), the Aegean's. Her name invented, from the theme's list (no real ship's).
const ferryMargin = 150;
const smallRoute = 8000;
const FERRY_NAMES: Record<string, string[]> = {
  'north-hebridean': ['Morvern Star', 'Sruth na Mara', 'Ardlamont', 'Glen Eacharn', 'Kilbrannan', 'Ceann Loch', 'Dun Leathan', 'Sgarbh Mor', 'Tobar Ban', 'Ardnadrochit'],
  // Invented Finnish and Swedish names (both are spoken in the archipelago), no real ship's.
  baltic: ['Luotoranta', 'Holmvik', 'Kallioniemi', 'Havsbris', 'Skärvind', 'Ulapanlaine', 'Kuutamo', 'Lokinsiipi', 'Saarenkulma', 'Fjärdstjärna', 'Kivikko', 'Sundholm'],
  aegean: ['Galini', 'Meltemi', 'Thalassopouli', 'Kyma', 'Ostria', 'Aigaio Star', 'Levantes', 'Pelagia', 'Kalimera', 'Glaros', 'Zefyros', 'Anemoni'],
};
type Ferry = { name: string; operator: string; foot: boolean; path: [number, number][] };
const ferryRoutes: object[] = [];
{
  const inside = ([x, z]: [number, number]) => interior(x, z, ferryMargin);
  const len = (p: [number, number][]) => p.reduce((t, q, i) => (i ? t + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0), 0);
  const terminals = (F?.ferries?.terminals ?? []) as { name: string; x: number; z: number }[];
  const portNames = (ports as { name: string; x: number; z: number }[]).map((p) => ({ name: p.name.replace(/ (pier|harbour|marina)$/i, ''), x: p.x, z: p.z }));
  const names = FERRY_NAMES[req.theme] ?? FERRY_NAMES['north-hebridean'];
  const places = (F?.names ?? []) as { name: string; x: number; z: number }[];
  for (const [n, r] of ((F?.ferries?.routes ?? []) as Ferry[]).entries()) {
    // The longest run of the route inside the map.
    let best: [number, number][] = [];
    let run: [number, number][] = [];
    for (const p of [...r.path, null]) {
      if (p && inside(p)) run.push(p);
      else {
        if (len(run) > len(best)) best = run;
        run = [];
      }
    }
    if (best.length < 2 || len(best) < 300) continue;
    // Naming the ends: the route's own name's first and last parts ("Craighouse - Tayvallich")
    // go one to each end, whichever way round puts each nearer a port, terminal or place of
    // its name (letters only, any case: "Hunters Quay" is "Hunter's Quay"); an end at the map's
    // edge always takes the part its terminal end didn't. A one-part name ("Isle of Kerrera
    // Ferry"): each terminal end takes the nearest named ferry terminal or port.
    const key = (x: string) => x.toLowerCase().replace(/[^a-z]/g, '');
    const parts = r.name.split(/ - | to /).map((x) => x.replace(/\s*\(.*\)$/, '').trim()).filter(Boolean);
    const known = [...terminals.filter((t) => t.name), ...portNames, ...places];
    const distTo = (part: string, p: [number, number]) => Math.min(Infinity, ...known.filter((k) => key(k.name).length > 2 && (key(k.name).includes(key(part)) || key(part).includes(key(k.name)))).map((k) => Math.hypot(k.x - p[0], k.z - p[1])));
    const docks = [best[0] === r.path[0], best[best.length - 1] === r.path[r.path.length - 1]];
    const pts = [best[0], best[best.length - 1]];
    const nearestNamed = (p: [number, number]) => {
      const near = [...terminals.filter((t) => t.name), ...portNames].sort((a, b) => Math.hypot(a.x - p[0], a.z - p[1]) - Math.hypot(b.x - p[0], b.z - p[1]))[0];
      return near && Math.hypot(near.x - p[0], near.z - p[1]) < 800 ? near.name : '';
    };
    let endNames: string[];
    if (parts.length >= 2) {
      const [pa, pb] = [parts[0], parts[parts.length - 1]];
      // The pairing's cost: only the terminal ends count (an edge end is wherever she's bound).
      const cost = (n0: string, n1: string) => (docks[0] ? Math.min(distTo(n0, pts[0]), 1e6) : 0) + (docks[1] ? Math.min(distTo(n1, pts[1]), 1e6) : 0);
      endNames = cost(pa, pb) <= cost(pb, pa) ? [pa, pb] : [pb, pa];
    } else endNames = pts.map((p, i) => (docks[i] ? nearestNamed(p) : parts[0] ?? ''));
    const ends = [0, 1].map((i) => ({ dock: docks[i], name: endNames[i] ?? '' }));
    const op = r.operator;
    const livery = req.theme === 'aegean' ? 'aegean' : /caledonian macbrayne|calmac/i.test(op) ? 'calmac' : 'other';
    const cls = r.foot ? 'launch' : len(r.path) < smallRoute ? 'small' : 'large';
    ferryRoutes.push({ id: `${req.id}-ferry-${n + 1}`, name: r.name, ship: names[n % names.length], cls, livery, path: best.map(([x, z]) => [r1(x), r1(z)]), ends, length: Math.round(len(best)) });
  }
}
// Place names for the charts and the radio (the coast extras plan, C4): the map's towns,
// villages, hamlets, islands, islets and the sea's own names (bays, headlands, straits),
// ranked as features.ts ranks them (1 shown farthest out). Farms, single houses and town
// quarters are left out: a chart doesn't print them.
const PLACE_KINDS = new Set(['city', 'town', 'village', 'hamlet', 'suburb', 'island', 'islet', 'archipelago', 'sea', 'bay', 'cape', 'strait', 'peninsula', 'locality']);
const places = ((F?.names ?? []) as { name: string; kind: string; x: number; z: number; rank: number }[]).filter((n) => PLACE_KINDS.has(n.kind));

// Whirls (the game's `knocks`) only where the request gives them: a real race needn't have whirlpools (owner, Oct 2026: the Falls of Lora don't).
const currents = (nav.currents as { id: string; name: string; x: number; z: number; length: number; width: number; setDeg: number; peakKn: number; periodH: number; whirls?: number }[]).map((c) => ({ id: c.id, name: c.name, x: c.x, z: c.z, length: c.length, width: c.width, setDeg: c.setDeg, peakKn: c.peakKn, periodH: c.periodH, phaseH: 0, waveFactor: 1.6, knocks: c.whirls ?? 0 }));

// Fishing grounds: open water of the species' depth, clear of harbours and each other.
const fishingGrounds: object[] = [];
const taken: [number, number][] = (ports as { x: number; z: number }[]).map((p) => [p.x, p.z]);
for (const sp of req.fish ?? []) {
  const range = T.grounds[sp];
  if (!range) continue;
  let best: { x: number; z: number; score: number } | null = null;
  for (let z = box.z0 + 600; z < box.z1 - 600; z += 150)
    for (let x = box.x0 + 600; x < box.x1 - 600; x += 150) {
      const d = -hAt(x, z);
      if (d < range[0] || d > range[1] || taken.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < T.groundClear)) continue;
      // Room: open water all round the ground.
      if ([0, 1, 2, 3, 4, 5].some((k) => isLand(x + Math.cos((k * Math.PI) / 3) * T.groundRadius, z + Math.sin((k * Math.PI) / 3) * T.groundRadius))) continue;
      const score = -Math.abs(d - (range[0] + range[1]) / 2);
      if (!best || score > best.score) best = { x, z, score };
    }
  if (!best) {
    if (!['lobster', 'crab', 'prawn'].includes(sp)) warnings.push(`no fishing ground found for ${sp}`);
    continue;
  }
  taken.push([best.x, best.z]);
  fishingGrounds.push({ name: `${sp[0].toUpperCase()}${sp.slice(1)} ground`, x: best.x, z: best.z, radius: T.groundRadius, richness: 1.1, species: sp });
}
// Potting grounds: round the skerries, in rocky water of the right depth.
const pottingGrounds = (nav.hazards as { name: string; kind: string; x: number; z: number }[])
  .filter((hz) => interior(hz.x, hz.z, 500))
  .map((hz, i) => {
    let at = { x: hz.x, z: hz.z };
    for (let a = 0; a < 16; a++) {
      const x = hz.x + Math.cos((a * Math.PI) / 8) * 90;
      const z = hz.z + Math.sin((a * Math.PI) / 8) * 90;
      const d = -hAt(x, z);
      if (d >= T.potDepth[0] && d <= T.potDepth[1]) {
        at = { x: r1(x), z: r1(z) };
        break;
      }
    }
    return { id: `${req.id}-pots-${i + 1}`, name: hz.name ? `${hz.name}` : `Skerry ${i + 1}`, x: at.x, z: at.z, radius: 60, quality: 0.8 };
  });

// Landmarks: the highest named summit; the tallest lighthouse.
const peaks = Object.entries(osm.nodeTags as Record<string, Record<string, string>>)
  .filter(([id, t]) => t.natural === 'peak' && t.name && osm.nodes[id])
  .map(([id, t]) => {
    const [x, z] = P.fwd(osm.nodes[id][0], osm.nodes[id][1]);
    return { name: nameOf(t), x: r1(x), z: r1(z), h: hAt(x, z) };
  })
  .filter((p) => interior(p.x, p.z, 600))
  .sort((a, b) => b.h - a.h);
const landmarks: object[] = [];
if (peaks[0]) landmarks.push({ name: peaks[0].name, kind: 'hill', x: peaks[0].x, z: peaks[0].z, height: Math.round(peaks[0].h) });
const lighthouse = (lights as { name: string; x: number; z: number; y: number; tower: string }[]).filter((l) => l.tower === 'lighthouse').sort((a, b) => b.y - a.y)[0];
if (lighthouse) landmarks.push({ name: lighthouse.name, kind: 'lighthouse', x: lighthouse.x, z: lighthouse.z, height: lighthouse.y });

// ── Write ──
const pkg = {
  format: 'swvr-coast-package/1',
  id: req.id,
  name: req.name,
  /** Where the terrain is, relative to the game's public folder, and how terrain.bin is laid out. */
  terrain: req.chunked ? { dir: `regions/${req.id}/`, ...region.terrain } : { dir: `regions/${req.id}/`, ...region.terrain, chunks: region.chunks },
  box,
  /** Its box in degrees (lon/lat min, max): the game's latitude and longitude on this map (world/coastGeo.ts) invert the pipeline's projection about its middle. */
  bbox: req.bbox,
  /** The forest map (trees.ts), for the game's trees; absent if the trees stage hasn't run. */
  ...(existsSync(join(D.out, 'trees.json')) ? { trees: JSON.parse(readFileSync(join(D.out, 'trees.json'), 'utf8')) } : {}),
  /** The harbour boats' moorings and anchor spots and the theme's boat mix (boats.ts); absent if that stage hasn't run. */
  /**
   * Everything else from the map the later milestones use (features.ts: farms, landmarks, the
   * shore, names, fog signals, wrecks, cables, ferries): where its file is and what it holds.
   * Fetched by the game when it needs it, like the forest map, so the package (built into the
   * game for the smaller maps) stays small. Absent if that stage hasn't run.
   */
  ...(existsSync(join(D.out, 'features.json')) ? { features: { file: 'features.json', counts: JSON.parse(readFileSync(join(D.out, 'features.json'), 'utf8')).counts } } : {}),
  /** What the shore is made of (shore.ts): its map's layout, for the game (a bow-ramp boat may beach on sand or shingle). Absent if that stage hasn't run. */
  ...(existsSync(join(D.out, 'shore.json')) ? { shore: (({ counts: _c, mappedCells: _m, steepCells: _s, offshoreCells: _o, fieldCells: _f, ...l }) => l)(JSON.parse(readFileSync(join(D.out, 'shore.json'), 'utf8'))) } : {}),
  ...(existsSync(join(D.out, 'boats.json')) ? { boats: (({ counts: _c, ...b }) => b)(JSON.parse(readFileSync(join(D.out, 'boats.json'), 'utf8'))) } : {}),
  credits: region.credits,
  licence: region.licence,
  landmarks,
  blocks,
  buildings,
  marks,
  lights: [...lights, ...farmLights],
  farms,
  skyline,
  skylineStyle,
  bridges,
  follies,
  places,
  ferries: ferryRoutes,
  shelters,
  ports,
  berths,
  slipways,
  lamps,
  portFloods,
  pottingGrounds,
  fishingGrounds,
  currents,
};
// A chunked region (Voyage mode only) is fetched by the game when its map is chosen, so it
// sits with its terrain in public/, not in the game's code (which Career mode loads whole).
const out = req.chunked ? join(D.out, 'package.json') : join(ROOT, '..', '..', 'src', 'world', 'regions', `${req.id}.coast.json`);
writeFileSync(out, JSON.stringify(pkg));
const reportPath = join(D.out, 'report.json');
const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : {};
report.package = { ports: ports.length, berths: berths.length, blocks: blocks.length, buildings: buildings.length, marks: marks.length, lights: lights.length, slipways: slipways.length, fishingGrounds: fishingGrounds.length, pottingGrounds: pottingGrounds.length, landmarks: landmarks.map((l) => (l as { name: string }).name), bytes: JSON.stringify(pkg).length };
report.warnings = [...(report.warnings ?? []).filter((w: string) => !/fishing ground|not a port|^overlapping piers/.test(w)), ...warnings];
writeFileSync(reportPath, JSON.stringify(report, null, 1));
console.log(`package: ${ports.length} ports (${[...portIds].join(', ')}), ${berths.length} berths, ${blocks.length} blocks, ${buildings.length} buildings, ${marks.length} marks, ${lights.length} lights, ${slipways.length} slipways, ${fishingGrounds.length} fishing grounds, ${pottingGrounds.length} potting grounds; landmarks ${report.package.landmarks.join(', ')}; ${(report.package.bytes / 1000).toFixed(0)} kB`);
for (const w of warnings) console.log(`warning: ${w}`);

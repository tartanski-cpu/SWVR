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
 * Run: node src/package.ts [requestId] (last, after mesh).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, dirs, latin, loadRequest, nameOf, projection, slug } from './common.ts';

const T = {
  berthsPerPort: 10,
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
const blockOf = new Map<string, { kind: string; halfWidth: number }>();
for (const b of hb.blocks) blockOf.set(b.source, blockOf.get(b.source) ?? b);
const buildings = hb.buildings.map((b: { x: number; z: number; width: number; depth: number; height: number; yawDeg: number; wall: number; roof: number; cladding: string }) => ({
  x: b.x,
  z: b.z,
  width: b.width,
  depth: b.depth,
  height: b.height,
  yawDeg: b.yawDeg,
  wall: b.wall,
  roof: b.roof,
  cladding: b.cladding,
}));

// ── Ports ──
type HB = { id: string; name: string; kind: string; x: number; z: number; berths: number; fetch: number; role?: string };
type Berth = { id: string; source: string; x: number; z: number; headingDeg: number; shoreX: number; shoreZ: number; shoreDist: number; deckY: number };
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
harbours.forEach((h, n) => {
  const own = (hb.berths as Berth[]).filter((b) => pieceOf.get(b.source) === h.id);
  // Fixed faces first (cargo wants a quay or a pier), then the pontoons; spread along.
  own.sort((a, b) => Number(blockOf.get(a.source)?.kind === 'pontoon') - Number(blockOf.get(b.source)?.kind === 'pontoon') || near(h, a) - near(h, b));
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
  if (!pick.length) return;
  const cargo = pick[0];
  const fuel = h.kind === 'harbour' && pick.length > 1 ? pick[1] : null;
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
const currents = (nav.currents as { id: string; name: string; x: number; z: number; length: number; width: number; setDeg: number; peakKn: number; periodH: number }[]).map((c) => ({ id: c.id, name: c.name, x: c.x, z: c.z, length: c.length, width: c.width, setDeg: c.setDeg, peakKn: c.peakKn, periodH: c.periodH, phaseH: 0, waveFactor: 1.6, knocks: 3 }));

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
  credits: region.credits,
  licence: region.licence,
  landmarks,
  blocks,
  buildings,
  marks,
  lights,
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
report.warnings = [...(report.warnings ?? []).filter((w: string) => !/fishing ground/.test(w)), ...warnings];
writeFileSync(reportPath, JSON.stringify(report, null, 1));
console.log(`package: ${ports.length} ports (${[...portIds].join(', ')}), ${berths.length} berths, ${blocks.length} blocks, ${buildings.length} buildings, ${marks.length} marks, ${lights.length} lights, ${slipways.length} slipways, ${fishingGrounds.length} fishing grounds, ${pottingGrounds.length} potting grounds; landmarks ${report.package.landmarks.join(', ')}; ${(report.package.bytes / 1000).toFixed(0)} kB`);
for (const w of warnings) console.log(`warning: ${w}`);

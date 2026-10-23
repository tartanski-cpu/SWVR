/**
 * Stage 6, navigation: OpenSeaMap's seamarks (seamark:* tags in OpenStreetMap) as the
 * game's marks and lights, charted hazards, fish farms, and the hand-placed current zones
 * from the region request (tidal races are in no open dataset).
 *
 *   Marks     every buoy and beacon (lateral, cardinal, isolated danger, safe water,
 *             special): its category, shape, colours and topmark as tagged, its light if
 *             it has one, and the game kind it maps to (port / stbd / N E S W / isolated;
 *             none for safe-water and special marks, which the game hasn't yet).
 *   Lights    every light, on its own or on a lighthouse or beacon: the character (Fl,
 *             Fl(2), Q, VQ, Iso, Oc, LFl, Q+LFl ...), colour, period, group, the sequence
 *             if tagged, height and range, and sectors (seamark:light:1:..., :2: ...: each
 *             a colour over an arc of bearings seen from seaward), so the viewer and the
 *             game can show a sector light's red, white and green.
 *   Hazards   rocks, reefs and wrecks (seamark:type rock / wreck / obstruction,
 *             natural=rock / reef, historic=wreck) that lie in the sea; and the skerries:
 *             islets (place=islet) and bare rock (natural=bare_rock) under 150 m across,
 *             which a coastline mesh can shrink or lose, so the game can stand them up.
 *   Farms     marine farms (seamark:type=marine_farm areas).
 *   Currents  the request's zones: the polygon in local metres, plus the oriented
 *             rectangle along its set the game's current zones use (CurrentZoneDef).
 *
 * Writes public/regions/<id>/nav.json and adds its warnings (thin data, a zone over land)
 * to report.json. Run: node src/nav.ts [requestId] (after reconcile; before harbours and mesh).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dirs, latin, loadRequest, nameOf, projection } from './common.ts';

const req = loadRequest(process.argv[2]);
const D = dirs(req.id);
const P = projection(req.bbox);
const osm = JSON.parse(readFileSync(join(D.raw, 'osm.json'), 'utf8')) as {
  nodes: Record<string, [number, number]>;
  nodeTags: Record<string, Record<string, string>>;
  ways: Record<string, { nodes: number[]; tags: Record<string, string> }>;
};
const grid = JSON.parse(readFileSync(join(D.work, 'grid.json'), 'utf8'));
const landBuf = readFileSync(join(D.work, 'land.bin'));
const heightsBuf = readFileSync(join(D.work, 'heights.bin'));
const heights = new Float32Array(heightsBuf.buffer, heightsBuf.byteOffset, heightsBuf.byteLength / 4);
const isLand = (x: number, z: number) => {
  const i = Math.floor((x - grid.x0) / grid.cell);
  const j = Math.floor((z - grid.z0) / grid.cell);
  if (i < 0 || j < 0 || i >= grid.width || j >= grid.height) return false;
  return landBuf[j * grid.width + i] === 1;
};
const depthAt = (x: number, z: number) => {
  const i = Math.max(0, Math.min(grid.width - 1, Math.floor((x - grid.x0) / grid.cell)));
  const j = Math.max(0, Math.min(grid.height - 1, Math.floor((z - grid.z0) / grid.cell)));
  return heights[j * grid.width + i];
};
/** Is there sea within r metres of (x, z)? (Tells a sea skerry from a rock on a hillside.) */
const hasSeaNear = (x: number, z: number, r: number) => {
  for (let a = 0; a < 16; a++) if (!isLand(x + Math.cos((a * Math.PI) / 8) * r, z + Math.sin((a * Math.PI) / 8) * r)) return true;
  return false;
};
const r1 = (v: number) => Math.round(v * 10) / 10;
const inBox = (x: number, z: number) => x >= P.x0 && x <= P.x1 && z >= P.z0 && z <= P.z1;

export interface LightSector {
  colour: string;
  /** Arc of bearings FROM SEAWARD toward the light (deg), as charted; absent: all round. */
  from?: number;
  to?: number;
}
export interface Light {
  name: string;
  x: number;
  z: number;
  /** Height of the light above the water (m), if tagged. */
  height?: number;
  /** Nominal range (nautical miles), if tagged. */
  range?: number;
  character: string;
  group?: string;
  period?: number;
  /** On/off seconds, "0.6+(1),0.6+(3.8)" as tagged: on 0.6, off 1, on 0.6, off 3.8. */
  sequence?: string;
  sectors: LightSector[];
  /** The chart's abbreviation, e.g. "Fl(2)WRG.6s". */
  label: string;
  on: 'lighthouse' | 'beacon' | 'buoy' | 'light';
}

/** A light from a feature's seamark:light:* (and :1:, :2: ... sectors) tags; null if it has none. */
function lightOf(t: Record<string, string>, x: number, z: number, name: string, on: Light['on']): Light | null {
  const keys = Object.keys(t).filter((k) => k.startsWith('seamark:light:'));
  if (!keys.length) return null;
  const numbered = [...new Set(keys.map((k) => k.split(':')[2]).filter((p) => /^\d+$/.test(p)))].sort((a, b) => Number(a) - Number(b));
  const get = (n: string | null, k: string) => t[n ? `seamark:light:${n}:${k}` : `seamark:light:${k}`];
  const first = numbered[0] ?? null;
  const character = get(first, 'character') ?? get(null, 'character') ?? 'F';
  const sectors: LightSector[] = numbered.length
    ? numbered.map((n) => {
        const s: LightSector = { colour: get(n, 'colour') ?? 'white' };
        const a = get(n, 'sector_start');
        const b = get(n, 'sector_end');
        if (a !== undefined && b !== undefined) ((s.from = Number(a)), (s.to = Number(b)));
        return s;
      })
    : [{ colour: get(null, 'colour') ?? 'white' }];
  const period = Number(get(first, 'period') ?? get(null, 'period'));
  const group = get(first, 'group') ?? get(null, 'group');
  const height = Number(get(first, 'height') ?? get(null, 'height'));
  const range = Number(get(first, 'range') ?? get(null, 'range'));
  const cols = [...new Set(sectors.map((s) => ({ white: 'W', red: 'R', green: 'G', yellow: 'Y', blue: 'Bu' })[s.colour] ?? s.colour[0].toUpperCase()))].join('');
  const label = `${character}${group ? `(${group})` : ''}${cols}${Number.isFinite(period) && period > 0 ? `.${period}s` : ''}`;
  return {
    name,
    x: r1(x),
    z: r1(z),
    ...(Number.isFinite(height) ? { height } : {}),
    ...(Number.isFinite(range) ? { range } : {}),
    character,
    ...(group ? { group } : {}),
    ...(Number.isFinite(period) && period > 0 ? { period } : {}),
    ...(get(first, 'sequence') ?? get(null, 'sequence') ? { sequence: get(first, 'sequence') ?? get(null, 'sequence') } : {}),
    sectors,
    label,
    on,
  };
}

/** The game's mark kind for a buoy or beacon, if it has one. */
function gameKind(type: string, t: Record<string, string>): string | null {
  if (type.endsWith('_lateral')) {
    const c = t[`seamark:${type}:category`];
    return c === 'port' || c === 'preferred_channel_port' ? 'port' : c === 'starboard' || c === 'preferred_channel_starboard' ? 'stbd' : null;
  }
  if (type.endsWith('_cardinal')) return ({ north: 'N', east: 'E', south: 'S', west: 'W' } as Record<string, string>)[t[`seamark:${type}:category`]] ?? null;
  if (type.endsWith('_isolated_danger')) return 'isolated';
  return null;
}

/** Where a way is: the middle of its nodes (a lighthouse's footprint, a farm). */
function wayCentre(w: { nodes: number[] }): [number, number] | null {
  const pts = w.nodes.map((n) => osm.nodes[n]).filter(Boolean);
  if (!pts.length) return null;
  const lon = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return P.fwd(lon, lat);
}

const marks: object[] = [];
const lights: Light[] = [];
const hazards: object[] = [];
const farms: object[] = [];
const features: { t: Record<string, string>; x: number; z: number; outline?: [number, number][] }[] = [];
for (const [id, t] of Object.entries(osm.nodeTags)) {
  const p = osm.nodes[id];
  if (!p) continue;
  const [x, z] = P.fwd(p[0], p[1]);
  features.push({ t, x, z });
}
for (const w of Object.values(osm.ways)) {
  const c = wayCentre(w);
  if (!c) continue;
  features.push({ t: w.tags, x: c[0], z: c[1], outline: w.nodes.map((n) => osm.nodes[n]).filter(Boolean).map(([lon, lat]) => P.fwd(lon, lat)) });
}
const lightAt = new Set<string>();
for (const f of features) {
  const { t, x, z } = f;
  if (!inBox(x, z)) continue;
  const type = t['seamark:type'];
  const name = t['seamark:name'] ? latin(t['seamark:name']) : nameOf(t);
  if (type && /^(buoy|beacon)_/.test(type)) {
    const kind = type.replace(/^(buoy|beacon)_/, '');
    const light = lightOf(t, x, z, name, type.startsWith('buoy') ? 'buoy' : 'beacon');
    marks.push({
      name,
      type,
      category: t[`seamark:${type}:category`] ?? kind,
      shape: t[`seamark:${type}:shape`] ?? null,
      colour: t[`seamark:${type}:colour`] ?? null,
      pattern: t[`seamark:${type}:colour_pattern`] ?? null,
      topmark: t['seamark:topmark:shape'] ?? null,
      gameKind: gameKind(type, t),
      x: r1(x),
      z: r1(z),
      depth: r1(depthAt(x, z)),
      ...(light ? { light: light.label } : {}),
    });
    if (light) (lights.push(light), lightAt.add(`${Math.round(x)},${Math.round(z)}`));
    continue;
  }
  if (type === 'light_major' || type === 'light_minor' || t.man_made === 'lighthouse' || type === 'landmark') {
    const light = lightOf(t, x, z, name, t.man_made === 'lighthouse' ? 'lighthouse' : 'light');
    // A lighthouse mapped twice (its building as a way, its light as a node): keep the light.
    if (light && !lightAt.has(`${Math.round(x)},${Math.round(z)}`)) (lights.push(light), lightAt.add(`${Math.round(x)},${Math.round(z)}`));
    continue;
  }
  if (type === 'rock' || type === 'wreck' || type === 'obstruction' || t.natural === 'rock' || t.natural === 'reef' || t.historic === 'wreck') {
    if (isLand(x, z)) continue; // a rock ashore (a standing stone, a crag) is no hazard to a boat
    hazards.push({ name, kind: type ?? t.natural ?? 'wreck', x: r1(x), z: r1(z), depth: r1(depthAt(x, z)), category: t[`seamark:${type}:category`] ?? null, waterLevel: t[`seamark:${type}:water_level`] ?? null });
    continue;
  }
  // Skerries: small islets and bare rocks. Keep them small (a 150 m cap) so a whole island
  // mapped as place=islet isn't counted; a skerry the land mask missed is the one that matters.
  if (t.place === 'islet' || t.natural === 'bare_rock') {
    const o = f.outline && f.outline.length > 2 ? f.outline : null;
    const across = o ? Math.max(...o.map(([a, b]) => Math.hypot(a - x, b - z))) * 2 : 0;
    if (across > 150) continue;
    if (depthAt(x, z) > 3) continue; // an islet in a freshwater loch (lochs are land here, standing at their surface)
    // Mapped twice (a node and an outline): keep the first.
    if (hazards.some((h) => Math.hypot((h as { x: number }).x - x, (h as { z: number }).z - z) < 40)) continue;
    if (t.natural === 'bare_rock' && !o && isLand(x, z)) continue; // a crag ashore
    if (t.natural === 'bare_rock' && o && isLand(x, z) && !hasSeaNear(x, z, across / 2 + 30)) continue;
    hazards.push({ name, kind: 'skerry', x: r1(x), z: r1(z), depth: r1(depthAt(x, z)), radius: r1(Math.max(8, across / 2)), drawn: isLand(x, z) });
    continue;
  }
  if (type === 'marine_farm' && f.outline) farms.push({ name, category: t['seamark:marine_farm:category'] ?? null, outline: f.outline.map(([a, b]) => [r1(a), r1(b)]) });
}

// Current zones: the polygon, and the oriented rectangle along the set that holds it.
const warnings: string[] = [];
const currents = (req.currentZones ?? []).map((zone) => {
  const poly = zone.polygon.map(([lon, lat]) => P.fwd(lon, lat));
  const a = (zone.direction * Math.PI) / 180;
  const ux = Math.sin(a);
  const uz = -Math.cos(a);
  const along = poly.map(([x, z]) => x * ux + z * uz);
  const across = poly.map(([x, z]) => x * -uz + z * ux);
  const l0 = Math.min(...along);
  const l1 = Math.max(...along);
  const c0 = Math.min(...across);
  const c1 = Math.max(...across);
  const ml = (l0 + l1) / 2;
  const mc = (c0 + c1) / 2;
  const cx = ml * ux + mc * -uz;
  const cz = ml * uz + mc * ux;
  // How much of it is water (sampled on a 10 m lattice inside the rectangle).
  let wet = 0;
  let all = 0;
  for (let s = l0; s <= l1; s += 10)
    for (let c = c0; c <= c1; c += 10) {
      all++;
      if (!isLand(s * ux + c * -uz, s * uz + c * ux)) wet++;
    }
  if (wet / all < 0.7) warnings.push(`current zone "${zone.name}" is ${Math.round((100 * wet) / all)} % water: check its polygon`);
  return {
    id: zone.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: zone.name,
    polygon: poly.map(([x, z]) => [r1(x), r1(z)]),
    x: r1(cx),
    z: r1(cz),
    length: r1(l1 - l0),
    width: r1(c1 - c0),
    setDeg: zone.direction,
    peakKn: zone.peakKts,
    periodH: zone.periodHours,
    whirls: zone.whirls ?? 0,
    waterShare: Math.round((100 * wet) / all) / 100,
  };
});

if (!hazards.some((h) => (h as { kind: string }).kind !== 'skerry')) warnings.push('no charted rocks, reefs or wrecks in the sea in OpenStreetMap for this box, only skerries (thin data: check a chart)');
if (marks.length < 5) warnings.push(`only ${marks.length} buoys or beacons mapped (thin data?)`);
const nav = { marks, lights, hazards, farms, currents };
writeFileSync(join(D.out, 'nav.json'), JSON.stringify(nav, null, 1));
// Point region.json at it (the mesh stage does this too, when it writes region.json).
const regionFile = join(D.out, 'region.json');
if (existsSync(regionFile)) {
  const region = JSON.parse(readFileSync(regionFile, 'utf8'));
  region.nav = 'nav.json';
  writeFileSync(regionFile, JSON.stringify(region, null, 1));
}
const reportFile = join(D.out, 'report.json');
const report = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, 'utf8')) : { warnings: [] };
report.nav = { marks: marks.length, lights: lights.length, hazards: hazards.length, farms: farms.length, currents: currents.length };
report.warnings = [...(report.warnings ?? []).filter((w: string) => !/current zone|charted rocks|buoys or beacons/.test(w)), ...warnings];
writeFileSync(reportFile, JSON.stringify(report, null, 1));
console.log(`nav: ${marks.length} marks, ${lights.length} lights, ${hazards.length} hazards, ${farms.length} farms, ${currents.length} current zones`);
for (const w of warnings) console.log(`warning: ${w}`);
for (const l of lights) console.log(`  light ${l.name || '(unnamed)'} ${l.label} on ${l.on}${l.sectors.length > 1 ? ` (${l.sectors.length} sectors)` : ''}`);

/**
 * Stage 1, fetch: everything the region needs, downloaded once and cached under
 * data/raw/<id>/ (git-ignored), so later stages re-run offline.
 *
 *   OpenStreetMap   the main API's map call, in tiles of 0.05 degrees (it refuses big boxes
 *                   and the public Overpass servers are blocked from the cloud environment);
 *                   coastline, harbours, seamarks, buildings, land use: everything in the box
 *   Copernicus DEM  GLO-30 (~30 m land heights), read straight from the cloud GeoTIFF on AWS
 *   ESA WorldCover  10 m land cover (2021), likewise
 *   EMODnet         European bathymetry (~115 m), from its web coverage service
 *
 * Each raster is saved as <name>.bin (Float32, row 0 at the north edge) and <name>.json (its
 * size and where it lies in lon/lat). sources.yaml records what was fetched, when, under what
 * licence. Run: node src/fetch.ts [requestId]. Add --force to fetch again.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fromUrl } from 'geotiff';
import { dirs, loadRequest, sleep } from './common.ts';

const req = loadRequest(process.argv[2]?.startsWith('--') ? undefined : process.argv[2]);
const force = process.argv.includes('--force');
const D = dirs(req.id);
const [lonA, latA, lonB, latB] = req.bbox;
const UA = { 'User-Agent': 'WorkboatWorld-coast-pipeline/0.1 (offline region builder; github.com/tartanski-cpu/SWVR)' };
const sources: { what: string; source: string; licence: string; fetched: string; detail?: string }[] = [];
const now = new Date().toISOString().slice(0, 10);

export interface RasterMeta {
  width: number;
  height: number;
  /** lon/lat of the top-left corner of the top-left pixel, and the pixel size (deg; dlat positive, rows go south). */
  lon0: number;
  lat0: number;
  dlon: number;
  dlat: number;
  noData?: number | null;
}

function saveRaster(name: string, data: ArrayLike<number>, meta: RasterMeta): void {
  writeFileSync(join(D.raw, `${name}.bin`), Buffer.from(Float32Array.from(data).buffer));
  writeFileSync(join(D.raw, `${name}.json`), JSON.stringify(meta, null, 1));
}

/**
 * Windows of one or more cloud GeoTIFF tiles covering the box (with a margin of a few
 * pixels), joined into one raster when the box crosses a tile edge (the tiles share a pixel
 * size: Copernicus GLO-30's longitude spacing changes only at 50 and 60 degrees north).
 */
async function cogWindow(name: string, urls: string[], margin = 4): Promise<void> {
  if (!force && existsSync(join(D.raw, `${name}.bin`))) return console.log(`${name}: cached`);
  const parts: { band: ArrayLike<number>; meta: RasterMeta }[] = [];
  for (const url of urls) parts.push(await cogPart(url, margin));
  if (parts.length === 1) {
    saveRaster(name, parts[0].band, parts[0].meta);
    console.log(`${name}: ${parts[0].meta.width} x ${parts[0].meta.height} px at ${(parts[0].meta.dlon * 3600).toFixed(2)}" x ${(parts[0].meta.dlat * 3600).toFixed(2)}"`);
    return;
  }
  const { dlon, dlat, noData } = parts[0].meta;
  for (const p of parts) if (Math.abs(p.meta.dlon - dlon) > 1e-12 || Math.abs(p.meta.dlat - dlat) > 1e-12) throw new Error(`${name}: tiles of different pixel sizes`);
  const lon0 = Math.min(...parts.map((p) => p.meta.lon0));
  const lat0 = Math.max(...parts.map((p) => p.meta.lat0));
  const width = Math.round((Math.max(...parts.map((p) => p.meta.lon0 + p.meta.width * dlon)) - lon0) / dlon);
  const height = Math.round((lat0 - Math.min(...parts.map((p) => p.meta.lat0 - p.meta.height * dlat))) / dlat);
  const out = new Float32Array(width * height).fill(noData ?? -9999);
  for (const p of parts) {
    const ox = Math.round((p.meta.lon0 - lon0) / dlon);
    const oy = Math.round((lat0 - p.meta.lat0) / dlat);
    for (let j = 0; j < p.meta.height; j++) for (let i = 0; i < p.meta.width; i++) out[(oy + j) * width + ox + i] = p.band[j * p.meta.width + i];
  }
  saveRaster(name, out, { width, height, lon0, lat0, dlon, dlat, noData });
  console.log(`${name}: ${width} x ${height} px from ${parts.length} tiles at ${(dlon * 3600).toFixed(2)}" x ${(dlat * 3600).toFixed(2)}"`);
}

/** One tile's window over the box. */
async function cogPart(url: string, margin: number): Promise<{ band: ArrayLike<number>; meta: RasterMeta }> {
  const tiff = await fromUrl(url, { headers: UA });
  const img = await tiff.getImage();
  const [minX, minY, maxX, maxY] = img.getBoundingBox();
  const W = img.getWidth();
  const H = img.getHeight();
  const dlon = (maxX - minX) / W;
  const dlat = (maxY - minY) / H;
  const px0 = Math.max(0, Math.floor((lonA - minX) / dlon) - margin);
  const px1 = Math.min(W, Math.ceil((lonB - minX) / dlon) + margin);
  const py0 = Math.max(0, Math.floor((maxY - latB) / dlat) - margin);
  const py1 = Math.min(H, Math.ceil((maxY - latA) / dlat) + margin);
  const [band] = (await img.readRasters({ window: [px0, py0, px1, py1] })) as unknown as ArrayLike<number>[];
  return { band, meta: { width: px1 - px0, height: py1 - py0, lon0: minX + px0 * dlon, lat0: maxY - py0 * dlat, dlon, dlat, noData: img.getGDALNoData() } };
}

async function fetchOsm(): Promise<void> {
  const file = join(D.raw, 'osm.json');
  if (!force && existsSync(file)) return console.log('osm: cached');
  const step = 0.05;
  const nodes = new Map<number, [number, number]>();
  const nodeTags = new Map<number, Record<string, string>>();
  const ways = new Map<number, { nodes: number[]; tags: Record<string, string> }>();
  const relations = new Map<number, { members: { type: string; ref: number; role: string }[]; tags: Record<string, string> }>();
  const tagsOf = (body: string) => {
    const t: Record<string, string> = {};
    for (const m of body.matchAll(/<tag k="([^"]*)" v="([^"]*)"\/>/g)) t[decode(m[1])] = decode(m[2]);
    return t;
  };
  // One tile: from the cache, or the API. A tile the API refuses as too busy (a town: it
  // serves at most 50,000 nodes a call) is split in four, and so on down.
  const tiles: string[] = [];
  const fetchTile = async (lo0: number, la0: number, lo1: number, la1: number): Promise<void> => {
    const b = [lo0, la0, lo1, la1].map((v) => v.toFixed(5)).join(',');
    const cache = join(D.raw, `osm-${b}.xml`);
    if (!force && existsSync(cache)) return void tiles.push(cache);
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${b}`, { headers: UA });
      if (r.ok) {
        writeFileSync(cache, await r.text());
        tiles.push(cache);
        await sleep(1500); // be polite to the main API
        return;
      }
      const msg = await r.text();
      if (r.status === 400 && /too many nodes/i.test(msg)) {
        console.log(`osm ${b}: too busy, splitting`);
        const mlo = (lo0 + lo1) / 2;
        const mla = (la0 + la1) / 2;
        for (const [a, c, d, e] of [[lo0, la0, mlo, mla], [mlo, la0, lo1, mla], [lo0, mla, mlo, la1], [mlo, mla, lo1, la1]]) await fetchTile(a, c, d, e);
        return;
      }
      if (attempt >= 5) throw new Error(`OSM ${b}: HTTP ${r.status} ${msg}`);
      console.log(`osm ${b}: HTTP ${r.status}, waiting`);
      await sleep(5000 * (attempt + 1));
    }
  };
  for (let lon = lonA; lon < lonB - 1e-9; lon += step) for (let lat = latA; lat < latB - 1e-9; lat += step) await fetchTile(lon, lat, Math.min(lon + step, lonB), Math.min(lat + step, latB));
  for (const cache of tiles) {
    {
      const xml = readFileSync(cache, 'utf8');
      for (const m of xml.matchAll(/<node id="(-?\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"[^>]*?(\/>|>([\s\S]*?)<\/node>)/g)) {
        const id = Number(m[1]);
        nodes.set(id, [Number(m[3]), Number(m[2])]);
        if (m[5]) nodeTags.set(id, tagsOf(m[5]));
      }
      for (const m of xml.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
        ways.set(Number(m[1]), { nodes: [...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map((n) => Number(n[1])), tags: tagsOf(m[2]) });
      }
      for (const m of xml.matchAll(/<relation id="(\d+)"[^>]*>([\s\S]*?)<\/relation>/g)) {
        relations.set(Number(m[1]), {
          members: [...m[2].matchAll(/<member type="(\w+)" ref="(\d+)" role="([^"]*)"\/>/g)].map((x) => ({ type: x[1], ref: Number(x[2]), role: x[3] })),
          tags: tagsOf(m[2]),
        });
      }
      console.log(`osm ${cache.replace(/^.*osm-|\.xml$/g, '')}: ${nodes.size} nodes, ${ways.size} ways so far`);
    }
  }
  writeFileSync(
    file,
    JSON.stringify({
      nodes: Object.fromEntries(nodes),
      nodeTags: Object.fromEntries(nodeTags),
      ways: Object.fromEntries(ways),
      relations: Object.fromEntries(relations),
    }),
  );
  console.log(`osm: ${nodes.size} nodes, ${ways.size} ways, ${relations.size} relations`);
}

function decode(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

async function fetchEmodnet(): Promise<void> {
  const name = 'bathymetry';
  if (!force && existsSync(join(D.raw, `${name}.bin`))) return console.log(`${name}: cached`);
  // 1/16 arc-minute: EMODnet's own grid.
  const res = 1 / 960;
  const pad = 2 * res;
  const url = `https://ows.emodnet-bathymetry.eu/wcs?service=WCS&version=1.0.0&request=GetCoverage&coverage=emodnet:mean&crs=EPSG:4326&bbox=${lonA - pad},${latA - pad},${lonB + pad},${latB + pad}&format=image/tiff&resx=${res}&resy=${res}`;
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`EMODnet: HTTP ${r.status}`);
  const buf = await r.arrayBuffer();
  writeFileSync(join(D.raw, `${name}.tif`), Buffer.from(buf));
  const { fromArrayBuffer } = await import('geotiff');
  const img = await (await fromArrayBuffer(buf)).getImage();
  const [minX, minY, maxX, maxY] = img.getBoundingBox();
  const [band] = (await img.readRasters()) as unknown as ArrayLike<number>[];
  saveRaster(name, band, { width: img.getWidth(), height: img.getHeight(), lon0: minX, lat0: maxY, dlon: (maxX - minX) / img.getWidth(), dlat: (maxY - minY) / img.getHeight(), noData: img.getGDALNoData() });
  console.log(`${name}: ${img.getWidth()} x ${img.getHeight()} px`);
}

/** Copernicus GLO-30 (1 degree) and WorldCover (3 degree) tiles are named by their south-west corners; every tile the box touches. */
const ns = (v: number, n: number) => `${v >= 0 ? 'N' : 'S'}${String(Math.abs(v)).padStart(n, '0')}`;
const ew = (v: number, n: number) => `${v >= 0 ? 'E' : 'W'}${String(Math.abs(v)).padStart(n, '0')}`;
const corners = (size: number) => {
  const out: [number, number][] = [];
  for (let la = Math.floor(latA / size) * size; la < latB; la += size) for (let lo = Math.floor(lonA / size) * size; lo < lonB; lo += size) out.push([la, lo]);
  return out;
};
const dems = corners(1).map(([la, lo]) => `Copernicus_DSM_COG_10_${ns(la, 2)}_00_${ew(lo, 3)}_00_DEM`);
const wcs = corners(3).map(([la, lo]) => `ESA_WorldCover_10m_2021_v200_${ns(la, 2)}${ew(lo, 3)}_Map`);
const dem = dems.join(', ');
const wc = wcs.join(', ');

await fetchOsm();
sources.push({ what: 'coastline, harbours, seamarks, buildings, land use', source: 'OpenStreetMap contributors (incl. OpenSeaMap seamarks), api.openstreetmap.org', licence: 'ODbL 1.0', fetched: now });
await cogWindow('dem', dems.map((d) => `https://copernicus-dem-30m.s3.amazonaws.com/${d}/${d}.tif`));
sources.push({ what: 'land height', source: `Copernicus DEM GLO-30 (${dem}), AWS Open Data`, licence: 'Copernicus DEM licence: free use with attribution ("produced using Copernicus WorldDEM-30 (c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA")', fetched: now });
await cogWindow('landcover', wcs.map((w) => `https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/${w}.tif`), 2);
sources.push({ what: 'land cover (colours)', source: `ESA WorldCover 10 m 2021 v200 (${wc})`, licence: 'CC BY 4.0 ("(c) ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium")', fetched: now });
await fetchEmodnet();
sources.push({ what: 'sea depth', source: 'EMODnet Bathymetry DTM (emodnet:mean), ows.emodnet-bathymetry.eu', licence: 'free use with attribution ("EMODnet Bathymetry Consortium")', fetched: now });

const lines = [`# What region "${req.id}" was built from (written by fetch.ts).`, `region: ${req.id}`, `bbox: [${req.bbox.join(', ')}]`, 'sources:'];
for (const s of sources) lines.push(`  - what: ${JSON.stringify(s.what)}`, `    source: ${JSON.stringify(s.source)}`, `    licence: ${JSON.stringify(s.licence)}`, `    fetched: ${s.fetched}`);
writeFileSync(join(D.raw, 'sources.yaml'), lines.join('\n') + '\n');
console.log('done');

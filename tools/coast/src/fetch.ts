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

/** A window of a cloud GeoTIFF covering the box (with a margin of a few pixels). */
async function cogWindow(name: string, url: string, margin = 4): Promise<void> {
  if (!force && existsSync(join(D.raw, `${name}.bin`))) return console.log(`${name}: cached`);
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
  saveRaster(name, band, { width: px1 - px0, height: py1 - py0, lon0: minX + px0 * dlon, lat0: maxY - py0 * dlat, dlon, dlat, noData: img.getGDALNoData() });
  console.log(`${name}: ${px1 - px0} x ${py1 - py0} px at ${(dlon * 3600).toFixed(2)}" x ${(dlat * 3600).toFixed(2)}"`);
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
  for (let lon = lonA; lon < lonB - 1e-9; lon += step) {
    for (let lat = latA; lat < latB - 1e-9; lat += step) {
      const b = [lon, lat, Math.min(lon + step, lonB), Math.min(lat + step, latB)].map((v) => v.toFixed(5)).join(',');
      const cache = join(D.raw, `osm-${b}.xml`);
      let xml: string;
      if (!force && existsSync(cache)) xml = readFileSync(cache, 'utf8');
      else {
        for (let attempt = 0; ; attempt++) {
          const r = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${b}`, { headers: UA });
          if (r.ok) {
            xml = await r.text();
            break;
          }
          if (attempt >= 5) throw new Error(`OSM ${b}: HTTP ${r.status} ${await r.text()}`);
          console.log(`osm ${b}: HTTP ${r.status}, waiting`);
          await sleep(5000 * (attempt + 1));
        }
        writeFileSync(cache, xml);
        await sleep(1500); // be polite to the main API
      }
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
      console.log(`osm ${b}: ${nodes.size} nodes, ${ways.size} ways so far`);
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

/** Copernicus GLO-30 and WorldCover tiles are named by their south-west corner. */
const tileLat = Math.floor(latA);
const tileLon = Math.floor(lonA);
if (Math.floor(latB) !== tileLat || Math.floor(lonB) !== tileLon) throw new Error('the box crosses a 1-degree tile edge: not handled yet');
const ns = (v: number, n: number) => `${v >= 0 ? 'N' : 'S'}${String(Math.abs(v)).padStart(n, '0')}`;
const ew = (v: number, n: number) => `${v >= 0 ? 'E' : 'W'}${String(Math.abs(v)).padStart(n, '0')}`;
const dem = `Copernicus_DSM_COG_10_${ns(tileLat, 2)}_00_${ew(tileLon, 3)}_00_DEM`;
const wcLat = Math.floor(latA / 3) * 3;
const wcLon = Math.floor(lonA / 3) * 3;
const wc = `ESA_WorldCover_10m_2021_v200_${ns(wcLat, 2)}${ew(wcLon, 3)}_Map`;

await fetchOsm();
sources.push({ what: 'coastline, harbours, seamarks, buildings, land use', source: 'OpenStreetMap contributors (incl. OpenSeaMap seamarks), api.openstreetmap.org', licence: 'ODbL 1.0', fetched: now });
await cogWindow('dem', `https://copernicus-dem-30m.s3.amazonaws.com/${dem}/${dem}.tif`);
sources.push({ what: 'land height', source: `Copernicus DEM GLO-30 (${dem}), AWS Open Data`, licence: 'Copernicus DEM licence: free use with attribution ("produced using Copernicus WorldDEM-30 (c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA")', fetched: now });
await cogWindow('landcover', `https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/${wc}.tif`, 2);
sources.push({ what: 'land cover (colours)', source: `ESA WorldCover 10 m 2021 v200 (${wc})`, licence: 'CC BY 4.0 ("(c) ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium")', fetched: now });
await fetchEmodnet();
sources.push({ what: 'sea depth', source: 'EMODnet Bathymetry DTM (emodnet:mean), ows.emodnet-bathymetry.eu', licence: 'free use with attribution ("EMODnet Bathymetry Consortium")', fetched: now });

const lines = [`# What region "${req.id}" was built from (written by fetch.ts).`, `region: ${req.id}`, `bbox: [${req.bbox.join(', ')}]`, 'sources:'];
for (const s of sources) lines.push(`  - what: ${JSON.stringify(s.what)}`, `    source: ${JSON.stringify(s.source)}`, `    licence: ${JSON.stringify(s.licence)}`, `    fetched: ${s.fetched}`);
writeFileSync(join(D.raw, 'sources.yaml'), lines.join('\n') + '\n');
console.log('done');

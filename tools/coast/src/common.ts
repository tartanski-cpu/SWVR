/**
 * Shared bits of the coast pipeline: the region request, where its files go, and the map
 * projection. Offline tooling: none of this runs in the game.
 *
 * Projection: a local east/north grid in metres around the box's centre, in the game's axes
 * (x east, z SOUTH: north is -z). An equirectangular projection about the centre latitude;
 * over a ~12 km box its error is a few centimetres, well under a cell.
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export interface RegionRequest {
  id: string;
  name: string;
  /** [lonMin, latMin, lonMax, latMax] */
  bbox: [number, number, number, number];
  theme: string;
  /** Spine roles: a harbour's name, "auto", or for the anchorage a named spot ({ name, at: [lon, lat] }). */
  spine?: Record<string, string | { name: string; at: [number, number] }>;
  currentZones?: { name: string; polygon: [number, number][]; direction: number; peakKts: number; periodHours: number }[];
  weatherProfile?: string;
  fish?: string[];
  goods?: string[];
  /** The game's trade per harbour id (package.ts): products, needs, repairs. */
  economy?: Record<string, { products?: string[]; needs?: string[]; repairs?: { hull: number; engine: number } }>;
}

export function loadRequest(id = process.argv[2] ?? 'oban'): RegionRequest {
  return yaml.load(readFileSync(join(ROOT, 'requests', `${id}.yaml`), 'utf8')) as RegionRequest;
}

/** Raw downloads (git-ignored, so a region can be rebuilt offline), work files (git-ignored), and the product. */
export function dirs(id: string) {
  const d = { raw: join(ROOT, 'data', 'raw', id), work: join(ROOT, 'data', 'work', id), out: join(ROOT, '..', '..', 'public', 'regions', id) };
  for (const p of Object.values(d)) mkdirSync(p, { recursive: true });
  return d;
}

const R = 6371008.8; // mean Earth radius (m)
const DEG = Math.PI / 180;

export interface Projection {
  lon0: number;
  lat0: number;
  /** lon/lat -> local metres (x east, z south). */
  fwd(lon: number, lat: number): [number, number];
  /** local metres -> lon/lat. */
  inv(x: number, z: number): [number, number];
  /** The box in local metres. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export function projection(bbox: RegionRequest['bbox']): Projection {
  const [lonA, latA, lonB, latB] = bbox;
  const lon0 = (lonA + lonB) / 2;
  const lat0 = (latA + latB) / 2;
  const kx = R * DEG * Math.cos(lat0 * DEG);
  const kz = R * DEG;
  const fwd = (lon: number, lat: number): [number, number] => [(lon - lon0) * kx, -(lat - lat0) * kz];
  const inv = (x: number, z: number): [number, number] => [lon0 + x / kx, lat0 - z / kz];
  const [x0, z1] = fwd(lonA, latA);
  const [x1, z0] = fwd(lonB, latB);
  return { lon0, lat0, fwd, inv, x0, x1, z0, z1 };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

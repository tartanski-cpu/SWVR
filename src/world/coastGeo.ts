/**
 * Latitude and longitude on a coast map (the review, 24 Oct 2026: on the Voyage maps the GPS
 * and the chart gave the career archipelago's made-up positions; Syros read as Scotland).
 * The coast pipeline makes a map's metres from its box in degrees (tools/coast common.ts
 * `projection`): east and south of the box's middle, a degree of longitude `kx` m (the
 * mean Earth radius times the cosine of the middle's latitude), of latitude `kz` m. The game
 * then places the map with its middle at the region's placement (RegionDef.coast x, z).
 * This is that, both ways. Pure.
 */
import type { RegionDef } from './defs';

/** The pipeline's mean Earth radius (m; tools/coast common.ts). */
const R = 6371008.8;
const DEG = Math.PI / 180;

export interface CoastGeo {
  lon0: number;
  lat0: number;
  kx: number;
  kz: number;
  /** Where the box's middle is in the world (m). */
  x: number;
  z: number;
}

/** A coast region's grid (null for a hand-built region, or a package made before it carried its box). */
export function coastGeoOf(region: RegionDef): CoastGeo | null {
  const c = region.coast;
  const b = c?.pkg.bbox;
  if (!c || !b) return null;
  const lon0 = (b[0] + b[2]) / 2;
  const lat0 = (b[1] + b[3]) / 2;
  return { lon0, lat0, kx: R * DEG * Math.cos(lat0 * DEG), kz: R * DEG, x: c.x, z: c.z };
}

/** World metres (x east, z south) to latitude and longitude (deg) on that map. */
export function coastLatLon(g: CoastGeo, x: number, z: number): { lat: number; lon: number } {
  return { lat: g.lat0 - (z - g.z) / g.kz, lon: g.lon0 + (x - g.x) / g.kx };
}

/** Latitude and longitude (deg) to world metres on that map. */
export function coastWorld(g: CoastGeo, lat: number, lon: number): { x: number; z: number } {
  return { x: g.x + (lon - g.lon0) * g.kx, z: g.z - (lat - g.lat0) * g.kz };
}

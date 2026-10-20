/**
 * The chart's grid: world metres <-> latitude / longitude, and the chart's extent.
 * World axes: +x east, -z north, origin at CONFIG.nav (originLat, originLon). One minute
 * of latitude is a nautical mile (1852 m); a minute of longitude shrinks with cos(lat).
 */
import { CONFIG } from '../config';
import type { IslandDef } from '../world/archipelago';
import { REGIONS, regionById } from '../world/regions';

const M_PER_DEG = 1852 * 60;

export function toLatLon(x: number, z: number): { lat: number; lon: number } {
  const lat = CONFIG.nav.originLat - z / M_PER_DEG;
  const lon = CONFIG.nav.originLon + x / (M_PER_DEG * Math.cos((lat * Math.PI) / 180));
  return { lat, lon };
}

/** "56°31.2'N 005°48.4'W", as you'd write it in a log. */
export function formatPosition(x: number, z: number): string {
  const { lat, lon } = toLatLon(x, z);
  const part = (v: number, degDigits: number, pos: string, neg: string) => {
    const a = Math.abs(v);
    let d = Math.floor(a);
    let m = Math.round((a - d) * 600) / 10;
    if (m >= 60) {
      d += 1;
      m = 0;
    }
    return `${String(d).padStart(degDigits, '0')}°${m.toFixed(1).padStart(4, '0')}'${v >= 0 ? pos : neg}`;
  };
  return `${part(lat, 2, 'N', 'S')} ${part(lon, 3, 'E', 'W')}`;
}

/**
 * The islands the charts show: home's, for now. The other regions' get their own sheets,
 * and an archipelago sheet shows them all (regions, milestone 4); until then the paper chart
 * and the plotter stay the home sheet they were.
 */
export function chartIslands(): readonly IslandDef[] {
  return (regionById('home') ?? REGIONS[0]).islands;
}

/** The area the charts cover (world m): the charted islands plus a margin of open water. */
export function chartBounds(margin = 700): { x0: number; x1: number; z0: number; z1: number } {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const i of chartIslands()) {
    x0 = Math.min(x0, i.x - i.radius);
    x1 = Math.max(x1, i.x + i.radius);
    z0 = Math.min(z0, i.z - i.radius);
    z1 = Math.max(z1, i.z + i.radius);
  }
  return { x0: x0 - margin, x1: x1 + margin, z0: z0 - margin, z1: z1 + margin };
}

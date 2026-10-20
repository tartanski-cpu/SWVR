/**
 * The regions of the world (the regions brief, PROGRESS.md "Regions"): home and, as they
 * are built, its neighbours. Each is a RegionDef in its own file. The order here is the
 * order the flat lists in archipelago.ts run in (home first, so ports keep their places).
 *
 * All regions' data is always live: the simulation (terrain, harbours, jobs) and the charts
 * know the whole world. Only the drawing is streamed in and out by distance (milestone 2).
 */
import type { RegionDef } from '../defs';
import { HOME } from './home';
import { SOUNDS } from './sounds';
import { FJORD } from './fjord';
import { NARROWS } from './narrows';

import { OBAN } from './oban';
import { TAYVALLICH } from './tayvallich';
import { MODE, VOYAGE_MAP_ID } from '../../mode';
import { mapRegion, voyageMap } from '../maps';

/**
 * The world (owner, Oct 2026): career mode is the hand-built archipelago, home and its
 * neighbours, always (the coast regions were a debug stand-in for the Sounds before Voyage
 * mode existed). Voyage mode (mode.ts) is the one map chosen on the landing page
 * (world/maps.ts), nothing else.
 */
export const COAST_REGIONS: Record<string, RegionDef> = { oban: OBAN, tayvallich: TAYVALLICH };
export const REGIONS: readonly RegionDef[] = MODE === 'voyage' ? [mapRegion((voyageMap(VOYAGE_MAP_ID) ?? voyageMap('oban'))!)] : [HOME, SOUNDS, FJORD, NARROWS];

export function regionById(id: string): RegionDef | undefined {
  return REGIONS.find((r) => r.id === id);
}

/** Is (x, z) inside the region's footprint? */
export function inRegion(r: RegionDef, x: number, z: number): boolean {
  const b = r.bounds;
  return x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
}

/** Centre of a region's footprint (world m). */
export function regionCentre(r: RegionDef): { x: number; z: number } {
  return { x: (r.bounds.x0 + r.bounds.x1) / 2, z: (r.bounds.z0 + r.bounds.z1) / 2 };
}

/**
 * The region (x, z) is in; in open water between regions, the nearest one by the distance
 * to its footprint (so a crossing belongs to the side you're closer to).
 */
export function regionAt(x: number, z: number): RegionDef {
  let best = REGIONS[0];
  let bestD = Infinity;
  for (const r of REGIONS) {
    const d = distanceToBounds(r, x, z);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

/** Distance from (x, z) to the region's footprint (0 inside). */
export function distanceToBounds(r: RegionDef, x: number, z: number): number {
  const b = r.bounds;
  const dx = Math.max(b.x0 - x, 0, x - b.x1);
  const dz = Math.max(b.z0 - z, 0, z - b.z1);
  return Math.hypot(dx, dz);
}

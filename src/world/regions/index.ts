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

/**
 * Debug (the coast pipeline, milestone 4): Oban, a region made from real map data, in place
 * of the hand-built Sounds (and the Fjord, which its full-scale box covers). Set by the
 * Debug menu or `?coast=oban` in the address (`?coast=off` to go back); kept in this
 * browser. Read once at start: changing it reloads the page.
 */
export const COAST_KEY = 'swvr.coastRegion';
function coastChoice(): string | null {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('coast');
    if (q === 'off') localStorage.removeItem(COAST_KEY);
    else if (q) localStorage.setItem(COAST_KEY, q);
    return localStorage.getItem(COAST_KEY);
  } catch {
    return null; // no storage (a worker, the tests): the usual world
  }
}
export const COAST_REGION: string | null = coastChoice() === 'oban' ? 'oban' : null;

/** Turn the coast region on or off, and reload into it. */
export function setCoastRegion(id: string | null): void {
  try {
    if (id) localStorage.setItem(COAST_KEY, id);
    else localStorage.removeItem(COAST_KEY);
  } catch {
    /* no storage: nothing to keep */
  }
  const url = new URL(location.href);
  url.searchParams.delete('coast');
  location.assign(url.toString());
}

export const REGIONS: readonly RegionDef[] = COAST_REGION === 'oban' ? [HOME, OBAN, NARROWS] : [HOME, SOUNDS, FJORD, NARROWS];

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

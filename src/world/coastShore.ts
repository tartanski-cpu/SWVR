/**
 * What a coast map's shore is made of (the coast extras plan, C3): the pipeline's shore map
 * (tools/coast/src/shore.ts), one byte a cell (`cell` m) over the shore band where a hull
 * meets the ground. Bits 0-2: 0 none (foreshore the map says nothing about, or not shore), 1
 * sand, 2 shingle, 3 rock, 4 cliff; bit 3: the map says so; bit 4: a mapped field. Fetched
 * with the region's terrain at start (coastRegion.ts), before the world runs: the physics asks
 * it where a hull touches (vessel/physics/contacts.ts: a bow-ramp boat may beach on sand or
 * shingle).
 */

/** The package's `shore`: where the map is and its kinds' names. */
export interface ShoreLayout {
  file: string;
  cell: number;
  /** Its north-west corner in the region's metres, and its size in cells. */
  x0: number;
  z0: number;
  width: number;
  height: number;
  kinds: readonly string[];
}

export type ShoreKind = 'none' | 'sand' | 'shingle' | 'rock' | 'cliff';
const KINDS: ShoreKind[] = ['none', 'sand', 'shingle', 'rock', 'cliff'];

interface Shore {
  id: string;
  layout: ShoreLayout;
  x0: number;
  z0: number;
  cells: Uint8Array;
}

const SHORES: Shore[] = [];

/** Take a region's shore map (run-length packed: count, value pairs) placed with its origin at world (ox, oz). */
export function registerShore(id: string, packed: ArrayBuffer, layout: ShoreLayout, ox: number, oz: number): void {
  const src = new Uint8Array(packed);
  const cells = new Uint8Array(layout.width * layout.height);
  for (let i = 0, k = 0; i + 1 < src.length && k < cells.length; i += 2) {
    cells.fill(src[i + 1], k, Math.min(cells.length, k + src[i]));
    k += src[i];
  }
  const old = SHORES.findIndex((s) => s.id === id);
  if (old >= 0) SHORES.splice(old, 1);
  SHORES.push({ id, layout, x0: layout.x0 + ox, z0: layout.z0 + oz, cells });
}

/** What the shore is at world (x, z): 'none' off every shore map, or where it isn't classed. */
export function shoreAt(x: number, z: number): ShoreKind {
  for (const s of SHORES) {
    const i = Math.floor((x - s.x0) / s.layout.cell);
    const j = Math.floor((z - s.z0) / s.layout.cell);
    if (i < 0 || j < 0 || i >= s.layout.width || j >= s.layout.height) continue;
    return KINDS[s.cells[j * s.layout.width + i] & 7] ?? 'none';
  }
  return 'none';
}

/** Soft ground to beach on: sand or shingle. */
export function softShore(x: number, z: number): boolean {
  const k = shoreAt(x, z);
  return k === 'sand' || k === 'shingle';
}

/** Forget them all (tests). */
export function clearShores(): void {
  SHORES.length = 0;
}

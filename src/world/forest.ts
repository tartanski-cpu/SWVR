/**
 * A coast region's woods (the settlements brief, Part B): the coast pipeline's forest map
 * (tools/coast/src/trees.ts), one byte every `cell` m: the kind of wood in the high four
 * bits (1 plantation, 2 broadleaf, 3 mixed, 4 natural, 5 scrub, 6 orchard; 0 none) and how
 * thickly it's wooded in the low four (0-15). Fetched with the region's terrain at start
 * (coastRegion.ts) and kept here; the trees are scattered from it near the viewer
 * (view/treesView.ts). Drawing only: the trees are not in the simulation.
 */

/** The package's `trees`: where the map is, its kinds' spacing and species, the species' colours. */
export interface ForestLayout {
  file: string;
  cell: number;
  /** The map's north-west corner in the region's metres, and its size in cells. */
  x0: number;
  z0: number;
  width: number;
  height: number;
  kinds: readonly string[];
  styles: Record<string, { spacing: number; rows?: boolean; species: [string, number][] }>;
  colours: Record<string, number[]>;
}

export interface Forest {
  id: string;
  layout: ForestLayout;
  /** World position of its north-west corner. */
  x0: number;
  z0: number;
  cells: Uint8Array;
}

const FORESTS: Forest[] = [];

/** Take a region's forest map (run-length packed: count, value pairs) placed with its origin at world (ox, oz). */
export function registerForest(id: string, packed: ArrayBuffer, layout: ForestLayout, ox: number, oz: number): Forest {
  const src = new Uint8Array(packed);
  const cells = new Uint8Array(layout.width * layout.height);
  let k = 0;
  for (let i = 0; i + 1 < src.length && k < cells.length; i += 2) {
    cells.fill(src[i + 1], k, Math.min(cells.length, k + src[i]));
    k += src[i];
  }
  const f: Forest = { id, layout, x0: layout.x0 + ox, z0: layout.z0 + oz, cells };
  const old = FORESTS.findIndex((x) => x.id === id);
  if (old >= 0) FORESTS.splice(old, 1);
  FORESTS.push(f);
  return f;
}

export function forestOf(id: string): Forest | undefined {
  return FORESTS.find((f) => f.id === id);
}

/** The map's byte at world (x, z) in a forest (0: no wood there). */
export function forestCell(f: Forest, x: number, z: number): number {
  const i = Math.floor((x - f.x0) / f.layout.cell);
  const j = Math.floor((z - f.z0) / f.layout.cell);
  if (i < 0 || j < 0 || i >= f.layout.width || j >= f.layout.height) return 0;
  return f.cells[j * f.layout.width + i];
}

/** Forget them all (tests). */
export function clearForests(): void {
  FORESTS.length = 0;
}

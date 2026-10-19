/**
 * The land as triangles, from the level data: plain arrays, no Three.js, so a web worker can
 * build a region's terrain off the frame (regions, milestone 2) and the game thread only
 * uploads the result. Three builders:
 *
 *   terrain     a region's land and shallows: a flat-shaded, vertex-coloured grid sampled
 *               from the same height function the physics uses (CELL m; cells entirely
 *               below SKIP_BELOW are left out - the sea is opaque). Round a slipway the grid
 *               is drawn finer (CELL / FINE m) so it meets the slab's edges. A region may ask
 *               for lean high ground (`leanTerrain`): inland above a height the cells merge
 *               into blocks of `cells` x `cells`, to keep a big island cheap on the Quest.
 *               Edges between fine and coarse cells are stitched (no cracks).
 *   silhouette  the same land at SILHOUETTE_CELL m, land only, for a region drawn from far
 *               off (its outline and its landmark hill): a few thousand triangles.
 *   trees       where the region's trees stand (x, y, z, scale), for an instanced mesh.
 *
 * World axes: +X east, -Z north, metres; heights above MSL.
 */
import type { IslandDef, RegionDef, RegionTheme } from '../defs';
import { groundHeight, slipSurface } from '../terrain';

export const CELL = 6;
export const SKIP_BELOW = -3;
/** Round a slipway the terrain is drawn finer (`CELL / FINE` m). */
const FINE = 6;
/** ...and kept this far under the slab (m), so the concrete isn't fighting it for the pixels. */
const UNDER_SLIP = 0.15;
/** A far-off region's outline is drawn at this cell size (m). */
export const SILHOUETTE_CELL = 30;

export interface TerrainArrays {
  /** xyz per vertex, three vertices per triangle (non-indexed, flat shaded). */
  position: Float32Array;
  /** rgb per vertex. */
  color: Float32Array;
}

/** The terrain's drawn height: the ground, sunk a little under a slipway's slab. */
function meshHeight(x: number, z: number): number {
  const h = groundHeight(x, z, false);
  return slipSurface(x, z) ? h - UNDER_SLIP : h;
}

/** Grid cells (CELL) that touch one of the region's slipways, or come within a cell of it: drawn fine. */
function nearSlip(region: RegionDef, i: number, j: number): boolean {
  for (const s of region.slipways) {
    const r = Math.hypot(s.length, s.width) + CELL;
    const cx = (i + 0.5) * CELL;
    const cz = (j + 0.5) * CELL;
    if (Math.abs(cx - s.x) > r + CELL || Math.abs(cz - s.z) > r + CELL) continue;
    // Any point of the cell within a cell of the slab.
    for (let a = 0; a <= 4; a++)
      for (let b = 0; b <= 4; b++) {
        const x = i * CELL + (a / 4) * CELL;
        const z = j * CELL + (b / 4) * CELL;
        for (const [dx, dz] of [[0, 0], [CELL, 0], [-CELL, 0], [0, CELL], [0, -CELL]]) if (slipSurface(x + dx, z + dz)) return true;
      }
  }
  return false;
}

/** Small deterministic hash in [0, 1) for colour and placement variation. */
export function hash(x: number, z: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

type RGB = [number, number, number];
const rgb = (hex: number): RGB => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const SAND = rgb(0xd9c99a);
const WET_SAND = rgb(0xa99a70);
const SEABED = rgb(0x3e5a58);
const GRASS = rgb(0x58823c);
const HEATH = rgb(0x7b7a4a);
const ROCK = rgb(0x77736b);
const SNOW = rgb(0xeef2f4);

/** A region's ground colours (RegionTheme; unset: home's grass, heather and rock). */
interface Palette {
  grass: RGB;
  heath: RGB;
  rock: RGB;
  heathAbove: number;
  snowAbove: number;
}
const HOME_PALETTE: Palette = { grass: GRASS, heath: HEATH, rock: ROCK, heathAbove: 30, snowAbove: Infinity };
function paletteOf(t: RegionTheme | undefined): Palette {
  if (!t) return HOME_PALETTE;
  return {
    grass: t.grass !== undefined ? rgb(t.grass) : GRASS,
    heath: t.heath !== undefined ? rgb(t.heath) : HEATH,
    rock: t.rock !== undefined ? rgb(t.rock) : ROCK,
    heathAbove: t.heathAbove ?? 30,
    snowAbove: t.snowAbove ?? Infinity,
  };
}

/** The ground's colour from its height, slope (normal y) and a little per-spot variation. */
export function terrainColor(h: number, ny: number, x: number, z: number, p: Palette = HOME_PALETTE): RGB {
  let c: RGB;
  // Snow lies on the tops, but not on the steepest rock (it slides off), with a ragged line.
  if (h > p.snowAbove + 25 * (hash(Math.round(x / 7), Math.round(z / 7)) - 0.5) && ny > 0.55) c = SNOW;
  else if (h < -0.3) c = lerp3(WET_SAND, SEABED, Math.min(1, -h / 5));
  else if (ny < 0.72) c = p.rock;
  else if (h < 1.7 && ny > 0.8) c = SAND;
  else if (h > p.heathAbove) c = p.heath;
  else c = lerp3(p.grass, p.heath, Math.min(1, Math.max(0, (h - (p.heathAbove - 12)) / 14)));
  const v = 0.92 + 0.16 * hash(Math.round(x), Math.round(z));
  return [c[0] * v, c[1] * v, c[2] * v];
}

/** Collects triangles with the flat-shaded colour of each. */
class TriangleSink {
  constructor(private readonly palette: Palette = HOME_PALETTE) {}
  pos: number[] = [];
  col: number[] = [];
  tri(ax: number, az: number, ah: number, bx: number, bz: number, bh: number, cx: number, cz: number, ch: number): void {
    if (Math.max(ah, bh, ch) < SKIP_BELOW) return;
    // Normal of the triangle (c - b) x (a - b), turned to face up.
    const ux = cx - bx, uy = ch - bh, uz = cz - bz; // prettier-ignore
    const vx = ax - bx, vy = ah - bh, vz = az - bz; // prettier-ignore
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    if (ny < 0) ny = -ny;
    const c = terrainColor((ah + bh + ch) / 3, ny, (ax + bx + cx) / 3, (az + bz + cz) / 3, this.palette);
    this.pos.push(ax, ah, az, bx, bh, bz, cx, ch, cz);
    for (let k = 0; k < 3; k++) this.col.push(c[0], c[1], c[2]);
  }
  arrays(): TerrainArrays {
    return { position: new Float32Array(this.pos), color: new Float32Array(this.col) };
  }
}

/**
 * The grid cells (of `cell` m) round each of the islands, as unique keys: those within
 * `margin` m of the island's widest coastline (its radius stretched by its wobbles; beyond
 * a few metres off the coast the seabed is too deep to draw).
 */
function islandCells(islands: readonly IslandDef[], cell: number, margin: number): Set<number> {
  const cells = new Set<number>();
  for (const isl of islands) {
    const reach = isl.radius * (1 + isl.shape.reduce((s, [, a]) => s + Math.abs(a), 0)) + margin + cell;
    const i0 = Math.floor((isl.x - reach) / cell);
    const i1 = Math.ceil((isl.x + reach) / cell);
    const j0 = Math.floor((isl.z - reach) / cell);
    const j1 = Math.ceil((isl.z + reach) / cell);
    for (let i = i0; i < i1; i++)
      for (let j = j0; j < j1; j++) {
        const dx = (i + 0.5) * cell - isl.x;
        const dz = (j + 0.5) * cell - isl.z;
        if (dx * dx + dz * dz <= reach * reach) cells.add(cellKey(i, j));
      }
  }
  return cells;
}
const cellKey = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);
const cellOf = (k: number): [number, number] => [Math.floor(k / 8192) - 4096, (k % 8192) - 4096];

/** A region's terrain (see the file header). */
export function buildTerrainArrays(region: RegionDef): TerrainArrays {
  const cells = islandCells(region.islands, CELL, 40);
  const heights = new Map<number, number>();
  const hAt = (i: number, j: number) => {
    const k = cellKey(i, j);
    let h = heights.get(k);
    if (h === undefined) {
      h = meshHeight(i * CELL, j * CELL);
      heights.set(k, h);
    }
    return h;
  };
  const sink = new TriangleSink(paletteOf(region.theme));

  // Lean high ground: blocks of N x N cells whose every corner is above `above` (and no
  // slipway near) are drawn as one quad. Decided per block, once.
  const lean = region.leanTerrain;
  const N = lean ? Math.max(2, Math.round(lean.cells)) : 1;
  const coarseBlocks = new Map<number, boolean>();
  const blockKey = (I: number, J: number) => cellKey(I, J);
  const isCoarse = (I: number, J: number): boolean => {
    if (!lean) return false;
    const k = blockKey(I, J);
    let v = coarseBlocks.get(k);
    if (v === undefined) {
      v = true;
      for (let a = 0; a <= N && v; a++) for (let b = 0; b <= N && v; b++) if (hAt(I * N + a, J * N + b) <= lean.above) v = false;
      if (v) for (let a = 0; a < N && v; a++) for (let b = 0; b < N && v; b++) if (nearSlip(region, I * N + a, J * N + b)) v = false;
      coarseBlocks.set(k, v);
    }
    return v;
  };
  // The height of a fine vertex (gi, gj): on the edge of a neighbouring coarse block it lies
  // on that block's straight edge (stitched), otherwise the ground's own height.
  const fineHeight = (gi: number, gj: number): number => {
    if (N > 1) {
      const ai = ((gi % N) + N) % N;
      const aj = ((gj % N) + N) % N;
      if (ai !== 0 && aj === 0) {
        // On a horizontal block boundary: the block above (J - 1) or below (J) may be coarse.
        const I = Math.floor(gi / N);
        const J = gj / N;
        if (isCoarse(I, J) || isCoarse(I, J - 1)) return hAt(I * N, gj) + ((hAt(I * N + N, gj) - hAt(I * N, gj)) * ai) / N;
      } else if (aj !== 0 && ai === 0) {
        const I = gi / N;
        const J = Math.floor(gj / N);
        if (isCoarse(I, J) || isCoarse(I - 1, J)) return hAt(gi, J * N) + ((hAt(gi, J * N + N) - hAt(gi, J * N)) * aj) / N;
      }
    }
    return hAt(gi, gj);
  };

  const done = new Set<number>();
  for (const k of cells) {
    const [i, j] = cellOf(k);
    const x0 = i * CELL;
    const z0 = j * CELL;
    const x1 = x0 + CELL;
    const z1 = z0 + CELL;
    if (N > 1) {
      const I = Math.floor(i / N);
      const J = Math.floor(j / N);
      if (isCoarse(I, J)) {
        const bk = blockKey(I, J);
        if (done.has(bk)) continue;
        done.add(bk);
        const bx0 = I * N * CELL;
        const bz0 = J * N * CELL;
        const bx1 = bx0 + N * CELL;
        const bz1 = bz0 + N * CELL;
        const h00 = hAt(I * N, J * N);
        const h10 = hAt(I * N + N, J * N);
        const h01 = hAt(I * N, J * N + N);
        const h11 = hAt(I * N + N, J * N + N);
        sink.tri(bx0, bz0, h00, bx0, bz1, h01, bx1, bz0, h10);
        sink.tri(bx1, bz0, h10, bx0, bz1, h01, bx1, bz1, h11);
        continue;
      }
    }
    const h00 = fineHeight(i, j);
    const h10 = fineHeight(i + 1, j);
    const h01 = fineHeight(i, j + 1);
    const h11 = fineHeight(i + 1, j + 1);
    if (nearSlip(region, i, j)) {
      // Fine round a slipway. Along an edge shared with a coarse cell its points lie on that
      // cell's straight edge (no cracks between them); inside, the ground's own heights.
      const f = CELL / FINE;
      const coarse = (di: number, dj: number) => !nearSlip(region, i + di, j + dj);
      const [w, e, nn, s] = [coarse(-1, 0), coarse(1, 0), coarse(0, -1), coarse(0, 1)];
      const at = (a: number, b: number) => {
        if (a === 0 && w) return h00 + ((h01 - h00) * b) / FINE;
        if (a === FINE && e) return h10 + ((h11 - h10) * b) / FINE;
        if (b === 0 && nn) return h00 + ((h10 - h00) * a) / FINE;
        if (b === FINE && s) return h01 + ((h11 - h01) * a) / FINE;
        return meshHeight(x0 + a * f, z0 + b * f);
      };
      for (let a = 0; a < FINE; a++)
        for (let b = 0; b < FINE; b++) {
          const xa = x0 + a * f;
          const za = z0 + b * f;
          sink.tri(xa, za, at(a, b), xa, za + f, at(a, b + 1), xa + f, za, at(a + 1, b));
          sink.tri(xa + f, za, at(a + 1, b), xa, za + f, at(a, b + 1), xa + f, za + f, at(a + 1, b + 1));
        }
      continue;
    }
    // Counter-clockwise seen from above (+Y): (x0,z0) -> (x0,z1) -> (x1,z0).
    sink.tri(x0, z0, h00, x0, z1, h01, x1, z0, h10);
    sink.tri(x1, z0, h10, x0, z1, h01, x1, z1, h11);
  }
  return sink.arrays();
}

/**
 * A region seen from far off: its land at SILHOUETTE_CELL m, nothing below the waterline
 * (heights are floored at SILHOUETTE_FLOOR, so the coast is a thin lip above the sea rather
 * than a slope fighting the water for the pixels miles away).
 */
export const SILHOUETTE_FLOOR = 0.4;
/** A silhouette is drawn coarser than SILHOUETTE_CELL when it would take more cells than this (a big region). */
const SILHOUETTE_MAX_CELLS = 5000;
export function buildSilhouetteArrays(region: RegionDef): TerrainArrays {
  let cell = SILHOUETTE_CELL;
  let cells = islandCells(region.islands, cell, 0);
  if (cells.size > SILHOUETTE_MAX_CELLS) {
    cell = Math.ceil(cell * Math.sqrt(cells.size / SILHOUETTE_MAX_CELLS));
    cells = islandCells(region.islands, cell, 0);
  }
  const heights = new Map<number, number>();
  const hAt = (i: number, j: number) => {
    const k = cellKey(i, j);
    let h = heights.get(k);
    if (h === undefined) {
      h = Math.max(SILHOUETTE_FLOOR, groundHeight(i * cell, j * cell, false));
      heights.set(k, h);
    }
    return h;
  };
  const sink = new TriangleSink(paletteOf(region.theme));
  for (const k of cells) {
    const [i, j] = cellOf(k);
    const h00 = hAt(i, j);
    const h10 = hAt(i + 1, j);
    const h01 = hAt(i, j + 1);
    const h11 = hAt(i + 1, j + 1);
    if (Math.max(h00, h10, h01, h11) <= SILHOUETTE_FLOOR) continue; // all sea
    const x0 = i * cell;
    const z0 = j * cell;
    const x1 = x0 + cell;
    const z1 = z0 + cell;
    sink.tri(x0, z0, h00, x0, z1, h01, x1, z0, h10);
    sink.tri(x1, z0, h10, x0, z1, h01, x1, z1, h11);
  }
  return sink.arrays();
}

/**
 * Where a region's trees stand: x, y, z and scale per tree (four floats each). Forest
 * patches from low-frequency noise, thinning at the edges; on gentle ground between 3 and
 * 40 m (the region's theme may let them climb higher and steeper: a fjord's pine slopes),
 * clear of the ports' waterfronts and the buildings.
 */
export function treeSpots(region: RegionDef): Float32Array {
  const spots: number[] = [];
  const top = region.theme?.treesTo ?? 40;
  // Steepness limit as the sum of two 2 m height steps (the test below).
  const steep = (region.theme?.treeSlope ?? 0.55) * 4;
  const step = 5;
  for (const isl of region.islands) {
    if (isl.trees <= 0) continue;
    const reach = isl.radius * 1.2;
    for (let x = isl.x - reach; x < isl.x + reach; x += step) {
      for (let z = isl.z - reach; z < isl.z + reach; z += step) {
        const patch = Math.sin(x * 0.012 + isl.seed) * Math.sin(z * 0.015 - isl.seed) + 0.35 * Math.sin((x - z) * 0.03);
        if (patch < 0.05) continue;
        if (hash(x, z) > ((isl.trees * (step * step)) / 100) * 1.8 * Math.min(1, patch * 2)) continue;
        const jx = x + (hash(z, x) - 0.5) * step;
        const jz = z + (hash(x + 1, z - 1) - 0.5) * step;
        const h = groundHeight(jx, jz);
        if (h < 3 || h > top) continue;
        const slope = Math.abs(groundHeight(jx + 2, jz) - h) + Math.abs(groundHeight(jx, jz + 2) - h);
        if (slope > steep) continue;
        if (region.ports.some((p) => Math.hypot(jx - p.x, jz - p.z) < p.clearRadius)) continue;
        if (region.buildings.some((b) => Math.hypot(jx - b.x, jz - b.z) < Math.max(b.width, b.depth))) continue;
        spots.push(jx, h - 0.2, jz, 0.7 + 0.7 * hash(jz, jx));
      }
    }
  }
  return new Float32Array(spots);
}

/**
 * The top of a landmark hill: the highest ground within `search` m of the landmark's
 * position, found on a 2 m grid (the cairn stands there; the sight distance uses it).
 */
export function summitNear(x: number, z: number, search = 60): { x: number; z: number; h: number } {
  let best = { x, z, h: groundHeight(x, z) };
  for (let dx = -search; dx <= search; dx += 2)
    for (let dz = -search; dz <= search; dz += 2) {
      const h = groundHeight(x + dx, z + dz);
      if (h > best.h) best = { x: x + dx, z: z + dz, h };
    }
  return best;
}

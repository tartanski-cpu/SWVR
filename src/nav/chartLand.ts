/**
 * The chartplotter's land, sea and shallows on a coast map, drawn as shapes from the ground's
 * own mesh (owner, Oct 2026: on the big maps, the Clyde and Syros, the plotter's map was "too
 * low"). Before, each map's land was sampled into one picture capped in size, so on the Clyde
 * (35 x 37 km) a pixel of it was ~70 m of ground, stretched over many of the screen's.
 *
 * A coast map's ground is a triangle mesh (world/coastTerrain.ts; a big map's streams in
 * round the boat in 2 km squares), its height known at each corner and straight between.
 * Where a triangle crosses a depth (6 m: the shallows; the waterline; 3 m up: past the beach)
 * the line between is where that depth runs, so cutting each triangle at it gives the
 * coastline and the shallows' edge exactly as the ground has them, sharp at any zoom. A
 * square's few hundred triangles become a few outlines, made once and kept while it's loaded.
 *
 * The cutting is plain numbers (tested); the plotter turns the outlines into canvas paths.
 */
import type { CoastPiece } from '../world/coastTerrain';

/** The depths the chart's colours change at (m, + up): the shallows (under 6 m of water), the beach, the land. */
export const CHART_LEVELS = [-6, 0, 3] as const;

/** The squares the outlines are kept in (m): a whole map's mesh is cut into them so only those in view are drawn. */
export const CHART_CELL = 2000;

/**
 * The part of triangle a-b-c (x, z and height at each corner) above `level`, as its corners
 * (x, z, x, z...) pushed onto `out`, anticlockwise seen from above; how many corners (0 when
 * none of it is above, 3 or 4 when cut, 3 when all of it is).
 */
export function aboveLevel(t: ArrayLike<number>, level: number, out: number[]): number {
  const start = out.length;
  for (let k = 0; k < 3; k++) {
    const p = k * 3;
    const q = ((k + 1) % 3) * 3;
    const hp = t[p + 2] - level;
    const hq = t[q + 2] - level;
    if (hp > 0) out.push(t[p], t[p + 1]);
    // The edge crosses the level: where, straight between its ends.
    if (hp > 0 !== hq > 0) {
      const s = hp / (hp - hq);
      out.push(t[p] + (t[q] - t[p]) * s, t[p + 1] + (t[q + 1] - t[p + 1]) * s);
    }
  }
  const n = (out.length - start) / 2;
  if (n < 3) {
    out.length = start;
    return 0;
  }
  // All one way round (canvas fills a path's overlaps by its winding; the mesh's faces aren't all the same way).
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += out[start + 2 * i] * out[start + 2 * j + 1] - out[start + 2 * j] * out[start + 2 * i + 1];
  }
  if (area < 0) {
    const pts = out.splice(start);
    for (let i = n - 1; i >= 0; i--) out.push(pts[2 * i], pts[2 * i + 1]);
  }
  return n;
}

/**
 * One square of a mesh (its corner and side, m) and the faces drawn in it (each in the square
 * its middle is in; it may reach a little past it, which is fine: the squares are filled level
 * by level, all of them for one level before the next). All-deep faces are left out: deep
 * water is the square's background.
 */
export interface ChartCell {
  x0: number;
  z0: number;
  size: number;
  faces: Uint32Array;
}

const isDeep = (V: Float32Array, F: Uint32Array, f: number) => Math.max(V[F[3 * f] * 3 + 1], V[F[3 * f + 1] * 3 + 1], V[F[3 * f + 2] * 3 + 1]) <= CHART_LEVELS[0];

/**
 * A mesh's squares: one, `box`, for a big map's streamed square (all its faces in it); else
 * squares of CHART_CELL on the world's grid (a whole map's mesh, so only those in view are drawn).
 */
export function chartCells(p: CoastPiece, box?: { x0: number; z0: number; size: number }): ChartCell[] {
  const { V, F } = p;
  const nf = F.length / 3;
  const lists = new Map<string, { x0: number; z0: number; size: number; faces: number[] }>();
  for (let f = 0; f < nf; f++) {
    let key = '';
    let x0 = 0;
    let z0 = 0;
    let size = CHART_CELL;
    if (box) ({ x0, z0, size } = box);
    else {
      const a = F[3 * f] * 3;
      const b = F[3 * f + 1] * 3;
      const c = F[3 * f + 2] * 3;
      const i = Math.floor((V[a] + V[b] + V[c]) / 3 / CHART_CELL);
      const j = Math.floor((V[a + 2] + V[b + 2] + V[c + 2]) / 3 / CHART_CELL);
      key = `${i},${j}`;
      x0 = i * CHART_CELL;
      z0 = j * CHART_CELL;
    }
    let cell = lists.get(key);
    if (!cell) lists.set(key, (cell = { x0, z0, size, faces: [] }));
    // (A square of only deep faces is kept, empty: it's still filled deep, over the coarse picture.)
    if (!isDeep(V, F, f)) cell.faces.push(f);
  }
  return [...lists.values()].map((c) => ({ ...c, faces: Uint32Array.from(c.faces) }));
}

/**
 * A square's outlines: for each level, its polygons as an SVG path ('M x z L x z ... Z', to
 * the decimetre), which the canvas reads in one go (`new Path2D(text)`: far quicker than
 * drawing a hundred thousand corners one call at a time). A face wholly above the next level
 * up gives nothing for this one: it'd be hidden under it.
 */
export function cellOutlines(p: CoastPiece, cell: ChartCell): string[] {
  const { V, F } = p;
  const tri = new Float32Array(9);
  const scratch: number[] = [];
  const levels: string[][] = CHART_LEVELS.map(() => []);
  for (const f of cell.faces) {
    for (let k = 0; k < 3; k++) {
      const v = F[3 * f + k] * 3;
      tri[k * 3] = V[v];
      tri[k * 3 + 1] = V[v + 2];
      tri[k * 3 + 2] = V[v + 1];
    }
    const lo = Math.min(tri[2], tri[5], tri[8]);
    for (let l = 0; l < CHART_LEVELS.length; l++) {
      if (l + 1 < CHART_LEVELS.length && lo > CHART_LEVELS[l + 1]) continue;
      scratch.length = 0;
      const n = aboveLevel(tri, CHART_LEVELS[l], scratch);
      if (!n) continue;
      let d = `M${scratch[0].toFixed(1)} ${scratch[1].toFixed(1)}`;
      for (let c = 1; c < n; c++) d += `L${scratch[2 * c].toFixed(1)} ${scratch[2 * c + 1].toFixed(1)}`;
      levels[l].push(d + 'Z');
    }
  }
  return levels.map((a) => a.join(''));
}

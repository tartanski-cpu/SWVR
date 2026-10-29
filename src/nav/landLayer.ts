import { CONFIG } from '../config';
import type { RegionDef } from '../world/defs';
import { REGIONS } from '../world/regions';
import { groundHeight } from '../world/terrain';
import { coastTerrains } from '../world/coastTerrain';
import { CHART_LEVELS, cellOutlines, chartCells, terrainMesh, type ChartCell, type MeshArrays } from './chartLand';

/** Land layer resolution (m per pixel) and margin around the islands (m). */
const RES = 8;
export const MARGIN = 700;
/**
 * At most this many land samples a region (it's sampled on the frame when it first comes into
 * view): a big region (the Fjord's mountain) is sampled coarser than RES so it doesn't hitch.
 */
const MAX_SAMPLES = 260_000;
/** The chart's colours: deep water, then each of CHART_LEVELS' (the shallows, the beach, the land). */
export const DEEP: [number, number, number] = [16, 46, 66];
export const BANDS: [number, number, number][] = [
  [44, 98, 118],
  [196, 178, 126],
  [118, 128, 86],
];
export const css = ([r, g, b]: [number, number, number]) => `rgb(${r}, ${g}, ${b})`;

/** A chart's colours: deep water, then each of CHART_LEVELS' bands (the shallows, the foreshore, the land). */
export interface ChartPalette {
  deep: [number, number, number];
  bands: [number, number, number][];
}
/** The chartplotter's screen: dark water, sand, green land. */
export const SCREEN_CHART: ChartPalette = { deep: DEEP, bands: BANDS };
/**
 * A paper chart's, in the manner of an Admiralty chart (owner, 29 Oct 2026: "the original pale
 * yellow and blue"): deep water white, the shallows pale blue, the foreshore a darker buff, the
 * land pale yellow buff. The planning chart's (voyage/planChart.ts).
 */
export const PAPER_CHART: ChartPalette = {
  deep: [252, 252, 247],
  bands: [
    [176, 214, 238],
    [226, 212, 150],
    [245, 230, 170],
  ],
};


/**
 * The chart's land, shallows and sea, for any view (moved out of the chartplotter, owner 28 Oct
 * 2026, so the planning chart draws the same sharp coast at any zoom: voyage/planChart.ts):
 *
 *   each region sampled from its terrain once into a coarse picture (the first time it's in
 *   view), and over it the ground as outlines (chartLand.ts), sharp at every zoom: a coast
 *   map's from its mesh, a hand-built region's from the terrain its view has built.
 *
 * Its pictures and outlines are kept, so one layer serves every redraw of a chart. Each chart
 * (the boat's plotter, a player's planning chart) has its own.
 */
export class LandLayer {
  /** @param palette its colours (the plotter's screen, by default; the planning chart's paper) */
  constructor(private readonly palette: ChartPalette = SCREEN_CHART) {}

  /** The land, shallows and sea of each region, sampled from the terrain once when first in view (regions). */
  private readonly lands = new Map<string, { canvas: HTMLCanvasElement; x0: number; z0: number; res: number }>();
  /** A coast map's mesh as outlines (chartLand.ts), square by square, and their canvas paths once drawn; kept while the mesh is loaded. */
  private readonly outlines = new WeakMap<MeshArrays, { cells: ChartCell[]; paths: (Path2D[] | undefined)[] }>();
  /** A hand-built region's drawn terrain as a mesh to cut (owner: the same sharp coast on the career map), once its view has built it. */
  private readonly landMeshes = new Map<string, MeshArrays>();
  /** Where a hand-built region's built terrain comes from (the world view; App sets it). */
  private landSource: ((regionId: string) => Float32Array | null) | null = null;

  /** The world view's built terrains, for the career map's outlines (null until a region's view is built). */
  setLandSource(source: (regionId: string) => Float32Array | null): void {
    this.landSource = source;
  }

  /**
   * The land over a chart W x H pixels, centred on (sx, sz) at `mpp` metres a pixel (the sea's
   * own colour is the caller's: this draws the land, shallows and deep water where there's map).
   * Returns whether some of the coast in view is still to be outlined (a few squares are each
   * redraw): a chart that only redraws when it changes should draw again until it's all there.
   */
  draw(g: CanvasRenderingContext2D, W: number, H: number, sx: number, sz: number, mpp: number): boolean {
    const span = W * mpp;
    const toPx = (x: number, z: number): [number, number] => [W / 2 + (x - sx) / mpp, H / 2 + (z - sz) / mpp];
    // Each region's land image that reaches the chart (built the first time it does).
    const reachX = span / 2 + MARGIN;
    const reachZ = (span * H) / W / 2 + MARGIN;
    for (const r of REGIONS) {
      const b = r.bounds;
      if (b.x1 < sx - reachX || b.x0 > sx + reachX || b.z1 < sz - reachZ || b.z0 > sz + reachZ) continue;
      if (!this.lands.has(r.id)) this.buildLand(r);
      const land = this.lands.get(r.id)!;
      const [dx, dz] = toPx(land.x0, land.z0);
      g.drawImage(land.canvas, dx, dz, (land.canvas.width * land.res) / mpp, (land.canvas.height * land.res) / mpp);
    }
    // Over a coast map's picture (coarse), its ground as outlines wherever its mesh is in.
    return this.drawCoast(g, W, H, sx, sz, mpp, reachX, reachZ);
  }

  /** A region's land, shallows and sea, sampled from the terrain once. */
  private buildLand(region: RegionDef): void {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    // A coast region (real coastline) has no islands: its whole box.
    if (region.coast) ({ x0, x1, z0, z1 } = { x0: region.bounds.x0 + MARGIN, x1: region.bounds.x1 - MARGIN, z0: region.bounds.z0 + MARGIN, z1: region.bounds.z1 - MARGIN });
    for (const i of region.islands) {
      x0 = Math.min(x0, i.x - i.radius);
      x1 = Math.max(x1, i.x + i.radius);
      z0 = Math.min(z0, i.z - i.radius);
      z1 = Math.max(z1, i.z + i.radius);
    }
    x0 -= MARGIN;
    z0 -= MARGIN;
    x1 += MARGIN;
    z1 += MARGIN;
    const res = Math.max(RES, Math.sqrt(((x1 - x0) * (z1 - z0)) / MAX_SAMPLES));
    const cw = Math.ceil((x1 - x0) / res);
    const ch = Math.ceil((z1 - z0) / res);
    const c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    const g = c.getContext('2d')!;
    const img = g.createImageData(cw, ch);
    for (let j = 0; j < ch; j++) {
      for (let i = 0; i < cw; i++) {
        const h = groundHeight(x0 + (i + 0.5) * res, z0 + (j + 0.5) * res);
        // Deep water, shallows (< 6 m), beach, land.
        const P = this.palette;
        const [r, gg, b] = h > CHART_LEVELS[2] ? P.bands[2] : h > CHART_LEVELS[1] ? P.bands[1] : h > CHART_LEVELS[0] ? P.bands[0] : P.deep;
        const k = (j * cw + i) * 4;
        img.data[k] = r;
        img.data[k + 1] = gg;
        img.data[k + 2] = b;
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    this.lands.set(region.id, { canvas: c, x0, z0, res });
  }

  /**
   * A coast map's land, shallows and sea from its mesh (chartLand.ts) over the screen, centred
   * on (sx, sz) at `mpp` metres a pixel. Square by square (a whole map's mesh on a 2 km grid,
   * a big map's streamed squares each its own): deep water over each square that's ready,
   * then each level's outlines, all squares' for one level before the next (a face can reach
   * past its square). A square's outlines are made the first time it's in view, the nearest
   * first and only for CONFIG.chartPlotter.buildMs each redraw, so a map's first look doesn't
   * stall the frame: until a square's ready, the map's coarse picture shows there.
   */
  private drawCoast(g: CanvasRenderingContext2D, W: number, H: number, sx: number, sz: number, mpp: number, reachX: number, reachZ: number): boolean {
    const vx0 = sx - reachX;
    const vx1 = sx + reachX;
    const vz0 = sz - reachZ;
    const vz1 = sz + reachZ;
    const reach = 400; // how far a face may reach past its square (m)
    const meets = (c: ChartCell) => c.x0 + c.size + reach > vx0 && c.x0 - reach < vx1 && c.z0 + c.size + reach > vz0 && c.z0 - reach < vz1;
    const shown: { piece: MeshArrays; paths: (Path2D[] | undefined)[]; cell: ChartCell; k: number }[] = [];
    const add = (piece: MeshArrays, box?: { x0: number; z0: number; size: number }) => {
      let o = this.outlines.get(piece);
      if (!o) {
        const cells = chartCells(piece, box);
        this.outlines.set(piece, (o = { cells, paths: cells.map(() => undefined) }));
      }
      o.cells.forEach((cell, k) => {
        if (meets(cell)) shown.push({ piece, paths: o!.paths, cell, k });
      });
    };
    for (const t of coastTerrains()) {
      if (t.x1 < vx0 || t.x0 > vx1 || t.z1 < vz0 || t.z0 > vz1) continue;
      if (t.piece) add(t.piece);
      else
        for (const [k, p] of t.pieces) {
          const c = t.chunked!.chunks[k];
          add(p, { x0: c.x0 + t.ox, z0: c.z0 + t.oz, size: c.size });
        }
    }
    // The hand-built regions the same, from the terrain their views have built (the world
    // view builds a region's mesh as the boat nears it, well inside the plotter's reach); the
    // sampled picture stays underneath until then, and for the far ones.
    if (this.landSource) {
      for (const r of REGIONS) {
        if (r.coast) continue;
        const b = r.bounds;
        if (b.x1 < vx0 || b.x0 > vx1 || b.z1 < vz0 || b.z0 > vz1) continue;
        let m = this.landMeshes.get(r.id);
        if (!m) {
          const pos = this.landSource(r.id);
          if (!pos) continue;
          this.landMeshes.set(r.id, (m = terrainMesh(pos)));
        }
        add(m);
      }
    }
    if (!shown.length) return false;
    // Make the missing outlines, nearest first, while there's time.
    const t0 = performance.now();
    const todo = shown.filter((s) => !s.paths[s.k]);
    todo.sort((a, b) => Math.hypot(a.cell.x0 + a.cell.size / 2 - sx, a.cell.z0 + a.cell.size / 2 - sz) - Math.hypot(b.cell.x0 + b.cell.size / 2 - sx, b.cell.z0 + b.cell.size / 2 - sz));
    for (const s of todo) {
      if (performance.now() - t0 > CONFIG.chartPlotter.buildMs) break;
      s.paths[s.k] = cellOutlines(s.piece, s.cell).map((d) => new Path2D(d));
    }
    const ready = shown.filter((s) => s.paths[s.k]);
    const pending = ready.length < shown.length;
    g.save();
    // In world metres from here on.
    g.setTransform(1 / mpp, 0, 0, 1 / mpp, W / 2 - sx / mpp, H / 2 - sz / mpp);
    g.fillStyle = css(this.palette.deep);
    for (const s of ready) g.fillRect(s.cell.x0, s.cell.z0, s.cell.size, s.cell.size);
    CHART_LEVELS.forEach((_, l) => {
      g.fillStyle = css(this.palette.bands[l]);
      for (const s of ready) g.fill(s.paths[s.k]![l]);
    });
    g.restore();
    return pending;
  }
}

/**
 * The chartplotter's coast drawn as shapes from the ground's mesh (owner, Oct 2026: on the
 * big maps the plotter's map was "too low"; nav/chartLand.ts).
 */
import { describe, expect, it } from 'vitest';
import { aboveLevel, CHART_CELL, CHART_LEVELS, cellOutlines, chartCells, terrainMesh } from '../src/nav/chartLand';
import { HOME } from '../src/world/regions/home';
import { buildTerrainArrays } from '../src/world/view/terrainMesh';
import type { CoastPiece } from '../src/world/coastTerrain';

/** The signed area of polygon (x, z, ...) (+ anticlockwise in the canvas's x-right, z-down sense of `aboveLevel`'s rule). */
const area = (p: number[]) => {
  let a = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1];
  }
  return a / 2;
};

/** A mesh of the given triangles (each x, z, height three times). */
const mesh = (tris: number[][]): CoastPiece => {
  const V: number[] = [];
  const F: number[] = [];
  for (const t of tris)
    for (let k = 0; k < 3; k++) {
      F.push(V.length / 3);
      V.push(t[3 * k], t[3 * k + 2], t[3 * k + 1]);
    }
  return { V: Float32Array.from(V), F: Uint32Array.from(F), C: new Uint8Array(F.length), x0: 0, z0: 0, bw: 1, bh: 1, start: new Uint32Array(2), faceList: new Uint32Array(0) };
};

describe('the chartplotter cut from the mesh', () => {
  it('a triangle crossing the waterline: the dry part, cut where the height passes 0 (straight between corners)', () => {
    // One corner 4 m up, two 4 m under: the shore runs halfway along the two edges from the high corner.
    const out: number[] = [];
    expect(aboveLevel([0, 0, 4, 10, 0, -4, 0, 10, -4], 0, out)).toBe(3);
    expect(out.map((v) => Math.round(v * 1000) / 1000).sort((a, b) => a - b)).toEqual([0, 0, 0, 0, 5, 5]);
    expect(area(out)).toBeCloseTo(12.5, 6);
    // Two corners up: four corners, the rest of it.
    const wet: number[] = [];
    expect(aboveLevel([0, 0, -4, 10, 0, 4, 0, 10, 4], 0, wet)).toBe(4);
    expect(area(wet)).toBeCloseTo(50 - 12.5, 6);
  });

  it('wholly above: the whole triangle; wholly below: nothing; and always the same way round', () => {
    const up: number[] = [];
    expect(aboveLevel([0, 0, 5, 0, 10, 5, 10, 0, 5], 0, up)).toBe(3); // given clockwise
    expect(area(up)).toBeGreaterThan(0);
    const down: number[] = [7];
    expect(aboveLevel([0, 0, -1, 10, 0, -1, 0, 10, -1], 0, down)).toBe(0);
    expect(down).toEqual([7]); // left as it was
  });

  it("a mesh's squares: faces in the square their middle is in; all-deep ones left out but their square still filled", () => {
    const shore = [100, 100, 5, 300, 100, -5, 100, 300, -5];
    const deep = [CHART_CELL + 100, 100, -40, CHART_CELL + 300, 100, -40, CHART_CELL + 100, 300, -40];
    const p = mesh([shore, deep]);
    const cells = chartCells(p);
    expect(cells.map((c) => [c.x0, c.z0, c.faces.length])).toEqual([
      [0, 0, 1],
      [CHART_CELL, 0, 0],
    ]);
    // A streamed square: everything in its own box.
    const box = chartCells(p, { x0: -50, z0: -50, size: 2000 });
    expect(box).toHaveLength(1);
    expect(box[0].size).toBe(2000);
  });

  it("each level's outline as a path the canvas reads; a face wholly above the next level gives nothing for this one", () => {
    const hill = mesh([[0, 0, 10, 100, 0, 10, 0, 100, 10]]);
    const [cell] = chartCells(hill);
    const d = cellOutlines(hill, cell);
    expect(d).toHaveLength(CHART_LEVELS.length);
    expect(d[0]).toBe('');
    expect(d[1]).toBe('');
    expect(d[2]).toMatch(/^M0\.0 0\.0L100\.0 0\.0L0\.0 100\.0Z$|^M0\.0 0\.0L0\.0 100\.0L100\.0 0\.0Z$/);
    // Across the shore, the shallows and the beach both have outlines.
    const shore = mesh([[0, 0, 2, 100, 0, -10, 0, 100, -10]]);
    const s = cellOutlines(shore, chartCells(shore)[0]);
    expect(s[0]).toMatch(/^M.*Z$/);
    expect(s[1]).toMatch(/^M.*Z$/);
    expect(s[2]).toBe('');
  });

  it("a hand-built region's drawn terrain cuts the same way: Calder Haven's square has a coastline and shallows (owner: the career map too)", () => {
    const m = terrainMesh(buildTerrainArrays(HOME).position);
    expect(m.F.length).toBe(m.V.length / 3);
    const cells = chartCells(m);
    expect(cells.length).toBeGreaterThanOrEqual(2);
    // Calder Haven (708, 625) lies in the 2 km square at (0, 0).
    const calder = cells.find((c) => c.x0 === 0 && c.z0 === 0)!;
    expect(calder).toBeTruthy();
    expect(calder.faces.length).toBeGreaterThan(100);
    const paths = cellOutlines(m, calder);
    expect(paths).toHaveLength(CHART_LEVELS.length);
    for (const d of paths) expect(d.startsWith('M')).toBe(true);
    // Deep squares out at sea hold no faces and give empty outlines.
    const deep = cells.find((c) => c.faces.length === 0);
    if (deep) expect(cellOutlines(m, deep).every((d) => d === '')).toBe(true);
  });
});

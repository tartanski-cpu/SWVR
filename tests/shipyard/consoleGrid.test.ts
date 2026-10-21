/**
 * The dash as a grid of quarter cells (dynamic console sockets CS1; shipyard/parts/consoleGrid.ts):
 * full screens 2 x 2, strips 2 x 1, quarters 1 x 1, placed by rules, empty columns dropped,
 * the row centred.
 */
import { describe, expect, it } from 'vitest';
import { packDash, placeOnDash } from '../../src/shipyard/parts/consoleGrid';

const F = [2, 2] as [number, number];
const S = [2, 1] as [number, number];
const Q = [1, 1] as [number, number];

describe('the dash grid', () => {
  it('full screens side by side; a quarter and a strip share a place, the strip at the bottom; full screens on even columns', () => {
    const { places, cols } = packDash([
      { id: 'speed', cells: F },
      { id: 'anchor', cells: Q },
      { id: 'heading', cells: F },
      { id: 'rpm', cells: F },
      { id: 'tow', cells: S },
    ]);
    const at = Object.fromEntries(places.map((p) => [p.id, [p.col, p.row]]));
    expect(at).toEqual({ speed: [0, 0], anchor: [2, 0], heading: [4, 0], rpm: [6, 0], tow: [2, 1] });
    expect(cols).toBe(8);
  });

  it('a lone quarter: its empty column dropped, the row closed up', () => {
    const { places, cols } = packDash([
      { id: 'speed', cells: F },
      { id: 'anchor', cells: Q },
      { id: 'rpm', cells: F },
    ]);
    expect(places.map((p) => [p.id, p.col])).toEqual([
      ['speed', 0],
      ['anchor', 2],
      ['rpm', 3],
    ]);
    expect(cols).toBe(5);
  });

  it('on the dash: centred; stacked ones above and below the middle; a lone quarter in the middle of the height, or over its strip', () => {
    const pitch = 0.2;
    const gap = 0.02;
    const cellH = 0.11;
    const stack = packDash([
      { id: 'speed', cells: F },
      { id: 'anchor', cells: Q },
      { id: 'tow', cells: S },
    ]);
    const put = (id: string, g = stack) => placeOnDash(g.places.find((p) => p.id === id)!, g.places, g.cols, 2, pitch, gap, cellH);
    // The row 4 cells across, centred: speed's centre at -0.2, the stack's at +0.2.
    expect(put('speed').x).toBeCloseTo(-0.2, 9);
    expect(put('speed').rise).toBe(0);
    expect(put('tow').x).toBeCloseTo(0.2, 9);
    expect(put('tow').rise).toBeCloseTo(-cellH / 2, 9);
    // The quarter over the strip: in the middle of the pair, above the middle.
    expect(put('anchor').x).toBeCloseTo(0.2, 9);
    expect(put('anchor').rise).toBeCloseTo(cellH / 2, 9);
    const lone = packDash([
      { id: 'speed', cells: F },
      { id: 'anchor', cells: Q },
    ]);
    expect(put('anchor', lone).rise).toBe(0);
    expect(put('anchor', lone).width).toBeCloseTo(pitch - gap, 9);
  });
});

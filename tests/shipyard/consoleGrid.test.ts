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

import { packPanel } from '../../src/shipyard/parts/consoleGrid';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN } from '../../src/shipyard/design';
import { CONFIG } from '../../src/config';

describe('the switch panel grid (CS2)', () => {
  const groups = [
    { title: 'LIGHTS', color: 1, side: 'port' as const, members: ['nav', 'cabin', 'wipers'] },
    { title: 'SEARCH', color: 2, side: 'port' as const, members: ['spot'] },
    { title: '', color: 0, side: 'wheelPort' as const, members: ['horn'] },
    { title: 'ENGINE', color: 3, side: 'starboard' as const, members: ['start', 'key'] },
    { title: 'DECK', color: 4, side: 'starboard' as const, members: ['anchor'] },
  ];

  it('port groups in from the port end, starboard ones from the starboard end, the horn by the wheel; members a pitch apart in their group', () => {
    const { at, runs, pitch } = packPanel(groups, 1.0, 0.14, 0.11, 0.36, 0.1);
    expect(pitch).toBe(0.14);
    expect(at.nav).toBeCloseTo(-1 + 0.07, 9);
    expect(at.cabin - at.nav).toBeCloseTo(0.14, 9);
    expect(at.spot).toBeCloseTo(-1 + 3.5 * 0.14, 9);
    expect(at.key).toBeCloseTo(1 - 0.07, 9);
    expect(at.anchor).toBeCloseTo(1 - 2.5 * 0.14, 9);
    expect(at.horn).toBeCloseTo(-0.11 - 0.07, 9);
    // The runs never overlap, and the groups keep clear of the wheel.
    const xs = runs.filter((r) => r.group.side !== 'wheelPort').map((r) => [r.x0, r.x1]).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < xs.length; i++) expect(xs[i][0]).toBeGreaterThanOrEqual(xs[i - 1][1] - 1e-9);
    for (const [x0, x1] of xs) expect(Math.min(Math.abs(x0), Math.abs(x1))).toBeGreaterThanOrEqual(0.36 - 1e-9);
  });

  it('a short console: the cells close up, but not under the least pitch', () => {
    expect(packPanel(groups, 0.8, 0.14, 0.11, 0.36, 0.1).pitch).toBeCloseTo((0.8 - 0.36) / 4, 9);
    expect(packPanel(groups, 0.6, 0.14, 0.11, 0.36, 0.1).pitch).toBe(0.1);
  });

  it('on her console: each switch in its group’s plate, the groups apart, none off the panel (every hull type, basic and advanced)', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++) {
      if (DESIGN_HULLS[hull].retired) continue;
      for (const controls of [0, 1]) {
        const helm = buildDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, controls }).recipe.modules.find((m) => m.socket === 'helm')!;
        const cc = helm.config as { dash: { halfWidth: number }; groups: { title: string; x: [number, number] }[]; slots: Record<string, { position: number[] }>; panelGrid: { runs: { title: string; members: string[] }[] } };
        for (const run of cc.panelGrid.runs.filter((r) => r.title)) {
          const plate = cc.groups.find((g) => g.title === run.title)!;
          for (const id of run.members) {
            const x = cc.slots[id].position[0];
            expect(x, `${hull}/${controls} ${id}`).toBeGreaterThan(plate.x[0]);
            expect(x).toBeLessThan(plate.x[1]);
          }
          expect(plate.x[0]).toBeGreaterThanOrEqual(-cc.dash.halfWidth - 1e-6);
          expect(plate.x[1]).toBeLessThanOrEqual(cc.dash.halfWidth + 1e-6);
        }
        const plates = cc.groups.map((g) => g.x).sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < plates.length; i++) expect(plates[i][0]).toBeGreaterThanOrEqual(plates[i - 1][1] - 1e-6);
        expect(CONFIG.shipyard.helm.switchPitch).toBeGreaterThan(0);
      }
    }
  });
});

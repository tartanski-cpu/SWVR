/**
 * The helm in the skipper's view however wide the wheelhouse (owner, Oct 2026: on a wide one
 * "the instruments are very widely spaced apart ... you can't see them all when you're
 * steering"; "cut the console short", to port, the middle or starboard): the console no longer
 * than maxConsole, its screens in one row over the wheel, the hung units within reach of it.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';

const type = (hull: number, more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, ...more });
const helmOf = (d: ShipDesign) => {
  const b = buildDesign(d);
  const helm = b.recipe.modules.find((m) => m.socket === 'helm')!;
  const cfg = helm.config as { dash: { halfWidth: number }; slots: Record<string, { position: [number, number, number] }> };
  const all = helm.modules!.filter((m) => m.module === 'instrument.screen');
  const screens = all.map((m) => cfg.slots[m.socket].position[0]);
  // Each with its width (a strip or a quarter says its own: the ANCHOR's), left to right.
  const row = all.map((m) => ({ x: cfg.slots[m.socket].position[0], w: (m.config as { width?: number }).width ?? CONFIG.modules.screen.dash.width })).sort((p, q) => p.x - q.x);
  return { b, cfg, helm, screens, row };
};
/** The row as on the reference console: each screen its width and the gap from the next, centred over the wheel. */
function inRow(row: { x: number; w: number }[]): void {
  const gap = CONFIG.shipyard.helm.screenGap;
  for (let i = 1; i < row.length; i++) expect(row[i].x - row[i - 1].x).toBeCloseTo((row[i].w + row[i - 1].w) / 2 + gap, 2);
  expect(row[0].x - row[0].w / 2 + row[row.length - 1].x + row[row.length - 1].w / 2).toBeCloseTo(0, 2);
}
/** The screen's width and the gap: the row's pitch. */
const pitch = CONFIG.modules.screen.dash.width + CONFIG.shipyard.helm.screenGap;

describe('the helm in view on a wide wheelhouse', () => {
  it('the screens stand in one row over the wheel, as on the reference console, however wide the dash', () => {
    for (const d of [type(2, { beam: 15, houseWidth: 1 }), type(4, { beam: 15, houseWidth: 1 }), type(2)]) {
      const { cfg, row } = helmOf(d);
      // Speed, the ANCHOR quarter, heading, rpm, the engine monitor.
      expect(row).toHaveLength(5);
      inRow(row);
      expect(cfg.dash.halfWidth).toBeLessThanOrEqual(CONFIG.shipyard.helm.maxConsole / 2); // (cut short on a wide one)
    }
  });

  it('with the basic controls, its two screens side by side over the wheel (the ANCHOR between)', () => {
    const { row } = helmOf(type(2, { beam: 15, houseWidth: 1, controls: 0 }));
    // Speed and rpm, the ANCHOR quarter between them.
    expect(row.map((r) => r.w)).toEqual([pitch - CONFIG.shipyard.helm.screenGap, CONFIG.modules.screen.dash.width / 2, pitch - CONFIG.shipyard.helm.screenGap]);
    inRow(row);
  });

  it('a wide wheelhouse’s console is cut short, with floor beside it; to port or starboard against that wall, its helm with it', () => {
    const wide = (more: Partial<ShipDesign> = {}) => type(2, { beam: 15, houseWidth: 1, ...more });
    for (const side of [0, 1, 2]) {
      const { b, cfg, screens } = helmOf(wide({ consoleSide: side }));
      const wh = b.hull.layout.wheelhouse!;
      const span = wh.consoleSpan!;
      expect(span.x1 - span.x0).toBeCloseTo(CONFIG.shipyard.helm.maxConsole, 2);
      const cx = (span.x0 + span.x1) / 2;
      if (side === 1) expect(span.x0).toBeCloseTo(-(wh.halfWidth - wh.wall), 2);
      if (side === 2) expect(span.x1).toBeCloseTo(wh.halfWidth - wh.wall, 2);
      if (side === 0) expect(cx).toBeCloseTo(0, 3);
      // The console module, the helm stand and the screen over the helm at its middle.
      const sock = (id: string) => b.hull.sockets.find((s) => s.id === id)?.transform?.position;
      expect(sock('helm')![0]).toBeCloseTo(cx, 3);
      expect(b.hull.helm.stand[0]).toBeCloseTo(cx, 3);
      expect(sock('navDisplay')?.[0] ?? cx).toBeCloseTo(cx, 3);
      expect(cfg.dash.halfWidth).toBeCloseTo(CONFIG.shipyard.helm.maxConsole / 2 - 0.11, 3);
      expect(screens).toHaveLength(5);
      for (const id of ['vhf', 'chartplotter', 'fm']) {
        const p = sock(id);
        if (p) expect(Math.abs(p[0] - cx), id).toBeLessThanOrEqual(CONFIG.shipyard.helm.hungReach + 1e-6);
      }
    }
  });

  it('beside a short console the floor runs to the front wall; across from it, the console is solid', async () => {
    const { useDesign } = await import('../../src/boats/sims');
    const { vesselWalkArea } = await import('../../src/vessel/layout');
    const { VESSEL_DEFS } = await import('../../src/vessel/vesselDef');
    useDesign(type(2, { beam: 15, houseWidth: 1, consoleSide: 1 }));
    const def = VESSEL_DEFS.design;
    const wh = def.layout.wheelhouse!;
    const area = vesselWalkArea(def, def.layout, []);
    const zFront = wh.front + wh.wall + (wh.consoleBack ?? 0) + 0.3;
    // Starboard, beside the console (it stands to port): walkable near the front wall.
    expect(area.walkable(wh.consoleSpan!.x1 + 0.5, zFront, wh.floorY)).toBe(true);
    // In front of the console itself: not.
    expect(area.walkable((wh.consoleSpan!.x0 + wh.consoleSpan!.x1) / 2, zFront, wh.floorY)).toBe(false);
    useDesign(DEFAULT_DESIGN);
  });

  it('a console as wide as a narrow cabin stays wall to wall (no span); its code reads back', async () => {
    const { b } = helmOf(type(0, { consoleSide: 2 }));
    const wh = b.hull.layout.wheelhouse!;
    if (2 * (wh.halfWidth - wh.wall) <= CONFIG.shipyard.helm.maxConsole) expect(wh.consoleSpan).toBeUndefined();
    const { decodeDesign, encodeDesign } = await import('../../src/shipyard/design');
    const d = type(2, { consoleSide: 2 });
    expect(decodeDesign(encodeDesign(d))).toEqual({ design: d });
  });
});

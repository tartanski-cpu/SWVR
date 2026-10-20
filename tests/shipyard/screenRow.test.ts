/**
 * The console's screens never overlap (owner, Oct 2026: "the smallest landing craft
 * wheelhouse and the instruments overlap"): side by side at their full size when the row fits
 * the dash, all smaller together when it doesn't, never wider than the dash.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';

function row(d: ShipDesign) {
  const helm = buildDesign(d).recipe.modules.find((m) => m.socket === 'helm')!;
  const cc = helm.config as { dash: { halfWidth: number }; slots: Record<string, { position: number[] }> };
  const screens = helm.modules!.filter((m) => m.module === 'instrument.screen').map((m) => ({ x: cc.slots[m.socket].position[0], w: (m.config as { width?: number }).width ?? CONFIG.modules.screen.dash.width }));
  return { half: cc.dash.halfWidth, screens: screens.sort((a, b) => a.x - b.x) };
}

describe('the console screen row', () => {
  it('never overlaps nor runs off the dash, on any hull type small or large, basic or advanced', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++) {
      if (DESIGN_HULLS[hull].retired) continue;
      for (const size of [0, 15])
        for (const controls of [0, 1]) {
          const { half, screens } = row({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, length: size, beam: size, controls, sternRoller: 1 });
          for (let i = 1; i < screens.length; i++) expect(screens[i].x - screens[i - 1].x, `hull ${hull} size ${size} controls ${controls}`).toBeGreaterThanOrEqual((screens[i].w + screens[i - 1].w) / 2 - 1e-6);
          const first = screens[0];
          const last = screens[screens.length - 1];
          expect(last.x + last.w / 2).toBeLessThanOrEqual(half + 1e-3);
          expect(first.x - first.w / 2).toBeGreaterThanOrEqual(-half - 1e-3);
        }
    }
  });

  it('the basic controls’ two screens keep their full size even on the smallest landing craft', () => {
    const { screens } = row({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[0].defaults, hull: 0, length: 0, beam: 0, controls: 0 });
    expect(screens).toHaveLength(2);
    for (const s of screens) expect(s.w).toBe(CONFIG.modules.screen.dash.width);
  });
});

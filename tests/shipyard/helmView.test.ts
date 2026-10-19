/**
 * The helm in the skipper's view however wide the wheelhouse (owner, Oct 2026: on a wide one
 * "the instruments are very widely spaced apart ... you can't see them all when you're
 * steering"): the screens in one row centred over the wheel, the switches spread only so far,
 * the hung units no further out than in view.
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
  const screens = helm.modules!.filter((m) => m.module === 'instrument.screen').map((m) => cfg.slots[m.socket].position[0]);
  return { b, cfg, helm, screens };
};
/** The screen's width and the gap: the row's pitch. */
const pitch = CONFIG.modules.screen.dash.width + CONFIG.shipyard.helm.screenGap;

describe('the helm in view on a wide wheelhouse', () => {
  it('the screens stand in one row over the wheel, as on the reference console, however wide the dash', () => {
    for (const d of [type(2, { beam: 15, houseWidth: 7 }), type(4, { beam: 15, houseWidth: 7 }), type(2)]) {
      const { cfg, screens } = helmOf(d);
      expect(screens.sort((a, c) => a - c)).toEqual([-1.5, -0.5, 0.5, 1.5].map((k) => Math.round(k * pitch * 1000) / 1000));
      if (d.beam === 15) expect(cfg.dash.halfWidth).toBeGreaterThan(1.5); // (a wide one)
    }
  });

  it('with the basic controls, its two screens side by side over the wheel', () => {
    const { screens } = helmOf(type(2, { beam: 15, houseWidth: 7, controls: 0 }));
    expect(screens.sort((a, c) => a - c)).toEqual([-0.5, 0.5].map((k) => Math.round(k * pitch * 1000) / 1000));
  });

  it('the switches spread no further than maxSpread times the reference; the hung units within reach of view', () => {
    const { b, cfg } = helmOf(type(2, { beam: 15, houseWidth: 7 }));
    const ref = 0.88; // the reference dash's half width
    for (const [id, s] of Object.entries(cfg.slots)) expect(Math.abs(s.position[0]), id).toBeLessThanOrEqual(ref * CONFIG.shipyard.helm.maxSpread + 1e-6);
    for (const id of ['vhf', 'chartplotter', 'fm']) {
      const p = b.hull.sockets.find((s) => s.id === id)?.transform?.position;
      if (p) expect(Math.abs(p[0]), id).toBeLessThanOrEqual(CONFIG.shipyard.helm.hungReach + 1e-6);
    }
  });
});

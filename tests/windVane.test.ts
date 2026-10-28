/**
 * The masthead wind vane (owner, Oct 2026: "every ship should have ... a Windex";
 * modules/windVane): it swings round to point into the apparent wind, a little past it and
 * back (it's damped, not dead-beat), faster in a stronger wind; in a near calm it stays put;
 * and the boats carry it on top of their masthead light (the starter workboat's wind sock off).
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { vaneStep } from '../src/modules/windVane';
import { buildDesign, DESIGN_HULLS } from '../src/shipyard/build';
import { DEFAULT_DESIGN } from '../src/shipyard/design';
import landingCraft from '../src/boats/landingCraft.json';
import alaskan38 from '../src/boats/alaskan38.json';
import starterWorkboat from '../src/boats/starterWorkboat.json';

const c = CONFIG.modules.windVane;
const deg = (r: number) => (r * 180) / Math.PI;

/** Swing it from `yaw0` toward a wind from `windDeg` at `speed` for `s` seconds; its yaw each 1/60 s. */
function swing(yaw0: number, windDeg: number, speed: number, s: number): number[] {
  let yaw = yaw0;
  let rate = 0;
  const out: number[] = [];
  for (let i = 0; i < s * 60; i++) {
    [yaw, rate] = vaneStep(yaw, rate, (windDeg * Math.PI) / 180, speed, 1 / 60, c);
    out.push(deg(yaw));
  }
  return out;
}

describe('masthead wind vane', () => {
  it('swings round into the wind, past it a little and back, and settles', () => {
    const path = swing(0, 90, 6, 3);
    expect(path.at(-1)).toBeCloseTo(90, 0);
    expect(Math.max(...path)).toBeGreaterThan(95); // overshoots
    expect(Math.max(...path)).toBeLessThan(130); // but not wildly
  });

  it('a stronger wind swings it round faster', () => {
    const firstPast = (path: number[]) => path.findIndex((y) => y > 80);
    expect(firstPast(swing(0, 90, 10, 2))).toBeLessThan(firstPast(swing(0, 90, 3, 2)));
  });

  it('the short way round: from just off ahead to just off astern it turns through the nearer side', () => {
    const path = swing((-10 * Math.PI) / 180, -170, 6, 3);
    expect(Math.abs(Math.abs(path.at(-1)!) - 170)).toBeLessThan(2);
    expect(Math.min(...path)).toBeLessThan(-90); // round by port, not through ahead and starboard
  });

  it('in a near calm it stays where it is', () => {
    const path = swing(0.5, 90, c.minWind * 0.5, 2);
    expect(path.every((y) => Math.abs(y - deg(0.5)) < 1e-9)).toBe(true);
  });

  it('the boats carry it on top of the masthead light; the starter workboat loses her wind sock', () => {
    const vaneOn = (mods: any[]): boolean => mods.some((m) => (m.module === 'light.navigation' && (m.modules ?? []).some((v: any) => v.module === 'mount.wind-vane')) || vaneOn(m.modules ?? []));
    expect(vaneOn(landingCraft.modules)).toBe(true);
    expect(vaneOn(alaskan38.modules)).toBe(true);
    expect(vaneOn(starterWorkboat.modules)).toBe(true);
    expect((starterWorkboat.modules.find((m: any) => m.module === 'mount.mast') as any).config).toMatchObject({ windSock: false });
    // A Shipyard design (the harbour tug), built from the landing craft's recipe.
    const H = DESIGN_HULLS.findIndex((h) => h.name.startsWith('Harbour tug'));
    const b = buildDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[H].defaults, hull: H });
    expect(vaneOn(b.recipe.modules as any[])).toBe(true);
  });
});

/**
 * A narrow console for a narrow wheelhouse (CS6; owner, Oct 2026: "an option that allows you to
 * make a more narrow console, so we can have more narrow wheelhouses"; "the switches can go on
 * the upright part as well"): the console as long as set, the switch groups that don't fit its
 * flat panel up on the dash face beside the screens, and wheelhouses down to 1.2 m inside.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { transformMatrix } from '../../src/modular/assemble';
import { CONSOLE } from '../../src/modules/console';
import { SCREEN } from '../../src/modules/screen';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { useDesign } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { validateRecipe } from '../../src/modular/recipe';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { consoleLengthM, DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';

type V3 = [number, number, number];
type Helm = { dash: { halfWidth: number; aft: number; bottom: number }; leanDeg?: number; consoleMin: number; slots: Record<string, { position: V3; rotationDeg?: V3 }>; faceGroups?: { title: string; x: [number, number]; y: [number, number] }[]; groups: { title: string }[] };
const helmOf = (d: ShipDesign) => {
  const b = useDesign(d);
  const helm = b.recipe.modules.find((m) => m.socket === 'helm')!;
  return { b, helm, cc: helm.config as unknown as Helm };
};
const type = (hull: number, more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, ...more });
/** consoleLen's step for a length (m). */
const lenStep = (m: number) => Math.round((m - 0.75) / 0.05);
const SWITCHES = ['navLights', 'cabinLight', 'wipers', 'spotlight', 'firePump', 'start', 'key', 'anchor', 'skiffCrane'];

describe('a narrow console', () => {
  it('is as long as set: a touchscreen boat on 1.2 m holds it all, the switch groups that don’t fit the flat panel up on the dash face', () => {
    expect(consoleLengthM(lenStep(1.2))).toBe(1.2);
    const { b, helm, cc } = helmOf(type(0, { controls: 1, touch: 1, consoleLen: lenStep(1.2) }));
    expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
    expect(cc.dash.halfWidth).toBeCloseTo(0.6 - 0.11, 3);
    const face = cc.faceGroups ?? [];
    expect(face.length).toBeGreaterThan(0);
    // Each switch on the face stands on it, square out from the leaning face, inside the dash.
    const lean = Math.tan(((cc.leanDeg ?? 0) * Math.PI) / 180);
    const onFace = SWITCHES.filter((id) => cc.slots[id]?.rotationDeg && helm.modules!.some((m) => m.socket === id));
    expect(onFace.length).toBeGreaterThan(2);
    for (const id of onFace) {
      const [x, y, z] = cc.slots[id].position;
      expect(z, id).toBeCloseTo(cc.dash.aft - (y - cc.dash.bottom) * lean, 2);
      expect(Math.abs(x), id).toBeLessThanOrEqual(cc.dash.halfWidth);
    }
    // No two switches on top of each other.
    for (let i = 0; i < onFace.length; i++)
      for (let j = i + 1; j < onFace.length; j++) {
        const [a, c] = [cc.slots[onFace[i]].position, cc.slots[onFace[j]].position];
        expect(Math.hypot(a[0] - c[0], a[1] - c[1]), `${onFace[i]} ${onFace[j]}`).toBeGreaterThan(0.05);
      }
    // The groups on the face aren't also on the flat panel.
    for (const g of face) expect(cc.groups.map((q) => q.title)).not.toContain(g.title);
    // It says how short a console holds it all full size: about a metre and a quarter with a
    // touchscreen; at that length, no warning; shorter, the Shipyard says so.
    expect(cc.consoleMin).toBeLessThanOrEqual(1.4);
    const atMin = helmOf(type(0, { controls: 1, touch: 1, consoleLen: lenStep(cc.consoleMin) }));
    expect(atMin.b.warnings.filter((w) => /too short/.test(w))).toEqual([]);
    if (cc.consoleMin > 1.2) expect(b.warnings.join(' ')).toMatch(/too short to show her instruments full size/);
  });

  it('on every hull type, basic and advanced, at its shortest: every switch still on the console, a valid boat; too short says so', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++) {
      if (DESIGN_HULLS[hull].retired) continue;
      for (const controls of [0, 1]) {
        const d = type(hull, { controls, consoleLen: 1 });
        const { b, helm, cc } = helmOf(d);
        expect(validateRecipe(RECIPES.design, LIBRARY), `hull ${hull} controls ${controls}`).toEqual([]);
        expect(cc.dash.halfWidth).toBeLessThanOrEqual(0.4 - 0.11 + 1e-3);
        for (const id of SWITCHES) if (helm.modules!.some((m) => m.socket === id)) expect(cc.slots[id], `${id} placed`).toBeDefined();
        if (cc.consoleMin > 0.8) expect(b.warnings.join(' '), `hull ${hull}`).toMatch(/too short to show her instruments full size/);
      }
    }
  });

  it('a full-width console (the default) is as it was: as wide as the wheelhouse, up to the longest', () => {
    const { b, cc } = helmOf(type(3, { beam: 15, houseWidth: 1 }));
    const wh = b.hull.layout.wheelhouse!;
    expect(cc.dash.halfWidth).toBeCloseTo(Math.min(wh.halfWidth - wh.wall, CONFIG.shipyard.helm.maxConsole / 2) - 0.11, 3);
  });

  it('the wheelhouse goes down to 1.2 m inside (it was 1.7), on any hull type: the Width slider goes down to 0.4 of the deck', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++) {
      if (DESIGN_HULLS[hull].retired) continue;
      const b = buildDesign(type(hull, { length: 0, beam: 0, houseWidth: 0.4 }));
      const wh = b.hull.layout.wheelhouse!;
      const inside = 2 * (wh.halfWidth - wh.wall);
      expect(inside, DESIGN_HULLS[hull].name).toBeGreaterThanOrEqual(CONFIG.shipyard.helm.minInside - 1e-3);
      expect(inside, DESIGN_HULLS[hull].name).toBeLessThan(1.7);
    }
  });
});

describe('a faceted front’s dash (owner, Oct 2026, the pilot boat: "some of the instruments are effectively clipped")', () => {
  it('on every hull type, basic and advanced: every dash screen lies on one facet, flat on its face, none buried across a wing’s corner', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++) {
      if (DESIGN_HULLS[hull].retired) continue;
      for (const controls of [0, 1]) {
        const { helm, cc } = helmOf(type(hull, { controls, facets: 1 }));
        const c = cc as unknown as Helm & { wrap?: { centre: number; k: number } };
        if (!c.wrap) continue;
        const lean = Math.tan(((c.leanDeg ?? 0) * Math.PI) / 180);
        const setback = (x: number) => Math.max(0, Math.abs(x) - c.wrap!.centre) * c.wrap!.k;
        const sockets = CONSOLE.sockets!(helm.config as never);
        for (const m of helm.modules!) {
          if (m.module !== 'instrument.screen') continue;
          let plane: THREE.BufferGeometry | null = null;
          SCREEN.view!.build({ config: { mount: 'dash', ...(m.config as object) }, display: (_s: unknown, p: THREE.BufferGeometry) => (plane = p) } as never);
          (plane as unknown as THREE.BufferGeometry).applyMatrix4(transformMatrix(sockets.find((s) => s.id === m.socket)!.transform));
          const pos = (plane as unknown as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
          for (let i = 0; i < pos.count; i++) {
            const gap = pos.getZ(i) - (c.dash.aft + setback(pos.getX(i)) - (pos.getY(i) - c.dash.bottom) * lean);
            expect(gap, `hull ${hull} controls ${controls} ${m.socket}`).toBeGreaterThan(0.002);
            expect(gap, `hull ${hull} controls ${controls} ${m.socket}`).toBeLessThan(0.012);
          }
        }
      }
    }
  });
});

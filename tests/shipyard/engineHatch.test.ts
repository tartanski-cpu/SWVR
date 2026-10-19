/**
 * A Shipyard design's engine where her shaft line puts it (owner, Oct 2026: the box under the
 * wheelhouse "is not where the engine will go"): its hatch and engine space over it, in the
 * deck or the cabin floor; the game draws the engine there, as the Shipyard's Engine step
 * does; the hatch, open, is a hole you can't step into, at its own height.
 */
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { useDesign } from '../../src/boats/sims';
import { assembleView } from '../../src/modular/assemble';
import { buildDesign, ENGINES } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';
import { bottomAt } from '../../src/shipyard/machinery';
import { hullFormOf } from '../../src/modular/hull';
import { hullPlan, vesselWalkArea, STEP_HEIGHT } from '../../src/vessel/layout';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { buildVesselMeshParts } from '../../src/vessel/view/hullMesh';
import { engineGeometry } from '../../src/vessel/view/engineModels';
import { fakeCanvas } from '../modular/fakes';

beforeAll(fakeCanvas);
afterAll(() => useDesign(DEFAULT_DESIGN));

/** A spread of designs: every hull, the house forward to aft, each engine, single and twin, with and without deck gear. */
const SPREAD: ShipDesign[] = [];
for (const hull of [0, 1, 2, 3, 4])
  for (const housePos of [0, 8, 15])
    for (const engine of [0, 1, 3])
      for (const twin of [0, 1]) for (const gear of [0, 1]) SPREAD.push({ ...DEFAULT_DESIGN, hull, housePos, engine, twin, ...(gear ? { towWinch: 1, deckCrane: 1, sternRoller: 1, chartTable: 1 } : {}) });

describe('the engine on her shaft line, its hatch over it', () => {
  it('the hatch is in the cabin floor (inside the house) or the deck (clear of it), its engine space inside her hull', () => {
    for (const d of SPREAD) {
      const b = buildDesign(d);
      const eh = b.hull.layout.engineHatch!;
      const wh = b.hull.layout.wheelhouse!;
      const form = hullFormOf(b.hull.form);
      const plan = hullPlan({ hull: form });
      if (eh.y === undefined) {
        expect(eh.z0).toBeGreaterThan(wh.front);
        expect(eh.z1).toBeLessThan(wh.aft);
        expect(Math.max(-eh.x0, eh.x1)).toBeLessThan(wh.halfWidth - wh.wall);
      } else {
        expect(eh.z1 < wh.front || eh.z0 > wh.aft).toBe(true);
        for (const z of [eh.z0, eh.z1]) expect(Math.max(-eh.x0, eh.x1)).toBeLessThan(plan.halfBeam(z) - 0.3);
        expect(eh.y).toBeCloseTo(plan.deckY((eh.z0 + eh.z1) / 2), 2);
      }
      // Its floor over her bottom under every corner of it.
      const top = eh.y ?? wh.floorY;
      for (const z of [eh.z0, eh.z1]) for (const x of [eh.space?.x0 ?? eh.x0, eh.space?.x1 ?? eh.x1]) expect(top - eh.pitDepth).toBeGreaterThan(bottomAt(form, x, z));
      // The hatch module and the dipstick are where the hatch is.
      const sock = (id: string) => b.hull.sockets.find((s) => s.id === id)!.transform!.position!;
      expect(sock('engineHatch')[1]).toBeCloseTo(top, 3);
      const dip = sock('dipstick');
      expect(dip[0]).toBeGreaterThanOrEqual(eh.x0);
      expect(dip[0]).toBeLessThanOrEqual(eh.x1);
      expect(dip[2]).toBeGreaterThanOrEqual(eh.z0);
      expect(dip[2]).toBeLessThanOrEqual(eh.z1);
      expect(dip[1] + 0.16).toBeLessThan(top);
    }
  });

  it('the hatch is over the engine when nothing stands in the way', () => {
    let over = 0;
    for (const d of SPREAD.filter((x) => !x.towWinch)) {
      const b = buildDesign(d);
      const eh = b.hull.layout.engineHatch!;
      const L = ENGINES[d.engine].size[0];
      if (Math.min(eh.z1, b.shaft.flangeZ) - Math.max(eh.z0, b.shaft.flangeZ - L) > 0.3) over++;
    }
    // (A few have the engine under the helm, where the floor is kept clear to stand.)
    expect(over / SPREAD.filter((x) => !x.towWinch).length).toBeGreaterThan(0.85);
  });

  it('keeps clear of her deck gear: the hatch never costs her a piece of it', () => {
    for (const d of SPREAD.filter((x) => x.towWinch)) {
      const b = buildDesign(d);
      const eh = b.hull.layout.engineHatch!;
      if (eh.y === undefined) continue;
      for (const id of ['towWinch', 'deckCrane', 'sternRoller']) {
        const p = b.hull.sockets.find((s) => s.id === id)?.transform?.position;
        if (p) expect(p[0] > eh.x0 && p[0] < eh.x1 && p[2] > eh.z0 && p[2] < eh.z1).toBe(false);
      }
    }
  });

  it('the deck is cut away over a deck hatch; open, it is a hole at the deck’s height', () => {
    const b = useDesign(DEFAULT_DESIGN);
    const def = VESSEL_DEFS.design;
    const eh = def.layout.engineHatch!;
    expect(eh.y).toBeDefined(); // (the default design's engine is under her foredeck)
    const hull = buildVesselMeshParts(def.hull, def.layout, def.exhaust?.position, def.livery).hull;
    const pos = hull.geometry.getAttribute('position');
    let inOpening = 0;
    for (let i = 0; i < pos.count; i += 3) {
      const tri = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, i + k));
      if (tri.every((v) => v.x > eh.x0 + 0.01 && v.x < eh.x1 - 0.01 && v.z > eh.z0 + 0.01 && v.z < eh.z1 - 0.01 && Math.abs(v.y - eh.y!) < 0.05)) inOpening++;
    }
    expect(inOpening).toBe(0);
    const area = vesselWalkArea(def, def.layout, []);
    const mx = (eh.x0 + eh.x1) / 2;
    const mz = (eh.z0 + eh.z1) / 2;
    expect(area.walkable(mx, mz, eh.y!)).toBe(true);
    area.setHatchOpen!(true);
    expect(area.walkable(mx, mz, eh.y!)).toBe(false);
    expect(area.walkable(mx, mz, eh.y! + 2 * STEP_HEIGHT + 1)).toBe(false);
    expect(b.figures.engine).toContain('280');
  });

  it('twin engines, a shaft either side: the engine space spans both, the sea kept out of it', () => {
    const d = { ...DEFAULT_DESIGN, hull: 4, housePos: 8, engine: 1, twin: 1 };
    const b = useDesign(d);
    const eh = b.hull.layout.engineHatch!;
    const ex = b.shaft.x;
    const W = ENGINES[1].size[1];
    expect(ex).toBeGreaterThan(0.3);
    // The hatch over the starboard engine; the space across both engines' outer sides.
    expect(eh.x0).toBeLessThan(ex);
    expect(eh.x1).toBeGreaterThan(ex);
    expect(eh.space!.x0).toBeLessThan(-ex - W / 2 + 0.01);
    expect(eh.space!.x1).toBeGreaterThan(ex + W / 2 - 0.01);
    // Both engines drawn, and a water stop filling the space (its floor is below her waterline).
    const engine = b.recipe.modules.find((m) => m.socket === 'engine')!.config as { installed: { xs: number[] } };
    expect(engine.installed.xs).toEqual([-ex, ex]);
    const view = assembleView(RECIPES.design, VESSEL_DEFS.design, LIBRARY);
    const stops: THREE.Object3D[] = [];
    for (const m of view.modules) m.root.traverse((o) => o.name === 'waterStop' && stops.push(o));
    expect(stops).toHaveLength(1);
    expect(eh.y! - eh.pitDepth).toBeLessThan(0.3);
  });

  it('the game draws her engine at its place on the shaft, at its size', () => {
    const b = buildDesign(DEFAULT_DESIGN);
    const engine = b.recipe.modules.find((m) => m.socket === 'engine')!.config as { installed: { model: number; size: [number, number, number]; xs: number[]; flangeY: number; flangeZ: number; angleDeg: number } };
    const inst = engine.installed;
    expect(inst.model).toBe(DEFAULT_DESIGN.engine);
    expect(inst.flangeZ).toBeCloseTo(b.shaft.flangeZ, 2);
    const box = new THREE.Box3();
    for (const g of engineGeometry(inst.model, inst.size, { x: 0, flangeY: inst.flangeY, flangeZ: inst.flangeZ, angleDeg: inst.angleDeg })) {
      g.computeBoundingBox();
      box.union(g.boundingBox!);
    }
    const [L, W] = inst.size;
    expect(box.max.x - box.min.x).toBeCloseTo(W, 2);
    // Forward of its flange by its length (tilted 10°: a little less along her), aft end at the flange.
    expect(box.min.z).toBeGreaterThan(inst.flangeZ - L - 0.05);
    expect(box.min.z).toBeLessThan(inst.flangeZ - 0.9 * L);
    expect(box.max.z).toBeLessThan(inst.flangeZ + 0.2);
    // Its top under the deck or floor over it (it fits, the default design).
    expect(b.shaft.fits).toBe(true);
    expect(box.max.y).toBeLessThan(b.shaft.topY + 0.01);
  });
});

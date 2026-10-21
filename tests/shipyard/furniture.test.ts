/**
 * Parametric boats P5 (owner): furniture. A berth, settee, galley, seat, locker and a head
 * with a door, each pinned (design.berthAt and the rest) and placed by the builder on the
 * floor its pin is over, against the nearest wall, clear of the helm, the doorways, the
 * companionway and each other (shipyard/parts/furniture.ts); each a furniture.piece module on
 * a place of its own, with its footprint for walking (modules/furniture).
 */
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { footprintsOf, useDesign } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { hullFormOf } from '../../src/modular/hull';
import { validateRecipe } from '../../src/modular/recipe';
import { FURNITURE, FURNITURE_KINDS, type FurnitureConfig } from '../../src/modules/furniture';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, furnitureCell, type ShipDesign } from '../../src/shipyard/design';
import { designToken, readDesign, shortCode } from '../../src/shipyard/designDoc';
import { vesselWalkArea } from '../../src/vessel/layout';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { fakeCanvas } from '../modular/fakes';

beforeAll(fakeCanvas);
afterAll(() => useDesign(DEFAULT_DESIGN));

const PILOT = 3;
// The pilot boat with a 3 m saloon aft of her wheelhouse: room for everything.
const base: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[PILOT].defaults, hull: PILOT, saloon: 3 };
const plain = buildDesign(base);
const wh = plain.hull.layout.wheelhouse!;
const transom = hullFormOf(plain.hull.form).stations[0].z;
const pin = (x: number, z: number) => furnitureCell(x, transom - z);
const furnished: ShipDesign = {
  ...base,
  headAt: pin(1.2, wh.aft - 1),
  lockerAt: pin(-1.2, wh.aft - 1.5),
  galleyAt: pin(1.3, (wh.front + wh.aft) / 2 + 1),
  setteeAt: pin(-1.3, wh.aft - 3),
  berthAt: pin(-1.3, (wh.front + wh.aft) / 2 - 0.3),
  seatAt: pin(-0.7, wh.front + 1.6),
};
/** Each piece's plan (x0, x1, z0, z1) from its place and size. */
function plans(b: ReturnType<typeof buildDesign>) {
  return b.recipe.modules
    .filter((m) => m.module === 'furniture.piece')
    .map((m) => {
      const c = m.config as unknown as FurnitureConfig;
      const s = b.hull.sockets.find((q) => q.id === m.socket)!;
      const [x, y, z] = s.transform.position;
      const side = Math.abs(s.transform.rotationDeg?.[1] ?? 0) === 90;
      const [hx, hz] = side ? [c.depth / 2, c.length / 2] : [c.length / 2, c.depth / 2];
      return { kind: c.kind, c, y, rect: [x - hx, x + hx, z - hz, z + hz] as [number, number, number, number] };
    });
}

describe('furniture', () => {
  it('travels as a link or file (not in the short code); none is as before', () => {
    expect(DEFAULT_DESIGN.berthAt).toBe(0);
    expect(shortCode(furnished)).toBeNull();
    expect(readDesign(designToken(furnished))).toMatchObject({ design: furnished });
    expect(plain.recipe.modules.some((m) => m.module === 'furniture.piece')).toBe(false);
  });

  it('every piece placed, in the house, against its walls, clear of the helm, the aft doorway and each other; her recipe holds; weighed and priced', () => {
    const b = buildDesign(furnished);
    expect(b.warnings.filter((w) => /berth|settee|galley|seat|locker|head/.test(w))).toEqual([]);
    const ps = plans(b);
    expect(ps.map((q) => q.kind).sort()).toEqual(['berth', 'galley', 'head', 'locker', 'seat', 'settee']);
    const inside = wh.halfWidth - wh.wall;
    const fc = CONFIG.shipyard.furniture;
    const helm: [number, number, number, number] = [-fc.helmRoom.halfWidth, fc.helmRoom.halfWidth, wh.front, wh.front + 0.5 + fc.helmRoom.depth + 0.5];
    const door: [number, number, number, number] = [-fc.doorWay.halfWidth, fc.doorWay.halfWidth, wh.aft - wh.wall - fc.doorWay.depth, wh.aft];
    const meet = (u: number[], v: number[]) => u[0] < v[1] - 1e-6 && v[0] < u[1] - 1e-6 && u[2] < v[3] - 1e-6 && v[2] < u[3] - 1e-6;
    for (const q of ps) {
      expect(q.rect[0], q.kind).toBeGreaterThanOrEqual(-inside - 2e-3);
      expect(q.rect[1], q.kind).toBeLessThanOrEqual(inside + 2e-3);
      expect(q.rect[3], q.kind).toBeLessThanOrEqual(wh.aft - wh.wall + 2e-3);
      if (q.kind !== 'seat') expect(Math.min(q.rect[0] + inside, inside - q.rect[1], wh.aft - wh.wall - q.rect[3]), `${q.kind} against a wall`).toBeLessThan(3e-3);
      expect(meet(q.rect, door), `${q.kind} in the aft doorway`).toBe(false);
      if (q.rect[2] < wh.front + 2) expect(meet(q.rect, [helm[0] + plain.hull.helm.stand[0], helm[1] + plain.hull.helm.stand[0], helm[2], helm[3]]), `${q.kind} at the helm`).toBe(false);
      for (const o of ps) if (o !== q) expect(meet(q.rect, o.rect), `${q.kind} and ${o.kind}`).toBe(false);
    }
    // The head and the locker to just under the ceiling.
    const head = ps.find((q) => q.kind === 'head')!;
    expect(head.c.height).toBeGreaterThan(1.9);
    useDesign(furnished);
    expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
    expect(b.weights.items.find((i) => i.name === 'Furniture')!.kg).toBe(FURNITURE_KINDS.reduce((a, k) => a + CONFIG.modules.furniture[k].kg, 0));
    expect(b.figures.price).toBeGreaterThan(plain.figures.price);
  });

  it('left off, saying why: a pin outside her houses; a piece longer than the floor it is pinned on', () => {
    const out = buildDesign({ ...base, galleyAt: pin(0, transom - 0.8) });
    expect(out.warnings.join(' ')).toMatch(/galley's pin isn't inside/);
    expect(out.placed.galleyAt).toBeNull();
    const cabinBoat: ShipDesign = { ...base, saloon: 0, dhLength: 2.5, dhHeight: 1, dhWidth: 0, dhRake: 20, dhNarrow: 0, foreCabin: 1 };
    const c = buildDesign(cabinBoat).hull.layout.cabin!;
    const short = buildDesign({ ...cabinBoat, berthAt: pin(0.6, (c.stair.z0 + (c.berth?.z1 ?? c.z0)) / 2) });
    expect(short.warnings.join(' ')).toMatch(/berth is longer .* than the cabin below's floor/);
    // A seat fits down there.
    const seat = buildDesign({ ...cabinBoat, seatAt: pin(0, (c.stair.z0 + (c.berth?.z1 ?? c.z0)) / 2) });
    expect(seat.hull.sockets.find((s) => s.id === 'furniture.seat')!.transform.position[1]).toBeCloseTo(c.sole, 2);
  });

  it('walked round: its footprint is off the floor; the head walked into at its door', () => {
    useDesign(furnished);
    const def = VESSEL_DEFS.design;
    const area = vesselWalkArea(def, def.layout, footprintsOf({ defId: 'design' }));
    const ps = plans(buildDesign(furnished));
    for (const q of ps.filter((q) => q.kind !== 'head')) {
      const [x, z] = [(q.rect[0] + q.rect[1]) / 2, (q.rect[2] + q.rect[3]) / 2];
      expect(area.walkable(x, z, q.y), q.kind).toBe(false);
    }
    // In front of the galley (it stands against the starboard wall): the floor.
    const g = ps.find((q) => q.kind === 'galley')!;
    expect(area.walkable(g.rect[0] - 0.5, (g.rect[2] + g.rect[3]) / 2, g.y)).toBe(true);
  });

  it('the head has its door, a press on it to open or shut it', () => {
    const c: FurnitureConfig = { kind: 'head', length: 1, depth: 1, height: 2 };
    const v = FURNITURE.view!.build({ config: c, keys: { door: 'furniture.headDoor' } } as never);
    expect(v.controls).toHaveLength(1);
    expect(v.controls[0].label).toMatch(/Head door/);
    expect(v.movingParts[0]).toBeInstanceOf(THREE.Object3D);
    const locker = FURNITURE.view!.build({ config: { ...c, kind: 'locker' }, keys: { door: 'furniture.headDoor' } } as never);
    expect(locker.controls).toHaveLength(0);
  });
});


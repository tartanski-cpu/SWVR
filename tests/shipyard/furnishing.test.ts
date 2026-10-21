/**
 * Several of a piece of furniture (owner, Oct 2026: "the furniture should be allowed to place
 * multiple"), on a step of its own (shipyard/furnishing.ts): a field each copy (berthAt,
 * berthAt2...), the builder placing every one.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { hullFormOf } from '../../src/modular/hull';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, furnitureAt, furnitureCell, type ShipDesign } from '../../src/shipyard/design';
import { designToken, readDesign } from '../../src/shipyard/designDoc';
import { nextSlot, placedOf, placeFurniture, removeFurniture } from '../../src/shipyard/furnishing';
import { fakeCanvas } from '../modular/fakes';

beforeAll(fakeCanvas);
afterAll(() => useDesign(DEFAULT_DESIGN));

const PILOT = 3;
const base: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[PILOT].defaults, hull: PILOT, saloon: 3 };

describe('several of a piece of furniture', () => {
  it('each added takes the next field; four at most, one head; a click puts it on the grid', () => {
    let d = { ...DEFAULT_DESIGN };
    expect(nextSlot('berth', d)).toBe('berthAt');
    for (let i = 0; i < 4; i++) d = { ...d, ...placeFurniture(nextSlot('berth', d)!, [-1, 2, -1 - i], 7) };
    expect(placedOf('berth', d)).toEqual(['berthAt', 'berthAt2', 'berthAt3', 'berthAt4']);
    expect(nextSlot('berth', d)).toBeNull();
    expect(furnitureAt(d.berthAt2)).toEqual({ x: -1, fromTransom: 9 });
    d = { ...d, ...placeFurniture('headAt', [0, 0, 0], 7) };
    expect(nextSlot('head', d)).toBeNull();
  });

  it('taking one off moves those after it up a number', () => {
    const d = { ...DEFAULT_DESIGN, setteeAt: 11, setteeAt2: 22, setteeAt3: 33 };
    expect(removeFurniture('setteeAt2', d)).toEqual({ setteeAt: 11, setteeAt2: 33, setteeAt3: 0, setteeAt4: 0 });
    expect(removeFurniture('setteeAt', d)).toEqual({ setteeAt: 22, setteeAt2: 33, setteeAt3: 0, setteeAt4: 0 });
  });

  it('the builder places each: a place and a module apiece, each weighed; it travels in her link', () => {
    const plain = buildDesign(base);
    const wh = plain.hull.layout.wheelhouse!;
    const transom = hullFormOf(plain.hull.form).stations[0].z;
    const at = (x: number, z: number) => furnitureCell(x, transom - z);
    const d: ShipDesign = { ...base, setteeAt: at(-1.3, wh.aft - 1.2), setteeAt2: at(1.3, wh.aft - 3), seatAt: at(-0.7, wh.front + 1.6), seatAt2: at(0.7, wh.front + 1.6) };
    const b = buildDesign(d);
    expect(b.warnings.filter((w) => /settee|seat/.test(w))).toEqual([]);
    const ids = b.recipe.modules.filter((m) => m.module === 'furniture.piece').map((m) => m.socket).sort();
    expect(ids).toEqual(['furniture.seat', 'furniture.seat2', 'furniture.settee', 'furniture.settee2']);
    // One settee each side.
    const xs = ['furniture.settee', 'furniture.settee2'].map((id) => b.hull.sockets.find((s) => s.id === id)!.transform.position[0]);
    expect(Math.sign(xs[0])).toBe(-1);
    expect(Math.sign(xs[1])).toBe(1);
    const mf = CONFIG.modules.furniture;
    expect(b.weights.items.find((i) => i.name === 'Furniture')!.kg).toBe(2 * mf.settee.kg + 2 * mf.seat.kg);
    const back = readDesign(designToken(d));
    expect('design' in back && back.design.setteeAt2).toBe(d.setteeAt2);
  });

  it('a design from before reads with one of each (the new fields none)', () => {
    const old = readDesign(JSON.stringify({ format: 'swvr.design', v: 2, design: { hull: PILOT, berthAt: 400 } }));
    expect('design' in old && [old.design.berthAt, old.design.berthAt2]).toEqual([400, 0]);
  });
});

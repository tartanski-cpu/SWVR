/**
 * Crew accommodation (owner, Oct 2026: "a little bit more interior accommodation, including
 * like a kitchen and sleeping quarters", step 1 toward a trawler): two-high bunks, a mess table
 * with a bench at each end, and a shower, placed as the rest of the furniture is
 * (shipyard/parts/furniture.ts), here on the gillnetter with her fish hold.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { useDesign } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { validateRecipe } from '../../src/modular/recipe';
import { FURNITURE, type FurnitureConfig } from '../../src/modules/furniture';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, furnitureCell, type ShipDesign } from '../../src/shipyard/design';
import { designToken, readDesign } from '../../src/shipyard/designDoc';
import { fakeCanvas } from '../modular/fakes';

beforeAll(fakeCanvas);
afterAll(() => useDesign(DEFAULT_DESIGN));

const GILL = DESIGN_HULLS.findIndex((h) => h.name.startsWith('Gillnetter'));
// Her wheelhouse lengthened to 4.6 m (from 3.6) to take a crew: bunks and a shower to port, a mess and the galley to starboard.
const base: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[GILL].defaults, hull: GILL, fishHold: 1, houseLength: 4.6, aFrame: 1 };
const wh = buildDesign(base).hull.layout.wheelhouse!;
const at = (x: number, z: number) => furnitureCell(x, 4.875 - z);
const half = wh.halfWidth - 0.1;
const crewed: ShipDesign = { ...base, bunkAt: at(-half, wh.aft - 1.4), galleyAt: at(half, wh.aft - 0.9), messAt: at(half, wh.front + 1.9), showerAt: at(-half, wh.front + 1.2) };

describe('crew accommodation', () => {
  it('bunks, a mess and a shower in her wheelhouse with the galley, and her fish hold still fitted; travels as a link or file', () => {
    const b = buildDesign(crewed);
    expect(b.warnings).toEqual([]);
    const kinds = b.recipe.modules.filter((m) => m.module === 'furniture.piece').map((m) => (m.config as unknown as FurnitureConfig).kind);
    expect(kinds.sort()).toEqual(['bunk', 'galley', 'mess', 'shower']);
    expect(b.hull.layout.fishHold).toBeDefined();
    expect(readDesign(designToken(crewed))).toMatchObject({ design: crewed, warnings: [] });
    useDesign(crewed);
    expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
    const mf = CONFIG.modules.furniture;
    expect(b.weights.items.find((i) => i.name === 'Furniture')!.kg).toBe(mf.bunk.kg + mf.galley.kg + mf.mess.kg + mf.shower.kg);
  });

  it('the bunks: two to lie down in, solid to the top bunk\'s rail; the shower: open inside, to the ceiling', () => {
    const b = buildDesign(crewed);
    const cfg = (k: string) => b.recipe.modules.find((m) => m.module === 'furniture.piece' && (m.config as unknown as FurnitureConfig).kind === k)!.config as unknown as FurnitureConfig;
    const bunk = cfg('bunk');
    const mf = CONFIG.modules.furniture;
    expect(FURNITURE.footprints!(bunk, {} as never, (p) => [...p] as [number, number, number])[0].top).toBeCloseTo(mf.bunk.upper + mf.bunk.cushion + mf.bunk.rail, 6);
    const shower = cfg('shower');
    expect(shower.height).toBeGreaterThan(1.9);
    const solid = FURNITURE.footprints!(shower, {} as never, (p) => [...p] as [number, number, number]);
    // Its middle is clear (you step in): no footprint covers it.
    expect(solid.some((f) => 'x0' in f && f.x0 < 0 && f.x1 > 0 && f.z0 < 0 && f.z1 > 0)).toBe(false);
  });

  it('bunks left off, saying why, under a ceiling too low to sit up in the top one', () => {
    const was = CONFIG.modules.furniture.bunk.sitUp;
    CONFIG.modules.furniture.bunk.sitUp = 2;
    try {
      const b = buildDesign(crewed);
      expect(b.placed.bunkAt).toBeNull();
      expect(b.warnings.join(' ')).toMatch(/to sit up in the top one/);
    } finally {
      CONFIG.modules.furniture.bunk.sitUp = was;
    }
  });
});

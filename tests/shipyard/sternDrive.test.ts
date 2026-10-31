/**
 * Where the engine goes (owner, Oct 2026): on a shaft, where her balance wants it (not always
 * as far forward as it first clears her bottom); or right at the back on a stern drive, the
 * engine against the transom driving a leg that swings to steer.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { gearOf, useDesign } from '../../src/boats/sims';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { validateRecipe } from '../../src/modular/recipe';
import { buildDesign, DESIGN_HULLS, ENGINES } from '../../src/shipyard/build';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, type ShipDesign } from '../../src/shipyard/design';
import { layShaft } from '../../src/shipyard/machinery';
import { matchGear } from '../../src/shipyard/trial';
import { placeVessel } from '../../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';

afterAll(() => useDesign(DEFAULT_DESIGN));

const type = (hull: number, more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, ...more });

describe('the engine on a shaft: placed for her balance', () => {
  it('further aft than the shortest-shaft rule put it, toward where her weights balance, still fitting and clearing her bottom', () => {
    for (let hull = 0; hull < DESIGN_HULLS.length; hull++) {
      if (DESIGN_HULLS[hull].open) continue; // (an open boat's inboard is on a stern drive: no shaft)
      const d = type(hull);
      const b = buildDesign(d);
      const s = b.shaft;
      expect(s.angleDeg, `hull ${hull}`).toBeLessThanOrEqual(15);
      expect(s.fits, `hull ${hull}`).toBe(true);
      // Her centre of gravity no further from her centre of buoyancy than it was with the
      // engine at the old rule's place (a shaft can't always reach: stern drives can).
      // (The fast catamaran: her shafts already at their steepest, 15 deg, and her wheelhouse
      // forward on her wide deck: her engines can't go further forward to balance it.)
      expect(Math.abs(b.weights.balanceM), `hull ${hull}`).toBeLessThan(DESIGN_HULLS[hull].catamaran ? 1.3 : 1.2);
    }
  });

  it('with a place to aim for, it goes there if it can; without, as before', () => {
    // A box hull, flat bottom at -1 m (the enginePreview test's): any place clears.
    const station = (z: number) => ({ z, weight: 1, halfBeamChine: 1.5, halfBeamDeck: 1.5, polygon: [[-1.5, 1], [-1.5, -1], [0, -1], [1.5, -1], [1.5, 1]] as [number, number][] });
    const form = { stations: [-5, 0, 5].map(station) };
    const size = ENGINES[1].size;
    const plain = layShaft(form, size, 0, { x: 0, z: 3.5, d: 0.6 }, () => 0.9, 10, 15);
    // Aimed aft of where the old rule slid it: there, on a steeper shaft (no steeper than it needs).
    const aft = layShaft(form, size, 0, { x: 0, z: 3.5, d: 0.6 }, () => 0.9, 10, 15, plain.flangeZ - size[0] / 2 + 0.6);
    expect(aft.flangeZ).toBeGreaterThan(plain.flangeZ + 0.4);
    expect(aft.angleDeg).toBeGreaterThan(10);
    expect(aft.angleDeg).toBeLessThanOrEqual(15);
    // Aimed forward of it: as far toward it as her forward third allows, at the plain angle.
    const fwd = layShaft(form, size, 0, { x: 0, z: 3.5, d: 0.6 }, () => 0.9, 10, 15, plain.flangeZ - size[0] / 2 - 1);
    expect(fwd.flangeZ).toBeLessThanOrEqual(plain.flangeZ);
    expect(fwd.flangeZ - size[0]).toBeGreaterThan(-5 + 0.3 * 8.5);
    expect(fwd.angleDeg).toBe(10);
  });
});

describe('stern drives', () => {
  it('is a choice in her code; not for the slow tug diesel, nor with outboards', () => {
    const d = type(2, { sternDrive: 1 });
    expect(decodeDesign(encodeDesign(d))).toEqual({ design: d });
    const tug = buildDesign(type(4, { sternDrive: 1 }));
    expect(tug.recipe.modules.some((m) => m.socket === 'sternDrive')).toBe(false);
    expect(tug.warnings.some((w) => w.includes('no stern drive'))).toBe(true);
    const ob = buildDesign(type(3, { sternDrive: 1, outboards: 1 }));
    expect(ob.recipe.modules.some((m) => m.socket === 'sternDrive')).toBe(false);
    expect(ob.recipe.modules.some((m) => m.socket === 'outboards')).toBe(true);
  });

  it('the engine against the transom, level, in the hull; a leg each (twins two), no shaft or rudder; she balances', () => {
    for (const twin of [0, 1]) {
      const b = useDesign(type(2, { sternDrive: 1, twin }));
      expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
      const st = VESSEL_DEFS.design.hull.stations;
      const transom = st[0].z;
      expect(b.shaft.angleDeg).toBe(0);
      expect(transom - b.shaft.flangeZ).toBeCloseTo(0.15, 2);
      expect(b.shaft.fits).toBe(true);
      expect(b.recipe.modules.some((m) => m.socket === 'engine' || m.socket === 'rudder')).toBe(false);
      const sd = b.recipe.modules.find((m) => m.socket === 'sternDrive')!.config as { units: number[]; sterndrive: boolean; installed: { xs: number[] } };
      expect(sd.sterndrive).toBe(true);
      expect(sd.units).toHaveLength(twin ? 2 : 1);
      expect(sd.installed.xs).toHaveLength(twin ? 2 : 1);
      expect(gearOf({ defId: 'design' }, 'diesel')!.engine.powerKw).toBe(ENGINES[b.figures.engine.includes('400') ? 2 : 1].kw);
      expect(gearOf({ defId: 'design' }, 'rudder')).toBeDefined(); // the legs' swing, for the RUDDER screen
      expect(Math.abs(b.weights.balanceM)).toBeLessThan(0.5);
      expect(b.figures.engine).toMatch(/stern drive/);
    }
    // Further aft than on a shaft.
    expect(buildDesign(type(2, { sternDrive: 1 })).shaft.flangeZ).toBeGreaterThan(buildDesign(type(2)).shaft.flangeZ + 2);
  });

  it('starts, runs, and steers by swinging its leg', () => {
    useDesign(type(2, { sternDrive: 1 }));
    const { world, vesselId } = createWorld(new IdFactory(), 'design');
    const v = world.vessels[vesselId];
    placeVessel(v, 0, 0, 0, 0);
    world.environment.waves = [];
    world.geography = 'openSea';
    const send = (control: string, value: number) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value } as Intent], 1 / 60);
    send('quickStart', 1);
    for (let i = 0; i < 6 * 60; i++) stepWorld(world, [], 1 / 60);
    expect(v.engine.phase).toBe('running');
    send('lever', 1);
    for (let i = 0; i < 20 * 60; i++) stepWorld(world, [], 1 / 60);
    expect(Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) / 0.5144).toBeGreaterThan(10);
    send('helm', 1);
    for (let i = 0; i < 3 * 60; i++) stepWorld(world, [], 1 / 60);
    expect(v.rudder).toBeGreaterThan(0.3);
    expect(Math.abs(v.angularVelocity[1])).toBeGreaterThan(0.05);
  });

  it('a matched stern drive makes a fair speed; the twin faster', () => {
    const one = matchGear(type(2, { sternDrive: 1 }));
    const two = matchGear(type(2, { sternDrive: 1, twin: 1 }));
    expect(one.knots).toBeGreaterThan(15);
    expect(two.knots).toBeGreaterThan(one.knots);
  });
});

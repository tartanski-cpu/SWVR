/**
 * Outboards in the Shipyard (owner, Oct 2026): 2, 3 or 4 petrol V8 outboards
 * (propulsion.outboard, the Alaskan 38's figures) on a bracket off the transom, in place of
 * the inboard and its rudder; they steer by swinging with the wheel.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { gearOf, useDesign } from '../../src/boats/sims';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { CONFIG } from '../../src/config';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { validateRecipe } from '../../src/modular/recipe';
import { OUTBOARD, outboardGeometry, type OutboardConfig } from '../../src/modules/outboard';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, OUTBOARDS, outboardCount, type ShipDesign } from '../../src/shipyard/design';
import { fullAhead } from '../../src/shipyard/trial';
import { uprightHydrostatics } from '../../src/vessel/hydrostatics';
import { placeVessel } from '../../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { fakeCanvas } from '../modular/fakes';

beforeAll(fakeCanvas);

const PILOT = 3;
const BASE: ShipDesign = { ...DEFAULT_DESIGN, guard: 0 };
const boat = (outboards: number, hull = PILOT): ShipDesign => ({ ...BASE, hull, ...DESIGN_HULLS[hull].defaults, outboards });
const outboardsOf = () => {
  const m = RECIPES.design.modules.find((x) => x.module === 'propulsion.outboard');
  return m ? ({ ...OUTBOARD.defaults, ...(m.config as object) } as OutboardConfig) : null;
};

describe('outboards: the code', () => {
  it('none, two, three or four read back; none keeps the code it always had', () => {
    expect(OUTBOARDS).toHaveLength(4);
    for (let o = 0; o < OUTBOARDS.length; o++) {
      const d = boat(o);
      expect(decodeDesign(encodeDesign(d)), `${o}`).toEqual({ design: d });
      expect(outboardCount(d)).toBe(o ? o + 1 : 0);
    }
    // With none, the code is the same as a design that never had the choice.
    const { outboards: _o, ...older } = boat(0);
    expect(encodeDesign(older as ShipDesign)).toBe(encodeDesign(boat(0)));
    expect(encodeDesign(boat(0)).replace(/-/g, '')).toHaveLength(17);
  });
});

describe('outboards: built', () => {
  it('two, three or four on a bracket off the transom in place of the inboard and rudder; she floats level; the recipe checks out', () => {
    for (const o of [1, 2, 3]) {
      const n = o + 1;
      const built = useDesign(boat(o));
      expect(validateRecipe(RECIPES.design, LIBRARY), `${n}`).toEqual([]);
      expect(RECIPES.design.modules.some((m) => m.module === 'propulsion.diesel-inboard' || m.module === 'steering.rudder'), `${n}`).toBe(false);
      const cfg = outboardsOf()!;
      expect(cfg.units).toHaveLength(n);
      // Centred, evenly spaced, inside her transom.
      const def = VESSEL_DEFS.design;
      const transom = def.hull.stations[0];
      expect(cfg.units.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 6);
      for (let i = 1; i < n; i++) expect(cfg.units[i] - cfg.units[i - 1]).toBeCloseTo(CONFIG.modules.outboard.spacing, 2);
      expect(Math.max(...cfg.units.map(Math.abs))).toBeLessThan(transom.halfBeamDeck);
      // Off the transom, their propellers under water.
      expect(cfg.mount.z).toBeGreaterThan(transom.z);
      const g = outboardGeometry(cfg);
      expect(g.propY + cfg.propeller.diameter / 2).toBeLessThan(0);
      // Her engine gear: the outboards' engine, every unit's propeller where the module puts it.
      const diesel = gearOf({ defId: 'design' }, 'diesel')!;
      expect(diesel.units).toEqual(cfg.units);
      expect(diesel.voice).toBe('outboardV8');
      // She still floats on her lines, level (the outboards' weight is designed in at the bracket).
      const h = uprightHydrostatics(def);
      expect(Math.abs(h.sinkage), `${n}`).toBeLessThan(0.1);
      expect(Math.abs(h.lcgMinusLcb), `${n}`).toBeLessThan(0.1);
      expect(built.figures.engine).toMatch(/outboards/);
      expect(built.figures.propellerM).toBe(CONFIG.modules.outboard.propeller.diameter);
      expect(built.figures.engineShortM).toBe(0);
    }
  });

  it('more outboards go faster (the 9.75 m gillnetter: about 18 kn on two, 31 on four)', () => {
    const GILLNETTER = 1;
    const two = fullAhead(boat(1, GILLNETTER)).knots;
    const four = fullAhead(boat(3, GILLNETTER)).knots;
    expect(two).toBeGreaterThan(14);
    expect(four).toBeGreaterThan(two + 8);
  });
});

describe('outboards: cooling', () => {
  it('held flat out on the plane for ten minutes they stay cool (owner: the throttles are set for it)', () => {
    useDesign(boat(1, 1));
    const { world, vesselId } = createWorld(new IdFactory(), 'design');
    const v = world.vessels[vesselId];
    placeVessel(v, 0, 0, 0, 0);
    world.environment.waves = [];
    world.geography = 'openSea';
    const DT = 1 / 60;
    const send = (control: string, value: number) => stepWorld(world, [{ playerId: 't', targetId: v.id, control, value } as Intent], DT);
    send('quickStart', 1);
    for (let i = 0; i < 5 / DT; i++) stepWorld(world, [], DT);
    send('lever', 1);
    for (let i = 0; i < 600 / DT; i++) stepWorld(world, [], DT);
    const th = gearOf(v, 'diesel')!.engine.thermal;
    expect(Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) / 0.5144).toBeGreaterThan(14);
    expect(v.engine.coolantC).toBeLessThan(th.alarmC);
    expect(v.engine.phase).toBe('running');
  });
});

describe('outboards: steering', () => {
  it('the wheel to starboard swings the propellers to starboard and brings her bow to starboard', () => {
    useDesign(boat(2));
    const { world, vesselId } = createWorld(new IdFactory(), 'design');
    const v = world.vessels[vesselId];
    placeVessel(v, 0, 0, 0, 0);
    world.environment.waves = [];
    world.geography = 'openSea';
    const DT = 1 / 60;
    const send = (control: string, value: number) => stepWorld(world, [{ playerId: 't', targetId: v.id, control, value } as Intent], DT);
    send('quickStart', 1);
    for (let i = 0; i < 3 / DT; i++) stepWorld(world, [], DT);
    send('lever', 0.6);
    for (let i = 0; i < 10 / DT; i++) stepWorld(world, [], DT);
    const heading = () => {
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion().fromArray(v.orientation));
      return Math.atan2(f.x, -f.z);
    };
    const h0 = heading();
    send('helm', 1);
    for (let i = 0; i < 4 / DT; i++) stepWorld(world, [], DT);
    // The swing reached full lock, + (propellers to starboard), and she has come round to starboard.
    expect((v.rudder * 180) / Math.PI).toBeCloseTo(CONFIG.modules.outboard.steering.maxAngleDeg, 0);
    expect(heading() - h0).toBeGreaterThan(0.3);
  });
});

/**
 * How the Shipyard's hulls ride (owner, Oct 2026): the workboat a semi-displacement hull, the
 * pilot boat a deep-V planing hull built to go fast in waves, the landing craft flatter and
 * faster but a poorer sea boat. And none leans out and capsizes in a hard turn (owner: "a big
 * tendency to lean out and nearly fall over in sharp turns"): a planing hull's bottom carries
 * her side force and leans her into the turn (vessel/physics/vesselPhysics.ts).
 */
import * as THREE from 'three';
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { buildDesign, DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';
import { placeVessel } from '../../src/vessel/vesselControl';

const DT = 1 / 60;
const type = (hull: number, more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull, ...more });
const LC = 0;
const WORKBOAT = 2;
const PILOT = 3;
const TUG = 4;

afterAll(() => useDesign(DEFAULT_DESIGN));

/** Flat out in calm water, then the helm over: her heel each second (+ into the turn). */
function turn(d: ShipDesign, helm: number): number[] {
  useDesign(d);
  const { world, vesselId } = createWorld(new IdFactory(), 'design');
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, 0, 0);
  world.environment.waves = [];
  world.geography = 'openSea';
  const send = (c: string, x: number) => stepWorld(world, [{ playerId: 't', targetId: v.id, control: c, value: x } as Intent], DT);
  send('quickStart', 1);
  for (let i = 0; i < 5 / DT; i++) stepWorld(world, [], DT);
  send('lever', 1);
  for (let i = 0; i < 40 / DT; i++) stepWorld(world, [], DT);
  send('helm', helm);
  const x = new THREE.Vector3();
  const heel: number[] = [];
  for (let i = 1; i <= 20 / DT; i++) {
    stepWorld(world, [], DT);
    if (i % 60 === 0) heel.push((-Math.asin(x.set(1, 0, 0).applyQuaternion(new THREE.Quaternion(...v.orientation)).y) * 180) / Math.PI);
  }
  return heel;
}

describe('the hull types ride as their kind', () => {
  it('the workboat semi-displacement, the pilot boat and landing craft planing, the tug a displacement hull', () => {
    expect(DESIGN_HULLS[WORKBOAT].regime).toBe('semi');
    expect(DESIGN_HULLS[PILOT].regime).toBe('planing');
    expect(DESIGN_HULLS[LC].regime).toBe('planing');
    expect(DESIGN_HULLS[TUG].regime).toBe('displacement');
    expect(buildDesign(type(TUG)).hull.planing).toBeUndefined();
  });

  it('a deeper vee leans further into a turn and slams less', () => {
    const lc = buildDesign(type(LC)).hull;
    const pilot = buildDesign(type(PILOT)).hull;
    const wb = buildDesign(type(WORKBOAT)).hull;
    expect(pilot.planing!.bank).toBeGreaterThan(2 * lc.planing!.bank);
    // The semi-displacement workboat: half her weight on lift, coming in later.
    expect(wb.planing!.bank).toBeLessThan(pilot.planing!.bank / 2);
    expect(wb.planing!.fnStart).toBeGreaterThanOrEqual(lc.planing!.fnStart);
    expect(pilot.damping.verticalCd).toBeLessThan(lc.damping.verticalCd / 2);
  });
});

describe('in a hard turn at speed', () => {
  it('the pilot boat leans into the turn', () => {
    const heel = turn(type(PILOT), 0.4);
    expect(heel.at(-1)!).toBeGreaterThan(5);
    expect(heel.at(-1)!).toBeLessThan(20);
  });

  it('the workboat type heels out only a little, hard over', () => {
    const heel = turn(type(WORKBOAT), 1);
    expect(Math.min(...heel)).toBeGreaterThan(-12);
  });

  it('none capsizes: the workboat type with four outboards, flat out and hard over', () => {
    const heel = turn(type(WORKBOAT, { outboards: 3 }), 1);
    for (const h of heel) expect(Math.abs(h)).toBeLessThan(30);
  });
});

/**
 * The Kort nozzle (owner, Oct 2026): a duct round a shaft-driven propeller, the Shipyard's
 * choice for a tug. More pull at a standstill, less at speed, a rudder that bites at low
 * speed; poorer astern. Its own place in the design code (version 24).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { headingDeg } from '../src/controls/instruments';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { placeVessel } from '../src/vessel/vesselControl';
import { CONFIG } from '../src/config';
import { useDesign } from '../src/boats/sims';
import { buildDesign, DESIGN_HULLS } from '../src/shipyard/build';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, type ShipDesign } from '../src/shipyard/design';
import { propellerForces, rudderForceAt, type DieselSpec, type RudderSpec } from '../src/vessel/physics/propulsion';

afterAll(() => useDesign(DEFAULT_DESIGN));

const wb = CONFIG.vessels.workboat;
const open: DieselSpec = { engine: wb.engine, propeller: wb.propeller };
const ducted: DieselSpec = { ...open, nozzle: true };
const n = 6; // rev/s

describe('a propeller in a Kort nozzle', () => {
  it('pulls harder at a standstill (bollard), loses it at speed, and backs worse', () => {
    const c = CONFIG.nozzle;
    const b0 = propellerForces(open, n, 0);
    const b1 = propellerForces(ducted, n, 0);
    expect(b1.thrust / b0.thrust).toBeCloseTo(c.thrustGain, 3);
    expect(b1.torque / b0.torque).toBeCloseTo(c.torqueGain, 3);
    // At speed the duct's drag tells: by 6 m/s the open propeller gives more.
    const f0 = propellerForces(open, n, 6);
    const f1 = propellerForces(ducted, n, 6);
    expect(f1.thrust).toBeLessThan(f0.thrust);
    const a0 = propellerForces(open, -n, 0);
    const a1 = propellerForces(ducted, -n, 0);
    expect(a1.thrust / a0.thrust).toBeCloseTo(c.thrustGain * c.asternGain, 3);
  });

  it('a rudder in the nozzle jet turns more of the slipstream: more side force at a standstill under power', () => {
    const rOpen: RudderSpec = { rudder: wb.rudder, propeller: { wake: wb.propeller.wake, diameter: wb.propeller.diameter } };
    const rDuct: RudderSpec = { ...rOpen, nozzle: true };
    const angle = (20 * Math.PI) / 180;
    const f0 = { x: 0, z: 0 };
    const f1 = { x: 0, z: 0 };
    rudderForceAt(angle, rOpen, 0, 0, 30000, f0);
    rudderForceAt(angle, rDuct, 0, 0, 30000, f1);
    expect(Math.abs(f1.x)).toBeGreaterThan(Math.abs(f0.x) * 1.2);
    // Coasting with no thrust: the nozzle makes no difference.
    rudderForceAt(angle, rOpen, 0, -3, 0, f0);
    rudderForceAt(angle, rDuct, 0, -3, 0, f1);
    expect(f1.x).toBeCloseTo(f0.x, 6);
  });
});

describe('the nozzle in the Shipyard', () => {
  const tug = (more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[4].defaults, hull: 4, engine: 3, ...more });

  it('is in the code (version 24), and older codes read as an open propeller', () => {
    const d = tug({ nozzle: 1 });
    const code = encodeDesign(d);
    const back = decodeDesign(code);
    expect('design' in back && back.design.nozzle).toBe(1);
    const plain = decodeDesign(encodeDesign(tug()));
    expect('design' in plain && plain.design.nozzle).toBe(0);
    // A code without the choice at all (as every code before version 24) is the same boat, open propeller.
    expect(encodeDesign(tug({ nozzle: 0 }))).toBe(encodeDesign(tug()));
  });

  it('goes on her engine and rudder, costs its price, and is named in her figures; none with a stern drive or outboards', () => {
    const plain = buildDesign(tug());
    const b = buildDesign(tug({ nozzle: 1 }));
    const eng = b.recipe.modules.find((m) => m.socket === 'engine')!.config as Record<string, unknown>;
    const rud = b.recipe.modules.find((m) => m.socket === 'rudder')!.config as Record<string, unknown>;
    expect(eng.nozzle).toBe(true);
    expect(rud.nozzle).toBe(true);
    expect(b.figures.price - plain.figures.price).toBe(CONFIG.nozzle.price);
    expect(b.figures.engine).toMatch(/Kort nozzle/);
    const peng = plain.recipe.modules.find((m) => m.socket === 'engine')!.config as Record<string, unknown>;
    expect(peng.nozzle).toBe(false);
    const ob = buildDesign({ ...DEFAULT_DESIGN, nozzle: 1, outboards: 1 });
    expect(ob.warnings.some((w) => /nozzle/.test(w))).toBe(true);
    expect(ob.figures.price - buildDesign({ ...DEFAULT_DESIGN, outboards: 1 }).figures.price).toBe(0);
  });
});

describe('steering astern in a Kort nozzle (owner: "when you go backwards, it hardly steers at all")', () => {
  /** The small tug, `lever` for 10 s, then the wheel hard over for 15 s: how far she turns (deg). */
  const turned = (nozzle: number, lever: number) => {
    useDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[4].defaults, hull: 4, nozzle });
    const { world, vesselId } = createWorld(new IdFactory(), 'design');
    const v = world.vessels[vesselId];
    placeVessel(v, 0, 0, 0, 0);
    world.environment.waves = [];
    world.geography = 'openSea';
    const send = (c: string, x: number) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control: c, value: x } as Intent], 1 / 60);
    send('quickStart', 1);
    for (let i = 0; i < 360; i++) stepWorld(world, [], 1 / 60);
    send('lever', lever);
    for (let i = 0; i < 600; i++) stepWorld(world, [], 1 / 60);
    send('helm', 1);
    let total = 0;
    let last = headingDeg(v);
    for (let i = 0; i < 900; i++) {
      stepWorld(world, [], 1 / 60);
      const h = headingDeg(v);
      total += ((h - last + 540) % 360) - 180;
      last = h;
    }
    return Math.abs(total);
  };

  it('the rudder in the nozzle’s inflow steers her astern: many times the open propeller’s, a good share of ahead', () => {
    const asternNozzle = turned(1, -0.6);
    expect(asternNozzle).toBeGreaterThan(4 * turned(0, -0.6));
    expect(asternNozzle).toBeGreaterThan(0.35 * turned(1, 0.6));
    expect(asternNozzle).toBeLessThan(turned(1, 0.6)); // (still less than ahead)
  });

  it('at the same thrust astern, a rudder behind a nozzle bites harder than behind an open propeller', () => {
    const r = CONFIG.vessels.workboat;
    const plain = { rudder: r.rudder, propeller: r.propeller } as RudderSpec;
    const inDuct = { ...plain, nozzle: true } as RudderSpec;
    const a = { x: 0, z: 0 };
    const b = { x: 0, z: 0 };
    rudderForceAt(0.5, plain, 0, -1, -8000, a);
    rudderForceAt(0.5, inDuct, 0, -1, -8000, b);
    expect(Math.abs(b.x)).toBeGreaterThan(1.5 * Math.abs(a.x));
  });
});


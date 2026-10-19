/**
 * The Kort nozzle (owner, Oct 2026): a duct round a shaft-driven propeller, the Shipyard's
 * choice for a tug. More pull at a standstill, less at speed, a rudder that bites at low
 * speed; poorer astern. Its own place in the design code (version 24).
 */
import { afterAll, describe, expect, it } from 'vitest';
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

/**
 * Diesel exhaust smoke (owner, Oct 2026): a combustion model, not a lookup. Black when the
 * mixture goes rich (lugging, a throttle snap on a turbo), white cold, blue worn, a faint
 * haze otherwise.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { ExhaustModel } from '../src/vessel/exhaust';
import type { EngineSpec } from '../src/vessel/physics/propulsion';
import type { EngineState } from '../src/vessel/vesselState';

const DT = 1 / 60;
/** An engine rated at 1800 rpm: the workboat's torque curve (CONFIG), which peaks mid-range. */
const SPEC = { engine: CONFIG.vessels.workboat.engine } as unknown as EngineSpec;
const engine = (o: Partial<EngineState>): EngineState => ({ phase: 'running', crank: 0, rpm: 1800, rack: 1, gear: 1, shift: 0, fuelL: 500, coolantC: 85, oilC: 90, wear: 0, ...o }) as EngineState;
/** Run the model to a steady state at this engine state. */
const settle = (m: ExhaustModel, e: EngineState, s = 10) => {
  let out = m.step(DT, e);
  for (let i = 0; i < s / DT; i++) out = m.step(DT, e);
  return out;
};

describe('exhaust smoke model', () => {
  it('warm, within her power, naturally aspirated or turbo: a faint haze at idle and flat out, no soot', () => {
    for (const turbo of [false, true]) {
      const m = new ExhaustModel(turbo, SPEC);
      const idle = settle(m, engine({ rpm: 700, rack: 0.08 }));
      expect(idle.soot).toBe(0);
      expect(idle.white).toBe(0);
      expect(idle.opacity).toBeCloseTo(CONFIG.effects.exhaust.haze, 3);
      const full = settle(m, engine({ rpm: 1800, rack: 1 }));
      expect(full.soot, `${turbo}`).toBe(0);
      expect(full.lambda).toBeGreaterThan(CONFIG.effects.exhaust.smokeLambda);
      if (turbo) expect(full.boost).toBeCloseTo(CONFIG.effects.exhaust.turbo.maxBoost, 2);
    }
  });

  it('lugging (full rack, revs well down) smokes black: a turbo badly (little boost), a naturally aspirated engine a little', () => {
    const turbo = settle(new ExhaustModel(true, SPEC), engine({ rpm: 1000, rack: 1 }));
    const natural = settle(new ExhaustModel(false, SPEC), engine({ rpm: 1000, rack: 1 }));
    expect(turbo.soot).toBeGreaterThan(0.5);
    expect(natural.soot).toBeGreaterThan(0.05);
    expect(natural.soot).toBeLessThan(turbo.soot);
  });

  it('a throttle snap on a turbo engine: a black puff while the turbo spools up, then it clears', () => {
    const m = new ExhaustModel(true, SPEC);
    settle(m, engine({ rpm: 700, rack: 0.08 }));
    // The rack opens over half a second (its rise rate), the revs follow over a few seconds.
    let peak = 0;
    const trace: number[] = [];
    for (let t = 0; t < 6; t += DT) {
      const rack = Math.min(1, 0.08 + 2 * t);
      const rpm = 700 + (1800 - 700) * Math.min(1, t / 4);
      const out = m.step(DT, engine({ rpm, rack }));
      peak = Math.max(peak, out.soot);
      if (Math.abs(t - 0.5) < DT / 2 || Math.abs(t - 5.5) < DT / 2) trace.push(out.soot);
    }
    expect(peak).toBeGreaterThan(0.8);
    expect(trace[0]).toBeGreaterThan(0.5); // black as the rack reaches full
    expect(trace[1]).toBe(0); // clear at rated revs and full boost
  });

  it('cold: white, fading as the block warms, less under load; worn: blue, most at idle; off: nothing', () => {
    const m = new ExhaustModel(false, SPEC);
    const cold = settle(m, engine({ rpm: 700, rack: 0.08, coolantC: 14 }));
    expect(cold.white).toBeGreaterThan(0.9);
    const warming = settle(m, engine({ rpm: 700, rack: 0.08, coolantC: 45 }));
    expect(warming.white).toBeGreaterThan(0);
    expect(warming.white).toBeLessThan(cold.white);
    expect(settle(m, engine({ rpm: 1800, rack: 1, coolantC: 14 })).white).toBeLessThan(cold.white);
    expect(settle(m, engine({ coolantC: 85 })).white).toBe(0);
    const wornIdle = settle(m, engine({ rpm: 700, rack: 0.08, wear: 0.8 }));
    const wornFull = settle(m, engine({ rpm: 1800, rack: 1, wear: 0.8 }));
    expect(wornIdle.blue).toBeGreaterThan(0.3);
    expect(wornFull.blue).toBeLessThan(wornIdle.blue);
    expect(settle(m, engine({ wear: 0 })).blue).toBe(0);
    const off = m.step(DT, engine({ phase: 'off', rpm: 0, rack: 0 }));
    expect(off.opacity).toBe(0);
  });
});

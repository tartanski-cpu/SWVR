/**
 * The harbour tug's start-up from dead ship (plant/plant.ts; owner, 27 Oct 2026: "a realistic
 * startup procedure"): the steps in order bring her to the bridge; each one missed blocks her
 * start and says why; fuel and sea water shut while she runs; Quick start does it all.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../src/boats/sims';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { bridgeHasControl, busLive, hasPlant, startupSteps } from '../src/plant/plant';
import { DESIGN_HULLS } from '../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../src/shipyard/design';
import { matchGear } from '../src/shipyard/trial';
import { placeVessel } from '../src/vessel/vesselControl';

afterAll(() => useDesign(DEFAULT_DESIGN));

const DT = 1 / 30;
const H = DESIGN_HULLS.findIndex((h) => h.name.startsWith('Harbour tug'));
const tug0: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[H].defaults, hull: H };
let tug: ShipDesign | null = null;
const matched = () => (tug ??= { ...tug0, gear: matchGear(tug0).gear });

/** Her, fresh from port (dead ship), afloat in still water; `er(what, v)` works a control below. */
function deadShip() {
  useDesign(matched());
  const { world, vesselId } = createWorld(new IdFactory(), 'design');
  world.environment.waves = [];
  world.geography = 'openSea';
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, 0, 0);
  const send = (control: string, value: number) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  const er = (what: string, value = 1) => send(`er.${what}`, value);
  run(0.2);
  return { world, v, send, run, er };
}

/** Everything up to the engines' starts, in order (steps 2 to 7). */
function upToStart(t: ReturnType<typeof deadShip>) {
  const { er, run } = t;
  er('genFuel');
  er('genStart');
  run(CONFIG.plant.genRunUpS + 0.5);
  er('genBreaker');
  for (const k of [1, 2]) {
    er(`dayValve${k}`);
    er(`sea${k}`);
    er(`prelube${k}`);
  }
  er('fuelPump');
  er('compressor');
  er('airValve');
  run(Math.max(CONFIG.plant.prelubeS, CONFIG.plant.airMaxBar / CONFIG.plant.airFillBarS) + 1);
}

describe('the harbour tug, from dead ship', { timeout: 300000 }, () => {
  it('she comes from port dead ship: generator stopped, everything shut, the bridge not in control; her STARTs do nothing', () => {
    const t = deadShip();
    const { v, send, run } = t;
    expect(hasPlant(v)).toBe(true);
    const p = v.plant!;
    expect(p.gen).toBe('off');
    expect(busLive(p)).toBe(false);
    expect(bridgeHasControl(v)).toBe(false);
    send('ignition.key', 1);
    send('ignition.start', 1);
    run(3);
    send('ignition.start', 0);
    expect(v.engine.phase).toBe('off');
  });

  it('the steps in order: generator, power on, fuel, sea water, pre-lube, air; started at their own panels; handed to the bridge, her levers work her', () => {
    const t = deadShip();
    const { v, send, run, er } = t;
    const p = v.plant!;
    // The breaker won't close on a stopped generator.
    er('genBreaker');
    expect(p.genBreaker).toBe(0);
    expect(p.note).toMatch(/not running/);
    upToStart(t);
    expect(p.gen).toBe('running');
    expect(busLive(p)).toBe(true);
    expect(p.airBar).toBeGreaterThan(CONFIG.plant.airStartMinBar);
    expect(p.lubeBar[0]).toBeGreaterThanOrEqual(CONFIG.plant.lubeStartBar);
    // (The compressor off, to see each start take its air.)
    er('compressor', 0);
    const air = p.airBar;
    er('start1');
    run(8);
    er('start2');
    run(8);
    expect(v.engine.phase).toBe('running');
    expect(v.engine.stbd?.phase).toBe('running');
    expect(p.airBar).toBeLessThan(air);
    // At the control room, the bridge's levers don't move her.
    send('throttle.demand', 1);
    send('throttle.demand2', 1);
    run(6);
    expect(Math.hypot(v.linearVelocity[0], v.linearVelocity[2])).toBeLessThan(0.3);
    // Handed to the bridge: they do.
    er('place', 2);
    expect(bridgeHasControl(v)).toBe(true);
    run(15);
    expect(Math.hypot(v.linearVelocity[0], v.linearVelocity[2])).toBeGreaterThan(1);
  });

  it('each step missed blocks her start and says why', () => {
    const cases: [string, RegExp][] = [
      ['prelube1', /LUBE OIL PRESSURE LOW/],
      ['dayValve1', /NO FUEL/],
      ['fuelPump', /FUEL PRESSURE LOW/],
      ['airValve', /START AIR VALVE SHUT/],
    ];
    for (const [undo, says] of cases) {
      const t = deadShip();
      const { v, run, er } = t;
      upToStart(t);
      er(undo, 0);
      // (The oil pressure falls away slowly once its pump is off.)
      if (undo === 'prelube1') run(CONFIG.plant.prelubeBar / CONFIG.plant.lubeDecayBarS);
      er('start1');
      run(3);
      expect(v.engine.phase, undo).toBe('off');
      expect(v.plant!.note, undo).toMatch(says);
    }
    // No air in the bottles: the compressor never run.
    const t = deadShip();
    const { v, run, er } = t;
    er('genFuel');
    er('genStart');
    run(CONFIG.plant.genRunUpS + 0.5);
    er('genBreaker');
    for (const w of ['dayValve1', 'sea1', 'prelube1', 'fuelPump', 'airValve']) er(w);
    run(CONFIG.plant.prelubeS + 1);
    er('start1');
    run(2);
    expect(v.engine.phase).toBe('off');
    expect(v.plant!.note).toMatch(/START AIR LOW/);
  });

  it('running: her day tank valve shut, she stops; her sea suction shut, she overheats; the generator\'s fuel shut, it stops and the switchboard goes dead', () => {
    const t = deadShip();
    const { v, run, er } = t;
    upToStart(t);
    er('start1');
    run(8);
    expect(v.engine.phase).toBe('running');
    er('sea1', 0);
    run(1);
    expect(v.engine.coolingFault).toBe(true);
    er('sea1', 1);
    run(1);
    expect(v.engine.coolingFault).toBe(false);
    er('dayValve1', 0);
    run(CONFIG.plant.starveS + 1);
    expect(v.engine.phase).toBe('off');
    expect(v.plant!.note).toMatch(/PORT ENGINE STOPPED/);
    er('genFuel', 0);
    run(CONFIG.plant.starveS + 1);
    expect(v.plant!.gen).toBe('off');
    expect(busLive(v.plant!)).toBe(false);
    expect(v.plant!.note).toMatch(/BLACKOUT|GENERATOR STOPPED/);
  });

  it('Quick start does it all: her engine room readied and handed to the bridge, both engines started', () => {
    const t = deadShip();
    const { v, send, run } = t;
    send('quickStart', 1);
    run(20);
    expect(bridgeHasControl(v)).toBe(true);
    expect(v.engine.phase).toBe('running');
    expect(v.engine.stbd?.phase).toBe('running');
  });
});

describe('the harbour tug\'s throttles synchronised', { timeout: 300000 }, () => {
  it('on: both at the clicked lever\'s power, then either lever sets both; off: each its own again', () => {
    const t = deadShip();
    const { v, send } = t;
    send('throttle.demand', 0.3);
    send('throttle.demand2', 0.7);
    send('aziSync', 2);
    expect(v.controls.aziSync).toBe(1);
    expect(v.controls.lever).toBeCloseTo(0.7);
    expect(v.controls.lever2).toBeCloseTo(0.7);
    send('throttle.demand', 0.5);
    expect(v.controls.lever2).toBeCloseTo(0.5);
    send('throttle.demand2', 0.9);
    expect(v.controls.lever).toBeCloseTo(0.9);
    send('aziSync', 0);
    send('throttle.demand', 0.2);
    expect(v.controls.lever).toBeCloseTo(0.2);
    expect(v.controls.lever2).toBeCloseTo(0.9);
  });
});

describe('the START-UP page\'s steps', { timeout: 300000 }, () => {
  it('tick off from her state as she\'s brought to life, to the bridge', () => {
    const t = deadShip();
    const { v, run, er } = t;
    const done = () => startupSteps(v).map((s) => s.done);
    expect(startupSteps(v)).toHaveLength(9);
    // Dead ship: the generator and everything after it still to do.
    expect(done().slice(1)).toEqual([false, false, false, false, false, false, false, false]);
    // (Running up, on a boat of its own: a second START would stop it.)
    const u = deadShip();
    u.er('genFuel');
    u.er('genStart');
    u.run(1);
    expect(startupSteps(u.v)[1].note).toMatch(/RUNNING UP/);
    upToStart(t);
    expect(done().slice(0, 7)).toEqual([true, true, true, true, true, true, true]);
    expect(done().slice(7)).toEqual([false, false]);
    er('start1');
    run(8);
    er('start2');
    run(8);
    er('place', 2);
    expect(done().every(Boolean)).toBe(true);
  });
});

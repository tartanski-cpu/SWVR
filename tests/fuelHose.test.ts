import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { fillerPoints, fillerWorld, gaugeOf, hoseOf, nozzleWorld, pumpPoint } from '../src/fuel/fuelHose';
import { gearOf } from '../src/boats/sims';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { BERTHS, PORTS } from '../src/world/archipelago';
import { createVesselState } from '../src/vessel/vesselState';

const DT = 1 / 60;
const CALDER = PORTS.find((p) => p.id === 'calder')!;

/** The workboat alongside the Calder Haven fuel berth, a player on the quay. */
function setup() {
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  placeVessel(v, 708.5, 0, 625, 0);
  const send = (control: string, args?: number[], targetId = 'player-1') => stepWorld(world, [{ playerId: 'player-1', targetId, control, value: 1, ref: 'calder', args } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) {
      // Hold her alongside (no mooring lines in this test).
      placeVessel(v, 708.5, v.position[1], 625, 0);
      v.linearVelocity = [0, v.linearVelocity[1], 0];
      stepWorld(world, [], DT);
    }
  };
  return { world, v, send, run };
}

describe('refuelling by hand: the pump, its hose and her filler', () => {
  it('every boat with a diesel has a filler each side on her side deck, aft of her wheelhouse', () => {
    for (const id of ['workboat', 'landingCraft', 'design']) {
      const def = VESSEL_DEFS[id];
      const [p, s] = fillerPoints(def);
      expect(p[0], id).toBeLessThan(0);
      expect(s[0], id).toBeCloseTo(-p[0]);
      expect(p[2], id).toBeGreaterThan(def.layout.wheelhouse!.aft);
    }
  });

  it('at every fuel berth, the filler on the quay side of each boat is within reach of the hose', () => {
    for (const port of PORTS.filter((p) => p.fuel)) {
      const berth = BERTHS.find((b) => b.id === `${port.id}-fuel`)!;
      const o = pumpPoint(port, CONFIG.fuelHose.pump.outlet);
      for (const id of ['workboat', 'landingCraft', 'design']) {
        for (const turn of [0, 180]) {
          const s = createVesselState('v', id);
          // Docked: her centre on the berth's (DOCK warps her there), either way round.
          placeVessel(s, berth.x, 0, berth.z, berth.headingDeg + turn);
          const near = Math.min(...[0, 1].map((side) => fillerWorld(s, side)).map((f) => Math.hypot(f.x - o.x, f.z - o.z)));
          expect(near, `${port.id} ${id} ${turn}`).toBeLessThan(CONFIG.fuelHose.reach);
        }
      }
    }
  });

  it('take the nozzle, walk it out (no further than the hose), plug it in, START: she fills, the gauge counts, STOP', () => {
    const { world, v, send, run } = setup();
    run(1);
    const hose = hoseOf(world, 'calder');
    expect(hose.at.kind).toBe('pump');
    send('hoseTake');
    expect(hose.at.kind).toBe('hand');
    // Carried 30 m away: it stays at the end of the hose.
    send('hoseMove', [680, 2, 625]);
    const o = pumpPoint(CALDER, CONFIG.fuelHose.pump.outlet);
    const n = nozzleWorld(world, hose);
    expect(Math.hypot(n.x - o.x, n.z - o.z)).toBeCloseTo(CONFIG.fuelHose.reach, 3);
    // To her starboard filler (the quay side) and in.
    const f = fillerWorld(v, 1);
    send('hoseMove', [f.x, f.y, f.z]);
    send('hosePlug', [1], v.id);
    expect(hose.at).toEqual({ kind: 'filler', vessel: v.id, side: 1 });
    const tank = gearOf(v, 'diesel')!.engine.fuel;
    v.engine.fuelL = 100;
    const money = world.career!.money;
    send('pumpStart');
    expect(v.refuelling).toBe(true);
    run(10);
    expect(v.engine.fuelL).toBeCloseTo(100 + 10 * tank.refuelRateLps, 0);
    expect(gaugeOf(world, 'calder').litres).toBeCloseTo(10 * tank.refuelRateLps, 0);
    expect(gaugeOf(world, 'calder').pumping).toBe(true);
    send('pumpStop');
    run(0.5);
    expect(v.refuelling).toBe(false);
    // Billed when the fuel stops, as the menu's Refuel is.
    expect(world.career!.money).toBeCloseTo(money - 10 * tank.refuelRateLps * CONFIG.career.costs.fuelPerL, 0);
  });

  it('the gauge starts from nought at every START: a second fill, the nozzle never hung up, reads its own litres, as her tank does', () => {
    const { world, v, send, run } = setup();
    run(1);
    send('hoseTake');
    const f = fillerWorld(v, 1);
    send('hoseMove', [f.x, f.y, f.z]);
    send('hosePlug', [1], v.id);
    v.engine.fuelL = 100;
    send('pumpStart');
    run(8);
    send('pumpStop');
    // Taken out and put down on the quay, not hung up; later, back in and a second fill.
    send('hoseTake');
    send('hoseDrop', [717, 3, 622]);
    send('hoseTake');
    send('hoseMove', [f.x, f.y, f.z]);
    send('hosePlug', [1], v.id);
    const before = v.engine.fuelL;
    send('pumpStart');
    run(2.4);
    send('pumpStop');
    run(0.2);
    expect(gaugeOf(world, 'calder').litres).toBeCloseTo(v.engine.fuelL - before, 1);
  });

  it('stops by itself when she is full; START does nothing on a full tank or with the nozzle not in', () => {
    const { world, v, send, run } = setup();
    run(1);
    send('pumpStart');
    expect(v.refuelling).toBe(false); // the nozzle's on the pump
    const tank = gearOf(v, 'diesel')!.engine.fuel.tankL;
    send('hoseTake');
    const f = fillerWorld(v, 1);
    send('hoseMove', [f.x, f.y, f.z]);
    send('hosePlug', [1], v.id);
    v.engine.fuelL = tank - 4;
    send('pumpStart');
    run(4);
    expect(v.engine.fuelL).toBeCloseTo(tank, 3);
    expect(v.refuelling).toBe(false);
    expect(gaugeOf(world, 'calder').litres).toBeCloseTo(4, 0);
    send('pumpStart');
    expect(v.refuelling).toBe(false);
  });

  it('a boat that drifts off pulls the nozzle out (the end of the hose is over the water: it swings back to the pump), the fuel stops', () => {
    const { world, v, send, run } = setup();
    run(1);
    const hose = hoseOf(world, 'calder');
    send('hoseTake');
    const f = fillerWorld(v, 1);
    send('hoseMove', [f.x, f.y, f.z]);
    send('hosePlug', [1], v.id);
    v.engine.fuelL = 100;
    send('pumpStart');
    expect(v.refuelling).toBe(true);
    // She's carried 20 m off the quay.
    placeVessel(v, 690, 0, 625, 0);
    stepWorld(world, [], DT);
    expect(hose.at.kind).toBe('pump');
    expect(v.refuelling).toBe(false);
    // Put down on the quay it lies there; picked up again and hung back on the pump.
    send('hoseTake');
    send('hoseDrop', [717, 3, 622]);
    expect(hose.at.kind).toBe('ground');
    expect((hose.at as { pos: number[] }).pos[1]).toBeCloseTo(1.65, 5); // on the quay (1.6 m), not in the air
    send('hoseTake');
    expect(hose.at.kind).toBe('hand');
    send('hoseStow');
    expect(hose.at.kind).toBe('pump');
  });

  it("let go over the water it swings back to the pump; someone else's nozzle can't be taken", () => {
    const { world, send } = setup();
    const hose = hoseOf(world, 'calder');
    send('hoseTake');
    send('hoseDrop', [705, 1, 625]); // over the berth
    expect(hose.at.kind).toBe('pump');
    send('hoseTake');
    world.players['player-2'] = { ...world.players['player-1'], id: 'player-2' };
    stepWorld(world, [{ playerId: 'player-2', targetId: 'player-2', control: 'hoseTake', value: 1, ref: 'calder' } as Intent], DT);
    expect(hose.at).toMatchObject({ kind: 'hand', player: 'player-1' });
  });
});

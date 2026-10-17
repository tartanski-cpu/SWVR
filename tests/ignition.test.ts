import { gearOf } from '../src/boats/sims';
import { describe, expect, it } from 'vitest';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { placeVessel } from '../src/vessel/vesselControl';
import { CONFIG } from '../src/config';

const DT = 1 / 60;

function setup() {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), undefined, { cold: true });
  world.environment.waves = [];
  world.geography = 'openSea';
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, -300, 0);
  const send = (control: string, value: number) => stepWorld(world, [{ playerId: localPlayerId, targetId: v.id, control, value } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  const startup = () => world.duties?.items.find((d) => d.kind === 'startup');
  return { world, v, send, run, startup };
}
const preheat = CONFIG.vessels.workboat.engine.preheatTime;

describe('diesel start procedure', () => {
  it('from cold by the card: master, INSTR, neutral, key (wait for the GLOW lamp), START - and the duty ticks off', () => {
    const { v, send, run, startup } = setup();
    run(0.2);
    const d = startup()!;
    expect(d).toBeTruthy();
    expect(d.steps[0].done || d.steps[1].done || d.steps[3].done).toBe(false);
    send('master', 1);
    send('brk_instruments', 1);
    run(0.2);
    expect(d.steps[0].done && d.steps[1].done && d.steps[2].done).toBe(true); // lever already in neutral
    send('key', 1);
    run(preheat + 0.2);
    expect(d.steps[3].done).toBe(true);
    send('start', 1);
    run(3);
    send('start', 0);
    expect(v.engine.phase).toBe('running');
    run(0.2);
    expect(startup()?.doneAt).toBeDefined();
  });

  it('no key, or START in gear: nothing happens', () => {
    const { v, send, run } = setup();
    send('master', 1);
    send('start', 1);
    run(2);
    expect(v.engine.phase).toBe('off'); // key off
    send('start', 0);
    send('key', 1);
    send('lever', 0.5);
    send('start', 1);
    run(2);
    expect(v.engine.phase).toBe('off'); // in gear: neutral-safety switch
  });

  it('let go of START before she catches and the starter stops', () => {
    const { v, send, run } = setup();
    send('master', 1);
    send('key', 1);
    send('start', 1);
    run(0.5);
    expect(v.engine.phase).toBe('cranking');
    send('start', 0);
    run(0.1);
    expect(v.engine.phase).toBe('off');
  });

  it('cold and unheated she needs a long crank; preheated she catches quickly', () => {
    const a = setup();
    a.send('master', 1);
    a.send('key', 1);
    a.send('start', 1);
    a.run(3);
    expect(a.v.engine.phase).toBe('cranking'); // not yet (cold, no glow)
    a.run(5);
    expect(a.v.engine.phase).toBe('running');
    const b = setup();
    b.send('master', 1);
    b.send('key', 1);
    b.run(preheat + 0.2);
    b.send('start', 1);
    b.run(3);
    expect(b.v.engine.phase).toBe('running');
  });

  it('key on: the glow plugs preheat on their own, GLOW lit until they are hot enough; OIL and CHARGE lit with the key (owner)', async () => {
    const { busOf } = await import('../src/modular/bus');
    const { v, send, run } = setup();
    send('master', 1);
    send('brk_instruments', 1);
    run(0.2);
    const lamp = (l: string) => busOf(v).get(`lamp.${l}` as never);
    expect([lamp('oil'), lamp('charge'), lamp('glow')]).toEqual(['off', 'off', 'off']); // key off
    expect(v.engine.glow).toBe(0);
    send('key', 1);
    run(0.5);
    expect([lamp('oil'), lamp('charge'), lamp('glow')]).toEqual(['on', 'on', 'on']);
    run(preheat);
    expect(lamp('glow')).toBe('off');
    const hot = v.engine.glow;
    run(5);
    expect(v.engine.glow).toBeCloseTo(hot, 6); // held hot while she waits
    send('key', 0);
    run(2);
    expect(v.engine.glow).toBeLessThan(hot); // key off: they cool
  });

  it('a warm engine needs much less preheat than a cold one (glow lamp goes out sooner)', async () => {
    const { preheatNeeded } = await import('../src/vessel/physics/propulsion');
    const { v } = setup();
    const def = gearOf(v, 'diesel')!;
    const cold = preheatNeeded(v, def);
    expect(cold).toBeCloseTo(def.engine.preheatTime, 5);
    v.engine.coolantC = 80;
    expect(preheatNeeded(v, def)).toBeCloseTo(def.engine.preheatHotTime, 5);
    expect(preheatNeeded(v, def)).toBeLessThan(cold / 3);
  });

  it('key off stops her', () => {
    const { v, send, run } = setup();
    send('quickStart', 1);
    run(4);
    expect(v.engine.phase).toBe('running');
    send('key', 0);
    run(0.2);
    expect(v.engine.phase).toBe('off');
  });

  it('battery 1 flat: no start until the selector goes to 2', () => {
    const { v, send, run } = setup();
    send('master', 1);
    send('debugElectrics', 3);
    send('key', 1);
    send('start', 1);
    run(2);
    expect(v.engine.phase).toBe('off');
    send('start', 0);
    send('batSelect', 2);
    run(preheat + 0.2);
    send('start', 1);
    run(3);
    expect(v.engine.phase).toBe('running');
    expect(v.electrics!.selector).toBe(2);
  });

  it('the selector steps 1 -> both -> 2 -> 1 on a press', () => {
    const { v, send } = setup();
    send('batSelect', 0);
    expect(v.electrics!.selector).toBe(3);
    send('batSelect', 0);
    expect(v.electrics!.selector).toBe(2);
    send('batSelect', 0);
    expect(v.electrics!.selector).toBe(1);
  });

  it('quick start does it all', () => {
    const { v, send, run } = setup();
    send('quickStart', 1);
    run(4);
    expect(v.engine.phase).toBe('running');
    expect(v.electrics!.breakers.instruments).toBe(1);
  });
});

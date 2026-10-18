import { describe, expect, it } from 'vitest';
import { FISHING_GROUNDS } from '../src/world/archipelago';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { hydraulicsOn } from '../src/vessel/electrics';
import { placeVessel } from '../src/vessel/vesselControl';
import { startEngine } from './helpers/engine';

const DT = 1 / 60;

function setup() {
  const { world, vesselId } = createWorld(new IdFactory(), 'workboat', { tender: true });
  world.environment.waves = [];
  world.geography = 'openSea';
  const v = world.vessels[vesselId];
  const skiff = Object.values(world.vessels).find((x) => x.defId === 'skiff')!;
  const send = (control: string, value = 1, targetId = v.id) => stepWorld(world, [{ playerId: 'p', targetId, control, value } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  return { world, v, skiff, send, run };
}

describe('deck hydraulics', { timeout: 30000 }, () => {
  it('need the engine running AND the DECK HYD breaker on', () => {
    const { world, v, send } = setup();
    expect(hydraulicsOn(v)).toBe(false); // engine off
    startEngine(world, v);
    expect(hydraulicsOn(v)).toBe(true);
    send('brk_hydraulics', 0);
    expect(hydraulicsOn(v)).toBe(false);
    send('brk_hydraulics', 1);
    send('master', 0); // no 12 V: no clutch (and the engine stops: no fuel solenoid)
    expect(hydraulicsOn(v)).toBe(false);
  });

  it('the crane does not start without them, and stops and holds her if they go mid-lift', () => {
    const { world, v, skiff, send, run } = setup();
    send('crane', 1, skiff.id);
    run(1);
    expect(skiff.tender!.phase).toBe('stowed'); // engine off: nothing
    startEngine(world, v);
    send('crane', 1, skiff.id);
    run(4);
    expect(skiff.tender!.phase).toBe('lowering');
    const t = skiff.tender!.t;
    send('brk_hydraulics', 0);
    run(3);
    expect(skiff.tender!.t).toBeCloseTo(t, 1); // held where she was
    send('brk_hydraulics', 1);
    run(2);
    expect(skiff.tender!.t).toBeGreaterThan(t + 1.5); // and on again
  });

  it('the net drum waits for pressure; a shoot asked for starts when it comes', () => {
    const { world, v, send, run } = setup();
    const g = FISHING_GROUNDS[1];
    placeVessel(v, g.x, 0, g.z + 100, 0);
    send('trawl', 1);
    run(2);
    expect(world.fishing!.t).toBe(0);
    expect(world.fishing!.status).toBe('noHydraulics');
    startEngine(world, v);
    run(2);
    expect(world.fishing!.t).toBeGreaterThan(0);
  });
});

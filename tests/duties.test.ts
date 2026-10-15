import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import type { Intent } from '../src/core/intents';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { towVessel } from '../src/tow/tow';
import { placeVessel } from '../src/vessel/vesselControl';
import { PORTS } from '../src/world/archipelago';

const DT = 1 / 60;

function setup() {
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, -400, 0);
  const send = (control: string, ref?: string) => stepWorld(world, [{ playerId: 'player-1', targetId: v.id, control, value: 1, ref } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  const duty = (kind: string) => world.duties?.items.find((d) => d.kind === kind);
  return { world, v, send, run, duty };
}

describe('duty board: the jobs on', { timeout: 30000 }, () => {
  it('a tow job: answer, make fast, bring her in - ticked off as it goes', () => {
    const { world, send, run, duty } = setup();
    run(0.1);
    send('towDebugCall', 'derelict');
    run(0.1);
    const d = duty('tow')!;
    expect(d.title).toMatch(/^Tow: motor cruiser/);
    expect(d.steps.map((s) => s.done)).toEqual([false, false, false]);
    send('rescueHandset');
    run(0.1);
    expect(d.steps[0].done).toBe(true);
    // Fetch her: alongside our stern, make fast, then she's in port.
    send('towDebugEnd');
    run(0.1);
    send('towDebugNear', 'barge');
    run(0.1);
    const d2 = duty('tow')!;
    send('towMake');
    run(0.1);
    expect(d2.steps[1].done).toBe(true);
    const port = PORTS.find((p) => p.id === 'calder')!;
    placeVessel(towVessel(world)!, port.x, 0, port.z, 0);
    run(CONFIG.tow.deliverTime + 1);
    expect(d2.doneAt).toBeDefined();
  });

  it('an unanswered call just goes (not counted as done)', () => {
    const { world, send, run, duty } = setup();
    send('towDebugCall');
    run(0.1);
    expect(duty('tow')).toBeTruthy();
    const before = world.duties!.completed;
    world.tow!.job!.callT = world.time - CONFIG.tow.callTimeout - 1;
    run(0.2);
    expect(duty('tow')).toBeUndefined();
    expect(world.duties!.completed).toBe(before);
  });

  it('a rescue call shows up, and answering it ticks the first step', () => {
    const { send, run, duty } = setup();
    send('rescueDebugTrigger', 'manOverboard');
    run(0.1);
    const d = duty('rescue')!;
    expect(d.title).toBe('Rescue: man overboard');
    expect(d.steps).toHaveLength(3);
    send('rescueHandset');
    run(0.1);
    expect(d.steps[0].done).toBe(true);
  });

  it('cargo aboard bound for a port is a cargo job until it is set down', () => {
    const { world, v, run, duty } = setup();
    const item = Object.values(world.cargo)[0];
    item.at = { vessel: v.id, pos: [0, 1, 3], yaw: 0, vel: [0, 0], lashed: false };
    run(0.1);
    const d = duty('cargo')!;
    const to = PORTS.find((p) => p.id === item.to)!;
    expect(d.title).toBe(`Cargo job: deliver to ${to.name.replace(' (anchorage)', '')}`);
    delete world.cargo[item.id];
    run(0.1);
    expect(d.doneAt).toBeDefined();
  });
});

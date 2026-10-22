/**
 * SOS (owner, Oct 2026): a capsized or sunk boat is recovered to the nearest boatyard's
 * port; upright and afloat, the coastguard turns the call down.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { sosCondition, sosStatus, sosYard } from '../src/rescue/sos';
import { placeVessel } from '../src/vessel/vesselControl';
import { BERTHS } from '../src/world/archipelago';

const DT = 1 / 60;

function setup() {
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  const send = (control: string, value = 1) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value } as Intent], DT);
  return { world, v, send };
}

describe('SOS', () => {
  it('knows upright from capsized (rolled or pitch-poled) and sunk', () => {
    const { v } = setup();
    placeVessel(v, 0, 0, -600, 0, 20);
    expect(sosCondition(v)).toBe('upright');
    expect(sosStatus(v)).toBe('Upright and afloat');
    placeVessel(v, 0, 0, -600, 0, CONFIG.sos.overturnDeg + 5);
    expect(sosCondition(v)).toBe('capsized');
    placeVessel(v, 0, 0, -600, 0, 180);
    expect(sosCondition(v)).toBe('capsized');
    placeVessel(v, 0, 0, -600, 0, 0, -CONFIG.sos.overturnDeg - 5);
    expect(sosCondition(v)).toBe('capsized');
    placeVessel(v, 0, -CONFIG.sos.sunkDepth - 1, -600, 0);
    expect(sosCondition(v)).toBe('sunk');
    expect(sosStatus(v)).toMatch(/SUNK/);
  });

  it('capsized off Calder: righted and brought to the Calder boatyard berth, stopped, with a word on the radio', () => {
    const { world, v, send } = setup();
    placeVessel(v, 0, 0, -600, 37, 170);
    v.engine.phase = 'running';
    v.engine.rpm = 1200;
    v.controls.lever = 0.6;
    world.tow = { seq: 0, nextAt: null, job: null, delivered: 0, calls: false, lines: { [v.id]: { target: 'nothing', length: 30, tension: 0 } }, cleared: 0 };
    send('sos');
    const berth = BERTHS.find((b) => b.id === 'calder-cargo')!;
    expect(sosYard(v)?.yard.port).toBe('calder');
    expect(v.position[0]).toBeCloseTo(berth.x, 0);
    expect(v.position[2]).toBeCloseTo(berth.z, 0);
    expect(sosCondition(v)).toBe('upright');
    expect(v.engine.phase).toBe('off');
    expect(v.controls.lever).toBe(0);
    expect(v.anchor.phase).toBe('stowed');
    expect(world.tow!.lines[v.id] ?? null).toBeNull();
    expect(world.rescue!.sos?.sent).toBe(1);
    expect(world.rescue!.radio?.text).toMatch(/righted her .* Calder Boatyard/);
  });

  it('sunk in Loch Tarsk: raised and brought to the Loch Tarsk yard, the nearer', () => {
    const { world, v, send } = setup();
    placeVessel(v, 700, -6, -4000, 0);
    send('sos');
    const berth = BERTHS.find((b) => b.id === 'tarsk-cargo')!;
    expect(v.position[0]).toBeCloseTo(berth.x, 0);
    expect(v.position[1]).toBeCloseTo(0, 2);
    expect(world.rescue!.radio?.text).toMatch(/raised her .* Loch Tarsk Yard/);
  });

  it('upright and afloat: turned down, and she stays where she is', () => {
    const { world, v, send } = setup();
    placeVessel(v, 0, 0, -600, 0, 15);
    send('sos');
    expect(v.position[2]).toBeCloseTo(-600, 0);
    expect(world.rescue!.sos).toBeUndefined();
    expect(world.rescue!.radio?.text).toMatch(/No SOS needed/);
  });
});

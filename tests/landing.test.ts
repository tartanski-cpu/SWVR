import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { GROUND } from '../src/cargo/cargo';
import { runStatus } from '../src/rescue/rescue';
import { placeVessel } from '../src/vessel/vesselControl';
import { hullPlan } from '../src/vessel/layout';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { BERTHS, PORTS } from '../src/world/archipelago';

const DT = 1 / 60;

function setup() {
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  const send = (control: string, value = 1, ref?: string, args?: number[], targetId = v.id) => {
    const i: Intent = { playerId: 'p', targetId, control, value, ref, args };
    stepWorld(world, [i], DT);
  };
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  return { world, v, send, run };
}

describe('milestone 4: landing survivors', () => {
  it('a survivor aboard stays aboard at sea, steps ashore onto the quay once moored; the coastguard thanks you; the rescue closes', () => {
    const { world, v, send, run } = setup();
    send('rescueDebugAboard');
    const inc = world.rescue!.active!;
    expect(inc.phase).toBe('recovered');
    expect(runStatus(world)).toMatch(/dock or anchor/);
    run(3);
    expect(inc.targets[0].phase).toBe('aboard');
    // Alongside Calder Haven's cargo berth, made fast.
    const b = BERTHS.find((x) => x.id === 'calder-cargo')!;
    placeVessel(v, b.x, 0, b.z, b.headingDeg);
    v.mooring.phase = 'moored';
    v.mooring.berthId = b.id;
    const before = world.rescue!.completed;
    run(0.2);
    expect(inc.targets[0].phase).toBe('landing');
    run(CONFIG.rescue.landTime + 0.5);
    expect(inc.targets[0].phase).toBe('ashore');
    expect(inc.phase).toBe('landed');
    expect(world.rescue!.completed).toBe(before + 1);
    expect(world.rescue!.radio!.text).toMatch(/Calder Haven/);
    // On the quay: further from the berth line than the boat, toward the shore.
    const [sx, sz] = inc.targets[0].shore!;
    expect((sx - b.x) * b.shoreX + (sz - b.z) * b.shoreZ).toBeGreaterThan(b.shoreDist);
    run(CONFIG.rescue.ashoreTime + 1);
    expect(world.rescue!.active).toBeNull();
  });

  it('at an anchorage the skiff takes them ashore', () => {
    const { world, v, send, run } = setup();
    const port = PORTS.find((p) => p.cargo.anchorage)!;
    const a = port.cargo.anchorage!;
    send('rescueDebugAboard');
    placeVessel(v, a.x, 0, a.z, 0);
    // Let go the anchor and wait for it to set and the boat to settle.
    send('anchor', 1);
    for (let i = 0; i < 1200 && world.rescue!.active?.phase !== 'landed'; i++) run(0.1);
    expect(world.rescue!.active?.phase).toBe('landed');
    expect(world.rescue!.radio!.text).toMatch(new RegExp(port.name.replace(' (anchorage)', '')));
  });

  it('crates fished out of the sea are delivered at any harbour', () => {
    const { world, send } = setup();
    const port = PORTS.find((p) => p.id === 'brannock')!;
    world.cargo.r1 = { id: 'r1', kind: 0, mass: 40, from: 'sea', to: 'any', at: { carriedBy: 'p' } };
    const d0 = world.deliveries;
    const [x, z] = [port.cargo.stackX, port.cargo.stackZ];
    send('cargoPlace', 1, 'r1', [x, 5, z, 0], GROUND);
    expect(world.cargo.r1).toBeUndefined();
    expect(world.deliveries).toBe(d0 + 1);
  });

  it('after a rescue the cargo carries on: no second distress call on the way to its port', () => {
    const { world, v, send, run } = setup();
    (CONFIG.rescue as { chance: number }).chance = 1;
    try {
      const plan = hullPlan(VESSEL_DEFS[v.defId]);
      world.cargo.t1 = { id: 't1', kind: 0, mass: 40, from: 'calder', to: 'brannock', at: { vessel: v.id, pos: [0.6, plan.deckY(3.5), 3.5], yaw: 0, vel: [0, 0], lashed: true } };
      send('rescueDebugAboard');
      const b = BERTHS.find((x) => x.id === 'calder-cargo')!;
      placeVessel(v, b.x, 0, b.z, b.headingDeg);
      v.mooring.phase = 'moored';
      v.mooring.berthId = b.id;
      run(CONFIG.rescue.landTime + 1);
      expect(world.rescue!.quietTo).toBe('brannock');
      expect(world.rescue!.radio!.text).toMatch(/Carry on to Brannock/);
      run(CONFIG.rescue.ashoreTime + 1);
      // Out of harbour toward Brannock: a run, but no call this time.
      v.mooring.phase = 'free';
      placeVessel(v, b.x - 600, 0, b.z - 200, 270);
      run(0.1);
      expect(world.rescue!.run?.to).toBe('brannock');
      expect(world.rescue!.run?.triggerAt).toBeNull();
    } finally {
      (CONFIG.rescue as { chance: number }).chance = 0.5;
    }
  });
});

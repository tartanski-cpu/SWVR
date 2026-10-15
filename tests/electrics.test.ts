import { describe, expect, it } from 'vitest';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { isPowered } from '../src/vessel/electrics';
import { placeVessel } from '../src/vessel/vesselControl';
import { PORTS } from '../src/world/archipelago';

const DT = 1 / 60;

function setup(cold = true) {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), undefined, { cold });
  world.environment.waves = [];
  world.geography = 'openSea';
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, -300, 0);
  const send = (control: string, value: number) => stepWorld(world, [{ playerId: localPlayerId, targetId: v.id, control, value } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  return { world, v, send, run };
}

describe('12 V electrics', () => {
  it('the game starts cold: master off, nothing powered, the engine will not crank', () => {
    const { v, send, run } = setup();
    expect(v.electrics!.master).toBe(0);
    expect(isPowered(v)).toBe(false);
    send('engineStartStop', 1);
    run(3);
    expect(v.engine.phase).toBe('off');
    expect(v.electrics!.volts).toBe(0); // voltmeter on the bus reads nothing
  });

  it('master on: power, the voltmeter reads the battery, and she starts', () => {
    const { v, send, run } = setup();
    send('master', 1);
    run(1);
    expect(isPowered(v)).toBe(true);
    expect(v.electrics!.volts).toBeGreaterThan(12.3);
    expect(v.electrics!.volts).toBeLessThan(12.8);
    send('engineStartStop', 1);
    run(0.5);
    // Cranking pulls the voltage down hard.
    expect(v.electrics!.volts).toBeLessThan(11);
    run(5);
    expect(v.engine.phase).toBe('running');
    // Running: the alternator lifts it toward the charging voltage.
    run(2);
    expect(v.electrics!.volts).toBeGreaterThan(13);
  });

  it('switched-on loads drain the battery; the alternator charges it', () => {
    const { v, send, run } = setup();
    send('master', 1);
    send('spotlight', 1);
    send('deckFore', 1);
    const s0 = v.electrics!.soc[0];
    run(60);
    const drained = s0 - v.electrics!.soc[0];
    expect(drained).toBeGreaterThan(0);
    send('engineStartStop', 1);
    run(10);
    const s1 = v.electrics!.soc[0];
    run(60);
    expect(v.electrics!.soc[0]).toBeGreaterThan(s1);
  });

  it('master off stops a running engine (fuel solenoid) and darkens everything', () => {
    const { v, send, run } = setup();
    send('master', 1);
    send('engineStartStop', 1);
    run(6);
    expect(v.engine.phase).toBe('running');
    send('master', 0);
    run(1);
    expect(v.engine.phase).toBe('off');
    expect(isPowered(v)).toBe(false);
  });

  it('a flat battery: no power, even with the master on', () => {
    const { v, send, run } = setup();
    send('master', 1);
    send('debugElectrics', 0);
    run(0.5);
    expect(isPowered(v)).toBe(false);
    send('engineStartStop', 1);
    run(3);
    expect(v.engine.phase).toBe('off');
    send('debugElectrics', 1);
    run(0.5);
    expect(isPowered(v)).toBe(true);
  });

  it('the windlass is electric: no power, the anchor stays where it is', () => {
    const { world, v, send, run } = setup();
    world.geography = 'archipelago'; // anchors work where there's a seabed
    const a = PORTS.find((p) => p.id === 'selkie')!.cargo.anchorage!;
    placeVessel(v, a.x, 0, a.z, 0);
    send('anchor', 1);
    run(5);
    expect(v.anchor.rodeM).toBe(0);
    send('master', 1);
    run(5);
    expect(v.anchor.rodeM).toBeGreaterThan(1);
  });

  it('tests and trials start warm (master on) unless asked for cold', () => {
    const { v } = setup(false);
    expect(isPowered(v)).toBe(true);
  });
});

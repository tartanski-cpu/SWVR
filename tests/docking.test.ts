import { describe, expect, it } from 'vitest';
import type { Intent } from '../src/core/intents';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { berthAxis, berthInRange } from '../src/vessel/physics/mooring';
import { placeVessel } from '../src/vessel/vesselControl';
import { BERTHS } from '../src/world/archipelago';

const DT = 1 / 60;

function boat(waves = false) {
  const { world, vesselId } = createWorld(new IdFactory());
  if (!waves) world.environment.waves = [];
  const v = world.vessels[vesselId];
  const send = (control: string, value = 1) => {
    const intent: Intent = { playerId: 't', targetId: v.id, control, value };
    stepWorld(world, [intent], DT);
  };
  const run = (s: number, each?: () => void) => {
    for (let i = 0; i < s / DT; i++) {
      stepWorld(world, [], DT);
      each?.();
    }
  };
  return { world, v, send, run };
}

const berth = BERTHS.find((b) => b.id === 'calder-cargo')!;
/** A spot `off` m seaward of the berth (away from the quay), `along` m along it. */
const near = (off: number, along: number) => {
  const a = berthAxis(berth, false);
  return [berth.x - berth.shoreX * off + a.x * along, berth.z - berth.shoreZ * off + a.z * along] as const;
};

describe('docking', () => {
  it('a hot spot needs the boat close, slow and roughly lined up (either way round)', () => {
    const { v, run } = boat();
    const [x, z] = near(6, 4);
    placeVessel(v, x, 0, z, berth.headingDeg + 15);
    run(1);
    expect(berthInRange(v)?.berth.id).toBe(berth.id);
    expect(v.mooring.berthId).toBe(berth.id); // noted for the DOCK button light
    placeVessel(v, x, 0, z, berth.headingDeg + 180 - 20);
    run(1);
    const r = berthInRange(v);
    expect(r?.berth.id).toBe(berth.id);
    expect(r?.reversed).toBe(true);
    placeVessel(v, x, 0, z, berth.headingDeg + 90);
    run(1);
    expect(berthInRange(v)).toBeNull();
    const [fx, fz] = near(40, 0);
    placeVessel(v, fx, 0, fz, berth.headingDeg);
    run(1);
    expect(berthInRange(v)).toBeNull();
  });

  it('DOCK warps her alongside onto the berth and makes her fast', () => {
    const { v, send, run } = boat();
    const [x, z] = near(7, -5);
    placeVessel(v, x, 0, z, berth.headingDeg + 12);
    run(1);
    send('dock');
    expect(v.mooring.phase).toBe('docking');
    run(30);
    expect(v.mooring.phase).toBe('moored');
    expect(Math.hypot(v.position[0] - berth.x, v.position[2] - berth.z)).toBeLessThan(0.5);
    // Never hit the quay hard on the way in.
    expect(v.contact.force).toBeLessThan(5e4);
  });

  it('moored, she holds against the engine at slow ahead and rides the swell', () => {
    const { v, send, run } = boat(true);
    placeVessel(v, berth.x, 0, berth.z, berth.headingDeg);
    run(1);
    send('dock');
    run(10);
    send('lever', 0);
    send('engineStartStop');
    run(3);
    send('lever', 0.3);
    let maxOff = 0;
    let yMin = 9;
    let yMax = -9;
    run(30, () => {
      maxOff = Math.max(maxOff, Math.hypot(v.position[0] - berth.x, v.position[2] - berth.z));
      yMin = Math.min(yMin, v.position[1]);
      yMax = Math.max(yMax, v.position[1]);
    });
    expect(v.mooring.phase).toBe('moored');
    expect(maxOff).toBeLessThan(3);
    expect(yMax - yMin).toBeGreaterThan(0.005); // not pinned vertically
  });

  it('DOCK again casts off; DOCK outside a hot spot does nothing', () => {
    const { v, send, run } = boat();
    placeVessel(v, berth.x, 0, berth.z, berth.headingDeg);
    run(1);
    send('dock');
    run(5);
    send('dock');
    expect(v.mooring.phase).toBe('free');
    placeVessel(v, 0, 0, -22, 0);
    run(1);
    send('dock');
    expect(v.mooring.phase).toBe('free');
  });

  it('any pier face with water alongside is a berth: DOCK works on the Brannock pier too', async () => {
    const { allBerths } = await import('../src/world/berths');
    const gen = allBerths().filter((b) => !BERTHS.some((n) => n.id === b.id));
    expect(gen.length).toBeGreaterThan(4);
    const b = gen.find((g) => g.id.startsWith('brannock')) ?? gen[0];
    const { v, send, run } = boat();
    const a = berthAxis(b, false);
    placeVessel(v, b.x - b.shoreX * 6 + a.x * 2, 0, b.z - b.shoreZ * 6 + a.z * 2, b.headingDeg + 10);
    run(1);
    expect(berthInRange(v)?.berth.id).toBe(b.id);
    send('dock');
    expect(v.mooring.phase).toBe('docking');
    run(30);
    expect(v.mooring.phase).toBe('moored');
    expect(Math.hypot(v.position[0] - b.x, v.position[2] - b.z)).toBeLessThan(0.8);
  });

  it('the cabin light switch is a vessel control', () => {
    const { v, send } = boat();
    send('cabinLight', 1);
    expect(v.controls.cabinLight).toBe(1);
    send('cabinLight', 0);
    expect(v.controls.cabinLight).toBe(0);
  });

  it('the wheelhouse door starts open and is shut / opened by hand (not automatic)', () => {
    const { v, send, run } = boat();
    expect(v.controls.door).toBe(1);
    send('door', 0);
    run(2);
    expect(v.controls.door).toBe(0);
    send('door', 1);
    expect(v.controls.door).toBe(1);
  });
});

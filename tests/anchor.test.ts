import { describe, expect, it } from 'vitest';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { placeVessel } from '../src/vessel/vesselControl';
import { PORTS } from '../src/world/archipelago';

const DT = 1 / 60;

function setup() {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  const send = (control: string, value: number) => stepWorld(world, [{ playerId: localPlayerId, targetId: v.id, control, value } as Intent], DT);
  const run = (s: number, each?: () => void) => {
    for (let i = 0; i < s / DT; i++) {
      stepWorld(world, [], DT);
      each?.();
    }
  };
  return { world, v, send, run };
}

describe('anchor', () => {
  it('weighed while motoring off: comes home, and lets her go once up', () => {
    const { v, send, run } = setup();
    const a = PORTS.find((p) => p.id === 'selkie')!.cargo.anchorage!;
    placeVessel(v, a.x, 0, a.z, 0);
    send('engineStartStop', 1);
    run(5);
    send('anchor', 1);
    run(60);
    expect(v.anchor.phase).toBe('set');
    // Switch off and motor away straight away (the owner's case).
    send('anchor', 0);
    send('lever', 0.5);
    run(100);
    expect(v.anchor.phase).toBe('stowed');
    // Free: no chain pull from here on, wherever she goes (shallow water included).
    let maxT = 0;
    run(30, () => (maxT = Math.max(maxT, v.anchor.tension)));
    expect(maxT).toBe(0);
  });

  it("broken out and coming up, it doesn't set again in shallower water", () => {
    const { v, send, run } = setup();
    placeVessel(v, 0, 0, -300, 0);
    // Hanging, being heaved in, with more chain out than the depth here is deep.
    send('anchor', 0);
    v.anchor.phase = 'hanging';
    v.anchor.rodeM = 400; // longer than any depth
    v.anchor.x = v.position[0];
    v.anchor.z = v.position[2];
    run(1);
    expect(v.anchor.tension).toBe(0);
    expect(v.anchor.phase).toBe('hanging');
    expect(v.anchor.rodeM).toBeLessThan(400);
  });
});

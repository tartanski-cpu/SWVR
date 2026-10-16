import { describe, expect, it } from 'vitest';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { ENVIRONMENT_ID } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { placeVessel } from '../src/vessel/vesselControl';

const DT = 1 / 60;

describe('emergency calls off (menu Voyage)', () => {
  it('no new tow or fire call while quiet; they come again once switched back on', () => {
    const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), undefined, { tows: true, fires: true });
    world.environment.waves = [];
    const v = world.vessels[vesselId];
    placeVessel(v, 0, 0, -22, 0); // open water, out of harbour
    const env = (value: number): Intent => ({ playerId: localPlayerId, targetId: ENVIRONMENT_ID, control: 'quietCalls', value });
    stepWorld(world, [env(1)], DT);
    expect(world.quietCalls).toBe(true);
    // Both calls are due now.
    world.tow!.nextAt = world.time;
    world.fire!.nextAt = world.time;
    for (let i = 0; i < 120; i++) stepWorld(world, [], DT);
    expect(world.tow!.job).toBeNull();
    expect(world.fire!.job).toBeNull();
    stepWorld(world, [env(0)], DT);
    for (let i = 0; i < 120; i++) stepWorld(world, [], DT);
    expect(!!world.tow!.job || !!world.fire!.job).toBe(true);
  });
});

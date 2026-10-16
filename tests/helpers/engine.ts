import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import type { WorldState } from '../../src/core/world';
import type { VesselState } from '../../src/vessel/vesselState';

/**
 * Start the boat's engine and let it run up (3 s), so the deck hydraulics (crane, tow
 * winch, net drum) have pressure. A new world has the master and breakers on.
 */
export function startEngine(world: WorldState, v: VesselState): void {
  const dt = 1 / 60;
  stepWorld(world, [{ playerId: 'p', targetId: v.id, control: 'engineStartStop', value: 1 } as Intent], dt);
  for (let i = 0; i < 3 / dt; i++) stepWorld(world, [], dt);
}

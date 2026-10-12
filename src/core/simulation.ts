import { applyEnvironmentIntent, stepEnvironment } from '../environment/timeOfDay';
import { ENVIRONMENT_ID } from './ids';
import type { Intent } from './intents';
import type { WorldState } from './world';

/**
 * Advance the world by exactly one fixed tick.
 *
 * Pure with respect to the outside world: it reads only `world` and `intents`, so the
 * same function can later run headless on a server (see tests/simulation.test.ts).
 */
export function stepWorld(world: WorldState, intents: readonly Intent[], dt: number): void {
  // 1. Apply intents, routed by target entity.
  for (const intent of intents) {
    if (intent.targetId === ENVIRONMENT_ID) {
      applyEnvironmentIntent(world.environment, intent);
    }
    // Vessel intents are routed here from milestone 4.
  }

  // 2. Integrate systems.
  stepEnvironment(world.environment, dt);

  world.tick += 1;
  world.time = world.tick * dt;
}

import { applyEnvironmentIntent, stepEnvironment } from '../environment/timeOfDay';
import { prepareWaves, type PreparedWave } from '../ocean/waves';
import { stepVessel, type HydroDebug } from '../vessel/physics/vesselPhysics';
import { applyPlayerIntent } from '../player/playerControl';
import { applyPing, expirePings } from '../player/ping';
import { applyRescueIntent, isRescueIntent, stepRescue } from '../rescue/rescue';
import { applyVesselIntent, stepRefuelling } from '../vessel/vesselControl';
import { applyCargoIntent, deckVelocitiesBefore, isCargoIntent, payloadOf, stepDeckCargo } from '../cargo/cargo';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { ENVIRONMENT_ID, type EntityId } from './ids';
import type { Intent } from './intents';
import type { WorldState } from './world';

/** Optional per-vessel diagnostics written during a tick (not part of WorldState). */
export type SimDebug = Map<EntityId, HydroDebug>;

let simWaves: PreparedWave[] = [];

/**
 * Advance the world by exactly one fixed tick.
 *
 * Pure with respect to the outside world: it reads only `world` and `intents`, so the
 * same function can later run headless on a server (see tests/simulation.test.ts).
 */
export function stepWorld(world: WorldState, intents: readonly Intent[], dt: number, debug?: SimDebug): void {
  // 1. Apply intents, routed by target entity.
  for (const intent of intents) {
    if (isRescueIntent(intent.control)) {
      applyRescueIntent(world, intent);
    } else if (intent.control === 'ping') {
      applyPing(world, intent);
    } else if (isCargoIntent(intent.control)) {
      applyCargoIntent(world, intent);
    } else if (intent.targetId === ENVIRONMENT_ID) {
      applyEnvironmentIntent(world.environment, intent);
    } else if (world.vessels[intent.targetId]) {
      applyVesselIntent(world.vessels[intent.targetId], intent);
    } else if (world.players[intent.targetId]) {
      applyPlayerIntent(world, world.players[intent.targetId], intent);
    }
  }

  // 2. Integrate systems. Forces are evaluated at the start-of-tick time.
  stepEnvironment(world.environment, dt);
  simWaves = prepareWaves(world.environment.waves, world.time, simWaves);
  for (const vessel of Object.values(world.vessels)) {
    let dbg: HydroDebug | undefined;
    if (debug) {
      dbg = debug.get(vessel.id) ?? { stations: [], upLocal: [0, 1, 0], submergedVolume: 0 };
      debug.set(vessel.id, dbg);
    }
    const payload = payloadOf(world, vessel.id);
    const deckBefore = deckVelocitiesBefore(world, vessel);
    stepVessel(vessel, VESSEL_DEFS[vessel.defId], simWaves, dt, dbg, world.geography === 'archipelago', payload);
    stepDeckCargo(world, vessel, deckBefore, dt);
    stepRefuelling(vessel, VESSEL_DEFS[vessel.defId], dt, world.geography === 'archipelago');
  }

  expirePings(world);
  stepRescue(world, dt);
  world.tick += 1;
  world.time = world.tick * dt;
}

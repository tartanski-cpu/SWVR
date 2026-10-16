import { applyEnvironmentIntent, stepEnvironment } from '../environment/timeOfDay';
import { stepWeather } from '../environment/weather';
import { windForce } from '../vessel/physics/windage';
import { prepareWaves, type PreparedWave } from '../ocean/waves';
import { stepVessel, type HydroDebug } from '../vessel/physics/vesselPhysics';
import { vesselContacts } from '../vessel/physics/vesselContact';
import { applyPlayerIntent } from '../player/playerControl';
import { applyRescueIntent, isRescueIntent, stepRescue } from '../rescue/rescue';
import { applyBoardIntent, isBoardIntent } from '../board/board';
import { applyVesselIntent, stepRefuelling } from '../vessel/vesselControl';
import { applyCargoIntent, deckVelocitiesBefore, isCargoIntent, payloadOf, stepDeckCargo } from '../cargo/cargo';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { stepElectrics } from '../vessel/electrics';
import { stepBilge } from '../vessel/bilge';
import { stepOil } from '../vessel/maintenance';
import { stepForecast } from '../environment/forecast';
import { applyLogIntent, isLogIntent, stepLog } from '../log/log';
import { applyTrafficIntent, stepTraffic } from '../traffic/traffic';
import { stepDuties } from '../duties/duties';
import { applyDavitIntent, onDavit, stepTender } from '../vessel/davit';
import { applyFireIntent, isFireIntent, stepFire } from '../fire/fire';
import { applyTowIntent, isTowIntent, stepTow, towlineForces } from '../tow/tow';
import { applySalvageIntent, isSalvageIntent, stepSalvage } from '../salvage/salvage';
import { stepFishing, trawlForces } from '../fishing/fishing';
import { applyCareerIntent, isCareerIntent, stepCareer } from '../career/career';
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
    if (isBoardIntent(intent.control)) {
      applyBoardIntent(world, intent);
    } else if (isRescueIntent(intent.control)) {
      applyRescueIntent(world, intent);
    } else if (isFireIntent(intent.control)) {
      applyFireIntent(world, intent);
    } else if (isTowIntent(intent.control)) {
      applyTowIntent(world, intent);
    } else if (isCareerIntent(intent.control)) {
      applyCareerIntent(world, intent);
    } else if (isSalvageIntent(intent.control)) {
      applySalvageIntent(world, intent.playerId, intent.control);
    } else if (intent.control === 'davit') {
      applyDavitIntent(world, intent);
    } else if (isLogIntent(intent.control)) {
      applyLogIntent(world, intent);
    } else if (intent.control === 'trafficSpawn') {
      applyTrafficIntent(world, intent);
    } else if (isCargoIntent(intent.control)) {
      applyCargoIntent(world, intent);
    } else if (intent.targetId === ENVIRONMENT_ID) {
      applyEnvironmentIntent(world.environment, intent, world.time);
    } else if (world.vessels[intent.targetId]) {
      applyVesselIntent(world.vessels[intent.targetId], intent);
    } else if (world.players[intent.targetId]) {
      applyPlayerIntent(world, world.players[intent.targetId], intent);
    }
  }

  // 2. Integrate systems. Forces are evaluated at the start-of-tick time.
  stepEnvironment(world.environment, dt);
  stepWeather(world.environment, world.time, dt);
  simWaves = prepareWaves(world.environment.waves, world.time, simWaves);
  // Boat against boat (the tender alongside), from the start-of-tick states.
  // A tender hanging on the davit rides her ship instead (stepped below, after it).
  const touching = vesselContacts(Object.values(world.vessels), (v) => VESSEL_DEFS[v.defId], onDavit);
  // The towline (towing missions): its pull on us and on the tow.
  for (const [id, f] of towlineForces(world)) touching.set(id, [...(touching.get(id) ?? []), ...f]);
  // The trawl (fishing): its drag at the stern gallows.
  for (const [id, f] of trawlForces(world)) touching.set(id, [...(touching.get(id) ?? []), ...f]);
  for (const vessel of Object.values(world.vessels)) {
    if (onDavit(vessel)) continue;
    let dbg: HydroDebug | undefined;
    if (debug) {
      dbg = debug.get(vessel.id) ?? { stations: [], upLocal: [0, 1, 0], submergedVolume: 0 };
      debug.set(vessel.id, dbg);
    }
    const payload = payloadOf(world, vessel.id);
    const deckBefore = deckVelocitiesBefore(world, vessel);
    // External pushes: other boats (contact) and the wind (leeway).
    const wind = windForce(vessel, VESSEL_DEFS[vessel.defId], world.environment);
    const ext = touching.get(vessel.id);
    const external = wind ? [...(ext ?? []), wind] : ext;
    stepVessel(vessel, VESSEL_DEFS[vessel.defId], simWaves, dt, dbg, world.geography === 'archipelago', payload, external);
    stepDeckCargo(world, vessel, deckBefore, dt);
    stepRefuelling(vessel, VESSEL_DEFS[vessel.defId], dt, world.geography === 'archipelago');
    stepElectrics(vessel, dt);
    stepBilge(vessel, world.environment, dt);
    stepOil(vessel, dt);
  }
  for (const vessel of Object.values(world.vessels)) if (onDavit(vessel)) stepTender(world, vessel, dt);

  stepForecast(world);
  stepLog(world);
  stepTraffic(world, dt);
  stepDuties(world);
  stepRescue(world, dt, simWaves);
  stepTow(world, dt);
  stepFire(world, dt);
  stepSalvage(world, dt);
  stepFishing(world, dt);
  stepCareer(world);
  world.tick += 1;
  world.time = world.tick * dt;
}

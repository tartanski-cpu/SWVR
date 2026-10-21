import { applySlipIntent, isSlipIntent, stepSlipway } from '../world/slipway';
import { applyEnvironmentIntent, stepEnvironment } from '../environment/timeOfDay';
import { stepWeather } from '../environment/weather';
import { stepGusts } from '../environment/gusts';
import { setRaceClock, stepRaceKnocks } from '../world/currents';
import { applyCameraIntent, isCameraIntent, stepCameraHolds } from '../player/cameraHold';
import { windForce } from '../vessel/physics/windage';
import { prepareWaves, type PreparedWave } from '../ocean/waves';
import { stepVessel, type HydroDebug } from '../vessel/physics/vesselPhysics';
import { vesselContacts } from '../vessel/physics/vesselContact';
import { applyPlayerIntent } from '../player/playerControl';
import { sleepHours } from '../player/health';
import { applyRescueIntent, isRescueIntent, stepRescue } from '../rescue/rescue';
import { applySosIntent } from '../rescue/sos';
import { applyBoardIntent, isBoardIntent } from '../board/board';
import { applyVesselIntent, stepRefuelling } from '../vessel/vesselControl';
import { stepAutopilot } from '../vessel/autopilot';
import { applyCargoIntent, deckVelocitiesBefore, isCargoIntent, payloadOf, stepCraneCargo, stepDeckCargo } from '../cargo/cargo';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { stepEnergyNetwork } from '../vessel/electrics';
import { stepHullLeak } from '../vessel/bilge';
import { stepHullWear } from '../vessel/wear';
import { vesselRuntime } from '../boats/sims';
import { stepForecast } from '../environment/forecast';
import { applyTrafficIntent, stepTraffic } from '../traffic/traffic';
import { applySpawnBoatIntent } from './spawnBoat';
import { applyLaunchIntent, isLaunchIntent, stepLaunched } from './launch';
import { heldInPlace, lodStations, vesselLod } from './lod';
import { stepDuties } from '../duties/duties';
import { applyCraneIntent, onCrane, stepTender } from '../vessel/tenderCrane';
import { applyPainterIntent, painterForces } from '../vessel/physics/painter';
import { applyFireIntent, isFireIntent, stepFire } from '../fire/fire';
import { stepExtinguisher } from '../fire/extinguisher';
import { applyPottingIntent, isPottingIntent, stepPotting } from '../potting/potting';
import { applyFuelIntent, isFuelIntent, stepFuelHoses } from '../fuel/fuelHose';
import { applyTowIntent, isTowIntent, stepTow, towlineForces } from '../tow/tow';
import { applySalvageIntent, isSalvageIntent, stepSalvage } from '../salvage/salvage';
import { stepFishing, trawlForces } from '../fishing/fishing';
import { stepRodSale } from '../fishing/rod';
import { applyCareerIntent, isCareerIntent, stepCareer } from '../career/career';
import { applyTutorialIntent, isTutorialIntent, stepTutorial } from '../career/tutorial';
import { ENVIRONMENT_ID, type EntityId } from './ids';
import type { Intent } from './intents';
import { homeVessel, type WorldState } from './world';
import { regionAt } from '../world/regions';

/** Optional per-vessel diagnostics written during a tick (not part of WorldState). */
export type SimDebug = Map<EntityId, HydroDebug>;

let simWaves: PreparedWave[] = [];

/**
 * Advance the world by exactly one fixed tick.
 *
 * Pure with respect to the outside world: it reads only `world` and `intents`, so the
 * same function can later run headless on a server (see tests/simulation.test.ts).
 */
/**
 * The middle of the players, in world x, z (each aboard one counts at her position: aboard,
 * a player's own position is in her frame). No players: it stays where it was.
 */
function seaAnchor(world: WorldState): void {
  let x = 0;
  let z = 0;
  let n = 0;
  for (const p of Object.values(world.players)) {
    // (Not a recording camera: it can be anywhere.)
    if (p.avatar?.camera) continue;
    const v = p.aboardVesselId ? world.vessels[p.aboardVesselId] : undefined;
    const at = v ? v.position : p.position;
    x += at[0];
    z += at[2];
    n++;
  }
  if (n === 0) return;
  const a = (world.environment.seaAnchor ??= { x: 0, z: 0 });
  a.x = x / n;
  a.z = z / n;
}

export function stepWorld(world: WorldState, intents: readonly Intent[], dt: number, debug?: SimDebug): void {
  // Where the players are: the sea is kept continuous there as it changes (weather.ts).
  seaAnchor(world);
  // 1. Apply intents, routed by target entity.
  for (const intent of intents) {
    if (isCameraIntent(intent.control)) {
      applyCameraIntent(world, intent);
    } else if (intent.control === 'quietCalls') {
      world.quietCalls = intent.value > 0.5;
    } else if (isBoardIntent(intent.control)) {
      applyBoardIntent(world, intent);
    } else if (intent.control === 'sos') {
      applySosIntent(world, intent);
    } else if (isRescueIntent(intent.control)) {
      applyRescueIntent(world, intent);
    } else if (isFireIntent(intent.control)) {
      applyFireIntent(world, intent);
    } else if (isTowIntent(intent.control)) {
      applyTowIntent(world, intent);
    } else if (isTutorialIntent(intent.control)) {
      applyTutorialIntent(world, intent);
    } else if (isCareerIntent(intent.control)) {
      applyCareerIntent(world, intent);
    } else if (isSalvageIntent(intent.control)) {
      applySalvageIntent(world, intent.playerId, intent.control);
    } else if (isPottingIntent(intent.control)) {
      applyPottingIntent(world, intent);
    } else if (isFuelIntent(intent.control)) {
      applyFuelIntent(world, intent);
    } else if (isSlipIntent(intent.control)) {
      applySlipIntent(world, intent);
    } else if (intent.control === 'painter') {
      applyPainterIntent(world, intent);
    } else if (intent.control === 'crane') {
      applyCraneIntent(world, intent);
    } else if (intent.control === 'trafficSpawn') {
      applyTrafficIntent(world, intent);
    } else if (intent.control === 'spawnBoat') {
      applySpawnBoatIntent(world, intent);
    } else if (isLaunchIntent(intent.control)) {
      applyLaunchIntent(world, intent);
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

  stepCameraHolds(world);
  // 2. Integrate systems. Forces are evaluated at the start-of-tick time.
  stepEnvironment(world.environment, dt);
  // Everyone lying in a berth: asleep, the clock runs on (player/health.ts).
  const slept = sleepHours(world, dt);
  if (slept) world.environment.timeOfDay = (world.environment.timeOfDay + slept) % 24;
  // The weather director follows the profile of the region the home boat is in.
  const hv = homeVessel(world);
  const hvRegion = hv ? regionAt(hv.position[0], hv.position[2]) : undefined;
  stepWeather(world.environment, world.time, dt, hvRegion?.weather);
  // Katabatic gusts off the mountains (the region the home boat is in, if it has any).
  stepGusts(world.environment, world.time, hvRegion, hv?.position[0] ?? 0, hv?.position[2] ?? 0);
  // The tidal races' strength from the game clock: the water every sample reads this tick.
  setRaceClock(world.environment.timeOfDay, world.environment.raceOverride);
  simWaves = prepareWaves(world.environment.waves, world.time, simWaves);
  // Boat against boat (the tender alongside), from the start-of-tick states.
  // A tender in her cradle or on the crane rides her ship instead (stepped below, after it).
  const touching = vesselContacts(Object.values(world.vessels), (v) => VESSEL_DEFS[v.defId], onCrane);
  // The towline (towing missions): its pull on us and on the tow.
  for (const [id, f] of towlineForces(world)) touching.set(id, [...(touching.get(id) ?? []), ...f]);
  // The trawl (fishing): its drag at the A-frame's blocks.
  for (const [id, f] of trawlForces(world)) touching.set(id, [...(touching.get(id) ?? []), ...f]);
  // The skiff's painter: her bow line to the ship's cleat.
  for (const [id, f] of painterForces(world)) touching.set(id, [...(touching.get(id) ?? []), ...f]);
  for (const vessel of Object.values(world.vessels)) {
    if (onCrane(vessel)) continue;
    let dbg: HydroDebug | undefined;
    if (debug) {
      dbg = debug.get(vessel.id) ?? { stations: [], upLocal: [0, 1, 0], submergedVolume: 0 };
      debug.set(vessel.id, dbg);
    }
    const payload = payloadOf(world, vessel.id);
    // Water in the bilge is weight low in the hull (vessel/wear.ts).
    if (vessel.bilge) payload.push({ mass: vessel.bilge * CONFIG.wear.bilgeMassFull, pos: new THREE.Vector3(0, VESSEL_DEFS[vessel.defId].hull.params.keelY + 0.35, 0) });
    const deckBefore = deckVelocitiesBefore(world, vessel);
    // External pushes: other boats (contact) and the wind (leeway).
    const wind = windForce(vessel, VESSEL_DEFS[vessel.defId], world.environment);
    const ext = touching.get(vessel.id);
    const external = wind ? [...(ext ?? []), wind] : ext;
    // The autopilot (the helm assist panel) sets the wheel before her steering reads it.
    stepAutopilot(vessel);
    // Her level of detail by the nearest player (core/lod.ts): far and free, every other tick at twice the step.
    const lod = (vessel.lod = vesselLod(world, vessel));
    const everyOther = lod === 'far' && CONFIG.lod.everyOtherTick && !heldInPlace(world, vessel, !!ext?.length);
    if (!everyOther || world.tick % 2 === 0) stepVessel(vessel, VESSEL_DEFS[vessel.defId], simWaves, everyOther ? dt * 2 : dt, dbg, world.geography === 'archipelago', payload, external, lodStations(VESSEL_DEFS[vessel.defId].hull, lod));
    // In a running race, its whirl points knock her head and heel about.
    if (world.geography === 'archipelago') stepRaceKnocks(vessel, world.time, dt);
    // On a slipway (a bow-ramp boat landed): held where she lies, the waves no longer moving her.
    stepSlipway(vessel, dt);
    stepDeckCargo(world, vessel, deckBefore, dt);
    stepRefuelling(vessel, dt, world.geography === 'archipelago');
    // Her modules (every boat is built from a recipe since M6a): the energy network, the
    // hull's leak, the modules' upkeep (bilge pump, the engine's oil and wear), the hull's damage.
    const machinery = vesselRuntime(vessel)!;
    stepEnergyNetwork(vessel, machinery, dt);
    stepHullLeak(vessel, dt);
    machinery.tick(dt, world.time);
    stepHullWear(vessel, dt, world.environment.seaScale);
  }
  for (const vessel of Object.values(world.vessels)) if (onCrane(vessel)) stepTender(world, vessel, dt);
  // The deck cranes' HOOK presses (their machinery has just marked them).
  stepCraneCargo(world, dt);

  stepForecast(world);
  stepTraffic(world, dt);
  stepLaunched(world);
  stepDuties(world);
  stepRescue(world, dt, simWaves);
  stepTow(world, dt);
  stepExtinguisher(world, dt);
  stepPotting(world, dt);
  stepRodSale(world);
  stepFuelHoses(world);
  stepFire(world, dt);
  stepSalvage(world, dt);
  stepFishing(world, dt);
  stepCareer(world);
  stepTutorial(world);
  world.tick += 1;
  world.time = world.tick * dt;
}

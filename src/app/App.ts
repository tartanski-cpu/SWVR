import { PASSAGE_PORTS, passageBlocker, passageTime, planPassage, type Cruise } from '../career/passage';
import { measureCruise } from '../vessel/seaTrials';
import { busLive } from '../plant/plant';
import { AZI_HELM_CODES, glanceYaw, pointAndPush, stepDriveKeys, type DriveAsk, type DriveKeys } from '../player/aziHelm';
import { KEY_LEAN, wrapDeg } from '../modules/azimuthLevers/lever';
import { AziDials } from '../ui/aziDials';
import * as THREE from 'three';
import { FLEET, FLEET_IDS } from '../boats/fleet';
import { diveGeometry } from '../modules/diveFrame';
import { diveFrameOf, diveFrameState, diveSubDocked } from '../modules/diveFrame/onBoat';
import { diveReady, diveUrl } from '../modules/diveFrame/launch';
import { CONFIG } from '../config';
import { IdFactory, ENVIRONMENT_ID, type EntityId } from '../core/ids';
import { IntentQueue } from '../core/intents';
import { Keyboard } from '../core/keyboard';
import { FixedStepLoop } from '../core/loop';
import { stepWorld, type SimDebug } from '../core/simulation';
import { createWorld, type WorldState } from '../core/world';
import { randomLook } from '../net/avatarOutfits';
import { updatePanelLighting } from '../controls/panelLighting';
import { NavMarksView } from '../world/view/navMarksView';
import { ProjectView } from '../career/projectView';
import { HelpPanel } from '../debug/helpPanel';
import { DebugOverlay } from '../debug/overlay';
import { EnvironmentView } from '../environment/environmentView';
import { DesktopController } from '../player/desktopController';
import { PlayerRig } from '../player/playerRig';
import { XRInput, XR_BUTTON } from '../player/xrInput';
import { SkyView } from '../environment/skyView';
import { OceanView } from '../ocean/oceanView';
import { prepareWaves, significantWaveHeight, surfaceHeight, type PreparedWave } from '../ocean/waves';
import { SurfaceProbes } from '../debug/surfaceProbes';
import { paperColour } from '../render/nightPaper';
import { HydroDebugView } from '../debug/hydroDebugView';
import { craneOf, onCrane, recoverCheck } from '../vessel/tenderCrane';
import { hydraulicsOn, isPowered } from '../vessel/electrics';
import { beaufort, compass8, setLiveWeather, visibilityAt, windVector } from '../environment/weather';
import { seaStateWaves } from '../environment/environmentState';
import { fetchLiveWeather } from '../world/coastWeather';
import { liveWeatherText } from '../voyage/liveWeather';
import { setShortSeasOff, updateWindSea, windSeaText } from '../ocean/windSea';
import { voyageMap } from '../world/maps';
import { takeWorld } from '../net/takeWorld';
import { gustZone } from '../environment/gusts';
import { RainView } from '../environment/rainView';
import { ChartTableView } from '../vessel/view/chartTable';
import { dipstickReading } from '../vessel/maintenance';
import { TrafficView } from '../traffic/trafficView';
import { HarbourBoatsView } from '../world/view/harbourBoatsView';
import { SkylineView } from '../world/view/skylineView';
import { WindFarmView } from '../world/view/windFarmView';
import { TransferView } from '../transfer/transferView';
import { AquaView } from '../aqua/aquaView';
import { FarmCrewView } from '../aqua/farmCrewView';
import { FerryView } from '../traffic/ferryView';
import { SHIP_NAMES } from '../traffic/traffic';
import { ChartTools, type ChartToolsContext } from '../chart/chartTools';
import { applyChartOp, createMarks, parseMarks, pointCount, serializeMarks, type ChartOp } from '../chart/marks';
import type { WindSock } from '../vessel/view/windSock';
import type { MastApi } from '../modules/mast';
import type { SearchlightApi } from '../modules/searchlight';
import type { FireMonitorApi } from '../modules/fireMonitor';
import type { FireGauge } from '../fire/fireGauge';
import { DutyBoardView } from '../duties/dutyBoardView';
import { TenderCraneView } from '../controls/TenderCraneView';
import { hasWheelhouse, houseFloorAt, houseFloorLow, housesOf, houseX, VESSEL_DEFS, type WheelhouseDef } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { VesselView } from '../vessel/view/vesselView';
import { hullPlan, STEP_HEIGHT, vesselWalkArea, type WalkArea } from '../vessel/layout';
import { standingHeight } from '../world/geography';
import { climbOut, jump, swimArea, updateAir, updateSwim, yawOf, type BodyVessel } from '../player/body';
import { beached, rampCrossing, rampFloor, rampWalkable, slipOf } from '../world/slipway';
import { landFloor, worldWalkArea } from '../world/landWalkArea';
import { quaySpot } from '../world/startSpot';
import { leverDemand } from '../vessel/physics/propulsion';
import { Locomotion } from '../player/locomotion';
import { ComfortOverlay, MotionDecoupler } from '../player/comfort';
import { PLAYER_NAMES, saveUserSettings, userSettings } from '../player/userSettings';
import { WristMenu } from '../ui/wristMenu';
import { mainMenu, type MenuHost } from '../ui/mainMenu';
import { placeInFront } from '../ui/placeInFront';
import { canRefuel, releaseHolds } from '../vessel/vesselControl';
import { CURRENTS, FISHING_GROUNDS, GUSTS, PORTS, SKYLINE, SKYLINE_STYLE, WIND_FARMS } from '../world/archipelago';
import { raceRoarLevel, raceStrength, setRaceClock } from '../world/currents';
import { SurfListener } from '../world/surf';
import { REGIONS, regionAt, regionById } from '../world/regions';
import { MODE, VOYAGE_MAP_ID } from '../mode';
import { forgetPlace, headingOf, placeOf, rememberPlace, restorePlace, savedPlace } from './voyagePlace';
import { nextPoint, parsePlan, pointLabel, savePlanText, tableBerthNear } from '../voyage/plan';
import { planFaceAspect, PlanTable, planTableSize, planTableSpot, type PlanTableForm, type PlanTableSpot } from '../voyage/planTable';
import { ChartPad, PadFaces, type PadFace } from '../voyage/chartPad';
import { PlanChartPanel } from '../ui/planChartPanel';
import { KEYS } from '../core/keybindings';
import { ChartBoard } from '../player/chartBoard';
import type { HeardBoat } from '../audio/boatVoices';
import { boatOwnerName, launchType, ownedBoat, playerBoats } from '../core/launch';
import { berthWithId } from '../world/berths';
import { groundHeight } from '../world/terrain';
import { coastStreamer } from '../world/coastStream';
import { setPaintNight } from '../render/pixelPaint';
import { treeLevel } from '../world/view/treesView';
import { MAX_SHELTERS } from '../world/shelter';
import type { ShelterDef } from '../world/defs';
import { aboard, carriedBy, dropCarried, cargoLabel, cargoPortAt, hookNote, kindOf, payloadMass, quickLoadable, quickPort, quickUnloadable, slotsUsed, type CargoItem } from '../cargo/cargo';
import { groundAt, isPot, quickHaulable, quickPalletPots } from '../potting/potting';
import { CargoHands, type CargoHandsContext } from '../cargo/cargoHands';
import { CargoView } from '../cargo/cargoView';
import { berthById } from '../vessel/physics/mooring';
import { XRControllers } from '../player/xrControllers';
import { HandGestures } from '../player/handGesture';
import { OwnHands } from '../player/ownHands';
import { CameraMode } from '../player/cameraMode';
import { GamepadInput, PAD, PAD_KEYS, PAD_KEYS_AT_HELM, PAD_MOUSE, padHelm, padLever, type PadState } from '../player/gamepad';
import { HelmPrompt } from '../ui/helmPrompt';
import { YardBoard } from '../ui/yardBoard';
import { CargoTerminal } from '../ui/cargoTerminal';
import { careerShipyardSpots, ShipyardDoor } from '../ui/shipyardDoor';
import { Wheel } from '../controls/Wheel';
import type { PlayerState } from '../player/playerState';
import { struckByPropeller } from '../rescue/propStrike';
import { fallHarm, fireExposure, stepHealth, wakeNow } from '../player/health';
import { PropStrikeView } from '../rescue/propStrikeView';
import { lookFromId, turnHands } from '../net/avatarOutfits';
import { BoatView } from './boatView';
import type { Control } from '../controls/Control';
import { InteractionSystem, type HandFrame } from '../controls/InteractionSystem';
import { WorldView } from '../world/view/worldView';
import { LaserPointer } from './laserPointer';
import { SoundBoard } from './soundBoard';
import { TouchControls, wantsTouchControls } from '../ui/touchControls';
import { TowlineView } from '../tow/towlineView';
import { PotView } from '../potting/potView';
import { LonglineView } from '../fishing/longlineView';
import { LonglineHands, type LonglineHandsContext } from '../fishing/longlineHands';
import { PotHands, type PotHandsContext } from '../potting/potHands';
import { FuelView } from '../fuel/fuelView';
import { FuelHands, type FuelHandsContext } from '../fuel/fuelHands';
import { PainterView } from '../vessel/view/painterView';
import { cleatName, painterPlan } from '../vessel/physics/painter';
import { Binoculars } from '../player/binoculars';
import { HandGear, type GearKind } from '../player/handGear';
import { GearView } from '../player/gearView';
import { extinguisherShip } from '../fire/extinguisher';
import { fireAlertT } from '../fire/fire';
import { FireView, JetView } from '../fire/fireView';
import { WildlifeView } from '../wildlife/wildlifeView';
import { LogView } from '../salvage/logView';
import { CareerSession, forgetCareerDesign, savedCareer } from './careerSession';
import { cranePosts, REMOTE_CODES, REMOTE_REACH, remoteInput, type CranePost } from './craneRemote';
import { equipmentWithout, KIT_BOATS, money, socketsWithout, spend, yardAt } from '../career/career';
import { backUrl, isSeaTrial, isTryOut, refitCost, refitReturn, shipyardUrl } from './shipyardTrip';
import { TrawlView } from '../fishing/trawlView';
import { InteriorDetail } from './interiorDetail';
import { jetOn } from '../fire/fire';
import { aFrameOf } from '../fishing/fishing';
import { footprintsOf, gearOf, useStarterKit, useWorkboatFit } from '../boats/sims';
import type { TowWinchApi } from '../modules/towWinch';
import { sosCondition, sosStatus } from '../rescue/sos';
import { RodGame } from '../fishing/rodGame';
import { HelmCamera } from '../player/helmCamera';
import { ringIn, distanceToHull } from '../rescue/recovery';
import { RodView } from '../fishing/rodView';
import { LineGun } from '../tow/lineGun';
import { FenderHands, type FenderHandsContext } from '../player/fenderHands';
import { Gangway, type GangwayContext } from '../player/gangway';
import { BelowDecks, crewAreaFor, crewLayoutFor, inCrewArea, roomFor } from './engineRoom';
import type { FendersApi } from '../modules/fenders';
import { LineGunView } from '../tow/lineGunView';
import { lineLength, lineOf, nearestTowTarget, sternLocal, towAlertT, towName, towPoint, towStatus, towTargets, winchStalled } from '../tow/tow';
import { TargetsView } from '../rescue/targetView';
import { RescueHands, type RescueHandsContext } from '../rescue/rescueHands';
import { RescueGearView, type AvatarHands } from '../rescue/rescueGearView';
import { FoilFeel, foilSoundLevels } from '../audio/foilAudio';
import { lastSpeech, speechVoices } from '../audio/babble';
import { mixer, type Bus } from '../audio/mixer';
import type { TillerApi } from '../modules/tiller';
import { BoardView, type BoardContext } from '../board/boardView';
import { NoteKeyboard } from '../board/noteKeyboard';
import { parseBoard } from '../board/board';
import { DesktopHand } from '../player/desktopHand';
import { playerColor } from '../net/avatarView';
import { CameraPreview } from '../player/cameraPreview';
import { createRescueState, nearestPort, runStatus } from '../rescue/rescue';
import { engineAlarms } from '../vessel/physics/engineThermal';
import { VesselEffects } from '../vessel/view/vesselEffects';
import { sunElevation } from '../environment/timeOfDay';
import { clamp, type Quat } from '../core/math';
import { GpuTimer } from '../debug/gpuTimer';
import { TrialsPanel } from '../debug/trialsPanel';
import { vesselReadout } from '../debug/vesselReadout';
import { countBoatParts } from '../debug/boatParts';
import { assembleView } from '../modular/assemble';
import { holdGroup } from '../modular/bus';
import { HULLS, LIBRARY, RECIPES, boatTokenOf, boatType, boatTypeOf, designCodeOf, ensureBoatTypes, isBoatType } from '../boats/library';
import { buildDesign } from '../shipyard/build';
import { readDesign, sameDesign } from '../shipyard/designDoc';
import { groupCode, ShipyardCodes } from '../shipyard/takeHer';
import { DesktopPointer } from './desktopPointer';
import { setupXR, xrSessionInfo } from './xrSession';
import { applyPlayerIntent } from '../player/playerControl';
import { HostSession } from '../net/hostSession';
import { ClientSession } from '../net/clientSession';
import type { RestartNotice } from '../net/protocol';
import { electedHost } from '../net/takeover';
import { plainNetError, PeerClientTransport, PeerHostTransport, peerIdForRoom, randomRoomCode, type ClientTransport } from '../net/transport';
import type Peer from 'peerjs';
import { VoiceChat, type VoiceSpeaker } from '../net/voice';
import { canShowTab, TvCast } from '../modules/furniture/tvCast';
import { TvScreen } from '../modules/furniture/tvScreen';
import { tvKey } from '../modules/furniture/tvState';
import { APP_BUILD, isNewerBuild } from '../build';
import { RadioHandset } from '../player/radioHandset';
import { vrFlySpeed, vrFlyStep } from '../player/vrFly';
import { NET_RATE, type PlayerPose } from '../net/protocol';
import { AvatarsView } from '../net/avatarView';
import { fuelTankL } from '../vessel/fuelTank';
import { applyDiveReturn, consumeDiveReturn, foundNames, takeDiveReturn, type DiveReturn } from '../dive/diveReturn';
import { siteLabel } from '../dive/diveSites';
import { consumeReturn, issueId, newHandoffId, outboundUrl, takeEnvelope, type Envelope, type MetaverseSite } from '../voyage/metaverse';
import { bargesKey, bargesToSave, HotspotWatch, logsFromCamp, merchantsOn, parseBarges, parseTimberLogs, positionFor, restoreBarges, restoreTimberLogs, applyTimberSell, saleOffer, saleText, sitesOn, hotspotAt, timberLogsKey, timberLogsToSave } from '../voyage/timber';
import { TimberView } from '../voyage/timberView';

/**
 * Top-level wiring. Owns the renderer, the simulation state and the per-frame loop:
 *
 *   gather input  ->  intents  ->  N fixed sim ticks  ->  update views (with alpha)  ->  render
 */
/** Where the host keeps the whiteboard's notes between visits. */
const BOARD_KEY = 'swvr.board';
/** ...and the pencil marks on the paper chart. */
const CHART_KEY = 'swvr.chart';
/** ...and the batteries when we left (only with electrics.drainBetweenSessions). */
const BATTERY_KEY = 'swvr.battery';
/** ...and the boat you launched last in a Voyage game (multi-boat M5). */
/** Voyage's account (the timber merchant's money; all maps): kept in this browser. */
const LAST_BOAT_KEY = 'swvr.voyage.lastBoat';
/** Voyage mode: the crew's plan for a map, saved by the host (voyage/plan.ts). */
const planKey = (map: string) => `swvr.voyage.plan.${map}`;
/** Where this page's plan is kept: a Voyage map's own, or the career's (owner, 28 Oct 2026: "career too"). */
const planSaveKey = () => (MODE === 'voyage' && VOYAGE_MAP_ID ? planKey(VOYAGE_MAP_ID) : 'swvr.career.plan');

/**
 * The boat the game starts in: the page's `?boat=` (Debug > Boat > Start in, modular boats
 * M7), a vessel type with a recipe and a cabin to work her from; else the workboat.
 */
/** Why the page's ?design= code couldn't be read (shown once the game is up), if it couldn't. */
let designCodeError: string | null = null;

/**
 * A fresh start in another boat (the page's `?boat=`, the rest of the address kept): a new
 * world, her views and controls. The boat a career kits out (career.ts KIT_BOATS) is built as
 * the career has her; 'workboat:all': the old workboat with all her equipment (`?fit=all`,
 * for testing). The game's own start boat (CONFIG.career.boat) needs no `?boat=`.
 */
function restartIn(defId: string): URL {
  const url = new URL(location.href);
  url.searchParams.delete('design');
  url.searchParams.delete('fit');
  if (defId === 'workboat:all') {
    url.searchParams.set('fit', 'all');
    defId = 'workboat';
  }
  if (defId === CONFIG.career.boat) url.searchParams.delete('boat');
  else url.searchParams.set('boat', defId);
  return url;
}

/** A fresh start in a Shipyard boat (the page's `?design=`): Office > Your boats (shipyard/takeHer.ts). */
function restartInDesign(code: string): URL {
  const url = new URL(location.href);
  url.searchParams.delete('boat');
  url.searchParams.set('design', code);
  return url;
}

/** The browser's storage, if it lets us have it (a private window may not). */
function browserStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** The boats you can start in (a home boat needs a wheelhouse for now). */
const START_BOATS = [...FLEET_IDS, 'alaskan38'];

/** The Shipyard code of the design the game started in, if it did. */
let startDesignCode: string | null = null;

/**
 * A sea trial (CONFIG.career.seaTrialS; the free career boats, review Oct 2026): the career page
 * started in a Shipyard design the career hasn't paid for (not her own CareerState.design, not
 * a paid refit coming back). Nothing is saved; after the trial's time she's back in her own boat.
 */
let seaTrial = false;
/** A try-out together (shipyardTrip.ts isTryOut): no clock, nothing saved. */
let tryOut = false;

function startBoat(): string | undefined {
  // A Shipyard design (?design=CODE, or her document: shipyard/designDoc.ts); else, in the
  // career, the design she was refitted to at a yard (CareerState.design, app/shipyardTrip.ts).
  const params = new URLSearchParams(location.search);
  const careerDesign = MODE === 'career' && !params.has('design') && !params.has('boat') && !params.has('join') ? (savedCareer()?.design ?? null) : null;
  const code = params.get('design') ?? careerDesign;
  seaTrial = isSeaTrial(MODE, location.search, savedCareer()?.design);
  tryOut = isTryOut(MODE, location.search, savedCareer()?.design);
  if (code) {
    // Her own vessel type, keyed by her token (multi-boat M1: boats/library.ts boatType).
    const id = boatType(code);
    if (id) {
      startDesignCode = boatTokenOf(id);
      return id;
    }
    const read = readDesign(code);
    const error = 'error' in read ? read.error : "the Shipyard can't build her";
    console.warn(`Shipyard code ${code.slice(0, 40)}: ${error}`);
    designCodeError = error;
    seaTrial = tryOut = false; // she isn't there: no trial
    // The career's own refit won't build: forget it, so the career loads (in the beginner boat).
    if (careerDesign) {
      forgetCareerDesign();
      designCodeError = `your refitted boat's design won't build (${error})`;
    }
  }
  const id = new URLSearchParams(location.search).get('boat');
  return id && RECIPES[id] && VESSEL_DEFS[id] && hasWheelhouse(VESSEL_DEFS[id]) ? id : undefined;
}
/** ...and the number of rescues completed. */
const RESCUES_KEY = 'swvr.rescues';

/**
 * The equipment the career's boat (the beginner boat; the old workboat, for testing) starts
 * without (career upgrade ids, CONFIG.career.upgrades `fit`; owner, Oct 2026: a new career
 * starts in a simple boat and buys the rest at the yard). The page's `?fit=` says what's fitted (a list, or "all"; Debug > Start in, and crew
 * joining a host build the host's boat with it); else the career in the slot last used: a
 * new career has none of it, one saved before this has it all (career.ts parseCareer).
 */
function startFit(): string[] {
  const p = new URLSearchParams(location.search).get('fit');
  if (p === 'all') return [];
  if (p !== null) return equipmentWithout(p.split(','));
  return equipmentWithout(savedCareer()?.upgrades ?? []);
}

/** The page's `?join=` (a crew-mate's page reloaded to build the host's boat): the game to join. */
const START_JOIN = new URLSearchParams(location.search).get('join');

/**
 * "Try her together" from the Shipyard (owner, Oct 2026): the one who pressed it comes with
 * `?host=ROOM` (host the game in that room), everyone else in the session with `?together=ROOM`
 * (join it, waiting for the host to be up). 5 digits each, as the game codes.
 */
const START_PARAMS = new URLSearchParams(location.search);
const START_HOST = /^\d{5}$/.test(START_PARAMS.get('host') ?? '') ? START_PARAMS.get('host')! : null;
const START_TOGETHER = /^\d{5}$/.test(START_PARAMS.get('together') ?? '') ? START_PARAMS.get('together')! : null;
/** Reloaded once already to catch up with the host's version (`?fresh=`): don't again. */
const START_FRESH = START_PARAMS.has('fresh');
/**
 * The game this page is in (owner, Oct 2026: one address to share): `?game=CODE` is put on
 * the address once you host or join, so the address carries the game. Opened by a friend it
 * joins that game (waiting for the host as "sent in together" does); reloaded by the host's
 * own tab (this tab remembers it hosts, `HOSTING_KEY`) it hosts the code again. Taken off
 * the address on leaving.
 */
const START_GAME = /^\d{5}$/.test(START_PARAMS.get('game') ?? '') ? START_PARAMS.get('game')! : null;
const HOSTING_KEY = 'swvr.hostingGame';
/** Does this tab host `code` (remembered across its own reloads)? */
function tabHosts(code: string): boolean {
  try {
    return sessionStorage.getItem(HOSTING_KEY) === code;
  } catch {
    return false;
  }
}
/**
 * The host's world kept over its own reload (multiplayer study #29: a reload, or catching up
 * with a newer build, started the game again from the career's last save, and every crew
 * boat, tow and load out there was gone): written as the page goes, read back within
 * CONFIG.net.hostWorldKeepS when it hosts the same code again. In this tab only.
 */
const HOST_WORLD_KEY = 'swvr.hostWorld';
interface KeptHostWorld {
  code: string;
  t: number;
  /** Our own player in it. */
  me: EntityId;
  /** A friend's career, hosted on (takeOver): still not saved here. */
  borrowed: boolean;
  world: WorldState;
}
function rememberHosting(code: string | null): void {
  try {
    if (code) sessionStorage.setItem(HOSTING_KEY, code);
    else sessionStorage.removeItem(HOSTING_KEY);
  } catch {
    // No storage: a reload of the host's tab joins its own old code instead (and finds nothing).
  }
}
/**
 * This browser tab's id for multiplayer (kept across its reloads, not shared with another
 * tab): sent with each join, so the host replaces the tab's old self (a reload, a dropped
 * link) instead of keeping a frozen copy (multiplayer study #1).
 */
function tabClientId(): string {
  try {
    let id = sessionStorage.getItem('swvr.netClientId');
    if (!id) sessionStorage.setItem('swvr.netClientId', (id = Math.random().toString(36).slice(2, 12)));
    return id;
  } catch {
    return '';
  }
}
/** A camera held flipped (player/cameraHold.ts `back`): a half turn about the hand's up, so it faces the holder. */
const FLIPPED = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
/** The grab camera in a VR hand: tilted forward from the grip's axis (CONFIG.camera.holdPitchDeg). */
const HOLD_TILT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (CONFIG.camera.holdPitchDeg * Math.PI) / 180);

/** The game code on the address (shareable), or none. */
/**
 * Our own page, before joining took us anywhere (multiplayer study #22, #26): a join can reload
 * this tab into the host's map, mode or boat, and Leave game came back to theirs (on Oban
 * instead of your own map, or in the host's Shipyard boat as a "sea trial" of your career).
 * Kept in the tab when a join starts; Leave game goes back to it. A page opened as itself
 * (no join on its address) forgets it.
 */
const OWN_PAGE_KEY = 'swvr.ownPage';
/** The keys that type a game code on the Crew tab (App typeCodeKeys): their usual jobs wait. */
/** While the planning chart's open on the desktop, every game key but M (which closes it) is its: you don't walk off while planning. */
const CHART_PANEL_CODES = Object.values(KEYS).flatMap((k) => k.codes).filter((c) => c !== 'KeyM');
const CODE_KEYS = [...Array.from({ length: 10 }, (_, d) => [`Digit${d}`, `Numpad${d}`]).flat(), 'Backspace', 'Enter', 'NumpadEnter'];
/** This page's address, its folder (/SWVR/ the game, /SWVR/next/ the test build, a preview's). */
const SITE = location.pathname.replace(/[^/]*$/, '');
/** Parameters that belong to a game joined or hosted, never to your own page. */
const GAME_PARAMS = ['join', 'host', 'together', 'game', 'fresh', 't', 'refitFrom', 'mv'];
function rememberOwnPage(): void {
  try {
    if (sessionStorage.getItem(OWN_PAGE_KEY)) return;
    const url = new URL(location.href);
    for (const k of GAME_PARAMS) url.searchParams.delete(k);
    sessionStorage.setItem(OWN_PAGE_KEY, url.toString());
  } catch {
    // No storage: Leave game falls back to this page without the game's parameters.
  }
}
/** Where Leave game goes: our own page as it was, else this one without the game's parameters (and, if it followed a host, their boat). */
function ownPageUrl(): URL {
  try {
    const kept = sessionStorage.getItem(OWN_PAGE_KEY);
    sessionStorage.removeItem(OWN_PAGE_KEY);
    if (kept) return new URL(kept);
  } catch {
    // Not kept.
  }
  const url = new URL(location.href);
  const followed = START_PARAMS.has('join') || START_PARAMS.has('together');
  for (const k of [...GAME_PARAMS, ...(followed ? ['design', 'boat', 'fit'] : [])]) url.searchParams.delete(k);
  return url;
}
// This page opened as itself: any page kept from an earlier join in this tab is stale.
if (!['join', 'together', 'host', 'game'].some((k) => START_PARAMS.has(k))) {
  try {
    sessionStorage.removeItem(OWN_PAGE_KEY);
  } catch {
    // No storage.
  }
}

function showGameOnAddress(code: string | null): void {
  const url = new URL(location.href);
  if (code) url.searchParams.set('game', code);
  else url.searchParams.delete('game');
  if (url.toString() !== location.href) history.replaceState(null, '', url.toString());
}


/** The address without the start-up parameters that are only for this load (join and the fit that came with it, host, together, the cache-buster). */
function forgetStartParams(): void {
  const url = new URL(location.href);
  const once = ['join', 'fit', 'host', 'together', 'fresh', 't'];
  if (!once.some((k) => url.searchParams.has(k))) return;
  for (const k of once) url.searchParams.delete(k);
  history.replaceState(null, '', url.toString());
}


export class App {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  // Simulation
  readonly ids = new IdFactory();
  readonly world: WorldState;
  /** Changes when joining someone else's game (the host hands out player ids). */
  localPlayerId: EntityId;
  /** Our id when playing alone, restored after leaving a game. */
  private readonly soloPlayerId: EntityId;
  /** The vessel the bridge, debug keys and audio act on (the MVP has exactly one). */
  /**
   * Your boat: the one you're aboard (multi-boat M2), as long as she has a wheelhouse to work
   * her from; otherwise the last one you were. The dash, sounds, gear mounts, bridge wiring and
   * interior detail follow it (becomeAboard). It starts as the boat the page was built for.
   */
  private testVesselId: EntityId;
  /** The boat this page was built for (the career's, the one `?boat=` / `?design=` named). */
  private readonly startVesselId: EntityId;
  readonly intents = new IntentQueue();
  private readonly loop = new FixedStepLoop(CONFIG.sim.tickRate, CONFIG.sim.maxTicksPerFrame);

  // Input and views
  private readonly keyboard = new Keyboard();
  private readonly xrInput = new XRInput();
  private readonly rig: PlayerRig;
  private readonly desktop: DesktopController;
  private readonly environment: EnvironmentView;
  private readonly sky = new SkyView();
  private readonly ocean = new OceanView();
  /** The water colour in force (setWater): the map's own, or undefined for the sea's. */
  private waterNow: { deep: number; scatter: number } | undefined;
  private readonly probes = new SurfaceProbes();
  private readonly vesselViews = new Map<EntityId, VesselView>();
  private readonly hydroViews = new Map<EntityId, HydroDebugView>();
  private readonly simDebug: SimDebug = new Map();
  /** How dark it is (0 day .. 1 night), this frame. */
  private darkness = 0;
  /** The paper's colour for the light on it (chart, boards: render/nightPaper.ts). */
  private readonly paper = new THREE.Color();
  /** Every sound system (soundBoard.ts). */
  private readonly sound = new SoundBoard();
  /** On-screen controls for a phone or tablet (ui/touchControls.ts), if shown. */
  private touch: TouchControls | null = null;
  /** Board at the helm on the first frame (touch controls, CONFIG.touch.startAboard). */
  private boardOnStart = false;
  /**
   * Voyage mode: the planning table at the harbour you're at, or its stand where there's no
   * room (voyage/planTable.ts: each made the first time it's wanted, then moved), the one up
   * now, and the planning chart they show (this page's own view); the plan's changes saved,
   * its last note shown.
   */
  private readonly planTables: Partial<Record<PlanTableForm, PlanTable>> = {};
  private planTable: PlanTable | null = null;
  private quayPad: ChartPad | null = null;
  /** Where the quay's Shipyard signs stand by when neither a table nor a stand fits (the spot ashore). */
  private readonly planAnchor = new THREE.Group();
  /** Each harbour's table spot, once looked for (the search is long): the table, the stand, or neither (null). */
  private readonly planSpots = new Map<string, { form: PlanTableForm; at: PlanTableSpot } | null>();
  /** Seconds to the next look for the nearest harbour. */
  private planLookT = 0;
  /**
   * The planning charts on things in the world (voyage/chartPad.ts): the quay table's, the
   * chart table's PLAN sheet, the plotter's PLAN mode; a hand's ray or the reticle works them.
   */
  private readonly padFaces = new PadFaces();
  /** The planning chart, each player's own view (voyage/planChart.ts): full-screen on the desktop (M), on a board in the left hand in VR. */
  private readonly planPanel = new PlanChartPanel({ world: () => this.world, ownBoatId: () => this.drivenVesselId(), send: (ref, args) => this.sendPlan(ref, args) });
  private readonly chartBoard = new ChartBoard({ world: () => this.world, ownBoatId: () => this.drivenVesselId(), send: (ref, args) => this.sendPlan(ref, args) });
  /** Voyage mode: the sign into the Shipyard beside the planning table (ui/shipyardDoor.ts). */
  private shipyardDoor: ShipyardDoor | null = null;
  /** Voyage mode: the Your boats board on the planning table's other side. */
  private boatsBoard: ShipyardDoor | null = null;
  /** The career: a sign into the Shipyard on the quay at every harbour (ui/shipyardDoor.ts careerShipyardSpots). */
  private shipyardSigns: ShipyardDoor[] = [];
  private planSaved = -1;
  private planNoteT = -1;
  /** The berth the table was placed by (null: not placed yet). */
  private planTableBerth: string | null = null;
  /** Seconds since the voyage place was last remembered (rememberVoyagePlace). */
  private rememberT = 0;
  /** Voyage's timber run (voyage/timber.ts): the bays on this map, the watch for anchoring in one, what's drawn. */
  private readonly timberSites: MetaverseSite[] = MODE === 'voyage' ? sitesOn(VOYAGE_MAP_ID) : [];
  private readonly timberWatch = new HotspotWatch();
  private timberView: TimberView | null = null;
  private saleShown: string | null = null;
  private leavingForCamp = false;
  /** Gone to the submersible game (the dive A-frame's DIVE): leaving, so not twice. */
  private leavingForDive = false;
  /** On the way to the Shipyard (app/shipyardTrip.ts): the page is about to change. */
  private leavingForShipyard = false;
  private readonly timberPrompt = new HelmPrompt(118);
  private readonly fade = document.createElement('div');
  private timberNote: string | null = null;
  /** The chart's special places: the timber camp's bay, the merchant (chartPlotter specials). */
  private readonly timberSpecials: { x: number; z: number; r?: number; label: string; kind: 'anchorage' | 'merchant' }[] = [];
  private readonly trialsPanel = new TrialsPanel();
  /** Which vessel (if any) the local rig is currently parented to. */
  private rigParentId: EntityId | null | undefined = undefined;
  private readonly walkAreas = new Map<EntityId, WalkArea>();
  /** Off the boat: islands, quays and piers. */
  private readonly worldArea = worldWalkArea();
  private readonly swimArea = swimArea();
  private readonly hullPlans = new Map<EntityId, BodyVessel['plan']>();
  private readonly bodyW = new THREE.Vector3();
  private readonly carryV = new THREE.Vector3();
  private readonly tmpRay = new THREE.Ray();
  private readonly carryQ = new THREE.Quaternion();
  private readonly tmpQ2 = new THREE.Quaternion();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  /** Set when the body changes frame (jump, landing, climbing out): don't reset the view. */
  private keepViewOnReparent = false;
  private readonly locomotion = new Locomotion();
  private readonly comfortOverlay = new ComfortOverlay();
  private readonly controllers: XRControllers;
  private readonly decoupler = new MotionDecoupler();
  /** Each boat with modules, drawn and worked (her boat view, M6c): the workboat, the skiff. */
  private readonly boats = new Map<EntityId, BoatView>();
  private interaction: InteractionSystem | null = null;
  private readonly effects = new Map<EntityId, VesselEffects>();
  private readonly worldView = new WorldView();
  /** Debug → Views → Region map: the region map on the perf panel. */
  private showRegionMap = false;
  /** The hazard buoys, riding the swell with their lights (owner request). */
  private readonly navMarks = new NavMarksView();
  /** A construction project's marks as they're laid (career/projectView.ts). */
  private readonly projectView = new ProjectView();
  private readonly cargoView = new CargoView();
  private readonly cargoHands = new CargoHands();
  /** Our laser pointer (others see it in our pose; laserPointer.ts). */
  private readonly laser = new LaserPointer({
    targets: () => [...this.vesselRoots.values(), this.worldView.root, this.cargoView.root, this.trafficView.root],
    vesselRoots: () => this.vesselRoots.values(),
    ignore: () => [this.rig.carrier, this.menu.root],
    waves: () => this.renderWaves,
  });
  private readonly laserRay = new THREE.Ray();
  /** Binoculars on the dash (VR: pick up and raise to the eyes; desktop: hold Z). */
  private binoculars!: Binoculars;
  /** Hand gear on brackets in the wheelhouse (player/handGear.ts). */
  private readonly gear = [new HandGear('extinguisher'), new HandGear('torch'), new HandGear('lineGun'), ...Array.from({ length: CONFIG.rod.perRack }, (_, i) => new HandGear('rod', i))];
  /** The roving fender (player/fenderHands.ts): hung where you stand, looking at the quay. */
  private readonly fenderHands = new FenderHands();
  /** The gangway mark (player/gangway.ts): "Step ashore" over the quay from a moored boat, "Step aboard" over her deck. */
  private readonly gangway = new Gangway();
  /** Going below into an engine room (app/engineRoom/): made once the scene and the rig are. */
  private belowDecks!: BelowDecks;
  private readonly gangwayEye = new THREE.Vector3();
  /** The line-throwing gun's game (tow/lineGun.ts) and what it shows. */
  private readonly lineGun = new LineGun();
  private readonly lineGunView = new LineGunView();
  /** Each rod's game (fishing/rodGame.ts; the rack's rods, in order) and what they show. */
  private readonly rodGames = this.gear.filter((g) => g.kind === 'rod').map(() => new RodGame());
  private readonly rodView = new RodView();
  private readonly handGearView = new GearView();
  private extEmptySaid = false;
  /** Fire missions: the fire, and the monitor's jet. */
  private readonly fireView = new FireView();
  private readonly jetView = new JetView();
  private readonly wildlife = new WildlifeView();
  /** The towline and our stern roller (towing missions). */
  private readonly towline = new TowlineView();
  private readonly painter = new PainterView();
  private readonly logView = new LogView();
  private readonly trawlView = new TrawlView();
  private readonly potView = new PotView();
  /** Longlines: dan buoys, the line shooting and over the rail, the fish on the hook (fishing/longlineView.ts). */
  private readonly longlineView = new LonglineView();
  private readonly longlineHands = new LonglineHands();
  private readonly potHands = new PotHands();
  /** The fuel pumps' hoses and the boats' fillers (fuel/): refuelling by hand. */
  private readonly fuelView = new FuelView();
  private readonly fuelHands = new FuelHands();
  private readonly targetsView = new TargetsView();
  private readonly desktopHand = new DesktopHand();
  private readonly deskHandW = new THREE.Vector3();
  private readonly rescueHands = new RescueHands();
  private readonly gearView = new RescueGearView();
  /** The other players' boats' life rings and boat hooks (multiplayer study #15: each boat her own), by boat. */
  private readonly otherGear = new Map<string, RescueGearView>();
  /** Nobody's hands here (the other boats' gear is in other players' hands, if anyone's). */
  private readonly noHands = new RescueHands();
  /** Small wheelhouse parts, hidden from outside (performance; app/interiorDetail.ts). */
  private interior: InteriorDetail | null = null;
  private readonly detailV = new THREE.Vector3();
  /** Tender cranes, one per tender. */
  private readonly cranes: TenderCraneView[] = [];
  private lastAnchorPhase: string | null = null;
  /** Rain streaks around the viewer (the one capped weather effect). */
  readonly rain = new RainView();
  private readonly rainHouse = { matrixWorld: new THREE.Matrix4(), min: new THREE.Vector3(), max: new THREE.Vector3() };
  /** The local player is inside the wheelhouse (wind muffled, rain drums on the roof). */
  private insideHouse = false;
  /** The surf near you (world/surf.ts). */
  private readonly surf = new SurfListener();
  /** Last lightning flash and forecast seen (thunder / VHF on change), and targets the lookout has called. */
  private lightningSeen = -1;
  private forecastSeen = -1;
  private readonly spotted = new Set<string>();
  private readonly lookQ = new THREE.Quaternion();
  private windSock: WindSock | null = null;
  /** The searchlight module's handle (the app tells it how dark it is). */
  private searchlight: SearchlightApi | null = null;
  /** The fire monitor's gauge on the console (the app feeds it the fire job). */
  private fireGauge: FireGauge | null = null;
  private readonly windV = { x: 0, z: 0 };
  /** Crouching (X / C), and the current crouch drop (m, eased). */
  private crouched = false;
  private crouchY = 0;
  private board: BoardView | null = null;
  private dutyBoard: DutyBoardView | null = null;
  /** Chart table (paper chart, lamp). */
  private chartTable: ChartTableView | null = null;
  /** Passing ships, debris, hazard buoys; their horns; ships the lookout has called. */
  private readonly trafficView = new TrafficView();
  /** The boats lying in a coast map's harbours (world/harbourBoats.ts). */
  private readonly harbourBoatsView = new HarbourBoatsView();
  /** A coast map's castles, masts, turbines... (world/view/skylineView.ts). */
  private readonly skylineView = new SkylineView(SKYLINE, SKYLINE_STYLE === 'aegean');
  /** Offshore wind farms (world/view/windFarmView.ts). */
  private readonly windFarmView = new WindFarmView(WIND_FARMS);
  /** The crew transfer's technicians (transfer/transferView.ts). */
  private readonly transferView = new TransferView();
  /** A fish farm's net check: the flags on its cage rings (aqua/aquaView.ts). */
  private readonly aquaView = new AquaView();
  /** A fish farm's crew change: its people on the quay, aboard, on the barge (aqua/farmCrewView.ts). */
  private readonly farmCrewView = new FarmCrewView();
  /** A coast map's ferries on their real routes (traffic/ferryView.ts); made with the ocean. */
  private ferryView: FerryView | null = null;
  private hornSeen = -1;
  private readonly shipsCalled = new Set<string>();
  private readonly tableRef = new THREE.Vector3();
  /** How shut-in the wheelhouse is, 0 (door open) .. 1 (door shut): muffles the engine, wind, rain, wash, fire. */
  private closed = 0;
  /** Desktop: 0..1, how far the view has eased to riding rigidly (at the controls). */
  private deskRigid = 0;
  /** Auto rain quality: frame time accumulated while raining in the headset. */
  private rainSlowT = 0;
  private rainFrames = 0;
  private rainFrameSum = 0;
  /** Pencil marks on the paper chart: this peer's copy (kept in step by ops; not in the world). */
  private marks = createMarks();
  private chartTools: ChartTools | null = null;
  private marksSaved = 0;
  private marksSaveT = 0;
  /** Duties completed (for the tick sound when one finishes). */
  private dutiesDone = -1;
  /** Office > Your boats: the Shipyard's favourites and the code being typed. */
  private readonly shipyardCodes = new ShipyardCodes(browserStorage);
  private readonly noteKeys = new NoteKeyboard((text, x, y, colour) => this.pushBoardIntent('noteAdd', text, [x, y, colour]));
  /** The board's seq last saved to this browser (host / solo keeps the notes over a reload). */
  private boardSaved = -1;
  private rescuesSaved = -1;
  /** Last cheer count / shout id heard (null until the first frame). */
  private rescueHeard: { cheer: number; shout: number; ring: string } | null = null;
  private frameDt = 0;
  /** Seconds since the coast streamer last looked (updateSceneViews). */
  private sinceStream = 0;
  /** The sheltered-water zones of the regions drawn in full, the nearest of which the ocean draws (updateSceneViews). */
  private shelterPool: ShelterDef[] = [];
  private sinceShelters = 0;
  private shelterKey = '';
  private readonly listenerFwd = new THREE.Vector3();
  private readonly listenerUp = new THREE.Vector3();
  /** Last radio message / alert played here (null until the first frame: don't replay old ones). */
  private radioSeen: { id: number; alertT: number } | null = null;
  private readonly vesselRoots = new Map<string, THREE.Object3D>();
  private readonly hands: Record<'left' | 'right', HandFrame> = {
    left: { tracked: false, grip: new THREE.Vector3(), ray: new THREE.Ray(), quat: new THREE.Quaternion(), gripDown: false, gripPressed: false, triggerDown: false, triggerPressed: false },
    right: { tracked: false, grip: new THREE.Vector3(), ray: new THREE.Ray(), quat: new THREE.Quaternion(), gripDown: false, gripPressed: false, triggerDown: false, triggerPressed: false },
  };
  private busyHands = { left: false, right: false };
  /** When we last let go of (or asked for) the life ring in the water (world time). */
  private ringLetGoAt = -99;
  /** Desktop: a game controller, and standing at the helm to drive with it (F, or A). */
  private readonly pad = new GamepadInput();
  private atHelm = false;
  /** Desktop: the deck crane's radio remote in hand (app/craneRemote.ts), the crane it works; and whether you stand by a crane's post (where it hangs). */
  private craneRemote: CranePost | null = null;
  private craneNear: CranePost | null = null;
  /** How far from the crane post's desk and from the helm you stand (m, level), to give F / A to the nearer. */
  private craneNearDist = Infinity;
  private helmDist = Infinity;
  /** What the remote's prompt says (empty: nothing). */
  private craneRemotePrompt = '';
  private padSteering = false;
  /** At an azimuth helm: LB was used to look round (not a tap, which looks ahead again). */
  private lbLooked = false;
  /** At an azimuth helm on the desktop: the two drives' dials in the bottom corners (ui/aziDials.ts). */
  private readonly aziDials = new AziDials();
  private readonly helmPrompt = new HelmPrompt();
  /** The boatyards' boards (ui/yardBoard.ts), one per yard (CONFIG.boatyards). */
  private yardBoards: YardBoard[] = [];
  /** The harbours' cargo screens (ui/cargoTerminal.ts: goods on order), one screen moved to the nearest. */
  private cargoTerminal!: CargoTerminal;
  /** The recording camera (Menu > Crew > Be the camera; desktop): player/cameraMode.ts. */
  private readonly camMode = new CameraMode();
  /** The camera views at the helm with a controller (player/helmCamera.ts): inside, orbit, flyby. */
  private readonly helmCam = new HelmCamera();
  /** Our field of view before we became the camera (back to it after). */
  private camOldFov = 0;
  private camWasHeld = false;
  /** Lifting clear and touching down, felt (a foiling boat's; audio/foilAudio.ts), and whose. */
  private readonly foilFeel = new FoilFeel();
  private foilFeelBoat = '';
  /** Her foils' deployment last frame (`foil.deploy`): moving, the hydraulics run. */
  private lastDeploy: number | undefined;
  /** The boat of whoever last held us, to ride with when they let go. */
  private camHolderBoat: string | null = null;
  /** A camera body in our VR hand (we've asked the host, or it's ours), by hand. */
  private readonly camGrip: Record<'left' | 'right', { id: string; at: number } | null> = { left: null, right: null };
  private readonly camW = new THREE.Vector3();
  private readonly camQ = new THREE.Quaternion();
  private readonly camQ2 = new THREE.Quaternion();
  private readonly camLens = new THREE.Vector3();
  /** VR: the preview screen over a recording camera in our hand. */
  private readonly camPreview = new CameraPreview();
  /** The red spray when a swimmer goes into a propeller (everyone sees it). */
  private readonly propStrikeView = new PropStrikeView();
  /** Us struck by a propeller, or blacked out (health): seconds since (red, black, back aboard), or -1. */
  private strikeT = -1;
  /** What's said when we come round from it (the propeller's own words if empty). */
  private knockoutSays = '';
  /**
   * Our health (player/health.ts: 1 well, 0 blacked out), kept by our own game as our body
   * is; and lying in a berth to rest (its press, 'berthRest'), the view dimmed.
   */
  private health = 1;
  private resting = false;
  /** Lain down hurt (up by yourself once well by day), or to sleep (up at the morning); the clock a moment ago. */
  private restHurt = false;
  private restClock = 0;
  /** Below CONFIG.health.warnBelow already (said once each time it falls past). */
  private healthWarned = false;
  /** The desktop's health readout (shown only when hurt). */
  private healthEl: HTMLDivElement | null = null;
  /** Crew-mates in the water (to say so once when one goes in). */
  private readonly overboard = new Set<string>();
  private readonly waveV = new THREE.Vector3();
  private readonly waveF = new THREE.Vector3();
  private readonly waveW = new THREE.Vector3();
  private readonly waveUp = new THREE.Vector3(0, 0.38, 0);
  /** VR hand gestures (grip and stick on a free hand) and your own hands drawn in them. */
  private readonly gestures = new HandGestures();
  private readonly ownHands = new OwnHands();
  private pointer: DesktopPointer | null = null;
  private readonly menu: WristMenu;
  /** Last comfort outputs, reused for the second rig sync in a frame. */
  private viewOffset = 0;
  private readonly comfortQ = new THREE.Quaternion();
  private readonly offsetV = new THREE.Vector3();
  private readonly headW = new THREE.Vector3();
  private readonly headFwd = new THREE.Vector3();
  private readonly gripW: Record<'left' | 'right', THREE.Vector3> = { left: new THREE.Vector3(), right: new THREE.Vector3() };
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpV2 = new THREE.Vector3();
  private readonly attQ = new THREE.Quaternion();
  /** Wave constants at the current *render* time (reused every frame). */
  private renderWaves: PreparedWave[] = [];
  private readonly overlay = new DebugOverlay();
  /** The career's save slots, saving, money pop-up and menu parts (careerSession.ts). */
  private readonly career = new CareerSession({
    world: () => this.world,
    vesselId: () => this.testVesselId,
    isClient: () => !this.savesHere(),
    isCrew: () => !!this.client,
    notify: (t, sec) => this.overlay.notify(t, sec),
    pushEnv: (c, v, r) => this.pushEnvIntent(c, v, r),
  });
  private readonly help = new HelpPanel();
  private readonly focus = new THREE.Vector3();
  private lastFrameMs = performance.now();
  private readonly gpuTimer: GpuTimer;

  // Multiplayer (net/): at most one of host / client is set.
  private host: HostSession | null = null;
  private client: ClientSession | null = null;
  /** The multiplayer link's PeerJS peer (for voice), while hosting or joined. */
  private netPeer: Peer | null = null;
  /** Hosting: our own network id (the room's), for the crew's voice calls. */
  private hostPeerId = '';
  /** Voice with the crew (net/voice.ts), while in a game with others. */
  private voice: VoiceChat | null = null;
  /** Browser tabs shown on the boats' TVs (modules/furniture/tvCast.ts): ours, and what the crew send. */
  private readonly tvCast = new TvCast(() => this.sound.engine.context ?? null);
  /** Every TV in the scene, by its name in the world (filled each frame). */
  private readonly tvScreens = new Map<string, TvScreen>();
  /** Your microphone off (Crew menu); kept across games. */
  private voiceMuted = false;
  /** The handheld VHF on your chest (player/radioHandset.ts). */
  private readonly radio = new RadioHandset();
  private readonly voiceSpeakers: VoiceSpeaker[] = [];
  /** Debug > World: VR fly (player/vrFly.ts). */
  private vrFlyOn = false;
  private readonly flyRight = new THREE.Vector3();
  /** Hosting: waiting for the PeerJS server to register the room code. */
  private hostStarting = false;
  private joinCode = '';
  /** Crew-mates whose voices you've muted (player ids; the Crew tab, this page only). */
  private readonly mutedCrew = new Set<string>();
  /** How our home boat was built (world.build as it was made here): crew joining compare theirs. */
  private builtAs: NonNullable<WorldState['build']> = {};
  /** The workboat's equipment the career wanted when last looked (null: not looked yet); see checkRefit. */
  private fitWanted: string | null = null;
  /** A refit under way: the page reloads at this time (ms). */
  private refitAt = 0;
  private netMessage = '';
  private poseTimer = 0;
  private readonly avatars = new AvatarsView(this.scene);
  private readonly poseQ = new THREE.Quaternion();
  private readonly handQ = new THREE.Quaternion();
  private readonly carrierQ = new THREE.Quaternion();
  private readonly feetV = new THREE.Vector3();
  private readonly invFrame = new THREE.Matrix4();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: CONFIG.render.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.render.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // We reset renderer.info ourselves so XR's two eye renders are counted per frame.
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);
    this.gpuTimer = new GpuTimer(this.renderer.getContext() as WebGL2RenderingContext);

    this.camera = new THREE.PerspectiveCamera(
      CONFIG.render.fovDeg,
      window.innerWidth / window.innerHeight,
      CONFIG.render.near,
      CONFIG.render.far,
    );

    // Voyage mode starts in its own boat (CONFIG.voyage.boat), fitted out in full; no career kit.
    const boat = startBoat() ?? (MODE === 'voyage' ? CONFIG.voyage.boat : CONFIG.career.boat);
    // The career's boat kitted out as the career has her (any other boat as she is).
    const without = KIT_BOATS.includes(boat) && MODE !== 'voyage' ? startFit() : [];
    useWorkboatFit(socketsWithout(boat === 'workboat' ? without : []));
    if (boat === 'starterBoat') useStarterKit(without);
    forgetStartParams();
    const created = createWorld(this.ids, boat, { tender: true, cold: true, weather: true, tows: true, fires: true, logs: true, harbour: true, voyage: MODE === 'voyage' });
    this.world = created.world;
    this.world.build = { ...(startDesignCode && isBoatType(boat) ? { design: startDesignCode } : {}), ...(without.length ? { without } : {}) };
    this.builtAs = structuredClone(this.world.build);
    // Sent to crew with the boat, so a crew-mate on an older page knows (not part of her build).
    this.world.build.app = APP_BUILD;
    if (VOYAGE_MAP_ID) this.world.build.map = VOYAGE_MAP_ID;
    this.world.build.mode = MODE;
    this.world.build.site = SITE;
    this.localPlayerId = created.localPlayerId;
    this.soloPlayerId = created.localPlayerId;
    this.testVesselId = created.vesselId;
    this.startVesselId = created.vesselId;
    // Back from a dive (dive/diveReturn.ts)? Its envelope off the address before Timber's look.
    const diveBack = this.takeDiveBack();
    // Back from the timber camp? The envelope off the address first, then her place, then the barge.
    const handoff = MODE === 'voyage' ? this.takeHandoff() : null;
    this.restoreVoyagePlace();
    this.setupPlanTable();
    this.setupTimber(handoff);
    this.startLiveWeather();
    // Our own working clothes, as crew who join will see us (net/avatarOutfits.ts).
    this.world.players[this.localPlayerId].look = randomLook();

    this.rig = new PlayerRig(this.localPlayerId, this.camera);
    this.scene.add(this.rig.carrier);
    this.placePanelOnRig();
    this.camera.add(this.comfortOverlay.mesh);
    // VR messages: a word-wrapped card low in the view, and a buzz on the left hand (debug/overlay.ts).
    {
      const t = CONFIG.debug.vrToast;
      this.camera.add(this.overlay.vrToast);
      this.overlay.vrToast.position.set(0, -t.down, -t.distance);
      this.overlay.vrToast.rotation.x = Math.atan2(t.down, t.distance) * 0.8;
      this.overlay.onNotify = () => {
        if (this.renderer.xr.isPresenting) this.xrInput.pulse('left', t.pulse, t.pulseMs);
      };
    }
    this.controllers = new XRControllers(this.renderer, this.rig.root);
    this.decoupler.coupling = userSettings.motionCoupling;
    const host = this.menuHost();
    this.menu = new WristMenu(mainMenu(host));
    // The boatyard's board on its shed at Calder Haven (the add-ons, upgrades and repairs).
    // Only the yards whose port is in this world (the coast region test leaves the Sounds out).
    this.yardBoards = CONFIG.boatyards.filter((y) => PORTS.some((p) => p.id === y.port)).map((y) => new YardBoard(host, y));
    // The career's Shipyard signs, one on the quay at every harbour (Voyage's stands by the planning table: setupPlan).
    // ...and beside each, the Your boats board (your Shipyard favourites).
    if (MODE === 'career') this.shipyardSigns = careerShipyardSpots().flatMap((at) => [ShipyardDoor.shipyard(host, at), ShipyardDoor.boats(host, at)]);
    // The cargo screen at every harbour's goods row: crates, crane lifts and pots on order (cargo/order.ts).
    this.cargoTerminal = new CargoTerminal({
      world: () => this.world,
      ownBoatId: () => this.testVesselId,
      boatName: (v) => this.boatLabel(v.defId),
      send: (control, targetId, value, ref, args) => this.intents.push({ playerId: this.localPlayerId, targetId, control, value, ref, ...(args ? { args } : {}) }),
      notify: (text) => this.overlay.notify(text, 3),
    });
    this.belowDecks = new BelowDecks({
      scene: this.scene,
      world: () => this.world,
      playerId: () => this.localPlayerId,
      boatRoot: (id) => this.vesselRoots.get(id),
      walkAreas: this.walkAreas,
      keep: () => this.keptBelow(),
      notify: (text, s) => this.overlay.notify(text, s),
      boatName: (defId) => this.boatLabel(defId),
      addControls: (cs) => this.interaction?.addControls(cs),
      removeControls: (cs) => this.interaction?.removeControls(cs),
    });
    this.scene.add(this.gangway.root, this.menu.rayLine, this.noteKeys.menu.root, this.noteKeys.menu.rayLine, ...this.yardBoards.map((b) => b.menu.rayLine), ...this.shipyardSigns.map((s) => s.menu.rayLine), this.cargoTerminal.menu.rayLine);

    this.desktop = new DesktopController(this.camera, this.renderer.domElement, this.keyboard);
    this.environment = new EnvironmentView(this.scene);
    this.scene.add(this.sky.mesh, this.ocean.mesh, this.probes.mesh, this.worldView.root, this.navMarks.root, this.projectView.root, this.cargoView.root);
    this.scene.add(this.targetsView.root, this.gearView.root, this.desktopHand.root, this.rain.mesh, this.trafficView.root, this.harbourBoatsView.root, this.skylineView.root, this.windFarmView.root, this.transferView.root, this.aquaView.root, this.farmCrewView.root);
    // A test (owner): an outside model, the dirt bike, on the Calder Haven quay by where you
    // start, only with `?bike` in the address (public/models/mx_gold_dirt.glb: the owner's
    // file slimmed with glTF Transform, weld + simplify + quantize, 120,568 -> 19,508
    // triangles, 10.9 -> 0.96 MB).
    if (new URLSearchParams(location.search).has('bike')) {
      import('../world/view/glbProp')
        .then(({ loadFlatProp }) => loadFlatProp('models/mx_gold_dirt.glb'))
        .then((bike) => {
          // On its wheels on the quay top (1.6 m), by the edge a few metres to your left, side-on
          // to you as you start (facing the boat, west), its length along the quay.
          bike.position.set(712.8, 1.6 + 0.013, 657.5);
          this.scene.add(bike);
        })
        .catch((e) => console.warn('bike model not loaded:', e));
    }
    this.rain.quality = userSettings.rainQuality;
    this.targetsView.onWhistle = (pos) => this.sound.whistle.blow(pos);
    this.scene.add(this.laser.beam.root);
    this.scene.add(this.wildlife.root);
    this.scene.add(this.propStrikeView.pool.points);
    for (const vessel of Object.values(this.world.vessels)) this.addVesselView(vessel);
    this.binoculars = new Binoculars(this.camera);
    this.mountOnHomeBoat();
    this.scene.add(this.handGearView.root, this.camPreview.screen, this.rodView.root, this.lineGunView.root);
    this.scene.add(this.towline.root, this.painter.root, this.fireView.root, this.jetView.root, this.logView.root, this.trawlView.root, this.potView.root, this.longlineView.root, this.fuelView.root);
    this.setupBridge();
    // After the career is back (setupBridge), so the dive's pay goes into it.
    if (diveBack) this.landDive(diveBack);

    setupXR(this.renderer, this.camera);
    window.addEventListener('resize', () => this.onResize());
    if (wantsTouchControls()) this.setupTouch();
    if (designCodeError) this.overlay.notify(`Shipyard boat not used: ${designCodeError}. Starting in ${MODE === 'voyage' ? 'the pilot boat' : 'the beginner boat'} instead.`, 8);
    // Audio may only start after a user gesture.
    const unlock = () => this.sound.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    // Desktop: a Shipyard code (or her play link) pasted anywhere in the game goes to
    // Office > Your boats, ready to take (shipyard/takeHer.ts).
    window.addEventListener('paste', (e) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const text = e.clipboardData?.getData('text') ?? '';
      // On the Crew tab, a game code or a game link (…?game=12345) fills the join box (study #34).
      const game = this.typingCode() ? (/[?&]game=(\d{5})/.exec(text)?.[1] ?? /^\s*(\d{5})\s*$/.exec(text)?.[1]) : undefined;
      if (game) {
        this.joinCode = game;
        this.netMessage = '';
        return;
      }
      if (this.shipyardCodes.paste(text)) this.overlay.notify('Shipyard code pasted: Menu > Office > Your boats > Take her', 5);
    });
    this.renderer.xr.addEventListener('sessionstart', unlock);
    // Menus opened in one mode don't carry over (the wrist grip disappears outside VR).
    const closePanels = () => {
      this.menu.close();
      this.trialsPanel.hide();
    };
    this.renderer.xr.addEventListener('sessionstart', closePanels);
    this.renderer.xr.addEventListener('sessionend', closePanels);
    // Binoculars go back on the dash (and the desktop zoom ends) when switching modes.
    this.renderer.xr.addEventListener('sessionstart', () => {
      this.binoculars.updateDesktop(false);
      this.binoculars.warm(this.renderer, this.scene);
    });
    this.renderer.xr.addEventListener('sessionend', () => this.binoculars.drop());
    // Out of VR, or the page hidden (the headset off): what our hands held is let go (study #25).
    this.renderer.xr.addEventListener('sessionend', () => this.interaction?.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.interaction?.releaseAll();
    });
    // Changing between VR and desktop, gear in hand goes back on its bracket.
    for (const ev of ['sessionstart', 'sessionend'] as const) this.renderer.xr.addEventListener(ev, () => this.gear.forEach((g) => g.hangBack()));
  }

  /** A vessel's view, effects, walk area and debug view (at start, and for each new tow). */
  private addVesselView(vessel: VesselState): void {
    const def = VESSEL_DEFS[vessel.defId];
    if (!def) return;
    const view = new VesselView(vessel.id, def);
    const hydro = new HydroDebugView(def, CONFIG.debug.hydroDebugVisibleAtStart);
    view.root.add(hydro.root);
    this.scene.add(view.root);
    this.vesselViews.set(vessel.id, view);
    this.hydroViews.set(vessel.id, hydro);
    this.walkAreas.set(vessel.id, vesselWalkArea(def, def.layout, footprintsOf(vessel)));
    this.effects.set(vessel.id, new VesselEffects(def, view.root, this.scene, this.ocean.sharedUniforms));
    this.vesselRoots.set(vessel.id, view.root);
    // Her modules, drawn and worked: her boat view, built from her recipe (M6c). The home
    // boat's controls send plain channels; another boat's go to her (the skiff's tiller). A
    // tow, a hull with no modules, has none.
    const recipe = RECIPES[vessel.defId];
    const modules = recipe ? assembleView(recipe, def, LIBRARY) : null;
    if (modules?.modules.length) {
      const boat = new BoatView(vessel.id, def, modules, vessel.id === this.testVesselId);
      // Voyage: no career, so no duty board on any boat (world.voyage).
      if (MODE === 'voyage' && boat.dutyBoard) boat.dutyBoard.root.visible = false;
      view.root.add(boat.root);
      this.boats.set(vessel.id, boat);
      // A boat that came after the start (multi-boat M2): her controls work from now.
      this.interaction?.addControls(boat.controls);
    }
  }

  /**
   * Tows (towing missions) come and go: give a new one its views, and take the views of
   * one that's gone out of the scene. Only towable hulls are ever added or removed.
   */
  private syncVesselViews(): void {
    const vessels = this.world.vessels;
    for (const v of Object.values(vessels)) if (!this.vesselViews.has(v.id)) this.addVesselView(v);
    for (const id of [...this.vesselViews.keys()]) if (!vessels[id]) this.dropVesselView(id);
  }

  start(): void {
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  private onResize(): void {
    if (this.renderer.xr.isPresenting) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private frame(nowMs: number): void {
    const t0 = performance.now();
    const frameMs = nowMs - this.lastFrameMs;
    this.lastFrameMs = nowMs;
    // Clamp so a long pause (tab hidden, headset off) doesn't produce a huge step.
    const dt = Math.min(Math.max(frameMs, 0) / 1000, 0.25);
    const inXR = this.renderer.xr.isPresenting;

    // 1. Input -> intents
    this.xrInput.update(inXR ? this.renderer.xr.getSession() : null);
    this.handleDebugInput(dt);

    // 2. Simulation: fixed steps here (alone or hosting), or the host's snapshots (client).
    const renderTime = this.stepSimulation(dt);
    const t1 = performance.now();

    // 3. Views, in this order: each reads what the one before posed.
    // The wind sea's field for the wind now (ocean/windSea.ts): the host's sim keeps it, and a
    // crew page (whose waves come from the host) works out its own the same way.
    const wx = this.world.environment.weather;
    setShortSeasOff(!!this.world.environment.shortSeasOff);
    if (wx) updateWindSea(wx.now.wind, wx.now.windFrom);
    this.renderWaves = prepareWaves(this.world.environment.waves, renderTime, this.renderWaves);
    this.updatePlayer(dt, inXR);
    this.updateSurroundings(renderTime);
    const darkness = Math.min(1, Math.max(0, (8 - sunElevation(this.world.environment.timeOfDay)) / 14));
    this.darkness = darkness;
    // The house fronts' windows light up as it gets dark (render/pixelPaint.ts).
    setPaintNight(darkness);
    this.updateOwnBoat(dt, nowMs, darkness);
    const { slam, lap } = this.updateBoatsAndJobs(dt, renderTime, darkness);
    this.updateSceneViews(dt, renderTime, darkness);
    this.updateBoardsAndSaves(dt);
    this.updateCrewViews(dt, inXR, darkness);
    this.updateTv();
    this.updateHullSounds(dt, slam, lap);
    this.menu.refresh();
    this.host?.tick(dt);
    this.heartbeat();
    this.noticeCrew();
    this.typeCodeKeys();
    const t2 = performance.now();

    // The helm's outside views (a controller's Y): the camera put where they want it, last.
    this.applyHelmCamera(dt, inXR);

    // 4. Render
    this.renderer.info.reset();
    this.gpuTimer.begin();
    if (inXR) this.binoculars.renderScope(this.renderer, this.scene);
    if (inXR) this.camPreview.render(this.renderer, this.scene);
    this.binoculars.renderMain(this.renderer, this.scene, inXR);
    this.gpuTimer.end();
    const t3 = performance.now();

    if (this.showRegionMap && this.overlay.visible) {
      this.camera.getWorldDirection(this.tmpV);
      this.overlay.setRegionMap({
        regions: this.worldView.regionStates().map((r) => ({ id: r.region.id, bounds: r.region.bounds, resident: r.resident, building: r.building, outline: r.outline })),
        landmarks: REGIONS.flatMap((r) => r.landmarks),
        races: CURRENTS.map((z) => ({ x: z.x, z: z.z, length: z.length, width: z.width, setDeg: z.setDeg, kn: raceStrength(z) * z.peakKn })),
        gusts: GUSTS.map((z) => {
          const g = this.world.environment.weather?.gust;
          return { x: z.x, z: z.z, r: z.r, s: g?.zone === z.id ? g.s : 0 };
        }),
        viewer: { x: this.focus.x, z: this.focus.z, headingDeg: ((Math.atan2(this.tmpV.x, -this.tmpV.z) * 180) / Math.PI + 360) % 360 },
      });
    } else this.overlay.setRegionMap(null);
    this.overlay.frame(
      frameMs,
      {
        drawCalls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        tick: this.world.tick,
        timeOfDay: this.world.environment.timeOfDay,
        xr: inXR ? xrSessionInfo(this.renderer) : this.desktop.pointerLocked ? 'desktop (mouse captured)' : 'desktop',
        cpu: { sim: t1 - t0, views: t2 - t1, render: t3 - t2 },
        gpuMs: this.gpuTimer.lastMs,
        // (Built only while the overlay is shown: strings made every frame for nothing were garbage on the Quest.)
        extra: this.overlay.visible ? vesselReadout(this.world.vessels[this.testVesselId], this.simDebug) + this.boatPartsLine(dt) + '\nregions  ' + this.worldView.status() : '',
      },
      inXR,
    );
    this.keyboard.endFrame();
    // The keys a keyboard-steered control's buttons use do only that while it's steered.
    this.keyboard.claim(this.renderer.xr.isPresenting ? [] : [...(this.interaction?.steeringCodes ?? []), ...(this.craneRemote ? REMOTE_CODES : []), ...(this.typingCode() ? CODE_KEYS : []), ...(this.aziHelmBoat() ? AZI_HELM_CODES : []), ...(this.planPanel.isOpen ? CHART_PANEL_CODES : [])]);
  }

  /** Desktop, the Crew tab open on your own: the number keys type the game code (study #34). */
  private typingCode(): boolean {
    return !this.renderer.xr.isPresenting && this.menu.isOpen && this.menu.pageName === 'Crew' && !this.host && !this.client;
  }

  /** The game code from the keyboard: digits (either row), Backspace, Enter to join. */
  private typeCodeKeys(): void {
    if (!this.typingCode()) return;
    const k = this.keyboard;
    for (let d = 0; d <= 9; d++)
      if ((k.wasPressed(`Digit${d}`) || k.wasPressed(`Numpad${d}`)) && this.joinCode.length < 5) {
        this.joinCode += String(d);
        this.netMessage = '';
      }
    if (k.wasPressed('Backspace')) this.joinCode = this.joinCode.slice(0, -1);
    if ((k.wasPressed('Enter') || k.wasPressed('NumpadEnter')) && this.joinCode.length === 5) this.joinGame();
  }

  /** Fixed sim ticks (alone or hosting), or the host's snapshots (client); returns the render time. */
  private stepSimulation(dt: number): number {
    let renderTime: number;
    const client = this.client?.status === 'connected' ? this.client : null;
    if (client) {
      renderTime = this.followHost(client);
    } else {
      if (this.host) for (const i of this.host.takeIntents()) this.intents.push(i);
      const { ticks, alpha } = this.loop.advance(dt);
      for (let i = 0; i < ticks; i++) {
        // Keep each vessel's pre-tick pose so views can interpolate across the last tick.
        for (const [id, view] of this.vesselViews) {
          const s = this.world.vessels[id];
          if (s) view.snapshot(s);
        }
        stepWorld(this.world, i === 0 ? this.intents.drain() : [], this.loop.dt, this.simDebug);
      }
      this.syncVesselViews();
      // Rendering runs one tick behind the simulation and interpolates between the previous
      // and current tick by `alpha`; the ocean uses the same render time so floating objects
      // and the water surface always agree.
      renderTime = Math.max(0, (this.world.tick - 1 + alpha) * this.loop.dt);
      // Vessels first: the player rides on their interpolated pose.
      for (const [id, view] of this.vesselViews) {
        if (!this.world.vessels[id]) continue;
        view.update(this.world.vessels[id], alpha);
        this.hydroViews.get(id)?.update(this.simDebug.get(id));
      }
    }
    return renderTime;
  }

  /** Us: carried gear, the desktop look, pointing and grabbing, walking, the laser; then the head. */
  private updatePlayer(dt: number, inXR: boolean): void {
    if (this.camMode.on && !inXR) return this.updateCameraMode(dt);
    if (this.camMode.on) this.setCameraMode(false); // (into VR: back to being yourself)
    this.syncRigToPlayer(dt);
    this.cargoHands.tick(this.cargoCtx(), dt);
    this.rescueHands.tick(this.rescueCtx(), dt);
    this.frameDt = dt;
    if (!inXR) {
      // Binoculars (hold Z): zoomed in, the mouse look slows to match.
      this.desktop.lookScale = this.binoculars.updateDesktop(this.keyboard.action('binoculars') || !!this.pointer?.binocularsDown) / this.camera.zoom;
      this.desktop.lookTau = this.binoculars.looking ? CONFIG.binoculars.steady : 0;
      this.desktop.update(dt);
    }
    // The boat we're on, posed for this frame before hit-testing its controls (else they're
    // where the last frame drew them: a frame behind the reticle and hands).
    const onboard = this.world.players[this.localPlayerId]?.aboardVesselId;
    if (onboard) this.vesselViews.get(onboard)?.root.updateMatrixWorld();
    this.updateInteraction(inXR);
    this.updateGestures(inXR);
    this.updateLocomotion(dt, inXR);
    this.updateStrike(dt);
    this.updateHealth(dt);
    this.syncRigToPlayer(0);
    this.updateLaser(dt);
    this.camera.getWorldPosition(this.focus);
    this.updateChartZoom(dt, inXR);
  }

  /**
   * Desktop: ease the view in while the crosshair is on the paper chart from close by, as
   * you'd lean over a chart to read it; out again when you look away. It uses the camera's
   * zoom (the binoculars use its field of view, so the two don't fight); in VR the headset
   * sets the projection, so it stays 1.
   */
  private updateChartZoom(dt: number, inXR: boolean): void {
    const c = CONFIG.desktop;
    let target = 1;
    if (!inXR && this.chartTable?.root.visible && this.chartTable.isOpen) {
      const root = this.chartTable.root;
      const eye = root.worldToLocal(this.camera.getWorldPosition(this.tmpV));
      const dir = this.camera.getWorldDirection(this.zoomDir).transformDirection(this.zoomInv.copy(root.matrixWorld).invert());
      const R = this.chartTable.chartRect;
      const t = (R.y - eye.y) / dir.y;
      if (dir.y < -0.05 && t > 0 && t < c.chartZoomReach) {
        const x = eye.x + dir.x * t;
        const z = eye.z + dir.z * t;
        if (x > R.x0 && x < R.x1 && z > R.z0 && z < R.z1) target = c.chartZoom;
      }
    }
    if (this.camera.zoom === target) return;
    const k = 1 - Math.exp(-c.chartZoomRate * dt);
    let zoom = this.camera.zoom + (target - this.camera.zoom) * k;
    if (Math.abs(zoom - target) < 0.01) zoom = target;
    this.camera.zoom = zoom;
    this.camera.updateProjectionMatrix();
  }
  private readonly zoomDir = new THREE.Vector3();
  private readonly zoomInv = new THREE.Matrix4();

  private readonly windNow = { x: 0, z: 0 };

  /** Light, sky and sea around the head. */
  private updateSurroundings(renderTime: number): void {
    // The tidal races' strength now, for everything drawn on the water this frame (and the
    // ocean shader's zones follow the resident regions).
    setRaceClock(this.world.environment.timeOfDay, this.world.environment.raceOverride);
    this.environment.update(this.world.environment, this.focus, this.world.time);
    this.sky.update(this.environment, this.focus, this.world.environment, this.world.time);
    this.ocean.update(this.renderWaves, this.focus, this.environment, renderTime, windVector(this.world.environment, this.windNow));
    this.ocean.setGust(this.world.environment.weather?.gust);
    this.probes.update(this.renderWaves, this.camera);
  }

  /** The home boat's boat view (her modules, doors and gate, rain on the glass). */
  private get homeView(): BoatView | null {
    return this.boats.get(this.testVesselId) ?? null;
  }

  /** The workboat's engine, horn and alarm sounds; her boat view, tender crane and wheelhouse; the other boats' views (the skiff's tiller). */
  private updateOwnBoat(dt: number, nowMs: number, darkness: number): void {
    const frame = { darkness, viewer: this.focus };
    // Your boat is the one you're aboard (multi-boat M2); your own launched boat (M3).
    this.followOwnBoat();
    const aboardNow = this.world.players[this.localPlayerId]?.aboardVesselId;
    if (aboardNow && aboardNow !== this.testVesselId) this.becomeAboard(aboardNow);
    const testView = this.vesselViews.get(this.testVesselId);
    if (testView) {
      // Engine room sits roughly under the wheelhouse.
      const distance = testView.root.localToWorld(this.tmpV.set(0, 0, 1)).distanceTo(this.focus);
      const submerged = this.exhaustSubmersion(testView.root, this.world.vessels[this.testVesselId], nowMs / 1000);
      // In the wheelhouse the engine's quieter (more so with the door shut); full on deck.
      const ws = CONFIG.wheelhouseSound;
      // Below in her engine room: right beside them, louder and with their clatter (CONFIG.engineRoom.sound).
      const below = this.belowDecks.boatId === this.testVesselId && this.belowDecks.space === 'engine';
      const house = below ? [CONFIG.engineRoom.sound.level, 20000] : this.insideHouse ? (this.closed > 0 ? [ws.engineShut, ws.engineShutLp] : [ws.engineInside, ws.engineInsideLp]) : [1, 20000];
      this.sound.engine.update(this.world.vessels[this.testVesselId], distance, submerged, house[0], house[1], below ? 1 : 0);
      const v = this.world.vessels[this.testVesselId];
      this.sound.horn.update(v.controls.horn > 0 && isPowered(v), distance); // electric horn
      this.updateBoatVoices(dt);
      // Bridge buzzer: high temperature always, low fuel while the engine runs, and no oil
      // pressure with the key on and the engine stopped (it stops when she runs, owner).
      const diesel = gearOf(v, 'diesel');
      const al = diesel ? engineAlarms(v, diesel) : { highTemp: false, lowFuel: false };
      // (Electric motors: no oil pressure to lose.)
      const noOilPressure = !!diesel && !diesel.electric && v.engine.key > 0 && v.engine.phase !== 'running' && isPowered(v, 'instruments');
      const consoleDist = this.homeView?.dashAnchor ? this.homeView.dashAnchor.getWorldPosition(this.tmpV).distanceTo(this.focus) : 99;
      this.sound.alarm.update(al.highTemp || (al.lowFuel && v.engine.phase === 'running') || noOilPressure, consoleDist);
    }
    // Bridge controls and displays read the (just-updated) vessel state.
    const testVessel = this.world.vessels[this.testVesselId];
    if (this.homeView && testVessel) {
      {
        // (A line from any of her tenders: the skiff's, the rescue boat's.)
        const lines = this.ourTenders().map((s) => s.tender!).filter((p) => p.phase === 'free');
        for (const c of this.homeView.cleats) c.painterOn = lines.some((p) => p.painter?.cleat === c.index || p.sternPainter?.cleat === c.index);
      }
      this.homeView.api<FendersApi>('deck.fenders')?.setWalk(testVessel.walkFender);
      this.homeView.update(testVessel, dt, this.dashInView(), this.world.environment, frame);
      this.homeView.radio?.update(this.world.rescue, runStatus(this.world), dt, isPowered(testVessel, 'radio'), towAlertT(this.world) >= 0 || fireAlertT(this.world) >= 0, sosCondition(testVessel) === 'upright' ? null : sosStatus(testVessel));
      // Say so when the anchor is up or holding (the speed screen shows it all the time).
      const ap = testVessel.anchor.phase;
      if (ap !== this.lastAnchorPhase) {
        if (ap === 'stowed' && this.lastAnchorPhase) this.overlay.notify('Anchor up and stowed', 2.5);
        if (ap === 'set') this.overlay.notify(`Anchor holding: ${testVessel.anchor.rodeM.toFixed(0)} m of chain out`, 2.5);
        this.lastAnchorPhase = ap;
      }
      this.windSock?.update(testVessel, this.world.environment, dt);
      this.updateWindSound(dt);
      this.updateDetail();
      for (const g of this.cranes) {
        const tv = this.world.vessels[g.tenderId];
        if (!tv) continue;
        g.update(tv, recoverCheck(this.world, tv), this.vesselRoots.get(tv.id), dt);
        for (const b of g.buttons) b.tick(dt);
      }
      // The other boats' views (the skiff's tiller and painter cleat), and her motor's sound.
      for (const [id, boat] of this.boats) {
        const sv = this.world.vessels[id];
        if (id === this.testVesselId || !sv) continue;
        // A boat beyond `mid` of the viewer (multi-boat M4): her controls and screens aren't moved; beyond `far`, not drawn.
        const dv = Math.hypot(sv.position[0] - this.focus.x, sv.position[2] - this.focus.z);
        boat.setFar(dv > CONFIG.lod.far);
        if (dv > CONFIG.lod.mid) continue;
        boat.update(sv, dt, false, null, frame);
        const tiller = boat.api<TillerApi>('control.tiller')?.tiller;
        if (tiller) this.sound.motor.update(sv.controls.obOn > 0 ? Math.sign(sv.controls.obGear) * sv.controls.lever : 0, sv.battery ?? 0, tiller.root.getWorldPosition(this.tmpV).distanceTo(this.focus));
        // A tender with an engine (the rescue boat's outboard): her own engine voice, from her transom.
        const ob = sv.tender && gearOf(sv, 'diesel');
        const root = ob && this.vesselRoots.get(id);
        if (ob && root) this.sound.tenderEngine.update(sv, root.localToWorld(this.tmpV.set(0, 0.5, VESSEL_DEFS[sv.defId].hull.stations[0].z)).distanceTo(this.focus));
      }
      const plotter = this.homeView.chart;
      if (plotter) {
        plotter.marks = CONFIG.chartMarks.showOnPlotter ? this.marks : null;
        plotter.specials = this.timberSpecials;
        plotter.update(this.world, this.testVesselId, dt, this.dashInView());
      }
      this.updateRadioSound();
    }
  }

  /** Each boat's lights and spray (returns the workboat's slam and lap); the tow, logs, trawl, fire, wildlife. */
  private updateBoatsAndJobs(dt: number, renderTime: number, darkness: number): { slam: number; lap: number } {
    let slam = 0;
    let lap = 0;
    for (const [id, fx] of this.effects) {
      const v = this.world.vessels[id];
      if (!v) continue;
      // By the viewer's distance (multi-boat M4): smoke within `near`, wake and spray within `mid`.
      const d = id === this.testVesselId ? 0 : Math.hypot(v.position[0] - this.focus.x, v.position[2] - this.focus.z);
      const hit = fx.update(dt, v, this.renderWaves, this.focus, darkness, renderTime, d <= CONFIG.lod.near ? 'full' : d <= CONFIG.lod.mid ? 'noSmoke' : 'none');
      if (id === this.testVesselId) ({ slam, lap } = hit);
    }
    this.towline.update(this.world, this.vesselRoots, this.testVesselId, this.renderWaves);
    this.fuelView.update(this.world, this.vesselRoots, this.focus, this.renderWaves, dt, this.fuelHands.hot, this.fuelHands.held());
    this.painter.update(this.world, this.vesselRoots, this.renderWaves);
    this.logView.update(this.world, this.renderWaves, renderTime);
    this.trawlView.update(this.world, this.vesselRoots.get(this.testVesselId) ?? null, this.renderWaves, renderTime);
    this.potView.update(this.world, this.renderWaves, this.world.time, this.focus, darkness, this.vesselRoots);
    this.longlineView.update(this.world, this.renderWaves, this.focus, this.vesselRoots);
    const struck = this.propStrikeView.update(this.world, this.renderWaves, dt, this.focus, darkness);
    if (struck) {
      const d = struck.distanceTo(this.focus);
      this.sound.contact.thud(1, d);
      this.sound.water.splash(1, d);
    }
    // Potting switched on in Settings: on in our game too, if it's ours (alone or hosting).
    if (userSettings.potting && !this.world.potting && (this.host || !this.client)) this.pushVesselIntent('pottingOn', 1);
    this.fireView.update(this.world, this.renderWaves, renderTime, dt);
    this.jetView.update(this.world, this.world.vessels[this.testVesselId], this.vesselRoots.get(this.testVesselId), renderTime);
    {
      const fj = this.world.fire?.job;
      const tv = this.world.vessels[this.testVesselId];
      const burning = fj && fj.phase !== 'calling' ? fj.intensity : 0;
      const dist = fj ? Math.hypot(fj.x - this.focus.x, fj.z - this.focus.z) : 1e9;
      this.fireGauge?.update(fj ?? null);
      const wet = fj && fj.phase === 'accepted' ? Math.max(fj.wetting, fj.handWet ?? 0) : 0;
      this.sound.fire.update(burning, dist, !!tv && jetOn(tv), this.insideHouse ? this.closed : 0, wet, this.extinguisherLoudness());
      // The anchor chain over the bow roller and the windlass.
      const root = this.vesselRoots.get(this.testVesselId);
      const anchor = tv && gearOf(tv, 'anchor');
      const hawse = anchor && root ? root.localToWorld(this.tmpV.fromArray(anchor.hawse)).distanceTo(this.focus) : 1e9;
      this.sound.anchor.update(tv?.anchor, hawse, this.insideHouse ? this.closed : 0, dt);
      if (tv && root) this.updateHydraulicsSound(tv, root);
      // The engine hatch's hole isn't walkable while it's open; the chart table's floor space
      // is free while its leaf is folded.
      if (tv) {
        const wa = this.walkAreas.get(this.testVesselId);
        wa?.setHatchOpen?.((tv.controls.engineHatch ?? 0) > 0.5);
        wa?.setGateOpen?.((tv.controls.sideGate ?? 0) > 0.5);
        wa?.setChartLeafFolded?.((tv.controls.chartLeaf ?? 1) < 0.5);
      }
      // Gulls overhead; dolphins at the bow when she's under way in open, deep water.
      const wl = CONFIG.wildlife.dolphins;
      const open = !!tv && groundHeight(tv.position[0], tv.position[2]) < -wl.minDepth && nearestPort(tv.position[0], tv.position[2]).dist > wl.minPortDistance;
      const speed = tv ? Math.hypot(tv.linearVelocity[0], tv.linearVelocity[2]) : 0;
      this.wildlife.update(renderTime, root ?? null, speed, open, this.renderWaves, darkness, this.focus);
      this.sound.wildlife.update(this.wildlife.events, this.insideHouse ? this.closed : 0);
    }
    return { slam, lap };
  }

  /** Port lights, weather, the rescue's people and gear and their sounds. */
  private updateSceneViews(dt: number, renderTime: number, darkness: number): void {
    // The ferries (their wakes ride the ocean's waves, so they're made once the ocean is).
    if (!this.ferryView) {
      this.ferryView = new FerryView(this.ocean.sharedUniforms);
      this.scene.add(this.ferryView.root);
    }
    this.ferryView.update(this.world, this.renderWaves, darkness, renderTime, this.focus);
    // Regions: which are drawn in full for this viewer, which outlines are in sight today;
    // the ocean shader's shelter zones follow the resident set.
    this.worldView.update(this.focus, this.environment.visibility, dt);
    // A big Voyage map's detailed ground: fetched round the eye and every boat (coastStream.ts).
    this.sinceStream += dt;
    const streamer = coastStreamer();
    if (streamer && this.sinceStream > 0.25) {
      this.sinceStream = 0;
      const points = [{ x: this.focus.x, z: this.focus.z }];
      for (const v of Object.values(this.world.vessels)) points.push({ x: v.position[0], z: v.position[2] });
      streamer.update(points);
    }
    // The ocean shader holds MAX_SHELTERS sheltered-water zones: the nearest ones of the
    // regions drawn in full, looked at again every second (a coast map has dozens of
    // harbours, and the physics calms them all: the drawn sea must match where you are).
    const residency = this.worldView.residencyChanged;
    if (residency) {
      this.ocean.setRaces(this.worldView.races);
      this.shelterPool = this.worldView.shelters;
    }
    this.sinceShelters += dt;
    if (residency || this.sinceShelters > 1) {
      this.sinceShelters = 0;
      const { x, z } = this.focus;
      const near = this.shelterPool
        .map((s, i) => ({ s, i, d: Math.hypot(s.x - x, s.z - z) - s.rOut }))
        .sort((a, b) => a.d - b.d)
        .slice(0, MAX_SHELTERS);
      const key = near.map((n) => n.i).join(',');
      if (residency || key !== this.shelterKey) {
        this.shelterKey = key;
        this.ocean.setShelters(near.map((n) => n.s));
      }
      // The water's colour of the map you're on (a coast map's own, RegionDef.water), checked with the shelters.
      const water = regionAt(x, z)?.water;
      if (water !== this.waterNow) {
        this.waterNow = water;
        this.ocean.setWater(water);
      }
    }
    this.worldView.lights.update(renderTime, darkness, this.focus, this.environment.visibility);
    this.navMarks.update(this.renderWaves, renderTime, darkness, this.focus);
    this.projectView.update(this.world, this.renderWaves, renderTime, darkness, this.focus);
    this.targetsView.visibility = this.environment.visibility;
    this.updateWeatherViews(renderTime, darkness, dt);
    this.targetsView.update(this.world, this.renderWaves, this.focus, darkness, renderTime, dt, this.vesselRoots);
    this.gearView.update(this.world, this.testVesselId, this.vesselRoots.get(this.testVesselId), this.renderWaves, this.rescueHands, this.localPlayerId, this.avatarHands);
    this.updateOtherGear();
    this.updateRescueSounds();
  }

  /** The whiteboard and duty board, the chart table, what this browser keeps, the FM, the listener. */
  private updateBoardsAndSaves(dt: number): void {
    const testVessel = this.world.vessels[this.testVesselId];
    this.noteKeys.menu.refresh();
    for (const b of this.yardBoards) b.update(this.scene, this.focus);
    for (const s of this.shipyardSigns) s.updateAt(this.scene, this.focus);
    this.cargoTerminal.update(this.scene, this.focus);
    this.belowDecks.update(dt);
    this.plantNotes();
    this.plantSound();
    this.gangway.update(this.gangwayCtx(), this.camera.getWorldPosition(this.gangwayEye));
    if (this.board) {
      this.board.update(this.world);
      // The boards: daylight and the cabin lamp on them; dim and red at night (nightPaper.ts).
      const cabin = testVessel && isPowered(testVessel, 'deckLights') ? testVessel.controls.cabinLight : 0;
      paperColour({ ambient: this.environment.ambientIntensity, darkness: this.darkness, cabin }, this.paper);
      this.board.setLight(this.paper);
      this.dutyBoard?.setLight(this.paper);
      this.dutyBoard?.update(this.world, this.host ? `Game code ${this.host.code}` : '');
      // A duty ticked off: a small tick.
      const done = this.world.duties?.completed ?? 0;
      if (this.dutiesDone >= 0 && done > this.dutiesDone) this.sound.rescue.snap();
      this.dutiesDone = done;
      // Host / solo: keep the notes in this browser, so they survive a reload.
      const b = this.world.board;
      if (b && this.savesHere() && b.seq !== this.boardSaved) {
        this.boardSaved = b.seq;
        try {
          localStorage.setItem(BOARD_KEY, JSON.stringify(b));
        } catch {
          // Not saved; still shared.
        }
      }
    }
    this.updateChartTable(testVessel, dt);
    this.career.tick();
    this.stepSeaTrial();
    this.checkRefit();
    this.noteSlip();
    // Host / solo: keep the rescue count in this browser too.
    const done = this.world.rescue?.completed ?? 0;
    if (this.savesHere() && done !== this.rescuesSaved) {
      this.rescuesSaved = done;
      try {
        localStorage.setItem(RESCUES_KEY, String(done));
      } catch {
        // Not saved.
      }
    }
    if (this.homeView?.fmSet && testVessel) {
      // The station plays near the FM set (a module in the overhead panel); its display shows
      // what the player is doing (tuning, no signal).
      const c = testVessel.controls;
      // From the set (the workboat's hangs under the roof); outside the wheelhouse, through its walls (more so with the doors shut).
      const set = this.homeView.fmSet.getWorldPosition(this.tmpV);
      const walls = this.insideHouse ? 0 : this.closed > 0 ? 2 : 1;
      this.sound.fm.update(c.fmOn > 0 && isPowered(testVessel, 'radio'), c.fmStation, set, set.distanceTo(this.focus), walls);
      this.homeView.setLocal('fm.status', this.sound.fm.status);
    }
    // Spatial sounds (the survivor's whistle, ships' horns, the FM set) hear from the head.
    this.camera.getWorldDirection(this.listenerFwd);
    this.listenerUp.set(0, 1, 0).applyQuaternion(this.camera.getWorldQuaternion(this.attQ));
    this.sound.whistle.setListener(this.focus, this.listenerFwd, this.listenerUp);
    this.updateVoice();
    this.updateHandsetSound();
  }

  /**
   * A TV pressed (modules/furniture/tv*.ts): on a desktop, the browser's picker for a tab to show on it, and
   * the world told (everyone's TV then shows it); pressed again, ours stops. In VR there's no
   * tab to pick: it says so.
   */
  private pressTv(vesselId: string, socketId: string): void {
    const key = tvKey(vesselId, socketId);
    if (this.tvCast.showing === key) {
      this.tvCast.stop();
      return this.pushIntentTo(vesselId, 'tvCast', 0, socketId);
    }
    if (this.renderer.xr.isPresenting || !canShowTab()) return this.overlay.notify('Show a browser tab on the TV from a desktop browser: here you can watch it', 4);
    // The browser's own stop button (its "Stop sharing" bar): the TV goes dark for everyone.
    this.tvCast.onStopped = (k) => this.pushIntentTo(k.slice(0, k.indexOf('/')), 'tvCast', 0, k.slice(k.indexOf('/') + 1));
    // The picker needs the mouse back.
    if (document.pointerLockElement) document.exitPointerLock();
    void this.tvCast.start(key).then((ok) => {
      if (ok) this.pushIntentTo(vesselId, 'tvCast', 1, socketId);
    });
  }

  /** Each frame: every TV shows its tab (ours, a crew-mate's) or goes dark (modules/furniture/tvCast.ts). */
  private updateTv(): void {
    const tvs = this.tvScreens;
    tvs.clear();
    for (const [id, b] of this.boats) for (const c of b.controls) if (c instanceof TvScreen) tvs.set(tvKey(id, c.socketId), c);
    const casts = this.world.tv?.casts ?? {};
    if (!tvs.size && !this.tvCast.showing) return;
    const inGame = !!this.host || this.client?.status === 'connected';
    this.tvCast.attach(inGame ? this.netPeer : null);
    const crew = inGame ? Object.values(this.world.players).flatMap((p) => (p.id !== this.localPlayerId && p.peerId ? [{ peerId: p.peerId }] : [])) : [];
    this.tvCast.update(casts, this.localPlayerId, crew, tvs, this.focus);
  }

  /**
   * Voice with the crew (net/voice.ts): started once we're in a game with others and the
   * sound is on, stopped when we're back to solo. Each frame, every crew-mate's head (world)
   * and radio talk button, for how we hear them.
   */
  private updateVoice(): void {
    const inGame = !!this.host || this.client?.status === 'connected';
    const ctx = this.sound.engine.context;
    // Hosting: our own network id, for the crew to call (in the snapshots with us), and for
    // their Crew tab to tell which of them is the host. Whether voice chat is on or not.
    const me = this.world.players[this.localPlayerId];
    if (this.host && me) me.peerId = this.hostPeerId;
    if (!inGame || !this.netPeer || !ctx || !userSettings.voiceChat) return;
    if (!this.voice) {
      this.voice = new VoiceChat(this.netPeer, ctx);
      this.voice.setMuted(this.voiceMuted);
    }
    const list = this.voiceSpeakers;
    list.length = 0;
    for (const p of Object.values(this.world.players)) {
      // (Their voice off, their radio isn't in their pose: not called, study #7.)
      if (p.id === this.localPlayerId || !p.peerId || !p.avatar?.radio) continue;
      const frame = (p.aboardVesselId && this.vesselRoots.get(p.aboardVesselId)) || this.scene;
      const h = p.avatar.head;
      const w = frame.localToWorld(new THREE.Vector3(h[0], h[1], h[2]));
      list.push({ peerId: p.peerId, head: w, tx: !!p.avatar.radio?.tx, muted: this.mutedCrew.has(p.id) });
    }
    this.voice.update({ head: this.focus, tx: this.radio.tx }, list);
  }

  /** The handset's talk button went down or up this frame: its click (solo too). */
  private radioTxWas = false;
  private updateHandsetSound(): void {
    const tx = this.radio.tx;
    if (tx !== this.radioTxWas) this.sound.handset.click(tx);
    this.radioTxWas = tx;
  }

  /** Port floodlights, cargo, the desktop hand, our pose out and the crew's avatars in. */
  private updateCrewViews(dt: number, inXR: boolean, darkness: number): void {
    // Wheelhouse panel lighting: dims with the dark and turns red at night.
    updatePanelLighting(darkness);
    this.worldView.portLighting.update(this.focus, darkness);
    this.ocean.setPortLight(this.worldView.portLighting.flood);
    if (this.searchlight) {
      this.searchlight.darkness = darkness;
      this.ocean.setSpotlight(this.searchlight.lamp.light);
    }
    // Your torch has its own pool on the water.
    this.ocean.setTorch(this.gear[1].light);
    this.cargoView.update(this.world, this.vesselRoots, (c) => this.carriedPose(c), this.cargoHands.hovered, this.focus, dt);
    const deskHand = inXR ? null : this.desktopHandWorld(this.deskHandW);
    if (deskHand) this.desktopHand.setColor(playerColor(this.localPlayerId));
    this.desktopHand.update(this.camera, deskHand, dt);
    this.updateNetPose(dt);
    const heldGrip = (id: string) => (inXR ? (['left', 'right'] as const).map((h) => (this.camGrip[h]?.id === id ? this.controllers.grips[h] : null)).find((g) => g) ?? null : null);
    this.avatars.update(this.world, this.localPlayerId, this.vesselRoots, dt, heldGrip, this.focus);
    // A camera in our hand: its preview screen, turned to our eyes.
    const heldCam = inXR ? (['left', 'right'] as const).map((h) => this.camGrip[h]?.id).find((id) => id && this.world.cameraHolds?.[id]?.by === this.localPlayerId) : undefined;
    const camBody = heldCam ? this.avatars.cameras.get(heldCam) : undefined;
    if (camBody) this.camPreview.show(camBody, this.focus, dt);
    else this.camPreview.hide();
    // A crew-mate goes in the water: say so once (they can wave; throw them the life ring).
    for (const pl of Object.values(this.world.players)) {
      if (pl.id === this.localPlayerId) continue;
      if (pl.avatar?.swimming && !this.overboard.has(pl.id)) {
        this.overboard.add(pl.id);
        this.overlay.notify(`Man overboard: ${pl.name || 'a crew-mate'} is in the water! Throw them the life ring`, 5);
      } else if (!pl.avatar?.swimming) this.overboard.delete(pl.id);
    }
    this.updateGear(darkness, dt);
  }

  /** Hull contact and water past the hull: sound, and a jolt through the controllers aboard. */
  private updateHullSounds(dt: number, slam: number, lap: number): void {
    const testView = this.vesselViews.get(this.testVesselId);
    const testVessel = this.world.vessels[this.testVesselId];
    if (testView && testVessel) {
      // Hull contact: thump and scrape, and a jolt through both controllers if you're aboard.
      const d = testView.root.position.distanceTo(this.focus);
      const hit = this.sound.contact.update(testVessel.contact, d, dt);
      const aboard = this.world.players[this.localPlayerId].aboardVesselId === testVessel.id;
      if (hit > 0 && aboard) {
        this.xrInput.pulse('left', 0.3 + 0.7 * hit, 60 + 140 * hit);
        this.xrInput.pulse('right', 0.3 + 0.7 * hit, 60 + 140 * hit);
      }
      // Water rushing past and bow slams: sound, and a light thud through the controllers.
      // The wash of the boat you're in (the skiff's, when you're in the skiff).
      const inSkiff = this.world.vessels[this.drivenVesselId()];
      const washBoat = inSkiff && inSkiff.id !== this.testVesselId && !onCrane(inSkiff) ? inSkiff : testVessel;
      const washD = washBoat === testVessel ? d : (this.vesselRoots.get(washBoat.id)?.position.distanceTo(this.focus) ?? d);
      const muffle = this.insideHouse ? this.closed * CONFIG.wheelhouseSound.washMuffle : 0;
      // (A foiling boat: the rush along her hulls fades as they lift clear, and her struts and
      // foils hiss instead; lifting clear and touching down are felt. audio/foilAudio.ts.)
      const washSpeed = Math.hypot(washBoat.linearVelocity[0], washBoat.linearVelocity[2]);
      const clear = washBoat.foil?.clear ?? 0;
      const foilKn = washSpeed * 1.943844;
      this.sound.water.update(washSpeed, washBoat === testVessel ? slam : 0, washBoat === testVessel ? lap : 0, washD, dt, muffle, washBoat.foil ? foilSoundLevels(foilKn, clear).washScale : 1);
      this.sound.foil.update(foilKn, clear, washD, muffle);
      if (washBoat.id !== this.foilFeelBoat) {
        this.foilFeel.reset();
        this.foilFeelBoat = washBoat.id;
      }
      const felt = washBoat.foil ? this.foilFeel.update(clear) : null;
      if (felt && aboard) {
        const lo = CONFIG.foilHelm.liftOff;
        const [i, ms] = felt === 'liftOff' ? lo.upPulse : lo.downPulse;
        this.xrInput.pulse('left', i, ms);
        this.xrInput.pulse('right', i, ms);
        if (felt === 'touchDown') this.sound.water.splash(lo.splash, washD);
      }
      if (slam > 0.1 && aboard) {
        this.xrInput.pulse('left', 0.15 + 0.35 * slam, 40 + 60 * slam);
        this.xrInput.pulse('right', 0.15 + 0.35 * slam, 40 + 60 * slam);
      }
    }
  }

  /**
   * Whether the instrument dash could be on screen: within 12 m and not behind the viewer.
   * When it can't, the displays skip their canvas redraw and texture upload.
   */
  private dashInView(): boolean {
    const anchor = this.homeView?.dashAnchor;
    if (!anchor) return false;
    const toDash = anchor.getWorldPosition(this.tmpV).sub(this.focus);
    const dist = toDash.length();
    if (dist > 12) return false;
    if (dist < 1.5) return true;
    this.camera.getWorldDirection(this.headFwd);
    return toDash.dot(this.headFwd) > -0.3 * dist;
  }

  /** Debug-only bindings. Note time-of-day goes through the intent path like any control. */
  private handleDebugInput(dt: number): void {
    const k = this.keyboard;
    // The game controller first: its buttons press keys the rest of this reads.
    const cam = this.camMode.on;
    this.updateHelmSeat(dt, cam);
    this.updateCraneRemote(cam);
    if (k.actionPressed('toggleOverlay') || this.xrInput.wasPressed('right', XR_BUTTON.secondary)) this.overlay.toggle();
    if (k.actionPressed('menu') || this.xrInput.wasPressed('left', XR_BUTTON.secondary)) this.toggleMenu();
    // M: the planning chart, full screen (desktop).
    if (k.actionPressed('planChart') && !this.renderer.xr.isPresenting) this.planPanel.toggle();
    if (k.actionPressed('toggleHelp')) this.help.toggle();
    if (k.actionPressed('toggleProbes')) this.probes.toggle();
    if (k.actionPressed('toggleHydro')) for (const h of this.hydroViews.values()) h.toggle();
    // (On a twin worked separately, holding the wheel, R is the starboard lever: twinLeverKeys.)
    if (k.actionPressed('dropVessel') && !this.twinLeverKeys()) this.pushVesselIntent('debugDrop', 0);
    // (The recording camera flies on its own keys: none of the body's or the boat's here.)
    if (k.actionPressed('flyMode') && !cam) this.desktop.toggleFly();
    if (k.actionPressed('lash') && !this.renderer.xr.isPresenting && !cam) {
      this.camera.getWorldPosition(this.tmpRay.origin);
      this.camera.getWorldDirection(this.tmpRay.direction);
      this.cargoHands.desktopLash(this.cargoCtx(), this.tmpRay);
    }
    if (!cam) this.handleDebugDriving(dt);
    if (k.actionPressed('engine') && !cam && !this.twinLeverKeys()) this.requestEngineStartStop();
    if (this.boardOnStart) {
      this.boardOnStart = false;
      if (!this.world.players[this.localPlayerId]?.aboardVesselId) this.toggleBoardTo(true);
    }
    this.touch?.update(this.renderer.xr.isPresenting);
    // Crouch: X (VR) or C (desktop, walking) toggles it.
    if (this.xrInput.wasPressed('left', XR_BUTTON.primary) || (k.actionPressed('crouch') && this.desktop.mode === 'walk' && !this.interaction?.steering && !cam)) {
      this.crouched = !this.crouched;
    }
    // Motion coupling: in the menu, or 9 / 0 (desktop).
    let dc = 0;
    if (k.actionPressed('couplingDown')) dc = -0.1;
    if (k.actionPressed('couplingUp')) dc = 0.1;
    if (dc !== 0) this.setCoupling(this.decoupler.coupling + dc);
    // (The left stick's click, while that hand holds a control that takes its stick, is the control's: the tug's levers' sync.)
    if ((k.actionPressed('board') && !cam) || (this.xrInput.wasPressed('left', XR_BUTTON.stick) && !this.interaction?.holding('left')?.stickSteerable)) this.toggleBoard();
    if (k.actionPressed('seaTrials')) this.trialsPanel.toggle(this.world.vessels[this.testVesselId].defId);
    if (k.actionPressed('seaState')) {
      // Cycle the weather presets (each eases in; the sea follows the wind).
      const names = Object.keys(CONFIG.weather.presets);
      const w = this.world.environment.weather;
      const next = names[(names.indexOf(w?.preset ?? names[0]) + 1) % names.length];
      this.pushEnvIntent('weatherForce', names.indexOf(next));
      this.overlay.notify(`Weather: ${next} (easing in)`, 2);
    }
    if (k.actionPressed('heelVessel')) this.pushVesselIntent('debugHeel', 20);
    const step = CONFIG.environment.timeStepHours;
    if (k.actionPressed('timeEarlier')) this.pushEnvIntent('timeOfDayDelta', -step);
    if (k.actionPressed('timeLater')) this.pushEnvIntent('timeOfDayDelta', step);
  }

  /**
   * Debug driving (desktop keyboard only; in VR you use the bridge controls): arrow keys move
   * the lever and helm at a fixed rate, sending absolute positions as intents - the same
   * path the physical controls use.
   */
  private handleDebugDriving(dt: number): void {
    // At the helm of a boat with azimuth drives (the harbour tug): her own keys and sticks.
    const azi = this.aziHelmBoat();
    this.desktop.glance = 0;
    if (azi) return this.driveAzimuth(azi, dt);
    const id = this.drivenVesselId();
    const v = this.world.vessels[id];
    if (!v) return;
    const k = this.keyboard;
    const cfg = CONFIG.debugDriving;
    // A game controller at the helm: the bumpers work the throttle, the left stick the wheel.
    const pad = this.atHelm && this.pad.state.connected ? this.pad.state : null;
    // At the helm, or holding the wheel with the mouse, W and S work the throttle too (owner,
    // Oct 2026: "if you're on mouse and keyboard and you grab the wheel, you can use the W and S
    // keys for the throttle"; the arrow keys were awkward). Walking is off then, so W/S are free.
    // (Not while they steer a clicked control, the searchlight or pod joystick: review, Oct 2026.)
    const onWheel = this.interaction?.desktopHeld instanceof Wheel;
    const ws = (this.atHelm || onWheel) && !this.craneRemote && !this.interaction?.steering ? (k.action('forward') ? 1 : 0) - (k.action('back') ? 1 : 0) : 0;
    const leverIn = clamp((k.action('leverAhead') ? 1 : 0) - (k.action('leverAstern') ? 1 : 0) + ws + (pad ? padLever(pad) : 0), -1, 1);
    const helmIn = (k.action('helmStarboard') ? 1 : 0) - (k.action('helmPort') ? 1 : 0);

    let lever = this.signedLever(v);
    if (leverIn === 0) this.neutralLatched = false;
    else if (!this.neutralLatched) {
      const next = clamp(lever + leverIn * cfg.leverRate * dt, -1, 1);
      // With `stopAtNeutral`: stop at the neutral detent on the way through, and stay there while
      // the key is held; let go and press again to go on. Without (as set): straight through.
      if (cfg.stopAtNeutral && Math.sign(next) !== Math.sign(lever) && lever !== 0) {
        lever = 0;
        this.neutralLatched = true;
      } else lever = next;
    }
    if (k.actionPressed('leverNeutral') || pad?.pressed[PAD.b]) lever = 0;
    let helm = v.controls.helm;
    if (helmIn !== 0) helm = clamp(helm + helmIn * cfg.helmRate * dt, -1, 1);
    const stick = padHelm(pad?.lx ?? 0, this.padSteering);
    this.padSteering = stick.steering;
    if (stick.helm !== null && helmIn === 0) helm = stick.helm;
    if (k.actionPressed('helmMidships')) helm = 0;
    this.driveTo(id, lever, helm, leverIn !== 0);
    // Twin engines worked separately, holding the wheel (owner, Oct 2026): E / D the port lever,
    // R / F the starboard one, each at the keys' rate and stopping at neutral on the way through.
    if (this.twinLeverKeys()) {
      const levers = [v.controls.lever, v.controls.lever2 ?? 0];
      (['throttle.demand', 'throttle.demand2'] as const).forEach((key, i) => {
        const input = (k.action(i ? 'stbdAhead' : 'portAhead') ? 1 : 0) - (k.action(i ? 'stbdAstern' : 'portAstern') ? 1 : 0);
        if (input === 0) {
          this.twinLatched[i] = false;
          return;
        }
        if (this.twinLatched[i]) return;
        const cur = levers[i];
        let next = clamp(cur + input * cfg.leverRate * dt, -1, 1);
        if (cfg.stopAtNeutral && Math.sign(next) !== Math.sign(cur) && cur !== 0) {
          next = 0;
          this.twinLatched[i] = true;
        }
        this.pushIntentTo(id, key, next);
      });
    }
  }

  /** The boat whose azimuth helm you're at (desktop, at the helm: the harbour tug), or null. */
  private aziHelmBoat(): VesselState | null {
    if (!this.atHelm || this.renderer.xr.isPresenting || this.camMode.on) return null;
    const v = this.world.vessels[this.drivenVesselId()];
    return v && gearOf(v, 'diesel')?.azimuth ? v : null;
  }

  /** The azimuth helm's keys: each drive's twist before its notches while its keys are held (null: read it afresh). */
  private readonly aziTurn: (number | null)[] = [null, null];
  /** Each drive was being worked by a stick (point and push): let go, it goes to idle. */
  private readonly aziStick = [false, false];
  /** In TRANSIT, the right stick was setting the throttles. */
  private aziTransitStick = false;

  /**
   * Driving her from the desktop at her azimuth helm (owner, 27 Oct 2026; player/aziHelm.ts):
   * W / S / A / D the port drive, the arrow keys the starboard one; a controller's sticks point
   * and push (LB held, the right stick looks instead); X (or B) both to idle; T (or RB) TRANSIT,
   * in which A / D (or ← →, or the left stick) steer the wheel and W / S (↑ ↓, or the right
   * stick) set both throttles; Q / E / Tab glance round. Sent as the levers' own intents.
   */
  private driveAzimuth(v: VesselState, dt: number): void {
    const k = this.keyboard;
    const id = v.id;
    const pad = this.pad.state.connected ? this.pad.state : null;
    const c = v.controls;
    const transit = (c.aziTransit ?? 0) > 0.5;
    const cur: DriveAsk[] = [
      { angle: c.aziAngle ?? 0, power: Math.max(0, c.lever) },
      { angle: c.aziAngle2 ?? 0, power: Math.max(0, c.lever2 ?? 0) },
    ];
    const send = (i: number, ask: DriveAsk) => {
      const s = i ? '2' : '';
      if (Math.abs(wrapDeg(ask.angle - cur[i].angle)) > 0.05) this.pushIntentTo(id, `azimuth.demand${s}`, Math.round(ask.angle * 10) / 10);
      if (Math.abs(ask.power - cur[i].power) > 1e-3) this.pushIntentTo(id, `throttle.demand${s}`, Math.round(ask.power * 1000) / 1000);
    };
    const key = (code: string) => (k.isDown(code) ? 1 : 0);
    const keys: DriveKeys[] = [
      { power: key('KeyW') - key('KeyS'), twist: key('KeyD') - key('KeyA') },
      { power: key('ArrowUp') - key('ArrowDown'), twist: key('ArrowRight') - key('ArrowLeft') },
    ];
    this.desktop.glance = glanceYaw(!!key('KeyQ'), !!key('KeyE'), !!key('Tab'));
    if (k.wasPressed('KeyT') || pad?.pressed[PAD.rb]) {
      this.pushIntentTo(id, 'azimuth.transit', transit ? 0 : 1);
      this.overlay.notify(transit ? 'TRANSIT off: each drive on its own keys / stick' : 'TRANSIT on: A / D (or the left stick) steer, W / S (or the right stick) both throttles', 3);
      return;
    }
    if (k.wasPressed('KeyX') || pad?.pressed[PAD.b]) {
      cur.forEach((d, i) => send(i, { angle: d.angle, power: 0 }));
      this.aziTurn.fill(null);
      return;
    }
    if (transit) {
      // As on any boat: the wheel, and both throttles together (each drive's lever kept turned
      // where it is: ahead in its forward half, astern in its after half).
      const cfg = CONFIG.debugDriving;
      const steer = clamp(keys[0].twist + keys[1].twist, -1, 1);
      let helm = c.helm;
      if (steer) helm = clamp(helm + steer * cfg.helmRate * dt, -1, 1);
      const stick = padHelm(pad?.lx ?? 0, this.padSteering);
      this.padSteering = stick.steering;
      if (stick.helm !== null && !steer) helm = stick.helm;
      if (Math.abs(helm - c.helm) > 1e-4) this.pushIntentTo(id, 'helm.demand', helm);
      let power = cur[0].power;
      const push = clamp(keys[0].power + keys[1].power, -1, 1);
      if (push) power = clamp(power + push * KEY_LEAN * dt, 0, 1);
      const ry = pad && !pad.down[PAD.lb] ? Math.max(0, -pad.ry) : 0;
      if (ry > 0) {
        power = ry;
        this.aziTransitStick = true;
      } else if (this.aziTransitStick) {
        power = 0;
        this.aziTransitStick = false;
      }
      cur.forEach((d, i) => send(i, { angle: d.angle, power }));
      return;
    }
    for (let i = 0; i < 2; i++) {
      // The controller's stick first (the right one only while LB isn't held: then it looks round).
      const looking = i === 1 && !!pad?.down[PAD.lb];
      const ask = pad && !looking ? pointAndPush(i ? pad.rx : pad.lx, i ? pad.ry : pad.ly) : null;
      if (ask) {
        this.aziStick[i] = true;
        this.aziTurn[i] = null;
        send(i, ask);
        continue;
      }
      if (this.aziStick[i] && !looking) {
        // Let go: idle, still pointing where it was.
        this.aziStick[i] = false;
        send(i, { angle: cur[i].angle, power: 0 });
        continue;
      }
      if (!keys[i].power && !keys[i].twist) {
        this.aziTurn[i] = null;
        continue;
      }
      const step = stepDriveKeys(this.aziTurn[i] ?? cur[i].angle, cur[i].power, keys[i], dt);
      this.aziTurn[i] = step.turn;
      send(i, step);
    }
  }

  /** The keys' lever stopped at neutral on the way through: it stays there until the key is let go. */
  private neutralLatched = false;
  /** The same for each lever of a twin worked separately (port, starboard). */
  private readonly twinLatched = [false, false];

  /**
   * Holding the wheel with the mouse on a twin worked separately: E / D and R / F work a lever
   * each (W / S both), so E, F and R aren't their own keys then (owner, Oct 2026).
   */
  private twinLeverKeys(): boolean {
    if (!(this.interaction?.desktopHeld instanceof Wheel)) return false;
    const v = this.world.vessels[this.drivenVesselId()];
    return !!v && !!gearOf(v, 'diesel')?.split;
  }

  /** Her throttle as one signed command, -1 astern .. 1 ahead (an outboard's: gear x twist grip). */
  private signedLever(v: VesselState): number {
    return gearOf(v, 'outboard') ? Math.sign(v.controls.obGear) * v.controls.lever : v.controls.lever;
  }

  /**
   * Set a boat's throttle (signed, -1..1) and helm (-1..1), as intents (the same path the
   * physical controls use); null leaves one as it is. The driving keys and the touch
   * controls both drive through here. An outboard's throttle is the gear (sign) times the
   * twist grip (0..1); working it (`working`) switches the motor on if needed.
   */
  private driveTo(id: string, lever: number | null, helm: number | null, working = lever !== null): void {
    const v = this.world.vessels[id];
    if (!v) return;
    if (lever !== null) {
      if (gearOf(v, 'outboard')) {
        if (working && v.controls.obOn <= 0) this.pushIntentTo(id, 'obPower', 1);
        if (lever !== this.signedLever(v)) {
          const g = Math.sign(lever);
          if (g !== Math.sign(v.controls.obGear)) this.pushIntentTo(id, 'obGear', g);
          this.pushIntentTo(id, 'lever', Math.abs(lever));
        }
      } else if (lever !== v.controls.lever) this.pushIntentTo(id, 'lever', lever);
    }
    if (helm !== null && helm !== v.controls.helm) this.pushIntentTo(id, 'helm', helm);
  }

  /**
   * Parent the local rig to whatever the player is aboard, at the player's position, with
   * the motion-decoupling comfort correction. `dt` > 0 advances the comfort filters; the
   * second call in a frame (after locomotion) passes 0 and reuses them.
   */
  /**
   * Debug overlay: how many separately drawn parts our boat has (the modular rebuild must
   * not let it creep up; Part C), and how many of them are in the wheelhouse. Counted twice
   * a second, only while the overlay is up.
   */
  private boatPartsLine(dt: number): string {
    if (!this.overlay.visible) return '';
    this.partsIn -= dt;
    const root = this.vesselRoots.get(this.testVesselId);
    if (this.partsIn <= 0 && root) {
      this.partsIn = 0.5;
      const wh = this.testDef.layout.wheelhouse;
      const n = countBoatParts(root, (p) => Math.abs(p.x - houseX(wh)) < wh.halfWidth && p.z > wh.front && p.z < wh.aft && p.y > wh.floorY - 0.2 && p.y < wh.roofY);
      const mods = this.homeView?.moduleList ?? [];
      const shared = Object.entries(this.homeView?.sharedCounts ?? {}).map(([k, c]) => `${c} ${k}`);
      this.partsText = `\nboat parts drawn ${n.drawn} (wheelhouse ${n.inside})${shared.length ? `\nshared parts (one draw each): ${shared.join(', ')}` : ''}\nmodules ${mods.length}: ${mods.join(', ') || 'none'}`;
    }
    return this.partsText;
  }
  private partsIn = 0;
  private partsText = '';

  private syncRigToPlayer(dt: number): void {
    const p = this.world.players[this.localPlayerId];
    const vesselView = p.aboardVesselId ? this.vesselViews.get(p.aboardVesselId) : undefined;
    if (p.aboardVesselId !== this.rigParentId) {
      (vesselView?.root ?? this.scene).add(this.rig.carrier);
      this.rigParentId = p.aboardVesselId;
      // Jumping and climbing keep your view; teleports (menu, B) face you forward.
      if (!this.keepViewOnReparent) this.desktop.resetPose();
      this.decoupler.reset();
    }
    this.keepViewOnReparent = false;
    const carrier = this.rig.carrier;
    carrier.position.fromArray(p.position);
    if (vesselView) {
      // VR and desktop have their own coupling (desktop softer: see CONFIG.comfort), but on
      // the desktop the view rides rigidly at the controls so they hold still to click.
      const xr = this.renderer.xr.isPresenting;
      const atControls = !xr && CONFIG.comfort.desktopRigidAtControls && (this.insideHouse || !!this.interaction?.desktopActive);
      this.deskRigid = Math.min(1, Math.max(0, this.deskRigid + (atControls ? 1 : -1) * dt / CONFIG.comfort.desktopRigidTime));
      const desk = userSettings.desktopCoupling;
      this.decoupler.coupling = xr ? userSettings.motionCoupling : desk + (1 - desk) * this.deskRigid;
      if (dt > 0) {
        const feetY = vesselView.root.localToWorld(this.offsetV.fromArray(p.position)).y;
        this.viewOffset = this.decoupler.update(dt, vesselView.root.quaternion, feetY, this.comfortQ);
      }
      carrier.quaternion.copy(this.comfortQ);
      // The heave offset is world-vertical; express it in the vessel's axes.
      this.offsetV.set(0, this.viewOffset, 0).applyQuaternion(this.attQ.copy(vesselView.root.quaternion).invert());
      carrier.position.add(this.offsetV);
    } else {
      carrier.quaternion.identity();
    }
    this.rig.root.rotation.set(0, p.yaw, 0);
    // Crouch lowers the whole rig (view and hands) toward the deck; only while walking.
    if ((p.mode ?? 'walk') !== 'walk') this.crouched = false;
    if (dt > 0) {
      const want = this.crouched ? CONFIG.locomotion.crouchDrop : 0;
      this.crouchY += (want - this.crouchY) * Math.min(1, dt / CONFIG.locomotion.crouchTime);
    }
    this.rig.root.position.y = -this.crouchY;
    this.camera.updateWorldMatrix(true, false);
  }

  /**
   * How far the wet-exhaust outlet is under water, 0..1, for the engine sound: its depth
   * under the (rendered) sea surface, plus the water the hull itself raises at the transom,
   * which the wave model doesn't include. Near hull speed (Froude number ~0.35-0.45) a
   * displacement hull squats into its own stern wave and the outlet goes under; going
   * astern the water piles up against the transom. Prop wash makes it come and go.
   */
  private exhaustSubmersion(root: THREE.Object3D, v: VesselState, t: number): number {
    const def = VESSEL_DEFS[v.defId];
    if (!def.exhaust) return 0;
    const ex = root.localToWorld(this.tmpV.fromArray(def.exhaust.position));
    let depth = surfaceHeight(this.renderWaves, ex.x, ex.z) - ex.y;
    // Speed through the water along the bow (vessel -z is forward).
    const fwd = this.offsetV.set(0, 0, -1).applyQuaternion(root.quaternion);
    const u = v.linearVelocity[0] * fwd.x + v.linearVelocity[2] * fwd.z;
    const lwl = def.hull.stations[0].z - def.hull.stations[def.hull.stations.length - 1].z;
    const fn = u / Math.sqrt(CONFIG.ocean.gravity * lwl);
    depth += 0.3 * clamp((fn - 0.28) / 0.17, 0, 1) + 0.25 * clamp(-u / 1.5, 0, 1);
    // Wash slopping round the outlet: a slow, uneven wobble that grows with thrust.
    const wash = Math.min(1, Math.abs(v.thrust) / 15000);
    depth += wash * 0.07 * (Math.sin(t * 4.3) + 0.6 * Math.sin(t * 7.1 + 1.3));
    return clamp((depth + 0.03) / 0.2, 0, 1);
  }

  /**
   * The handheld rod (owner, Oct 2026): the game runs on what the hand does each frame
   * (fishing/rodGame.ts); its events are told, felt and sent on (the catch, as an intent).
   */
  private updateRod(dt: number): void {
    const v = this.world.vessels[this.testVesselId];
    if (!v) return;
    const rods = this.gear.filter((g) => g.kind === 'rod');
    const shown: { game: RodGame; tip: THREE.Vector3 | null }[] = [];
    rods.forEach((rod, i) => {
      rod.tick(dt);
      const game = this.rodGames[i];
      const tip = this.rodStep(dt, v, rod, game);
      shown.push({ game, tip });
    });
    this.rodView.update(this.world, this.testVesselId, shown);
  }

  /**
   * The line-throwing gun (tow/lineGun.ts): fired at a tow target's bow eye, the messenger
   * lands, the ship's crew haul the hawser over, and the towline is made fast (towMake, by
   * the gun: at its range).
   */
  private updateLineGun(dt: number): void {
    const gun = this.gear.find((g) => g.kind === 'lineGun');
    const v = this.world.vessels[this.testVesselId];
    if (!gun || !v) return;
    gun.tick(dt);
    const root = this.vesselRoots.get(v.id);
    const stern = root ? root.localToWorld(this.tmpV.fromArray(sternLocal(v))) : this.tmpV.fromArray(v.position);
    const tip = new THREE.Vector3();
    const dir = this.tmpV2;
    gun.tipWorld(tip, dir);
    const held = !!gun.held;
    const targets = held || this.lineGun.phase !== 'ready' ? towTargets(this.world, v.id).flatMap((key) => {
      const p = towPoint(this.world, key, new THREE.Vector3(), v.id);
      return p ? [{ key, pos: { x: p.x, y: p.y, z: p.z } }] : [];
    }) : [];
    const wasFlying = this.lineGun.phase === 'flying';
    const ev = this.lineGun.step(dt, { held, pressed: gun.pressed, tip, dir, targets, waterAt: (x, z) => surfaceHeight(this.renderWaves, x, z) });
    gun.pressed = false;
    this.lineGunView.update(this.lineGun, held ? tip : null, stern);
    const hand = gun.held === 'left' || gun.held === 'right' ? gun.held : null;
    if (!ev) return;
    switch (ev) {
      case 'fired':
        if (hand) this.xrInput.pulse(hand, 0.9, 120);
        this.sound.rescue.gunshot();
        break;
      case 'attached':
        // Aimed true it lands at once, with no 'fired' before: this is the shot as well.
        if (!wasFlying) this.sound.rescue.gunshot();
        if (hand) this.xrInput.pulse(hand, 0.9, 120);
        this.overlay.notify(`Line across! Her crew are hauling the hawser over to ${towName(this.world, this.lineGun.target!.key)}`, 4);
        break;
      case 'missed':
        this.overlay.notify('Missed: the line is in the water. Winding in; aim at her bow eye and fire again', 3);
        break;
      case 'made': {
        const key = this.lineGun.madeKey;
        if (!key) break;
        if (lineOf(this.world, this.testVesselId)) this.overlay.notify('Our towline is already fast: cast it off first', 3);
        else this.intents.push({ playerId: this.localPlayerId, targetId: this.testVesselId, control: 'towMake', value: 1, ref: key, args: [1] });
        break;
      }
      case 'wound':
        break;
    }
  }

  /** One rod's frame: its game stepped from the hand; what it says, told, felt and sent on. Returns its tip if in hand. */
  private rodStep(dt: number, v: VesselState, rod: HandGear, game: RodGame): THREE.Vector3 | null {
    const p = new THREE.Vector3();
    const d = this.tmpV2;
    rod.tipWorld(p, d);
    const held = !!rod.held;
    const ev = game.step(dt, {
      held,
      pressed: rod.pressed,
      down: rod.on,
      tip: p,
      dir: d,
      waterAt: (x, z) => surfaceHeight(this.renderWaves, x, z),
      clearWater: (x, z) => distanceToHull(v, x, z) > 1.5 && groundHeight(x, z) < surfaceHeight(this.renderWaves, x, z) - 1,
      boatSpeed: Math.hypot(v.linearVelocity[0], v.linearVelocity[2]),
    });
    rod.pressed = false;
    const hand = rod.held === 'left' || rod.held === 'right' ? rod.held : null;
    // The fish's pull in the hand while it's on.
    if (hand && game.phase === 'playing' && game.pull > 0.5) this.xrInput.pulse(hand, 0.25 * game.pull, 30);
    if (!ev) return held ? p : null;
    const g = game;
    switch (ev) {
      case 'cast':
        this.overlay.notify('Cast. Wait for the float to dip, then press to strike', 3);
        break;
      case 'bite':
        if (hand) this.xrInput.pulse(hand, 0.9, 150);
        this.overlay.notify('A bite! Press to strike', 2);
        break;
      case 'missed':
        this.overlay.notify('It let go. Wait for the next one', 2);
        break;
      case 'strike':
        if (hand) this.xrInput.pulse(hand, 0.7, 80);
        this.overlay.notify('Fish on! Hold to reel it in; let go when the line pulls hard', 4);
        break;
      case 'broke':
        this.sound.rescue.snap();
        this.overlay.notify('The line parted. Rest the fish when it pulls hard next time', 4);
        break;
      case 'landed': {
        const f = g.landed;
        if (!f) break;
        if (hand) this.xrInput.pulse(hand, 0.5, 60);
        const full = (v.rodCatch?.count ?? 0) >= CONFIG.rod.bucketMax;
        this.pushVesselIntent('rodCatch', f.kg, f.species);
        this.overlay.notify(full ? `A ${f.kg.toFixed(1)} kg ${f.species}, but the bucket is full: tie up at a port to sell it` : `A ${f.kg.toFixed(1)} kg ${f.species}! Into the bucket`, 4);
        break;
      }
      case 'wound':
        break;
    }
    return held ? p : null;
  }

  /**
   * SOS (the menu's Boat > SOS, or the red button under the VHF): the salvage tug recovers
   * her to the nearest boatyard's port if she's over or under (rescue/sos.ts). Anyone off her
   * (in the water, say) comes along, at the helm, as the port shortcuts do.
   */
  private sendSos(): void {
    const v = this.world.vessels[this.testVesselId];
    if (!v) return;
    this.pushVesselIntent('sos', 1);
    if (sosCondition(v) === 'upright') return;
    if (this.world.players[this.localPlayerId].aboardVesselId !== this.testVesselId) this.toggleBoardTo(true);
    this.overlay.notify('SOS sent: the salvage tug is bringing her in', 4);
  }

  /** Play new radio traffic (and repeat the alert of an unanswered call); show it as a notice too. */
  private updateRadioSound(): void {
    const r = this.world.rescue;
    if (!r || !this.homeView?.radio) return;
    const id = r.radio?.id ?? 0;
    const alertT = r.active?.phase === 'calling' ? r.active.alertT : Math.max(towAlertT(this.world), fireAlertT(this.world));
    this.sound.radio.setDistance(this.homeView.radio.root.getWorldPosition(this.tmpV).distanceTo(this.focus));
    if (!this.radioSeen) {
      this.radioSeen = { id, alertT };
      return;
    }
    // A dark VHF neither rings nor speaks: the message is simply missed.
    const v = this.world.vessels[this.testVesselId];
    if (v && !isPowered(v, 'radio')) {
      this.radioSeen = { id, alertT };
      return;
    }
    if (id !== this.radioSeen.id && r.radio) {
      this.sound.radio.message(r.radio.kind, r.radio.text);
      this.overlay.notify(`VHF: ${r.radio.text}`, 8);
    } else if (alertT !== this.radioSeen.alertT && alertT >= 0) {
      this.sound.radio.alert();
    }
    this.radioSeen = { id, alertT };
  }

  /**
   * Desktop: where the mouse "hand" holds something (world): the grip point of the control
   * being dragged or steered, or the top of the crate being carried; else null.
   */
  private desktopHandWorld(out: THREE.Vector3): THREE.Vector3 | null {
    const c = this.interaction?.desktopHeld;
    if (c) return c.grabPoint(out);
    if (this.rescueHands.holdingRing) return out.copy(this.rescueHands.ringPos);
    if (this.rescueHands.holdingHook) return out.copy(this.rescueHands.hookBase);
    for (const g of this.gear) if (g.handPoint(out)) return out;
    return this.cargoHands.handPoint(out);
  }

  /** Does a crew-mate hold this gear (it's off its bracket in their hand)? */
  private gearTakenByOther(kind: GearKind, slot = 0): boolean {
    return Object.values(this.world.players).some((p) => p.id !== this.localPlayerId && p.avatar?.gear?.kind === kind && (p.avatar.gear.slot ?? 0) === slot);
  }

  /** Hand gear as everyone sees it: sprays, beams, crew-mates' gear; the brackets' state. */
  /**
   * How loud an extinguisher's hiss is where you are (0..1): yours in your hand, full;
   * a crew-mate's, falling off with distance. Nothing once it's empty.
   */
  private extinguisherLoudness(): number {
    if ((extinguisherShip(this.world, this.localPlayerId)?.extCharge ?? 1) <= 0) return 0;
    const mine = this.gear[0];
    if (mine.held) return mine.on ? 1 : 0;
    let best = 0;
    const p = this.tmpV;
    for (const pl of Object.values(this.world.players)) {
      const g = pl.avatar?.gear;
      if (pl.id === this.localPlayerId || g?.kind !== 'extinguisher' || !g.on) continue;
      const frame = pl.aboardVesselId ? this.vesselRoots.get(pl.aboardVesselId) : null;
      p.fromArray(g.p);
      if (frame) frame.localToWorld(p);
      best = Math.max(best, 1 / (1 + (p.distanceTo(this.focus) / 6) ** 2));
    }
    return best;
  }

  private updateGear(darkness: number, dt: number): void {
    const mine = this.gear.find((g) => g.held);
    let local: { kind: GearKind; on: boolean; p: THREE.Vector3; d: THREE.Vector3 } | null = null;
    if (mine) {
      const p = new THREE.Vector3();
      const d = new THREE.Vector3();
      mine.tipWorld(p, d);
      local = { kind: mine.kind, on: mine.on, p, d };
    }
    this.handGearView.update(this.world, this.localPlayerId, local, this.vesselRoots, darkness, dt);
    this.updateRod(dt);
    this.updateLineGun(dt);
    // On the bracket: hidden while a crew-mate has it (it's in their hand).
    for (const g of this.gear) if (!g.held) g.mesh.visible = !this.gearTakenByOther(g.kind, g.slot);
    // Spraying an empty extinguisher: say so once.
    const ext = this.gear[0];
    const empty = (extinguisherShip(this.world, this.localPlayerId)?.extCharge ?? 1) <= 0;
    if (ext.held && ext.on && empty && !this.extEmptySaid) this.overlay.notify('Extinguisher empty: hang it back on its bracket for a full one', 4);
    this.extEmptySaid = !!ext.held && empty;
  }

  /** Vessels as the body module sees them (rendered roots, walk areas, hull plans). */
  private bodyVessels(): BodyVessel[] {
    const out: BodyVessel[] = [];
    for (const [id, view] of this.vesselViews) {
      const state = this.world.vessels[id];
      const def = state && VESSEL_DEFS[state.defId];
      // Not the skiff under her tarpaulin in the cradle: you can't jump into her.
      if (!def || state.tender?.phase === 'stowed') continue;
      let plan = this.hullPlans.get(id);
      if (!plan) this.hullPlans.set(id, (plan = hullPlan(def)));
      out.push({ id, root: view.root, area: this.walkAreas.get(id)!, plan, state });
    }
    return out;
  }

  /**
   * Jumping, flying through the air, swimming and climbing out (player/body.ts). Returns
   * true if the body handled movement this frame (so walking locomotion is skipped).
   */
  private updateBody(dt: number, inXR: boolean, area: WalkArea, frame: THREE.Object3D): boolean {
    const p = this.world.players[this.localPlayerId];
    const mode = p.mode ?? 'walk';
    const jumpPressed = inXR ? this.xrInput.wasPressed('right', XR_BUTTON.primary) : this.keyboard.actionPressed('jump');
    const rigW = this.rig.root.getWorldPosition(this.tmpV);
    const headOffset = this.offsetV.copy(this.headW).sub(rigW).setY(0);
    const headHeight = this.headW.y - rigW.y;
    const bodyW = this.bodyW.copy(this.headW).setY(rigW.y);
    const pulseBoth = (i: number, ms: number) => {
      this.xrInput.pulse('left', i, ms);
      this.xrInput.pulse('right', i, ms);
    };

    if (mode === 'walk') {
      if (!jumpPressed) return false;
      // In an engine room the ladder is the only way out (owner, 27 Oct 2026: a jump took you
      // out of it and back on deck): no jumping below.
      if (this.belowDecks.boatId) {
        this.overlay.notify(this.belowDecks.wayOut, 2);
        return false;
      }
      const headL = frame.worldToLocal(this.tmpV.copy(this.headW));
      if (area.ladderAt(headL.x, headL.z)) return false; // Space climbs ladders
      const v = p.aboardVesselId ? this.vesselViews.get(p.aboardVesselId) : undefined;
      jump(p, v && p.aboardVesselId ? { root: v.root, state: this.world.vessels[p.aboardVesselId] } : null, this.headFwd);
      this.keepViewOnReparent = true;
      return true;
    }
    if (mode === 'air') {
      // Falling this fast (down) as we land: the harm of the fall (player/health.ts).
      const falling = -(p.velocity?.[1] ?? 0);
      const ev = updateAir(p, dt, headOffset, this.bodyVessels(), this.worldArea, this.renderWaves);
      if (ev) this.keepViewOnReparent = true;
      if (ev === 'landedDeck' || ev === 'landedLand') {
        pulseBoth(0.5, 50);
        this.hurt(fallHarm(falling), 'A hard landing');
      }
      if (ev === 'splash') {
        pulseBoth(0.7, 120);
        this.sound.water.splash(1);
        this.cargoHands.dropInSea(this.cargoCtx());
        this.rescueHands.dropAll(this.rescueCtx());
      }
      this.comfortOverlay.update(dt, 0.6, false);
      return true;
    }
    // Into a turning propeller (rescue/propStrike.ts): red, black, back aboard (updateStrike).
    if (this.strikeT < 0) {
      const chest = this.tmpV.copy(this.headW);
      chest.y -= 0.6;
      if (struckByPropeller(this.world, chest)) {
        this.strikeT = 0;
        this.health = Math.max(0, this.health - CONFIG.health.propHit);
        this.rescueCtx().push('rescuePropStrike', undefined, 1, [chest.x, chest.y, chest.z]);
        pulseBoth(1, 400);
      }
    }
    // Swimming: climb out with a hand on the gunwale or transom, or the jump button near a
    // hull or quay; otherwise swim (strokes with grab-the-world, or the stick).
    let out = false;
    if (inXR) {
      for (const h of ['left', 'right'] as const) {
        if (out || !this.xrInput.wasPressed(h, XR_BUTTON.grip)) continue;
        const hand = this.controllers.worldPosition(h, this.gripW[h]);
        if (hand) out = climbOut(p, bodyW, hand, this.bodyVessels(), this.renderWaves);
      }
    }
    if (!out && jumpPressed) out = climbOut(p, bodyW, null, this.bodyVessels(), this.renderWaves);
    // In the life ring (a crew-mate threw it, rescue/recovery.ts): out of it on climbing out,
    // or the jump button away from a hull lets go.
    // (Every boat has her own: the one we're in, else the nearest floating.)
    const rings = Object.values(this.world.rescue?.rings ?? {});
    const ring = rings.find((g) => g.state === 'water' && g.player === this.localPlayerId) ?? rings.filter((g) => g.state === 'water').sort((g, h) => Math.hypot(g.pos[0] - bodyW.x, g.pos[2] - bodyW.z) - Math.hypot(h.pos[0] - bodyW.x, h.pos[2] - bodyW.z))[0];
    const inRing = ring?.state === 'water' && ring.player === this.localPlayerId;
    if (inRing && (out || jumpPressed)) {
      this.rescueCtx().push('ringLetGo', undefined, 1);
      this.ringLetGoAt = this.world.time;
    }
    if (out) {
      this.keepViewOnReparent = true;
      pulseBoth(0.4, 60);
      return true;
    }
    if (inRing && !jumpPressed) {
      // Held in the ring: towed with it as the line is hauled in (no strokes of your own).
      const k = Math.min(1, dt * 6);
      p.position[0] += (ring.pos[0] - bodyW.x) * k;
      p.position[2] += (ring.pos[2] - bodyW.z) * k;
      bodyW.x += (ring.pos[0] - bodyW.x) * k;
      bodyW.z += (ring.pos[2] - bodyW.z) * k;
    } else {
      // The ring floating within a couple of strokes, nobody in it: take it (not straight
      // back after letting go).
      if (ring?.state === 'water' && !ring.player && this.world.time - this.ringLetGoAt > 3 && Math.hypot(ring.pos[0] - bodyW.x, ring.pos[2] - bodyW.z) < CONFIG.rescue.crewCatchRadius) {
        this.rescueCtx().push('ringGrab', undefined, 1);
        this.ringLetGoAt = this.world.time; // (asked: not again every frame while the host answers)
        pulseBoth(0.5, 80);
      }
      this.runLocomotion(dt, inXR, this.scene, this.swimArea, CONFIG.body.swimSpeed / CONFIG.locomotion.smoothSpeed, false);
    }
    this.camera.getWorldPosition(this.headW);
    const ev = updateSwim(p, dt, this.bodyW.copy(this.headW).setY(p.position[1]), headHeight, this.bodyVessels(), this.worldArea, this.renderWaves);
    if (ev) this.keepViewOnReparent = true;
    return true;
  }

  /** This hand's thumbstick walks or turns you: not while it makes a gesture, nor while the hand holds a control. */
  private stickFree(hand: 'left' | 'right'): boolean {
    return !this.gestures.ownsStick(hand) && !this.interaction?.holding(hand);
  }

  /** Grab-the-world, stick and desktop movement, collision, floor following, comfort overlay. */
  private updateLocomotion(dt: number, inXR: boolean): void {
    const p = this.world.players[this.localPlayerId];
    const frame = (p.aboardVesselId && this.vesselViews.get(p.aboardVesselId)?.root) || this.scene;
    const area = this.withRamp((p.aboardVesselId && this.walkAreas.get(p.aboardVesselId)) || this.worldArea, p.aboardVesselId);
    // Head from the camera's pose relative to the rig (fresh this frame; see syncRigToPlayer).
    this.camera.getWorldPosition(this.headW);
    this.camera.getWorldDirection(this.headFwd);
    if (inXR && this.vrFlyOn) {
      this.updateVrFly(dt);
      this.placeDebugPanel(inXR);
      return;
    }
    // Lying in a berth: you stay put; a step (the stick, the keys) or a jump gets you up.
    if (this.resting) {
      const [lx, ly] = this.xrInput.hands.left.stick;
      const w = this.desktop.walk;
      const jump = inXR ? this.xrInput.wasPressed('right', XR_BUTTON.primary) : this.keyboard.actionPressed('jump');
      if (Math.hypot(lx, ly) > 0.5 || Math.hypot(w.x, w.z) > 0.1 || jump) this.getUp('');
      this.comfortOverlay.update(dt, 0, false);
      this.placeDebugPanel(inXR);
      return;
    }
    if (!this.updateBody(dt, inXR, area, frame)) {
      // (VR moves through walls aboard, fenced at her edge; but in an engine room its walls and
      // machinery are solid, as on the desktop: owner, 27 Oct 2026, "it's still possible to slide
      // through the walls of the engine room".)
      this.runLocomotion(dt, inXR, frame, inXR ? area : this.withDoor(area, p.aboardVesselId), 1, inXR && !this.belowDecks.boatId);
      this.crossRamp();
    }
    this.placeDebugPanel(inXR);
  }

  /**
   * VR fly (Debug > World; player/vrFly.ts): off the boat into the world's frame, held in the
   * air (no gravity while it's on), the left stick flying where you look at the triggers'
   * speed, the right stick turning as usual. Switched off, the body is "in the air" with
   * no speed, so it falls from there as after a jump.
   */
  private updateVrFly(dt: number): void {
    const p = this.world.players[this.localPlayerId];
    if (p.aboardVesselId) {
      const root = this.vesselViews.get(p.aboardVesselId)?.root;
      if (root) {
        const w = root.localToWorld(this.tmpV.fromArray(p.position));
        p.position = [w.x, w.y, w.z];
        p.yaw += yawOf(root.quaternion);
      }
      p.aboardVesselId = null;
      this.keepViewOnReparent = true;
    }
    p.mode = 'air';
    p.velocity = [0, 0, 0];
    const left = this.xrInput.hands.left;
    const [lx, ly] = this.gestures.ownsStick('left') ? [0, 0] : left.stick;
    const speed = vrFlySpeed(left.values[XR_BUTTON.trigger] ?? 0, this.xrInput.hands.right.values[XR_BUTTON.trigger] ?? 0);
    const f = this.headFwd;
    const right = this.flyRight.set(-f.z, 0, f.x);
    if (right.lengthSq() > 1e-6) right.normalize();
    const d = Math.hypot(lx, ly) > 0.15 ? vrFlyStep(lx, -ly, f, right, speed, dt) : { x: 0, y: 0, z: 0 };
    p.position = [p.position[0] + d.x, p.position[1] + d.y, p.position[2] + d.z];
    // Turning: the usual snap turn (the stick-only part of locomotion; no floor in the open air).
    this.locomotion.update(p, {
      dt,
      frame: this.scene,
      area: this.swimArea,
      head: this.headW,
      headForward: this.headFwd,
      grabbing: { left: null, right: null },
      moveStick: [0, 0],
      turnStick: !this.gestures.ownsStick('right') ? this.xrInput.hands.right.stick[0] : 0,
      desktopDelta: null,
      fly: true,
    });
    // The comfort vignette closes in with speed, as for walking.
    this.comfortOverlay.update(dt, Math.min(1, Math.hypot(d.x, d.y, d.z) / Math.max(1e-6, dt) / CONFIG.vrFly.speed), false);
  }

  /** Her bow ramp, lowered all the way while she's landed on a slipway: it can be walked (world/slipway.ts). */
  private rampDownOnSlip(id: EntityId): VesselState | undefined {
    const v = this.world.vessels[id];
    return rampWalkable(v) && (this.boats.get(id)?.bowRamp?.lowered ?? 0) > 0.99 ? v : undefined;
  }

  /** Aboard a boat landed on a slipway with her ramp down: the ramp and its flaps are deck too. */
  private withRamp(area: WalkArea, vesselId: EntityId | null): WalkArea {
    const v = vesselId ? this.rampDownOnSlip(vesselId) : undefined;
    if (!v) return area;
    const def = VESSEL_DEFS[v.defId];
    const flap = v.slip!.flapDeg;
    const floor = (x: number, z: number) => rampFloor(def, flap, x, z);
    return {
      ...area,
      floorsAt: (x, z) => {
        const f = floor(x, z);
        return f === null ? area.floorsAt(x, z) : [...area.floorsAt(x, z), f];
      },
      walkable: (x, z, y) => {
        const f = floor(x, z);
        return (f !== null && Math.abs(f - y) <= STEP_HEIGHT) || area.walkable(x, z, y);
      },
      inBounds: (x, z) => floor(x, z) !== null || (area.inBounds?.(x, z) ?? true),
    };
  }

  /**
   * Walking off down the ramp onto the slip, or up it from the slip (world/slipway.ts
   * rampCrossing): past the flaps' tips you change frame, the boat's for the world's or back.
   * She's held still while landed, so nothing jumps.
   */
  private crossRamp(): void {
    const p = this.world.players[this.localPlayerId];
    if (!p || (p.mode ?? 'walk') !== 'walk') return;
    if (p.aboardVesselId) {
      const v = this.rampDownOnSlip(p.aboardVesselId);
      const root = v && this.vesselViews.get(v.id)?.root;
      const cross = v && rampCrossing(VESSEL_DEFS[v.defId], v.slip!.flapDeg);
      if (!root || !cross || Math.abs(p.position[0]) > cross.halfWidth || p.position[2] > cross.ashoreZ) return;
      const w = root.localToWorld(this.tmpV.fromArray(p.position));
      p.aboardVesselId = null;
      p.position = [w.x, standingHeight(w.x, w.z), w.z];
      p.yaw += yawOf(root.quaternion);
      this.keepViewOnReparent = true;
      return;
    }
    for (const id of this.vesselViews.keys()) {
      const v = this.rampDownOnSlip(id);
      const root = v && this.vesselViews.get(id)!.root;
      const cross = v && rampCrossing(VESSEL_DEFS[v.defId], v.slip!.flapDeg);
      if (!root || !cross) continue;
      const l = root.worldToLocal(this.tmpV.fromArray(p.position));
      if (Math.abs(l.x) > cross.halfWidth || l.z < cross.aboardZ || l.z > cross.aboardZ + 0.6) continue;
      const f = rampFloor(VESSEL_DEFS[v.defId], v.slip!.flapDeg, l.x, l.z);
      if (f === null) continue;
      p.aboardVesselId = id;
      p.position = [l.x, f, l.z];
      p.yaw -= yawOf(root.quaternion);
      this.keepViewOnReparent = true;
      return;
    }
  }

  /** Desktop walking on the workboat: a shut wheelhouse door (aft or port side) blocks its doorway. */
  private withDoor(area: WalkArea, vesselId: EntityId | null): WalkArea {
    const v = vesselId === this.testVesselId ? this.world.vessels[vesselId] : undefined;
    if (!v) return area;
    const wh = this.testDef.layout.wheelhouse;
    const sd = wh.sideDoor;
    const aftShut = v.controls.door <= 0.5;
    const sideShut = !!sd && (v.controls.sideDoor ?? 0) <= 0.5;
    if (!aftShut && !sideShut) return area;
    const inAft = (x: number, z: number, y: number) => aftShut && Math.abs(x - houseX(wh)) < wh.doorWidth / 2 + 0.15 && Math.abs(z - wh.aft) < 0.3 && y < houseFloorAt(wh, wh.aft) + 0.5;
    const inSide = (x: number, z: number, y: number) => sideShut && !!sd && Math.abs(x - houseX(wh) + wh.halfWidth) < 0.3 && z > sd.z0 - 0.15 && z < sd.z1 + 0.15 && y < wh.floorY + 0.5;
    return { ...area, walkable: (x, z, y) => area.walkable(x, z, y) && !inAft(x, z, y) && !inSide(x, z, y) };
  }

  /** `fly`: VR on foot - grab-the-world moves freely in 3D, nothing collides (see Locomotion). */
  private runLocomotion(dt: number, inXR: boolean, frame: THREE.Object3D, area: WalkArea, speedScale: number, fly: boolean): void {
    const p = this.world.players[this.localPlayerId];

    const grabbing = { left: null as THREE.Vector3 | null, right: null as THREE.Vector3 | null };
    if (inXR) {
      for (const h of ['left', 'right'] as const) {
        // (Not a hand pointing or giving the finger: it stays where you hold it.)
        if (this.xrInput.isDown(h, XR_BUTTON.grip) && !this.busyHands[h] && !this.gestures.gesturing(h)) grabbing[h] = this.controllers.worldPosition(h, this.gripW[h]);
      }
    }
    let desktopDelta: { x: number; y: number; z: number } | null = null;
    const steering = !inXR && this.interaction?.steering;
    if (steering) {
      // WASD steer the clicked control (the searchlight or monitor joystick, the skiff's
      // outboard) instead of walking.
      const k = this.keyboard;
      this.interaction!.steerKeys((k.action('right') ? 1 : 0) - (k.action('left') ? 1 : 0), (k.action('forward') ? 1 : 0) - (k.action('back') ? 1 : 0));
      // Its companion buttons on their keys (the deck crane's hoist, boom and hook).
      this.interaction!.steerExtras((code) => k.isDown(code));
    } else if (!inXR && this.desktop.mode === 'walk' && !this.interaction?.desktopHeld && !this.atHelm && !this.craneRemote) {
      // (Not while the mouse holds a control - dragging a lever or the wheel: you stay put.)
      const { x, y, z } = this.desktop.walk;
      const c = Math.cos(p.yaw);
      const s = Math.sin(p.yaw);
      desktopDelta = { x: (x * c + z * s) * speedScale, y, z: (-x * s + z * c) * speedScale };
    }
    // A stick making a hand gesture (its grip held on a free hand) doesn't walk or turn, nor
    // does the stick of a hand holding a control (owner, Oct 2026: grabbed, "the left and
    // right joystick should be controlling the throttles ... and not sliding you around").
    const [lx, ly] = this.stickFree('left') ? this.xrInput.hands.left.stick : [0, 0];
    // Run (on foot): push the stick right to the edge - it ramps from walk to run over the
    // last fifth of its travel, so it doesn't lurch. (A stick click is already "board".)
    const push = Math.min(1, Math.max(0, (Math.hypot(lx, ly) - 0.8) / 0.2));
    const run = inXR && fly ? 1 + (CONFIG.locomotion.runMultiplier - 1) * push : 1;
    const moving = this.locomotion.update(p, {
      dt,
      frame,
      area,
      head: this.headW,
      headForward: this.headFwd,
      grabbing,
      moveStick: inXR ? [lx * speedScale * run, -ly * speedScale * run] : [0, 0],
      turnStick: inXR && this.stickFree('right') ? this.xrInput.hands.right.stick[0] : 0,
      desktopDelta,
      fly,
      // The desktop's fly camera (J): the body stays at its height, whatever is under the camera.
      noFloor: !inXR && this.desktop.mode === 'fly',
    });
    for (const h of ['left', 'right'] as const) if (this.locomotion.grabStarted[h]) this.xrInput.pulse(h, 0.3, 30);

    // Fade to black if the head is inside structure (room-scale walking into a wall).
    const headL = frame.worldToLocal(this.headW.clone());
    const inWall = inXR && area.insideSolid(headL.x, headL.y, headL.z);
    this.comfortOverlay.update(dt, inXR ? moving : 0, inWall);
  }

  private placeDebugPanel(inXR: boolean): void {
    // Debug panel rides on the left wrist when that controller is tracked; while the menu
    // is open it sits beside the menu instead, so both stay readable.
    const left = this.controllers.grips.left;
    const panel = this.overlay.vrPanel;
    if (inXR && this.menu.isOpen) {
      if (panel.parent !== this.menu.root) {
        this.menu.root.add(panel);
        panel.position.set(this.menu.panel.width / 2 + 0.17, this.menu.panel.height / 2 - 0.12, 0);
        panel.rotation.set(0, 0, 0);
        panel.scale.setScalar(0.75);
      }
    } else if (inXR && left) {
      if (panel.parent !== left) {
        left.add(panel);
        panel.position.set(0, 0.06, 0.1);
        panel.rotation.set(-1.0, 0, 0);
        panel.scale.setScalar(0.75);
      }
    } else if (panel.parent !== this.rig.root) {
      this.placePanelOnRig();
    }
  }

  /** Y (VR) / O (desktop): open the menu on the left wrist, or in front of you. */
  private toggleMenu(): void {
    if (this.menu.isOpen) {
      this.menu.close();
      return;
    }
    const left = this.controllers.grips.left;
    if (this.renderer.xr.isPresenting && left?.visible) this.menu.openOnWrist(left);
    // Desktop: flat on the screen, the mouse freed to work it (a game controller aiming by
    // the reticle keeps the panel in the world, where its reticle can reach it).
    else if (!this.renderer.xr.isPresenting && CONFIG.menu.flatDesktop && !this.pointer?.padAim) {
      if (document.pointerLockElement) document.exitPointerLock();
      this.menu.openFlat();
    }
    // The recording camera: on the camera itself, straight ahead (it flies and eases on its
    // own, apart from your body), as big on the screen whatever the zoom.
    else if (this.camMode.on) {
      const d = (CONFIG.menu.floatDistance * Math.tan((30 * Math.PI) / 180)) / Math.tan((this.camera.fov * Math.PI) / 360);
      this.menu.openFixed(this.camera, 0, -0.04 * d, -d, 0);
    }
    // In front of you, in the rig's carrier: that's the frame your view rides in, so with
    // motion decoupled the menu stays steady with your view instead of rolling with the deck.
    else this.menu.openInFront(this.rig.carrier, this.camera);
  }

  /** The object the player's position is expressed in: the vessel aboard, or the scene. */
  private playerFrame(): THREE.Object3D {
    const p = this.world.players[this.localPlayerId];
    return (p.aboardVesselId && this.vesselViews.get(p.aboardVesselId)?.root) || this.scene;
  }

  /** Board the boat (at the helm), or go ashore onto the quay where the game starts. */
  private toggleBoardTo(aboard: boolean): void {
    this.intents.push({ playerId: this.localPlayerId, targetId: this.localPlayerId, control: 'board', value: aboard ? 1 : 0, ref: aboard ? this.testVesselId : undefined });
  }

  private toggleBoard(): void {
    // (Not from an engine room: the ladder is the only way out of it.)
    if (this.belowDecks.boatId) return this.overlay.notify(this.belowDecks.wayOut, 2);
    const aboard = this.world.players[this.localPlayerId].aboardVesselId;
    this.intents.push({
      playerId: this.localPlayerId,
      targetId: this.localPlayerId,
      control: 'board',
      value: aboard ? 0 : 1,
      ref: aboard ? undefined : this.nearestBoat(),
    });
  }

  /** The boat to board from where you stand (multi-boat M2): the nearest with a wheelhouse within reach, else your boat. */
  private nearestBoat(): EntityId {
    const p = this.world.players[this.localPlayerId];
    const at = p?.aboardVesselId ? null : p?.position;
    if (!at) return this.testVesselId;
    let best = this.testVesselId;
    let bd = CONFIG.spawn.boardReach;
    for (const v of Object.values(this.world.vessels)) {
      const def = VESSEL_DEFS[v.defId];
      if (!def || !hasWheelhouse(def) || def.tow || !this.boats.has(v.id)) continue;
      const d = Math.hypot(v.position[0] - at[0], v.position[2] - at[2]);
      if (d < bd) [best, bd] = [v.id, d];
    }
    return best;
  }

  private toggleSeaTrials(): void {
    const defId = this.world.vessels[this.testVesselId].defId;
    if (!this.renderer.xr.isPresenting) {
      this.trialsPanel.toggle(defId);
      return;
    }
    if (this.trialsPanel.shown) {
      this.trialsPanel.hide();
      return;
    }
    this.trialsPanel.showVR(defId); // ~1 s freeze while the trials run
    placeInFront(this.trialsPanel.vrMesh, this.rig.carrier, this.camera, 1.4, -0.1);
  }

  /**
   * A deck machine's button pressed with no hydraulic pressure: say why nothing happens
   * (the crane, the tow winch and the net drum need the engine running and DECK HYD on).
   */
  private hydraulicsHint(channel: string): void {
    const machine = channel.startsWith('dive.') ? 'The dive A-frame' : channel === 'crane' ? 'The crane' : ['winchHeave', 'winchPayOut', 'winch.heaveIn', 'winch.payOut'].includes(channel) ? 'The tow winch' : ['netOut', 'netIn', 'net.payOut', 'net.haul'].includes(channel) || channel === 'trawl' || channel === 'trawl.shoot' ? 'The net drum' : null;
    const v = this.world.vessels[this.testVesselId];
    if (!machine || !v) return;
    // The dive A-frame's interlocks (modules/diveFrame): say why it holds.
    if (hydraulicsOn(v) && channel.startsWith('dive.')) {
      const f = diveFrameOf(v);
      const s = diveFrameState(v);
      if (!f || !s) return;
      const g = diveGeometry(f.config);
      const atEnd = s.luff <= g.inDeg + 0.3 || s.luff >= g.outDeg - 0.3;
      if ((channel === 'dive.frameOut' || channel === 'dive.frameIn') && !diveSubDocked(v)) this.overlay.notify('The frame only swings with the sub up in the docking head: WINCH UP first', 3);
      else if (channel === 'dive.winchDown' && !atEnd) this.overlay.notify('The winch only lowers with the frame right in (onto her cradle) or right out (into the sea)', 3);
      return;
    }
    if (hydraulicsOn(v)) return;
    const why = v.engine.phase !== 'running' ? 'start the engine' : 'switch the DECK HYD breaker on';
    this.overlay.notify(`${machine} is hydraulic: ${why} (DECK HYD breaker by the helm)`, 3);
  }

  /**
   * A mooring cleat pressed: say what happened (the line goes ashore or is let go), or why
   * nothing did (no berth in reach). Read from the shared state (`berthId` is the berth in
   * range while she's free), so it works for crew too.
   */
  /** Our ship's skiff (the tender whose host is our boat), if she has one. */
  private ourSkiff(): VesselState | undefined {
    return Object.values(this.world.vessels).find((v) => v.tender?.hostId === this.testVesselId);
  }

  /** All our ship's tenders (a big boat may carry the skiff and the rescue boat). */
  private ourTenders(): VesselState[] {
    return Object.values(this.world.vessels).filter((v) => v.tender?.hostId === this.testVesselId);
  }

  /**
   * The tender a ship's cleat clicked means: the one whose line is on it; else the nearest
   * one afloat whose line would go to it; else the first (to say why not).
   */
  private painterTender(cleat: number): VesselState | undefined {
    const all = this.ourTenders();
    if (all.length < 2 || cleat < 0) return all[0];
    const plans = all.map((s) => ({ s, plan: painterPlan(this.world, s, cleat) }));
    const on = plans.find((p) => p.plan.action === 'castOff');
    if (on) return on.s;
    const reach = plans.filter((p) => p.plan.action === 'makeFast').sort((a, b) => (a.plan.action === 'makeFast' ? a.plan.length : 0) - (b.plan.action === 'makeFast' ? b.plan.length : 0));
    return (reach[0] ?? plans[0]).s;
  }

  /** The skiff's lines clicked (at `cleat`: a ship's, or -1 / -2 her bow / stern cleat): say what happens, or why not. */
  private painterHint(skiff: VesselState, cleat: number): void {
    const plan = painterPlan(this.world, skiff, cleat);
    const line = plan.action !== 'none' && plan.end === 'stern' ? 'Stern line' : 'Painter';
    if (plan.action === 'castOff') this.overlay.notify(`${line} let go from the ${cleatName(plan.cleat)}`, 2.5);
    else if (plan.action === 'makeFast') this.overlay.notify(`${line} made fast to the ${cleatName(plan.cleat)} (${plan.length.toFixed(1)} m)`, 3);
    else if (plan.action === 'ashore') {
      const other = plan.end === 'bow' ? skiff.mooring.stern : skiff.mooring.bow;
      this.overlay.notify(`${line} made fast to the quay${other ? '' : `: now the ${plan.end === 'bow' ? 'stern' : 'bow'} line`}`, 3);
    } else if (plan.action === 'letGoAshore') this.overlay.notify(`${line} let go from the quay`, 2.5);
    else this.overlay.notify(`${line === 'Painter' && cleat === -2 ? 'Stern line' : line}: ${plan.why}`, 3);
  }

  private cleatHint(cleat: number): void {
    const v = this.world.vessels[this.testVesselId];
    if (!v) return;
    const m = v.mooring;
    const bow = cleat < 2;
    const end = bow ? m.bow : m.stern;
    const line = bow ? 'Bow line' : 'Stern line';
    if (m.phase !== 'free' && end) this.overlay.notify(`${line} let go`, 2);
    else if (m.phase === 'free' && !m.berthId) this.overlay.notify('No bollard in reach: come slowly alongside a quay berth, lined up with it', 3);
    else this.overlay.notify(`${line} made fast to the ${bow ? 'forward' : 'aft'} bollard${(bow ? m.stern : m.bow) ? '' : `: now the ${bow ? 'stern' : 'bow'} line`}`, 3);
  }

  /**
   * The deck machinery's sounds: is each machine turning (under hydraulic pressure), how
   * hard is it working, and how far is it from us. Read from the shared state, so crew
   * hear the host's machines too.
   */
  private updateHydraulicsSound(v: VesselState, root: THREE.Object3D): void {
    const hyd = hydraulicsOn(v);
    const dist = (x: number, y: number, z: number) => root.localToWorld(this.tmpV.set(x, y, z)).distanceTo(this.focus);
    // Crane: on the move between cradle and water (unfolding, lifting, slewing, lowering).
    // (With two cranes: the one on the move, else the first.)
    const tenders = this.ourTenders();
    const moving = tenders.find((s) => s.tender!.phase === 'lowering' || s.tender!.phase === 'hoisting') ?? this.skiff();
    const tp = moving?.tender?.phase;
    const cr = (moving?.tender && craneOf(this.world, moving.tender)?.crane) ?? gearOf(v, 'tenderCrane');
    const craneRun = hyd && (tp === 'lowering' || tp === 'hoisting') ? 1 : 0;
    // Tow winch: a button held; stalled heaving against more pull than it has.
    const line = lineOf(this.world, v.id);
    const c = v.controls;
    const heave = (c.winchHeave ?? 0) > 0.5;
    const payOut = (c.winchPayOut ?? 0) > 0.5;
    const stalled = hyd && winchStalled(this.world, v.id);
    // The drum only turns while the line can still move (inside the winch's limits).
    const w = CONFIG.tow.winch;
    const L = line ? lineLength(line) : 0;
    const canMove = heave ? L > w.minLength + 0.01 : L < w.maxLength - 0.01;
    const winchRun = hyd && line && heave !== payOut && !stalled && canMove ? (heave ? 0.8 : 1) : 0;
    const tw = gearOf(v, 'towWinch');
    // Net drum: shooting or hauling, by the switch or the A-frame's buttons.
    const f = this.world.fishing;
    // A button only turns the drum while there's net left to pay out or haul in.
    // (And the A-frame's rams, swinging the codend in and out: their pumps sound the same.)
    const jog = ((c.netOut ?? 0) > 0.5 && ((f?.t ?? 0) < 1 || (f?.lift ?? 0) > 0)) || ((c.netIn ?? 0) > 0.5 && f?.net !== 'stowed' && ((f?.t ?? 0) > 0 || (f?.lift ?? 0) < 1));
    const trawlRun = hyd && f && (f.net === 'shooting' || f.net === 'hauling' || f.net === 'lifting' || f.net === 'stowing' || jog) ? 1 : 0;
    // The same drum takes the towline and the trawl warps: it turns only while one of them
    // is really moving under pressure (+1 coming in, -1 going out).
    const netIn = f?.net === 'hauling' || f?.net === 'lifting' || f?.net === 'stowing' || ((c.netIn ?? 0) > 0.5 && f?.net !== 'stowed');
    const drum = this.homeView?.api<TowWinchApi>('deck.tow-winch');
    // (With trawl winches of her own, the warps are theirs: the tow winch only tows.)
    const ownWinches = !!gearOf(v, 'trawlWinches');
    if (drum) drum.drumTurn = winchRun ? (heave ? 1 : -1) : trawlRun && !ownWinches ? (netIn ? 1 : -1) : 0;
    const af = aFrameOf(v);
    const hl = gearOf(v, 'lineHauler');
    const deploy = v.foil?.deploy;
    const foilsMoving = deploy !== undefined && this.lastDeploy !== undefined && Math.abs(deploy - this.lastDeploy) > 1e-5;
    this.lastDeploy = deploy;
    this.sound.hydraulics.update(
      {
        crane: { run: craneRun, load: tp === 'hoisting' ? 0.7 : 0.5, distance: cr ? dist(cr.column[0], cr.shoulderY, cr.column[1]) : 1e9 },
        winch: { run: winchRun, load: line ? Math.min(1, line.tension / CONFIG.tow.winch.pullN) : 0, stalled, distance: tw ? dist(0, 1.2, tw.lead[2]) : 1e9 },
        trawl: { run: trawlRun, load: f?.net === 'hauling' || f?.net === 'lifting' || (c.netIn ?? 0) > 0.5 ? 0.7 : 0.3, distance: af ? dist(0, af.top - 0.3, af.headZ) : 1e9 },
        // The line hauler: turning (a line coming in, or spinning free with its valve open), or held with its valve open (a fish at the roller, or off the line).
        hauler: { run: v.hauler?.run ? Math.min(1, v.hauler.run / CONFIG.longline.hauler.fast) : 0, load: v.hauler?.line ? 0.6 : 0.2, stalled: hyd && !!v.hauler?.held, distance: hl ? dist(hl.sheave[0], hl.sheave[1], hl.sheave[2]) : 1e9 },
        // A foiling boat's foils going up or down (her state's `foil.deploy` moving), under her middle.
        foils: { run: foilsMoving ? 1 : 0, load: 0.5, distance: v.foil ? dist(0, -0.5, 0) : 1e9 },
      },
      this.insideHouse ? this.closed : 0,
    );
  }

  /** The menu's view of the app (see ui/mainMenu.ts). */
  private menuHost(): MenuHost {
    const env = () => this.world.environment;
    const boat = () => this.world.vessels[this.testVesselId];
    const saveSettings = () => saveUserSettings();
    return {
      shipyardStatus: () => this.shipyardBlocker() ?? '',
      openShipyard: () => this.openShipyard(),
      timeOfDay: () => env().timeOfDay,
      shiftTime: (h) => this.pushEnvIntent('timeOfDayDelta', h),
      quietCalls: () => !!this.world.quietCalls,
      setQuietCalls: (on) => this.pushEnvIntent('quietCalls', on ? 1 : 0),
      timeScale: () => env().timeScale,
      setTimeScale: (v) => this.pushEnvIntent('timeScale', v),
      waveHeight: () => significantWaveHeight(env().waves),
      maxWaveHeight: () => (this.maxHs ??= significantWaveHeight(seaStateWaves(CONFIG.ocean.maxSeaScale))),
      weatherStatus: () => {
        const w = env().weather;
        if (!w) return 'Fixed fair weather';
        const n = w.now;
        const vis = visibilityAt(env(), this.focus.x, this.focus.z);
        const visText = vis >= 10000 ? 'good' : vis >= 2000 ? 'moderate' : vis >= 1000 ? 'poor' : `fog ${Math.round(vis)} m`;
        return `${w.preset} · wind ${compass8(n.windFrom).toUpperCase()} ${beaufort(n.wind)} (${n.wind.toFixed(0)} m/s) · vis ${visText} · Hs ${significantWaveHeight(env().waves).toFixed(1)} m · ${w.manual ? 'set by hand (Debug)' : w.live ? 'live, held' : `next ${w.next.preset} in ${Math.max(0, (w.next.at - this.world.time) / 60).toFixed(0)} min`}`;
      },
      raceOverride: () => (env().raceOverride === 'peak' ? 1 : env().raceOverride === 'slack' ? 2 : env().raceOverride === 'ebb' ? 3 : 0),
      setRaceOverride: (v) => this.pushEnvIntent('raceOverride', v),
      shortSeas: () => !env().shortSeasOff,
      setShortSeas: (on: boolean) => this.pushEnvIntent('shortSeas', on ? 1 : 0),
      seaHereText: () => windSeaText(this.focus.x, this.focus.z),
      gustNow: () => {
        const v = this.world.vessels[this.testVesselId];
        const at = v ? v.position : [this.focus.x, 0, this.focus.z];
        this.intents.push({ playerId: this.localPlayerId, targetId: ENVIRONMENT_ID, control: 'gustNow', value: 1, args: [at[0], at[2]] });
      },
      gustStatus: () => {
        const g = env().weather?.gust;
        const zone = gustZone(g);
        if (zone && g) return `Gust on ${zone.name}: ${Math.round(g.peak * g.s)} m/s`;
        return g ? `None; next in ${Math.max(0, Math.round((g.nextAt - this.world.time) / 60))} min (in a region with gusts)` : 'None here';
      },
      weatherFast: () => (env().weather?.speed ?? 1) > 1,
      setWeatherFast: (on) => this.pushEnvIntent('weatherSpeed', on ? 10 : 1),
      weatherMode: () => {
        const w = env().weather;
        return w?.manual ? 'manual' : w?.live ? 'live' : 'own';
      },
      setWeatherManual: (which, value) =>
        this.intents.push({ playerId: this.localPlayerId, targetId: ENVIRONMENT_ID, control: 'weatherManual', value: which, args: [value] }),
      setWeatherAuto: () => {
        if (!env().weather?.manual) return;
        this.pushEnvIntent('weatherOwn', 1);
        // Live weather asked for afresh (the host; crew get it in the snapshots).
        this.startLiveWeather();
      },
      windNow: () => env().weather?.now.wind ?? 0,
      windFromNow: () => env().weather?.now.windFrom ?? 0,
      rainNow: () => env().weather?.now.rain ?? 0,
      treeDetail: () => userSettings.treeDetail,
      treeLevel: () => treeLevel(),
      setTreeDetail: (d) => {
        if (d !== 'auto' && d !== 'quest' && d !== 'desktop') return;
        userSettings.treeDetail = d;
        saveSettings();
      },
      rainQuality: () => userSettings.rainQuality,
      setRainQuality: (q) => {
        if (q !== 'high' && q !== 'low' && q !== 'off') return;
        userSettings.rainQuality = q;
        this.rain.quality = q;
        saveSettings();
      },
      bilgeStatus: () => {
        const v = this.world.vessels[this.testVesselId];
        const b = v?.bilge ?? 0;
        return `Bilge ${Math.round(b * 100)} % · pump ${v && b > 0.01 && isPowered(v, 'bilge') ? 'running' : 'off'}`;
      },
      floodBilge: () => this.pushVesselIntent('debugBilge', 0.6),
      chartStatus: () => `${this.marks.strokes.length} marks, ${pointCount(this.marks)} points`,
      clearChart: () => this.sendChartOp({ k: 'clear' }),
      spawnTraffic: (what) => this.intents.push({ playerId: this.localPlayerId, targetId: ENVIRONMENT_ID, control: 'trafficSpawn', value: what }),
      oilStatus: () => {
        const e = this.world.vessels[this.testVesselId]?.engine;
        const due = Math.max(0, (gearOf({ defId: this.testDef.id }, 'diesel')?.maintenance.checkEvery ?? 0) - (e?.sinceCheck ?? 0));
        return `Oil ${Math.round((e?.oil ?? 0) * 100)} % · next check in ${Math.ceil(due / 60)} min running`;
      },
      oilLow: () => this.pushVesselIntent('debugOil', 0.3),
      trafficStatus: () => {
        const t = this.world.traffic;
        return `${t?.ships.length ?? 0} ships, ${t?.debris.length ?? 0} debris`;
      },
      plotYourself: () => CONFIG.rescue.plotYourself,
      setPlotYourself: (on) => {
        (CONFIG.rescue as { plotYourself: boolean }).plotYourself = on;
      },
      coupling: () => this.decoupler.coupling,
      setCoupling: (v) => this.setCoupling(Math.round(v * 10) / 10),
      smoothWalk: () => userSettings.smoothWalk,
      setSmoothWalk: (on) => {
        userSettings.smoothWalk = on;
        saveSettings();
      },
      hookAutoExtend: () => userSettings.hookAutoExtend,
      setHookAutoExtend: (on) => {
        userSettings.hookAutoExtend = on;
        saveSettings();
      },
      snapTurnDeg: () => userSettings.snapTurnDeg,
      setSnapTurnDeg: (deg) => {
        userSettings.snapTurnDeg = deg;
        saveSettings();
      },
      aboard: () => !!this.world.players[this.localPlayerId].aboardVesselId,
      toggleBoard: () => this.toggleBoard(),
      boardSkiff: () => {
        const skiff = this.skiff();
        if (skiff?.tender?.phase === 'stowed') return this.overlay.notify('The skiff is in her cradle: launch her first (SKIFF CRANE)', 3);
        if (skiff) this.intents.push({ playerId: this.localPlayerId, targetId: this.localPlayerId, control: 'board', value: 1, ref: skiff.id });
      },
      skiffBattery: () => this.skiff()?.battery ?? 0,
      craneAction: () => {
        const skiff = this.skiff();
        const phase = skiff?.tender?.phase;
        if (!skiff || !phase) return '-';
        const ship = this.world.vessels[this.testVesselId];
        const hyd = !ship || hydraulicsOn(ship);
        if (phase === 'stowed') return hyd ? 'LAUNCH' : 'LAUNCH: no hydraulics';
        if (phase !== 'free') return !hyd ? 'Stopped: no hydraulics' : phase === 'lowering' ? 'Lowering...' : 'Hoisting...';
        if (!hyd) return 'RECOVER: no hydraulics';
        const r = recoverCheck(this.world, skiff);
        return r.ok ? 'RECOVER' : 'RECOVER: ' + (r.why.startsWith('bring') ? 'bring her to the stbd bow' : 'too fast');
      },
      crane: () => {
        const skiff = this.skiff();
        if (skiff) this.pushIntentTo(skiff.id, 'crane', 1);
      },
      dropBoat: () => this.pushVesselIntent('debugDrop', 0),
      landOnSlip: () => {
        if (!VESSEL_DEFS[boat().defId].layout.bowRamp) return this.overlay.notify('Only a boat with a bow ramp lands on a slipway (Debug > Start in > Landing craft)', 4);
        this.pushVesselIntent('slipDebugLand', 1);
      },
      heelBoat: () => this.pushVesselIntent('debugHeel', 20),
      fuel: () => ({ litres: boat().engine.fuelL, tank: fuelTankL(boat()) }),
      canRefuel: () => canRefuel(boat()),
      refuelling: () => boat().refuelling,
      toggleRefuel: () => {
        if (boat().refuelling) this.pushVesselIntent('refuel', 0);
        else if (canRefuel(boat())) this.pushVesselIntent('refuel', 1);
        else this.overlay.notify('Come alongside a fuel berth (Calder Haven quay, Brannock pier head) and stop');
      },
      setFuelDebug: (l) => this.pushVesselIntent('debugFuel', l),
      electricsStatus: () => {
        const e = boat().electrics;
        if (!e) return '-';
        const pct = (x: number) => `${Math.round(x * 100)} %`;
        return `${e.master ? 'Master ON' : 'Master off'} · ${e.volts.toFixed(1)} V ${e.amps.toFixed(0)} A · B1 ${pct(e.soc[0])} B2 ${pct(e.soc[1])}`;
      },
      electricsDebug: (m) => (m === 4 ? this.pushVesselIntent('quickStart', 1) : this.pushVesselIntent('debugElectrics', m)),
      coolingFault: () => boat().engine.coolingFault,
      toggleCoolingFault: () => this.pushVesselIntent('debugCoolingFault', boat().engine.coolingFault ? 0 : 1),
      cargoStatus: () => {
        const v = boat();
        const here = cargoPortAt(v);
        return {
          port: here ? `At ${here.name.replace(' (anchorage)', '')}` : null,
          delivered: this.world.deliveries,
          payloadT: payloadMass(this.world, v.id) / 1000,
          maxT: VESSEL_DEFS[v.defId].cargo.maxPayloadKg / 1000,
        };
      },
      cargoAboard: (i) => {
        const c = aboard(this.world, boat().id)[i];
        if (!c) return null;
        const lashed = 'vessel' in c.at && c.at.lashed;
        return `${cargoLabel(c)}${lashed ? ' · lashed' : ' · loose'}`;
      },
      skiffCargo: (i) => {
        const skiff = this.skiff();
        const c = skiff && aboard(this.world, skiff.id)[i];
        return c ? cargoLabel(c) : null;
      },
      quickJob: (what) => this.quickJob(what),
      skiffLoad: () => {
        const skiff = this.skiff();
        if (!skiff) return '-';
        const max = VESSEL_DEFS[skiff.defId].cargo.slots;
        return `${slotsUsed(this.world, skiff.id)} / ${max} slots · ${payloadMass(this.world, skiff.id)} kg · carry goods in and out by hand`;
      },
      dockStatus: () => {
        const slip = slipOf(boat());
        if (beached(boat())) return { text: 'Beached (walk off down the ramp; go astern to come off)', ready: true, docked: true };
        if (slip) return { text: boat().slip!.phase === 'landed' ? `Landed: ${slip.name} (walk off down the ramp; go astern to come off)` : `Landing: ${slip.name}`, ready: true, docked: true };
        const m = boat().mooring;
        const b = berthById(m.berthId);
        if (m.phase === 'moored') return { text: `Moored: ${b?.name}`, ready: true, docked: true };
        if (m.phase === 'docking') return { text: `${m.bow && m.stern ? 'Lines coming taut' : m.bow ? 'Bow line fast' : 'Stern line fast'}: ${b?.name}`, ready: true, docked: true };
        if (b) return { text: `In range: ${b.name} (click the cleats fore and aft, or menu Dock)`, ready: true, docked: false };
        return { text: 'No berth in range (come slowly alongside a yellow-marked berth)', ready: false, docked: false };
      },
      toggleDock: () => {
        if (boat().slip) return this.pushVesselIntent('slipLeave', 1);
        const m = boat().mooring;
        if (m.phase === 'free' && !m.berthId) this.overlay.notify('No berth in range: come slowly alongside a berth marked in yellow, lined up with the quay');
        else this.pushVesselIntent('dock', 1);
      },
      anchorStatus: () => {
        const a = boat().anchor;
        const depth = -groundHeight(a.x, a.z);
        switch (a.phase) {
          case 'stowed':
            return 'Stowed (switch on the console)';
          case 'paying':
            return `Letting go: ${a.rodeM.toFixed(0)} m out`;
          case 'set':
            return a.dragging ? `DRAGGING! ${a.rodeM.toFixed(0)} m in ${depth.toFixed(0)} m` : `Holding: ${a.rodeM.toFixed(0)} m chain in ${depth.toFixed(1)} m`;
          case 'weighing':
            return `Heaving in: ${a.rodeM.toFixed(0)} m out`;
          case 'hanging':
            return a.rodeM >= (gearOf(boat(), 'anchor')?.chainM ?? 0) ? 'Too deep: not on the bottom' : `Off the bottom: ${a.rodeM.toFixed(0)} m out`;
        }
      },
      ports: () => {
        const [x, , z] = boat().position;
        return PORTS.map((p) => ({
          name: p.name,
          bearingDeg: ((Math.atan2(p.x - x, -(p.z - z)) * 180) / Math.PI + 360) % 360,
          rangeNm: Math.hypot(p.x - x, p.z - z) / 1852,
        }));
      },
      runStatus: () => runStatus(this.world),
      rescueNow: () => this.pushVesselIntent('rescueDebugTrigger', 1),
      rescueEnd: () => this.pushVesselIntent('rescueDebugComplete', 1),
      fmOn: () => (this.world.vessels[this.testVesselId]?.controls.fmOn ?? 0) > 0,
      setFmOn: (on) => this.pushVesselIntent('fmOn', on ? 1 : 0),
      fmStation: () => this.world.vessels[this.testVesselId]?.controls.fmStation ?? 0,
      setFmStation: (i) => this.pushVesselIntent('fmStation', i),
      volume: (id) => mixer.get(id as Bus),
      setVolume: (id, v) => mixer.set(id as Bus, v),
      resetVolumes: () => mixer.reset(),
      voiceTest: () => {
        this.sound.radio.crackle(0.3);
        this.sound.radio.speak('Radio check. One, two, three. How do you read?', 0.3);
        setTimeout(() => {
          const n = speechVoices();
          const speech = n < 0 ? 'no speech synthesis' : `${n} speech voices`;
          this.overlay.notify(`Voice test: ${speech}; spoken ${lastSpeech.started} of ${lastSpeech.tried}${n <= 0 || lastSpeech.started < lastSpeech.tried ? ' (radio: squelch only, no voice)' : ''}`, 8);
        }, 2000);
      },
      sosStatus: () => sosStatus(this.world.vessels[this.testVesselId]),
      sos: () => this.sendSos(),
      rescueNear: (kind) => this.pushVesselIntent('rescueDebugNear', 1, kind),
      rescueAboard: () => this.pushVesselIntent('rescueDebugAboard', 1),
      rescues: () => this.world.rescue?.completed ?? 0,
      towStatus: () => towStatus(this.world, this.testVesselId),
      towFast: () => !!lineOf(this.world, this.testVesselId),
      towToggle: () => {
        // Cast off whatever's on the line, or make fast to the nearest thing in reach.
        if (!lineOf(this.world, this.testVesselId) && !nearestTowTarget(this.world, this.testVesselId)) this.overlay.notify(`Nothing to tow within ${CONFIG.tow.attachRange} m of our stern roller: back our stern up to a bow eye or debris`);
        else this.pushVesselIntent('towToggle', 1);
      },
      towsDelivered: () => this.world.tow?.delivered ?? 0,
      towNear: (kind) => this.pushVesselIntent('towDebugNear', 1, kind),
      towCall: () => this.pushVesselIntent('towDebugCall', 1),
      logNear: () => this.pushEnvIntent('salvageDebugNear', 1),
      ...this.career.menu(),
      ...this.crewMenu(),
      goFishing: () => {
        // Teleport (with the boat) to the nearest fishing ground's edge, like the port Go buttons.
        const v = this.world.vessels[this.testVesselId];
        const fg = [...FISHING_GROUNDS].sort((a, b) => Math.hypot(a.x - v.position[0], a.z - v.position[2]) - Math.hypot(b.x - v.position[0], b.z - v.position[2]))[0];
        this.pushVesselIntent('teleportToGround', 1, fg.name);
        if (this.world.players[this.localPlayerId].aboardVesselId !== this.testVesselId) this.toggleBoardTo(true);
        this.overlay.notify(`${fg.name}: TRAWL switch on, then 2-4 kn`, 3);
      },
      towEnd: () => this.pushVesselIntent('towDebugEnd', 1),
      transferCall: () => this.pushVesselIntent('transferCall', 0),
      transferPlace: () => this.pushVesselIntent('transferPlace', 1),
      fireNear: (kind) => this.pushVesselIntent('fireDebugNear', 1, kind),
      fireCall: () => this.pushVesselIntent('fireDebugCall', 1),
      fireEnd: () => this.pushVesselIntent('fireDebugEnd', 1),
      showTargets: () => !!this.homeView?.chart?.showTargets,
      toggleShowTargets: () => {
        const plotter = this.homeView?.chart;
        if (plotter) plotter.showTargets = !plotter.showTargets;
      },
      teleportToRegion: (id) => {
        const region = regionById(id);
        if (!region) return;
        this.pushVesselIntent('teleportToRegion', 1, id);
        if (this.world.players[this.localPlayerId].aboardVesselId !== this.testVesselId) this.toggleBoardTo(true);
        this.overlay.notify(region.ports[0] ? `${region.name}: at ${region.ports[0].name}` : `${region.name}: afloat south of ${region.landmarks[0]?.name ?? 'its island'}`, 3);
      },
      regionMap: () => this.showRegionMap,
      toggleRegionMap: () => {
        this.showRegionMap = !this.showRegionMap;
        if (this.showRegionMap && !this.overlay.visible) this.overlay.visible = true;
      },
      teleportToPort: (i) => {
        const port = PORTS[i];
        if (!port) return;
        // Your own boat goes (owner, Oct 2026: "everybody to be able to teleport their boat
        // around"): alone or hosting, the game's own boat; crew, the one you launched (none
        // yet: launch one first; the host's boat is the host's to send).
        const mine = this.client ? ownedBoat(this.world, this.localPlayerId) : this.world.vessels[this.world.homeVesselId ?? ''];
        if (!mine) {
          this.overlay.notify('Launch a boat of your own first (Crew > Your boat): Go sends your boat, with you aboard', 4);
          return;
        }
        this.intents.push({ playerId: this.localPlayerId, targetId: mine.id, control: 'teleportToPort', value: 1, ref: port.id });
        // Wherever you are (ashore, swimming, aboard another boat): along with her, at the helm.
        if (this.world.players[this.localPlayerId].aboardVesselId !== mine.id) this.intents.push({ playerId: this.localPlayerId, targetId: this.localPlayerId, control: 'board', value: 1, ref: mine.id });
        this.overlay.notify(port.cargo.berth ? `${port.name}: at the cargo berth, make fast at the cleats` : `${port.name}: in the bay, let go the anchor`, 3);
      },
      // The career's passages (World tab; career/passage.ts): your boat, at her measured cruise.
      passageCruise: () => {
        const v = this.world.vessels[this.testVesselId];
        const c = v && this.cruiseOf(v.defId);
        if (!v) return '';
        if (!c) return 'Working out her cruising speed…';
        return `Her cruise (three-quarter throttle): ${c.knots.toFixed(1)} kn, ${c.fuelLph.toFixed(0)} L/h  ·  ${Math.round(v.engine.fuelL)} L aboard`;
      },
      passageLine: (i) => {
        const v = this.world.vessels[this.testVesselId];
        const c = v && this.cruiseOf(v.defId);
        const to = PASSAGE_PORTS[i];
        if (!v || !c || !to) return '…';
        const p = planPassage(v, to.port, c);
        if (passageBlocker(this.world, v, to.port, p, c) === 'She’s here') return 'she’s here';
        return `${p.nm.toFixed(1)} nm  ·  ${passageTime(p.seconds)}  ·  ${Math.ceil(p.litres)} L`;
      },
      passageButton: (i) => {
        const v = this.world.vessels[this.testVesselId];
        const c = v && this.cruiseOf(v.defId);
        const to = PASSAGE_PORTS[i];
        if (!v || !to) return '';
        if (this.client) return 'Host only';
        if (!c) return '…';
        return passageBlocker(this.world, v, to.port, planPassage(v, to.port, c), c) ?? 'Go';
      },
      makePassage: (i) => {
        const v = this.world.vessels[this.testVesselId];
        const c = v && this.cruiseOf(v.defId);
        const to = PASSAGE_PORTS[i];
        if (!v || !to) return;
        if (this.client) return this.overlay.notify('Only the host makes a passage: the time is everyone’s', 3);
        if (!c) return this.overlay.notify('Still working out her cruising speed: a moment', 2);
        const p = planPassage(v, to.port, c);
        const why = passageBlocker(this.world, v, to.port, p, c);
        if (why) return this.overlay.notify(why, 3);
        this.intents.push({ playerId: this.localPlayerId, targetId: v.id, control: 'passageToPort', value: 1, ref: to.port.id, args: [p.seconds, p.litres] });
        // Wherever you are: along with her, at the helm.
        if (this.world.players[this.localPlayerId].aboardVesselId !== v.id) this.intents.push({ playerId: this.localPlayerId, targetId: this.localPlayerId, control: 'board', value: 1, ref: v.id });
        this.overlay.notify(`Passage to ${to.port.name}: ${p.nm.toFixed(1)} nm, ${passageTime(p.seconds)}, ${Math.ceil(p.litres)} L of fuel. At the cargo berth: make fast at the cleats`, 5);
      },
      homeBoat: () => {
        const defId = this.world.vessels[this.testVesselId]?.defId ?? 'workboat';
        return defId === 'workboat' && new URLSearchParams(location.search).get('fit') === 'all' ? 'workboat:all' : defId;
      },
      setHomeBoat: (defId) => this.restartPage(restartIn(defId)),
      spawnBoat: (defId) => {
        if (this.client) return this.overlay.notify('Only the host puts boats in the world', 3);
        this.pushEnvIntent('spawnBoat', 1, defId);
      },
      launchBoat: (ref) => {
        try {
          localStorage.setItem(LAST_BOAT_KEY, ref);
        } catch {
          // Not remembered.
        }
        // Alone or hosting (owner, Oct 2026: launching a favourite added her beside the pilot
        // boat instead of replacing her, and a crew-mate joining was put aboard the empty
        // one): she replaces your boat, where you are. The page starts again in her, as the
        // Office's Take her does (a host's crew follow); the place on the map is kept.
        // With crew aboard (multiplayer study #12), or in a friend's world, she's put in the
        // world beside the game's boat, as a crew-mate's is, instead of starting the page again.
        const crewAboard = (this.host?.playerCount ?? 1) > 1;
        if (!this.client && !crewAboard && !this.worldBorrowed && !this.borrowedCareer) {
          const url = FLEET.some((f) => f.id === ref) ? restartIn(ref) : restartInDesign(ref);
          url.searchParams.delete('start');
          this.rememberVoyagePlace(Infinity);
          this.overlay.notify('Starting again in her, where you are (in VR: enter VR again once she is loaded)', 4);
          this.restartPage(url);
          return;
        }
        this.pushEnvIntent('launchBoat', 1, ref);
        this.launchAskedAt = performance.now();
        this.overlay.notify('Asking the harbour for a berth for her...', 3);
      },
      lastBoat: () => {
        const ref = this.lastBoatRef();
        if (!ref) return null;
        const id = launchType(ref);
        return id ? this.boatLabel(id) : null;
      },
      launchLast: () => {
        const ref = this.lastBoatRef();
        if (ref) this.menuHost().launchBoat(ref);
      },
      withdrawBoat: () => this.pushEnvIntent('withdrawBoat', 1),
      canHandBack: () => !!this.client && !!ownedBoat(this.world, this.localPlayerId),
      myBoat: () => {
        // Alone or hosting, your boat is the game's own: a launch replaces her.
        const mine = this.client ? ownedBoat(this.world, this.localPlayerId) : this.world.vessels[this.world.homeVesselId ?? ''];
        if (!mine) return 'None yet: launch one of your own';
        const name = this.boatLabel(mine.defId);
        if (mine.mooring.phase === 'moored') return `${name}, moored at ${(mine.mooring.berthId && berthWithId(mine.mooring.berthId)?.name) ?? 'the quay'}`;
        return mine.anchor.phase === 'set' ? `${name}, at anchor off the harbour` : `${name}, under way`;
      },
      seaTrialsShown: () => this.trialsPanel.shown,
      toggleSeaTrials: () => this.toggleSeaTrials(),
      debugPanel: () => this.overlay.visible,
      toggleDebugPanel: () => this.overlay.toggle(),
      hydroView: () => [...this.hydroViews.values()].some((h) => h.root.visible),
      toggleHydroView: () => {
        for (const h of this.hydroViews.values()) h.toggle();
      },
      probes: () => this.probes.mesh.visible,
      toggleProbes: () => this.probes.toggle(),
      potting: () => userSettings.potting,
      setPotting: (on) => {
        userSettings.potting = on;
        saveSettings();
        this.overlay.notify(on ? 'Potting on: order pots at the CARGO screen on any harbour quay' : 'Potting off from your next game (pots already out stay out)', 4);
      },
      potsAboard: () => {
        if (!this.world.potting) return this.overlay.notify('Switch potting on first (Settings → Game)', 3);
        this.pushVesselIntent('potDebugAboard', 1);
      },
      toPottingGround: () => {
        if (!this.world.potting) return this.overlay.notify('Switch potting on first (Settings → Game)', 3);
        this.pushVesselIntent('potDebugGround', 1);
        if (this.world.players[this.localPlayerId].aboardVesselId !== this.testVesselId) this.toggleBoardTo(true);
        this.overlay.notify('On a potting ground: shoot the pots over the side', 3);
      },
      potsReady: (full) => {
        this.pushVesselIntent('potDebugReady', full ? 2 : 1);
        this.overlay.notify(full ? 'Pots in the water: soaked their best (a full catch on a good ground)' : 'Pots in the water: ready to haul', 2.5);
      },
      potsOnPlotter: () => !!this.homeView?.chart?.showPots,
      togglePotsOnPlotter: () => {
        const chart = this.homeView?.chart;
        if (chart) chart.showPots = !chart.showPots;
      },
      debugMenu: () => userSettings.debugMenu,
      setDebugMenu: (on) => {
        userSettings.debugMenu = on;
        saveSettings();
      },
      netStatus: () => this.netStatus(),
      playerName: () => userSettings.playerName,
      nextPlayerName: () => {
        const i = PLAYER_NAMES.indexOf(userSettings.playerName);
        userSettings.playerName = PLAYER_NAMES[(i + 1) % PLAYER_NAMES.length];
        saveSettings();
      },
      netRole: () => (this.host ? 'host' : this.client ? 'client' : this.hostStarting ? 'starting' : 'solo'),
      handTurn: () => CONFIG.avatar.handTurn,
      turnHands: (axis, deg) => turnHands(axis, deg),
      handAxes: () => this.ownHands.showAxes,
      vrFly: () => this.vrFlyOn,
      setVrFly: (on: boolean) => {
        this.vrFlyOn = on;
        this.overlay.notify(on ? (this.renderer.xr.isPresenting ? 'VR fly: left stick flies where you look; triggers go faster' : 'VR fly: on in the headset (desktop: J flies)') : 'VR fly off', 3);
      },
      setHandAxes: (on) => {
        this.ownHands.showAxes = on;
      },
      camera: () => this.camMode,
      setCamera: (on) => this.setCameraMode(on),
      setCameraRide: (ride) => this.setCameraRide(ride),
      cameraNote: () => {
        if (this.renderer.xr.isPresenting) return 'Desktop only. In VR, grip a camera to pick it up';
        const hold = this.world.cameraHolds?.[this.localPlayerId];
        if (this.camMode.on && hold) return `In ${this.world.players[hold.by]?.name ?? 'a crew-mate'}'s hand`;
        return this.camMode.on ? 'Mouse aims · W A S D fly · Space / C up, down · Shift fast · wheel zooms' : 'Fly a camera to film the others (record the screen)';
      },
      hostGame: () => {
        // A friend's world (their career, played on here, never saved): say so before hosting it.
        if ((this.worldBorrowed || this.borrowedCareer) && performance.now() - this.hostBorrowedAskedAt > 6000) {
          this.hostBorrowedAskedAt = performance.now();
          this.overlay.notify("This is your friend's game, not yours: hosting plays it on, never saved here. Press again to host it, or Back to your own game", 6);
          return;
        }
        this.hostGame();
      },
      borrowed: () => this.worldBorrowed || this.borrowedCareer,
      waiting: () => this.waiting(),
      stopWaiting: () => this.stopWaiting(),
      leaveGame: () => {
        this.netMessage = '';
        const borrowed = this.worldBorrowed;
        this.leaveGame(true);
        // The next game is typed afresh (owner: the old code was still in the box to delete).
        this.joinCode = '';
        this.mutedCrew.clear();
        // Left a friend's game: back to our own (career, chart, Voyage place), as this browser
        // has them; the world on the page is still the host's.
        if (borrowed) {
          this.overlay.notify('Left the game: back to your own (in VR: enter VR again once it has loaded)', 4);
          const url = ownPageUrl();
          setTimeout(() => location.replace(url.toString()), 1500);
        }
      },
      shipyardCodes: () => this.shipyardCodes,
      takeDesign: (code) => {
        const offer = this.takeOffer(code);
        if (offer?.buy) {
          // Bought at the yard: back in her, the career paying the difference (settleRefit).
          if (offer.blocked) return this.overlay.notify(`Can't buy her: ${offer.blocked}`, 4);
          const url = restartInDesign(code);
          url.searchParams.set('refitFrom', this.ownBoatCode() ?? '');
          this.overlay.notify('Bought: restarting in her (in VR: enter VR again once she is loaded)', 4);
          return this.restartPage(url);
        }
        this.overlay.notify(offer ? 'Sea trial: restarting in her (in VR: enter VR again once she is loaded)' : 'Restarting in her (in VR: enter VR again once she is loaded)', 4);
        this.restartPage(restartInDesign(code));
      },
      takeLabel: (code) => {
        const offer = this.takeOffer(code);
        if (!offer) return 'Take her';
        if (!offer.buy) return `Sea trial (${Math.round(CONFIG.career.seaTrialS / 60)} min)`;
        return offer.blocked ?? (offer.cost ? `Buy her (${money(offer.cost)})` : 'Buy her (no charge)');
      },
      workboatAgain: () => this.restartPage(restartIn(CONFIG.career.boat)),
      boatNow: () => {
        const defId = this.world.vessels[this.testVesselId]?.defId ?? 'workboat';
        if (defId === 'workboat') return 'The workboat';
        if (defId === 'landingCraft') return 'The landing craft';
        if (defId === 'alaskan38') return 'The Alaskan 38';
        const fleet = FLEET.find((f) => f.id === defId);
        if (fleet) return `The ${fleet.name.toLowerCase()}`;
        if (!isBoatType(defId)) return defId;
        const token = boatTokenOf(defId) ?? '';
        const fav = this.shipyardCodes.favourites().find((f) => sameDesign(f.code, token));
        const read = readDesign(token);
        return fav ? `${fav.name} (Shipyard)` : 'design' in read && read.name ? `${read.name} (Shipyard)` : `Shipyard boat ${groupCode(token)}`;
      },
      pasteCode: () => {
        const clip = navigator.clipboard;
        if (!clip?.readText) return this.overlay.notify('This browser will not let the game read the clipboard: press Ctrl+V instead', 4);
        clip
          .readText()
          .then((t) => this.overlay.notify(this.shipyardCodes.paste(t) ? 'Shipyard code pasted: Take her' : 'No Shipyard code on the clipboard', 3))
          .catch(() => this.overlay.notify('The browser would not let the game read the clipboard: press Ctrl+V instead', 4));
      },
      joinCode: () => this.joinCode,
      typeDigit: (d) => {
        if (this.joinCode.length < 5) this.joinCode += d;
        this.netMessage = '';
      },
      backspace: () => (this.joinCode = this.joinCode.slice(0, -1)),
      joinGame: () => this.joinGame(),
      close: () => this.menu.close(),
    };
  }

  /**
   * Client frame: no local simulation. Our own intents go to the host, except our own
   * body (boarding), which is ours to move. The newest snapshot becomes `this.world`
   * (controls, engine, cargo, other players...); vessel poses are blended between the two
   * snapshots around the render time, ~INTERP_DELAY behind the host. Returns that time.
   */
  private followHost(client: ClientSession): number {
    const me = this.world.players[this.localPlayerId];
    const remote = [];
    for (const i of this.intents.drain()) {
      if (i.targetId === this.localPlayerId) applyPlayerIntent(this.world, me, i);
      else remote.push(i);
    }
    client.sendIntents(remote);
    const snap = client.latest;
    if (snap) {
      // A boat new to this page (another player's, launched since): her type from her token.
      ensureBoatTypes(snap);
      // All of it (the pots and the fuel hoses too: they were missed when listed one by
      // one), but our own body, which is ours.
      takeWorld(this.world, snap);
      this.world.players = { ...snap.players, [this.localPlayerId]: me };
    }
    this.syncVesselViews();
    const renderTime = Math.max(0, client.renderTime());
    const br = client.bracket(renderTime);
    if (br) for (const [id, view] of this.vesselViews) view.setPoseBetween(br.a.vessels[id], br.b.vessels[id], br.alpha);
    return renderTime;
  }

  /**
   * Our head and hands, in the frame we're standing in, for the other players: written
   * into our PlayerState when hosting (it goes out in the snapshots), sent as a pose
   * NET_RATE times a second when a client.
   */
  private updateNetPose(dt: number): void {
    // The recording camera: the camera body, no figure (alone too: it's still a camera).
    if (this.camMode.on && this.world.players[this.localPlayerId]) return this.sendCameraPose(dt, this.world.players[this.localPlayerId]);
    if (!this.host && this.client?.status !== 'connected') {
      // Solo: no pose to send, but the simulation still needs your hand gear (the
      // extinguisher on a fire) and whether you're lying in a berth (sleep: the clock runs
      // on), which it reads from your avatar like a crew-mate's.
      const me = this.world.players[this.localPlayerId];
      if (!me) return;
      const frame = this.playerFrame();
      frame.updateMatrixWorld();
      this.invFrame.copy(frame.matrixWorld).invert();
      const gear = this.gear.map((g) => g.pose(this.invFrame)).find((x) => x) ?? null;
      if (gear || this.resting) me.avatar = { ...(me.avatar ?? { head: [0, 0, 0, 0, 0, 0, 1], left: null, right: null }), gear, resting: this.resting };
      else if (me.avatar) {
        me.avatar.gear = null;
        me.avatar.resting = false;
      }
      return;
    }
    const p = this.world.players[this.localPlayerId];
    const frame = this.playerFrame();
    frame.updateMatrixWorld();
    this.invFrame.copy(frame.matrixWorld).invert();
    // Head and VR hands as if the view were rigid with the deck. Our own view may float a
    // little against the boat's roll and heave (comfort decoupling, `rig.carrier`); sent as
    // seen, that drift showed others our head a few cm off our shoulders (owner bug). So
    // take them relative to the carrier and put the carrier back on our feet, unrotated
    // against the deck: rigid head = feet + (head in the carrier's axes).
    const carrier = this.rig.carrier;
    carrier.updateMatrixWorld();
    const carrierQInv = carrier.getWorldQuaternion(this.carrierQ).invert();
    const onDeck = (world: THREE.Vector3) => carrier.worldToLocal(world).add(this.feetV.fromArray(p.position));
    const head = onDeck(this.camera.getWorldPosition(this.tmpV));
    const q = this.camera.getWorldQuaternion(this.poseQ).premultiply(carrierQInv);
    const inXR = this.renderer.xr.isPresenting;
    // Desktop: waving (hold Y), the right arm up over the head, swinging side to side.
    const waving = !inXR && this.keyboard.action('wave');
    const hand = (h: 'left' | 'right') => {
      if (waving && h === 'right') {
        const f = this.camera.getWorldDirection(this.waveF);
        const side = this.waveV.set(-f.z, 0, f.x).normalize();
        const w = this.camera.getWorldPosition(this.waveW).addScaledVector(side, 0.28 + 0.14 * Math.sin(this.world.time * 7)).add(this.waveUp);
        return onDeck(w).toArray() as [number, number, number];
      }
      // Desktop players have one hand: on whatever the mouse holds (a rubber band to others),
      // so it's where that control really is on the deck.
      if (!inXR) return h === 'right' && this.desktopHandWorld(this.gripW[h]) ? (this.gripW[h].clone().applyMatrix4(this.invFrame).toArray() as [number, number, number]) : null;
      const w = this.controllers.worldPosition(h, this.gripW[h]);
      return w ? (onDeck(w.clone()).toArray() as [number, number, number]) : null;
    };
    // VR hands' orientation in the same frame, so crew-mates see the wrists turn.
    const handQ = (h: 'left' | 'right'): Quat | null => {
      const wq = inXR ? this.controllers.worldQuaternion(h, this.handQ) : null;
      if (!wq) return null;
      const lq = wq.premultiply(carrierQInv);
      return [r(lq.x), r(lq.y), r(lq.z), r(lq.w)];
    };
    const r = (x: number) => Math.round(x * 1000) / 1000;
    const pose: PlayerPose = {
      name: userSettings.playerName,
      aboardVesselId: p.aboardVesselId,
      position: p.position,
      yaw: p.yaw,
      head: [r(head.x), r(head.y), r(head.z), r(q.x), r(q.y), r(q.z), r(q.w)],
      left: hand('left'),
      right: hand('right'),
      leftQ: handQ('left'),
      rightQ: handQ('right'),
      poses: inXR ? this.gestures.codes() : undefined,
      swimming: p.mode === 'swim',
      resting: this.resting,
      tool: this.chartTools?.heldTool() ?? null,
      laser: this.laser.pose(this.invFrame),
      gear: this.gear.map((g) => g.pose(this.invFrame)).find((x) => x) ?? null,
      radio: userSettings.voiceChat ? this.radio.pose() : null,
    };
    if (this.host) {
      p.name = pose.name;
      p.avatar = { head: pose.head, left: pose.left, right: pose.right, leftQ: pose.leftQ, rightQ: pose.rightQ, poses: pose.poses, swimming: pose.swimming, resting: pose.resting, tool: pose.tool, laser: pose.laser, gear: pose.gear, radio: pose.radio };
      return;
    }
    this.poseTimer += dt;
    if (this.poseTimer < 1 / NET_RATE) return;
    this.poseTimer = 0;
    this.client!.sendPose(pose);
  }

  /** Host a game: register a room code with the PeerJS server, then accept crew. `tries`: again on a failure (below). */
  /** The game code we host (while hosting). */
  private hostCode = '';
  /** Leaving for another boat (the page about to start again): no more restarts meanwhile. */
  private restarting = false;

  /** Starting again in the same boat (catching up with a newer build): the world goes with us (keepHostWorld). */
  private restartKeepsWorld = false;
  /**
   * Send this page to `url`: a fresh start in another boat (Debug > Start in, a Shipyard
   * design, a yard refit). Hosting (owner, Oct 2026: changing boat broke the game for the
   * crew, each page then in a different boat): the new page hosts the same game code again
   * (`?host=`), and the crew are told which boat to build; their pages start again in her and
   * join again on their own. Aboard a host's boat as crew: only the host changes her.
   */
  private restartPage(url: URL): void {
    if (this.restarting) return;
    if (this.client) {
      this.overlay.notify("You're aboard the host's boat: only the host can change her (Leave game first to go your own way)", 5);
      return;
    }
    // (A page catching up with a newer build keeps its world: keepHostWorld.)
    if (!url.searchParams.has('fresh') && this.borrowedBlocks()) return;
    if (this.host) {
      this.restarting = true;
      this.restartKeepsWorld = url.searchParams.has('fresh');
      const p = url.searchParams;
      url.searchParams.set('host', this.hostCode);
      this.host.broadcast({ t: 'restart', ...(p.has('boat') ? { boat: p.get('boat')! } : {}), ...(p.has('design') ? { design: p.get('design')! } : {}), ...(p.has('fit') ? { fit: p.get('fit')! } : {}) });
      this.overlay.notify(`Starting again in her, hosting game ${this.hostCode} again: the crew follow (in VR: enter VR again)`, 5);
      // The notice on its way to everyone before the room closes.
      setTimeout(() => {
        this.leaveGame();
        location.assign(url.toString());
      }, CONFIG.net.restartLeadS * 1000);
      return;
    }
    location.assign(url.toString());
  }

  /** Crew: the host's page is starting again in another boat; build her and join the same code again. */
  private followRestart(notice: RestartNotice): void {
    if (this.restarting) return;
    this.restarting = true;
    rememberOwnPage();
    const url = new URL(location.href);
    for (const k of ['design', 'boat', 'fit', 'join', 'host', 'fresh', 't']) url.searchParams.delete(k);
    if (notice.design) url.searchParams.set('design', notice.design);
    else if (notice.boat) url.searchParams.set('boat', notice.boat);
    if (notice.fit) url.searchParams.set('fit', notice.fit);
    url.searchParams.set('together', this.joinCode);
    this.overlay.notify('The host is changing boat: starting again in her and joining again (in VR: enter VR again)', 5);
    this.leaveGame();
    setTimeout(() => location.assign(url.toString()), CONFIG.net.restartFollowS * 1000);
  }

  private hostGame(code = randomRoomCode(), tries = CONFIG.net.hostTries): void {
    if (this.host || this.client || this.hostStarting) return;
    const transport = new PeerHostTransport(code);
    this.hostStarting = true;
    this.netMessage = 'Opening a game...';
    transport.ready.then(
      () => {
        this.hostStarting = false;
        this.host = new HostSession(this.world, this.ids, transport, code);
        this.hostTransport = transport;
        this.rehostCode = null;
        this.host.marks = this.marks;
        this.netPeer = transport.peer;
        this.hostPeerId = peerIdForRoom(code);
        this.hostCode = code;
        this.netMessage = '';
        rememberHosting(code);
        showGameOnAddress(code);
        this.overlay.notify(`Hosting: game code ${code} (the page's address carries it: share the link)`, 5);
        // A crew-mate on a newer page than ours: they can't stay, and only we can put it right.
        this.host.onOtherBuild = (name, theirs) => {
          // Theirs newer: this page is behind (open since before the last update). Update it,
          // hosting the same code again, the crew following (owner, Oct 2026: a crew-mate's
          // newer page couldn't join and played alone). Theirs older: their page reloads itself.
          // (Once: a page that came up still behind, the site's cache lagging, says so instead.)
          const ours = this.world.build?.app ?? APP_BUILD; // (our page's: the stamp the crew see)
          if (isNewerBuild(theirs, ours) && !START_FRESH) {
            const url = new URL(location.href);
            url.searchParams.set('fresh', '1');
            url.searchParams.set('t', String(Date.now()));
            this.overlay.notify(`${name} has a newer version of the game: updating this page, hosting game ${code} again (in VR: enter VR again)`, 8);
            return this.restartPage(url);
          }
          this.netMessage = isNewerBuild(theirs, ours)
            ? `${name}'s page is a newer build (${theirs}; yours ${ours}) and this page couldn't update: reload it (Ctrl+F5) and host again`
            : `${name}'s page is another build (${theirs}; yours ${ours}): it reloads to catch up`;
          this.overlay.notify(this.netMessage, 6);
        };
      },
      (e: { type?: string }) => {
        this.hostStarting = false;
        transport.close();
        const why = e?.type ?? 'network';
        // Our own game's code (a reload, a takeover, Try her together) is taken: someone's
        // hosting it already (a crew-mate took it over while we were away): join them as crew
        // (multiplayer study #10). If nobody turns out to be there (our own old registration,
        // just after a crash), hosting it is tried again (connectClient's onClosed).
        const ours = code === START_HOST || code === START_GAME || this.borrowedCareer || this.rehostCode === code;
        if (why === 'unavailable-id' && ours && !this.client) {
          this.rehostCode = code;
          this.joinCode = code;
          this.togetherTries = CONFIG.net.togetherTries;
          this.netMessage = `Someone is already hosting game ${code}: joining as crew`;
          this.overlay.notify(this.netMessage, 5);
          return this.joinGame();
        }
        // The broker can be slow, down for a moment, or still hold a room we had before (a page
        // closed without saying): try again a few times. "Try her together" needs its room (the
        // others are waiting in it); a menu host can take any code.
        // Each wait longer than the last (study #20: it gave up within ten seconds); our own
        // game's code kept.
        if (tries > 1) {
          this.netMessage = `Couldn't host: ${plainNetError(why)}. Trying again...`;
          this.overlay.notify(this.netMessage, 4);
          const wait = CONFIG.net.hostRetryS * (CONFIG.net.hostTries - tries + 1);
          setTimeout(() => this.hostGame(ours || why === 'unavailable-id' ? code : randomRoomCode(), tries - 1), wait * 1000);
          return;
        }
        this.netMessage = why === 'unavailable-id' ? `Game ${code} is taken: Menu > Crew > Host a game for a new one` : `Couldn't open a game: ${plainNetError(why)}. Then Menu > Crew > Host a game`;
        this.overlay.notify(this.netMessage, 8);
      },
    );
  }

  /** Join the game with the code typed on the keypad. */
  private joinGame(): void {
    if (this.host || this.client || this.hostStarting) return;
    if (this.joinCode.length !== 5) {
      this.netMessage = 'Type the 5-digit game code first';
      return;
    }
    const transport = new PeerClientTransport(this.joinCode);
    this.joinTransport = transport;
    this.connectClient(transport);
    this.netPeer = transport.peer;
    // Sent in together: an attempt that hasn't got in after a while (the host's page was still
    // opening its game) is dropped and tried again, rather than left waiting for ever.
    const client = this.client as ClientSession | null; // (set by connectClient)
    if (this.togetherTries > 0 && client) {
      setTimeout(() => {
        if (this.client === client && client.status !== 'connected') this.retryTogether(client);
      }, CONFIG.net.togetherConnectS * 1000);
    } else if (client) this.watchJoin(client, transport, performance.now());
  }
  /** The last join's link (its stage, for the menu's status). */
  private joinTransport: PeerClientTransport | null = null;
  /** Waiting on a game from a link (`?game=`) rather than one we were in or sent to (#23: its give-up words). */
  private waitingOnLink = false;

  /** Sent in together and not in yet: drop this attempt and try again shortly (or give up when out of tries). */
  private retryTogether(client: ClientSession): void {
    if (this.client === client) this.client = null;
    client.close();
    this.toSolo();
    if (this.togetherTries <= 0) {
      // (An old link, a bookmark, the host's own game opened in a new tab: nobody's there.)
      this.netMessage = this.waitingOnLink ? `Game ${this.joinCode} isn't open: host your own game or join another (menu, Crew)` : "Couldn't find the host's game: ask them for the game code (menu, Crew)";
      this.waitingOnLink = false;
      showGameOnAddress(null);
      return;
    }
    this.togetherTries--;
    this.netMessage = 'Waiting for the host to open the game...';
    this.later(() => this.joinGame(), CONFIG.net.togetherRetryS);
  }

  /** Bumped by Stop waiting: a retry or takeover scheduled before it doesn't happen. */
  private waitEpoch = 0;
  /** `fn` in `s` seconds, unless Stop waiting is pressed before then. */
  private later(fn: () => void, s: number): void {
    const epoch = this.waitEpoch;
    setTimeout(() => {
      if (epoch === this.waitEpoch) fn();
    }, s * 1000);
  }

  /** Trying to get into a game (joining, or waiting to try again): Stop waiting shows. */
  private waiting(): boolean {
    return !this.host && ((this.client !== null && this.client.status !== 'connected') || (!this.client && this.togetherTries > 0 && !this.inSharedGame && this.joinCode.length === 5));
  }

  /** Stop waiting (multiplayer study #23): no more tries, no takeover; on your own. */
  private stopWaiting(): void {
    this.waitEpoch++;
    this.togetherTries = 0;
    const c = this.client;
    this.client = null;
    c?.close();
    this.inSharedGame = false;
    showGameOnAddress(null);
    this.toSolo();
    this.netMessage = 'Stopped waiting: host your own game or join another';
  }

  /**
   * A join that never gets in (multiplayer study #8: "Joining 12345..." for ever: the host's
   * headset asleep, the game finder slow, two networks that can't link): given up after
   * CONFIG.net.joinTimeoutS, or joinLoadS once the world has started coming (a big career
   * world takes a while on a slow line).
   */
  private watchJoin(client: ClientSession, transport: PeerClientTransport, from: number): void {
    setTimeout(() => {
      if (this.client !== client || client.status !== 'connecting') return;
      const s = (performance.now() - from) / 1000;
      if (transport.stage === 'loading' && s < CONFIG.net.joinLoadS) return this.watchJoin(client, transport, from);
      client.lose(`No answer from game ${this.joinCode}. Is the host's game open and their headset on? Try again`);
    }, CONFIG.net.joinTimeoutS * 1000);
  }

  /** The crew, for the menu. */
  private crewMenu() {
    return {
      voiceStatus: () => {
        const v = this.voice;
        if (!userSettings.voiceChat) return 'Off';
        if (!v) return this.host || this.client ? 'Starting (sound on first)' : 'In a game with crew';
        const mic = v.micState === 'asking' ? 'asking for the microphone' : v.micState === 'none' ? 'no microphone (listening only)' : v.isMuted ? 'microphone muted' : 'microphone on';
        return `${v.connected} connected · ${mic}`;
      },
      voiceChat: () => userSettings.voiceChat,
      setVoiceChat: (on: boolean) => {
        userSettings.voiceChat = on;
        saveUserSettings();
        if (!on) {
          this.voice?.close();
          this.voice = null;
        }
      },
      micMuted: () => this.voiceMuted,
      setMicMuted: (m: boolean) => {
        this.voiceMuted = m;
        this.voice?.setMuted(m);
      },
      crewList: () => {
        const names = Object.values(this.world.players).map((p) => (p.id === this.localPlayerId ? `${p.name} (you)` : p.name));
        return names.length > 1 ? `Aboard: ${names.join(', ')}` : 'Just you';
      },
      boatFavourite: () => {
        if (this.boatSaved && performance.now() < this.boatSaved.until) return this.boatSaved.text;
        const v = this.boatAboard();
        if (!v) return 'Step aboard a boat to save her to your favourites';
        return designCodeOf(v.defId) ? this.boatFavName(v) : `${this.boatLabel(v.defId)}: not a Shipyard design, can't be saved`;
      },
      canSaveBoat: () => {
        const v = this.boatAboard();
        return !!v && !!designCodeOf(v.defId);
      },
      saveBoatFavourite: () => {
        const v = this.boatAboard();
        const code = v && designCodeOf(v.defId);
        if (!v || !code) return;
        const read = readDesign(code);
        let summary = '';
        if ('design' in read) {
          // Her figures: a Shipyard boat's already built; a fleet boat's built from her design once.
          const f = (boatTypeOf(v.defId) ?? buildDesign(read.design, code, 'favourite')).figures;
          summary = [`${f.lengthM.toFixed(1)} m`, `${f.massT.toFixed(1)} t`, f.engine].join(' · ');
        }
        const text = this.shipyardCodes.saveBoat(code, this.boatFavName(v), summary);
        this.boatSaved = { text, until: performance.now() + 6000 };
        this.overlay.notify(text, 4);
      },
      planLine: () => {
        const n = nextPoint(this.world);
        const v = this.world.vessels[this.testVesselId];
        if (!this.world.plan?.points.length) return MODE === 'voyage' ? 'No plan yet: open the chart (M), or the table on the quay' : 'No plan yet: open the chart (M) to plan one';
        if (!n) return this.world.plan.points.some((p) => p.kind !== 'look') ? 'Route done: every point reached' : 'No route yet: only things to look at (seen on the way)';
        const d = v ? Math.hypot(n.p.x - v.position[0], n.p.z - v.position[2]) / 1852 : 0;
        return `Next: ${pointLabel(n.p, n.i)}, ${d.toFixed(1)} nm`;
      },
      goPlanTable: () => this.pushEnvIntent('plan', 1, 'goto'),
      openPlanChart: () => {
        this.menu.close();
        if (this.renderer.xr.isPresenting) this.chartBoard.toggle();
        else this.planPanel.show();
      },
      timberLine: () => this.timberLine(),
      liveWeatherLine: () => (this.world.environment.weather?.manual ? 'Weather set by hand (Debug > World)' : (this.world.environment.weather?.live?.text ?? '')),
      liveWeatherCredit: () => this.world.environment.weather?.live?.credit ?? '',
      timberButton: (i: number) => this.timberButton(i),
      timberPress: (i: number) => this.timberPress(i),
      crewMember: (i: number) => {
        // You first, then the others in the order they came.
        const all = Object.values(this.world.players);
        const list = [...all.filter((p) => p.id === this.localPlayerId), ...all.filter((p) => p.id !== this.localPlayerId)];
        const p = list[i];
        if (!p) return null;
        const hostPeer = this.host ? this.hostPeerId : this.client && this.joinCode.length === 5 ? peerIdForRoom(this.joinCode) : '';
        // Your own name as you've set it (playing alone, the world's player still has the default).
        // Voice off said by their name (study #7), in a game: theirs from their pose, ours from the setting.
        const you = p.id === this.localPlayerId;
        const inGame = !!this.host || this.client?.status === 'connected';
        const voiceOff = inGame && (you ? !userSettings.voiceChat : !p.avatar?.radio);
        return { name: you ? userSettings.playerName : p.name, you, host: !!p.peerId && p.peerId === hostPeer, muted: this.mutedCrew.has(p.id), voiceOff };
      },
      toggleCrewMute: (i: number) => {
        const all = Object.values(this.world.players).filter((p) => p.id !== this.localPlayerId);
        const p = all[i - 1];
        if (!p) return;
        if (this.mutedCrew.has(p.id)) this.mutedCrew.delete(p.id);
        else this.mutedCrew.add(p.id);
      },
    };
  }

  /** Become a client over `transport` (PeerJS, or the in-memory loopback in tests). */
  private connectClient(transport: ClientTransport): void {
    const client = new ClientSession(transport, userSettings.playerName, undefined, APP_BUILD, tabClientId() || undefined, SITE);
    this.client = client;
    this.netMessage = '';
    client.onChart = (op) => applyChartOp(this.marks, op);
    client.onRestart = (n) => {
      if (this.client === client) this.followRestart(n);
    };
    client.onWelcome = (playerId, world, chart) => {
      // The host in the other game or on another map (multiplayer study #6): this page goes there.
      if (!this.samePageAsHost(world)) return;
      // The host's page is another version: reload this one, fresh, once (it may be the old one).
      if (!this.sameVersionAsHost(world)) return;
      // The host's chart: their marks replace ours while we're aboard their boat. (Only once
      // we're staying: a page refusing the game kept them over our own saved ones, study #24.)
      this.marks = chart ? { strokes: chart.strokes, tokens: chart.tokens ?? [], seq: this.marks.seq + 1 } : createMarks();
      // The host's boats this page hasn't got: built from their tokens (multi-boat M1).
      ensureBoatTypes(world);
      // The host's boats become ours to draw (multi-boat M5: no restart to become the host's
      // boat; a view here for a boat of another type is rebuilt for hers).
      // Become the player the host made for us first (both pages start as player-1: taken
      // under the old id, our own state wrote over the host's player in the copy).
      this.movePlayer(playerId);
      this.adoptHostWorld(world);
      this.togetherTries = 0; // in: no more retries if this game ends
      this.waitingOnLink = false;
      this.inSharedGame = true;
      showGameOnAddress(this.joinCode);
      this.overlay.notify('Joined: you are aboard the host\'s world', 3);
    };
    client.onClosed = (reason) => {
      if (this.client !== client) return;
      // Sent in together from the Shipyard: the host's game may not be open yet; try again.
      if (this.togetherTries > 0 && client.status !== 'connected' && reason === 'No game with that code') return this.retryTogether(client);
      if (this.inSharedGame && !this.restarting && reason === 'The host left') {
        // The host's page may be reloading (it hosts the same code again): wait for it. If
        // it doesn't come back, the crew-mate who joined first hosts the game on from the
        // last snapshot (net/takeover.ts); the rest keep retrying and find them.
        this.inSharedGame = false;
        this.togetherTries = CONFIG.net.togetherTries;
        const code = this.joinCode;
        const heir = electedHost(this.world, peerIdForRoom(code));
        if (heir?.id === this.localPlayerId) {
          this.overlay.notify(`Lost the host: if they're not back in ${CONFIG.net.takeoverDelayS} s, you host the game on (code ${code})`, 5);
          this.later(() => this.takeOver(code), CONFIG.net.takeoverDelayS);
        } else this.overlay.notify(`Lost the host: waiting for ${heir?.name ?? 'the game'} to come back or take over...`, 4);
        return this.retryTogether(client);
      }
      // Our own game's code taken by a crew-mate's takeover (we came back to it): no game
      // there after all (it was our own old registration): host it again after all.
      if (this.rehostCode === this.joinCode && reason === 'No game with that code' && client.status !== 'connected') {
        this.client = null;
        this.toSolo();
        return this.hostGame(this.rehostCode, 1);
      }
      // A game link with nobody there, out of tries (study #23): said plainly, the address cleared.
      if (this.waitingOnLink && client.status !== 'connected') {
        this.waitingOnLink = false;
        this.netMessage = `Game ${this.joinCode} isn't open: host your own game or join another (menu, Crew)`;
        showGameOnAddress(null);
        return this.toSolo();
      }
      if (reason === 'The host ended the game') this.overlay.notify('The host ended the game: you carry on alone', 5);
      this.netMessage = reason;
      this.toSolo();
    };
  }

  /** A code this page hosted (a reload, a takeover) found taken: joined as crew, hosted again if nobody's there. */
  private rehostCode: string | null = null;
  /** Hosting: the game's connection (its link to the game finder: the menu's status). */
  private hostTransport: PeerHostTransport | null = null;
  /** Hosting with the page hidden: the slow step's timer, and when it last ran (ms). */
  private hiddenTimer: ReturnType<typeof setInterval> | 'worker' | null = null;
  private hiddenAt = 0;

  /**
   * The page hidden or shown (multiplayer study #21). A hidden page isn't drawn, and the game
   * steps only as it draws, so a host's background tab froze everyone's world. Hidden while
   * hosting, the game goes on from a timer (a background tab's run about once a second): the
   * time since, stepped, and a snapshot out, marked paused so the crew are told why things
   * are slow. Shown again, the drawing takes over. (A headset asleep stops everything; the
   * crew's heartbeat notices that.)
   */
  private onVisibility(): void {
    const hidden = document.visibilityState === 'hidden';
    if (hidden && this.host && !this.hiddenTimer) {
      this.host.paused = true;
      this.hiddenAt = performance.now();
      this.hiddenAcc = 0;
      this.hiddenTimer = this.startHiddenClock();
    } else if (!hidden && this.hiddenTimer) {
      this.stopHiddenClock();
      if (this.host) this.host.paused = false;
    }
  }

  /** The hidden host's worker clock (net/hiddenClock.worker.ts), made once. */
  private hiddenClock: Worker | null = null;
  /** Ticks' worth of time not stepped yet (s), carried to the next. */
  private hiddenAcc = 0;

  /**
   * Hidden while hosting: stepped `hiddenStepS` apart by a worker's clock, which a background
   * tab doesn't slow; where workers can't be made, the page's own timer (about once a second).
   */
  private startHiddenClock(): ReturnType<typeof setInterval> | 'worker' {
    const ms = CONFIG.net.hiddenStepS * 1000;
    try {
      this.hiddenClock ??= new Worker(new URL('../net/hiddenClock.worker.ts', import.meta.url), { type: 'module' });
      this.hiddenClock.onmessage = () => this.stepHidden();
      this.hiddenClock.postMessage(ms);
      return 'worker';
    } catch {
      return setInterval(() => this.stepHidden(), ms);
    }
  }

  private stopHiddenClock(): void {
    if (this.hiddenTimer !== null && this.hiddenTimer !== 'worker') clearInterval(this.hiddenTimer);
    this.hiddenClock?.postMessage(0);
    this.hiddenTimer = null;
  }

  /** Hidden while hosting: the game stepped on by the time since (up to two seconds' worth), and the crew sent it. */
  private stepHidden(): void {
    if (!this.host || document.visibilityState !== 'hidden') {
      this.stopHiddenClock();
      return;
    }
    const now = performance.now();
    const since = Math.min((now - this.hiddenAt) / 1000, 2);
    this.hiddenAt = now;
    // Whole ticks of the time since (the rest carried on), as the drawn frames step it.
    this.hiddenAcc += since * CONFIG.sim.tickRate;
    const ticks = Math.floor(this.hiddenAcc);
    this.hiddenAcc -= ticks;
    for (const i of this.host.takeIntents()) this.intents.push(i);
    for (let k = 0; k < ticks; k++) stepWorld(this.world, k === 0 ? this.intents.drain() : [], this.loop.dt, this.simDebug);
    this.host.tick(since);
  }
  /** The heartbeat's notice given (the host gone quiet), so it's said once. */
  private hostQuiet = false;

  /**
   * The other players' boats' rescue gear, drawn as theirs: a crew-mate's ring thrown from her
   * own boat, its line from her own cleat, in her hand or on its hook (our own boat's is
   * `gearView`, with our hands).
   */
  private updateOtherGear(): void {
    const seen = new Set<string>();
    for (const v of playerBoats(this.world)) {
      if (v.id === this.testVesselId || (!gearOf(v, 'lifeRing') && !gearOf(v, 'boatHook'))) continue;
      const root = this.vesselRoots.get(v.id);
      if (!root) continue;
      seen.add(v.id);
      let view = this.otherGear.get(v.id);
      if (!view) {
        view = new RescueGearView();
        this.otherGear.set(v.id, view);
        this.scene.add(view.root);
      }
      view.update(this.world, v.id, root, this.renderWaves, this.noHands, this.localPlayerId, this.avatarHands);
    }
    for (const [id, view] of this.otherGear)
      if (!seen.has(id)) {
        view.root.removeFromParent();
        this.otherGear.delete(id);
      }
  }

  /** Who was in the game at the last look (noticeCrew), by player id; null while not in one. */
  private crewSeen: Map<EntityId, string> | null = null;

  /**
   * "Anna came aboard (3 aboard)", "Anna left the game" (multiplayer study #18: the crew list
   * changed without a word). Quiet while joining, starting again or taking over: the first look
   * at a game only notes who's there.
   */
  private noticeCrew(): void {
    const inGame = !!this.host || this.client?.status === 'connected';
    if (!inGame || this.restarting) {
      this.crewSeen = null;
      return;
    }
    const now = new Map(Object.values(this.world.players).map((p) => [p.id, p.name] as const));
    const seen = this.crewSeen;
    this.crewSeen = now;
    if (!seen) return;
    const came = [...now].filter(([id]) => !seen.has(id) && id !== this.localPlayerId).map(([, n]) => n);
    const went = [...seen].filter(([id]) => !now.has(id) && id !== this.localPlayerId).map(([, n]) => n);
    if (came.length) this.overlay.notify(`${came.join(', ')} came aboard (${now.size} aboard)`, 4);
    if (went.length) this.overlay.notify(`${went.join(', ')} left the game`, 4);
  }

  /**
   * Each frame, as crew: the host's silence (multiplayer study #1). A host whose page dies or
   * whose headset sleeps says nothing, and its link can look open for minutes: past
   * `hostSilentS` the crew are told it isn't responding (or, its snapshots said so, that its
   * page is in the background), past `hostLostS` it's lost, as if its link had closed: the
   * wait for it, then the takeover (net/takeover.ts).
   */
  private heartbeat(): void {
    const c = this.client;
    if (!c || c.status !== 'connected') {
      this.hostQuiet = false;
      return;
    }
    const quiet = c.silentS();
    if (quiet >= CONFIG.net.hostLostS) {
      this.hostQuiet = false;
      return c.lose('The host left');
    }
    if (quiet >= CONFIG.net.hostSilentS && !this.hostQuiet) {
      this.hostQuiet = true;
      this.overlay.notify(c.hostPaused ? "The host's game is in the background: waiting for them..." : 'Host not responding...', 4);
    } else if (quiet < 1) this.hostQuiet = false;
  }

  /** When Host a game was first pressed on a friend's world (pressed again within 6 s, it hosts). */
  private hostBorrowedAskedAt = -1e9;
  /**
   * Playing on a friend's career (multiplayer study #16; owner, 26 Oct 2026: block boat
   * changes): a new boat or a refit starts the page again, which would leave their career and
   * put this browser's own in its place. Says so, and returns true, when that's the case.
   */
  private borrowedBlocks(): boolean {
    if (!this.worldBorrowed && !this.borrowedCareer) return false;
    this.overlay.notify("This is your friend's career: boats and refits change in your own game (Menu → Crew → Back to your own game, or Leave game)", 6);
    return true;
  }

  /** Joining from "Try her together": tries left while the host's game isn't open yet. */
  private togetherTries = 0;
  /** Hosting a game taken over from a lost host (net/takeover.ts): their career, played on, never saved here. */
  private borrowedCareer = false;
  /**
   * The world on this page came from a host (joined a game, even if since left or the host was
   * lost): nothing in it is ours, so nothing is saved into this browser from it (career,
   * chart, notes board, rescues, the Voyage place, plan and barges). Review, Oct 2026: leaving
   * a friend's game saved their career over your own. Cleared only by the page starting again.
   */
  private worldBorrowed = false;
  /** The biggest sea the game makes (Hs, m; worked out once, for the Debug weather menu). */
  private maxHs: number | undefined;

  /** May this page save its world into this browser's storage? Not as crew, nor with a world from a host. */
  private savesHere(): boolean {
    return !this.client && !this.borrowedCareer && !this.worldBorrowed && !seaTrial && !tryOut;
  }

  /** A sea trial: when it started (world time), and the warnings given. */
  private trialFrom: number | null = null;
  private trialWarned = 0;

  /**
   * A sea trial's clock (CONFIG.career.seaTrialS): said at the start, warned at a minute and at
   * ten seconds, then back to the career's own boat. Nothing from the trial is saved (savesHere).
   */
  private stepSeaTrial(): void {
    if (!seaTrial || this.client || this.restarting) return;
    if (this.trialFrom === null) {
      this.trialFrom = this.world.time;
      const mins = Math.round(CONFIG.career.seaTrialS / 60);
      this.overlay.notify(`Sea trial: ${mins} minutes in her. Nothing is saved; your career goes on in your own boat after. To buy her: Office > Your boats at a boatyard.`, 10);
      return;
    }
    const left = CONFIG.career.seaTrialS - (this.world.time - this.trialFrom);
    if (left <= 60 && this.trialWarned < 1) {
      this.trialWarned = 1;
      this.overlay.notify('Sea trial: one minute left', 4);
    } else if (left <= 10 && this.trialWarned < 2) {
      this.trialWarned = 2;
      this.overlay.notify('Sea trial: ten seconds left', 4);
    } else if (left <= 0 && this.trialWarned < 3) {
      this.trialWarned = 3;
      this.overlay.notify('Sea trial over: back to your own boat (in VR: enter VR again once she is loaded)', 5);
      this.restartPage(restartIn(CONFIG.career.boat));
    }
  }

  /** The career's own boat's design code: her refit (CareerState.design), else the beginner boat's. */
  private ownBoatCode(): string | null {
    return this.world.career?.design ?? savedCareer()?.design ?? designCodeOf(CONFIG.career.boat);
  }

  /**
   * Office > Your boats in the career (the free career boats, review Oct 2026): at a boatyard,
   * buying her (the difference in price from your own boat, as a refit), else a sea trial.
   * Null: as before (Voyage, crew).
   */
  private takeOffer(code: string): { buy: boolean; cost: number | null; blocked: string | null } | null {
    if (MODE !== 'career' || this.client) return null;
    if (!yardAt(this.world)) return { buy: false, cost: null, blocked: null };
    const own = this.ownBoatCode();
    const cost = own ? refitCost(own, code) : null;
    const money = this.world.career?.money ?? 0;
    return { buy: true, cost, blocked: cost === null ? "the yard can't price her" : cost > money ? 'Not enough money' : null };
  }

  /**
   * The lost host hasn't come back: host their game on from the last snapshot under the same
   * code (the world is ours since toSolo; the crew rejoin by their retries). The career in it
   * is theirs: it carries on but is never saved into our slots.
   */
  private takeOver(code: string, waits = 3): void {
    if (this.host || this.hostStarting || this.restarting) return;
    if (this.client?.status === 'connected' || this.inSharedGame) return; // the host came back
    // A join under way (the host may just have come back): let it finish first (multiplayer study #10).
    if (this.client?.status === 'connecting' && waits > 0) {
      this.later(() => this.takeOver(code, waits - 1), CONFIG.net.togetherConnectS);
      return;
    }
    if (this.client) {
      const c = this.client;
      this.client = null;
      c.close();
      this.toSolo();
    }
    this.togetherTries = 0;
    this.joinCode = code;
    this.borrowedCareer = true;
    this.overlay.notify(`The host hasn't come back: you're hosting the game on, code ${code}. The crew rejoin by themselves. (Their career plays on but isn't saved here.)`, 8);
    this.hostGame(code);
  }
  /** In a game whose code is on the address (joined and welcomed): a lost host is waited for. */
  private inSharedGame = false;

  /**
   * A crew-mate's check on the host's welcome: is their page the same version as ours? A
   * browser can keep an old copy of the game for a few minutes after a new one goes up. If
   * not, reload this page past the cache, once; if still not, say so (it's the host who's old).
   * Returns false if we're leaving for that.
   */
  private sameVersionAsHost(world: WorldState): boolean {
    const theirs = world.build?.app;
    if (!theirs || theirs === APP_BUILD || theirs === 'dev' || APP_BUILD === 'dev') return true;
    if (isNewerBuild(APP_BUILD, theirs)) {
      // The host's page is the older one: reloading ours can't help. Its page updates itself
      // when it sees ours (onOtherBuild) and hosts the same code again: wait and join it then.
      const code = this.joinCode;
      this.netMessage = 'The host\'s game is an older version: it is updating itself, joining again in a moment...';
      this.overlay.notify(this.netMessage, 6);
      this.leaveGame();
      this.joinCode = code;
      showGameOnAddress(code);
      this.togetherTries = CONFIG.net.togetherTries;
      this.later(() => this.joinGame(), CONFIG.net.olderHostRetryS);
      return false;
    }
    if (START_FRESH) {
      this.netMessage = `The host's game is another version (${theirs}; yours ${APP_BUILD}): the host reloads the page`;
      this.leaveGame();
      return false;
    }
    const url = new URL(location.href);
    url.searchParams.set('join', this.joinCode);
    url.searchParams.set('fresh', '1');
    url.searchParams.set('t', String(Date.now()));
    this.reloadToJoin(url, "This page is an older version than the host's: updating it, then joining");
    return false;
  }

  /**
   * A crew-mate's first check on the host's welcome (multiplayer study #6): is the host in the
   * same game (career or Voyage) and, in Voyage, on the same map? If not, this page goes to
   * theirs with the code, and joins from there. Returns false if we're leaving for that.
   */
  private samePageAsHost(world: WorldState): boolean {
    const mode = world.build?.mode ?? (world.build?.map ? 'voyage' : 'career');
    const map = mode === 'voyage' ? (world.build?.map ?? 'oban') : null;
    // The host on another address (study #30: the live game and /next/ can't play together,
    // and reloading couldn't fix it): to theirs.
    const site = world.build?.site && world.build.site !== SITE ? world.build.site : null;
    if (mode === MODE && map === VOYAGE_MAP_ID && !site) return true;
    const url = new URL((site ?? SITE) + (mode === 'voyage' ? 'voyage.html' : 'career.html'), location.origin);
    if (map) url.searchParams.set('map', map);
    url.searchParams.set('join', this.joinCode);
    const where = site ? `playing at ${location.origin}${site}` : map ? `in Voyage: ${voyageMap(map)?.name ?? map}` : 'in their career';
    this.reloadToJoin(url, `The host is ${where}: loading it and joining`);
    return false;
  }

  /**
   * Leave for `url` to join from there (another map, mode or version), saying so first
   * (multiplayer study #22: the page went without a word, and VR with it), our own page kept
   * for Leave game.
   */
  private reloadToJoin(url: URL, why: string): void {
    rememberOwnPage();
    this.netMessage = `${why}...`;
    this.overlay.notify(`${why} (in VR: enter VR again once it has loaded)`, 5);
    this.leaveGame();
    this.restarting = true; // nothing saved from here (savesHere), no more notices
    setTimeout(() => location.replace(url.toString()), CONFIG.net.reloadNoticeS * 1000);
  }

  /** Our boat's slipway state when last looked ('' off a slip): the notes as it changes. */
  private slipWas = '';

  /** A note as she lands on a slipway, is landed, and comes off. */
  private noteSlip(): void {
    const v = this.world.vessels[this.testVesselId];
    const now = v?.slip ? `${v.slip.phase}:${v.slip.id}` : '';
    if (now === this.slipWas) return;
    const was = this.slipWas;
    this.slipWas = now;
    const slip = slipOf(v);
    if (beached(v)) this.overlay.notify('Beached: walk off down the ramp. Go astern to come off', 5);
    else if (slip && v!.slip!.phase === 'landing') this.overlay.notify(`Landing on the ${slip.name}`, 3);
    else if (slip) this.overlay.notify(`Landed on the ${slip.name}: walk off down the ramp. Go astern to come off`, 5);
    else if (was) this.overlay.notify(was.endsWith(':beach') ? 'Off the beach' : 'Off the slip', 2.5);
  }

  /** The equipment the career has not got (upgrade ids, comma-joined), or null if she isn't a boat the career kits out. */
  private wantedFit(): string | null {
    const c = this.world.career;
    return c && KIT_BOATS.includes(this.world.vessels[this.testVesselId]?.defId ?? '') ? equipmentWithout(c.upgrades).join(',') : null;
  }

  /**
   * The yard refits her (host / solo): when the career's equipment changes (bought at the
   * yard, a new career, another slot) and she's built otherwise, the page starts again with
   * her refitted (her views and controls are built once, from her recipe). The career is
   * saved first (it's saved as it changes).
   */
  private checkRefit(): void {
    if (this.refitAt) {
      if (performance.now() < this.refitAt) return;
      this.refitAt = 0;
      const url = new URL(location.href);
      url.searchParams.delete('fit');
      this.restartPage(url);
      return;
    }
    if (this.client || this.testVesselId !== this.startVesselId) return;
    const want = this.wantedFit();
    if (this.fitWanted === null || want === null) {
      this.fitWanted = want;
      return;
    }
    if (want === this.fitWanted) return;
    this.fitWanted = want;
    if (want === (this.builtAs.without ?? []).join(',')) return;
    this.overlay.notify('The yard fits her out: the game starts again with her new equipment', 4);
    this.refitAt = performance.now() + 2500;
  }

  /**
   * On the host's welcome (multi-boat M5): every boat of theirs gets a view here, and a view
   * we had for a vessel of theirs of another type (our start boat under the same id, when
   * the host is in a different boat) is rebuilt for theirs; the home wiring follows. Our body
   * stays where it is, unless it was aboard a boat that changed under it or stands far from
   * the host's boat: then it boards hers.
   */
  private adoptHostWorld(world: WorldState): void {
    this.worldBorrowed = true;
    const me = this.world.players[this.localPlayerId];
    const myVessel = me?.aboardVesselId;
    const rewire = this.replaceWorld(world, me);
    // Aboard the boat the host is on (her own, or one she's stepped aboard), else the game's
    // own: a page's own start boat has the same id as the host's, so it's always boarded anew.
    const hostPeer = this.joinCode.length === 5 ? peerIdForRoom(this.joinCode) : '';
    const host = Object.values(world.players).find((p) => p.peerId && p.peerId === hostPeer);
    const hostBoat = host?.aboardVesselId && playerBoats(world).some((v) => v.id === host.aboardVesselId) ? world.vessels[host.aboardVesselId] : undefined;
    // Back in a game where a boat of ours waited (the host put us aboard her: core/launch.ts): her.
    const waited = world.players[this.localPlayerId]?.aboardVesselId;
    const ours = waited && world.vessels[waited]?.owner === this.localPlayerId ? world.vessels[waited] : undefined;
    const target = ours ?? hostBoat ?? (world.homeVesselId ? world.vessels[world.homeVesselId] : undefined);
    if (me && target && (rewire || myVessel !== target.id || !myVessel)) {
      this.intents.push({ playerId: this.localPlayerId, targetId: this.localPlayerId, control: 'board', value: 1, ref: target.id });
    }
  }

  /** As the page goes while hosting: the world kept for this tab's reload (HOST_WORLD_KEY). */
  private keepHostWorld(): void {
    try {
      if (!this.host || (this.restarting && !this.restartKeepsWorld)) return sessionStorage.removeItem(HOST_WORLD_KEY);
      const kept: KeptHostWorld = { code: this.host.code, t: Date.now(), me: this.localPlayerId, borrowed: this.borrowedCareer, world: this.world };
      sessionStorage.setItem(HOST_WORLD_KEY, JSON.stringify(kept));
    } catch {
      // Too big, or no storage: the reload starts from the career's save, as before.
    }
  }

  /**
   * Hosting `code` again after this tab's reload: the world it had, if kept (keepHostWorld)
   * within CONFIG.net.hostWorldKeepS and in the same boat. The crew aren't in it (they come
   * back by their retries; their boats wait for them, core/launch.ts); we're where we were.
   */
  private restoreHostWorld(code: string): void {
    let kept: KeptHostWorld | null = null;
    try {
      kept = JSON.parse(sessionStorage.getItem(HOST_WORLD_KEY) ?? 'null') as KeptHostWorld | null;
      sessionStorage.removeItem(HOST_WORLD_KEY);
    } catch {
      return;
    }
    if (!kept || kept.code !== code || !(Date.now() - kept.t < CONFIG.net.hostWorldKeepS * 1000)) return;
    const w = kept.world;
    const was = w.players?.[kept.me];
    if (!was || w.homeVesselId !== this.world.homeVesselId || w.vessels[w.homeVesselId!]?.defId !== this.world.vessels[this.world.homeVesselId!]?.defId) return;
    // Ours under our new id: us, what we carried, the boat we'd launched.
    const id = this.localPlayerId;
    for (const c of Object.values(w.cargo)) if ('carriedBy' in c.at && c.at.carriedBy === kept.me) c.at = { carriedBy: id };
    for (const v of Object.values(w.vessels)) {
      if (v.owner === kept.me) v.owner = id;
      releaseHolds(v);
    }
    const me = { ...was, id };
    this.replaceWorld(w, me);
    this.world.players = { [id]: me };
    if (kept.borrowed) this.borrowedCareer = true;
    this.overlay.notify('Hosting again: the game as you left it, the crew coming back', 5);
  }

  /**
   * Another world on this page (the host's, or our own kept over a reload): its state in place
   * of ours (players: ours, `me`, with theirs), views rebuilt for vessels that changed type.
   * Returns whether our own boat was rebuilt (and so boarded anew).
   */
  private replaceWorld(world: WorldState, me: PlayerState | undefined): boolean {
    let rewire = false;
    for (const v of Object.values(world.vessels)) {
      const view = this.vesselViews.get(v.id);
      if (!view) continue;
      if (this.world.vessels[v.id]?.defId === v.defId) continue;
      this.dropVesselView(v.id);
      if (v.id === this.testVesselId) rewire = true;
    }
    takeWorld(this.world, world);
    this.world.players = { ...world.players, ...(me ? { [this.localPlayerId]: me } : {}) };
    this.syncVesselViews();
    if (rewire) {
      this.boats.get(this.testVesselId)?.setHome(true);
      this.interior?.showAll();
      this.interior = null;
      this.mountOnHomeBoat();
      this.wireHomeBoat();
    }
    return rewire;
  }

  /** A vessel's views taken out of the scene (she's gone, or she's being rebuilt as another type). */
  private dropVesselView(id: EntityId): void {
    const view = this.vesselViews.get(id);
    if (!view) return;
    view.root.removeFromParent();
    view.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.effects.get(id)?.dispose();
    const gone = this.boats.get(id);
    if (gone) this.interaction?.removeControls(gone.controls);
    this.interiors.delete(id);
    this.belowDecks.forget(id);
    for (const map of [this.vesselViews, this.hydroViews, this.walkAreas, this.effects, this.vesselRoots, this.hullPlans, this.boats] as Map<EntityId, unknown>[]) map.delete(id);
  }

  /** Stop hosting, or leave the game we joined; play on alone from where things are. */
  /** @param end the player chose to leave (Stop hosting, Leave game): as host, the crew are told the game's over. */
  private leaveGame(end = false): void {
    this.rehostCode = null;
    if (!this.restarting) {
      rememberHosting(null);
      showGameOnAddress(null);
      this.inSharedGame = false;
    }
    if (this.host) {
      this.host.close(end && !this.restarting);
      this.host = null;
    }
    this.hostTransport = null;
    if (this.client) {
      const c = this.client;
      this.client = null;
      c.close();
    }
    this.toSolo();
  }

  private toSolo(): void {
    this.client = null;
    this.netPeer = null;
    this.hostPeerId = '';
    this.voice?.close();
    this.voice = null;
    // The host's career is in our world now: it's not a refit of ours.
    this.fitWanted = null;
    for (const id of Object.keys(this.world.players)) {
      if (id === this.localPlayerId) continue;
      dropCarried(this.world, id);
      delete this.world.players[id];
    }
    // What we carried was ours under the host's id: it stays in our hands under our own.
    for (const c of carriedBy(this.world, this.localPlayerId)) c.at = { carriedBy: this.soloPlayerId };
    // And the boat we'd launched (multiplayer study #5): ours still, not one left waiting for us.
    for (const v of Object.values(this.world.vessels))
      if (v.owner === this.localPlayerId) {
        v.owner = this.soloPlayerId;
        delete v.ownerAwayAt;
      }
    // The local simulation carries on from the last snapshot. Nobody else is here now,
    // and our own holds were under the id the host gave us: start with free hands.
    for (const v of Object.values(this.world.vessels)) releaseHolds(v);
    this.movePlayer(this.soloPlayerId);
  }

  /** Re-key the local player's state under a new id (the rig keeps following it). */
  private movePlayer(id: EntityId): void {
    if (id === this.localPlayerId) return;
    const me = this.world.players[this.localPlayerId];
    delete this.world.players[this.localPlayerId];
    this.world.players[id] = { ...me, id };
    this.localPlayerId = id;
  }

  private netStatus(): string {
    if (this.netMessage) return this.netMessage;
    if (this.host) {
      const n = this.host.playerCount;
      // (The game finder's link down: crew aboard play on, new crew can't find the game.)
      const finder = this.hostTransport?.finder;
      if (finder === 'reconnecting') return `Hosting, code ${this.host.code}: ${n} aboard · reconnecting (new crew can't join yet)`;
      if (finder === 'taken') return `Hosting, code ${this.host.code}: ${n} aboard · another page took the code: new crew can't join (host a new game)`;
      return `Hosting, code ${this.host.code}: ${n} aboard`;
    }
    if (this.client) {
      if (this.client.status === 'connected') return `In game ${this.joinCode}`;
      // How far it's got (study #8): which step a join that hangs is stuck on.
      const stage = this.joinTransport?.stage;
      return `Joining ${this.joinCode}: ${stage === 'loading' ? 'linked, the world is coming' : stage === 'linking' ? 'looking for the host' : 'reaching the game finder'}...`;
    }
    return 'Playing alone';
  }

  private setCoupling(value: number): void {
    // Keep full precision: the stick adds tiny amounts per frame (rounding here used to
    // swallow them, so holding X + stick did nothing). Round only for display.
    const c = Math.min(1, Math.max(0, value));
    this.decoupler.coupling = c;
    const xr = this.renderer.xr.isPresenting;
    this.overlay.notify(`${xr ? '' : 'Desktop '}Motion coupling ${Math.round(c * 100)} %  (100 = rigid to the deck)`, 2);
    if (xr) userSettings.motionCoupling = c;
    else userSettings.desktopCoupling = c;
    saveUserSettings();
  }

  private placePanelOnRig(): void {
    this.rig.root.add(this.overlay.vrPanel);
    this.overlay.vrPanel.position.set(-0.35, 1.15, -0.6);
    this.overlay.vrPanel.rotation.set(-0.35, 0.45, 0);
    this.overlay.vrPanel.scale.setScalar(1);
  }

  /**
   * The home boat's type. The app's bridge, wheelhouse interior and views are built for a
   * hull with a wheelhouse (6c makes them per boat); her machinery is her modules' (gearOf).
   */
  private get testDef(): WheelhouseDef {
    const def = VESSEL_DEFS[this.world.vessels[this.testVesselId].defId];
    if (!hasWheelhouse(def)) throw new Error(`the home boat (${def.id}) has no wheelhouse: the app's bridge needs one until 6c`);
    return def;
  }

  /** What the app feeds the home boat's modules, the interaction system (every boat's controls) and desktop mouse/reticle. */
  /**
   * What hangs on the home boat (multi-boat M2: done again when she changes): the towline's
   * lead from the winch drum over the stern roller; the trawl's warps from the A-frame's
   * blocks; the binoculars and the hand gear in her places (M7: gear she has no place for
   * isn't aboard); the rods upright in her rack, each in its own cup.
   */
  private mountOnHomeBoat(): void {
    const v = this.world.vessels[this.testVesselId];
    const root = this.vesselViews.get(this.testVesselId)?.root;
    if (!v || !root) return;
    this.towline.attachLead(root, v);
    this.trawlView.setBoat(v);
    const stowage = VESSEL_DEFS[v.defId].stowage;
    if (stowage?.binoculars) this.binoculars.stow(root, stowage.binoculars.at, stowage.binoculars.yawDeg);
    const rodRack = gearOf(v, 'rodRack');
    const upright = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)); // the rod's -z (its tip) up
    for (const g of this.gear) {
      if (g.kind === 'rod') {
        const at = rodRack?.rods[g.slot];
        if (at) g.mount(root, at, upright);
      } else if (stowage?.[g.kind]) g.mount(root, stowage[g.kind]!);
    }
    if (rodRack) this.rodView.attachBucket(root);
  }

  /**
   * Her bridge wired to the app (multi-boat M2: done again when the home boat changes): her
   * tender crane given the skiff it carries, her whiteboard, wind sock, searchlight, chart,
   * fire gauge, duty board and chart table.
   */
  private wireHomeBoat(): void {
    const v = this.world.vessels[this.testVesselId];
    const home = this.homeView;
    if (!v || !home) return;
    // Each crane given the tender it carries (two on a big boat: matched by where it stands).
    for (const tender of Object.values(this.world.vessels)) {
      if (tender.tender?.hostId !== v.id) continue;
      const own = craneOf(this.world, tender.tender)?.crane;
      const crane = home.apis<TenderCraneView>('deck.tender-crane').find((c) => own && c.crane.column[0] === own.column[0] && c.crane.column[1] === own.column[1]);
      if (!crane || this.cranes.includes(crane)) continue;
      crane.attach(tender.id, VESSEL_DEFS[tender.defId]);
      this.vesselViews.get(tender.id)?.root.add(crane.remote);
      this.cranes.push(crane);
      this.interaction?.addControls(crane.buttons);
    }
    this.board?.rayLine.removeFromParent();
    this.board = home.whiteboard;
    if (this.board) this.scene.add(this.board.rayLine);
    this.windSock = home.api<MastApi>('mount.mast')?.windSock ?? null;
    this.searchlight = home.api<SearchlightApi>('deck.searchlight');
    home.chart?.setLandSource((id) => this.worldView.terrainPositions(id));
    this.planPanel.setLandSource((id) => this.worldView.terrainPositions(id));
    this.chartBoard.setLandSource((id) => this.worldView.terrainPositions(id));
    this.fireGauge = home.api<FireMonitorApi>('deck.fire-monitor')?.gauge ?? null;
    this.dutyBoard = home.dutyBoard;
    // Voyage: no career, no duty board (world.voyage).
    if (MODE === 'voyage' && this.dutyBoard) this.dutyBoard.root.visible = false;
    this.chartTools?.root.removeFromParent();
    this.chartTools = null;
    this.chartTable = home.chartTable;
    if (this.chartTable) {
      this.chartTools = new ChartTools(this.chartTable);
      // On the leaf: the marks and tools fold with it.
      this.chartTable.leafFrame.add(this.chartTools.root);
    }
    this.wireBoatPads(home);
  }

  /**
   * Her planning charts (owner, 29 Oct 2026: "step 3"; voyage/chartPad.ts): the chart table's
   * PLAN sheet (the last in its rack) and the chartplotter's PLAN mode, each this page's own
   * view, worked by a hand's ray or the reticle (padFaces). Made again with her bridge.
   */
  private wireBoatPads(home: BoatView): void {
    this.padFaces.faces.splice(0, this.padFaces.faces.length, ...this.padFaces.faces.filter((f) => !this.boatPadFaces.includes(f)));
    this.boatPadFaces = [];
    this.leafPad = null;
    const c = CONFIG.voyage.plan.chart;
    const land = (id: string) => this.worldView.terrainPositions(id);
    const table = this.chartTable;
    if (table) {
      const pad = new ChartPad(this.planPadHost(), { px: c.leaf.px, aspect: table.planAspect, toolbarShare: c.leaf.toolbarShare, keys: ['way', 'stop', 'look', 'remove', 'undo', 'clear', 'boat', 'all', 'out', 'in', 'layers'], redrawS: c.leaf.redrawS });
      pad.setLandSource(land);
      table.setPlanChart(pad.texture);
      this.leafPad = pad;
      this.boatPadFaces.push({ mesh: table.chartFace, pad, reach: c.leaf.reach, on: () => table.planning && table.isOpen });
    }
    if (home.chart) this.boatPadFaces.push(home.chart.setPlanHost(this.planPadHost(), land));
    this.padFaces.faces.push(...this.boatPadFaces);
  }
  /** The planning charts on her (wireBoatPads), and the chart table's. */
  private boatPadFaces: PadFace[] = [];
  private leafPad: ChartPad | null = null;

  /** A boat's name for the menu: a fleet boat's, a Shipyard design's, or her type. */
  private boatLabel(defId: string): string {
    const fleet = FLEET.find((f) => f.id === defId);
    if (fleet) return `The ${fleet.name.toLowerCase()}`;
    if (!isBoatType(defId)) return defId;
    const token = boatTokenOf(defId) ?? '';
    const fav = this.shipyardCodes.favourites().find((f) => sameDesign(f.code, token));
    const read = readDesign(token);
    return fav ? fav.name : 'design' in read && read.name ? read.name : `Shipyard boat ${groupCode(token)}`;
  }

  /** What Boat > Save her last did, shown on its row a few seconds. */
  private boatSaved: { text: string; until: number } | null = null;

  /** The boat you're aboard (to save her as a favourite), or null ashore. */
  private boatAboard(): VesselState | null {
    const id = this.world.players[this.localPlayerId]?.aboardVesselId;
    return (id && this.world.vessels[id]) || null;
  }

  /**
   * Her name as a favourite: the fleet boat's own, a Shipyard design's (or the favourite she
   * already is), else whose she is: "Bosun's boat".
   */
  private boatFavName(v: VesselState): string {
    const fleet = FLEET.find((f) => f.id === v.defId);
    if (fleet) return fleet.name;
    const label = this.boatLabel(v.defId);
    if (!label.startsWith('Shipyard boat')) return label;
    return v.owner && v.owner !== this.localPlayerId ? `${this.world.players[v.owner]?.name ?? 'A crew-mate'}'s boat` : label;
  }

  /** Where the listener was last frame (for its speed: the Doppler shift of boats going by). */
  private readonly lastEar = new THREE.Vector3(NaN, 0, 0);
  private readonly heardBoats: HeardBoat[] = [];

  /**
   * The other players' boats heard where they are (audio/boatVoices.ts): every player's boat
   * but the one you're on, drawn where she's drawn, with her engine's state and her horn.
   */
  private updateBoatVoices(dt: number): void {
    const list = this.heardBoats;
    list.length = 0;
    for (const v of playerBoats(this.world)) {
      if (v.id === this.testVesselId) continue;
      const root = this.vesselRoots.get(v.id);
      if (!root) continue;
      const at = root.getWorldPosition(this.tmpV);
      const diesel = gearOf(v, 'diesel');
      list.push({
        id: v.id,
        x: at.x,
        y: at.y + 1,
        z: at.z,
        vx: v.linearVelocity[0],
        vz: v.linearVelocity[2],
        voice: diesel?.voice ?? 'inlineSix',
        ratedRpm: diesel?.engine.ratedRpm ?? 1800,
        twin: !!diesel?.twin,
        // One voice for her (the Quest's audio thread): a twin worked separately is heard by
        // whichever engine is working harder, and starting while either cranks.
        rpm: Math.max(v.engine.rpm, v.engine.stbd?.rpm ?? 0),
        load: Math.max(v.engine.rack, v.engine.stbd?.rack ?? 0),
        running: v.engine.phase === 'running' || v.engine.stbd?.phase === 'running',
        cranking: v.engine.phase === 'cranking' || v.engine.stbd?.phase === 'cranking',
        horn: v.controls.horn > 0 && isPowered(v),
      });
    }
    const ear = this.focus;
    const moved = Number.isNaN(this.lastEar.x) || dt <= 0 ? null : { vx: (ear.x - this.lastEar.x) / dt, vz: (ear.z - this.lastEar.z) / dt };
    this.lastEar.copy(ear);
    // A jump (a teleport, boarding another boat) isn't a speed: heard as standing still.
    const fast = moved && Math.hypot(moved.vx, moved.vz) > 40;
    this.sound.boats.update(list, { x: ear.x, y: ear.y, z: ear.z, vx: fast || !moved ? 0 : moved.vx, vz: fast || !moved ? 0 : moved.vz });
  }

  /** The other boats' interior detail (multi-boat M4), by vessel id. */
  private readonly interiors = new Map<EntityId, InteriorDetail>();

  /** The crew's boats the lookout has called (multi-boat M5). */
  private readonly boatsCalled = new Set<EntityId>();

  /** The boat you asked for last time, as remembered on this device (multi-boat M5). */
  private lastBoatRef(): string | null {
    try {
      return localStorage.getItem(LAST_BOAT_KEY);
    } catch {
      return null;
    }
  }

  /** The boat you launched last (multi-boat M3), so a new one is boarded once. */
  private ownedSeen: EntityId | null = null;
  /** When you last asked for a boat (ms): nothing come in CONFIG.spawn.launchWaitS, you're told. */
  private launchAskedAt = 0;

  /**
   * Your own boat (multi-boat M3): when the host puts her in the world, board her (your body
   * is your page's). A boat gone from under you (handed back, her player gone): back aboard
   * the host's boat, and the home boat the host's again.
   */
  private followOwnBoat(): void {
    const me = this.world.players[this.localPlayerId];
    if (!me) return;
    const mine = ownedBoat(this.world, this.localPlayerId);
    if (this.launchAskedAt && mine && mine.id !== this.ownedSeen) this.launchAskedAt = 0;
    if (this.launchAskedAt && performance.now() - this.launchAskedAt > CONFIG.spawn.launchWaitS * 1000) {
      this.launchAskedAt = 0;
      this.overlay.notify(this.client && this.client.status !== 'connected' ? 'Not in the game: the host never got the request' : 'No room for her: no berth her length fits, and nowhere to anchor off', 5);
    }
    if (mine && mine.id !== this.ownedSeen) {
      this.ownedSeen = mine.id;
      // Back from a reload or a dropped link: she waited, and the host put us aboard her.
      if (me.aboardVesselId === mine.id && this.client) this.overlay.notify(`${this.boatLabel(mine.defId)} waited for you: you're back aboard`, 4);
      else if (me.aboardVesselId !== mine.id && this.boats.has(mine.id)) {
        this.intents.push({ playerId: this.localPlayerId, targetId: this.localPlayerId, control: 'board', value: 1, ref: mine.id });
        this.overlay.notify(`${this.boatLabel(mine.defId)} is yours: ${mine.mooring.phase === 'moored' ? 'moored at the quay' : 'at anchor off the harbour'}`, 4);
      }
    } else if (!mine) this.ownedSeen = null;
    const home = this.world.homeVesselId;
    if (me.aboardVesselId && !this.world.vessels[me.aboardVesselId] && home && this.world.vessels[home]) {
      this.intents.push({ playerId: this.localPlayerId, targetId: this.localPlayerId, control: 'board', value: 1, ref: home });
    }
    if (!this.world.vessels[this.testVesselId] && home && this.world.vessels[home] && this.boats.has(home)) this.becomeAboard(home);
  }

  /**
   * Your boat is the one you're aboard (multi-boat M2): stepping onto another boat with a
   * wheelhouse (not a tow, not the skiff) makes her the home boat: her controls send plain
   * channels, the dash, sounds, gear and bridge wiring are hers, her interior detail is the
   * one managed. The boat you left keeps her view and her controls, routed to her.
   */
  private becomeAboard(id: EntityId): void {
    if (id === this.testVesselId) return;
    const v = this.world.vessels[id];
    const def = v && VESSEL_DEFS[v.defId];
    if (!def || !hasWheelhouse(def) || def.tow || !this.boats.has(id) || !this.vesselViews.has(id)) return;
    this.boats.get(this.testVesselId)?.setHome(false);
    this.boats.get(id)?.setHome(true);
    this.interior?.showAll();
    this.interior = this.interiors.get(id) ?? null;
    this.interiors.delete(id);
    this.testVesselId = id;
    this.mountOnHomeBoat();
    this.wireHomeBoat();
    this.fitWanted = this.wantedFit();
    this.slipWas = '';
    const fleet = FLEET.find((f) => f.id === v.defId);
    this.overlay.notify(`Aboard ${fleet ? `the ${fleet.name.toLowerCase()}` : 'her'}: she's your boat now`, 3);
  }

  private setupBridge(): void {
    const v = this.world.vessels[this.testVesselId];
    const view = this.vesselViews.get(this.testVesselId);
    if (!v || !view) return;
    // Her boat view (her modules, from her recipe) was built with her vessel view.
    const home = this.homeView;
    if (!home) throw new Error(`the home boat (${v.defId}) has no modules to work her by`);
    this.wireHomeBoat();
    this.restoreBatteries();
    try {
      // The career (money, reputation, upgrades, her condition) carries on from the last
      // session here, in the slot last used. A first career starts with the first voyage.
      if (!this.client) this.career.restore();
      if (!this.client) this.settleRefit();
      this.fitWanted = this.wantedFit();
      if (!this.client) this.marks = parseMarks(localStorage.getItem(CHART_KEY)) ?? this.marks;
      this.world.board ??= parseBoard(localStorage.getItem(BOARD_KEY)) ?? undefined;
      // Rescues completed in this browser so far (milestone 4).
      const n = Number(localStorage.getItem(RESCUES_KEY));
      if (Number.isFinite(n) && n > 0) (this.world.rescue ??= createRescueState()).completed = Math.floor(n);
    } catch {
      // No storage: an empty board, no count.
    }
    // Crew: the page closing or reloading says goodbye, so the host drops us now (HostSession).
    window.addEventListener('pagehide', () => this.client?.close());
    // Host: the world kept for this tab's reload (not when she's starting again in another boat).
    window.addEventListener('pagehide', () => this.keepHostWorld());
    // Host: a hidden page keeps the game going (onVisibility).
    document.addEventListener('visibilitychange', () => this.onVisibility());
    // Started again to build the host's boat: join their game again.
    if (START_JOIN) {
      this.joinCode = START_JOIN;
      setTimeout(() => this.joinGame(), 500);
    } else if (START_TOGETHER) {
      // Sent in from the Shipyard: join the one who pressed "Try her together".
      this.joinCode = START_TOGETHER;
      this.togetherTries = CONFIG.net.togetherTries;
      setTimeout(() => this.joinGame(), 500);
    } else if (START_HOST) {
      // Pressed "Try her together": host in the room the others were sent to (or this page
      // caught up with a newer build: its world back first).
      setTimeout(() => {
        this.restoreHostWorld(START_HOST);
        this.hostGame(START_HOST);
      }, 300);
    } else if (START_GAME) {
      // The address carries a game: this tab hosted it (reloaded), or a friend's link: join it.
      if (tabHosts(START_GAME))
        setTimeout(() => {
          this.restoreHostWorld(START_GAME);
          this.hostGame(START_GAME);
        }, 300);
      else {
        this.joinCode = START_GAME;
        // A link to a game: tried a few times (study #23: an old one waited minutes for nobody).
        this.togetherTries = CONFIG.net.linkTries;
        this.waitingOnLink = true;
        setTimeout(() => this.joinGame(), 500);
      }
    }
    this.interaction = new InteractionSystem(
      // Every boat's controls (the home boat's first), the crane's buttons, the gear brackets.
      // (Boats that come later, the tows, have none.)
      [...[...this.boats.values()].flatMap((b) => b.controls), ...this.cranes.flatMap((d) => d.buttons), ...this.gear.filter((g) => g.aboard).map((g) => g.bracket)],
      (channel, value) => {
        // A berth: lie down in it, or get up (yours, not the boat's: nothing goes to her).
        if (channel === 'berthRest' || channel.endsWith(':berthRest')) return this.toggleRest();
        // A TV: show one of your browser tabs on it, or stop yours.
        const tv = this.routeChannel(channel);
        if (tv.control.startsWith('tvCast.')) return this.pressTv(tv.vesselId, tv.control.slice('tvCast.'.length));
        // A deck crane's HOOK with a load that it won't set down here: say why (too high, no room).
        if (tv.control.endsWith('crane.hook') && value > 0) {
          const v = this.world.vessels[tv.vesselId];
          const note = v ? hookNote(this.world, v) : null;
          if (note) this.overlay.notify(note, 3);
        }
        if (channel === 'engineStartStop') return this.requestEngineStartStop();
        // Console modules send bus keys ('ignition.start'); older controls their old names.
        if ((channel === 'start' || channel === 'ignition.start' || channel === 'ignition.start2') && value > 0) this.startInGearHint();
        if (channel === 'dipstick' || channel === 'propulsion.oilCheck') this.readDipstick();
        if (tv.control === 'aziSync') this.overlay.notify(value > 0 ? 'Throttles synchronised: either lever sets both (click the stick in again to split them)' : 'Throttles split: each lever its own drive', 3);
        if (channel === 'cleat') this.cleatHint(value);
        if (channel === 'sos') return value > 0 ? this.sendSos() : undefined;
        // The dive A-frame's DIVE: into the submersible game (the app leaves the page; nothing to the boat).
        if (tv.control === 'diveLaunch') return value > 0 ? this.goDive(tv.vesselId) : undefined;
        // A gear bracket (desktop): take the gear or hang it back. Local: no intent. In VR the
        // grip takes it.
        if (channel.startsWith('gear:')) {
          const g = this.gear.find((x) => x.bracket.channel === channel);
          if (g && !this.renderer.xr.isPresenting) {
            for (const o of this.gear) if (o !== g && o.held) o.hangBack(); // one at a time
            if (!g.held && this.gearTakenByOther(g.kind, g.slot)) this.overlay.notify('A crew-mate has it', 2);
            g.toggleDesk(this.gearTakenByOther(g.kind, g.slot));
          }
          return;
        }
        // A midship cleat: the painter's on the skiff (aimed at her), whichever cleat leads it.
        if (channel === 'painterCleat' || channel.endsWith(':painter')) {
          // (Her own cleat's channel names her; a ship's cleat, whichever tender it means.)
          const own = channel.endsWith(':painter') ? this.world.vessels[channel.slice(0, -':painter'.length)] : undefined;
          const skiff = own?.tender ? own : this.painterTender(value);
          if (!skiff) return;
          this.painterHint(skiff, value);
          return this.pushIntentTo(skiff.id, 'painter', value);
        }
        if (value > 0) this.hydraulicsHint(channel);
        const { vesselId, control } = this.routeChannel(channel);
        this.pushIntentTo(vesselId, control, value);
      },
      (hand, i, ms) => this.xrInput.pulse(hand, i, ms),
      {
        lockedByOther: (c) => {
          const { vesselId, control } = this.routeControl(c);
          // A module's channel is its bus key, held in its key's group ('throttle.demand': 'lever').
          const who = this.world.vessels[vesselId]?.holds[holdGroup(control) ?? control];
          return !!who && who !== this.localPlayerId;
        },
        holdChanged: (c, held) => {
          const { vesselId, control } = this.routeControl(c);
          this.pushIntentTo(vesselId, 'hold', held ? 1 : 0, control);
        },
        holderName: (c) => {
          const { vesselId, control } = this.routeControl(c);
          const who = this.world.vessels[vesselId]?.holds[holdGroup(control) ?? control];
          return who ? (this.world.players[who]?.name ?? null) : null;
        },
      },
    );
    this.scene.add(this.interaction.rayLine('left'), this.interaction.rayLine('right'));
    this.pointer = new DesktopPointer(this.renderer.domElement, this.desktop, this.interaction, this.menu, this.desktopCargo());
    // The recording camera zooms on the mouse wheel.
    this.renderer.domElement.addEventListener(
      'wheel',
      (e) => {
        if (!this.camMode.on) return;
        this.camMode.zoom(Math.sign(e.deltaY));
        e.preventDefault();
      },
      { passive: false },
    );
    this.pointer.gearHeld = () => this.gear.some((g) => g.held === 'desk');
    // The reticle on a planning chart in the world works it (voyage/chartPad.ts); else, with
    // the chart table's leaf unfolded on a paper sheet, the pencil draws.
    this.pointer.chart = (ray, b) => {
      const pad = this.padFaces.updateDesktop(ray, b.down, b.wheel);
      if (pad.consumed) return pad;
      return this.chartTools && this.chartTable?.isOpen && !this.chartTable.planning ? this.chartTools.updateDesktop(this.chartCtx(), ray, b, this.frameDt) : { label: null, consumed: false };
    };
  }

  /**
   * Desktop: by the wheel, "F: take the helm" (or a controller's A): you stand at the helm,
   * facing forward, held there (no walking), and drive with the arrow keys or the controller
   * (player/gamepad.ts); the right stick looks round. F / A again, or stepping away (a jump,
   * boarding the skiff), leaves it. The wheel and lever can still be worked by mouse.
   */
  private updateHelmSeat(dt: number, cam: boolean): void {
    const inXR = this.renderer.xr.isPresenting;
    const pad: PadState | null = inXR ? null : this.pad.poll();
    const p = this.world.players[this.localPlayerId];
    const v = p?.aboardVesselId ? this.world.vessels[p.aboardVesselId] : undefined;
    const spot = v && VESSEL_DEFS[v.defId]?.boardingSpot;
    // (By the wheel and a crane's post both: the nearer takes F / A.)
    this.helmDist = spot ? Math.hypot(p.position[0] - spot[0], p.position[2] - spot[2]) : Infinity;
    // (Not from her engine room below it: BelowDecks.)
    const near = !!spot && !inXR && !cam && !this.belowDecks?.boatId && (p.mode ?? 'walk') === 'walk' && this.helmDist < CONFIG.gamepad.helmReach && !(this.craneNear && this.craneNearDist < this.helmDist);
    if (this.atHelm && !near) this.atHelm = false;
    const toggle = (this.keyboard.actionPressed('helm') && !this.interaction?.steering && !this.twinLeverKeys()) || !!pad?.pressed[PAD.a];
    if (toggle && near && v) {
      this.atHelm = !this.atHelm;
      this.helmCam.reset();
      if (this.atHelm) {
        // At the helm, facing forward (the same spot boarding puts you).
        this.intents.push({ playerId: this.localPlayerId, targetId: this.localPlayerId, control: 'board', value: 1, ref: v.id });
        this.desktop.setLook(0, -0.12);
      }
    }
    const ctl = !!pad?.connected;
    if (!this.atHelm && this.helmCam.view !== 'inside') this.helmCam.reset();
    if (pad && ctl) {
      // At the helm, Y cycles the camera view (player/helmCamera.ts); in the orbit view the
      // right stick swings the camera round her instead of looking.
      if (this.atHelm && pad.pressed[PAD.y]) {
        const view = this.helmCam.cycle();
        this.overlay.notify(view === 'inside' ? 'Camera: at the helm' : view === 'orbit' ? 'Camera: orbit · right stick swings it round · RT / LT zoom' : 'Camera: flyby (she passes it) · RT / LT zoom', 2.5);
      }
      const external = this.atHelm && this.helmCam.view !== 'inside';
      // The right stick looks round, anywhere; the left walks, off the helm.
      const r = CONFIG.gamepad.lookRate * dt;
      // (With the crane's remote the right stick works the crane: it looks only while LB is held.)
      // (At an azimuth helm the right stick is the starboard drive: it looks only while LB is held,
      // and a tap of LB on its own looks ahead again.)
      const azi = this.atHelm && !!v && !!gearOf(v, 'diesel')?.azimuth;
      const lookOk = (!this.craneRemote && !azi) || !!pad.down[PAD.lb];
      if (!external && lookOk) this.desktop.setLook(this.desktop.lookYaw - pad.rx * r, this.desktop.lookPitch - pad.ry * r);
      this.helmStick.x = external && (!azi || pad.down[PAD.lb]) ? pad.rx : 0;
      this.helmStick.y = external && (!azi || pad.down[PAD.lb]) ? pad.ry : 0;
      if (azi) {
        if (pad.pressed[PAD.lb]) this.lbLooked = false;
        if (pad.down[PAD.lb] && (pad.rx || pad.ry)) this.lbLooked = true;
        if (pad.released[PAD.lb] && !this.lbLooked) this.desktop.setLook(0, -0.12);
      }
      // Outside views: the triggers zoom (RT in, LT out) instead of being the mouse buttons.
      if (external) {
        if (pad.down[PAD.rt]) this.helmCam.zoomBy(1, dt);
        if (pad.down[PAD.lt]) this.helmCam.zoomBy(-1, dt);
      }
      // (Holding the crane's remote, its sticks work the crane: no walking.)
      const walk = !this.atHelm && !cam && !this.craneRemote;
      this.desktop.padMove.x = walk ? pad.lx : 0;
      this.desktop.padMove.z = walk ? pad.ly : 0;
      this.desktop.padMove.run = walk && !!pad.down[PAD.ls];
      // Its buttons as the keys and mouse buttons (player/gamepad.ts PAD_KEYS, PAD_MOUSE).
      const keys = this.atHelm || this.craneRemote ? PAD_KEYS_AT_HELM : PAD_KEYS;
      for (const [i, code] of Object.entries(keys)) {
        const b = Number(i);
        if (b === PAD.a && (near || this.craneNear)) continue; // by the wheel (a crane's post), A takes the helm (its remote) instead of jumping
        if (pad.pressed[b]) this.keyboard.inject(code!, true);
        if (pad.released[b]) this.keyboard.inject(code!, false);
      }
      for (const [i, button] of Object.entries(PAD_MOUSE)) {
        const b = Number(i);
        if (external && (b === PAD.rt || b === PAD.lt)) continue; // the triggers zoom the view
        if (pad.pressed[b]) this.pointer?.padButton(button!, true);
        if (pad.released[b]) this.pointer?.padButton(button!, false);
      }
      if (this.atHelm && v) this.padHelmSwitches(v, pad);
    } else {
      this.desktop.padMove.x = this.desktop.padMove.z = 0;
      this.desktop.padMove.run = false;
    }
    if (this.pointer) this.pointer.padAim = ctl;
    // An azimuth helm's dials, bottom corners: where each drive points, where its lever asks, its power.
    const azi = this.aziHelmBoat();
    this.aziDials.update(
      azi
        ? [
            { deg: ((azi.engine.azimuth ?? 0) * 180) / Math.PI, askDeg: azi.controls.aziAngle ?? 0, power: Math.max(0, azi.controls.lever), sync: !!azi.controls.aziSync },
            { deg: ((azi.engine.stbd?.azimuth ?? 0) * 180) / Math.PI, askDeg: azi.controls.aziAngle2 ?? 0, power: Math.max(0, azi.controls.lever2 ?? 0), sync: !!azi.controls.aziSync },
          ]
        : null,
    );
    this.helmPrompt.show(
      this.craneRemotePrompt
        ? this.craneRemotePrompt
        : this.atHelm && v && gearOf(v, 'diesel')?.azimuth
        ? ctl
          ? 'At the helm · left stick: port drive · right stick: starboard drive\npoint a stick the way to push, push it for power; let go: idle\nLB + right stick: look (tap LB: ahead) · RB: TRANSIT · B: both idle · Y: camera · A: leave'
          : 'At the helm · W S A D: port drive (power, twist) · ↑ ↓ ← →: starboard drive\nX: both idle · T: TRANSIT · Q / E: look over a shoulder, both or Tab: aft · F: leave'
        : this.atHelm
        ? ctl
          ? 'At the helm · left stick: steer · RB / LB: throttle · B: neutral · right stick: look · Y: camera view · A: leave\nD-pad: anchor up ↑ / down ↓, horn ←, wipers → · left stick click: searchlight · right stick click: laser · X: fire pump'
          : 'At the helm · ← →: steer · ↑ ↓: throttle · X: neutral · F: leave (or plug in a game controller)'
        : near
          ? ctl
            ? 'Press A (or F) to take the helm'
            : 'Press F to take the helm'
          : '',
    );
  }

  /**
   * Desktop and a game controller: the deck crane's radio remote (app/craneRemote.ts). By a
   * crane's post, F (or A) takes it off its hook; held, its sticks work the crane's two
   * joysticks (W A S D and the arrow keys, or the controller's sticks), Space (or A) HOOK, and
   * F (or B) hangs it back. Not in VR (there you work the joysticks by hand), at the helm, or
   * with the camera off you.
   */
  private updateCraneRemote(cam: boolean): void {
    const ia = this.interaction;
    const inXR = this.renderer.xr.isPresenting;
    const p = this.world.players[this.localPlayerId];
    const off = !ia || inXR || cam || this.atHelm || !p?.aboardVesselId || (p.mode ?? 'walk') !== 'walk';
    const drop = () => {
      if (this.craneRemote) ia?.remoteRelease();
      this.craneRemote = null;
    };
    if (off) {
      drop();
      this.craneNear = null;
      this.craneRemotePrompt = '';
      return;
    }
    // By a crane's post: within reach of its desk, where the remote hangs.
    const eye = this.camera.getWorldPosition(this.remoteEye);
    this.craneNear = null;
    this.craneNearDist = Infinity;
    for (const post of cranePosts(ia.controlIds)) {
      const c = ia.controlById(post.left);
      if (!c) continue;
      const at = c.root.getWorldPosition(this.remoteAt);
      const d = Math.hypot(at.x - eye.x, at.z - eye.z);
      if (d < REMOTE_REACH && d < this.craneNearDist) [this.craneNear, this.craneNearDist] = [post, d];
    }
    const pad = this.pad.state.connected ? this.pad.state : null;
    const k = this.keyboard;
    if (this.craneRemote) {
      if (k.wasPressed('KeyF') || pad?.pressed[PAD.b]) {
        drop();
        this.overlay.notify('Crane remote hung back on its post', 2);
      } else {
        const i = remoteInput((code) => k.isDown(code), pad);
        ia.remoteDrive(
          [
            { id: this.craneRemote.left, ...i.left },
            { id: this.craneRemote.right, ...i.right },
          ],
          [{ id: this.craneRemote.hook, down: i.hook }],
        );
      }
    } else if (this.craneNear && (k.actionPressed('helm') || pad?.pressed[PAD.a])) {
      this.craneRemote = this.craneNear;
    }
    this.craneRemotePrompt = this.craneRemote
      ? pad
        ? 'Crane remote · left stick: slew, boom up / down · right stick: telescope (sideways), hoist (pull back) / lower (push) · A: hook · LB + right stick: look · B: hang it back'
        : 'Crane remote · W A S D: slew, boom up / down · ← →: telescope in / out · ↑ ↓: hoist / lower · Space: hook · F: hang it back'
      : this.craneNear
        ? pad
          ? 'Press A (or F) to take the crane remote'
          : 'Press F to take the crane remote'
        : '';
  }
  private readonly remoteEye = new THREE.Vector3();
  private readonly remoteAt = new THREE.Vector3();

  /** The right stick while an outside helm view is on (it swings the orbit camera). */
  private readonly helmStick = { x: 0, y: 0 };

  /**
   * The orbit or flyby view at the helm (player/helmCamera.ts): after everything is posed,
   * the camera is set to the view's world pose, in its parent's frame (the rig's), so the
   * desktop controller's own pose is simply overridden this frame. Inside: nothing.
   */
  private applyHelmCamera(dt: number, inXR: boolean): void {
    const hc = this.helmCam;
    if (hc.view === 'inside') return this.restoreHelmFov();
    const p = this.world.players[this.localPlayerId];
    const v = p?.aboardVesselId ? this.world.vessels[p.aboardVesselId] : undefined;
    const root = v && this.vesselRoots.get(v.id);
    if (!this.atHelm || inXR || this.camMode.on || !v || !root) {
      hc.reset();
      this.restoreHelmFov();
      return;
    }
    if (this.helmFovBase === null) this.helmFovBase = this.camera.fov;
    root.updateWorldMatrix(true, false);
    const boat = { pos: root.getWorldPosition(this.camW), quat: root.getWorldQuaternion(this.camQ), length: VESSEL_DEFS[v.defId].hull.params.length, vel: this.tmpV.fromArray(v.linearVelocity) };
    if (!hc.update(dt, this.helmStick, boat, this.helmPos, this.helmQuat)) return;
    const parent = this.camera.parent;
    if (!parent) return;
    parent.updateWorldMatrix(true, false);
    this.camera.position.copy(parent.worldToLocal(this.helmPos));
    this.camera.quaternion.copy(parent.getWorldQuaternion(this.camQ2).invert().multiply(this.helmQuat));
    this.camera.updateMatrixWorld(true);
    const fov = this.helmFovBase * (hc.view === 'flyby' ? hc.fovScale : 1);
    if (Math.abs(this.camera.fov - fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** The lens back as it was once an outside view ends. */
  private restoreHelmFov(): void {
    if (this.helmFovBase === null) return;
    this.camera.fov = this.helmFovBase;
    this.camera.updateProjectionMatrix();
    this.helmFovBase = null;
  }

  private helmFovBase: number | null = null;

  private readonly helmPos = new THREE.Vector3();
  private readonly helmQuat = new THREE.Quaternion();

  /**
   * At the helm, a game controller works her switches (owner's layout): the d-pad up heaves
   * the anchor up, down lets it go; right the wipers on / off; left the horn while held; the
   * left stick's click the searchlight; X the fire pump (the monitor's water). (B is
   * neutral, the right stick's click the laser.) The same switches as on her console,
   * by intent; a line says what.
   */
  private padHelmSwitches(v: VesselState, pad: PadState): void {
    const say = (text: string) => this.overlay.notify(text, 1.5);
    const id = v.id;
    const c = v.controls;
    if (pad.pressed[PAD.up] || pad.pressed[PAD.down]) {
      if (!gearOf(v, 'anchor')) say('No anchor aboard');
      else {
        const down = !!pad.pressed[PAD.down];
        this.pushIntentTo(id, 'anchor', down ? 1 : 0);
        say(down ? 'Anchor: letting go' : 'Anchor: heaving up');
      }
    }
    if (pad.pressed[PAD.right]) {
      this.pushIntentTo(id, 'wipers', c.wipers ? 0 : 1);
      say(c.wipers ? 'Wipers off' : 'Wipers on');
    }
    if (pad.pressed[PAD.left]) this.pushIntentTo(id, 'horn', 1);
    if (pad.released[PAD.left]) this.pushIntentTo(id, 'horn', 0);
    if (pad.pressed[PAD.ls]) {
      if (!gearOf(v, 'searchlight')) say('No searchlight aboard');
      else {
        this.pushIntentTo(id, 'spotlight', c.spotlight ? 0 : 1);
        say(c.spotlight ? 'Searchlight off' : 'Searchlight on');
      }
    }
    if (pad.pressed[PAD.x]) {
      if (!gearOf(v, 'fireMonitor')) say('No fire pump aboard');
      else {
        this.pushIntentTo(id, 'firePump', c.firePump ? 0 : 1);
        say(c.firePump ? 'Fire pump off' : 'Fire pump on');
      }
    }
  }

  /**
   * Become the recording camera, or yourself again (desktop only). The camera starts where
   * your eyes are, riding with the boat you're aboard (or put, ashore or as set); back as
   * yourself, you're aboard her at the helm.
   */
  private setCameraMode(on: boolean): void {
    const cm = this.camMode;
    if (on === cm.on || (on && this.renderer.xr.isPresenting)) return;
    const p = this.world.players[this.localPlayerId];
    if (on) {
      for (const g of this.gear) if (g.held) g.hangBack();
      this.laser.off();
      this.pointer?.hide();
      this.camera.getWorldPosition(this.camW);
      this.camera.getWorldQuaternion(this.camQ);
      this.camOldFov = this.camera.fov;
      this.scene.attach(this.camera);
      const frameId = cm.rideBoat ? (p.aboardVesselId ?? null) : null;
      cm.anchor(frameId, frameId ? (this.vesselRoots.get(frameId) ?? null) : null, this.camW, this.camQ);
      cm.snap();
      this.desktop.setLook(cm.yaw, cm.pitch);
      cm.on = true;
      this.overlay.notify('You are the camera. Fly: mouse, W A S D, Space / C, Shift faster; the wheel zooms. Options: Menu > Crew', 6);
    } else {
      cm.on = false;
      if (p.avatar) p.avatar.camera = false;
      document.body.classList.remove('camera-clean');
      this.rig.root.add(this.camera);
      this.camera.fov = this.camOldFov || CONFIG.render.fovDeg;
      this.camera.updateProjectionMatrix();
      this.desktop.resetPose();
      p.mode = 'walk';
      this.keepViewOnReparent = false;
      this.toggleBoardTo(true);
    }
  }

  /** "Rides with the boat" on or off: it keeps its place in the world, now in the new frame. */
  private setCameraRide(ride: boolean): void {
    const cm = this.camMode;
    cm.rideBoat = ride;
    if (!cm.on) return;
    const id = ride ? this.testVesselId : null;
    cm.anchor(id, id ? (this.vesselRoots.get(id) ?? null) : null, this.camera.getWorldPosition(this.camW), this.camera.getWorldQuaternion(this.camQ));
    this.desktop.setLook(cm.yaw, cm.pitch);
  }

  /** One frame as the recording camera: flown by us, or in a VR crew-mate's hand. */
  private updateCameraMode(dt: number): void {
    const cm = this.camMode;
    const p = this.world.players[this.localPlayerId];
    let frame = cm.frameId ? (this.vesselRoots.get(cm.frameId) ?? null) : null;
    if (cm.frameId && !frame) {
      // Her boat's gone (a rebuild, a different game): stay where it is.
      cm.anchor(null, null, this.camera.getWorldPosition(this.camW), this.camera.getWorldQuaternion(this.camQ));
      frame = null;
    }
    // Held: the lens on the holder's hand (their pose: the hand in their frame).
    const hold = this.world.cameraHolds?.[this.localPlayerId];
    const hp = hold && this.world.players[hold.by];
    const hand = hp?.avatar?.[hold!.hand];
    const hq = hp?.avatar?.[hold?.hand === 'left' ? 'leftQ' : 'rightQ'];
    let held: { pos: THREE.Vector3; quat: THREE.Quaternion } | null = null;
    if (hp && hand && hq) {
      const hf = (hp.aboardVesselId && this.vesselRoots.get(hp.aboardVesselId)) || this.scene;
      hf.updateMatrixWorld();
      const quat = hf.getWorldQuaternion(this.camQ).multiply(this.camQ2.set(hq[0], hq[1], hq[2], hq[3]));
      const pos = hf.localToWorld(this.camW.fromArray(hand)).add(this.camLens.fromArray(CONFIG.camera.lens).applyQuaternion(quat));
      // Tilted forward from the grip's axis (up out of the fist), so it looks where the hand points.
      quat.multiply(HOLD_TILT);
      // Rigid with the hand (owner: it moves exactly as the hand, angle and all): the lens
      // looks out along the hand; flipped, it's turned round in the hand to face the holder.
      if (hold!.back) quat.multiply(FLIPPED);
      held = { pos, quat };
      this.camHolderBoat = hp.aboardVesselId;
      // In their hand it rides with their boat (eased in her axes, so it doesn't trail).
      if (cm.frameId !== hp.aboardVesselId) {
        cm.frameId = hp.aboardVesselId;
        frame = hp.aboardVesselId ? (this.vesselRoots.get(hp.aboardVesselId) ?? null) : null;
      }
    }
    if (this.camWasHeld && !held) {
      // Let go: it stays right there, riding with their boat (or put).
      const id = cm.rideBoat ? this.camHolderBoat : null;
      cm.anchor(id, id ? (this.vesselRoots.get(id) ?? null) : null, this.camera.getWorldPosition(this.camW), this.camera.getWorldQuaternion(this.camQ));
      frame = id ? (this.vesselRoots.get(id) ?? null) : null;
      this.desktop.setLook(cm.yaw, cm.pitch);
    }
    this.camWasHeld = !!held;
    const k = this.keyboard;
    const move = {
      x: (k.action('right') ? 1 : 0) - (k.action('left') ? 1 : 0),
      y: (k.action('up') ? 1 : 0) - (k.action('down') ? 1 : 0),
      z: (k.action('forward') ? 1 : 0) - (k.action('back') ? 1 : 0),
      fast: k.action('fast'),
    };
    // Held, it's locked to the hand: the mouse follows along, so flying picks up from there.
    if (held) move.x = move.y = move.z = 0;
    cm.update(dt, frame, { yaw: this.desktop.lookYaw, pitch: this.desktop.lookPitch }, move, held, this.camera);
    if (held) this.desktop.setLook(cm.yaw, cm.pitch);
    // Our player rides where the camera does (others place the camera body from it).
    if (p.aboardVesselId !== cm.frameId) this.keepViewOnReparent = true;
    p.aboardVesselId = cm.frameId;
    p.position = [cm.pos.x, cm.pos.y, cm.pos.z];
    p.mode = 'walk';
    document.body.classList.toggle('camera-clean', cm.clean && !this.menu.isOpen);
    this.camera.getWorldPosition(this.focus);
    // The menu still works by mouse; nothing else in the world does.
    if (this.menu.isOpen) this.pointer?.update(this.camera);
    else this.pointer?.hide();
  }

  /** Our pose as the recording camera: the camera body's place and turn, no figure. */
  private sendCameraPose(dt: number, p: PlayerState): void {
    const cm = this.camMode;
    const frame = cm.frameId ? (this.vesselRoots.get(cm.frameId) ?? null) : null;
    cm.framePose(frame, this.camW, this.camQ);
    const r = (x: number) => Math.round(x * 1000) / 1000;
    const head: [number, number, number, number, number, number, number] = [r(this.camW.x), r(this.camW.y), r(this.camW.z), r(this.camQ.x), r(this.camQ.y), r(this.camQ.z), r(this.camQ.w)];
    const pose: PlayerPose = { name: userSettings.playerName, aboardVesselId: cm.frameId, position: [head[0], head[1], head[2]], yaw: 0, head, left: null, right: null, camera: true };
    if (this.host || this.client?.status !== 'connected') {
      p.name = pose.name;
      p.avatar = { head, left: null, right: null, camera: true };
      return;
    }
    this.poseTimer += dt;
    if (this.poseTimer < 1 / NET_RATE) return;
    this.poseTimer = 0;
    this.client!.sendPose(pose);
  }

  /**
   * VR: grip a crew-mate's recording camera to pick it up (it's in your hand, their view
   * following it); let go of the grip and it stays there. A hand holding one is busy.
   */
  private updateCameraGrab(): void {
    const holds = this.world.cameraHolds ?? {};
    const me = this.localPlayerId;
    for (const h of ['left', 'right'] as const) {
      const f = this.hands[h];
      const mine = this.camGrip[h];
      if (mine) {
        const hold = holds[mine.id];
        const ours = hold?.by === me && hold.hand === h;
        // Let go; or the host never gave it us (someone else had it), or it isn't a camera now.
        if (!f.gripDown || (!ours && (hold || this.world.time - mine.at > 1.5)) || !this.avatars.cameras.has(mine.id)) {
          if (ours) this.intents.push({ playerId: me, targetId: ENVIRONMENT_ID, control: 'cameraRelease', value: 1, ref: mine.id });
          this.camGrip[h] = null;
          continue;
        }
        this.busyHands[h] = true;
        // The trigger turns it round: filming you, or looking out ahead of your hand.
        if (ours && f.triggerPressed) {
          this.intents.push({ playerId: me, targetId: ENVIRONMENT_ID, control: 'cameraFlip', value: 1, ref: mine.id });
          this.xrInput.pulse(h, 0.4, 30);
        }
        continue;
      }
      if (!f.gripPressed || this.busyHands[h] || !f.tracked) continue;
      let best: string | null = null;
      let bestD: number = CONFIG.camera.grabRange;
      for (const [id, body] of this.avatars.cameras) {
        if (holds[id] || Object.values(this.camGrip).some((g) => g?.id === id)) continue;
        const d = body.getWorldPosition(this.camW).distanceTo(f.grip);
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
      if (!best) continue;
      this.intents.push({ playerId: me, targetId: ENVIRONMENT_ID, control: 'cameraGrab', value: h === 'right' ? 1 : 0, ref: best });
      this.camGrip[h] = { id: best, at: this.world.time };
      this.busyHands[h] = true;
      this.xrInput.pulse(h, 0.5, 40);
    }
  }

  /**
   * Struck by a propeller: the view red at once, fading to black; put back aboard our boat
   * (as if hauled out and patched up) while it's black; then the view clears.
   */
  /**
   * Our health this frame (player/health.ts): the cold in the water, a fire's flames and smoke
   * where our head is, a berth's rest; running out, we black out (the propeller's fade, then
   * aboard: updateStrike). Lying in a berth, we get up by ourselves once well by day.
   */
  private updateHealth(dt: number): void {
    const p = this.world.players[this.localPlayerId];
    if (!p) return;
    const was = this.health;
    const smoke = fireExposure(this.world, [this.headW.x, this.headW.y, this.headW.z]);
    this.health = stepHealth(this.health, { swimming: p.mode === 'swim', fire: smoke.fire, smoke: smoke.smoke, resting: this.resting }, dt);
    if (this.health < was) this.comfortOverlay.hurt(Math.min(1, (was - this.health) * 60));
    this.afterHarm(was, smoke.fire ? 'The fire' : smoke.smoke ? 'The smoke' : 'The cold');
    if (this.resting) {
      const now = this.world.environment.timeOfDay;
      if (wakeNow(this.health, this.restHurt, this.restClock, now)) this.getUp(this.restHurt ? 'Rested and well again: up you get.' : 'Morning: up you get.');
      this.restClock = now;
    }
    this.showHealth();
  }

  /** Something hurts us at a blow (a fall): `harm` off our health, a red flash, and why. */
  private hurt(harm: number, why: string): void {
    if (harm <= 0) return;
    const was = this.health;
    this.health = Math.max(0, this.health - harm);
    this.comfortOverlay.hurt(0.4 + harm * 2);
    this.xrInput.pulse('left', 0.8, 150);
    this.xrInput.pulse('right', 0.8, 150);
    if (this.health > 0) this.overlay.notify(`${why}: hurt (health ${Math.round(this.health * 100)} %).`, 3);
    this.afterHarm(was, why);
  }

  /** After harm: a warning past CONFIG.health.warnBelow; at nothing, black out (once). */
  private afterHarm(was: number, why: string): void {
    const c = CONFIG.health;
    if (this.health >= c.warnBelow) this.healthWarned = false;
    else if (!this.healthWarned && was >= c.warnBelow) {
      this.healthWarned = true;
      this.overlay.notify(`${why} is getting to you (health ${Math.round(this.health * 100)} %). Rest in a berth to recover.`, 5);
    }
    if (this.health <= 0 && was > 0 && this.strikeT < 0) {
      this.strikeT = 0;
      this.knockoutSays = `${why} was too much: you blacked out and came round aboard. Rest in a berth to recover.`;
    }
  }

  /** A berth pressed: lie down in it (not from the water), or get up again. */
  private toggleRest(): void {
    if (this.resting) return this.getUp('');
    const p = this.world.players[this.localPlayerId];
    if (!p || (p.mode ?? 'walk') !== 'walk' || this.strikeT >= 0) return;
    this.resting = true;
    this.restHurt = this.health < 1;
    this.restClock = this.world.environment.timeOfDay;
    this.comfortOverlay.rest(0.85);
    this.overlay.notify(`Resting in the berth (health ${Math.round(this.health * 100)} %). With everyone aboard in a berth you sleep and the hours pass. A step gets you up.`, 6);
  }

  /** Up out of the berth: the view comes back; `says`, if anything. */
  private getUp(says: string): void {
    if (!this.resting) return;
    this.resting = false;
    this.comfortOverlay.rest(0);
    if (says) this.overlay.notify(says, 4);
  }

  /** On the desktop, a small health readout while we're hurt (or resting). In VR the warnings, the red flash and the dimming say it. */
  private showHealth(): void {
    const show = this.health < 0.995 || this.resting;
    if (!show && !this.healthEl) return;
    if (!this.healthEl) {
      this.healthEl = document.createElement('div');
      Object.assign(this.healthEl.style, { position: 'fixed', right: '12px', bottom: '12px', padding: '4px 10px', borderRadius: '6px', background: 'rgba(0,0,0,0.55)', color: '#fff', font: '600 14px system-ui, sans-serif', pointerEvents: 'none', zIndex: '20' });
      document.body.appendChild(this.healthEl);
    }
    this.healthEl.hidden = !show;
    const pc = Math.round(this.health * 100);
    const text = `Health ${pc} %${this.resting ? ' · resting' : ''}`;
    if (this.healthEl.textContent !== text) this.healthEl.textContent = text;
    this.healthEl.style.color = this.health < CONFIG.health.warnBelow ? '#ff9a8a' : '#fff';
  }

  private updateStrike(dt: number): void {
    if (this.strikeT < 0) return;
    const c = CONFIG.rescue.propStrike;
    const was = this.strikeT;
    this.strikeT += dt;
    const t = this.strikeT;
    if (was < c.respawnAt && t >= c.respawnAt) {
      this.toggleBoardTo(true);
      // Blacked out (the health ran out): you come round aboard, weak.
      if (this.health <= 0) this.health = CONFIG.health.wakeHealth;
      this.overlay.notify(this.knockoutSays || 'Hauled out of the water and patched up. Neutral near swimmers!', 5);
      this.knockoutSays = '';
    }
    const red = t < c.blackAt ? 1 : Math.max(0, 1 - (t - c.blackAt) / (c.clearAt - c.blackAt));
    const black = t < c.blackAt ? t / c.blackAt : t < c.respawnAt + 0.4 ? 1 : Math.max(0, 1 - (t - c.respawnAt - 0.4) / (c.clearAt - c.respawnAt - 0.4));
    this.comfortOverlay.strike(red, black);
    if (t >= c.clearAt) {
      this.strikeT = -1;
      this.comfortOverlay.strike(0, 0);
    }
  }

  /**
   * VR hand gestures (player/handGesture.ts) from each hand's grip and stick, after the
   * controls have taken the hands they hold (busyHands); then your own hands drawn in them.
   */
  private updateGestures(inXR: boolean): void {
    if (!inXR) this.gestures.reset();
    else
      for (const h of ['left', 'right'] as const) {
        this.gestures.update(h, { grip: this.xrInput.isDown(h, XR_BUTTON.grip), stick: this.xrInput.hands[h].stick, busy: this.busyHands[h] });
      }
    const p = this.world.players[this.localPlayerId];
    this.ownHands.update(this.controllers, inXR, p?.look ?? lookFromId(this.localPlayerId), this.gestures.pose);
  }

  /** Feed hands (VR) or the reticle (desktop) to the bridge controls. */
  private updateInteraction(inXR: boolean): void {
    this.busyHands = { left: false, right: false };
    if (!this.interaction) return;
    if (inXR) {
      for (const h of ['left', 'right'] as const) {
        const f = this.hands[h];
        const grip = this.controllers.worldPosition(h, f.grip);
        f.tracked = !!grip && this.controllers.worldRay(h, f.ray);
        if (f.quat) this.controllers.worldQuaternion(h, f.quat);
        f.gripDown = this.xrInput.isDown(h, XR_BUTTON.grip);
        f.gripPressed = this.xrInput.wasPressed(h, XR_BUTTON.grip);
        f.triggerDown = this.xrInput.isDown(h, XR_BUTTON.trigger);
        f.triggerPressed = this.xrInput.wasPressed(h, XR_BUTTON.trigger);
        f.trigger = this.xrInput.hands[h].values[XR_BUTTON.trigger] ?? (f.triggerDown ? 1 : 0);
        f.stick = this.xrInput.hands[h].stick;
        f.stickPressed = this.xrInput.wasPressed(h, XR_BUTTON.stick);
      }
      // The menu gets the right hand first; while it's on the menu its trigger is the menu's.
      if (this.menu.updateXR(this.hands.right, (i, ms) => this.xrInput.pulse('right', i, ms))) {
        this.hands.right.triggerDown = false;
        this.hands.right.triggerPressed = false;
        this.hands.right.trigger = 0;
      }
      // The note keyboard, while open, the same.
      if (this.noteKeys.isOpen && this.noteKeys.menu.updateXR(this.hands.right, (i, ms) => this.xrInput.pulse('right', i, ms))) {
        this.hands.right.triggerDown = false;
        this.hands.right.triggerPressed = false;
        this.hands.right.trigger = 0;
      }
      // The boatyard's board, the same way.
      if (this.boardMenus().some((m) => m.updateXR(this.hands.right, (i, ms) => this.xrInput.pulse('right', i, ms)))) {
        this.hands.right.triggerDown = false;
        this.hands.right.triggerPressed = false;
        this.hands.right.trigger = 0;
      }
      // The chart board (voyage/planChart.ts): the left hand holds it, the right hand's pointer works it.
      const onBoard = this.chartBoard.updateXR(this.hands, this.camera.getWorldPosition(this.tmpV), this.frameDt, (h, i, ms) => this.xrInput.pulse(h, i, ms));
      // The planning charts on things (the quay table, the chart table's PLAN sheet, the plotter's
      // PLAN mode): a hand's ray on one works it with its trigger (and the right stick's forward
      // and back zoom); its grip and the left stick stay free (grab-walking, walking up to it).
      const onPads = this.padFaces.updateXR(this.hands, onBoard, this.frameDt, (h, i, ms) => this.xrInput.pulse(h, i, ms));
      for (const h of ['left', 'right'] as const) {
        if (!onPads[h]) continue;
        const f = this.hands[h];
        f.triggerDown = f.triggerPressed = false;
        f.trigger = 0;
        if (h === 'right' && f.stick) f.stick = [f.stick[0], 0];
      }
      for (const h of ['left', 'right'] as const) {
        if (!onBoard[h]) continue;
        const f = this.hands[h];
        f.gripDown = f.gripPressed = f.triggerDown = f.triggerPressed = false;
        f.trigger = 0;
        f.stick = [0, 0];
      }
      // Binoculars: a hand holding them gives its grip and trigger to them.
      const onBino = this.binoculars.updateXR(this.hands, this.busyHands, this.camera.getWorldPosition(this.tmpV), (h, i, ms) => this.xrInput.pulse(h, i, ms));
      for (const h of ['left', 'right'] as const) {
        if (!onBino[h]) continue;
        const f = this.hands[h];
        f.gripDown = f.gripPressed = f.triggerDown = f.triggerPressed = false;
        f.trigger = 0;
      }
      // Hand gear (extinguisher, torch): the same.
      for (const g of this.gear) {
        if (!g.aboard) continue;
        const used = g.updateXR(this.hands, this.busyHands, this.gearTakenByOther(g.kind, g.slot), (h, i, ms) => this.xrInput.pulse(h, i, ms));
        for (const h of ['left', 'right'] as const) {
          if (!used[h]) continue;
          const f = this.hands[h];
          f.gripDown = f.gripPressed = f.triggerDown = f.triggerPressed = false;
          f.trigger = 0;
          onBino[h] = true; // busy for the rest of the frame
        }
      }
      // The handheld VHF on your chest: the same (its trigger is the talk button).
      const onRadio = !userSettings.voiceChat ? this.radio.updateDesktop(false) : this.radio.updateXR(this.scene, this.hands, { left: onBino.left || this.busyHands.left, right: onBino.right || this.busyHands.right }, this.camera.getWorldPosition(this.tmpV), this.camera.getWorldQuaternion(this.attQ), (h, i, ms) => this.xrInput.pulse(h, i, ms));
      for (const h of ['left', 'right'] as const) {
        if (!onRadio[h]) continue;
        const f = this.hands[h];
        f.gripDown = f.gripPressed = f.triggerDown = f.triggerPressed = false;
        f.trigger = 0;
        onBino[h] = true; // busy for the rest of the frame
      }
      // The chart table's tools: a hand holding one gives its grip and trigger to the tool.
      const onTools = this.chartTools && this.chartTable?.isOpen && !this.chartTable.planning ? this.chartTools.updateXR(this.chartCtx(), this.hands, this.busyHands, this.frameDt) : { left: false, right: false };
      for (const h of ['left', 'right'] as const) {
        if (!onTools[h]) continue;
        const f = this.hands[h];
        f.gripDown = f.gripPressed = f.triggerDown = f.triggerPressed = false;
        f.trigger = 0;
      }
      this.busyHands = this.interaction.updateXR(this.hands);
      for (const h of ['left', 'right'] as const) if (onTools[h] || onBino[h] || onBoard[h]) this.busyHands[h] = true;
      this.cargoHands.updateXR(this.cargoCtx(), this.hands, this.busyHands);
      for (const h of ['left', 'right'] as const) if (this.cargoHands.busy(h)) this.busyHands[h] = true;
      this.rescueHands.updateXR(this.rescueCtx(), this.hands, this.busyHands, this.frameDt);
      for (const h of ['left', 'right'] as const) if (this.rescueHands.busy(h)) this.busyHands[h] = true;
      // The gangway mark: a free hand's trigger on it steps ashore or aboard.
      {
        const onGangway = this.gangway.updateXR(this.gangwayCtx(), this.hands, this.busyHands);
        for (const h of ['left', 'right'] as const) if (onGangway[h]) this.busyHands[h] = true;
      }
      // The roving fender: a free hand's trigger, pointed at the quayside.
      {
        const onFender = this.fenderHands.updateXR(this.fenderCtx(), this.hands, this.busyHands);
        for (const h of ['left', 'right'] as const) if (onFender[h]) this.busyHands[h] = true;
      }
      if (this.world.potting) {
        const onPots = this.potHands.updateXR(this.potCtx(), this.hands, this.busyHands, this.frameDt);
        for (const h of ['left', 'right'] as const) if (onPots[h] || this.potHands.busy(h)) this.busyHands[h] = true;
      }
      if (this.world.longline) {
        const onLine = this.longlineHands.updateXR(this.longlineCtx(), this.hands, this.busyHands, this.frameDt);
        for (const h of ['left', 'right'] as const) if (onLine[h] || this.longlineHands.busy(h)) this.busyHands[h] = true;
      }
      // The fuel pump's nozzle and buttons.
      const onFuel = this.fuelHands.updateXR(this.fuelCtx(), this.hands, this.busyHands, this.frameDt);
      for (const h of ['left', 'right'] as const) if (onFuel[h] || this.fuelHands.busy(h)) this.busyHands[h] = true;
      if (this.board && !this.noteKeys.isOpen) {
        const onBoard = this.board.updateXR(this.boardCtx(), this.hands, this.busyHands);
        for (const h of ['left', 'right'] as const) if (onBoard[h]) this.busyHands[h] = true;
      } else if (this.board) this.board.rayLine.visible = false;
      this.updateCameraGrab();
      this.pointer?.hide();
      return;
    }
    this.pointer?.update(this.camera);
    this.radio.updateDesktop(userSettings.voiceChat && this.keyboard.action('talk'));
    for (const g of this.gear) if (g.aboard) g.updateDesktop(this.camera, !!this.pointer?.gearDown, !!this.pointer?.gearPressed);
    if (this.keyboard.actionPressed('hangGear')) for (const g of this.gear) if (g.held) g.hangBack();
  }

  /**
   * The laser pointer (laserPointer.ts): while the right stick is held in (VR) or the middle
   * mouse button is held (desktop; the right one is the binoculars). Desktop: aimed from the eyes, drawn from a "hand" down
   * and to the right of them.
   */
  private updateLaser(dt: number): void {
    const inXR = this.renderer.xr.isPresenting;
    // (Not while the right hand holds a control that takes its stick: its click is the control's.)
    const on = inXR ? this.xrInput.isDown('right', XR_BUTTON.stick) && this.hands.right.tracked && !this.interaction?.holding('right')?.stickSteerable : !!this.pointer?.laserDown;
    if (!on) return this.laser.off();
    if (inXR) return this.laser.update(dt, this.hands.right.ray);
    const ray = this.laserRay;
    this.camera.getWorldPosition(ray.origin);
    this.camera.getWorldDirection(ray.direction);
    this.laser.update(dt, ray, this.tmpV.fromArray(CONFIG.laser.deskHand).applyMatrix4(this.camera.matrixWorld));
  }

  /** Desktop cargo: label under the reticle, and clicks (see DesktopPointer). */
  private desktopCargo() {
    // The rescue gear (ring, line, hook) comes first, then cargo.
    return {
      carrying: () => this.cargoHands.carrying || this.rescueHands.deskBusy || !!this.board?.deskDragging,
      label: (ray: THREE.Ray | null) => {
        // The boatyard's board: its buttons light up under the reticle.
        if (this.boardMenus().some((m) => m.updateDesktop(ray, false))) return 'boatyard\nclick a button';
        this.camera.getWorldPosition(this.headW);
        this.camera.getWorldDirection(this.headFwd);
        // The board first (the life ring hangs just behind it, outside the wall), unless
        // the mouse already holds rescue gear or cargo.
        const free = !this.cargoHands.carrying;
        const board = free && !this.rescueHands.deskBusy && this.board ? this.board.label(this.boardCtx(), ray) : null;
        // Pot work (the buoy on the hook, the line) before the rescue gear's own label.
        // The fuel nozzle (carried in front of us while held) and the pump's buttons.
        const fuel = free && !board && !this.rescueHands.deskBusy ? this.fuelHands.label(this.fuelCtx(), ray, this.frameDt) : null;
        const pots = (free && !board && !fuel && this.world.potting ? this.potHands.updateDesktop(this.potCtx(), ray, this.frameDt) : null) ?? (free && !board && !fuel && this.world.longline ? this.longlineHands.updateDesktop(this.longlineCtx(), ray, this.frameDt) : null);
        const gear = free && !board && !fuel ? this.rescueHands.updateDesktop(this.rescueCtx(), ray, this.headW, this.headFwd, this.frameDt) : null;
        const step = free && !board && !fuel && !pots && !gear ? this.gangway.updateDesktop(ray) : null;
        const fender = free && !board && !fuel && !pots && !gear && !step ? this.fenderHands.updateDesktop(this.fenderCtx(), ray) : null;
        return board ?? fuel ?? pots ?? gear ?? step ?? fender ?? this.cargoHands.updateDesktop(this.cargoCtx(), ray, this.headW, this.headFwd);
      },
      click: (ray: THREE.Ray | null) => {
        if (this.boardMenus().some((m) => m.updateDesktop(ray, true))) return true;
        this.camera.getWorldDirection(this.headFwd);
        if (!this.cargoHands.carrying && !this.rescueHands.deskBusy && this.board?.click(this.boardCtx(), ray)) return true;
        if (!this.cargoHands.carrying && !this.rescueHands.deskBusy && this.fuelHands.click(this.fuelCtx(), ray)) return true;
        if (!this.cargoHands.carrying && this.world.potting && this.potHands.desktopClick(this.potCtx(), ray)) return true;
        if (!this.cargoHands.carrying && this.world.longline && this.longlineHands.desktopClick(this.longlineCtx(), ray)) return true;
        if (!this.cargoHands.carrying && this.rescueHands.desktopClick(this.rescueCtx(), ray, this.headFwd)) return true;
        if (!this.cargoHands.carrying && this.gangway.desktopClick(this.gangwayCtx(), ray)) return true;
        if (!this.cargoHands.carrying && this.fenderHands.desktopClick(this.fenderCtx(), ray)) return true;
        return this.cargoHands.desktopClick(this.cargoCtx(), ray);
      },
    };
  }

  /**
   * The chart table: how much light falls on the chart (daylight, the cabin lamp, the chart
   * table lamp), its tools, and saving the pencil marks (host).
   */
  private updateChartTable(v: VesselState | undefined, dt: number): void {
    if (!this.chartTable || !v) return;
    const lamp = v.controls.chartLamp > 0 && isPowered(v, 'deckLights');
    // Daylight, the cabin lamp and its own lamp on the chart; dim and red at night (nightPaper.ts).
    const cabin = isPowered(v, 'deckLights') ? v.controls.cabinLight : 0;
    this.chartTable.setLight(paperColour({ ambient: this.environment.ambientIntensity, darkness: this.darkness, cabin, lamp }, this.paper), lamp);
    // From outside the wheelhouse the chart, bulb, tools and marks are too
    // small to matter (and mostly behind the aft wall): skip their draw calls.
    const wh = this.testDef.layout.wheelhouse;
    const boat = this.vesselViews.get(this.testVesselId)?.root;
    const l = boat ? boat.worldToLocal(this.tableRef.copy(this.focus)) : this.tableRef.set(0, wh.floorY, 0); // the wheelhouse's frame
    const near = Math.abs(l.x - houseX(wh)) < wh.halfWidth + 0.3 && l.z > wh.front - 0.3 && l.z < wh.aft + 0.6 && l.y > wh.floorY - 0.5;
    this.chartTable.setDetail(near);
    // (The planning chart out on the leaf: drawn while you're by it; the pencil and its marks put by.)
    if (this.chartTable.planning && near && this.chartTable.isOpen) this.leafPad?.update(dt);
    if (this.chartTools) this.chartTools.root.visible = near && !this.chartTable.planning;
    this.chartTools?.refresh(this.marks);
    // Tools a crewmate is holding aren't lying on our table.
    if (this.chartTools) {
      const held = new Set<string>();
      for (const p of Object.values(this.world.players)) if (p.id !== this.localPlayerId && p.avatar?.tool) held.add(p.avatar.tool.kind);
      this.chartTools.setRemoteHeld(held);
    }
    // Host / solo: keep the chart marks in this browser (at most once a second).
    this.marksSaveT += dt;
    if (this.savesHere() && this.marks.seq !== this.marksSaved && this.marksSaveT > 1) {
      this.marksSaved = this.marks.seq;
      this.marksSaveT = 0;
      try {
        localStorage.setItem(CHART_KEY, serializeMarks(this.marks));
      } catch {
        // Not saved.
      }
    }
  }

  /** A chart op from this player: apply it here and share it (host: to all; client: to the host). */
  private sendChartOp(op: ChartOp): void {
    applyChartOp(this.marks, op);
    if (this.host) this.host.broadcastChart(op);
    else if (this.client?.status === 'connected') this.client.sendChart(op);
  }

  /** The chart tools' view of the app. */
  private chartCtx(): ChartToolsContext {
    return {
      marks: this.marks,
      playerId: this.localPlayerId,
      send: (op) => this.sendChartOp(op),
      pulse: (h, i, ms) => this.xrInput.pulse(h, i, ms),
      notify: (text) => this.overlay.notify(text, 2.5),
      scratch: (p, r) => this.sound.paper.setScratch(p, r),
    };
  }

  /** The whiteboard's view of the app. */
  private boardCtx(): BoardContext {
    return {
      world: this.world,
      push: (control, ref, args) => this.pushBoardIntent(control, ref, args),
      pulse: (h, i, ms) => this.xrInput.pulse(h, i, ms),
      compose: (x, y) => {
        if (this.renderer.xr.isPresenting) {
          this.noteKeys.begin(x, y);
          this.noteKeys.menu.openInFront(this.rig.carrier, this.camera);
          return;
        }
        // Desktop: the browser's own text box (it releases the mouse; click to look again).
        const text = window.prompt('Note for the whiteboard:');
        if (text?.trim()) this.pushBoardIntent('noteAdd', text, [x, y, Math.floor(Math.random() * 4)]);
      },
    };
  }

  private pushBoardIntent(control: string, ref: string, args?: number[]): void {
    this.intents.push({ playerId: this.localPlayerId, targetId: ENVIRONMENT_ID, control, value: 1, ref, args });
  }

  /** The pot hands' view of the app (pots are worked from the workboat). */
  /** The fuel hands' view of the app. */
  private fuelCtx(): FuelHandsContext {
    return {
      world: this.world,
      playerId: this.localPlayerId,
      view: this.fuelView,
      roots: this.vesselRoots,
      push: (control, ref, args, targetId) => this.intents.push({ playerId: this.localPlayerId, targetId: targetId ?? this.localPlayerId, control, value: 1, ref, args }),
      notify: (text) => this.overlay.notify(text, 3),
      pulse: (h, i, ms) => this.xrInput.pulse(h, i, ms),
      // In front of the eyes, a little right and down (the camera looks along its -z).
      deskHand: (out) => {
        const [x, y, z] = CONFIG.fuelHose.desk.hand;
        return out.set(x, y, -z).applyMatrix4(this.camera.matrixWorld);
      },
    };
  }

  private longlineCtx(): LonglineHandsContext {
    return {
      world: this.world,
      playerId: this.localPlayerId,
      vesselId: this.testVesselId,
      vesselRoot: this.vesselRoots.get(this.testVesselId),
      waves: this.renderWaves,
      rescue: this.rescueHands,
      push: (control, ref, value, args) => this.intents.push({ playerId: this.localPlayerId, targetId: this.testVesselId, control, value, ref, args }),
      notify: (text, s) => this.overlay.notify(text, s ?? 2.5),
      pulse: (h, i, ms) => this.xrInput.pulse(h, i, ms),
      stowHook: () => this.rescueHands.stowHook(this.rescueCtx()),
    };
  }

  private potCtx(): PotHandsContext {
    return {
      world: this.world,
      playerId: this.localPlayerId,
      vesselId: this.testVesselId,
      vesselRoot: this.vesselRoots.get(this.testVesselId),
      waves: this.renderWaves,
      rescue: this.rescueHands,
      push: (control, ref, value, args) => this.intents.push({ playerId: this.localPlayerId, targetId: this.testVesselId, control, value, ref, args }),
      notify: (text) => this.overlay.notify(text, 2.5),
      pulse: (h, i, ms) => this.xrInput.pulse(h, i, ms),
      stowHook: () => this.rescueHands.stowHook(this.rescueCtx()),
    };
  }

  /** The rescue hands' view of the app. */
  /**
   * What stays drawn below decks (app/engineRoom/): our rig (the camera, hands, overlay), the
   * menus and their rays, the marks, the reticle and laser, gear in hand; and any crew-mate in
   * the room with us.
   */
  private keptBelow(): THREE.Object3D[] {
    const keep: THREE.Object3D[] = [this.rig.carrier, this.gangway.root, this.menu.root, this.menu.rayLine, this.noteKeys.menu.root, this.noteKeys.menu.rayLine, this.desktopHand.root, this.laser.beam.root, this.handGearView.root];
    if (this.interaction) keep.push(this.interaction.rayLine('left'), this.interaction.rayLine('right'));
    const id = this.belowDecks.boatId;
    const v = id ? this.world.vessels[id] : undefined;
    // Any crew-mate in the same space: below her deckhead in the engine room, on a deck of her crew area.
    const plan = v && this.belowDecks.space === 'engine' ? roomFor(v.defId) : null;
    const crew = v && this.belowDecks.space === 'crew' ? crewLayoutFor(v.defId) : null;
    for (const p of Object.values(this.world.players))
      if (p.id !== this.localPlayerId && p.aboardVesselId === id && ((plan && p.position[1] < plan.deckhead) || (crew && inCrewArea(crew, p.position)))) keep.push(...this.avatars.partsOf(p.id));
    return keep;
  }

  private gangwayCtx(): GangwayContext {
    return {
      world: this.world,
      playerId: this.localPlayerId,
      boatRoot: (id) => this.vesselRoots.get(id),
      board: (ref) => this.intents.push({ playerId: this.localPlayerId, targetId: this.localPlayerId, control: 'board', value: ref ? 1 : 0, ref }),
      notify: (text) => this.overlay.notify(text, 2.5),
      pulse: (h, i, ms) => this.xrInput.pulse(h, i, ms),
      room: (id) => {
        const v = this.world.vessels[id];
        return v ? roomFor(v.defId) : null;
      },
      below: () => this.belowDecks.boatId,
      goBelow: (id) => void this.belowDecks.goBelow(id),
      goUp: () => this.belowDecks.goUp(),
      crew: (id) => {
        const v = this.world.vessels[id];
        const c = v ? crewAreaFor(v.defId) : null;
        return c ? { door: c.door, floor: c.main.floor } : null;
      },
      space: () => this.belowDecks.space,
      goInside: (id) => void this.belowDecks.goInside(id),
    };
  }

  private fenderCtx(): FenderHandsContext {
    return {
      world: this.world,
      vesselId: this.testVesselId,
      vesselRoot: this.vesselRoots.get(this.testVesselId),
      hookInHand: this.rescueHands.hookInHand,
      push: (control, value, args) => this.intents.push({ playerId: this.localPlayerId, targetId: this.testVesselId, control, value, args }),
      notify: (text) => this.overlay.notify(text, 2.5),
      pulse: (h, i, ms) => this.xrInput.pulse(h, i, ms),
    };
  }

  private rescueCtx(): RescueHandsContext {
    return {
      world: this.world,
      playerId: this.localPlayerId,
      vesselId: this.testVesselId,
      vesselRoot: this.vesselRoots.get(this.testVesselId),
      waves: this.renderWaves,
      cargoHands: this.cargoHands,
      push: (control, ref, value, args) => this.intents.push({ playerId: this.localPlayerId, targetId: this.testVesselId, control, value, ref, args }),
      notify: (text) => this.overlay.notify(text, 2.5),
      pulse: (h, i, ms) => this.xrInput.pulse(h, i, ms),
    };
  }

  /** Other players' hands and facing (world), for the gear they hold. */
  private readonly avatarHands: AvatarHands = {
    hand: (id, out) => {
      const p = this.world.players[id];
      if (!p?.avatar) return null;
      const h = p.avatar.right ?? p.avatar.left;
      const frame = (p.aboardVesselId && this.vesselRoots.get(p.aboardVesselId)) || this.scene;
      if (h) return frame.localToWorld(out.fromArray(h));
      const [x, y, z] = p.avatar.head;
      return frame.localToWorld(out.set(x, y - 0.5, z));
    },
    facing: (id, out) => {
      const p = this.world.players[id];
      if (!p?.avatar) return null;
      const head = p.avatar.head;
      const frame = (p.aboardVesselId && this.vesselRoots.get(p.aboardVesselId)) || this.scene;
      const q = frame.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion(head[3], head[4], head[5], head[6]));
      out.set(0, 0, -1).applyQuaternion(q);
      out.y = 0;
      return out.lengthSq() > 1e-6 ? out.normalize() : null;
    },
  };

  /** The cheer when everyone's out of the water, and what survivors shout. */
  private updateRescueSounds(): void {
    const r = this.world.rescue;
    const now = { cheer: r?.cheer ?? 0, shout: r?.shout?.id ?? 0, ring: ringIn(this.world, this.testVesselId)?.state ?? 'stowed' };
    const was = this.rescueHeard;
    this.rescueHeard = now;
    if (!was) return;
    if (now.ring === 'water' && was.ring !== 'water') {
      this.overlay.notify(
        this.renderer.xr.isPresenting
          ? 'Ring in the water. Pull it in: grip the line at the starboard quarter (it lights up yellow when your hand is on it) and pull, hand over hand.'
          : 'Ring in the water. Click the line or its cleat at the starboard quarter to pull it in.',
        6,
      );
    }
    if (now.cheer > was.cheer) {
      this.sound.rescue.cheer();
      this.overlay.notify(r?.active?.phase === 'landed' ? 'Safely ashore. Rescue complete!' : 'Recovered! Everyone out of the water.', 4);
    }
    if (now.shout !== was.shout && r?.shout) {
      this.sound.rescue.shout(r.shout.text);
      this.overlay.notify(`"${r.shout.text}"`, 4);
    }
  }

  /**
   * Performance: the wheelhouse's small parts only when you're in or at it, and the skiff's
   * outboard and tiller (20 draw calls) not while she's under her tarpaulin in the cradle.
   */
  private updateDetail(): void {
    const root = this.vesselRoots.get(this.testVesselId);
    if (!root || !this.homeView) return;
    if (!this.interior) {
      this.interior = new InteriorDetail([this.homeView.root, root], root, this.testDef);
      if (CONFIG.debug.logDetail) console.info(`interior detail: ${this.interior.count} parts`);
    }
    // By where the eye is in her frame, not by whether the game counts you aboard her: in her
    // wheelhouse by any way (VR fly, a camera mode, stepping in from a quay) the parts show
    // (owner: the buttons and joystick vanished at the helm after a cargo run).
    const eye = root.worldToLocal(this.camera.getWorldPosition(this.detailV));
    this.interior.update(eye);
    // Every other boat with a wheelhouse the same way (multi-boat M4): her small parts only
    // with the eye in her house; far off, none of them are drawn.
    for (const [id, boat] of this.boats) {
      if (id === this.testVesselId) continue;
      const v = this.world.vessels[id];
      const r = this.vesselRoots.get(id);
      const def = v && VESSEL_DEFS[v.defId];
      if (!r || !def || !hasWheelhouse(def) || def.tow) continue;
      let detail = this.interiors.get(id);
      if (!detail) {
        detail = new InteriorDetail([boat.root, r], r, def);
        this.interiors.set(id, detail);
      }
      const far = Math.hypot(v.position[0] - this.focus.x, v.position[2] - this.focus.z) > CONFIG.lod.mid;
      detail.update(far ? null : r.worldToLocal(this.camera.getWorldPosition(this.detailV)));
    }
    for (const id of this.interiors.keys()) if (!this.boats.has(id)) this.interiors.delete(id);
    // The skiff's outboard and tiller, her painter cleat: under her tarpaulin in the cradle
    // (not drawn, not usable).
    // (Under her tarpaulin only if her crane has one: the dinghy's; the rescue boat sits uncovered.)
    for (const [id, boat] of this.boats) {
      if (id === this.testVesselId) continue;
      const t = this.world.vessels[id]?.tender;
      boat.setCovered(t?.phase === 'stowed' && ((t && craneOf(this.world, t)?.crane.cover) ?? true));
    }
  }

  /** Wind noise: the apparent wind where you are (minus your boat's way), muffled inside. */
  private updateWindSound(dt: number): void {
    const p = this.world.players[this.localPlayerId];
    const v = p?.aboardVesselId ? this.world.vessels[p.aboardVesselId] : undefined;
    // The wind where you are (a katabatic gust falling on you is in it: you hear it come).
    windVector(this.world.environment, this.windV, { x: this.focus.x, z: this.focus.z });
    const ax = this.windV.x - (v?.linearVelocity[0] ?? 0);
    const az = this.windV.z - (v?.linearVelocity[2] ?? 0);
    // In any of her houses (P2a): the sound inside, out of the weather.
    const inside = !!v && v.id === this.testVesselId && housesOf(this.testDef.layout).some((wh) => Math.abs(p.position[0] - houseX(wh)) < wh.halfWidth && p.position[2] > wh.front && p.position[2] < wh.aft && p.position[1] > houseFloorLow(wh) - 0.3);
    // In her crew area (app/engineRoom/crew/): inside, its weathertight door shut.
    const inCrew = this.belowDecks.space === 'crew';
    this.insideHouse = inside || inCrew;
    // How shut-in the wheelhouse is: the aft door decides.
    const home = this.homeView;
    if (home) {
      home.door?.tick(dt);
      home.sideDoor?.tick(dt);
      home.sideGate?.tick(dt);
      // Shut in only with both doors shut (the port side door, if she has one, too).
      this.closed = home.door?.shut && (home.sideDoor?.shut ?? true) ? 1 : 0;
    }
    if (inCrew) this.closed = 1;
    this.sound.wind.update(Math.hypot(ax, az), inside || inCrew, dt, this.closed);
    // A tidal race's roar: its strength where you are, or fading in from outside it.
    this.sound.race.update(raceRoarLevel(this.focus.x, this.focus.z), inside || inCrew, this.closed);
    // Surf on the shore near you (a look round every `CONFIG.surf.every` s, a few bearings a
    // frame); heard only with the engine of the boat you're aboard stopped (ashore, always).
    const surf = this.surf.step(this.focus.x, this.focus.z, this.world.environment.waves, this.renderWaves, dt);
    this.sound.surf.update(surf, v?.engine.phase === 'running', inside || inCrew, this.closed, this.focus);
  }

  /**
   * Rain (streaks, window drops and wipers, its sound), thunder after each lightning flash,
   * a new shipping forecast on the VHF, and the lookout's calls for things in the water.
   */
  private updateWeatherViews(time: number, darkness: number, dt: number): void {
    const env = this.world.environment;
    const w = env.weather;
    const rain = w?.now.rain ?? 0;
    const light = 1 - darkness * 0.85;
    const v = this.world.vessels[this.testVesselId];
    const view = this.vesselViews.get(this.testVesselId);
    // Rain streaks: none inside the wheelhouse box.
    let house: typeof this.rainHouse | null = null;
    if (view) {
      // Over all her houses (P2a: one box round them all).
      const hs = housesOf(this.testDef.layout);
      const ov = this.testDef.layout.roof.overhang;
      this.rainHouse.matrixWorld.copy(view.root.matrixWorld);
      this.rainHouse.min.set(Math.min(...hs.map((h) => houseX(h) - h.halfWidth)) - ov, Math.min(...hs.map((h) => h.floorY)) - 1.5, Math.min(...hs.map((h) => h.front)) - ov);
      this.rainHouse.max.set(Math.max(...hs.map((h) => houseX(h) + h.halfWidth)) + ov, Math.max(...hs.map((h) => h.roofY)) + 0.3, Math.max(...hs.map((h) => h.aft)) + ov);
      house = this.rainHouse;
    }
    windVector(env, this.windV);
    this.autoRainQuality(rain, dt);
    this.rain.update(rain, time, this.focus, this.windV, house, light);
    if (this.homeView?.rainGlass && v) this.homeView.rainGlass.update(rain, v.controls.wipers > 0 && isPowered(v, 'instruments'), light, dt);
    this.sound.wind.setRain(rain, this.insideHouse, this.closed);
    // Thunder: the flash is drawn by the environment view; the sound follows by distance.
    const L = w?.lightning;
    if (L) {
      if (this.lightningSeen >= 0 && L.seq !== this.lightningSeen) this.sound.wind.thunder(L.dist);
      this.lightningSeen = L.seq;
    }
    // A new forecast received: the VHF reads it out (only if it's on - it was received).
    const fc = this.world.forecast;
    const fseq = fc?.seq ?? 0;
    if (this.forecastSeen >= 0 && fseq !== this.forecastSeen && fc && v && isPowered(v, 'radio')) {
      this.sound.radio.message('info', `Shipping forecast. ${fc.text}`);
      this.overlay.notify(`VHF shipping forecast: ${fc.text}`, 10);
    }
    this.forecastSeen = fseq;
    this.lookout(v);
    this.updateTraffic(v, darkness, dt);
  }

  /**
   * In the headset on High: if the frame rate sags while it rains, drop the rain to Low for
   * this session (the menu setting is left alone) and say so once.
   */
  private autoRainQuality(rain: number, dt: number): void {
    if (!this.renderer.xr.isPresenting || this.rain.quality !== 'high' || rain < 0.2) {
      this.rainSlowT = this.rainFrames = this.rainFrameSum = 0;
      return;
    }
    this.rainSlowT += dt;
    this.rainFrames += 1;
    this.rainFrameSum += dt;
    if (this.rainSlowT < CONFIG.rain.autoLowSeconds) return;
    const avgMs = (this.rainFrameSum / this.rainFrames) * 1000;
    this.rainSlowT = this.rainFrames = this.rainFrameSum = 0;
    if (avgMs > CONFIG.rain.autoLowFrameMs) {
      this.rain.quality = 'low';
      this.overlay.notify('Rain effect lowered to keep the frame rate (Menu: Rain effect)', 4);
    }
  }

  /**
   * Batteries between sessions (host / solo, only with electrics.drainBetweenSessions):
   * their charge is saved when the page goes away, and on the next visit restored, less
   * what the master left on would have drawn meanwhile.
   */
  private restoreBatteries(): void {
    const v = this.world.vessels[this.testVesselId];
    // A session setting (with the battery config until the boat's settings move, 6d).
    const cfg = CONFIG.vessels.workboat.electrics;
    if (!v?.electrics || !cfg.drainBetweenSessions || this.client) return;
    try {
      const saved = JSON.parse(localStorage.getItem(BATTERY_KEY) ?? 'null') as { soc: [number, number]; master: number; t: number } | null;
      if (saved && Array.isArray(saved.soc) && saved.soc.length === 2) {
        const hours = Math.max(0, (Date.now() - saved.t) / 3.6e6);
        const drain = saved.master > 0 ? hours * cfg.drainPerHour : 0;
        v.electrics.soc = [Math.max(0, saved.soc[0] - drain), Math.max(0, saved.soc[1] - drain)].map((x) => Math.min(1, x)) as [number, number];
        v.electrics.master = saved.master > 0 ? 1 : 0;
        if (drain > 0.01) this.overlay.notify(`The master was left on: batteries down ${Math.round(drain * 100)} %`, 5);
      }
    } catch {
      // Nothing saved.
    }
    window.addEventListener('pagehide', () => {
      const e = this.world.vessels[this.testVesselId]?.electrics;
      if (!e || !this.savesHere()) return;
      try {
        localStorage.setItem(BATTERY_KEY, JSON.stringify({ soc: e.soc, master: e.master, t: Date.now() }));
      } catch {
        // Not saved.
      }
    });
  }

  /**
   * Voyage mode: back where you were on this map last time (app/voyagePlace.ts), unless the
   * address says `?start` (the map's start berth again, the place forgotten).
   */
  private restoreVoyagePlace(): void {
    if (MODE !== 'voyage' || !VOYAGE_MAP_ID) return;
    if (START_PARAMS.has('start')) {
      forgetPlace(VOYAGE_MAP_ID);
      return;
    }
    const place = savedPlace(VOYAGE_MAP_ID);
    const v = this.world.vessels[this.testVesselId];
    if (place && v) restorePlace(this.world, v, this.localPlayerId, place);
    window.addEventListener('pagehide', () => this.rememberVoyagePlace(Infinity));
  }

  /**
   * The plan saved for this map last time (alone or hosting: the crew get the host's; its
   * saved note isn't news: it's not shown again), the chart board, and in Voyage the quay's
   * planning chart and the Shipyard signs that go with the table (voyage/planTable.ts).
   */
  private setupPlanTable(): void {
    // The plan saved here last time (alone or hosting: the crew get the host's): a Voyage map's, or the career's.
    if (!this.client) {
      try {
        const saved = parsePlan(localStorage.getItem(planSaveKey()));
        if (saved) this.world.plan = saved;
      } catch {
        // Storage blocked: no saved plan.
      }
    }
    this.planSaved = this.world.plan?.seq ?? -1;
    this.scene.add(this.chartBoard.root);
    if (MODE !== 'voyage' || !VOYAGE_MAP_ID) return;
    // The quay's planning chart (the table's and the stand's), and the Shipyard signs beside
    // it, or at the spot ashore where neither fits (placed with the table: updatePlan).
    const t = CONFIG.voyage.plan.table;
    this.quayPad = new ChartPad(this.planPadHost(), { px: t.px, aspect: planFaceAspect(), toolbarShare: t.toolbarShare, keys: ['way', 'stop', 'look', 'remove', 'undo', 'clear', 'boat', 'all', 'out', 'in', 'layers'], redrawS: t.redrawS });
    this.quayPad.setLandSource((id) => this.worldView.terrainPositions(id));
    this.scene.add(this.planAnchor);
    this.shipyardDoor = ShipyardDoor.shipyard(this.menuHost());
    this.boatsBoard = ShipyardDoor.boats(this.menuHost());
    this.scene.add(this.shipyardDoor.menu.rayLine, this.boatsBoard.menu.rayLine);
  }

  /** What a planning chart (a pad) needs of the app: the world, your boat, the plan intent. */
  private planPadHost(): { world(): WorldState; ownBoatId(): string; send(ref: string, args?: number[]): void } {
    return { world: () => this.world, ownBoatId: () => this.drivenVesselId(), send: (ref, args) => this.sendPlan(ref, args) };
  }

  /**
   * The quay's table at a harbour (by its berth): the table where it fits, else the stand,
   * else neither (the Shipyard signs then stand by the spot ashore). Each harbour's spot is
   * looked for once (planTableSpot searches the quay) and kept.
   */
  private placePlanTable(berth: string): void {
    let spot = this.planSpots.get(berth);
    if (spot === undefined) {
      const table = planTableSpot(berth, planTableSize('table'));
      const stand = table ? null : planTableSpot(berth, planTableSize('stand'));
      spot = table ? { form: 'table', at: table } : stand ? { form: 'stand', at: stand } : null;
      this.planSpots.set(berth, spot);
    }
    for (const f of Object.values(this.planTables)) f.root.visible = false;
    this.planTable = null;
    if (spot && this.quayPad) {
      let pt = this.planTables[spot.form];
      if (!pt) {
        pt = this.planTables[spot.form] = new PlanTable(spot.form, spot.at, this.quayPad, () => !!this.planTable && this.focus.distanceTo(this.planTable.root.position) < CONFIG.voyage.plan.table.reach + 2);
        this.scene.add(pt.root);
        this.padFaces.faces.push(pt.face);
      }
      pt.moveTo(spot.at);
      pt.root.visible = true;
      this.planTable = pt;
      return;
    }
    // Neither fits: the signs by the spot ashore, facing in from the water as the table would.
    const b = berthWithId(berth);
    const q = quaySpot(berth);
    const ax = b?.shoreX ?? 0;
    const az = b?.shoreZ ?? 1;
    const back = CONFIG.voyage.plan.table.back;
    const x = q.x + ax * back;
    const z = q.z + az * back;
    this.planAnchor.position.set(x, landFloor(x, z) ?? landFloor(q.x, q.z) ?? 1.6, z);
    this.planAnchor.rotation.y = -Math.atan2(ax, -az);
    this.planAnchor.updateMatrixWorld(true);
  }

  /** A plan action to the host (the `plan` env intent): the planning chart's and board's. */
  private sendPlan(ref: string, args?: number[]): void {
    this.intents.push({ playerId: this.localPlayerId, targetId: ENVIRONMENT_ID, control: 'plan', value: 1, ref, ...(args ? { args } : {}) });
  }

  /**
   * Voyage mode, each frame: the planning table (only while you're near enough to see it),
   * a point reached told once, and the plan saved when it changes (alone or hosting).
   */
  private updatePlan(): void {
    const plan = this.world.plan;
    this.planPanel.update();
    if (this.renderer.xr.isPresenting === false && this.chartBoard.isOut) this.chartBoard.putAway();
    // The quay's table at the harbour you're at (looked for each second; it holds its harbour
    // until another is clearly nearer: tableBerthNear), its chart drawn while you're by it.
    if (this.quayPad) {
      this.planLookT -= this.frameDt;
      if (this.planLookT <= 0) {
        this.planLookT = 1;
        const berth = tableBerthNear(this.focus.x, this.focus.z, this.planTableBerth);
        if (berth && berth !== this.planTableBerth) {
          this.planTableBerth = berth;
          this.placePlanTable(berth);
        }
      }
      const anchor = this.planTable?.root ?? this.planAnchor;
      if (this.planTable && this.focus.distanceTo(this.planTable.root.position) < 60) this.quayPad.update(this.frameDt);
      if (this.planTableBerth) {
        const half = this.planTable?.halfWidth ?? 0.6;
        this.shipyardDoor?.update(anchor, half, this.focus);
        this.boatsBoard?.update(anchor, half, this.focus);
      }
    }
    if (plan?.note && plan.note.t !== this.planNoteT) {
      if (this.planNoteT >= 0 || plan.note.t > this.world.time - 5) this.overlay.notify(plan.note.text, 6);
      this.planNoteT = plan.note.t;
    }
    if (plan && this.savesHere() && plan.seq !== this.planSaved) {
      this.planSaved = plan.seq;
      try {
        localStorage.setItem(planSaveKey(), savePlanText(plan));
      } catch {
        // Not saved.
      }
    }
  }

  /** Voyage mode: remember where we are on this map, every few seconds and as the page closes (alone or hosting). */
  private rememberVoyagePlace(dt: number): void {
    if (MODE !== 'voyage' || !VOYAGE_MAP_ID || !this.savesHere()) return;
    this.rememberT += dt;
    if (this.rememberT < CONFIG.voyage.rememberEveryS) return;
    this.rememberT = 0;
    const v = this.world.vessels[this.testVesselId];
    if (v) rememberPlace(VOYAGE_MAP_ID, placeOf(this.world, v, this.localPlayerId));
    // The timber run's logs on the beach and barges (voyage/timber.ts). Not the money: Voyage's money is this session's only.
    try {
      localStorage.setItem(bargesKey(VOYAGE_MAP_ID), JSON.stringify(bargesToSave(this.world, this.testVesselId, headingOf)));
      localStorage.setItem(timberLogsKey(VOYAGE_MAP_ID), JSON.stringify(timberLogsToSave(this.world)));
    } catch {
      // Not saved.
    }
  }

  /**
   * Back from the submersible game (dive/diveReturn.ts; Submersible World's M9): its envelope
   * taken off the address at once (a refresh never replays it), counted once by the handoff id
   * issued at the launch. Career or Voyage.
   */
  private takeDiveBack(): DiveReturn | null {
    const { back, clean } = takeDiveReturn(location.href);
    if (clean) history.replaceState(history.state, '', clean);
    return consumeDiveReturn(back);
  }

  /** The dive's results aboard: the crates on deck, the pay, the sub afloat astern; saved as it is now. */
  private landDive(back: DiveReturn): void {
    const v = this.world.vessels[this.testVesselId];
    if (!v) return;
    const text = applyDiveReturn(this.world, v, back);
    // Once the app is up: the word to the skipper, and the game saved with the dive's results in it.
    setTimeout(() => {
      this.overlay.notify(text, 14);
      if (MODE === 'voyage') {
        this.rememberT = Infinity;
        this.rememberVoyagePlace(0);
      } else this.career.tick();
    }, 1500);
  }

  /**
   * Voyage: the handoff envelope (`mv`) taken off the address at once, so a refresh never
   * replays it (voyage/metaverse.ts), and checked: from the timber camp, with an id we issued
   * and haven't consumed. Anything else: nothing comes of it.
   */
  private takeHandoff(): Envelope | null {
    const { envelope, clean } = takeEnvelope(location.href);
    if (clean) history.replaceState(history.state, '', clean);
    return envelope ? consumeReturn(envelope) : null;
  }

  /**
   * Voyage: the timber run set up (voyage/timber.ts). The logs and barges saved for this map
   * back, and if we're back from the camp with logs, they're laid on the site's beach;
   * the bay's buoy and the merchant on the chart; the screen faded in if we came back.
   */
  private setupTimber(back: Envelope | null): void {
    if (MODE !== 'voyage' || !VOYAGE_MAP_ID || this.client) return;
    const f = this.fade.style;
    f.position = 'fixed';
    f.inset = '0';
    f.background = '#000';
    f.pointerEvents = 'none';
    f.transition = `opacity ${CONFIG.voyage.timber.fadeS}s`;
    f.opacity = back ? '1' : '0';
    f.zIndex = '50';
    document.body.appendChild(this.fade);
    if (back) setTimeout(() => (this.fade.style.opacity = '0'), 400);
    const v = this.world.vessels[this.testVesselId];
    try {
      if (!START_PARAMS.has('start')) {
        restoreBarges(this.world, parseBarges(localStorage.getItem(bargesKey(VOYAGE_MAP_ID))), v);
        restoreTimberLogs(this.world, parseTimberLogs(localStorage.getItem(timberLogsKey(VOYAGE_MAP_ID))));
      }
    } catch {
      // Storage blocked: none.
    }
    const site = back && this.timberSites.find((s) => s.id === back.site);
    if (back && site && v) {
      // `barge_ready` (the contract's first name for it): logs to collect, laid on the beach.
      const laid = back.status === 'barge_ready' && back.cargo.logs > 0 ? logsFromCamp(this.world, site, back.cargo.logs) : 0;
      if (laid) {
        const m = merchantsOn(VOYAGE_MAP_ID)[0];
        this.timberNote = `Back aboard from the timber camp: ${laid} ${laid === 1 ? 'log' : 'logs'} on the beach at the head of the bay (LOG on the plotter). Put a line on one, pull it off and tow it${m ? ` to ${m.name}` : ''} to sell.`;
      } else this.timberNote = 'Back aboard from the timber camp.';
      this.rememberT = Infinity;
      this.rememberVoyagePlace(0);
    }
    if (!this.timberSites.length && !merchantsOn(VOYAGE_MAP_ID).length) return;
    this.timberView = new TimberView(this.timberSites);
    this.scene.add(this.timberView.root);
    for (const s of this.timberSites) {
      const at = hotspotAt(s);
      if (at) this.timberSpecials.push({ x: at.x, z: at.z, r: s.radiusM, label: 'Timber camp', kind: 'anchorage' });
    }
    for (const m of merchantsOn(VOYAGE_MAP_ID)) {
      const b = berthWithId(m.berthId);
      if (b) this.timberSpecials.push({ x: b.x, z: b.z, label: 'Timber merchant', kind: 'merchant' });
    }
  }

  /**
   * Voyage: the map's real weather now (world/coastWeather.ts, Open-Meteo), asked once as the
   * session starts, alone or hosting (crew get the host's through the snapshots). It's where
   * the weather starts, the sea at the marine model's height where there is one; then the
   * weather moves on from it as the game's own does. Nothing
   * back within the timeout (offline, the service down): the game's own weather, as ever.
   */
  private startLiveWeather(): void {
    const map = MODE === 'voyage' && VOYAGE_MAP_ID ? voyageMap(VOYAGE_MAP_ID) : undefined;
    if (!map?.weatherAt || this.client) return;
    void fetchLiveWeather(map.weatherAt).then((live) => {
      // Not over weather set by hand in the meantime (Debug > World).
      if (!live || this.client || !this.world.environment.weather || this.world.environment.weather.manual) return;
      const text = liveWeatherText(map.name, live);
      const hv = this.world.vessels[this.testVesselId];
      const profile = hv ? regionAt(hv.position[0], hv.position[2])?.weather : undefined;
      setLiveWeather(this.world.environment, { wind: live.wind, windFrom: live.windFrom, visibility: live.visibility, rain: live.rain, cloud: live.cloud }, live.preset, this.world.time, { text, credit: CONFIG.liveWeather.credit }, live.sea?.scale, profile);
      this.overlay.notify(text, 8);
    });
  }

  /** Alone, or hosting with nobody else aboard: the timber camp takes one player at a time (v1). */
  private playingAlone(): boolean {
    return !this.client && (!this.host || this.host.playerCount <= 1);
  }

  /**
   * Voyage, each frame: the logs on the barges and the bay's buoy; anchored in the bay, ashore
   * to the timber camp; the sale when a barge lies at the merchant's quay (Enter or the
   * Voyage tab: sell).
   */
  private updateTimber(v: VesselState | undefined, dt: number): void {
    if (!this.timberView) return;
    if (this.timberNote) {
      this.overlay.notify(this.timberNote, 8);
      this.timberNote = null;
    }
    this.timberView.update(this.world, (x, z) => surfaceHeight(this.renderWaves, x, z));
    const boat = this.world.vessels[this.testVesselId];
    // Anchored in the bay: straight ashore (owner: seamless, no prompt).
    const site = this.timberWatch.update(boat, this.timberSites, dt, this.playingAlone() && !this.leavingForCamp);
    if (site) this.goAshore(site);
    const sale = saleOffer(this.world, boat, VOYAGE_MAP_ID);
    const saleKey = sale ? `${sale.bargeId}|${sale.logs}` : null;
    if (sale && this.saleShown !== saleKey) this.overlay.notify(`Alongside ${sale.merchant.name}: ${saleText(sale.logs, sale.total)}. Sell? (Enter, or the menu: Voyage)`, 6);
    this.saleShown = saleKey;
    this.timberPrompt.show(this.leavingForCamp ? '' : sale ? `Sell ${saleText(sale.logs, sale.total)}?   Enter: sell` : '');
    if (sale && this.keyboard.actionPressed('timber')) this.timberPress(0);
    void v;
  }

  /** Voyage tab: the timber run's line. */
  private timberLine(): string {
    if (this.leavingForCamp) return 'Going ashore to the timber camp...';
    const sale = saleOffer(this.world, this.world.vessels[this.testVesselId], VOYAGE_MAP_ID);
    if (sale) return `At the merchant: ${saleText(sale.logs, sale.total)}`;
    const towed = Object.entries(this.world.timber?.barges ?? {}).find(([id]) => this.world.tow?.lines?.[this.testVesselId]?.target === `v:${id}`);
    if (towed) return `Log barge on tow: ${towed[1].logs} logs`;
    const n = Object.keys(this.world.timber?.barges ?? {}).length;
    return n ? `${n} log barge${n > 1 ? 's' : ''} lying off` : this.timberSites.length ? 'Anchor off the timber camp to go ashore' : '';
  }

  /** Voyage tab: its buttons' words (0: go or sell, 1: not now). */
  private timberButton(i: number): string {
    if (i === 0 && saleOffer(this.world, this.world.vessels[this.testVesselId], VOYAGE_MAP_ID)) return 'Sell';
    return '';
  }

  private timberPress(i: number): void {
    const sale = i === 0 ? saleOffer(this.world, this.world.vessels[this.testVesselId], VOYAGE_MAP_ID) : null;
    if (!sale) return;
    // A crew-mate alongside asks the host's game (study #35); alone or hosting, sold here and
    // now, so the place remembered next hasn't still got her.
    if (this.client) return this.pushEnvIntent('timberSell', 1, sale.bargeId);
    applyTimberSell(this.world, this.localPlayerId, sale.bargeId);
    this.rememberT = Infinity;
    this.rememberVoyagePlace(0);
  }

  /**
   * Go ashore to the timber camp (voyage/metaverse.ts): the voyage saved as it is (anchored
   * here), a handoff id issued, the envelope built, the screen faded to black, and the page
   * goes to the Timber game. In the headset the VR session isn't ended first: a browser that
   * can carry VR across pages (WebXR navigation) keeps you in it.
   */
  private goAshore(site: MetaverseSite): void {
    const v = this.world.vessels[this.testVesselId];
    if (!v || this.leavingForCamp || !VOYAGE_MAP_ID) return;
    this.leavingForCamp = true;
    this.rememberT = Infinity;
    this.rememberVoyagePlace(0);
    const id = newHandoffId();
    issueId(id);
    // Back to this map as it is: the place and plan kept (no one-off start or join parameters).
    const ret = new URL(location.href);
    for (const k of ['mv', 'start', 'join', 'fit', 'host', 'together', 'fresh', 't']) ret.searchParams.delete(k);
    const envelope: Envelope = {
      v: 1,
      id,
      from: 'workboat',
      site: site.id,
      return: ret.toString(),
      boat: { id: v.defId, name: this.boatFavName(v) },
      pos: positionFor(VOYAGE_MAP_ID, v, headingOf(v)),
      time: { hour: Math.round(this.world.environment.timeOfDay * 100) / 100 },
      status: 'none',
      cargo: { logs: 0 },
    };
    this.timberPrompt.show('');
    this.overlay.notify('Going ashore to the timber camp...', 3);
    this.fade.style.opacity = '1';
    setTimeout(() => window.location.assign(outboundUrl(site, envelope)), CONFIG.voyage.timber.fadeS * 1000);
  }

  /**
   * The dive A-frame's DIVE (modules/diveFrame/launch.ts; owner, Oct 2026): the sub afloat off
   * her stern, the boat stopped over a wreck site: into the submersible game at that wreck.
   * Alone, or hosting with no crew aboard, as for the timber camp. The game saved as it is (a
   * Voyage's place and plan; the career), a handoff id issued (for the dive's results, once the
   * submersible game sends them), the screen faded, and the page goes there; it comes back to
   * this page. In the headset the VR session isn't ended: a browser that carries VR across
   * pages keeps you in it, as for the timber camp.
   */
  private goDive(vesselId: string): void {
    if (this.leavingForDive) return;
    const v = this.world.vessels[vesselId];
    if (!v) return;
    const why = this.client ? 'Only the host can take the sub down' : !this.playingAlone() ? 'Only alone, or hosting with no crew aboard, for now' : null;
    const ready = why ? { why } : diveReady(v, MODE === 'career' ? 'career' : VOYAGE_MAP_ID);
    if ('why' in ready) {
      this.overlay.notify(ready.why, 4);
      return;
    }
    this.leavingForDive = true;
    if (MODE === 'voyage') {
      this.rememberT = Infinity;
      this.rememberVoyagePlace(0);
    } else this.career.tick(); // the career saved as it is
    const session = newHandoffId();
    issueId(session);
    // Back to this page as it is (no one-off start or join parameters).
    const back = new URL(location.href);
    for (const k of ['mv', 'start', 'join', 'fit', 'host', 'together', 'fresh', 't']) back.searchParams.delete(k);
    this.overlay.notify(`Diving on ${siteLabel(ready.site, foundNames())}...`, 3);
    this.fade.style.opacity = '1';
    setTimeout(() => window.location.assign(diveUrl(ready.site, back.toString(), session)), CONFIG.modules.diveFrame.dive.fadeS * 1000);
  }

  /**
   * A boat type's cruise for the career's passages (career/passage.ts): measured on her once
   * (seaTrials measureCruise, a fraction of a second), just after it's first asked for, so the
   * menu isn't held up drawing; null until then.
   */
  private cruiseOf(defId: string): Cruise | null {
    const c = this.cruises.get(defId);
    if (c === undefined) {
      this.cruises.set(defId, null);
      setTimeout(() => {
        try {
          this.cruises.set(defId, measureCruise(defId, CONFIG.passage.lever));
        } catch (e) {
          console.warn(`Her cruise (${defId}): ${(e as Error).message}`);
          this.cruises.set(defId, { knots: 0, fuelLph: 0 });
        }
      }, 30);
      return null;
    }
    return c;
  }
  private readonly cruises = new Map<string, Cruise | null>();

  /** The world's fixed boards worked like the menu: the boatyards', the Shipyard signs (Voyage's one, the career's at every harbour) and the cargo screen. */
  private boardMenus(): WristMenu[] {
    // One list, kept (asked for several times a frame), made again only if the boards change.
    const solo = [this.shipyardDoor, this.boatsBoard].filter((b): b is ShipyardDoor => !!b);
    const n = this.yardBoards.length + this.shipyardSigns.length + solo.length + 1;
    if (this.boardMenuList.length !== n) this.boardMenuList = [...this.yardBoards.map((b) => b.menu), ...this.shipyardSigns.map((s) => s.menu), ...solo.map((s) => s.menu), this.cargoTerminal.menu];
    return this.boardMenuList;
  }
  private boardMenuList: WristMenu[] = [];

  /**
   * Why the yard's door into the Shipyard won't open now, or null (app/shipyardTrip.ts): on
   * your own or hosting with nobody else (owner: no multiplayer for this), a boat with a
   * Shipyard design, and in the career, her in the yard's port.
   */
  private shipyardBlocker(): string | null {
    if (this.client) return "Only the host can take the boat to the Shipyard";
    if (seaTrial) return 'Not on a sea trial: in your own boat';
    if (tryOut) return 'Not on a try-out together: in your own boat';
    if (this.worldBorrowed || this.borrowedCareer) return "Not in a friend's career: in your own game";
    if (!this.playingAlone()) return 'Only alone, or hosting with no crew aboard';
    const v = this.world.vessels[this.testVesselId];
    if (!v || !designCodeOf(v.defId)) return "She isn't a Shipyard design";
    return null;
  }

  /**
   * Through the yard's door to the Shipyard (owner, Oct 2026; docs/SHIPYARD_IN_GAME.md): the
   * game saved, out of VR (the Shipyard is a flat page, which the Quest Browser draws sharp),
   * and the page goes to the Shipyard in refit mode on her design. It comes back here.
   */
  private openShipyard(): void {
    if (this.leavingForShipyard) return;
    const why = this.shipyardBlocker();
    if (why) {
      this.overlay.notify(why, 4);
      return;
    }
    const v = this.world.vessels[this.testVesselId]!;
    const code = designCodeOf(v.defId)!;
    this.leavingForShipyard = true;
    if (MODE === 'voyage') {
      this.rememberT = Infinity;
      this.rememberVoyagePlace(0);
    } else this.career.tick(); // the career saved as it is
    const url = shipyardUrl(code, MODE === 'voyage' ? 'voyage' : 'career', backUrl(location.href), this.world.career?.money);
    this.overlay.notify('To the Shipyard...', 3);
    this.fade.style.opacity = '1';
    void this.renderer.xr.getSession()?.end();
    setTimeout(() => window.location.assign(url), CONFIG.voyage.timber.fadeS * 1000);
  }

  /**
   * Back from the Shipyard with her refitted (`refitFrom` in the address, app/shipyardTrip.ts):
   * the career pays the difference in price and keeps her new design (Voyage has no money:
   * owner). The address loses `refitFrom`, so a reload doesn't charge again.
   */
  private settleRefit(): void {
    const r = refitReturn(location.search);
    if (!r) return;
    const url = new URL(location.href);
    url.searchParams.delete('refitFrom');
    history.replaceState(history.state, '', url.toString());
    const c = this.world.career;
    if (MODE === 'voyage' || !c) {
      this.overlay.notify('Back aboard her as refitted', 4);
      return;
    }
    const cost = refitCost(r.from, r.to) ?? 0;
    if (cost > c.money) {
      // The Shipyard shows what she can afford; if it got past it, she goes back as she was.
      url.searchParams.set('design', r.from);
      this.overlay.notify(`Not enough money for that refit (${money(cost)}): back in her as she was`, 5);
      setTimeout(() => location.replace(url.toString()), 2500);
      return;
    }
    if (cost > 0) spend(this.world, cost, 'Refit at the yard');
    c.design = r.to;
    c.seq += 1;
    if (!cost) this.overlay.notify('Back aboard her as refitted (no charge)', 4);
  }

  /** Ships, debris and buoys on the waves; ships' fog horns; the lookout calls new ships. */
  private updateTraffic(v: VesselState | undefined, darkness: number, dt: number): void {
    this.trafficView.update(this.world, this.renderWaves, darkness, dt);
    this.harbourBoatsView.update(this.world, this.renderWaves, darkness, this.focus);
    this.skylineView.update(this.world, darkness, dt);
    this.windFarmView.update(this.world, darkness, dt);
    this.transferView.update(this.world, (id) => this.vesselRoots.get(id));
    this.aquaView.update(this.world, this.focus);
    this.farmCrewView.update(this.world, this.focus, (id) => this.vesselRoots.get(id));
    this.rememberVoyagePlace(dt);
    this.updatePlan();
    this.updateTimber(v, dt);
    const t = this.world.traffic;
    if (!t) return;
    if (this.hornSeen >= 0 && t.hornSeq !== this.hornSeen && t.hornFrom) {
      const pos = this.trafficView.shipPosition(t.hornFrom);
      const type = this.trafficView.shipType(t.hornFrom);
      if (pos && type) this.sound.shipHorn.blow(pos, type === 'cargo' ? 105 : type === 'fishing' ? 165 : 290, pos.distanceTo(this.focus));
    }
    this.hornSeen = t.hornSeq;
    if (!v) return;
    const fwd = this.tmpV.set(0, 0, -1).applyQuaternion(this.lookQ.fromArray(v.orientation));
    const heading = Math.atan2(fwd.x, -fwd.z);
    // A crew-mate's boat coming into sight (multi-boat M5): called out once, by whose she is.
    const sight = Math.min(CONFIG.traffic.sightRange, visibilityAt(this.world.environment, v.position[0], v.position[2]) * CONFIG.traffic.sightVis);
    for (const b of playerBoats(this.world)) {
      if (b.id === v.id || this.boatsCalled.has(b.id)) continue;
      const dx = b.position[0] - v.position[0];
      const dz = b.position[2] - v.position[2];
      const d = Math.hypot(dx, dz);
      if (d > sight || d < 60) continue;
      this.boatsCalled.add(b.id);
      const rel = (Math.atan2(dx, -dz) - heading + Math.PI * 4) % (Math.PI * 2);
      const clock = Math.round((rel / (Math.PI * 2)) * 12) || 12;
      this.overlay.notify(`Lookout: ${boatOwnerName(this.world, b)}'s boat, ${clock} o'clock, ${d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d / 10) * 10} m`}`, 5);
    }
    for (const s of t.ships) {
      if (!s.sighted || this.shipsCalled.has(s.id)) continue;
      this.shipsCalled.add(s.id);
      const dx = s.x - v.position[0];
      const dz = s.z - v.position[2];
      const rel = (Math.atan2(dx, -dz) - heading + Math.PI * 4) % (Math.PI * 2);
      const clock = Math.round((rel / (Math.PI * 2)) * 12) || 12;
      this.overlay.notify(`Lookout: ${SHIP_NAMES[s.type].toLowerCase()}, ${clock} o'clock, ${(Math.hypot(dx, dz) / 1000).toFixed(1)} km`, 5);
    }
  }

  /**
   * The lookout: the first time something in the water comes within sight - the spotting
   * range or the visibility, whichever is less - it's called out with a clock bearing.
   */
  private lookout(v: VesselState | undefined): void {
    const inc = this.world.rescue?.active;
    if (!inc || !v) {
      this.spotted.clear();
      return;
    }
    const range = Math.min(CONFIG.spotting.range, visibilityAt(this.world.environment, v.position[0], v.position[2]));
    const fwd = this.tmpV.set(0, 0, -1).applyQuaternion(this.lookQ.fromArray(v.orientation));
    const heading = Math.atan2(fwd.x, -fwd.z);
    for (const t of inc.targets) {
      if ((t.phase && t.phase !== 'floating') || this.spotted.has(t.id)) continue; // only those still floating free
      const dx = t.x - v.position[0];
      const dz = t.z - v.position[2];
      const d = Math.hypot(dx, dz);
      if (d > range) continue;
      this.spotted.add(t.id);
      const rel = (Math.atan2(dx, -dz) - heading + Math.PI * 4) % (Math.PI * 2);
      const clock = Math.round((rel / (Math.PI * 2)) * 12) || 12;
      const what = t.kind === 'person' ? 'Person in the water' : 'Crate in the water';
      this.overlay.notify(`Lookout: ${what}, ${clock} o'clock, ${Math.round(d / 10) * 10} m!`, 5);
      this.sound.rescue.snap();
    }
  }

  /** The dipstick pulled: say what it shows. */
  private readDipstick(): void {
    const v = this.world.vessels[this.testVesselId];
    if (!v) return;
    const r = dipstickReading(v);
    this.overlay.notify(r === 'ok' ? 'Dipstick: oil between MIN and MAX. Fine.' : r === 'low' ? 'Dipstick: oil near MIN. Top up from the can.' : 'Dipstick: barely any oil on it! Top up now.', 4);
  }

  /** Her main engines' last phases, to hear a start's starting air. */
  private readonly plantPhases: string[] = ['', ''];

  /** The harbour tug's engine room machinery heard (audio/plantAudio.ts): loud below, faint on her deck. */
  private plantSound(): void {
    const id = this.world.players[this.localPlayerId]?.aboardVesselId;
    const v = id ? this.world.vessels[id] : undefined;
    const p = v?.plant;
    if (!v || !p) return this.sound.plant.update(null);
    const phases = [v.engine.phase, v.engine.stbd?.phase ?? 'off'];
    const airStart = phases.some((ph, k) => ph === 'cranking' && this.plantPhases[k] !== 'cranking');
    phases.forEach((ph, k) => (this.plantPhases[k] = ph));
    this.sound.plant.update({
      gen: p.gen === 'running' ? 1 : p.gen === 'starting' ? Math.min(0.95, p.genT / CONFIG.plant.genRunUpS) : 0,
      fans: busLive(p),
      compressor: !!p.compressor && busLive(p) && p.airBar < CONFIG.plant.airMaxBar - 0.01,
      airFull: p.airBar / CONFIG.plant.airMaxBar,
      airStart,
      where: this.belowDecks.boatId === v.id && this.belowDecks.space === 'engine' ? 'below' : 'deck',
    });
  }

  /** Each boat's engine room alarm last said (plant/plant.ts `noteN`), by boat. */
  private readonly plantNoteN = new Map<string, number>();

  /** The harbour tug's engine room: what stopped or blocked her (a start, the generator, a blackout), said to whoever's aboard her. */
  private plantNotes(): void {
    const id = this.world.players[this.localPlayerId]?.aboardVesselId;
    const p = id ? this.world.vessels[id]?.plant : undefined;
    if (!id || !p) return;
    const n = p.noteN ?? 0;
    const was = this.plantNoteN.get(id);
    this.plantNoteN.set(id, n);
    if (was !== undefined && n > was && p.note) {
      this.overlay.notify(p.note, 4);
      this.xrInput.pulse('right', 0.6, 120);
    }
  }

  /** The bridge's START on the harbour tug before her engine room has handed her over: why nothing happens. */
  private engineRoomHint(v: VesselState | undefined): boolean {
    if (!v?.plant || v.plant.place === 2) return false;
    this.overlay.notify('Engines not ready: the engine room has control. Start her up below, then turn ENGINE CONTROL to BRIDGE (or Menu > Tests > Quick start).', 5);
    return true;
  }

  /** START pressed with the lever in gear: the neutral-safety switch says no. */
  private startInGearHint(): void {
    const v = this.world.vessels[this.testVesselId];
    if (this.engineRoomHint(v)) return;
    const diesel = v && gearOf(v, 'diesel');
    if (v && diesel && leverDemand(diesel, v.controls.lever).gear !== 0) {
      this.overlay.notify('Neutral safety: the lever must be in neutral to start', 2.5);
      this.xrInput.pulse('right', 0.8, 150);
    }
  }

  /**
   * Desktop E key: with the quick-start option, one press does it all (master, breakers,
   * key, preheat, start) or stops her; otherwise it points to the real procedure.
   */
  private requestEngineStartStop(): void {
    // The boat you're standing in if she has an engine (the rescue boat), else your own.
    const driven = this.world.vessels[this.drivenVesselId()];
    const id = driven && gearOf(driven, 'diesel') ? driven.id : this.testVesselId;
    const v = this.world.vessels[id];
    if (!v) return;
    const send = (control: string, value: number) => this.pushIntentTo(id, control, value);
    const diesel = gearOf(v, 'diesel');
    // Quick start is a session setting (CONFIG.vessels.workboat.electrics.quickStart), for a boat with batteries and a diesel.
    if (!diesel || !gearOf(v, 'batteries') || !CONFIG.vessels.workboat.electrics.quickStart) {
      if (v.engine.phase === 'off' && this.engineRoomHint(v)) return;
      if (v.engine.phase === 'off') this.overlay.notify('Start her properly: master, INSTR breaker, key, wait for the GLOW lamp, START (see the card). Menu > Tests > Quick start does it all.', 5);
      else send('key', 0);
      return;
    }
    if (v.engine.phase === 'off') {
      if (diesel.engine.startOnlyInNeutral && leverDemand(diesel, v.controls.lever).gear !== 0) {
        this.overlay.notify('Engine won\'t start: lever not in neutral');
        this.xrInput.pulse('right', 0.8, 150);
      }
      send('quickStart', 1);
      return;
    }
    send('key', 0); // stop: key off
  }

  /**
   * The menu's quick jobs: check what would happen (to say why not, or what's being done),
   * then send the intent; the host applies the same rules (cargo.ts / potting.ts "quick").
   */
  private quickJob(what: string): void {
    const v = this.world.vessels[this.testVesselId];
    if (!v) return;
    const say = (text: string) => this.overlay.notify(text, 3);
    const port = quickPort(v);
    const notAtPort = 'Come alongside a harbour berth, or anchor in its bay, and stop first';
    const n = (k: number, one: string) => `${k} ${one}${k === 1 ? '' : 's'}`;
    switch (what) {
      case 'load': {
        if (!port) return say(notAtPort);
        const k = quickLoadable(this.world, v).length;
        if (!k) return say('Nothing waiting here for another port: order some at the CARGO screen on the quay');
        this.pushVesselIntent('cargoQuickLoad', 1);
        return say(`Loading ${n(k, 'item')} waiting here (as many as she has room for), lashed down`);
      }
      case 'unload': {
        if (!port) return say(notAtPort);
        const items = quickUnloadable(this.world, v);
        if (!items.length) return say(`Nothing aboard to land at ${port.name.replace(' (anchorage)', '')}`);
        this.pushVesselIntent('cargoQuickUnload', 1);
        const pots = items.filter(isPot).length;
        return say(`Landing ${n(items.length - pots, 'item')}${pots ? ` and selling the catch from ${n(pots, 'pot')}` : ''}`);
      }
      case 'lash':
      case 'release':
        this.pushVesselIntent('cargoQuickLash', what === 'lash' ? 1 : 0);
        return say(what === 'lash' ? 'Everything on deck lashed down (where a D-ring is in reach)' : 'All lashings released');
      case 'lift': {
        const crates = (this.world.rescue?.active?.targets ?? []).filter((t) => t.kind === 'crate' && t.phase !== 'aboard');
        if (!crates.length) return say('No crates in the water');
        this.pushVesselIntent('crateQuickLift', 1);
        return say(`Lifting aboard the crates within ${CONFIG.rescue.quickLiftRange} m of her side (bring her closer for the rest)`);
      }
    }
    if (!this.world.potting) return say('Potting is off: Settings → Game → Potting');
    const pots = aboard(this.world, v.id).filter(isPot);
    switch (what) {
      case 'potLoad': {
        const k = quickPalletPots(this.world, v).length;
        if (!k) return say(port ? 'No pots waiting on this quay: order some at the CARGO screen' : 'Come alongside a harbour quay and stop, and order pots at its CARGO screen');
        this.pushVesselIntent('potQuickLoad', 1);
        return say(`Loading ${n(k, 'pot')} from the quay, lashed down`);
      }
      case 'potShoot': {
        if (!pots.length) return say('No pots aboard');
        this.pushVesselIntent('potQuickShoot', 1);
        const on = groundAt(v.position[0], v.position[2]);
        return say(`Pot over the side, starboard${on ? '' : ' (not on a potting ground: it will catch little)'}. ${n(pots.length - 1, 'pot')} left. Mark it on the chart`);
      }
      case 'potHaul': {
        if (!quickHaulable(this.world, v)) return say(`No pot buoy within ${CONFIG.potting.quickHaulRange} m: bring her up to one`);
        this.pushVesselIntent('potQuickHaul', 1);
        return say('Hauling the nearest pot');
      }
    }
  }

  private pushVesselIntent(control: string, value: number, ref?: string): void {
    this.pushIntentTo(this.testVesselId, control, value, ref);
  }

  private pushIntentTo(vesselId: string, control: string, value: number, ref?: string): void {
    this.intents.push({ playerId: this.localPlayerId, targetId: vesselId, control, value, ref });
  }

  /** Which vessel a control works (Control.route; none: the home boat), and its channel. */
  private routeControl(c: Control): { vesselId: string; control: string } {
    return c.route ? { vesselId: c.route, control: c.channel } : this.routeChannel(c.channel);
  }

  /**
   * Which vessel a control channel belongs to: "<vesselId>:<control>" (a control routed to
   * another boat: the skiff's tiller), or a plain control name (the home boat's).
   */
  private routeChannel(channel: string): { vesselId: string; control: string } {
    const i = channel.indexOf(':');
    return i < 0 ? { vesselId: this.testVesselId, control: channel } : { vesselId: channel.slice(0, i), control: channel.slice(i + 1) };
  }

  /**
   * The touch controls: the boat you're driving, started in one press (whatever the
   * quick-start setting), driven through the same intents as the keys. Your own boat only.
   */
  private setupTouch(): void {
    const boat = () => this.world.vessels[this.drivenVesselId()];
    this.touch = new TouchControls(
      {
        aboard: () => !!this.world.players[this.localPlayerId]?.aboardVesselId,
        toggleBoard: () => this.toggleBoard(),
        engine: () => {
          const v = boat();
          if (!v) return;
          if (gearOf(v, 'outboard')) this.pushIntentTo(v.id, 'obPower', 1);
          else if (v.engine.phase !== 'off') this.pushIntentTo(v.id, 'key', 0);
          else {
            // The lever to neutral first (she only starts in neutral), then everything at once.
            if (v.controls.lever !== 0) this.pushIntentTo(v.id, 'lever', 0);
            this.pushIntentTo(v.id, 'quickStart', 1);
          }
        },
        running: () => {
          const v = boat();
          return !!v && (gearOf(v, 'outboard') ? v.controls.obOn > 0 : v.engine.phase !== 'off');
        },
        menu: () => this.toggleMenu(),
        dockLabel: () => {
          const m = boat()?.mooring;
          if (!m) return null;
          return m.phase !== 'free' ? 'Cast off' : m.berthId ? 'Moor here' : null;
        },
        dock: () => {
          const v = boat();
          if (v) this.pushIntentTo(v.id, 'dock', 1);
        },
        otherBoat: () => {
          const next = this.nextStartBoat();
          return next ? (HULLS.get(RECIPES[next].hull)?.name ?? next) : null;
        },
        switchBoat: () => {
          const next = this.nextStartBoat();
          if (next) this.restartPage(restartIn(next));
        },
        drive: (lever, helm) => this.driveTo(this.drivenVesselId(), lever, helm),
        reading: () => {
          const v = boat();
          if (!v) return { lever: 0, helm: 0, knots: 0, rpm: null };
          const knots = Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) / 0.5144;
          return { lever: this.signedLever(v), helm: v.controls.helm, knots, rpm: gearOf(v, 'diesel') ? v.engine.rpm : null };
        },
        look: (dx, dy) => this.desktop.look(dx, dy, CONFIG.touch.lookSensitivity),
      },
      this.renderer.domElement,
    );
    this.boardOnStart = CONFIG.touch.startAboard;
    this.desktop.noPointerLock = true;
    // A phone's speaker or earbuds: the engine voiced so its idle beat can be heard.
    this.sound.engine.smallSpeakers = true;
  }

  /** The next boat to start in after the one you're in (the touch controls' switch). */
  private nextStartBoat(): string | null {
    const here = this.world.vessels[this.startVesselId]?.defId ?? 'workboat';
    const i = START_BOATS.indexOf(here);
    const next = START_BOATS[(i + 1) % START_BOATS.length];
    return next !== here && RECIPES[next] ? next : null;
  }

  /** Our boat's tender (the skiff or the rescue boat), else the first tender there is. */
  private skiff(): VesselState | undefined {
    return this.ourSkiff() ?? Object.values(this.world.vessels).find((v) => v.tender);
  }

  /** The boat the driving keys steer: the one you're standing in, else the workboat. */
  private drivenVesselId(): string {
    const aboard = this.world.players[this.localPlayerId]?.aboardVesselId;
    return aboard && this.world.vessels[aboard] ? aboard : this.testVesselId;
  }

  /** The cargo hands' view of the app. */
  private cargoCtx(): CargoHandsContext {
    return {
      world: this.world,
      playerId: this.localPlayerId,
      frame: this.playerFrame(),
      vesselRoots: this.vesselRoots,
      push: (control, targetId, ref, value, args) => this.intents.push({ playerId: this.localPlayerId, targetId, control, value, ref, args }),
      notify: (text) => this.overlay.notify(text, 2.5),
      pulse: (h, i, ms) => this.xrInput.pulse(h, i, ms),
      placedOnDeck: () => this.sound.rescue.snap(),
    };
  }

  /**
   * Where a carried item is drawn: in our own hands (from the cargo hands), or in another
   * player's avatar hands (both hands' midpoint, or one; desktop players carry it in front).
   */
  private carriedPose(c: CargoItem): { pos: THREE.Vector3; quat: THREE.Quaternion } | null {
    const local = this.cargoHands.localPose(c);
    if (local) return local;
    if (!('carriedBy' in c.at)) return null;
    const p = this.world.players[c.at.carriedBy];
    if (!p || p.id === this.localPlayerId || !p.avatar) return null;
    const frame = (p.aboardVesselId && this.vesselRoots.get(p.aboardVesselId)) || this.scene;
    const { head, left, right } = p.avatar;
    const hq = this.attQ.set(head[3], head[4], head[5], head[6]);
    const yaw = 2 * Math.atan2(hq.y, hq.w);
    const pt = this.carryV;
    if (left && right) pt.set((left[0] + right[0]) / 2, (left[1] + right[1]) / 2, (left[2] + right[2]) / 2);
    else if (left || right) pt.fromArray((left ?? right)!);
    else pt.set(head[0] - Math.sin(yaw) * 0.7, head[1] - 0.85, head[2] - Math.cos(yaw) * 0.7);
    pt.y -= kindOf(c).size[1] / 2;
    frame.localToWorld(pt);
    const quat = frame.getWorldQuaternion(this.carryQ).multiply(this.tmpQ2.setFromAxisAngle(this.yAxis, yaw));
    return { pos: pt, quat };
  }


  private pushEnvIntent(control: string, value: number, ref?: string): void {
    this.intents.push({ playerId: this.localPlayerId, targetId: ENVIRONMENT_ID, control, value, ...(ref !== undefined ? { ref } : {}) });
  }

}

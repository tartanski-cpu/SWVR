import * as THREE from 'three';
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
import { HydroDebugView } from '../debug/hydroDebugView';
import { onCrane, recoverCheck } from '../vessel/tenderCrane';
import { hydraulicsOn, isPowered } from '../vessel/electrics';
import { beaufort, compass8, visibilityAt, windVector } from '../environment/weather';
import { RainView } from '../environment/rainView';
import { ChartTableView } from '../vessel/view/chartTable';
import { dipstickReading } from '../vessel/maintenance';
import { TrafficView } from '../traffic/trafficView';
import { SHIP_NAMES } from '../traffic/traffic';
import { ChartTools, type ChartToolsContext } from '../chart/chartTools';
import { applyChartOp, createMarks, parseMarks, pointCount, serializeMarks, type ChartOp } from '../chart/marks';
import { WindSock } from '../vessel/view/windSock';
import { DutyBoardView } from '../duties/dutyBoardView';
import { TenderCraneView } from '../controls/TenderCraneView';
import { asWorkboat, VESSEL_DEFS, type WorkboatDef } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { VesselView } from '../vessel/view/vesselView';
import { hullPlan, vesselWalkArea, type WalkArea } from '../vessel/layout';
import { climbOut, jump, swimArea, updateAir, updateSwim, type BodyVessel } from '../player/body';
import { worldWalkArea } from '../world/landWalkArea';
import { leverDemand } from '../vessel/physics/propulsion';
import { Locomotion } from '../player/locomotion';
import { ComfortOverlay, MotionDecoupler } from '../player/comfort';
import { PLAYER_NAMES, saveUserSettings, userSettings } from '../player/userSettings';
import { WristMenu } from '../ui/wristMenu';
import { mainMenu, type MenuHost } from '../ui/mainMenu';
import { placeInFront } from '../ui/placeInFront';
import { canRefuel, releaseHolds } from '../vessel/vesselControl';
import { PORTS } from '../world/archipelago';
import { groundHeight } from '../world/terrain';
import { aboard, carriedBy, dropCarried, cargoLabel, cargoPortAt, kindOf, payloadMass, slotsUsed, type CargoItem } from '../cargo/cargo';
import { CargoHands, type CargoHandsContext } from '../cargo/cargoHands';
import { CargoView } from '../cargo/cargoView';
import { berthById } from '../vessel/physics/mooring';
import { XRControllers } from '../player/xrControllers';
import { Bridge } from '../controls/bridge';
import { InteractionSystem, type HandFrame } from '../controls/InteractionSystem';
import { WorldView } from '../world/view/worldView';
import { LaserPointer } from './laserPointer';
import { SoundBoard } from './soundBoard';
import { TowlineView } from '../tow/towlineView';
import { PainterView } from '../vessel/view/painterView';
import { cleatName, painterPlan, skiffCleatLocal } from '../vessel/physics/painter';
import { Cleat } from '../controls/deckGear';
import { Binoculars } from '../player/binoculars';
import { HandGear, type GearKind } from '../player/handGear';
import { GearView } from '../player/gearView';
import { extinguisherShip } from '../fire/extinguisher';
import { fireAlertT } from '../fire/fire';
import { FireView, JetView } from '../fire/fireView';
import { WildlifeView } from '../wildlife/wildlifeView';
import { LogView } from '../salvage/logView';
import { CareerSession } from './careerSession';
import { TrawlView } from '../fishing/trawlView';
import { InteriorDetail } from './interiorDetail';
import { jetOn } from '../fire/fire';
import { aFrameOf } from '../fishing/fishing';
import { lineLength, nearestTowTarget, towAlertT, towStatus, winchStalled } from '../tow/tow';
import { TargetsView } from '../rescue/targetView';
import { RescueHands, type RescueHandsContext } from '../rescue/rescueHands';
import { RescueGearView, type AvatarHands } from '../rescue/rescueGearView';
import { lastSpeech, speechVoices } from '../audio/babble';
import { mixer, type Bus } from '../audio/mixer';
import { FmRadio } from '../audio/fmRadio';
import { Tiller } from '../controls/Tiller';
import { BoardView, type BoardContext } from '../board/boardView';
import { NoteKeyboard } from '../board/noteKeyboard';
import { parseBoard } from '../board/board';
import { DesktopHand } from '../player/desktopHand';
import { playerColor } from '../net/avatarView';
import { createRescueState, nearestPort, runStatus } from '../rescue/rescue';
import { engineAlarms } from '../vessel/physics/engineThermal';
import { VesselEffects } from '../vessel/view/vesselEffects';
import { sunElevation } from '../environment/timeOfDay';
import { clamp, type Quat } from '../core/math';
import { GpuTimer } from '../debug/gpuTimer';
import { TrialsPanel } from '../debug/trialsPanel';
import { vesselReadout } from '../debug/vesselReadout';
import { countBoatParts } from '../debug/boatParts';
import { DesktopPointer } from './desktopPointer';
import { setupXR, xrSessionInfo } from './xrSession';
import { applyPlayerIntent } from '../player/playerControl';
import { HostSession } from '../net/hostSession';
import { ClientSession } from '../net/clientSession';
import { PeerClientTransport, PeerHostTransport, randomRoomCode, type ClientTransport } from '../net/transport';
import { NET_RATE, type PlayerPose } from '../net/protocol';
import { AvatarsView } from '../net/avatarView';

/**
 * Top-level wiring. Owns the renderer, the simulation state and the per-frame loop:
 *
 *   gather input  ->  intents  ->  N fixed sim ticks  ->  update views (with alpha)  ->  render
 */
/** Where the host keeps the whiteboard's notes between visits. */
const BOARD_KEY = 'swvr.board';
const LAST_CODE_KEY = 'swvr.lastGameCode';
/** ...and the pencil marks on the paper chart. */
const CHART_KEY = 'swvr.chart';
/** ...and the batteries when we left (only with electrics.drainBetweenSessions). */
const BATTERY_KEY = 'swvr.battery';
/** ...and the number of rescues completed. */
const RESCUES_KEY = 'swvr.rescues';


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
  readonly testVesselId: EntityId;
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
  private readonly probes = new SurfaceProbes();
  private readonly vesselViews = new Map<EntityId, VesselView>();
  private readonly hydroViews = new Map<EntityId, HydroDebugView>();
  private readonly simDebug: SimDebug = new Map();
  /** Every sound system (soundBoard.ts). */
  private readonly sound = new SoundBoard();
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
  private bridge: Bridge | null = null;
  private interaction: InteractionSystem | null = null;
  private readonly effects = new Map<EntityId, VesselEffects>();
  private readonly worldView = new WorldView();
  /** The hazard buoys, riding the swell with their lights (owner request). */
  private readonly navMarks = new NavMarksView();
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
  private readonly gear = [new HandGear('extinguisher'), new HandGear('torch')];
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
  private readonly targetsView = new TargetsView();
  private readonly desktopHand = new DesktopHand();
  private readonly deskHandW = new THREE.Vector3();
  private readonly rescueHands = new RescueHands();
  private readonly gearView = new RescueGearView();
  private readonly fmRadio = new FmRadio();
  /** Outboard tillers (the skiff's), one per outboard boat. */
  private readonly tillers: Tiller[] = [];
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
  /** Last lightning flash and forecast seen (thunder / VHF on change), and targets the lookout has called. */
  private lightningSeen = -1;
  private forecastSeen = -1;
  private readonly spotted = new Set<string>();
  private readonly lookQ = new THREE.Quaternion();
  private windSock: WindSock | null = null;
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
  private readonly noteKeys = new NoteKeyboard((text, x, y, colour) => this.pushBoardIntent('noteAdd', text, [x, y, colour]));
  /** The board's seq last saved to this browser (host / solo keeps the notes over a reload). */
  private boardSaved = -1;
  private rescuesSaved = -1;
  /** Last cheer count / shout id heard (null until the first frame). */
  private rescueHeard: { cheer: number; shout: number; ring: string } | null = null;
  private frameDt = 0;
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
  private readonly attQ = new THREE.Quaternion();
  /** Wave constants at the current *render* time (reused every frame). */
  private renderWaves: PreparedWave[] = [];
  private readonly overlay = new DebugOverlay();
  /** The career's save slots, saving, money pop-up and menu parts (careerSession.ts). */
  private readonly career = new CareerSession({
    world: () => this.world,
    vesselId: () => this.testVesselId,
    isClient: () => !!this.client,
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
  /** Hosting: waiting for the PeerJS server to register the room code. */
  private hostStarting = false;
  private joinCode = '';
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

    const created = createWorld(this.ids, undefined, { tender: true, cold: true, weather: true, tows: true, fires: true, logs: true, harbour: true });
    this.world = created.world;
    this.localPlayerId = created.localPlayerId;
    this.soloPlayerId = created.localPlayerId;
    this.testVesselId = created.vesselId;
    // Our own working clothes, as crew who join will see us (net/avatarOutfits.ts).
    this.world.players[this.localPlayerId].look = randomLook();

    this.rig = new PlayerRig(this.localPlayerId, this.camera);
    this.scene.add(this.rig.carrier);
    this.placePanelOnRig();
    this.camera.add(this.comfortOverlay.mesh);
    this.controllers = new XRControllers(this.renderer, this.rig.root);
    this.decoupler.coupling = userSettings.motionCoupling;
    this.menu = new WristMenu(mainMenu(this.menuHost()));
    this.scene.add(this.menu.rayLine, this.noteKeys.menu.root, this.noteKeys.menu.rayLine);

    this.desktop = new DesktopController(this.camera, this.renderer.domElement, this.keyboard);
    this.environment = new EnvironmentView(this.scene);
    this.scene.add(this.sky.mesh, this.ocean.mesh, this.probes.mesh, this.worldView.root, this.navMarks.root, this.cargoView.root);
    this.scene.add(this.targetsView.root, this.gearView.root, this.desktopHand.root, this.rain.mesh, this.trafficView.root);
    this.rain.quality = userSettings.rainQuality;
    this.targetsView.onWhistle = (pos) => this.sound.whistle.blow(pos);
    this.scene.add(this.laser.beam.root);
    this.scene.add(this.wildlife.root);
    for (const vessel of Object.values(this.world.vessels)) this.addVesselView(vessel);
    // A tender's crane and cradle (LAUNCH / RECOVER button on the crane) on her ship's foredeck.
    for (const vessel of Object.values(this.world.vessels)) {
      const hostDef = vessel.tender && VESSEL_DEFS[this.world.vessels[vessel.tender.hostId]?.defId];
      if (!vessel.tender || !hostDef?.tenderCrane || !hostDef.bridge) continue;
      const gear = new TenderCraneView(vessel.id, hostDef.tenderCrane, hullPlan(hostDef).deckY, hostDef.bridge.craneButton, VESSEL_DEFS[vessel.defId]);
      this.vesselViews.get(vessel.tender.hostId)?.root.add(gear.root);
      // The crane's remote rides in the skiff.
      this.vesselViews.get(vessel.id)?.root.add(gear.remote);
      this.cranes.push(gear);
    }
    const tugView = this.vesselViews.get(this.testVesselId);
    if (tugView) this.towline.attachPost(tugView.root, VESSEL_DEFS[this.world.vessels[this.testVesselId].defId]);
    if (tugView) this.trawlView.attachAFrame(tugView.root, VESSEL_DEFS[this.world.vessels[this.testVesselId].defId]);
    this.binoculars = new Binoculars(this.camera);
    if (tugView) this.binoculars.stow(tugView.root);
    if (tugView) for (const g of this.gear) g.mount(tugView.root, CONFIG.handGear[g.kind].bracket);
    this.scene.add(this.handGearView.root);
    this.scene.add(this.towline.root, this.painter.root, this.fireView.root, this.jetView.root, this.logView.root, this.trawlView.root);
    this.setupBridge();

    setupXR(this.renderer, this.camera);
    window.addEventListener('resize', () => this.onResize());
    // Audio may only start after a user gesture.
    const unlock = () => this.sound.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.renderer.xr.addEventListener('sessionstart', unlock);
    // Menus opened in one mode don't carry over (the wrist grip disappears outside VR).
    const closePanels = () => {
      this.menu.close();
      this.trialsPanel.hide();
    };
    this.renderer.xr.addEventListener('sessionstart', closePanels);
    this.renderer.xr.addEventListener('sessionend', closePanels);
    // Binoculars go back on the dash (and the desktop zoom ends) when switching modes.
    this.renderer.xr.addEventListener('sessionstart', () => this.binoculars.updateDesktop(false));
    this.renderer.xr.addEventListener('sessionend', () => this.binoculars.drop());
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
    this.walkAreas.set(vessel.id, vesselWalkArea(def, def.layout));
    this.effects.set(vessel.id, new VesselEffects(def, view.root, this.scene, this.ocean.sharedUniforms));
    this.vesselRoots.set(vessel.id, view.root);
    if (!def.tow) this.cargoView.attachVessel(view.root, vessel.defId);
    // An outboard boat (the skiff): its tiller, with the motor it swings.
    if (def.outboard) {
      const tiller = new Tiller(vessel.id, def.outboard);
      view.root.add(tiller.root);
      // Her bow cleat on the stem head, for the painter (clicked with the tiller's parts).
      const bow = new Cleat(-1, { id: `painter:${vessel.id}`, channel: `${vessel.id}:painter`, label: "Skiff's painter (bow cleat): let go / make fast to the nearest cleat" });
      const [bx, by, bz] = skiffCleatLocal(def);
      bow.root.position.set(bx, by - 0.06, bz);
      view.root.add(bow.root);
      tiller.parts.push(bow);
      this.tillers.push(tiller);
    }
  }

  /**
   * Tows (towing missions) come and go: give a new one its views, and take the views of
   * one that's gone out of the scene. Only towable hulls are ever added or removed.
   */
  private syncVesselViews(): void {
    const vessels = this.world.vessels;
    for (const v of Object.values(vessels)) if (!this.vesselViews.has(v.id)) this.addVesselView(v);
    for (const [id, view] of this.vesselViews) {
      if (vessels[id]) continue;
      view.root.removeFromParent();
      view.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      this.effects.get(id)?.dispose();
      for (const map of [this.vesselViews, this.hydroViews, this.walkAreas, this.effects, this.vesselRoots, this.hullPlans] as Map<EntityId, unknown>[]) map.delete(id);
    }
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
    this.renderWaves = prepareWaves(this.world.environment.waves, renderTime, this.renderWaves);
    this.updatePlayer(dt, inXR);
    this.updateSurroundings(renderTime);
    this.updateOwnBoat(dt, nowMs);
    const darkness = Math.min(1, Math.max(0, (8 - sunElevation(this.world.environment.timeOfDay)) / 14));
    const { slam, lap } = this.updateBoatsAndJobs(dt, renderTime, darkness);
    this.updateSceneViews(dt, renderTime, darkness);
    this.updateBoardsAndSaves(dt);
    this.updateCrewViews(dt, inXR, darkness);
    this.updateHullSounds(dt, slam, lap);
    this.menu.refresh();
    this.host?.tick(dt);
    const t2 = performance.now();

    // 4. Render
    this.renderer.info.reset();
    this.gpuTimer.begin();
    if (inXR) this.binoculars.renderScope(this.renderer, this.scene);
    this.renderer.render(this.scene, this.camera);
    this.gpuTimer.end();
    const t3 = performance.now();

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
        extra: vesselReadout(this.world.vessels[this.testVesselId], this.simDebug) + this.boatPartsLine(dt),
      },
      inXR,
    );
    this.keyboard.endFrame();
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
    this.syncRigToPlayer(dt);
    this.cargoHands.tick(this.cargoCtx(), dt);
    this.rescueHands.tick(this.rescueCtx(), dt);
    this.frameDt = dt;
    if (!inXR) {
      // Binoculars (hold Z): zoomed in, the mouse look slows to match.
      this.desktop.lookScale = this.binoculars.updateDesktop(this.keyboard.action('binoculars') || !!this.pointer?.binocularsDown) / this.camera.zoom;
      this.desktop.update(dt);
    }
    // The boat we're on, posed for this frame before hit-testing its controls (else they're
    // where the last frame drew them: a frame behind the reticle and hands).
    const onboard = this.world.players[this.localPlayerId]?.aboardVesselId;
    if (onboard) this.vesselViews.get(onboard)?.root.updateMatrixWorld();
    this.updateInteraction(inXR);
    this.updateLocomotion(dt, inXR);
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

  /** Light, sky and sea around the head. */
  private updateSurroundings(renderTime: number): void {
    this.environment.update(this.world.environment, this.focus, this.world.time);
    this.sky.update(this.environment, this.focus);
    this.ocean.update(this.renderWaves, this.focus, this.environment, renderTime);
    this.probes.update(this.renderWaves, this.camera);
  }

  /** The workboat's engine, horn and alarm sounds; her bridge, tender crane, tillers and wheelhouse. */
  private updateOwnBoat(dt: number, nowMs: number): void {
    const testView = this.vesselViews.get(this.testVesselId);
    if (testView) {
      // Engine room sits roughly under the wheelhouse.
      const distance = testView.root.localToWorld(this.tmpV.set(0, 0, 1)).distanceTo(this.focus);
      const submerged = this.exhaustSubmersion(testView.root, this.world.vessels[this.testVesselId], nowMs / 1000);
      // In the wheelhouse the engine's quieter (more so with the door shut); full on deck.
      const ws = CONFIG.wheelhouseSound;
      const house = this.insideHouse ? (this.closed > 0 ? [ws.engineShut, ws.engineShutLp] : [ws.engineInside, ws.engineInsideLp]) : [1, 20000];
      this.sound.engine.update(this.world.vessels[this.testVesselId], distance, submerged, house[0], house[1]);
      const v = this.world.vessels[this.testVesselId];
      this.sound.horn.update(v.controls.horn > 0 && isPowered(v), distance); // electric horn
      // Bridge buzzer: high temperature always, low fuel while the engine runs.
      const al = engineAlarms(v, this.testDef);
      const consoleDist = this.bridge ? this.bridge.dashAnchor.getWorldPosition(this.tmpV).distanceTo(this.focus) : 99;
      this.sound.alarm.update(al.highTemp || (al.lowFuel && v.engine.phase === 'running'), consoleDist);
    }
    // Bridge controls and displays read the (just-updated) vessel state.
    const testVessel = this.world.vessels[this.testVesselId];
    if (this.bridge && testVessel) {
      {
        const p = this.ourSkiff()?.tender;
        const on = p?.phase === 'free' ? p.painter?.cleat : undefined;
        for (const c of this.bridge.cleats) c.painterOn = c.index === on;
      }
      this.bridge.update(testVessel, dt, this.dashInView(), this.world.environment);
      this.bridge.radio.update(this.world.rescue, runStatus(this.world), dt, isPowered(testVessel, 'radio'), towAlertT(this.world) >= 0 || fireAlertT(this.world) >= 0);
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
      for (const t of this.tillers) {
        const sv = this.world.vessels[t.vesselId];
        if (!sv) continue;
        t.sync(sv);
        t.tick(dt);
        for (const c of t.parts) if (c instanceof Cleat) c.sync(sv);
        this.sound.motor.update(sv.controls.obOn > 0 ? Math.sign(sv.controls.obGear) * sv.controls.lever : 0, sv.battery ?? 0, t.root.getWorldPosition(this.tmpV).distanceTo(this.focus));
      }
      this.bridge.chart.marks = CONFIG.chartMarks.showOnPlotter ? this.marks : null;
      this.bridge.chart.update(this.world, this.testVesselId, dt, this.dashInView());
      this.updateRadioSound();
    }
  }

  /** Each boat's lights and spray (returns the workboat's slam and lap); the tow, logs, trawl, fire, wildlife. */
  private updateBoatsAndJobs(dt: number, renderTime: number, darkness: number): { slam: number; lap: number } {
    let slam = 0;
    let lap = 0;
    for (const [id, fx] of this.effects) {
      if (!this.world.vessels[id]) continue;
      const hit = fx.update(dt, this.world.vessels[id], this.renderWaves, this.focus, darkness, renderTime);
      if (id === this.testVesselId) ({ slam, lap } = hit);
    }
    this.towline.update(this.world, this.vesselRoots, this.testVesselId, this.renderWaves);
    this.painter.update(this.world, this.vesselRoots, this.renderWaves);
    this.logView.update(this.world, this.renderWaves, renderTime);
    this.trawlView.update(this.world, this.vesselRoots.get(this.testVesselId) ?? null, this.renderWaves, renderTime);
    this.fireView.update(this.world, this.renderWaves, renderTime, dt);
    this.jetView.update(this.world, this.world.vessels[this.testVesselId], this.vesselRoots.get(this.testVesselId), renderTime);
    {
      const fj = this.world.fire?.job;
      const tv = this.world.vessels[this.testVesselId];
      const burning = fj && fj.phase !== 'calling' ? fj.intensity : 0;
      const dist = fj ? Math.hypot(fj.x - this.focus.x, fj.z - this.focus.z) : 1e9;
      this.bridge?.fireGauge?.update(fj ?? null);
      this.sound.fire.update(burning, dist, !!tv && jetOn(tv), this.insideHouse ? this.closed : 0, fj && fj.phase === 'accepted' ? fj.wetting : 0);
      // The anchor chain over the bow roller and the windlass.
      const root = this.vesselRoots.get(this.testVesselId);
      const hawse = this.testDef.anchor && root ? root.localToWorld(this.tmpV.fromArray(this.testDef.anchor.hawse)).distanceTo(this.focus) : 1e9;
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
    this.worldView.lights.update(renderTime, darkness);
    this.navMarks.update(this.renderWaves, renderTime, darkness);
    this.targetsView.visibility = this.environment.visibility;
    this.updateWeatherViews(renderTime, darkness, dt);
    this.targetsView.update(this.world, this.renderWaves, this.focus, darkness, renderTime, dt, this.testVesselId, this.vesselRoots.get(this.testVesselId));
    this.gearView.update(this.world, this.testVesselId, this.vesselRoots.get(this.testVesselId), this.renderWaves, this.rescueHands, this.localPlayerId, this.avatarHands);
    this.updateRescueSounds();
  }

  /** The whiteboard and duty board, the chart table, what this browser keeps, the FM, the listener. */
  private updateBoardsAndSaves(dt: number): void {
    const testVessel = this.world.vessels[this.testVesselId];
    this.noteKeys.menu.refresh();
    if (this.board) {
      this.board.update(this.world);
      this.dutyBoard?.update(this.world, this.host ? `Game code ${this.host.code}` : '');
      // A duty ticked off: a small tick.
      const done = this.world.duties?.completed ?? 0;
      if (this.dutiesDone >= 0 && done > this.dutiesDone) this.sound.rescue.snap();
      this.dutiesDone = done;
      // Host / solo: keep the notes in this browser, so they survive a reload.
      const b = this.world.board;
      if (b && !this.client && b.seq !== this.boardSaved) {
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
    // Host / solo: keep the rescue count in this browser too.
    const done = this.world.rescue?.completed ?? 0;
    if (!this.client && done !== this.rescuesSaved) {
      this.rescuesSaved = done;
      try {
        localStorage.setItem(RESCUES_KEY, String(done));
      } catch {
        // Not saved.
      }
    }
    if (this.bridge && testVessel) {
      const c = testVessel.controls;
      this.fmRadio.update(c.fmOn > 0 && isPowered(testVessel, 'radio'), c.fmStation, this.bridge.overhead.root.getWorldPosition(this.tmpV).distanceTo(this.focus));
      this.bridge.overhead.fmStatus = this.fmRadio.status;
    }
    if (this.world.rescue?.active) {
      // Spatial sounds (the survivor's whistle) hear from the head.
      this.camera.getWorldDirection(this.listenerFwd);
      this.listenerUp.set(0, 1, 0).applyQuaternion(this.camera.getWorldQuaternion(this.attQ));
      this.sound.whistle.setListener(this.focus, this.listenerFwd, this.listenerUp);
    }
  }

  /** Port floodlights, cargo, the desktop hand, our pose out and the crew's avatars in. */
  private updateCrewViews(dt: number, inXR: boolean, darkness: number): void {
    // Wheelhouse panel lighting: dims with the dark; the NIGHT switch turns it red.
    updatePanelLighting(darkness, (this.world.vessels[this.testVesselId]?.controls.panelRed ?? 0) > 0.5, dt);
    this.worldView.portLighting.update(this.focus, darkness);
    this.ocean.setPortLight(this.worldView.portLighting.flood);
    const fxTest = this.effects.get(this.testVesselId);
    // The sea has one spotlight pool: the searchlight's, or (with it off) your torch's.
    const spot = fxTest?.searchlight?.light;
    const torch = this.gear[1].light;
    if (torch?.visible && !(spot && spot.intensity > 0)) this.ocean.setSpotlight(torch);
    else if (spot) this.ocean.setSpotlight(spot);
    this.cargoView.update(this.world, this.vesselRoots, (c) => this.carriedPose(c), this.cargoHands.hovered);
    const deskHand = inXR ? null : this.desktopHandWorld(this.deskHandW);
    if (deskHand) this.desktopHand.setColor(playerColor(this.localPlayerId));
    this.desktopHand.update(this.camera, deskHand, dt);
    this.updateNetPose(dt);
    this.avatars.update(this.world, this.localPlayerId, this.vesselRoots, dt);
    this.updateGear(darkness);
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
      this.sound.water.update(Math.hypot(washBoat.linearVelocity[0], washBoat.linearVelocity[2]), washBoat === testVessel ? slam : 0, washBoat === testVessel ? lap : 0, washD, dt, muffle);
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
    const anchor = this.bridge?.dashAnchor;
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
    if (k.actionPressed('toggleOverlay') || this.xrInput.wasPressed('right', XR_BUTTON.secondary)) this.overlay.toggle();
    if (k.actionPressed('menu') || this.xrInput.wasPressed('left', XR_BUTTON.secondary)) this.toggleMenu();
    if (k.actionPressed('toggleHelp')) this.help.toggle();
    if (k.actionPressed('toggleProbes')) this.probes.toggle();
    if (k.actionPressed('toggleHydro')) for (const h of this.hydroViews.values()) h.toggle();
    if (k.actionPressed('dropVessel')) this.pushVesselIntent('debugDrop', 0);
    if (k.actionPressed('flyMode')) this.desktop.toggleFly();
    if (k.actionPressed('lash') && !this.renderer.xr.isPresenting) {
      this.camera.getWorldPosition(this.tmpRay.origin);
      this.camera.getWorldDirection(this.tmpRay.direction);
      this.cargoHands.desktopLash(this.cargoCtx(), this.tmpRay);
    }
    this.handleDebugDriving(dt);
    if (k.actionPressed('engine')) this.requestEngineStartStop();
    // Crouch: X (VR) or C (desktop, walking) toggles it.
    if (this.xrInput.wasPressed('left', XR_BUTTON.primary) || (k.actionPressed('crouch') && this.desktop.mode === 'walk' && !this.interaction?.steering)) {
      this.crouched = !this.crouched;
    }
    // Motion coupling: in the menu, or 9 / 0 (desktop).
    let dc = 0;
    if (k.actionPressed('couplingDown')) dc = -0.1;
    if (k.actionPressed('couplingUp')) dc = 0.1;
    if (dc !== 0) this.setCoupling(this.decoupler.coupling + dc);
    if (k.actionPressed('board') || this.xrInput.wasPressed('left', XR_BUTTON.stick)) this.toggleBoard();
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
    const id = this.drivenVesselId();
    const v = this.world.vessels[id];
    if (!v) return;
    const k = this.keyboard;
    const cfg = CONFIG.debugDriving;
    const leverIn = (k.action('leverAhead') ? 1 : 0) - (k.action('leverAstern') ? 1 : 0);
    const helmIn = (k.action('helmStarboard') ? 1 : 0) - (k.action('helmPort') ? 1 : 0);

    const outboard = !!VESSEL_DEFS[v.defId]?.outboard;
    // An outboard's throttle is the gear (sign) times the twist grip (0..1); the keys drive
    // that as one signed command, switching the motor on if needed.
    let lever = outboard ? Math.sign(v.controls.obGear) * v.controls.lever : v.controls.lever;
    const before = lever;
    if (outboard && leverIn !== 0 && v.controls.obOn <= 0) this.pushIntentTo(id, 'obPower', 1);
    if (leverIn !== 0) {
      const next = clamp(lever + leverIn * cfg.leverRate * dt, -1, 1);
      // Stop briefly at the neutral detent when passing through it.
      lever = Math.sign(next) !== Math.sign(lever) && lever !== 0 ? 0 : next;
    }
    if (k.actionPressed('leverNeutral')) lever = 0;
    if (outboard) {
      if (lever !== before) {
        const g = Math.sign(lever);
        if (g !== Math.sign(v.controls.obGear)) this.pushIntentTo(id, 'obGear', g);
        this.pushIntentTo(id, 'lever', Math.abs(lever));
      }
    } else if (lever !== v.controls.lever) this.pushIntentTo(id, 'lever', lever);

    let helm = v.controls.helm;
    if (helmIn !== 0) helm = clamp(helm + helmIn * cfg.helmRate * dt, -1, 1);
    if (k.actionPressed('helmMidships')) helm = 0;
    if (helm !== v.controls.helm) this.pushIntentTo(id, 'helm', helm);
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
      const n = countBoatParts(root, (p) => Math.abs(p.x) < wh.halfWidth && p.z > wh.front && p.z < wh.aft && p.y > wh.floorY - 0.2 && p.y < wh.roofY);
      this.partsText = `\nboat parts drawn ${n.drawn} (wheelhouse ${n.inside})`;
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
    const def = asWorkboat(VESSEL_DEFS[v.defId]);
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

  /** Play new radio traffic (and repeat the alert of an unanswered call); show it as a notice too. */
  private updateRadioSound(): void {
    const r = this.world.rescue;
    if (!r || !this.bridge) return;
    const id = r.radio?.id ?? 0;
    const alertT = r.active?.phase === 'calling' ? r.active.alertT : Math.max(towAlertT(this.world), fireAlertT(this.world));
    this.sound.radio.setDistance(this.bridge.radio.root.getWorldPosition(this.tmpV).distanceTo(this.focus));
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
  private gearTakenByOther(kind: GearKind): boolean {
    return Object.values(this.world.players).some((p) => p.id !== this.localPlayerId && p.avatar?.gear?.kind === kind);
  }

  /** Hand gear as everyone sees it: sprays, beams, crew-mates' gear; the brackets' state. */
  private updateGear(darkness: number): void {
    const mine = this.gear.find((g) => g.held);
    let local: { kind: GearKind; on: boolean; p: THREE.Vector3; d: THREE.Vector3 } | null = null;
    if (mine) {
      const p = new THREE.Vector3();
      const d = new THREE.Vector3();
      mine.tipWorld(p, d);
      local = { kind: mine.kind, on: mine.on, p, d };
    }
    this.handGearView.update(this.world, this.localPlayerId, local, this.vesselRoots, darkness);
    // On the bracket: hidden while a crew-mate has it (it's in their hand).
    for (const g of this.gear) if (!g.held) g.mesh.visible = !this.gearTakenByOther(g.kind);
    // Spraying an empty extinguisher: say so once.
    const ext = this.gear[0];
    const empty = (extinguisherShip(this.world)?.extCharge ?? 1) <= 0;
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
      const headL = frame.worldToLocal(this.tmpV.copy(this.headW));
      if (area.ladderAt(headL.x, headL.z)) return false; // Space climbs ladders
      const v = p.aboardVesselId ? this.vesselViews.get(p.aboardVesselId) : undefined;
      jump(p, v && p.aboardVesselId ? { root: v.root, state: this.world.vessels[p.aboardVesselId] } : null, this.headFwd);
      this.keepViewOnReparent = true;
      return true;
    }
    if (mode === 'air') {
      const ev = updateAir(p, dt, headOffset, this.bodyVessels(), this.worldArea, this.renderWaves);
      if (ev) this.keepViewOnReparent = true;
      if (ev === 'landedDeck' || ev === 'landedLand') pulseBoth(0.5, 50);
      if (ev === 'splash') {
        pulseBoth(0.7, 120);
        this.sound.water.splash(1);
        this.cargoHands.dropInSea(this.cargoCtx());
        this.rescueHands.dropAll(this.rescueCtx());
      }
      this.comfortOverlay.update(dt, 0.6, false);
      return true;
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
    if (out) {
      this.keepViewOnReparent = true;
      pulseBoth(0.4, 60);
      return true;
    }
    this.runLocomotion(dt, inXR, this.scene, this.swimArea, CONFIG.body.swimSpeed / CONFIG.locomotion.smoothSpeed, false);
    this.camera.getWorldPosition(this.headW);
    const ev = updateSwim(p, dt, this.bodyW.copy(this.headW).setY(p.position[1]), headHeight, this.bodyVessels(), this.worldArea, this.renderWaves);
    if (ev) this.keepViewOnReparent = true;
    return true;
  }

  /** Grab-the-world, stick and desktop movement, collision, floor following, comfort overlay. */
  private updateLocomotion(dt: number, inXR: boolean): void {
    const p = this.world.players[this.localPlayerId];
    const frame = (p.aboardVesselId && this.vesselViews.get(p.aboardVesselId)?.root) || this.scene;
    const area = (p.aboardVesselId && this.walkAreas.get(p.aboardVesselId)) || this.worldArea;
    // Head from the camera's pose relative to the rig (fresh this frame; see syncRigToPlayer).
    this.camera.getWorldPosition(this.headW);
    this.camera.getWorldDirection(this.headFwd);
    if (!this.updateBody(dt, inXR, area, frame)) this.runLocomotion(dt, inXR, frame, inXR ? area : this.withDoor(area, p.aboardVesselId), 1, inXR);
    this.placeDebugPanel(inXR);
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
    const inAft = (x: number, z: number, y: number) => aftShut && Math.abs(x) < wh.doorWidth / 2 + 0.15 && Math.abs(z - wh.aft) < 0.3 && y < wh.floorY + 0.5;
    const inSide = (x: number, z: number, y: number) => sideShut && !!sd && Math.abs(x + wh.halfWidth) < 0.3 && z > sd.z0 - 0.15 && z < sd.z1 + 0.15 && y < wh.floorY + 0.5;
    return { ...area, walkable: (x, z, y) => area.walkable(x, z, y) && !inAft(x, z, y) && !inSide(x, z, y) };
  }

  /** `fly`: VR on foot - grab-the-world moves freely in 3D, nothing collides (see Locomotion). */
  private runLocomotion(dt: number, inXR: boolean, frame: THREE.Object3D, area: WalkArea, speedScale: number, fly: boolean): void {
    const p = this.world.players[this.localPlayerId];

    const grabbing = { left: null as THREE.Vector3 | null, right: null as THREE.Vector3 | null };
    if (inXR) {
      for (const h of ['left', 'right'] as const) {
        if (this.xrInput.isDown(h, XR_BUTTON.grip) && !this.busyHands[h]) grabbing[h] = this.controllers.worldPosition(h, this.gripW[h]);
      }
    }
    let desktopDelta: { x: number; y: number; z: number } | null = null;
    const steering = !inXR && this.interaction?.steering;
    if (steering) {
      // WASD steer the clicked control (the searchlight or monitor joystick, the skiff's
      // outboard) instead of walking.
      const k = this.keyboard;
      this.interaction!.steerKeys((k.action('right') ? 1 : 0) - (k.action('left') ? 1 : 0), (k.action('forward') ? 1 : 0) - (k.action('back') ? 1 : 0));
    } else if (!inXR && this.desktop.mode === 'walk' && !this.interaction?.desktopHeld) {
      // (Not while the mouse holds a control - dragging a lever or the wheel: you stay put.)
      const { x, y, z } = this.desktop.walk;
      const c = Math.cos(p.yaw);
      const s = Math.sin(p.yaw);
      desktopDelta = { x: (x * c + z * s) * speedScale, y, z: (-x * s + z * c) * speedScale };
    }
    const [lx, ly] = this.xrInput.hands.left.stick;
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
      turnStick: inXR ? this.xrInput.hands.right.stick[0] : 0,
      desktopDelta,
      fly,
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
    const aboard = this.world.players[this.localPlayerId].aboardVesselId;
    this.intents.push({
      playerId: this.localPlayerId,
      targetId: this.localPlayerId,
      control: 'board',
      value: aboard ? 0 : 1,
      ref: aboard ? undefined : this.testVesselId,
    });
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
    const machine = channel === 'crane' ? 'The crane' : channel === 'winchHeave' || channel === 'winchPayOut' ? 'The tow winch' : channel === 'netOut' || channel === 'netIn' || channel === 'trawl' ? 'The net drum' : null;
    const v = this.world.vessels[this.testVesselId];
    if (!machine || !v || hydraulicsOn(v)) return;
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

  /** The painter clicked (at `cleat`, -1 her bow cleat): say what happens, or why not. */
  private painterHint(skiff: VesselState, cleat: number): void {
    const plan = painterPlan(this.world, skiff, cleat);
    if (plan.action === 'castOff') this.overlay.notify(`Painter let go from the ${cleatName(plan.cleat)}`, 2.5);
    else if (plan.action === 'makeFast') this.overlay.notify(`Painter made fast to the ${cleatName(plan.cleat)} (${plan.length.toFixed(1)} m)`, 3);
    else this.overlay.notify(`Painter: ${plan.why}`, 3);
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
    const def = this.testDef;
    // Crane: on the move between cradle and water (unfolding, lifting, slewing, lowering).
    const tp = this.skiff()?.tender?.phase;
    const cr = def.tenderCrane;
    const craneRun = hyd && (tp === 'lowering' || tp === 'hoisting') ? 1 : 0;
    // Tow winch: a button held; stalled heaving against more pull than it has.
    const line = this.world.tow?.line;
    const c = v.controls;
    const heave = (c.winchHeave ?? 0) > 0.5;
    const payOut = (c.winchPayOut ?? 0) > 0.5;
    const stalled = hyd && winchStalled(this.world);
    // The drum only turns while the line can still move (inside the winch's limits).
    const w = CONFIG.tow.winch;
    const L = line ? lineLength(line) : 0;
    const canMove = heave ? L > w.minLength + 0.01 : L < w.maxLength - 0.01;
    const winchRun = hyd && line && heave !== payOut && !stalled && canMove ? (heave ? 0.8 : 1) : 0;
    const tw = def.towWinch;
    // Net drum: shooting or hauling, by the switch or the A-frame's buttons.
    const f = this.world.fishing;
    // A button only turns the drum while there's net left to pay out or haul in.
    const jog = ((c.netOut ?? 0) > 0.5 && (f?.t ?? 0) < 1) || ((c.netIn ?? 0) > 0.5 && (f?.t ?? 0) > 0);
    const trawlRun = hyd && f && (f.net === 'shooting' || f.net === 'hauling' || jog) ? 1 : 0;
    // The same drum takes the towline and the trawl warps: it turns only while one of them
    // is really moving under pressure (+1 coming in, -1 going out).
    const netIn = f?.net === 'hauling' || ((c.netIn ?? 0) > 0.5 && (f?.t ?? 0) > 0);
    if (this.bridge) this.bridge.drumTurn = winchRun ? (heave ? 1 : -1) : trawlRun ? (netIn ? 1 : -1) : 0;
    const af = aFrameOf(def);
    this.sound.hydraulics.update(
      {
        crane: { run: craneRun, load: tp === 'hoisting' ? 0.7 : 0.5, distance: cr ? dist(cr.column[0], cr.shoulderY, cr.column[1]) : 1e9 },
        winch: { run: winchRun, load: line ? Math.min(1, line.tension / CONFIG.tow.winch.pullN) : 0, stalled, distance: tw ? dist(0, 1.2, tw.z) : 1e9 },
        trawl: { run: trawlRun, load: f?.net === 'hauling' || (c.netIn ?? 0) > 0.5 ? 0.7 : 0.3, distance: af ? dist(0, af.top - 0.3, af.headZ) : 1e9 },
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
      timeOfDay: () => env().timeOfDay,
      shiftTime: (h) => this.pushEnvIntent('timeOfDayDelta', h),
      quietCalls: () => !!this.world.quietCalls,
      setQuietCalls: (on) => this.pushEnvIntent('quietCalls', on ? 1 : 0),
      timeScale: () => env().timeScale,
      setTimeScale: (v) => this.pushEnvIntent('timeScale', v),
      seaScale: () => env().seaScale,
      setSeaScale: (v) => this.pushEnvIntent('seaState', v),
      waveHeight: () => significantWaveHeight(env().waves),
      weatherStatus: () => {
        const w = env().weather;
        if (!w) return 'Fixed fair weather';
        const n = w.now;
        const vis = visibilityAt(env(), this.focus.x, this.focus.z);
        const visText = vis >= 10000 ? 'good' : vis >= 2000 ? 'moderate' : vis >= 1000 ? 'poor' : `fog ${Math.round(vis)} m`;
        return `${w.preset} · wind ${compass8(n.windFrom).toUpperCase()} ${beaufort(n.wind)} (${n.wind.toFixed(0)} m/s) · vis ${visText} · Hs ${significantWaveHeight(env().waves).toFixed(1)} m · next ${w.next.preset} in ${Math.max(0, (w.next.at - this.world.time) / 60).toFixed(0)} min`;
      },
      weatherPreset: () => env().weather?.preset ?? '',
      setWeather: (name) => this.pushEnvIntent('weatherForce', Object.keys(CONFIG.weather.presets).indexOf(name)),
      weatherFixed: () => env().weather?.fixed ?? true,
      setWeatherFixed: (on) => this.pushEnvIntent('weatherFixed', on ? 1 : 0),
      weatherFast: () => (env().weather?.speed ?? 1) > 1,
      setWeatherFast: (on) => this.pushEnvIntent('weatherSpeed', on ? 10 : 1),
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
        const due = Math.max(0, (this.testDef.maintenance?.checkEvery ?? 0) - (e?.sinceCheck ?? 0));
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
        if (skiff?.tender?.phase === 'stowed') return this.overlay.notify('The skiff is under her cover in the cradle: launch her first (SKIFF CRANE)', 3);
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
      heelBoat: () => this.pushVesselIntent('debugHeel', 20),
      fuel: () => ({ litres: boat().engine.fuelL, tank: this.testDef.engine.fuel.tankL }),
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
      skiffLoad: () => {
        const skiff = this.skiff();
        if (!skiff) return '-';
        const max = VESSEL_DEFS[skiff.defId].cargo.slots;
        return `${slotsUsed(this.world, skiff.id)} / ${max} slots · ${payloadMass(this.world, skiff.id)} kg · carry goods in and out by hand`;
      },
      dockStatus: () => {
        const m = boat().mooring;
        const b = berthById(m.berthId);
        if (m.phase === 'moored') return { text: `Moored: ${b?.name}`, ready: true, docked: true };
        if (m.phase === 'docking') return { text: `${m.bow && m.stern ? 'Lines coming taut' : m.bow ? 'Bow line fast' : 'Stern line fast'}: ${b?.name}`, ready: true, docked: true };
        if (b) return { text: `In range: ${b.name} (click the cleats fore and aft, or menu Dock)`, ready: true, docked: false };
        return { text: 'No berth in range (come slowly alongside a yellow-marked berth)', ready: false, docked: false };
      },
      toggleDock: () => {
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
            return a.rodeM >= this.testDef.anchor.chainM ? 'Too deep: not on the bottom' : `Off the bottom: ${a.rodeM.toFixed(0)} m out`;
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
      rescueNear: (kind) => this.pushVesselIntent('rescueDebugNear', 1, kind),
      rescueAboard: () => this.pushVesselIntent('rescueDebugAboard', 1),
      rescues: () => this.world.rescue?.completed ?? 0,
      towStatus: () => towStatus(this.world),
      towFast: () => !!this.world.tow?.line,
      towToggle: () => {
        // Cast off whatever's on the line, or make fast to the nearest thing in reach.
        if (!this.world.tow?.line && !nearestTowTarget(this.world)) this.overlay.notify(`Nothing to tow within ${CONFIG.tow.attachRange} m of our stern roller: back our stern up to a bow eye or debris`);
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
        const fg = [...CONFIG.fishing.grounds].sort((a, b) => Math.hypot(a.x - v.position[0], a.z - v.position[2]) - Math.hypot(b.x - v.position[0], b.z - v.position[2]))[0];
        this.pushVesselIntent('teleportToGround', 1, fg.name);
        if (this.world.players[this.localPlayerId].aboardVesselId !== this.testVesselId) this.toggleBoardTo(true);
        this.overlay.notify(`${fg.name}: TRAWL switch on, then 2-4 kn`, 3);
      },
      towEnd: () => this.pushVesselIntent('towDebugEnd', 1),
      fireNear: (kind) => this.pushVesselIntent('fireDebugNear', 1, kind),
      fireCall: () => this.pushVesselIntent('fireDebugCall', 1),
      fireEnd: () => this.pushVesselIntent('fireDebugEnd', 1),
      showTargets: () => !!this.bridge?.chart.showTargets,
      toggleShowTargets: () => {
        if (this.bridge) this.bridge.chart.showTargets = !this.bridge.chart.showTargets;
      },
      teleportToPort: (i) => {
        const port = PORTS[i];
        if (!port) return;
        this.pushVesselIntent('teleportToPort', 1, port.id);
        // Off the boat (ashore, swimming): come along, at the helm.
        if (this.world.players[this.localPlayerId].aboardVesselId !== this.testVesselId) this.toggleBoardTo(true);
        this.overlay.notify(port.cargo.berth ? `${port.name}: at the cargo berth, make fast at the cleats` : `${port.name}: in the bay, let go the anchor`, 3);
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
      hostGame: () => this.hostGame(),
      leaveGame: () => {
        this.netMessage = '';
        this.leaveGame();
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
      const w = this.world;
      w.tick = snap.tick;
      w.time = snap.time;
      w.environment = snap.environment;
      w.vessels = snap.vessels;
      w.cargo = snap.cargo;
      w.cargoSeq = snap.cargoSeq;
      w.deliveries = snap.deliveries;
      w.rescue = snap.rescue;
      w.board = snap.board;
      w.duties = snap.duties;
      w.forecast = snap.forecast;
      w.traffic = snap.traffic;
      w.tow = snap.tow;
      w.fire = snap.fire;
      w.salvage = snap.salvage;
      w.fishing = snap.fishing;
      w.career = snap.career;
      w.lost = snap.lost;
      w.geography = snap.geography;
      w.players = { ...snap.players, [this.localPlayerId]: me };
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
    if (!this.host && this.client?.status !== 'connected') {
      // Solo: no pose to send, but the simulation still needs your hand gear (the
      // extinguisher on a fire), which it reads from your avatar like a crew-mate's.
      const me = this.world.players[this.localPlayerId];
      if (!me) return;
      const frame = this.playerFrame();
      frame.updateMatrixWorld();
      this.invFrame.copy(frame.matrixWorld).invert();
      const gear = this.gear.map((g) => g.pose(this.invFrame)).find((x) => x) ?? null;
      if (gear) me.avatar = { ...(me.avatar ?? { head: [0, 0, 0, 0, 0, 0, 1], left: null, right: null }), gear };
      else if (me.avatar) me.avatar.gear = null;
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
    const hand = (h: 'left' | 'right') => {
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
      tool: this.chartTools?.heldTool() ?? null,
      laser: this.laser.pose(this.invFrame),
      gear: this.gear.map((g) => g.pose(this.invFrame)).find((x) => x) ?? null,
    };
    if (this.host) {
      p.name = pose.name;
      p.avatar = { head: pose.head, left: pose.left, right: pose.right, leftQ: pose.leftQ, rightQ: pose.rightQ, tool: pose.tool, laser: pose.laser, gear: pose.gear };
      return;
    }
    this.poseTimer += dt;
    if (this.poseTimer < 1 / NET_RATE) return;
    this.poseTimer = 0;
    this.client!.sendPose(pose);
  }

  /** Host a game: register a room code with the PeerJS server, then accept crew. */
  private hostGame(): void {
    if (this.host || this.client || this.hostStarting) return;
    const code = randomRoomCode();
    const transport = new PeerHostTransport(code);
    this.hostStarting = true;
    this.netMessage = 'Opening a game...';
    transport.ready.then(
      () => {
        this.hostStarting = false;
        this.host = new HostSession(this.world, this.ids, transport, code);
        this.host.marks = this.marks;
        this.netMessage = '';
        this.overlay.notify(`Hosting: game code ${code}`, 4);
      },
      (e: { type?: string }) => {
        this.hostStarting = false;
        transport.close();
        this.netMessage = `Couldn't host (${e?.type ?? 'network'})`;
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
    try {
      localStorage.setItem(LAST_CODE_KEY, this.joinCode);
    } catch {
      // Not remembered.
    }
    this.connectClient(new PeerClientTransport(this.joinCode));
  }

  /** The crew, for the menu. */
  private crewMenu() {
    return {
      crewList: () => {
        const names = Object.values(this.world.players).map((p) => (p.id === this.localPlayerId ? `${p.name} (you)` : p.name));
        return names.length > 1 ? `Aboard: ${names.join(', ')}` : 'Just you';
      },
    };
  }

  /** Become a client over `transport` (PeerJS, or the in-memory loopback in tests). */
  private connectClient(transport: ClientTransport): void {
    const client = new ClientSession(transport, userSettings.playerName);
    this.client = client;
    this.netMessage = '';
    client.onChart = (op) => applyChartOp(this.marks, op);
    client.onWelcome = (playerId, world, chart) => {
      // The host's chart: their marks replace ours while we're aboard their boat.
      this.marks = chart ? { strokes: chart.strokes, seq: this.marks.seq + 1 } : createMarks();
      // Same boats on both sides (tows come and go, so they don't count).
      if (!Object.values(world.vessels).every((v) => this.vesselViews.has(v.id) || VESSEL_DEFS[v.defId]?.tow)) {
        this.netMessage = 'That game is a different version';
        this.leaveGame();
        return;
      }
      // Become the player the host made for us; keep standing where we are.
      this.movePlayer(playerId);
      this.overlay.notify('Joined: you are aboard the host\'s world', 3);
    };
    client.onClosed = (reason) => {
      if (this.client !== client) return;
      this.netMessage = reason;
      this.toSolo();
    };
  }

  /** Stop hosting, or leave the game we joined; play on alone from where things are. */
  private leaveGame(): void {
    if (this.host) {
      this.host.close();
      this.host = null;
    }
    if (this.client) {
      const c = this.client;
      this.client = null;
      c.close();
    }
    this.toSolo();
  }

  private toSolo(): void {
    this.client = null;
    for (const id of Object.keys(this.world.players)) {
      if (id === this.localPlayerId) continue;
      dropCarried(this.world, id);
      delete this.world.players[id];
    }
    // What we carried was ours under the host's id: it stays in our hands under our own.
    for (const c of carriedBy(this.world, this.localPlayerId)) c.at = { carriedBy: this.soloPlayerId };
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
      return `Hosting, code ${this.host.code}: ${n} aboard`;
    }
    if (this.client) return this.client.status === 'connected' ? `In game ${this.joinCode}` : `Joining ${this.joinCode}...`;
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

  /** The test vessel's type: the fully equipped workboat (bridge, engine, lights...). */
  private get testDef(): WorkboatDef {
    return asWorkboat(VESSEL_DEFS[this.world.vessels[this.testVesselId].defId]);
  }

  /** Bridge controls for the test vessel, the interaction system and desktop mouse/reticle. */
  private setupBridge(): void {
    const v = this.world.vessels[this.testVesselId];
    const view = this.vesselViews.get(this.testVesselId);
    if (!v || !view) return;
    this.bridge = new Bridge(this.testDef);
    view.root.add(this.bridge.root);
    // Crew whiteboard on the wheelhouse aft wall, facing forward.
    const wb = this.testDef.whiteboard;
    this.board = new BoardView(wb.width, wb.height);
    this.board.root.position.fromArray(wb.position);
    this.board.root.rotation.y = Math.PI;
    view.root.add(this.board.root);
    this.scene.add(this.board.rayLine);
    // Wind sock at the masthead.
    const wh = this.testDef.layout.wheelhouse;
    this.windSock = new WindSock([0, wh.roofY + 1.7, 0.4]);
    view.root.add(this.windSock.root);
    // Duty board (game tasks, shipping forecast) on the starboard wall.
    const db = this.testDef.dutyBoard;
    if (db) {
      this.dutyBoard = new DutyBoardView(db);
      view.root.add(this.dutyBoard.root);
    }
    // Chart table on the port side, aft half: the paper chart and its lamp.
    const ct = this.testDef.chartTable;
    if (ct) {
      this.chartTable = new ChartTableView(ct, wh.floorY);
      view.root.add(this.chartTable.root);
      this.bridge.controls.push(this.chartTable.lampSwitch, this.chartTable.leafHandle);
      this.chartTools = new ChartTools(this.chartTable);
      // On the leaf: the marks and tools fold with it.
      this.chartTable.leafFrame.add(this.chartTools.root);
    }
    this.restoreBatteries();
    try {
      // The career (money, reputation, upgrades, her condition) carries on from the last
      // session here, in the slot last used. A first career starts with the first voyage.
      if (!this.client) this.career.restore();
      this.joinCode = localStorage.getItem(LAST_CODE_KEY) ?? '';
      if (!this.client) this.marks = parseMarks(localStorage.getItem(CHART_KEY)) ?? this.marks;
      this.world.board ??= parseBoard(localStorage.getItem(BOARD_KEY)) ?? undefined;
      // Rescues completed in this browser so far (milestone 4).
      const n = Number(localStorage.getItem(RESCUES_KEY));
      if (Number.isFinite(n) && n > 0) (this.world.rescue ??= createRescueState()).completed = Math.floor(n);
    } catch {
      // No storage: an empty board, no count.
    }
    this.interaction = new InteractionSystem(
      [...this.bridge.controls, ...this.tillers.flatMap((t) => t.parts), ...this.cranes.flatMap((d) => d.buttons), ...this.gear.map((g) => g.bracket)],
      (channel, value) => {
        if (channel === 'engineStartStop') return this.requestEngineStartStop();
        if (channel === 'start' && value > 0) this.startInGearHint();
        if (channel === 'dipstick') this.readDipstick();
        if (channel === 'cleat') this.cleatHint(value);
        // A gear bracket (desktop): take the gear or hang it back. Local: no intent. In VR the
        // grip takes it.
        if (channel.startsWith('gear:')) {
          const g = this.gear.find((x) => `gear:${x.kind}` === channel);
          if (g && !this.renderer.xr.isPresenting) {
            for (const o of this.gear) if (o !== g && o.held) o.hangBack(); // one at a time
            if (!g.held && this.gearTakenByOther(g.kind)) this.overlay.notify('A crew-mate has it', 2);
            g.toggleDesk(this.gearTakenByOther(g.kind));
          }
          return;
        }
        // A midship cleat: the painter's on the skiff (aimed at her), whichever cleat leads it.
        if (channel === 'painterCleat' || channel.endsWith(':painter')) {
          const skiff = this.ourSkiff();
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
          const { vesselId, control } = this.routeChannel(c.channel);
          const who = this.world.vessels[vesselId]?.holds[control];
          return !!who && who !== this.localPlayerId;
        },
        holdChanged: (c, held) => {
          const { vesselId, control } = this.routeChannel(c.channel);
          this.pushIntentTo(vesselId, 'hold', held ? 1 : 0, control);
        },
      },
    );
    this.scene.add(this.interaction.rayLine('left'), this.interaction.rayLine('right'));
    this.pointer = new DesktopPointer(this.renderer.domElement, this.desktop, this.interaction, this.menu, this.desktopCargo());
    this.pointer.gearHeld = () => this.gear.some((g) => g.held === 'desk');
    if (this.chartTools) {
      const tools = this.chartTools;
      // Drawing on the chart only with the leaf unfolded.
      this.pointer.chart = (ray, b) => (this.chartTable?.isOpen ? tools.updateDesktop(this.chartCtx(), ray, b, this.frameDt) : { label: null, consumed: false });
    }
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
        const used = g.updateXR(this.hands, this.busyHands, this.gearTakenByOther(g.kind), (h, i, ms) => this.xrInput.pulse(h, i, ms));
        for (const h of ['left', 'right'] as const) {
          if (!used[h]) continue;
          const f = this.hands[h];
          f.gripDown = f.gripPressed = f.triggerDown = f.triggerPressed = false;
          f.trigger = 0;
          onBino[h] = true; // busy for the rest of the frame
        }
      }
      // The chart table's tools: a hand holding one gives its grip and trigger to the tool.
      const onTools = this.chartTools && this.chartTable?.isOpen ? this.chartTools.updateXR(this.chartCtx(), this.hands, this.busyHands, this.frameDt) : { left: false, right: false };
      for (const h of ['left', 'right'] as const) {
        if (!onTools[h]) continue;
        const f = this.hands[h];
        f.gripDown = f.gripPressed = f.triggerDown = f.triggerPressed = false;
        f.trigger = 0;
      }
      this.busyHands = this.interaction.updateXR(this.hands);
      for (const h of ['left', 'right'] as const) if (onTools[h] || onBino[h]) this.busyHands[h] = true;
      this.cargoHands.updateXR(this.cargoCtx(), this.hands, this.busyHands);
      for (const h of ['left', 'right'] as const) if (this.cargoHands.busy(h)) this.busyHands[h] = true;
      this.rescueHands.updateXR(this.rescueCtx(), this.hands, this.busyHands, this.frameDt);
      for (const h of ['left', 'right'] as const) if (this.rescueHands.busy(h)) this.busyHands[h] = true;
      if (this.board && !this.noteKeys.isOpen) {
        const onBoard = this.board.updateXR(this.boardCtx(), this.hands, this.busyHands);
        for (const h of ['left', 'right'] as const) if (onBoard[h]) this.busyHands[h] = true;
      } else if (this.board) this.board.rayLine.visible = false;
      this.pointer?.hide();
      return;
    }
    this.pointer?.update(this.camera);
    for (const g of this.gear) g.updateDesktop(this.camera, !!this.pointer?.gearDown, !!this.pointer?.gearPressed);
    if (this.keyboard.actionPressed('hangGear')) for (const g of this.gear) if (g.held) g.hangBack();
  }

  /**
   * The laser pointer (laserPointer.ts): while the right stick is held in (VR) or the middle
   * mouse button is held (desktop; the right one is the binoculars). Desktop: aimed from the eyes, drawn from a "hand" down
   * and to the right of them.
   */
  private updateLaser(dt: number): void {
    const inXR = this.renderer.xr.isPresenting;
    const on = inXR ? this.xrInput.isDown('right', XR_BUTTON.stick) && this.hands.right.tracked : !!this.pointer?.laserDown;
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
        this.camera.getWorldPosition(this.headW);
        this.camera.getWorldDirection(this.headFwd);
        // The board first (the life ring hangs just behind it, outside the wall), unless
        // the mouse already holds rescue gear or cargo.
        const free = !this.cargoHands.carrying;
        const board = free && !this.rescueHands.deskBusy && this.board ? this.board.label(this.boardCtx(), ray) : null;
        const gear = free && !board ? this.rescueHands.updateDesktop(this.rescueCtx(), ray, this.headW, this.headFwd, this.frameDt) : null;
        return board ?? gear ?? this.cargoHands.updateDesktop(this.cargoCtx(), ray, this.headW, this.headFwd);
      },
      click: (ray: THREE.Ray | null) => {
        this.camera.getWorldDirection(this.headFwd);
        if (!this.cargoHands.carrying && !this.rescueHands.deskBusy && this.board?.click(this.boardCtx(), ray)) return true;
        if (!this.cargoHands.carrying && this.rescueHands.desktopClick(this.rescueCtx(), ray, this.headFwd)) return true;
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
    // The cabin lamp lights the chart; red (night) only faintly.
    const cabin = isPowered(v, 'deckLights') ? v.controls.cabinLight : 0;
    const level = Math.min(1, Math.max(0.04, this.environment.ambientIntensity * 1.1 + (cabin === 1 ? 0.45 : cabin === 2 ? 0.12 : 0) + (lamp ? 1 : 0)));
    this.chartTable.setLight(level, lamp);
    // From outside the wheelhouse the chart, bulb, tools and marks are too
    // small to matter (and mostly behind the aft wall): skip their draw calls.
    const wh = this.testDef.layout.wheelhouse;
    const l = this.chartTable.root.worldToLocal(this.tableRef.copy(this.focus));
    const near = Math.abs(l.x) < wh.halfWidth + 0.3 && l.z > wh.front - 0.3 && l.z < wh.aft + 0.6 && l.y > wh.floorY - 0.5;
    this.chartTable.setDetail(near);
    if (this.chartTools) this.chartTools.root.visible = near;
    this.chartTools?.refresh(this.marks);
    // Tools a crewmate is holding aren't lying on our table.
    if (this.chartTools) {
      const held = new Set<string>();
      for (const p of Object.values(this.world.players)) if (p.id !== this.localPlayerId && p.avatar?.tool) held.add(p.avatar.tool.kind);
      this.chartTools.setRemoteHeld(held);
    }
    // Host / solo: keep the chart marks in this browser (at most once a second).
    this.marksSaveT += dt;
    if (!this.client && this.marks.seq !== this.marksSaved && this.marksSaveT > 1) {
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

  /** The rescue hands' view of the app. */
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
    const now = { cheer: r?.cheer ?? 0, shout: r?.shout?.id ?? 0, ring: r?.ring?.state ?? 'stowed' };
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
    if (!root || !this.bridge) return;
    if (!this.interior) {
      this.interior = new InteriorDetail([this.bridge.root, root], root, this.testDef);
      if (CONFIG.debug.logDetail) console.info(`interior detail: ${this.interior.count} parts`);
    }
    const me = this.world.players[this.localPlayerId];
    const aboard = me?.aboardVesselId === this.testVesselId;
    const eye = this.camera.getWorldPosition(this.detailV);
    if (aboard) root.worldToLocal(eye);
    this.interior.update(aboard ? eye : null);
    // The skiff's outboard and tiller: under her tarpaulin in the cradle (not drawn, not usable).
    for (const t of this.tillers) {
      const covered = this.world.vessels[t.vesselId]?.tender?.phase === 'stowed';
      t.root.visible = !covered;
      for (const c of t.parts) {
        c.enabled = !covered;
        if (c instanceof Cleat) c.root.visible = !covered;
      }
    }
  }

  /** Wind noise: the apparent wind where you are (minus your boat's way), muffled inside. */
  private updateWindSound(dt: number): void {
    const p = this.world.players[this.localPlayerId];
    const v = p?.aboardVesselId ? this.world.vessels[p.aboardVesselId] : undefined;
    windVector(this.world.environment, this.windV);
    const ax = this.windV.x - (v?.linearVelocity[0] ?? 0);
    const az = this.windV.z - (v?.linearVelocity[2] ?? 0);
    const wh = this.testDef.layout.wheelhouse;
    const inside = !!v && v.id === this.testVesselId && Math.abs(p.position[0]) < wh.halfWidth && p.position[2] > wh.front && p.position[2] < wh.aft && p.position[1] > wh.floorY - 0.3;
    this.insideHouse = inside;
    // How shut-in the wheelhouse is: the aft door decides.
    if (this.bridge) {
      this.bridge.door.tick(dt);
      this.bridge.sideDoor?.tick(dt);
      this.bridge.sideGate?.tick(dt);
      // Shut in only with both doors shut (the port side door, if she has one, too).
      this.closed = this.bridge.door.shut && (this.bridge.sideDoor?.shut ?? true) ? 1 : 0;
    }
    this.sound.wind.update(Math.hypot(ax, az), inside, dt, this.closed);
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
      const wh = this.testDef.layout.wheelhouse;
      const ov = this.testDef.layout.roof.overhang;
      this.rainHouse.matrixWorld.copy(view.root.matrixWorld);
      this.rainHouse.min.set(-wh.halfWidth - ov, wh.floorY - 1.5, wh.front - ov);
      this.rainHouse.max.set(wh.halfWidth + ov, wh.roofY + 0.3, wh.aft + ov);
      house = this.rainHouse;
    }
    windVector(env, this.windV);
    this.autoRainQuality(rain, dt);
    this.rain.update(rain, time, this.focus, this.windV, house, light);
    if (this.bridge && v) this.bridge.rainGlass.update(rain, v.controls.wipers > 0 && isPowered(v, 'instruments'), light, dt);
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
    const cfg = this.testDef.electrics;
    if (!v?.electrics || !cfg?.drainBetweenSessions || this.client) return;
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
      if (!e || this.client) return;
      try {
        localStorage.setItem(BATTERY_KEY, JSON.stringify({ soc: e.soc, master: e.master, t: Date.now() }));
      } catch {
        // Not saved.
      }
    });
  }

  /** Ships, debris and buoys on the waves; ships' fog horns; the lookout calls new ships. */
  private updateTraffic(v: VesselState | undefined, darkness: number, dt: number): void {
    this.trafficView.update(this.world, this.renderWaves, darkness, dt);
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

  /** START pressed with the lever in gear: the neutral-safety switch says no. */
  private startInGearHint(): void {
    const v = this.world.vessels[this.testVesselId];
    if (v && leverDemand(this.testDef, v.controls.lever).gear !== 0) {
      this.overlay.notify('Neutral safety: the lever must be in neutral to start', 2.5);
      this.xrInput.pulse('right', 0.8, 150);
    }
  }

  /**
   * Desktop E key: with the quick-start option, one press does it all (master, breakers,
   * key, preheat, start) or stops her; otherwise it points to the real procedure.
   */
  private requestEngineStartStop(): void {
    const v = this.world.vessels[this.testVesselId];
    if (!v) return;
    const def = this.testDef;
    if (!def.electrics?.quickStart) {
      if (v.engine.phase === 'off') this.overlay.notify('Start her properly: master, INSTR breaker, key, HEAT, START (see the card). Menu > Tests > Quick start does it all.', 5);
      else this.pushVesselIntent('key', 0);
      return;
    }
    if (v.engine.phase === 'off') {
      if (def.engine.startOnlyInNeutral && leverDemand(def, v.controls.lever).gear !== 0) {
        this.overlay.notify('Engine won\'t start: lever not in neutral');
        this.xrInput.pulse('right', 0.8, 150);
      }
      this.pushVesselIntent('quickStart', 1);
      return;
    }
    this.pushVesselIntent('key', 0); // stop: key off
  }

  private pushVesselIntent(control: string, value: number, ref?: string): void {
    this.pushIntentTo(this.testVesselId, control, value, ref);
  }

  private pushIntentTo(vesselId: string, control: string, value: number, ref?: string): void {
    this.intents.push({ playerId: this.localPlayerId, targetId: vesselId, control, value, ref });
  }

  /**
   * Which vessel a control channel belongs to: "<vesselId>:<control>" (the skiff's tiller),
   * or a plain control name (the workboat's bridge).
   */
  private routeChannel(channel: string): { vesselId: string; control: string } {
    const i = channel.indexOf(':');
    return i < 0 ? { vesselId: this.testVesselId, control: channel } : { vesselId: channel.slice(0, i), control: channel.slice(i + 1) };
  }

  /** The workboat's tender (the first outboard boat), if any. */
  private skiff(): VesselState | undefined {
    return Object.values(this.world.vessels).find((v) => VESSEL_DEFS[v.defId].outboard);
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

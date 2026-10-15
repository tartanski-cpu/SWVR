import * as THREE from 'three';
import { CONFIG } from '../config';
import { IdFactory, ENVIRONMENT_ID, type EntityId } from '../core/ids';
import { IntentQueue } from '../core/intents';
import { Keyboard } from '../core/keyboard';
import { FixedStepLoop } from '../core/loop';
import { stepWorld, type SimDebug } from '../core/simulation';
import { createWorld, type WorldState } from '../core/world';
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
import { Buoys, createPlatform } from './testScene';
import { HydroDebugView } from '../debug/hydroDebugView';
import { onDavit, recoverCheck } from '../vessel/davit';
import { isPowered } from '../vessel/electrics';
import { beaufort, compass8, visibilityAt, windVector } from '../environment/weather';
import { WindAudio } from '../audio/windAudio';
import { RainView } from '../environment/rainView';
import { ChartTableView } from '../vessel/view/chartTable';
import { LogbookView, type LogbookContext } from '../log/logbookView';
import { parseLog, serializeLog } from '../log/log';
import { PaperAudio } from '../audio/paperAudio';
import { WheelhouseClosure } from '../vessel/view/wheelhouseClosure';
import { dipstickReading } from '../vessel/maintenance';
import { TrafficView } from '../traffic/trafficView';
import { ShipHorn } from '../audio/shipHorn';
import { SHIP_NAMES } from '../traffic/traffic';
import { ChartTools, type ChartToolsContext } from '../chart/chartTools';
import { applyChartOp, createMarks, parseMarks, pointCount, serializeMarks, type ChartOp } from '../chart/marks';
import { WindSock } from '../vessel/view/windSock';
import { DutyBoardView } from '../duties/dutyBoardView';
import { DavitGear } from '../controls/DavitGear';
import { asWorkboat, VESSEL_DEFS, type WorkboatDef } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { VesselView } from '../vessel/view/vesselView';
import { EngineAudio } from '../audio/engineAudio';
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
import { HornAudio } from '../audio/hornAudio';
import { AlarmAudio } from '../audio/alarmAudio';
import { ContactAudio } from '../audio/contactAudio';
import { WaterAudio } from '../audio/waterAudio';
import { WorldView } from '../world/view/worldView';
import { LaserBeam } from '../player/laserBeam';
import { TowlineView } from '../tow/towlineView';
import { Binoculars } from '../player/binoculars';
import { fireAlertT } from '../fire/fire';
import { FireView, JetView } from '../fire/fireView';
import { FireAudio } from '../audio/fireAudio';
import { jetOn } from '../fire/fire';
import { towAlertT, towReach, towStatus } from '../tow/tow';
import { RadioAudio } from '../audio/radioAudio';
import { WhistleAudio } from '../audio/whistleAudio';
import { TargetsView } from '../rescue/targetView';
import { RescueHands, type RescueHandsContext } from '../rescue/rescueHands';
import { RescueGearView, type AvatarHands } from '../rescue/rescueGearView';
import { RescueSounds } from '../audio/rescueSounds';
import { lastSpeech, speechVoices, watchVoices } from '../audio/babble';
import { mixer, type Bus } from '../audio/mixer';
import { FmRadio } from '../audio/fmRadio';
import { Tiller } from '../controls/Tiller';
import { ElectricMotorAudio } from '../audio/electricMotorAudio';
import { BoardView, type BoardContext } from '../board/boardView';
import { NoteKeyboard } from '../board/noteKeyboard';
import { parseBoard } from '../board/board';
import { DesktopHand } from '../player/desktopHand';
import { playerColor } from '../net/avatarView';
import { createRescueState, runStatus } from '../rescue/rescue';
import { engineAlarms } from '../vessel/physics/engineThermal';
import { VesselEffects } from '../vessel/view/vesselEffects';
import { sunElevation } from '../environment/timeOfDay';
import { clamp } from '../core/math';
import { GpuTimer } from '../debug/gpuTimer';
import { TrialsPanel } from '../debug/trialsPanel';
import { vesselReadout } from '../debug/vesselReadout';
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
/** ...and the ship's log (the last few voyages). */
const LOG_KEY = 'swvr.log';
/** ...and the pencil marks on the paper chart. */
const CHART_KEY = 'swvr.chart';
/** ...and the batteries when we left (only with electrics.drainBetweenSessions). */
const BATTERY_KEY = 'swvr.battery';
/** ...and the number of rescues completed. */
const RESCUES_KEY = 'swvr.rescues';


/** Things the laser beam passes through: glass, rain on it, the comfort vignette, beams. */
const SEE_THROUGH = new Set(['laser', 'windowGlass', 'rainGlass', 'comfortOverlay']);
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
  private readonly buoys = new Buoys();
  private readonly probes = new SurfaceProbes();
  private readonly vesselViews = new Map<EntityId, VesselView>();
  private readonly hydroViews = new Map<EntityId, HydroDebugView>();
  private readonly simDebug: SimDebug = new Map();
  private readonly engineAudio = new EngineAudio();
  private readonly trialsPanel = new TrialsPanel();
  /** Which vessel (if any) the local rig is currently parented to. */
  private rigParentId: EntityId | null | undefined = undefined;
  private readonly walkAreas = new Map<EntityId, WalkArea>();
  /** Off the boat: islands, quays, piers and the platform. */
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
  private readonly horn = new HornAudio();
  private readonly alarm = new AlarmAudio();
  private readonly contactAudio = new ContactAudio();
  private readonly waterAudio = new WaterAudio();
  private readonly worldView = new WorldView();
  private readonly cargoView = new CargoView();
  private readonly cargoHands = new CargoHands();
  private readonly platform = createPlatform();
  /** Our laser pointer (others see it in our pose); where it hit, refreshed a few times a second. */
  private readonly laser = new LaserBeam();
  /** Binoculars on the dash (VR: pick up and raise to the eyes; desktop: hold Z). */
  private binoculars!: Binoculars;
  /** Fire missions: the fire, and the monitor's jet. */
  private readonly fireView = new FireView();
  private readonly jetView = new JetView();
  private readonly fireAudio = new FireAudio();
  /** The towline and our towing post (towing missions). */
  private readonly towline = new TowlineView();
  private laserHit: THREE.Vector3 | null = null;
  private laserFrame: THREE.Object3D | null = null;
  private laserT = 0;
  private readonly laserFrom = new THREE.Vector3();
  private readonly laserTo = new THREE.Vector3();
  private readonly radioAudio = new RadioAudio();
  private readonly targetsView = new TargetsView();
  private readonly desktopHand = new DesktopHand();
  private readonly deskHandW = new THREE.Vector3();
  private readonly whistleAudio = new WhistleAudio();
  private readonly rescueHands = new RescueHands();
  private readonly gearView = new RescueGearView();
  private readonly rescueSounds = new RescueSounds();
  private readonly fmRadio = new FmRadio();
  /** Outboard tillers (the skiff's), one per outboard boat. */
  private readonly tillers: Tiller[] = [];
  /** Stern davits, one per tender. */
  private readonly davits: DavitGear[] = [];
  private lastAnchorPhase: string | null = null;
  private readonly motorAudio = new ElectricMotorAudio();
  private readonly windAudio = new WindAudio();
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
  /** Chart table (paper chart, lamp) and the logbook on it. */
  private chartTable: ChartTableView | null = null;
  private logbook: LogbookView | null = null;
  private readonly paperAudio = new PaperAudio();
  /** Passing ships, debris, hazard buoys; their horns; ships the lookout has called. */
  private readonly trafficView = new TrafficView();
  private readonly shipHorn = new ShipHorn();
  private hornSeen = -1;
  private readonly shipsCalled = new Set<string>();
  /** Window glass and the sliding door; the wheelhouse is sealed with both shut. */
  private closure: WheelhouseClosure | null = null;
  private readonly tableRef = new THREE.Vector3();
  /** How shut-in the wheelhouse is, 0 (door and windows open) .. 1 (both shut): muffles wind, rain, wash. */
  private closed = 0;
  /** Auto rain quality: frame time accumulated while raining in the headset. */
  private rainSlowT = 0;
  private rainFrames = 0;
  private rainFrameSum = 0;
  private logSaved = -1;
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
  private readonly laserCaster = new THREE.Raycaster();
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

    const created = createWorld(this.ids, undefined, { tender: true, cold: true, weather: true, tows: true, fires: true });
    this.world = created.world;
    this.localPlayerId = created.localPlayerId;
    this.soloPlayerId = created.localPlayerId;
    this.testVesselId = created.vesselId;

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
    this.scene.add(this.sky.mesh, this.ocean.mesh, this.buoys.mesh, this.probes.mesh, this.platform, this.worldView.root, this.cargoView.root);
    this.scene.add(this.targetsView.root, this.gearView.root, this.desktopHand.root, this.rain.mesh, this.trafficView.root);
    this.rain.quality = userSettings.rainQuality;
    this.targetsView.onWhistle = (pos) => this.whistleAudio.blow(pos);
    this.scene.add(this.laser.root);
    for (const vessel of Object.values(this.world.vessels)) this.addVesselView(vessel);
    // A tender's davit (arms, falls, LAUNCH / RECOVER button) on her ship's stern.
    for (const vessel of Object.values(this.world.vessels)) {
      const davit = vessel.tender && VESSEL_DEFS[this.world.vessels[vessel.tender.hostId]?.defId]?.davit;
      if (!vessel.tender || !davit) continue;
      const gear = new DavitGear(vessel.id, davit);
      this.vesselViews.get(vessel.tender.hostId)?.root.add(gear.root);
      this.davits.push(gear);
    }
    const tugView = this.vesselViews.get(this.testVesselId);
    if (tugView) this.towline.attachPost(tugView.root, VESSEL_DEFS[this.world.vessels[this.testVesselId].defId]);
    this.binoculars = new Binoculars(this.camera);
    if (tugView) this.binoculars.stow(tugView.root);
    this.scene.add(this.towline.root, this.fireView.root, this.jetView.root);
    this.setupBridge();

    setupXR(this.renderer, this.camera);
    window.addEventListener('resize', () => this.onResize());
    // Audio may only start after a user gesture.
    const unlock = () => {
      this.engineAudio.unlock();
      this.horn.attach(this.engineAudio.context);
      this.alarm.attach(this.engineAudio.context);
      this.contactAudio.attach(this.engineAudio.context);
      this.waterAudio.attach(this.engineAudio.context);
      this.radioAudio.attach(this.engineAudio.context);
      this.whistleAudio.attach(this.engineAudio.context);
      this.shipHorn.attach(this.engineAudio.context);
      watchVoices();
      this.rescueSounds.attach(this.engineAudio.context);
      this.motorAudio.attach(this.engineAudio.context);
      this.windAudio.attach(this.engineAudio.context);
      this.paperAudio.attach(this.engineAudio.context);
      this.fireAudio.attach(this.engineAudio.context);
    };
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
    const t1 = performance.now();

    // 3. Views
    this.renderWaves = prepareWaves(this.world.environment.waves, renderTime, this.renderWaves);
    this.syncRigToPlayer(dt);
    this.cargoHands.tick(this.cargoCtx(), dt);
    this.rescueHands.tick(this.rescueCtx(), dt);
    this.frameDt = dt;
    if (!inXR) {
      // Binoculars (hold Z): zoomed in, the mouse look slows to match.
      this.desktop.lookScale = this.binoculars.updateDesktop(this.keyboard.action('binoculars'));
      this.desktop.update(dt);
    }
    this.updateInteraction(inXR);
    this.updateLocomotion(dt, inXR);
    this.syncRigToPlayer(0);
    this.updateLaser(dt);
    this.camera.getWorldPosition(this.focus);
    this.environment.update(this.world.environment, this.focus, this.world.time);
    this.sky.update(this.environment, this.focus);
    this.ocean.update(this.renderWaves, this.focus, this.environment, renderTime);
    this.buoys.update(this.renderWaves);
    this.probes.update(this.renderWaves, this.camera);
    const testView = this.vesselViews.get(this.testVesselId);
    if (testView) {
      // Engine room sits roughly under the wheelhouse.
      const distance = testView.root.localToWorld(this.tmpV.set(0, 0, 1)).distanceTo(this.focus);
      const submerged = this.exhaustSubmersion(testView.root, this.world.vessels[this.testVesselId], nowMs / 1000);
      this.engineAudio.update(this.world.vessels[this.testVesselId], distance, submerged);
      const v = this.world.vessels[this.testVesselId];
      this.horn.update(v.controls.horn > 0 && isPowered(v), distance); // electric horn
      // Bridge buzzer: high temperature always, low fuel while the engine runs.
      const al = engineAlarms(v, this.testDef);
      const consoleDist = this.bridge ? this.bridge.dashAnchor.getWorldPosition(this.tmpV).distanceTo(this.focus) : 99;
      this.alarm.update(al.highTemp || (al.lowFuel && v.engine.phase === 'running'), consoleDist);
    }
    // Bridge controls and displays read the (just-updated) vessel state.
    const testVessel = this.world.vessels[this.testVesselId];
    if (this.bridge && testVessel) {
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
      for (const g of this.davits) {
        const tv = this.world.vessels[g.tenderId];
        if (!tv) continue;
        g.update(tv, recoverCheck(this.world, tv), this.vesselRoots.get(tv.id));
        g.button.tick(dt);
      }
      for (const t of this.tillers) {
        const sv = this.world.vessels[t.vesselId];
        if (!sv) continue;
        t.sync(sv);
        t.tick(dt);
        this.motorAudio.update(sv.controls.obOn > 0 ? Math.sign(sv.controls.obGear) * sv.controls.lever : 0, sv.battery ?? 0, t.root.getWorldPosition(this.tmpV).distanceTo(this.focus));
      }
      this.bridge.chart.marks = CONFIG.chartMarks.showOnPlotter ? this.marks : null;
      this.bridge.chart.update(this.world, this.testVesselId, dt, this.dashInView());
      this.updateRadioSound();
    }
    const darkness = Math.min(1, Math.max(0, (8 - sunElevation(this.world.environment.timeOfDay)) / 14));
    let slam = 0;
    let lap = 0;
    for (const [id, fx] of this.effects) {
      if (!this.world.vessels[id]) continue;
      const hit = fx.update(dt, this.world.vessels[id], this.renderWaves, this.focus, darkness, renderTime);
      if (id === this.testVesselId) ({ slam, lap } = hit);
    }
    this.towline.update(this.world, this.vesselRoots, this.testVesselId, this.renderWaves);
    this.fireView.update(this.world, this.renderWaves, renderTime, dt);
    this.jetView.update(this.world, this.world.vessels[this.testVesselId], this.vesselRoots.get(this.testVesselId), renderTime);
    {
      const fj = this.world.fire?.job;
      const tv = this.world.vessels[this.testVesselId];
      const burning = fj && fj.phase !== 'calling' ? fj.intensity : 0;
      const dist = fj ? Math.hypot(fj.x - this.focus.x, fj.z - this.focus.z) : 1e9;
      this.fireAudio.update(burning, dist, !!tv && jetOn(tv), this.insideHouse ? this.closed : 0);
    }
    this.worldView.lights.update(renderTime, darkness);
    this.targetsView.visibility = this.environment.visibility;
    this.updateWeatherViews(renderTime, darkness, dt);
    this.targetsView.update(this.world, this.renderWaves, this.focus, darkness, renderTime, dt, this.testVesselId, this.vesselRoots.get(this.testVesselId));
    this.gearView.update(this.world, this.testVesselId, this.vesselRoots.get(this.testVesselId), this.renderWaves, this.rescueHands, this.localPlayerId, this.avatarHands);
    this.updateRescueSounds();
    this.noteKeys.menu.refresh();
    if (this.board) {
      this.board.update(this.world);
      this.dutyBoard?.update(this.world);
      // A duty ticked off: a small tick.
      const done = this.world.duties?.completed ?? 0;
      if (this.dutiesDone >= 0 && done > this.dutiesDone) this.rescueSounds.snap();
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
      this.whistleAudio.setListener(this.focus, this.listenerFwd, this.listenerUp);
    }
    this.worldView.portLighting.update(this.focus, darkness);
    this.ocean.setPortLight(this.worldView.portLighting.flood);
    const fxTest = this.effects.get(this.testVesselId);
    if (fxTest?.searchlight) this.ocean.setSpotlight(fxTest.searchlight.light);
    this.cargoView.update(this.world, this.vesselRoots, (c) => this.carriedPose(c), this.cargoHands.hovered);
    const deskHand = inXR ? null : this.desktopHandWorld(this.deskHandW);
    if (deskHand) this.desktopHand.setColor(playerColor(this.localPlayerId));
    this.desktopHand.update(this.camera, deskHand, dt);
    this.updateNetPose(dt);
    this.avatars.update(this.world, this.localPlayerId, this.vesselRoots, dt);
    if (testView && testVessel) {
      // Hull contact: thump and scrape, and a jolt through both controllers if you're aboard.
      const d = testView.root.position.distanceTo(this.focus);
      const hit = this.contactAudio.update(testVessel.contact, d, dt);
      const aboard = this.world.players[this.localPlayerId].aboardVesselId === testVessel.id;
      if (hit > 0 && aboard) {
        this.xrInput.pulse('left', 0.3 + 0.7 * hit, 60 + 140 * hit);
        this.xrInput.pulse('right', 0.3 + 0.7 * hit, 60 + 140 * hit);
      }
      // Water rushing past and bow slams: sound, and a light thud through the controllers.
      // The wash of the boat you're in (the skiff's, when you're in the skiff).
      const inSkiff = this.world.vessels[this.drivenVesselId()];
      const washBoat = inSkiff && inSkiff.id !== this.testVesselId && !onDavit(inSkiff) ? inSkiff : testVessel;
      const washD = washBoat === testVessel ? d : (this.vesselRoots.get(washBoat.id)?.position.distanceTo(this.focus) ?? d);
      const muffle = this.insideHouse ? this.closed * CONFIG.wheelhouseSound.washMuffle : 0;
      this.waterAudio.update(Math.hypot(washBoat.linearVelocity[0], washBoat.linearVelocity[2]), washBoat === testVessel ? slam : 0, washBoat === testVessel ? lap : 0, washD, dt, muffle);
      if (slam > 0.1 && aboard) {
        this.xrInput.pulse('left', 0.15 + 0.35 * slam, 40 + 60 * slam);
        this.xrInput.pulse('right', 0.15 + 0.35 * slam, 40 + 60 * slam);
      }
    }
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
        extra: vesselReadout(testVessel, this.simDebug),
      },
      inXR,
    );
    this.keyboard.endFrame();
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
      // VR and desktop have their own coupling (desktop softer: see CONFIG.comfort).
      this.decoupler.coupling = this.renderer.xr.isPresenting ? userSettings.motionCoupling : userSettings.desktopCoupling;
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
    this.radioAudio.setDistance(this.bridge.radio.root.getWorldPosition(this.tmpV).distanceTo(this.focus));
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
      this.radioAudio.message(r.radio.kind, r.radio.text);
      this.overlay.notify(`VHF: ${r.radio.text}`, 8);
    } else if (alertT !== this.radioSeen.alertT && alertT >= 0) {
      this.radioAudio.alert();
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
    return this.cargoHands.handPoint(out);
  }

  /** Vessels as the body module sees them (rendered roots, walk areas, hull plans). */
  private bodyVessels(): BodyVessel[] {
    const out: BodyVessel[] = [];
    for (const [id, view] of this.vesselViews) {
      const state = this.world.vessels[id];
      const def = state && VESSEL_DEFS[state.defId];
      if (!def) continue;
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
        this.waterAudio.splash(1);
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

  /** Desktop walking on the workboat: a shut wheelhouse door blocks the doorway. */
  private withDoor(area: WalkArea, vesselId: EntityId | null): WalkArea {
    const v = vesselId === this.testVesselId ? this.world.vessels[vesselId] : undefined;
    if (!v || v.controls.door > 0.5) return area;
    const wh = this.testDef.layout.wheelhouse;
    const inDoor = (x: number, z: number, y: number) => Math.abs(x) < wh.doorWidth / 2 + 0.15 && Math.abs(z - wh.aft) < 0.3 && y < wh.floorY + 0.5;
    return { ...area, walkable: (x, z, y) => area.walkable(x, z, y) && !inDoor(x, z, y) };
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
      // WASD steer the clicked control (the searchlight joystick) instead of walking.
      const k = this.keyboard;
      this.interaction!.steerKeys((k.action('right') ? 1 : 0) - (k.action('left') ? 1 : 0), (k.action('forward') ? 1 : 0) - (k.action('back') ? 1 : 0));
    } else if (!inXR && this.desktop.mode === 'walk') {
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

  /** Board the test boat (at the helm), or go back to the platform. */
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

  /** The menu's view of the app (see ui/mainMenu.ts). */
  private menuHost(): MenuHost {
    const env = () => this.world.environment;
    const boat = () => this.world.vessels[this.testVesselId];
    const saveSettings = () => saveUserSettings();
    return {
      timeOfDay: () => env().timeOfDay,
      shiftTime: (h) => this.pushEnvIntent('timeOfDayDelta', h),
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
        return `Bilge ${Math.round(b * 100)} % · hatch ${v?.controls.hatch ? 'OPEN' : 'shut'} · pump ${v && b > 0.01 && isPowered(v, 'bilge') ? 'running' : 'off'}`;
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
        if (skiff) this.intents.push({ playerId: this.localPlayerId, targetId: this.localPlayerId, control: 'board', value: 1, ref: skiff.id });
      },
      skiffBattery: () => this.skiff()?.battery ?? 0,
      davitAction: () => {
        const skiff = this.skiff();
        const phase = skiff?.tender?.phase;
        if (!skiff || !phase) return '-';
        if (phase === 'stowed') return 'LAUNCH';
        if (phase !== 'free') return phase === 'lowering' ? 'Lowering...' : 'Hoisting...';
        const r = recoverCheck(this.world, skiff);
        return r.ok ? 'RECOVER' : 'RECOVER: ' + (r.why.startsWith('bring') ? 'too far' : 'too fast');
      },
      davit: () => {
        const skiff = this.skiff();
        if (skiff) this.pushIntentTo(skiff.id, 'davit', 1);
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
        if (m.phase === 'docking') return { text: `Docking: ${b?.name}`, ready: true, docked: true };
        if (b) return { text: `In range: ${b.name}`, ready: true, docked: false };
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
        this.radioAudio.crackle(0.3);
        this.radioAudio.speak('Radio check. One, two, three. How do you read?', 0.3);
        setTimeout(() => {
          const n = speechVoices();
          const speech = n < 0 ? 'no speech synthesis' : `${n} speech voices`;
          this.overlay.notify(`Voice test: ${speech}; spoken ${lastSpeech.started} of ${lastSpeech.tried}${n <= 0 || lastSpeech.started < lastSpeech.tried ? ' (using the radio babble)' : ''}`, 8);
        }, 2000);
      },
      rescueNear: (kind) => this.pushVesselIntent('rescueDebugNear', 1, kind),
      rescueAboard: () => this.pushVesselIntent('rescueDebugAboard', 1),
      rescues: () => this.world.rescue?.completed ?? 0,
      towStatus: () => towStatus(this.world),
      towFast: () => !!this.world.tow?.job?.fast,
      towToggle: () => {
        const job = this.world.tow?.job;
        if (job?.phase !== 'accepted') this.overlay.notify('No tow to make fast: they come by radio (pick up the handset)');
        else if (!job.fast && towReach(this.world) > CONFIG.tow.attachRange) this.overlay.notify(`Bring our stern within ${CONFIG.tow.attachRange} m of her bow eye`);
        else this.pushVesselIntent('towToggle', 1);
      },
      towsDelivered: () => this.world.tow?.delivered ?? 0,
      towNear: (kind) => this.pushVesselIntent('towDebugNear', 1, kind),
      towCall: () => this.pushVesselIntent('towDebugCall', 1),
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
        this.overlay.notify(port.cargo.berth ? `${port.name}: at the cargo berth, press DOCK` : `${port.name}: in the bay, let go the anchor`, 3);
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
      // The log comes in its own messages when it changes (not in every snapshot).
      w.log = client.log ?? snap.log;
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
    if (!this.host && this.client?.status !== 'connected') return;
    const p = this.world.players[this.localPlayerId];
    const frame = this.playerFrame();
    frame.updateMatrixWorld();
    this.invFrame.copy(frame.matrixWorld).invert();
    const head = this.camera.getWorldPosition(this.tmpV).applyMatrix4(this.invFrame);
    const q = this.camera.getWorldQuaternion(this.poseQ).premultiply(this.attQ.setFromRotationMatrix(this.invFrame));
    const inXR = this.renderer.xr.isPresenting;
    const hand = (h: 'left' | 'right') => {
      // Desktop players have one hand: on whatever the mouse holds (a rubber band to others).
      const w = inXR ? this.controllers.worldPosition(h, this.gripW[h]) : h === 'right' ? this.desktopHandWorld(this.gripW[h]) : null;
      return w ? (w.clone().applyMatrix4(this.invFrame).toArray() as [number, number, number]) : null;
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
      tool: this.chartTools?.heldTool() ?? null,
      laser: this.laserPose(),
    };
    if (this.host) {
      p.name = pose.name;
      p.avatar = { head: pose.head, left: pose.left, right: pose.right, tool: pose.tool, laser: pose.laser };
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
    this.connectClient(new PeerClientTransport(this.joinCode));
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
    // Window glass and the sliding aft door.
    this.closure = new WheelhouseClosure(this.testDef);
    view.root.add(this.closure.root);
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
    // Chart table on the port side, aft half: the paper chart, its lamp, the logbook.
    const ct = this.testDef.chartTable;
    if (ct) {
      this.chartTable = new ChartTableView(ct, wh.floorY);
      view.root.add(this.chartTable.root);
      this.bridge.controls.push(this.chartTable.lampSwitch);
      this.chartTools = new ChartTools(this.chartTable);
      this.chartTable.root.add(this.chartTools.root);
      // The book: its own frame has x across the pages (forward, -z), y up the page
      // (outboard, -x) and z up, like the chart - you read it facing the wall.
      const [bx, bz] = ct.book.center;
      const top = this.chartTable.top;
      this.logbook = new LogbookView(ct.book.width, ct.book.depth);
      this.logbook.root.matrixAutoUpdate = false;
      this.logbook.root.matrix.makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)).setPosition(bx, top + 0.001, bz);
      view.root.add(this.logbook.root);
      this.scene.add(this.logbook.rayLine);
    }
    this.restoreBatteries();
    try {
      if (!this.client) this.world.log ??= parseLog(localStorage.getItem(LOG_KEY)) ?? undefined;
      if (!this.client) this.marks = parseMarks(localStorage.getItem(CHART_KEY)) ?? this.marks;
      this.world.board ??= parseBoard(localStorage.getItem(BOARD_KEY)) ?? undefined;
      // Rescues completed in this browser so far (milestone 4).
      const n = Number(localStorage.getItem(RESCUES_KEY));
      if (Number.isFinite(n) && n > 0) (this.world.rescue ??= createRescueState()).completed = Math.floor(n);
    } catch {
      // No storage: an empty board, no count.
    }
    this.interaction = new InteractionSystem(
      [...this.bridge.controls, ...this.tillers.flatMap((t) => t.parts), ...this.davits.map((d) => d.button)],
      (channel, value) => {
        if (channel === 'engineStartStop') return this.requestEngineStartStop();
        if (channel === 'start' && value > 0) this.startInGearHint();
        if (channel === 'dipstick') this.readDipstick();
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
    if (this.chartTools) {
      const tools = this.chartTools;
      this.pointer.chart = (ray, b) => tools.updateDesktop(this.chartCtx(), ray, b, this.frameDt);
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
      // The chart table's tools: a hand holding one gives its grip and trigger to the tool.
      const onTools = this.chartTools ? this.chartTools.updateXR(this.chartCtx(), this.hands, this.busyHands, this.frameDt) : { left: false, right: false };
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
      if (this.logbook) {
        const onBook = this.logbook.updateXR(this.logbookCtx(), this.hands, this.busyHands);
        for (const h of ['left', 'right'] as const) if (onBook[h]) this.busyHands[h] = true;
      }
      this.pointer?.hide();
      return;
    }
    this.pointer?.update(this.camera);
  }

  /**
   * The laser pointer: while the right stick is held in (VR) or the right mouse button is
   * held (desktop), a beam from the hand or the eyes to whatever it meets - a boat, the
   * islands and quays, cargo, the platform, or the sea. What it hits is looked up a few
   * times a second (the beam itself follows the hand every frame); the hit point is kept
   * in the frame of what it hit, so on a boat it rides along.
   */
  private updateLaser(dt: number): void {
    const inXR = this.renderer.xr.isPresenting;
    const on = inXR ? this.xrInput.isDown('right', XR_BUTTON.stick) && this.hands.right.tracked : !!this.pointer?.laserDown;
    if (!on) {
      this.laser.hide();
      this.laserHit = null;
      return;
    }
    const ray = inXR ? this.hands.right.ray : new THREE.Ray(this.camera.getWorldPosition(new THREE.Vector3()), this.camera.getWorldDirection(new THREE.Vector3()));
    this.laserT -= dt;
    if (this.laserT <= 0 || !this.laserHit) {
      this.laserT = 1 / CONFIG.laser.hitRate;
      this.findLaserHit(ray);
    }
    // Desktop: the beam starts a little below the eyes (from the "hand"), so it shows.
    this.laserFrom.copy(ray.origin);
    if (!inXR) this.laserFrom.addScaledVector(this.camera.up.clone().applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion())), -0.25);
    const hit = !!this.laserHit;
    if (hit) this.laserTo.copy(this.laserHit!).applyMatrix4(this.laserFrame?.matrixWorld ?? new THREE.Matrix4());
    else ray.at(CONFIG.laser.reach * 0.2, this.laserTo);
    // Aim follows the hand every frame; the hit distance comes from the last lookup.
    if (hit) ray.at(this.laserTo.distanceTo(ray.origin), this.laserTo);
    this.laser.set(this.laserFrom, this.laserTo, hit);
  }

  private findLaserHit(ray: THREE.Ray): void {
    const reach = CONFIG.laser.reach;
    this.laserCaster.set(ray.origin, ray.direction);
    this.laserCaster.far = reach;
    const targets = [...this.vesselRoots.values(), this.worldView.root, this.cargoView.root, this.platform, this.trafficView.root];
    const skip = (o: THREE.Object3D | null): boolean => {
      for (; o; o = o.parent) if (!o.visible || o === this.rig.carrier || o === this.menu.root || SEE_THROUGH.has(o.name) || o.name.startsWith('avatar:')) return true;
      return false;
    };
    const hit = this.laserCaster.intersectObjects(targets, true).find((h) => (h.object as THREE.Mesh).isMesh && !skip(h.object));
    // The sea: march along the ray to where it drops below the surface.
    let sea: THREE.Vector3 | null = null;
    if (ray.direction.y < -1e-3) {
      let t = (0 - ray.origin.y) / ray.direction.y;
      const p = new THREE.Vector3();
      for (let i = 0; i < 4 && t > 0; i++) {
        ray.at(t, p);
        const dy = p.y - surfaceHeight(this.renderWaves, p.x, p.z);
        t += dy / -ray.direction.y;
      }
      if (t > 0 && t < reach) sea = ray.at(t, new THREE.Vector3());
    }
    this.laserHit = null;
    this.laserFrame = null;
    if (hit && (!sea || hit.distance <= sea.distanceTo(ray.origin))) {
      const point = hit.point.clone();
      for (const root of this.vesselRoots.values()) {
        let o: THREE.Object3D | null = hit.object;
        while (o && o !== root) o = o.parent;
        if (o === root) {
          this.laserFrame = root;
          root.worldToLocal(point);
        }
      }
      this.laserHit = point;
    } else if (sea) this.laserHit = sea;
  }

  /** Our laser beam for the pose (frame coordinates), or null. */
  private laserPose(): [number, number, number, number, number, number, boolean] | null {
    if (!this.laser.root.visible) return null;
    const r = (x: number) => Math.round(x * 100) / 100;
    const a = this.laserFrom.clone().applyMatrix4(this.invFrame);
    const b = this.laserTo.clone().applyMatrix4(this.invFrame);
    return [r(a.x), r(a.y), r(a.z), r(b.x), r(b.y), r(b.z), !!this.laserHit];
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
        const book = free && !this.rescueHands.deskBusy && this.logbook ? this.logbook.label(this.logbookCtx(), ray) : null;
        if (book) return book;
        const board = free && !this.rescueHands.deskBusy && this.board ? this.board.label(this.boardCtx(), ray) : null;
        const gear = free && !board ? this.rescueHands.updateDesktop(this.rescueCtx(), ray, this.headW, this.headFwd, this.frameDt) : null;
        return board ?? gear ?? this.cargoHands.updateDesktop(this.cargoCtx(), ray, this.headW, this.headFwd);
      },
      click: (ray: THREE.Ray | null) => {
        this.camera.getWorldDirection(this.headFwd);
        if (!this.cargoHands.carrying && !this.rescueHands.deskBusy && this.logbook?.click(this.logbookCtx(), ray)) return true;
        if (!this.cargoHands.carrying && !this.rescueHands.deskBusy && this.board?.click(this.boardCtx(), ray)) return true;
        if (!this.cargoHands.carrying && this.rescueHands.desktopClick(this.rescueCtx(), ray, this.headFwd)) return true;
        return this.cargoHands.desktopClick(this.cargoCtx(), ray);
      },
    };
  }

  /**
   * The chart table: how much light falls on the chart and the book (daylight, the cabin
   * lamp, the chart table lamp), the book's redraw and pen, and saving the log (host).
   */
  private updateChartTable(v: VesselState | undefined, dt: number): void {
    if (!this.chartTable || !this.logbook || !v) return;
    const lamp = v.controls.chartLamp > 0 && isPowered(v, 'deckLights');
    const cabin = v.controls.cabinLight > 0 && isPowered(v, 'deckLights');
    const level = Math.min(1, Math.max(0.04, this.environment.ambientIntensity * 1.1 + (cabin ? 0.45 : 0) + (lamp ? 1 : 0)));
    this.chartTable.setLight(level, lamp);
    // From outside the wheelhouse the chart, bulb, book pages, pen, tools and marks are too
    // small to matter (and mostly behind the aft wall): skip their draw calls.
    const wh = this.testDef.layout.wheelhouse;
    const l = this.chartTable.root.worldToLocal(this.tableRef.copy(this.focus));
    const near = Math.abs(l.x) < wh.halfWidth + 0.3 && l.z > wh.front - 0.3 && l.z < wh.aft + 0.6 && l.y > wh.floorY - 0.5;
    this.chartTable.setDetail(near);
    this.logbook.root.visible = near;
    if (this.chartTools) this.chartTools.root.visible = near;
    this.logbook.update(this.world, this.localPlayerId, level, dt);
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
    const log = this.world.log;
    if (log && !this.client && log.seq !== this.logSaved) {
      this.logSaved = log.seq;
      try {
        localStorage.setItem(LOG_KEY, serializeLog(log));
      } catch {
        // Not saved; still shared.
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
      scratch: (p, r) => this.paperAudio.setScratch(p, r),
    };
  }

  /** Light enough to read the log: daylight, or the chart table lamp. */
  private canReadLog(): boolean {
    const v = this.world.vessels[this.testVesselId];
    const lamp = !!v && v.controls.chartLamp > 0 && isPowered(v, 'deckLights');
    return lamp || this.environment.ambientIntensity >= CONFIG.log.readLight;
  }

  /** The logbook's view of the app. */
  private logbookCtx(): LogbookContext {
    return {
      world: this.world,
      playerId: this.localPlayerId,
      push: (control, ref, args) => this.intents.push({ playerId: this.localPlayerId, targetId: ENVIRONMENT_ID, control, value: 1, ref, args }),
      pulse: (h, i, ms) => this.xrInput.pulse(h, i, ms),
      canRead: () => this.canReadLog(),
      notify: (text) => this.overlay.notify(text, 3),
      sound: (kind) => this.paperAudio.play(kind),
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
      this.rescueSounds.cheer();
      this.overlay.notify(r?.active?.phase === 'landed' ? 'Safely ashore. Rescue complete!' : 'Recovered! Everyone out of the water.', 4);
    }
    if (now.shout !== was.shout && r?.shout) {
      this.rescueSounds.shout(r.shout.text);
      this.overlay.notify(`"${r.shout.text}"`, 4);
    }
  }

  /** Engine start/stop with feedback when the neutral-start interlock refuses. */
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
    // How shut-in the wheelhouse is: the door (the big opening) counts most, the windows the rest.
    const wv = this.world.vessels[this.testVesselId];
    if (this.closure && wv && this.bridge) {
      this.closure.update(wv.controls.windows > 0);
      this.bridge.door.tick(dt);
      this.closed = (this.bridge.door.shut ? CONFIG.wheelhouseSound.door : 0) + (wv.controls.windows > 0 ? 1 - CONFIG.wheelhouseSound.door : 0);
    }
    this.windAudio.update(Math.hypot(ax, az), inside, dt, this.closed);
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
    this.windAudio.setRain(rain, this.insideHouse, this.closed);
    // Thunder: the flash is drawn by the environment view; the sound follows by distance.
    const L = w?.lightning;
    if (L) {
      if (this.lightningSeen >= 0 && L.seq !== this.lightningSeen) this.windAudio.thunder(L.dist);
      this.lightningSeen = L.seq;
    }
    // A new forecast received: the VHF reads it out (only if it's on - it was received).
    const fc = this.world.forecast;
    const fseq = fc?.seq ?? 0;
    if (this.forecastSeen >= 0 && fseq !== this.forecastSeen && fc && v && isPowered(v, 'radio')) {
      this.radioAudio.message('info', `Shipping forecast. ${fc.text}`);
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
      if (pos && type) this.shipHorn.blow(pos, type === 'cargo' ? 105 : type === 'fishing' ? 165 : 290, pos.distanceTo(this.focus));
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
      this.rescueSounds.snap();
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
      placedOnDeck: () => this.rescueSounds.snap(),
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


  private pushEnvIntent(control: string, value: number): void {
    this.intents.push({ playerId: this.localPlayerId, targetId: ENVIRONMENT_ID, control, value });
  }
}

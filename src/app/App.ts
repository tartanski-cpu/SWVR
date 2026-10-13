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
import { prepareWaves, significantWaveHeight, type PreparedWave } from '../ocean/waves';
import { SurfaceProbes } from '../debug/surfaceProbes';
import { Buoys, createPlatform } from './testScene';
import { HydroDebugView } from '../debug/hydroDebugView';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { VesselView } from '../vessel/view/vesselView';
import { EngineAudio } from '../audio/engineAudio';
import { platformWalkArea, vesselWalkArea, type WalkArea } from '../vessel/layout';
import { leverDemand } from '../vessel/physics/propulsion';
import { Locomotion } from '../player/locomotion';
import { ComfortOverlay, MotionDecoupler } from '../player/comfort';
import { saveUserSettings, userSettings } from '../player/userSettings';
import { WristMenu } from '../ui/wristMenu';
import { mainMenu, type MenuHost } from '../ui/mainMenu';
import { placeInFront } from '../ui/placeInFront';
import { canRefuel } from '../vessel/vesselControl';
import { PORTS } from '../world/archipelago';
import { groundHeight } from '../world/terrain';
import { aboard, cargoLabel, cargoPortAt, loadBlocker, payloadMass, unloadBlocker, type CargoItem } from '../cargo/cargo';
import { CargoView } from '../cargo/cargoView';
import { XRControllers } from '../player/xrControllers';
import { Bridge } from '../controls/bridge';
import { InteractionSystem, type HandFrame } from '../controls/InteractionSystem';
import { HornAudio } from '../audio/hornAudio';
import { AlarmAudio } from '../audio/alarmAudio';
import { ContactAudio } from '../audio/contactAudio';
import { WaterAudio } from '../audio/waterAudio';
import { WorldView } from '../world/view/worldView';
import { engineAlarms } from '../vessel/physics/engineThermal';
import { VesselEffects } from '../vessel/view/vesselEffects';
import { sunElevation } from '../environment/timeOfDay';
import { clamp } from '../core/math';
import { GpuTimer } from '../debug/gpuTimer';
import { TrialsPanel } from '../debug/trialsPanel';
import { vesselReadout } from '../debug/vesselReadout';
import { DesktopPointer } from './desktopPointer';
import { setupXR, xrSessionInfo } from './xrSession';

/**
 * Top-level wiring. Owns the renderer, the simulation state and the per-frame loop:
 *
 *   gather input  ->  intents  ->  N fixed sim ticks  ->  update views (with alpha)  ->  render
 */
export class App {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  // Simulation
  readonly ids = new IdFactory();
  readonly world: WorldState;
  readonly localPlayerId: EntityId;
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
  private readonly platformArea = platformWalkArea();
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
  private readonly vesselRoots = new Map<string, THREE.Object3D>();
  private readonly hands: Record<'left' | 'right', HandFrame> = {
    left: { tracked: false, grip: new THREE.Vector3(), ray: new THREE.Ray(), gripDown: false, gripPressed: false, triggerDown: false, triggerPressed: false },
    right: { tracked: false, grip: new THREE.Vector3(), ray: new THREE.Ray(), gripDown: false, gripPressed: false, triggerDown: false, triggerPressed: false },
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

    const created = createWorld(this.ids);
    this.world = created.world;
    this.localPlayerId = created.localPlayerId;
    this.testVesselId = created.vesselId;

    this.rig = new PlayerRig(this.localPlayerId, this.camera);
    this.scene.add(this.rig.carrier);
    this.placePanelOnRig();
    this.camera.add(this.comfortOverlay.mesh);
    this.controllers = new XRControllers(this.renderer, this.rig.root);
    this.decoupler.coupling = userSettings.motionCoupling;
    this.menu = new WristMenu(mainMenu(this.menuHost()));
    this.scene.add(this.menu.rayLine);

    this.desktop = new DesktopController(this.camera, this.renderer.domElement, this.keyboard);
    this.environment = new EnvironmentView(this.scene);
    this.scene.add(this.sky.mesh, this.ocean.mesh, this.buoys.mesh, this.probes.mesh, createPlatform(), this.worldView.root, this.cargoView.mesh);
    for (const vessel of Object.values(this.world.vessels)) {
      const def = VESSEL_DEFS[vessel.defId];
      const view = new VesselView(vessel.id, def);
      const hydro = new HydroDebugView(def, CONFIG.debug.hydroDebugVisibleAtStart);
      view.root.add(hydro.root);
      this.scene.add(view.root);
      this.vesselViews.set(vessel.id, view);
      this.hydroViews.set(vessel.id, hydro);
      this.walkAreas.set(vessel.id, vesselWalkArea(def, def.layout));
      this.effects.set(vessel.id, new VesselEffects(def, view.root, this.scene, this.ocean.sharedUniforms));
      this.vesselRoots.set(vessel.id, view.root);
    }
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

    // 2. Fixed-step simulation
    const { ticks, alpha } = this.loop.advance(dt);
    for (let i = 0; i < ticks; i++) {
      // Keep each vessel's pre-tick pose so views can interpolate across the last tick.
      for (const [id, view] of this.vesselViews) view.snapshot(this.world.vessels[id]);
      stepWorld(this.world, i === 0 ? this.intents.drain() : [], this.loop.dt, this.simDebug);
    }
    const t1 = performance.now();

    // 3. Views. Rendering runs one tick behind the simulation and interpolates between
    // the previous and current tick by `alpha`; the ocean uses the same render time so
    // floating objects and the water surface always agree.
    const renderTime = Math.max(0, (this.world.tick - 1 + alpha) * this.loop.dt);
    this.renderWaves = prepareWaves(this.world.environment.waves, renderTime, this.renderWaves);

    // Vessels first: the player rides on their interpolated pose.
    for (const [id, view] of this.vesselViews) {
      view.update(this.world.vessels[id], alpha);
      this.hydroViews.get(id)?.update(this.simDebug.get(id));
    }
    this.syncRigToPlayer(dt);
    if (!inXR) this.desktop.update(dt);
    this.updateInteraction(inXR);
    this.updateLocomotion(dt, inXR);
    this.syncRigToPlayer(0);
    this.camera.getWorldPosition(this.focus);
    this.environment.update(this.world.environment, this.focus);
    this.sky.update(this.environment, this.focus);
    this.ocean.update(this.renderWaves, this.focus, this.environment);
    this.buoys.update(this.renderWaves);
    this.probes.update(this.renderWaves, this.camera);
    const testView = this.vesselViews.get(this.testVesselId);
    if (testView) {
      // Engine room sits roughly under the wheelhouse.
      const distance = testView.root.localToWorld(this.tmpV.set(0, 0, 1)).distanceTo(this.focus);
      this.engineAudio.update(this.world.vessels[this.testVesselId], distance);
      const v = this.world.vessels[this.testVesselId];
      this.horn.update(v.controls.horn > 0, distance);
      // Bridge buzzer: high temperature always, low fuel while the engine runs.
      const al = engineAlarms(v, VESSEL_DEFS[v.defId]);
      const consoleDist = this.bridge ? this.bridge.dashAnchor.getWorldPosition(this.tmpV).distanceTo(this.focus) : 99;
      this.alarm.update(al.highTemp || (al.lowFuel && v.engine.phase === 'running'), consoleDist);
    }
    // Bridge controls and displays read the (just-updated) vessel state.
    const testVessel = this.world.vessels[this.testVesselId];
    if (this.bridge && testVessel) this.bridge.update(testVessel, dt, this.dashInView());
    const darkness = Math.min(1, Math.max(0, (8 - sunElevation(this.world.environment.timeOfDay)) / 14));
    let slam = 0;
    for (const [id, fx] of this.effects) {
      const sl = fx.update(dt, this.world.vessels[id], this.renderWaves, this.focus, darkness, renderTime);
      if (id === this.testVesselId) slam = sl;
    }
    this.worldView.lights.update(renderTime, darkness);
    this.cargoView.update(this.world, this.vesselRoots);
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
      this.waterAudio.update(Math.hypot(testVessel.linearVelocity[0], testVessel.linearVelocity[2]), slam, d, dt);
      if (slam > 0.1 && aboard) {
        this.xrInput.pulse('left', 0.15 + 0.35 * slam, 40 + 60 * slam);
        this.xrInput.pulse('right', 0.15 + 0.35 * slam, 40 + 60 * slam);
      }
    }
    this.menu.refresh();
    const t2 = performance.now();

    // 4. Render
    this.renderer.info.reset();
    this.gpuTimer.begin();
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
    this.handleDebugDriving(dt);
    if (k.actionPressed('engine')) this.requestEngineStartStop();
    // Motion coupling: hold X and push the left stick up/down (VR), or 9 / 0 (desktop).
    let dc = 0;
    if (this.xrInput.isDown('left', XR_BUTTON.primary)) {
      const sy = this.xrInput.hands.left.stick[1];
      if (Math.abs(sy) > 0.2) dc = -sy * 0.4 * dt;
      if (this.xrInput.wasPressed('left', XR_BUTTON.primary)) dc = 1e-9; // show the current value
    }
    if (k.actionPressed('couplingDown')) dc = -0.1;
    if (k.actionPressed('couplingUp')) dc = 0.1;
    if (dc !== 0) this.setCoupling(this.decoupler.coupling + dc);
    if (k.actionPressed('board') || this.xrInput.wasPressed('left', XR_BUTTON.stick)) this.toggleBoard();
    if (k.actionPressed('seaTrials')) this.trialsPanel.toggle(this.world.vessels[this.testVesselId].defId);
    if (k.actionPressed('seaState')) {
      // Cycle the presets: calm -> slight -> moderate -> rough -> storm -> calm.
      const states = CONFIG.ocean.seaStates;
      const i = states.findIndex((st) => st.scale > this.world.environment.seaScale + 1e-6);
      const next = i < 0 ? states[0] : states[i];
      this.pushEnvIntent('seaState', next.scale);
      this.overlay.notify(`Sea state: ${next.name}`, 2);
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
    const v = this.world.vessels[this.testVesselId];
    if (!v) return;
    const k = this.keyboard;
    const cfg = CONFIG.debugDriving;
    const leverIn = (k.action('leverAhead') ? 1 : 0) - (k.action('leverAstern') ? 1 : 0);
    const helmIn = (k.action('helmStarboard') ? 1 : 0) - (k.action('helmPort') ? 1 : 0);

    let lever = v.controls.lever;
    if (leverIn !== 0) {
      const next = clamp(lever + leverIn * cfg.leverRate * dt, -1, 1);
      // Stop briefly at the neutral detent when passing through it.
      lever = Math.sign(next) !== Math.sign(lever) && lever !== 0 ? 0 : next;
    }
    if (k.actionPressed('leverNeutral')) lever = 0;
    if (lever !== v.controls.lever) this.pushVesselIntent('lever', lever);

    let helm = v.controls.helm;
    if (helmIn !== 0) helm = clamp(helm + helmIn * cfg.helmRate * dt, -1, 1);
    if (k.actionPressed('helmMidships')) helm = 0;
    if (helm !== v.controls.helm) this.pushVesselIntent('helm', helm);
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
      this.desktop.resetPose();
      this.decoupler.reset();
    }
    const carrier = this.rig.carrier;
    carrier.position.fromArray(p.position);
    if (vesselView) {
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
    this.camera.updateWorldMatrix(true, false);
  }

  /** Grab-the-world, stick and desktop movement, collision, floor following, comfort overlay. */
  private updateLocomotion(dt: number, inXR: boolean): void {
    const p = this.world.players[this.localPlayerId];
    const frame = (p.aboardVesselId && this.vesselViews.get(p.aboardVesselId)?.root) || this.scene;
    const area = (p.aboardVesselId && this.walkAreas.get(p.aboardVesselId)) || this.platformArea;
    // Head from the camera's pose relative to the rig (fresh this frame; see syncRigToPlayer).
    this.camera.getWorldPosition(this.headW);
    this.camera.getWorldDirection(this.headFwd);

    const grabbing = { left: null as THREE.Vector3 | null, right: null as THREE.Vector3 | null };
    if (inXR) {
      for (const h of ['left', 'right'] as const) {
        if (this.xrInput.isDown(h, XR_BUTTON.grip) && !this.busyHands[h]) grabbing[h] = this.controllers.worldPosition(h, this.gripW[h]);
      }
    }
    let desktopDelta: { x: number; y: number; z: number } | null = null;
    if (!inXR && this.desktop.mode === 'walk') {
      const { x, y, z } = this.desktop.walk;
      const c = Math.cos(p.yaw);
      const s = Math.sin(p.yaw);
      desktopDelta = { x: x * c + z * s, y, z: -x * s + z * c };
    }
    const [lx, ly] = this.xrInput.hands.left.stick;
    const moving = this.locomotion.update(p, {
      dt,
      frame,
      area,
      head: this.headW,
      headForward: this.headFwd,
      grabbing,
      moveStick: inXR && !this.xrInput.isDown('left', XR_BUTTON.primary) ? [lx, -ly] : [0, 0],
      turnStick: inXR ? this.xrInput.hands.right.stick[0] : 0,
      desktopDelta,
    });
    for (const h of ['left', 'right'] as const) if (this.locomotion.grabStarted[h]) this.xrInput.pulse(h, 0.3, 30);

    // Fade to black if the head is inside structure (room-scale walking into a wall).
    const headL = frame.worldToLocal(this.headW.clone());
    const inWall = inXR && area.insideSolid(headL.x, headL.y, headL.z);
    this.comfortOverlay.update(dt, inXR ? moving : 0, inWall);

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
    else this.menu.openInFront(this.playerFrame(), this.camera);
  }

  /** The object the player's position is expressed in: the vessel aboard, or the scene. */
  private playerFrame(): THREE.Object3D {
    const p = this.world.players[this.localPlayerId];
    return (p.aboardVesselId && this.vesselViews.get(p.aboardVesselId)?.root) || this.scene;
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
    placeInFront(this.trialsPanel.vrMesh, this.playerFrame(), this.camera, 1.4, -0.1);
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
      coupling: () => this.decoupler.coupling,
      setCoupling: (v) => this.setCoupling(Math.round(v * 10) / 10),
      smoothWalk: () => userSettings.smoothWalk,
      setSmoothWalk: (on) => {
        userSettings.smoothWalk = on;
        saveSettings();
      },
      snapTurnDeg: () => userSettings.snapTurnDeg,
      setSnapTurnDeg: (deg) => {
        userSettings.snapTurnDeg = deg;
        saveSettings();
      },
      aboard: () => !!this.world.players[this.localPlayerId].aboardVesselId,
      toggleBoard: () => this.toggleBoard(),
      dropBoat: () => this.pushVesselIntent('debugDrop', 0),
      heelBoat: () => this.pushVesselIntent('debugHeel', 20),
      fuel: () => ({ litres: boat().engine.fuelL, tank: VESSEL_DEFS[boat().defId].engine.fuel.tankL }),
      canRefuel: () => canRefuel(boat()),
      refuelling: () => boat().refuelling,
      toggleRefuel: () => {
        if (boat().refuelling) this.pushVesselIntent('refuel', 0);
        else if (canRefuel(boat())) this.pushVesselIntent('refuel', 1);
        else this.overlay.notify('Come alongside a fuel berth (Calder Haven quay, Brannock pier head) and stop');
      },
      setFuelDebug: (l) => this.pushVesselIntent('debugFuel', l),
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
        return c ? { label: cargoLabel(c), ready: unloadBlocker(boat(), c) === null } : null;
      },
      cargoWaiting: (i) => {
        const c = this.waitingHere()[i];
        return c ? { label: cargoLabel(c), ready: loadBlocker(this.world, boat(), c) === null } : null;
      },
      unloadCargo: (i) => {
        const c = aboard(this.world, boat().id)[i];
        if (!c) return;
        const why = unloadBlocker(boat(), c);
        if (why) this.overlay.notify(why);
        else {
          this.pushVesselIntent('cargoUnload', 1, c.id);
          this.overlay.notify(`Delivered: ${cargoLabel(c)}`, 2.5);
        }
      },
      loadCargo: (i) => {
        const c = this.waitingHere()[i];
        if (!c) return;
        const why = loadBlocker(this.world, boat(), c);
        if (why) this.overlay.notify(why);
        else this.pushVesselIntent('cargoLoad', 1, c.id);
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
            return a.rodeM >= VESSEL_DEFS[boat().defId].anchor.chainM ? 'Too deep: not on the bottom' : `Off the bottom: ${a.rodeM.toFixed(0)} m out`;
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
      close: () => this.menu.close(),
    };
  }

  private setCoupling(value: number): void {
    // Keep full precision: the stick adds tiny amounts per frame (rounding here used to
    // swallow them, so holding X + stick did nothing). Round only for display.
    const c = Math.min(1, Math.max(0, value));
    this.decoupler.coupling = c;
    this.overlay.notify(`Motion coupling ${Math.round(c * 100)} %  (100 = rigid to the deck)`, 2);
    userSettings.motionCoupling = c;
    saveUserSettings();
  }

  private placePanelOnRig(): void {
    this.rig.root.add(this.overlay.vrPanel);
    this.overlay.vrPanel.position.set(-0.35, 1.15, -0.6);
    this.overlay.vrPanel.rotation.set(-0.35, 0.45, 0);
    this.overlay.vrPanel.scale.setScalar(1);
  }

  /** Bridge controls for the test vessel, the interaction system and desktop mouse/reticle. */
  private setupBridge(): void {
    const v = this.world.vessels[this.testVesselId];
    const view = this.vesselViews.get(this.testVesselId);
    if (!v || !view) return;
    this.bridge = new Bridge(VESSEL_DEFS[v.defId]);
    view.root.add(this.bridge.root);
    this.interaction = new InteractionSystem(
      this.bridge.controls,
      (channel, value) => (channel === 'engineStartStop' ? this.requestEngineStartStop() : this.pushVesselIntent(channel, value)),
      (hand, i, ms) => this.xrInput.pulse(hand, i, ms),
    );
    this.scene.add(this.interaction.rayLine('left'), this.interaction.rayLine('right'));
    this.pointer = new DesktopPointer(this.renderer.domElement, this.desktop, this.interaction, this.menu);
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
        f.gripDown = this.xrInput.isDown(h, XR_BUTTON.grip);
        f.gripPressed = this.xrInput.wasPressed(h, XR_BUTTON.grip);
        f.triggerDown = this.xrInput.isDown(h, XR_BUTTON.trigger);
        f.triggerPressed = this.xrInput.wasPressed(h, XR_BUTTON.trigger);
      }
      // The menu gets the right hand first; while it's on the menu its trigger is the menu's.
      if (this.menu.updateXR(this.hands.right, (i, ms) => this.xrInput.pulse('right', i, ms))) {
        this.hands.right.triggerDown = false;
        this.hands.right.triggerPressed = false;
      }
      this.busyHands = this.interaction.updateXR(this.hands);
      this.pointer?.hide();
      return;
    }
    this.pointer?.update(this.camera);
  }

  /** Engine start/stop with feedback when the neutral-start interlock refuses. */
  private requestEngineStartStop(): void {
    const v = this.world.vessels[this.testVesselId];
    if (!v) return;
    const def = VESSEL_DEFS[v.defId];
    if (v.engine.phase === 'off' && def.engine.startOnlyInNeutral && leverDemand(def, v.controls.lever).gear !== 0) {
      this.overlay.notify('Engine won\'t start: lever not in neutral');
      this.xrInput.pulse('right', 0.8, 150);
    }
    this.pushVesselIntent('engineStartStop', 1);
  }

  private pushVesselIntent(control: string, value: number, ref?: string): void {
    this.intents.push({ playerId: this.localPlayerId, targetId: this.testVesselId, control, value, ref });
  }

  /** Cargo waiting at the port whose cargo berth the boat is at (stack order). */
  private waitingHere(): CargoItem[] {
    const here = cargoPortAt(this.world.vessels[this.testVesselId]);
    if (!here) return [];
    return Object.values(this.world.cargo)
      .filter((c) => 'port' in c.at && c.at.port === here.id)
      .sort((a, b) => a.at.slot - b.at.slot);
  }


  private pushEnvIntent(control: string, value: number): void {
    this.intents.push({ playerId: this.localPlayerId, targetId: ENVIRONMENT_ID, control, value });
  }
}

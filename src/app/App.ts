import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
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
import { prepareWaves, type PreparedWave } from '../ocean/waves';
import { SurfaceProbes } from '../debug/surfaceProbes';
import { Buoys, createPlatform } from './testScene';
import { HydroDebugView } from '../debug/hydroDebugView';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { VesselView } from '../vessel/view/vesselView';
import { EngineAudio } from '../audio/engineAudio';
import { formatSeaTrials, runSeaTrials } from '../vessel/seaTrials';
import { formatHydrostatics } from '../vessel/hydrostatics';
import { platformWalkArea, vesselWalkArea, type WalkArea } from '../vessel/layout';
import { leverDemand } from '../vessel/physics/propulsion';
import { Locomotion } from '../player/locomotion';
import { ComfortOverlay, MotionDecoupler } from '../player/comfort';
import { XRControllers } from '../player/xrControllers';
import { Bridge } from '../controls/bridge';
import { InteractionSystem, type HandFrame } from '../controls/InteractionSystem';
import { NavLightsView } from '../vessel/view/navLights';
import { HornAudio } from '../audio/hornAudio';
import { sunElevation } from '../environment/timeOfDay';
import { clamp } from '../core/math';
import type { VesselState } from '../vessel/vesselState';

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
  /** The vessel debug keys act on (milestone 3 has exactly one). */
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
  private readonly trialsPanel = document.createElement('pre');
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
  private readonly navViews = new Map<EntityId, NavLightsView>();
  private readonly horn = new HornAudio();
  private readonly hands: Record<'left' | 'right', HandFrame> = {
    left: { tracked: false, grip: new THREE.Vector3(), ray: new THREE.Ray(), gripDown: false, gripPressed: false, triggerDown: false, triggerPressed: false },
    right: { tracked: false, grip: new THREE.Vector3(), ray: new THREE.Ray(), gripDown: false, gripPressed: false, triggerDown: false, triggerPressed: false },
  };
  private busyHands = { left: false, right: false };
  /** Desktop mouse state for clicking/dragging bridge controls (pointer-locked). */
  private readonly mouse = { down: false, pressed: false, released: false, dx: 0, dy: 0 };
  private readonly reticle = document.createElement('div');
  private readonly deskRay = new THREE.Ray();
  /** Last comfort outputs, reused for the second rig sync in a frame. */
  private viewOffset = 0;
  private readonly comfortQ = new THREE.Quaternion();
  private readonly offsetV = new THREE.Vector3();
  private readonly headW = new THREE.Vector3();
  private readonly headFwd = new THREE.Vector3();
  private readonly gripW: Record<'left' | 'right', THREE.Vector3> = { left: new THREE.Vector3(), right: new THREE.Vector3() };
  private readonly tmpV = new THREE.Vector3();
  /** Wave constants at the current *render* time (reused every frame). */
  private renderWaves: PreparedWave[] = [];
  private readonly overlay = new DebugOverlay();
  private readonly help = new HelpPanel();
  private readonly focus = new THREE.Vector3();
  private lastFrameMs = performance.now();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: CONFIG.render.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.render.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // We reset renderer.info ourselves so XR's two eye renders are counted per frame.
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);

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
    try {
      // v2: values saved before the default went back to rigid are ignored.
      const raw = localStorage.getItem('swvr.motionCoupling.v2');
      const saved = Number(raw);
      if (raw !== null && Number.isFinite(saved)) this.decoupler.coupling = saved;
    } catch {
      /* storage unavailable: use the default */
    }

    this.desktop = new DesktopController(this.camera, this.renderer.domElement, this.keyboard);
    this.environment = new EnvironmentView(this.scene);
    this.scene.add(this.sky.mesh, this.ocean.mesh, this.buoys.mesh, this.probes.mesh, createPlatform());
    for (const vessel of Object.values(this.world.vessels)) {
      const def = VESSEL_DEFS[vessel.defId];
      const view = new VesselView(vessel.id, def);
      const hydro = new HydroDebugView(def, CONFIG.debug.hydroDebugVisibleAtStart);
      view.root.add(hydro.root);
      this.scene.add(view.root);
      this.vesselViews.set(vessel.id, view);
      this.hydroViews.set(vessel.id, hydro);
      this.walkAreas.set(vessel.id, vesselWalkArea(def, def.layout));
      const nav = new NavLightsView(def);
      view.root.add(nav.root);
      this.navViews.set(vessel.id, nav);
    }
    this.setupBridge();

    this.setupXR();
    window.addEventListener('resize', () => this.onResize());
    // Audio may only start after a user gesture.
    const unlock = () => {
      this.engineAudio.unlock();
      this.horn.attach(this.engineAudio.context);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.renderer.xr.addEventListener('sessionstart', unlock);

    Object.assign(this.trialsPanel.style, {
      position: 'fixed',
      right: '8px',
      top: '8px',
      margin: '0',
      font: '12px/1.4 ui-monospace, Menlo, Consolas, monospace',
      color: '#ffe9b0',
      background: 'rgba(0,0,0,0.7)',
      padding: '8px 10px',
      borderRadius: '4px',
      display: 'none',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.trialsPanel);
  }

  start(): void {
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  private setupXR(): void {
    const xr = this.renderer.xr;
    xr.enabled = true;
    xr.setReferenceSpaceType('local-floor');
    xr.setFramebufferScaleFactor(CONFIG.xr.framebufferScale);
    document.body.appendChild(VRButton.createButton(this.renderer));

    xr.addEventListener('sessionstart', () => {
      xr.setFoveation(CONFIG.xr.foveation);
      const session = xr.getSession() as (XRSession & {
        supportedFrameRates?: Float32Array;
        updateTargetFrameRate?: (rate: number) => Promise<void>;
      }) | null;
      const rates = session?.supportedFrameRates;
      if (rates && session?.updateTargetFrameRate && Array.from(rates).includes(CONFIG.xr.targetFrameRate)) {
        session.updateTargetFrameRate(CONFIG.xr.targetFrameRate).catch(() => {});
      }
      // The headset now owns the camera pose relative to the rig.
      this.camera.position.set(0, 0, 0);
      this.camera.quaternion.identity();
    });
  }

  private onResize(): void {
    if (this.renderer.xr.isPresenting) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private frame(nowMs: number): void {
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
      this.horn.update(this.world.vessels[this.testVesselId].controls.horn > 0, distance);
    }
    // Bridge controls and displays read the (just-updated) vessel state.
    const testVessel = this.world.vessels[this.testVesselId];
    if (this.bridge && testVessel) this.bridge.update(testVessel, dt);
    const darkness = Math.min(1, Math.max(0, (8 - sunElevation(this.world.environment.timeOfDay)) / 14));
    for (const [id, nav] of this.navViews) nav.update(this.world.vessels[id].controls.navLights > 0, darkness);

    // 4. Render
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);

    this.overlay.frame(
      frameMs,
      {
        drawCalls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        tick: this.world.tick,
        timeOfDay: this.world.environment.timeOfDay,
        xr: inXR ? 'presenting' : this.desktop.pointerLocked ? 'desktop (mouse captured)' : 'desktop',
        extra: this.bridgeSummary(this.world.vessels[this.testVesselId]) + '\n' + this.vesselSummary(this.world.vessels[this.testVesselId]),
      },
      inXR,
    );
    this.keyboard.endFrame();
    this.mouse.pressed = false;
    this.mouse.released = false;
    this.mouse.dx = 0;
    this.mouse.dy = 0;
  }

  /** Debug-only bindings. Note time-of-day goes through the intent path like any control. */
  private handleDebugInput(dt: number): void {
    const k = this.keyboard;
    if (k.actionPressed('toggleOverlay')) this.overlay.toggle();
    if (this.xrInput.wasPressed('left', XR_BUTTON.secondary) || this.xrInput.wasPressed('right', XR_BUTTON.secondary)) {
      this.overlay.toggle();
    }
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
    if (k.actionPressed('board') || this.xrInput.wasPressed('left', XR_BUTTON.stick)) {
      const aboard = this.world.players[this.localPlayerId].aboardVesselId;
      this.intents.push({
        playerId: this.localPlayerId,
        targetId: this.localPlayerId,
        control: 'board',
        value: aboard ? 0 : 1,
        ref: aboard ? undefined : this.testVesselId,
      });
    }
    if (k.actionPressed('seaTrials')) this.showSeaTrials();
    if (k.actionPressed('seaState')) this.pushEnvIntent('seaState', this.world.environment.waves.length > 0 ? 0 : 1);
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

    // Debug panel rides on the left wrist when that controller is tracked.
    const left = this.controllers.grips.left;
    if (inXR && left && this.overlay.vrPanel.parent !== left) {
      left.add(this.overlay.vrPanel);
      this.overlay.vrPanel.position.set(0, 0.06, 0.1);
      this.overlay.vrPanel.rotation.set(-1.0, 0, 0);
      this.overlay.vrPanel.scale.setScalar(0.75);
    } else if ((!inXR || !left) && this.overlay.vrPanel.parent !== this.rig.root) {
      this.placePanelOnRig();
    }
  }

  private setCoupling(value: number): void {
    // Keep full precision: the stick adds tiny amounts per frame (rounding here used to
    // swallow them, so holding X + stick did nothing). Round only for display.
    const c = Math.min(1, Math.max(0, value));
    this.decoupler.coupling = c;
    this.overlay.notify(`Motion coupling ${Math.round(c * 100)} %  (100 = rigid to the deck)`, 2);
    try {
      localStorage.setItem('swvr.motionCoupling.v2', String(c));
    } catch {
      /* storage unavailable: setting just isn't remembered */
    }
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

    const canvas = this.renderer.domElement;
    document.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas || e.button !== 0) return;
      this.mouse.down = true;
      this.mouse.pressed = true;
      // Freeze mouse-look immediately if the reticle is on a control: movement events
      // arrive before the next frame processes the press and would swing the aim off it.
      if (this.interaction?.desktopHoverLabel) this.desktop.lookFrozen = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || !this.mouse.down) return;
      this.mouse.down = false;
      this.mouse.released = true;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.mouse.down) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });

    Object.assign(this.reticle.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      font: '600 13px system-ui, sans-serif',
      color: '#fff',
      textShadow: '0 0 3px #000',
      pointerEvents: 'none',
      textAlign: 'center',
      whiteSpace: 'pre',
      display: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.reticle);
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
      this.busyHands = this.interaction.updateXR(this.hands);
      this.reticle.style.display = 'none';
      return;
    }
    const locked = this.desktop.pointerLocked;
    let ray: THREE.Ray | null = null;
    if (locked) {
      this.camera.getWorldPosition(this.deskRay.origin);
      this.camera.getWorldDirection(this.deskRay.direction);
      ray = this.deskRay;
    }
    const m = this.mouse;
    this.desktop.lookFrozen = this.interaction.updateDesktop(ray, m.down, m.pressed, m.released, m.dx, m.dy);
    const label = this.interaction.desktopHoverLabel;
    this.reticle.style.display = locked ? 'block' : 'none';
    this.reticle.textContent = label ? `+\n${label}` : '+';
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

  private showSeaTrials(): void {
    if (this.trialsPanel.style.display === 'block') {
      this.trialsPanel.style.display = 'none';
      return;
    }
    this.trialsPanel.textContent = 'Running hydrostatics and sea trials (calm water)...';
    this.trialsPanel.style.display = 'block';
    // Let the message paint before the (~1 s) synchronous run.
    setTimeout(() => {
      const t0 = performance.now();
      const defId = this.world.vessels[this.testVesselId].defId;
      const report = `${formatHydrostatics(VESSEL_DEFS[defId])}\n\n${formatSeaTrials(runSeaTrials(defId))}`;
      console.log(report);
      this.trialsPanel.textContent = `${report}\n\n(${((performance.now() - t0) / 1000).toFixed(1)} s to simulate · T to close)`;
    }, 30);
  }

  /** Bridge readouts for the debug overlay (live displays replace this in milestone 6). */
  private bridgeSummary(v: VesselState | undefined): string {
    if (!v) return '';
    this.attQ.fromArray(v.orientation);
    const fwd = this.attV.set(0, 0, -1).applyQuaternion(this.attQ);
    const heading = ((Math.atan2(fwd.x, -fwd.z) * 180) / Math.PI + 360) % 360;
    const kn = Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) * 1.943844;
    const gear = v.engine.gear === 1 ? 'AHEAD' : v.engine.gear === -1 ? 'ASTERN' : 'NEUTRAL';
    const engine = v.engine.phase === 'off' ? 'ENGINE OFF' : v.engine.phase === 'cranking' ? 'CRANKING' : `${v.engine.rpm.toFixed(0)} rpm`;
    const rudder = (v.rudder * 180) / Math.PI;
    const rudderText = Math.abs(rudder) < 0.5 ? 'midships' : `${Math.abs(rudder).toFixed(0)}° ${rudder > 0 ? 'stbd' : 'port'}`;
    return [
      `SOG ${kn.toFixed(1)} kn  HDG ${heading.toFixed(0).padStart(3, '0')}°  ${engine}`,
      `lever ${(v.controls.lever * 100).toFixed(0)} %  ${gear}  rudder ${rudderText}`,
    ].join('\n');
  }

  private pushVesselIntent(control: string, value: number): void {
    this.intents.push({ playerId: this.localPlayerId, targetId: this.testVesselId, control, value });
  }

  private readonly attQ = new THREE.Quaternion();
  private readonly attV = new THREE.Vector3();

  /** One-line motion summary for the debug overlay. */
  private vesselSummary(v: VesselState | undefined): string {
    if (!v) return '';
    const D = 180 / Math.PI;
    this.attQ.fromArray(v.orientation);
    const heel = -Math.asin(this.attV.set(1, 0, 0).applyQuaternion(this.attQ).y) * D;
    const trim = -Math.asin(this.attV.set(0, 0, -1).applyQuaternion(this.attQ).y) * D;
    const vol = this.simDebug.get(v.id)?.submergedVolume ?? 0;
    const disp = (vol * CONFIG.ocean.density) / 1000;
    return `boat heel ${heel.toFixed(1)}°  trim ${trim.toFixed(1)}°  heave ${v.position[1].toFixed(2)} m\nboat immersed ${disp.toFixed(1)} t of ${(VESSEL_DEFS[v.defId].mass / 1000).toFixed(1)} t`;
  }

  private pushEnvIntent(control: string, value: number): void {
    this.intents.push({ playerId: this.localPlayerId, targetId: ENVIRONMENT_ID, control, value });
  }
}

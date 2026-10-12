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
    this.scene.add(this.rig.root);
    this.overlay.vrPanel.position.set(-0.35, 1.15, -0.6);
    this.overlay.vrPanel.rotation.set(-0.35, 0.45, 0);
    this.rig.root.add(this.overlay.vrPanel);

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
    }
    // Stand on the observation platform deck (test scene until the player boards in milestone 5).
    this.rig.root.position.y = CONFIG.testScene.platformDeckHeight;

    this.setupXR();
    window.addEventListener('resize', () => this.onResize());
    // Audio may only start after a user gesture.
    const unlock = () => this.engineAudio.unlock();
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

    this.syncRigToPlayer();
    if (!inXR) this.desktop.update(dt);
    this.camera.getWorldPosition(this.focus);
    this.environment.update(this.world.environment, this.focus);
    this.sky.update(this.environment, this.focus);
    this.ocean.update(this.renderWaves, this.focus, this.environment);
    this.buoys.update(this.renderWaves);
    this.probes.update(this.renderWaves, this.camera);
    for (const [id, view] of this.vesselViews) {
      view.update(this.world.vessels[id], alpha);
      this.hydroViews.get(id)?.update(this.simDebug.get(id));
    }
    const testView = this.vesselViews.get(this.testVesselId);
    if (testView) {
      // Engine room sits roughly under the wheelhouse.
      const distance = testView.root.localToWorld(this.tmpV.set(0, 0, 1)).distanceTo(this.focus);
      this.engineAudio.update(this.world.vessels[this.testVesselId], distance);
    }

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
    if (k.actionPressed('dropVessel') || this.xrInput.wasPressed('right', XR_BUTTON.primary)) this.pushVesselIntent('debugDrop', 0);
    this.handleDebugDriving(dt);
    if (k.actionPressed('engine') || this.xrInput.wasPressed('right', XR_BUTTON.stick)) this.pushVesselIntent('engineStartStop', 1);
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
    if (k.actionPressed('heelVessel') || this.xrInput.wasPressed('left', XR_BUTTON.primary)) this.pushVesselIntent('debugHeel', 20);
    const step = CONFIG.environment.timeStepHours;
    if (k.actionPressed('timeEarlier')) this.pushEnvIntent('timeOfDayDelta', -step);
    if (k.actionPressed('timeLater')) this.pushEnvIntent('timeOfDayDelta', step);
  }

  /**
   * Debug driving: arrow keys or the right VR thumbstick move the lever and helm at a fixed
   * rate. They send absolute positions as intents, exactly like the physical bridge
   * controls will in milestone 6.
   */
  private handleDebugDriving(dt: number): void {
    const v = this.world.vessels[this.testVesselId];
    if (!v) return;
    const k = this.keyboard;
    const cfg = CONFIG.debugDriving;
    const [sx, sy] = this.xrInput.hands.right.stick;
    const dead = (a: number) => (Math.abs(a) < 0.25 ? 0 : a);
    const leverIn = (k.action('leverAhead') ? 1 : 0) - (k.action('leverAstern') ? 1 : 0) - dead(sy);
    const helmIn = (k.action('helmStarboard') ? 1 : 0) - (k.action('helmPort') ? 1 : 0) + dead(sx);

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

  /** Parent the local rig to whatever the player is aboard, at the player's position. */
  private syncRigToPlayer(): void {
    const p = this.world.players[this.localPlayerId];
    if (p.aboardVesselId !== this.rigParentId) {
      const parent = p.aboardVesselId ? this.vesselViews.get(p.aboardVesselId)?.root : this.scene;
      (parent ?? this.scene).add(this.rig.root);
      this.rigParentId = p.aboardVesselId;
      this.desktop.resetPose();
    }
    this.rig.root.position.fromArray(p.position);
    this.rig.root.rotation.set(0, p.yaw, 0);
  }

  private showSeaTrials(): void {
    if (this.trialsPanel.style.display === 'block') {
      this.trialsPanel.style.display = 'none';
      return;
    }
    this.trialsPanel.textContent = 'Running sea trials (calm water)...';
    this.trialsPanel.style.display = 'block';
    // Let the message paint before the (~1 s) synchronous run.
    setTimeout(() => {
      const t0 = performance.now();
      const report = formatSeaTrials(runSeaTrials(), CONFIG.vessels.workboat.hull.length);
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

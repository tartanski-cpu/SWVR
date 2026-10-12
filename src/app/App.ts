import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { CONFIG } from '../config';
import { IdFactory, ENVIRONMENT_ID, type EntityId } from '../core/ids';
import { IntentQueue } from '../core/intents';
import { Keyboard } from '../core/keyboard';
import { FixedStepLoop } from '../core/loop';
import { stepWorld } from '../core/simulation';
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

    this.rig = new PlayerRig(this.localPlayerId, this.camera);
    this.scene.add(this.rig.root);
    this.overlay.vrPanel.position.set(-0.35, 1.15, -0.6);
    this.overlay.vrPanel.rotation.set(-0.35, 0.45, 0);
    this.rig.root.add(this.overlay.vrPanel);

    this.desktop = new DesktopController(this.camera, this.renderer.domElement, this.keyboard);
    this.environment = new EnvironmentView(this.scene);
    this.scene.add(this.sky.mesh, this.ocean.mesh, this.buoys.mesh, this.probes.mesh, createPlatform());
    // Stand on the observation platform deck (milestone 2 test scene).
    this.rig.root.position.y = CONFIG.testScene.platformDeckHeight;

    this.setupXR();
    window.addEventListener('resize', () => this.onResize());
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
    this.handleDebugInput();

    // 2. Fixed-step simulation
    const { ticks, alpha } = this.loop.advance(dt);
    for (let i = 0; i < ticks; i++) {
      stepWorld(this.world, i === 0 ? this.intents.drain() : [], this.loop.dt);
    }

    // 3. Views. Rendering runs one tick behind the simulation and interpolates between
    // the previous and current tick by `alpha`; the ocean uses the same render time so
    // floating objects and the water surface always agree.
    const renderTime = Math.max(0, (this.world.tick - 1 + alpha) * this.loop.dt);
    this.renderWaves = prepareWaves(this.world.environment.waves, renderTime, this.renderWaves);

    if (!inXR) this.desktop.update(dt);
    this.camera.getWorldPosition(this.focus);
    this.environment.update(this.world.environment, this.focus);
    this.sky.update(this.environment, this.focus);
    this.ocean.update(this.renderWaves, this.focus, this.environment);
    this.buoys.update(this.renderWaves);
    this.probes.update(this.renderWaves, this.camera);

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
      },
      inXR,
    );
    this.keyboard.endFrame();
  }

  /** Debug-only bindings. Note time-of-day goes through the intent path like any control. */
  private handleDebugInput(): void {
    const k = this.keyboard;
    if (k.actionPressed('toggleOverlay')) this.overlay.toggle();
    if (this.xrInput.wasPressed('left', XR_BUTTON.secondary) || this.xrInput.wasPressed('right', XR_BUTTON.secondary)) {
      this.overlay.toggle();
    }
    if (k.actionPressed('toggleHelp')) this.help.toggle();
    if (k.actionPressed('toggleProbes')) this.probes.toggle();
    const step = CONFIG.environment.timeStepHours;
    if (k.actionPressed('timeEarlier')) this.pushEnvIntent('timeOfDayDelta', -step);
    if (k.actionPressed('timeLater')) this.pushEnvIntent('timeOfDayDelta', step);
  }

  private pushEnvIntent(control: string, value: number): void {
    this.intents.push({ playerId: this.localPlayerId, targetId: ENVIRONMENT_ID, control, value });
  }
}

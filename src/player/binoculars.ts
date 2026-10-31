import * as THREE from 'three';
import { CONFIG } from '../config';
import type { HandFrame } from '../controls/InteractionSystem';
import type { Handedness } from './xrInput';

/**
 * Binoculars (owner request). They lie on top of the dash; a local tool, not shared state.
 *
 *   VR       grip them to pick them up (they stay in the hand while you hold the grip);
 *            bring them up to your eyes and you see through them: a `magnification` x
 *            view in two lens circles in front of your eyes. That view is a second, small
 *            render of the scene (CONFIG.binoculars.renderSize square, a narrow field of
 *            view, frustum-culled to almost nothing) - only while you're looking. Let go
 *            and they go back on the dash.
 *   desktop  hold Z (the key in that position): the camera's field of view narrows by the
 *            magnification, the screen is masked to the two circles, and the mouse look
 *            slows down to match.
 *
 * The XR render: WebXR fixes the headset's projection, so the zoom can't be a narrower
 * field of view of the eyes themselves. Instead the scene is rendered once more from the
 * head (non-XR, into a render target) and shown on a quad just in front of the eyes,
 * masked to the two lenses. In VR that quad is head-locked, as real binoculars are.
 *
 * The bearing (Training M4): a compass in them, as many marine glasses have. The true
 * bearing of the view's centre shows under the lenses (a small canvas, redrawn only when the
 * whole degree changes; desktop: a line of text), with a fine tick at the centre to aim by.
 * A press takes it (VR: the trigger of the hand holding them; desktop: a left click, App):
 * `takeBearing()` hands it to the App once.
 */
/** The lens quad's own layer: while looking (VR) the main pass draws nothing else. */
const LENS_LAYER = 30;

export class Binoculars {
  /** The binoculars themselves (in the workboat's frame when on the dash). */
  readonly mesh: THREE.Group;
  /** The view through them (VR): a head-locked quad, child of the camera. */
  private readonly view: THREE.Mesh;
  private readonly rt: THREE.WebGLRenderTarget;
  private readonly scopeCam: THREE.PerspectiveCamera;
  private held: Handedness | null = null;
  private readonly stowPos = new THREE.Vector3();
  private readonly stowQuat = new THREE.Quaternion();
  private home: THREE.Object3D | null = null;
  /** Looking through them this frame (VR held to the eyes, or desktop key held). */
  looking = false;
  /** Desktop: the camera's own field of view while not zoomed. */
  private baseFov = 0;
  private readonly mask: HTMLDivElement | null = null;
  private readonly tmp = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  /** VR: the scope's eased orientation (see renderScope); is it worth easing from? */
  private steadyFrom = false;
  private lastRender = 0;
  /** The bearing readout: VR a canvas under the lenses, desktop a line of text; the degree shown. */
  private readonly readout: THREE.Mesh;
  private readonly readoutCtx: CanvasRenderingContext2D | null = null;
  private readonly readoutTex: THREE.CanvasTexture | null = null;
  private readonly label: HTMLDivElement | null = null;
  private shown = -1;
  /** A bearing taken (deg true), and from where (world x, z), waiting for the App. */
  private taken: { deg: number; x: number; z: number } | null = null;
  private readonly dir = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    const c = CONFIG.binoculars;
    // Two barrels and a bridge: dark rubber armour, glass at the big ends (-z is forward).
    const body = new THREE.MeshLambertMaterial({ color: 0x23272a });
    const glass = new THREE.MeshBasicMaterial({ color: 0x2a4a5a });
    this.mesh = new THREE.Group();
    this.mesh.name = 'binoculars';
    for (const x of [-0.036, 0.036]) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.021, 0.15, 10).rotateX(Math.PI / 2).translate(x, 0, 0), body);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.023, 12).rotateY(Math.PI).translate(x, 0, -0.0755), glass);
      this.mesh.add(barrel, lens);
    }
    this.mesh.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.06), body));

    // The image: a 2:1 picture `renderSize` wide, drawn with a field `magnification` times
    // narrower than the lenses span, so things look that much bigger.
    this.rt = new THREE.WebGLRenderTarget(c.renderSize, c.renderSize / 2);
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    // The lenses: two overlapping circles, each spanning `lensDeg` of your view, cut out of
    // the picture 0.2 m ahead of the eyes. The picture's height is the lens's diameter.
    const EYE = 0.2;
    const lensR = EYE * Math.tan((c.lensDeg / 2) * (Math.PI / 180));
    const picH = 2 * lensR;
    this.scopeCam = new THREE.PerspectiveCamera(c.lensDeg / c.magnification, 2, 0.5, CONFIG.render.far);
    // The view quad fills the headset's whole field (owner: nothing outside the binoculars,
    // so the scene itself need not be drawn while you look; see renderMain). Black outside
    // the lens circles, a soft edge.
    const QUAD = 1.6;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.rt.texture }, quad: { value: QUAD }, pic: { value: new THREE.Vector2(2 * picH, picH) }, lensR: { value: lensR } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D map; uniform float quad; uniform vec2 pic; uniform float lensR; varying vec2 vUv;
        void main(){
          vec2 m = (vUv - 0.5) * quad;              // metres on the quad, from its centre
          float d = min(distance(m, vec2(-0.56 * lensR, 0.0)), distance(m, vec2(0.56 * lensR, 0.0)));
          float a = 1.0 - smoothstep(0.92 * lensR, lensR, d);
          vec2 uv = clamp(m / pic + 0.5, 0.0, 1.0);  // the picture is centred on the quad
          vec4 c = texture2D(map, uv);
          // The tick to aim by: a fine vertical line at the centre of the view.
          float tick = (1.0 - step(0.0007, abs(m.x))) * (1.0 - step(0.12 * lensR, abs(m.y)));
          gl_FragColor = vec4(mix(c.rgb, vec3(1.0, 0.85, 0.3), 0.8 * tick) * a, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.view = new THREE.Mesh(new THREE.PlaneGeometry(QUAD, QUAD), mat);
    this.view.position.set(0, 0, -EYE);
    this.view.renderOrder = 999;
    this.view.visible = false;
    this.view.frustumCulled = false;
    this.view.layers.set(LENS_LAYER);
    this.view.layers.enable(0);
    camera.add(this.view);

    // The bearing under the lenses (VR): a small canvas just in front of the view quad, low
    // in the lens pair; drawn on the lens layer, so it shows while looking and only then.
    const can = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (can) {
      can.width = 256;
      can.height = 64;
      this.readoutCtx = can.getContext('2d');
      this.readoutTex = new THREE.CanvasTexture(can);
      this.readoutTex.colorSpace = THREE.SRGBColorSpace;
    }
    const rw = lensR * 0.9;
    this.readout = new THREE.Mesh(new THREE.PlaneGeometry(rw, rw / 4), new THREE.MeshBasicMaterial({ map: this.readoutTex, transparent: true, depthTest: false, depthWrite: false }));
    this.readout.position.set(0, -lensR * 0.62, -EYE + 0.001);
    this.readout.renderOrder = 1000;
    this.readout.frustumCulled = false;
    this.readout.visible = false;
    this.readout.layers.set(LENS_LAYER);
    this.readout.layers.enable(0);
    camera.add(this.readout);

    if (typeof document !== 'undefined' && document.body) {
      // Desktop: black everywhere but two lens circles (each gradient masks out its circle;
      // intersected, only what's outside both stays black).
      const m = document.createElement('div');
      const hole = (x: number) => `radial-gradient(circle at ${x}% 50%, transparent 0 30vh, #000 31vh)`;
      m.style.cssText = 'position:fixed;inset:0;pointer-events:none;display:none;z-index:5;background:#000;';
      m.style.setProperty('mask-image', `${hole(42)}, ${hole(58)}`);
      m.style.setProperty('mask-composite', 'intersect');
      m.style.setProperty('-webkit-mask-image', `${hole(42)}, ${hole(58)}`);
      m.style.setProperty('-webkit-mask-composite', 'source-in');
      document.body.appendChild(m);
      this.mask = m;
      // The bearing (desktop): under the lenses, centred.
      const l = document.createElement('div');
      l.style.cssText = 'position:fixed;left:50%;top:calc(50% + 22vh);transform:translateX(-50%);pointer-events:none;display:none;z-index:6;font:600 22px system-ui,sans-serif;color:#ffd970;text-shadow:0 0 4px #000;';
      document.body.appendChild(l);
      this.label = l;
    }
  }

  /** Put them on the dash: `parent` (the workboat's root) at `pos` (its axes). */
  /** Their place aboard (vessel axes, on the dash), turned `yawDeg`. */
  stow(parent: THREE.Object3D, at: readonly number[], yawDeg: number): void {
    this.home = parent;
    this.stowPos.fromArray(at);
    this.stowQuat.setFromEuler(new THREE.Euler(0, yawDeg * (Math.PI / 180), 0));
    this.toStow();
  }

  private toStow(): void {
    if (!this.home) return;
    this.home.add(this.mesh);
    this.mesh.position.copy(this.stowPos);
    this.mesh.quaternion.copy(this.stowQuat);
  }

  /** Is this hand holding them (its grip and trigger are theirs)? */
  busy(h: Handedness): boolean {
    return this.held === h;
  }

  /**
   * VR: pick up, carry, look. Returns the hands they use this frame.
   * @param head the headset's world position
   */
  updateXR(hands: Record<Handedness, HandFrame>, busy: Record<Handedness, boolean>, head: THREE.Vector3, pulse: (h: Handedness, i: number, ms: number) => void): Record<Handedness, boolean> {
    const used = { left: false, right: false };
    if (this.held) {
      const f = hands[this.held];
      if (!f.tracked || !f.gripDown) {
        pulse(this.held, 0.3, 20);
        this.held = null;
        this.toStow();
      } else {
        used[this.held] = true;
        // In the hand (world space, under the scene root): at the grip, pointing where the hand points.
        const scene = this.sceneOf();
        if (scene && this.mesh.parent !== scene) scene.add(this.mesh);
        this.mesh.position.copy(f.grip);
        if (f.quat) this.mesh.quaternion.copy(f.quat);
      }
    } else {
      for (const h of ['right', 'left'] as const) {
        const f = hands[h];
        if (!f.tracked || busy[h] || !f.gripPressed) continue;
        if (this.mesh.getWorldPosition(this.tmp).distanceTo(f.grip) < CONFIG.binoculars.grabRange) {
          this.held = h;
          used[h] = true;
          pulse(h, 0.5, 30);
          break;
        }
      }
    }
    const was = this.looking;
    this.looking = !!this.held && hands[this.held].grip.distanceTo(head) < CONFIG.binoculars.eyeRange;
    if (this.looking && !was && this.held) pulse(this.held, 0.25, 20);
    // While at the eyes the binoculars themselves would fill the view: hide them.
    this.mesh.visible = !this.looking;
    this.view.visible = this.looking;
    this.readout.visible = this.looking;
    if (this.looking && this.held && hands[this.held].triggerPressed) {
      this.take();
      pulse(this.held, 0.6, 40);
    }
    return used;
  }

  private sceneOf(): THREE.Object3D | null {
    let o: THREE.Object3D | null = this.camera;
    while (o?.parent) o = o.parent;
    return o;
  }

  /** Desktop: zoom while the key is held. Returns the look-speed factor to apply. */
  updateDesktop(held: boolean): number {
    if (held && !this.looking) this.baseFov = this.camera.fov;
    if (held !== this.looking) {
      this.looking = held;
      this.camera.fov = held ? this.baseFov / CONFIG.binoculars.magnification : this.baseFov;
      this.camera.updateProjectionMatrix();
      if (this.mask) this.mask.style.display = held ? 'block' : 'none';
      if (this.label) this.label.style.display = held ? 'block' : 'none';
    }
    if (held && this.label) {
      const deg = Math.round(this.bearing()) % 360;
      if (deg !== this.shown) {
        this.shown = deg;
        this.label.textContent = `${String(deg).padStart(3, '0')}°`;
      }
    }
    return held ? 1 / CONFIG.binoculars.magnification : 1;
  }

  /**
   * The true bearing of the view's centre (deg, 0 north, clockwise): VR the steadied scope's,
   * desktop the camera's. World axes: +X east, -Z north.
   */
  bearing(): number {
    const cam = this.view.visible ? this.scopeCam : this.camera;
    cam.getWorldDirection(this.dir);
    return ((Math.atan2(this.dir.x, -this.dir.z) * 180) / Math.PI + 360) % 360;
  }

  /** Take the bearing now (desktop: the App on a left click while looking). */
  take(): void {
    const cam = this.view.visible ? this.scopeCam : this.camera;
    cam.getWorldPosition(this.tmp);
    this.taken = { deg: Math.round(this.bearing() * 10) / 10, x: this.tmp.x, z: this.tmp.z };
  }

  /** The bearing taken since the last call (and where from), once; else null. */
  takeBearing(): { deg: number; x: number; z: number } | null {
    const b = this.taken;
    this.taken = null;
    return b;
  }

  /** VR: the readout's figure, redrawn only when the whole degree changes. */
  private drawReadout(): void {
    const g = this.readoutCtx;
    if (!g || !this.readoutTex) return;
    const deg = Math.round(this.bearing()) % 360;
    if (deg === this.shown) return;
    this.shown = deg;
    g.clearRect(0, 0, 256, 64);
    g.font = `600 ${CONFIG.binoculars.bearingFont}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(0,0,0,0.8)';
    const text = `${String(deg).padStart(3, '0')}°`;
    g.strokeText(text, 128, 34);
    g.fillStyle = '#ffd970';
    g.fillText(text, 128, 34);
    this.readoutTex.needsUpdate = true;
  }

  /** VR, before the main render: the view through the lenses (only while looking). */
  renderScope(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    if (!this.view.visible) {
      this.steadyFrom = false;
      return;
    }
    // From the head, looking where it looks (last frame's pose: one frame behind, unseen).
    // The orientation is eased over `steady` s (owner: at 7x every tremor of the head is
    // magnified too; real binoculars are steadied against the brow), so the view lags a
    // quick turn of the head a little and the shake is smoothed out. The lenses themselves
    // stay head-locked, so turning still feels direct.
    const now = performance.now() / 1000;
    const dt = this.steadyFrom ? Math.min(0.1, now - this.lastRender) : 0;
    this.lastRender = now;
    this.camera.getWorldPosition(this.scopeCam.position);
    this.camera.getWorldQuaternion(this.tmpQ);
    const tau = CONFIG.binoculars.steady;
    if (this.steadyFrom && tau > 0) this.scopeCam.quaternion.slerp(this.tmpQ, 1 - Math.exp(-dt / tau));
    else this.scopeCam.quaternion.copy(this.tmpQ);
    this.steadyFrom = true;
    this.scopeCam.updateMatrixWorld();
    this.drawReadout();
    const xr = renderer.xr.enabled;
    renderer.xr.enabled = false;
    this.view.visible = false;
    this.readout.visible = false;
    // Back to the frame's own target afterwards: in VR that's the headset's framebuffer,
    // set by three.js at the start of each frame (null would be the hidden canvas: the
    // headset's view would never change).
    const target = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.render(scene, this.scopeCam);
    renderer.setRenderTarget(target);
    this.view.visible = true;
    this.readout.visible = true;
    renderer.xr.enabled = xr;
  }

  /**
   * The frame's main render. VR, looking through them: the lens quad covers the whole
   * field, so only it is drawn (the camera sees its layer alone): the scene is drawn once,
   * for the scope, at full draw distance, instead of twice.
   */
  renderMain(renderer: THREE.WebGLRenderer, scene: THREE.Scene, inXR: boolean): void {
    if (!(inXR && this.view.visible)) {
      renderer.render(scene, this.camera);
      return;
    }
    const mask = this.camera.layers.mask;
    this.camera.layers.set(LENS_LAYER);
    renderer.render(scene, this.camera);
    this.camera.layers.mask = mask;
  }

  /**
   * Entering VR: compile the lens shader and draw the scope once now, so the first look
   * through them doesn't stall for the compile (owner: a hitch when raised).
   */
  warm(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    this.view.visible = true;
    renderer.compile(scene, this.camera);
    this.renderScope(renderer, scene);
    this.view.visible = false;
    this.readout.visible = false;
    this.steadyFrom = false;
  }

  /** Leaving VR: put them back. */
  drop(): void {
    this.held = null;
    this.looking = false;
    this.view.visible = false;
    this.readout.visible = false;
    this.mesh.visible = true;
    this.toStow();
  }
}

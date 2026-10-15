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
 */
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

    this.rt = new THREE.WebGLRenderTarget(c.renderSize, c.renderSize);
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    // The lens quad below spans 2 atan(0.085 / 0.2) ~ 46 deg of your view; the scene is
    // drawn into it with a field `magnification` times narrower, so things look that much bigger.
    const quadDeg = (2 * Math.atan(0.085 / 0.2) * 180) / Math.PI;
    this.scopeCam = new THREE.PerspectiveCamera(quadDeg / c.magnification, 2, 0.5, 5000);
    // The view: two overlapping lens circles cut out of a quad by the shader (soft edge).
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.rt.texture } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D map; varying vec2 vUv;
        void main(){
          vec2 p = vUv * vec2(2.0, 1.0);
          float d = min(distance(p, vec2(0.72, 0.5)), distance(p, vec2(1.28, 0.5)));
          float a = 1.0 - smoothstep(0.46, 0.5, d);
          vec4 c = texture2D(map, vUv);
          gl_FragColor = vec4(c.rgb * a, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    // 2:1 quad 0.2 m ahead of the eyes, wide enough to fill most of the view.
    this.view = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), mat);
    this.view.position.set(0, 0, -0.2);
    this.view.renderOrder = 999;
    this.view.visible = false;
    this.view.frustumCulled = false;
    camera.add(this.view);

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
    }
  }

  /** Put them on the dash: `parent` (the workboat's root) at `pos` (its axes). */
  stow(parent: THREE.Object3D): void {
    this.home = parent;
    this.stowPos.fromArray(CONFIG.binoculars.stow);
    this.stowQuat.setFromEuler(new THREE.Euler(0, CONFIG.binoculars.stowYawDeg * (Math.PI / 180), 0));
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
    }
    return held ? 1 / CONFIG.binoculars.magnification : 1;
  }

  /** VR, before the main render: the view through the lenses (only while looking). */
  renderScope(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    if (!this.view.visible) return;
    // From the head, looking where it looks (last frame's pose: one frame behind, unseen).
    this.camera.getWorldPosition(this.scopeCam.position);
    this.camera.getWorldQuaternion(this.tmpQ);
    this.scopeCam.quaternion.copy(this.tmpQ);
    this.scopeCam.updateMatrixWorld();
    const xr = renderer.xr.enabled;
    renderer.xr.enabled = false;
    this.view.visible = false;
    renderer.setRenderTarget(this.rt);
    renderer.render(scene, this.scopeCam);
    renderer.setRenderTarget(null);
    this.view.visible = true;
    renderer.xr.enabled = xr;
  }

  /** Leaving VR: put them back. */
  drop(): void {
    this.held = null;
    this.looking = false;
    this.view.visible = false;
    this.mesh.visible = true;
    this.toStow();
  }
}

import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * The recording camera in a VR player's hand (player/cameraHold.ts): which way it looks, and
 * a small preview screen of what it sees (owner request).
 *
 * Facing you (as picked up): the lens turns to your head, as on a selfie stick, so it films
 * you wherever your hand is (turned straight round in the hand, it would look back through
 * your own fist). Flipped with the trigger: it looks out ahead of your hand, as you point it.
 *
 * The preview: a small screen just above the camera, turned to your eyes, showing its view.
 * Kept cheap for the Quest: a tiny picture (CONFIG.camera.preview `width` x `height`), drawn
 * only `rate` times a second and only out to `far` metres, and only while you hold a camera.
 * Your own figure isn't drawn on your side (you see only your hands), so facing you the
 * preview shows what's behind you; the camera's player sees you in it.
 */

const m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

/** A camera at `lens` looking at `head` (world), upright: its quaternion (the camera looks down -z). */
export function faceHolder(lens: THREE.Vector3, head: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  if (lens.distanceToSquared(head) < 1e-6) return out;
  return out.setFromRotationMatrix(m.lookAt(lens, head, UP));
}

export class CameraPreview {
  /** The screen (in the scene, world axes): hidden unless we hold a camera. */
  readonly screen: THREE.Mesh;
  private readonly rt: THREE.WebGLRenderTarget;
  private readonly cam: THREE.PerspectiveCamera;
  private since = Infinity;
  private source: THREE.Object3D | null = null;
  private readonly tmp = new THREE.Vector3();

  constructor() {
    const c = CONFIG.camera.preview;
    this.rt = new THREE.WebGLRenderTarget(c.width, c.height);
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.cam = new THREE.PerspectiveCamera(CONFIG.camera.fov, c.width / c.height, 0.05, c.far);
    const w = c.size;
    const h = (w * c.height) / c.width;
    // The picture, and a dark bezel behind it (one mesh each; only while held).
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.rt.texture }));
    const bezel = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.012, h + 0.012).translate(0, 0, -0.002), new THREE.MeshBasicMaterial({ color: 0x15181b }));
    this.screen.add(bezel);
    this.screen.name = 'camera-preview';
    this.screen.visible = false;
    this.screen.frustumCulled = false;
  }

  hide(): void {
    this.screen.visible = false;
    this.source = null;
  }

  /** While a camera is in our hand: `body` the camera body (its origin the lens, looking down -z); `eyes` our head (world). */
  show(body: THREE.Object3D, eyes: THREE.Vector3, dt: number): void {
    const c = CONFIG.camera.preview;
    this.source = body;
    this.since += dt;
    body.getWorldPosition(this.tmp);
    this.screen.position.copy(this.tmp).addScaledVector(UP, c.above);
    this.screen.lookAt(eyes);
    this.screen.visible = true;
  }

  /** Before the main render (VR): the camera's view into the screen, `rate` times a second. */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    if (!this.source || !this.screen.visible || this.since < 1 / CONFIG.camera.preview.rate) return;
    this.since = 0;
    this.source.getWorldPosition(this.cam.position);
    this.source.getWorldQuaternion(this.cam.quaternion);
    this.cam.updateMatrixWorld();
    const xr = renderer.xr.enabled;
    renderer.xr.enabled = false;
    this.screen.visible = false;
    renderer.setRenderTarget(this.rt);
    renderer.render(scene, this.cam);
    renderer.setRenderTarget(null);
    this.screen.visible = true;
    renderer.xr.enabled = xr;
  }
}

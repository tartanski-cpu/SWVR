import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Keyboard } from '../core/keyboard';

/**
 * Development-only first-person camera for desktop browsers.
 * Click the canvas to capture the mouse (pointer lock), Esc to release.
 *
 * Walks with collision like the VR player (default), or free-flies for debugging (F).
 * It only drives the camera's *local* pose inside the player rig, so it follows the
 * same moving-frame rules as the headset.
 */
export class DesktopController {
  private yaw = 0;
  // Start looking slightly down at the scene (also sidesteps a SwiftShader clipping
  // quirk with an exactly level camera in headless test browsers).
  private pitch = -0.12;
  private readonly position = new THREE.Vector3(0, CONFIG.desktop.eyeHeight, 0);
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly move = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
    private readonly keyboard: Keyboard,
  ) {
    // A click captures the mouse; a tap on a touchscreen doesn't (there a finger drag turns
    // the view instead, ui/touchControls.ts: captured, the drag went to the controls).
    let touched = false;
    canvas.addEventListener('pointerdown', (e) => (touched = e.pointerType !== 'mouse'));
    canvas.addEventListener('click', () => {
      if (touched || this.noPointerLock) return;
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas || this.lookFrozen) return;
      const s = CONFIG.desktop.lookSensitivity * this.lookScale;
      this.yaw -= e.movementX * s;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * s, -1.5, 1.5);
    });
  }

  /** The mouse look (rad): yaw about up, pitch up/down. The recording camera flies by it. */
  get lookYaw(): number {
    return this.yaw;
  }
  get lookPitch(): number {
    return this.pitch;
  }
  setLook(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = THREE.MathUtils.clamp(pitch, -1.5, 1.5);
  }

  /** Mouse-look speed factor (slower through the binoculars). */
  lookScale = 1;
  /** Never capture the mouse (the touch controls are showing). */
  noPointerLock = false;

  /** Turn the view by a drag of (dx, dy) screen pixels (a finger on a touchscreen: ui/touchControls.ts). */
  look(dx: number, dy: number, sensitivity: number): void {
    if (this.lookFrozen) return;
    const s = sensitivity * this.lookScale;
    this.yaw -= dx * s;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * s, -1.5, 1.5);
  }

  /** Back to standing at the rig origin, looking forward (used when boarding/leaving). */

  resetPose(): void {
    this.position.set(0, CONFIG.desktop.eyeHeight, 0);
    this.yaw = 0;
    this.pitch = -0.12;
  }

  /**
   * 'walk' (default): the camera stays at eye height over the rig origin and WASD produces
   * a walking displacement that the Locomotion applies with collision, exactly like a VR
   * player's body. 'fly': free debug camera inside the rig (Space/C for up/down).
   */
  mode: 'walk' | 'fly' = 'walk';
  /** True while the mouse is dragging a bridge control: mouse moves the control, not the view. */
  lookFrozen = false;
  /** A game controller's left stick (x right, z back; -1..1) and its run button, added to the keys. */
  readonly padMove = { x: 0, z: 0, run: false };
  /** Walking displacement this frame in rig axes (x right, z back; y = climb), set by update(). */
  readonly walk = { x: 0, y: 0, z: 0 };

  toggleFly(): void {
    this.mode = this.mode === 'walk' ? 'fly' : 'walk';
    if (this.mode === 'walk') this.position.set(0, CONFIG.desktop.eyeHeight, 0);
  }

  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  update(dt: number): void {
    const k = this.keyboard;
    this.move.set(
      (k.action('right') ? 1 : 0) - (k.action('left') ? 1 : 0),
      (k.action('up') ? 1 : 0) - (k.action('down') ? 1 : 0),
      (k.action('back') ? 1 : 0) - (k.action('forward') ? 1 : 0),
    );
    this.walk.x = 0;
    this.walk.y = 0;
    this.walk.z = 0;
    if (this.mode === 'walk') {
      // Space / C climb when you're at a ladder (ignored elsewhere).
      this.walk.y = this.move.y * CONFIG.desktop.climbSpeed * dt;
      this.move.y = 0;
      // The stick adds to the keys, as far as it's pushed (a little push: a slow walk).
      this.move.x += this.padMove.x;
      this.move.z += this.padMove.z;
      if (this.move.lengthSq() > 0) {
        const speed = CONFIG.desktop.walkSpeed * (k.action('fast') || this.padMove.run ? CONFIG.locomotion.runMultiplier : 1);
        if (this.move.lengthSq() > 1) this.move.normalize();
        this.move.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw).multiplyScalar(speed * dt);
        this.walk.x = this.move.x;
        this.walk.z = this.move.z;
      }
      this.position.set(0, CONFIG.desktop.eyeHeight, 0);
    } else if (this.move.lengthSq() > 0) {
      const speed = CONFIG.desktop.moveSpeed * (k.action('fast') ? CONFIG.desktop.fastMultiplier : 1);
      // Horizontal movement follows yaw only; vertical is world-up.
      const vertical = this.move.y;
      this.move.y = 0;
      this.move.normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw);
      this.move.y = vertical;
      this.position.addScaledVector(this.move, speed * dt);
    }

    this.euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);
    this.camera.position.copy(this.position);
  }
}

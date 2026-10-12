import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Keyboard } from '../core/keyboard';

/**
 * Development-only first-person camera for desktop browsers.
 * Click the canvas to capture the mouse (pointer lock), Esc to release.
 *
 * Milestones 1-4: free-fly. From milestone 5 it walks on the vessel like the VR player.
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
    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      const s = CONFIG.desktop.lookSensitivity;
      this.yaw -= e.movementX * s;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * s, -1.5, 1.5);
    });
  }

  /** Back to standing at the rig origin, looking forward (used when boarding/leaving). */
  resetPose(): void {
    this.position.set(0, CONFIG.desktop.eyeHeight, 0);
    this.yaw = 0;
    this.pitch = -0.12;
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
    if (this.move.lengthSq() > 0) {
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

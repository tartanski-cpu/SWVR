import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import type { Handedness } from './xrInput';

/**
 * Tracked controller grips with visible controller models (the real Touch models, fetched
 * by Three's XRControllerModelFactory from the WebXR input-profiles CDN). Grips are
 * children of the player rig, so they ride the boat with the player.
 */
export class XRControllers {
  readonly grips: Record<Handedness, THREE.Group | null> = { left: null, right: null };
  /** Target-ray spaces (pointing direction, origin at the controller tip). */
  readonly rays: Record<Handedness, THREE.Group | null> = { left: null, right: null };

  constructor(renderer: THREE.WebGLRenderer, parent: THREE.Object3D) {
    const factory = new XRControllerModelFactory();
    for (let i = 0; i < 2; i++) {
      const grip = renderer.xr.getControllerGrip(i);
      grip.add(factory.createControllerModel(grip));
      parent.add(grip);
      grip.addEventListener('connected', (e) => {
        const hand = (e as unknown as { data: XRInputSource }).data.handedness;
        if (hand === 'left' || hand === 'right') this.grips[hand] = grip;
      });
      grip.addEventListener('disconnected', () => {
        for (const h of ['left', 'right'] as const) if (this.grips[h] === grip) this.grips[h] = null;
      });

      const ray = renderer.xr.getController(i);
      parent.add(ray);
      ray.addEventListener('connected', (e) => {
        const hand = (e as unknown as { data: XRInputSource }).data.handedness;
        if (hand === 'left' || hand === 'right') this.rays[hand] = ray;
      });
      ray.addEventListener('disconnected', () => {
        for (const h of ['left', 'right'] as const) if (this.rays[h] === ray) this.rays[h] = null;
      });
    }
  }

  /** World pointer ray of a hand (origin at the controller tip), or false if not tracked. */
  worldRay(hand: Handedness, out: THREE.Ray): boolean {
    const r = this.rays[hand];
    if (!r || !r.visible) return false;
    r.getWorldPosition(out.origin);
    out.direction.set(0, 0, -1).transformDirection(r.matrixWorld);
    return true;
  }

  /** World orientation of a hand's grip (for a twist grip), or null if not tracked. */
  worldQuaternion(hand: Handedness, out: THREE.Quaternion): THREE.Quaternion | null {
    const g = this.grips[hand];
    if (!g || !g.visible) return null;
    return g.getWorldQuaternion(out);
  }

  /** World position of a hand's grip, or null if not tracked. */
  worldPosition(hand: Handedness, out: THREE.Vector3): THREE.Vector3 | null {
    const g = this.grips[hand];
    if (!g || !g.visible) return null;
    return g.getWorldPosition(out);
  }
}

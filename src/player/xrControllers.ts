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
    }
  }

  /** World position of a hand's grip, or null if not tracked. */
  worldPosition(hand: Handedness, out: THREE.Vector3): THREE.Vector3 | null {
    const g = this.grips[hand];
    if (!g || !g.visible) return null;
    return g.getWorldPosition(out);
  }
}

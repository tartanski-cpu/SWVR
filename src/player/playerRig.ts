import * as THREE from 'three';
import type { EntityId } from '../core/ids';

/**
 * The scene-graph representation of one player.
 *
 *   parent (world now; the vessel's interpolated root from milestone 5)
 *     └─ rig            <- moved by locomotion; origin = floor under the play area centre
 *          ├─ camera    <- headset pose (WebXR) or desktop eye pose
 *          ├─ controller grips (milestone 5)
 *          └─ attached UI (debug panel)
 *
 * Three.js composes the XR head pose with the camera's parent transform, so whatever
 * the rig is parented to, the player rides with it exactly - no per-frame correction.
 */
export class PlayerRig {
  readonly root = new THREE.Group();

  constructor(
    readonly playerId: EntityId,
    readonly camera: THREE.PerspectiveCamera,
  ) {
    this.root.name = `rig:${playerId}`;
    this.root.add(camera);
  }
}

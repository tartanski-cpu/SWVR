import * as THREE from 'three';
import type { EntityId } from '../core/ids';

/**
 * The scene-graph representation of one player.
 *
 *   parent (the vessel's interpolated root when aboard, else the scene)
 *     └─ carrier        <- at the player's feet (PlayerState.position, parent frame);
 *          │               rotated only by the horizon-steadying comfort correction
 *          └─ root      <- player's yaw (PlayerState.yaw); WebXR's floor origin
 *               ├─ camera       <- headset pose (WebXR) or desktop eye pose
 *               ├─ controller grips + models
 *               └─ attached UI
 *
 * Three.js composes the XR head pose with the camera's parent transform, so whatever the
 * carrier is parented to, the player rides with it exactly - the deck can't slide away
 * under your feet because nothing is simulated twice.
 */
export class PlayerRig {
  readonly carrier = new THREE.Group();
  readonly root = new THREE.Group();

  constructor(
    readonly playerId: EntityId,
    readonly camera: THREE.PerspectiveCamera,
  ) {
    this.carrier.name = `rig:${playerId}`;
    this.root.name = `rigYaw:${playerId}`;
    this.carrier.add(this.root);
    this.root.add(camera);
  }
}

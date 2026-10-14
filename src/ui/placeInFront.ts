import * as THREE from 'three';

const head = new THREE.Vector3();
const fwd = new THREE.Vector3();
const pos = new THREE.Vector3();

/**
 * Put `obj` into `frame` (the vessel the player is aboard, or the scene) `distance` metres
 * in front of the camera, `drop` metres below eye level, turned to face the camera.
 * Parenting to the frame keeps it fixed relative to the deck as the boat moves.
 */
export function placeInFront(obj: THREE.Object3D, frame: THREE.Object3D, camera: THREE.Camera, distance: number, drop: number): void {
  camera.getWorldPosition(head);
  camera.getWorldDirection(fwd);
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
  fwd.normalize();
  pos.copy(head).addScaledVector(fwd, distance);
  pos.y -= drop;
  frame.add(obj);
  frame.updateWorldMatrix(true, false);
  // worldToLocal works in place: convert a copy, so `pos` stays in world space for lookAt.
  obj.position.copy(frame.worldToLocal(pos.clone()));
  obj.rotation.set(0, 0, 0);
  obj.updateWorldMatrix(true, false);
  // Face the camera horizontally (no tilt), so text stays upright on a rolling deck.
  obj.lookAt(head.x, pos.y, head.z);
}

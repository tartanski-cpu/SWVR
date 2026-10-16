/**
 * Debug count of a boat's separately drawn parts (modular boats, Part C). Every visible
 * mesh, line, point cloud or sprite on the boat costs at least one draw call (two in VR:
 * one per eye), so this is the number the modular rebuild must not let creep up. The
 * overlay shows it per boat, with how many of those parts are inside the wheelhouse.
 *
 * Counts what is drawn now: the wheelhouse's small parts are hidden from outside it
 * (app/interiorDetail.ts), so the number depends on where you stand.
 */
import * as THREE from 'three';

const box = new THREE.Box3();
const sphere = new THREE.Sphere();
const inv = new THREE.Matrix4();

function drawn(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    if (!p.visible) return false;
    if (p === root) return true;
  }
  return true;
}

const renderable = (o: THREE.Object3D) => (o as THREE.Mesh).isMesh || (o as THREE.Line).isLine || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite;

/**
 * @param root    the boat's root (its frame is vessel axes)
 * @param inside  is a point (vessel axes) inside the wheelhouse? (null: don't split)
 */
export function countBoatParts(root: THREE.Object3D, inside: ((p: THREE.Vector3) => boolean) | null): { drawn: number; inside: number } {
  root.updateMatrixWorld(true);
  inv.copy(root.matrixWorld).invert();
  let n = 0;
  let inHouse = 0;
  root.traverse((o) => {
    if (!renderable(o) || !drawn(o, root)) return;
    n++;
    if (!inside) return;
    box.setFromObject(o);
    if (box.isEmpty()) return;
    box.applyMatrix4(inv).getBoundingSphere(sphere);
    if (inside(sphere.center)) inHouse++;
  });
  return { drawn: n, inside: inHouse };
}

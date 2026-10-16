/**
 * Mechanism library (modular boats, 2.8): bars, wires and ropes between two points. Static
 * bars become merged parts; moving ones are instances of a unit cylinder or box, stretched
 * and turned from one point to the other each frame.
 */
import * as THREE from 'three';
import { part } from '../render/geometryUtils';

const UP = new THREE.Vector3(0, 1, 0);

/** A round bar's geometry from `a` to `b`, radius `r` (`sides` round; `open`: no end caps). */
export function barGeometry(a: THREE.Vector3, b: THREE.Vector3, r: number, sides = 10, open = false): THREE.BufferGeometry {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), sides, 1, open).translate(0, d.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  return g.translate(a.x, a.y, a.z);
}

/** A painted round bar from `a` to `b` (an A-frame's legs and beam, a lamp's arm), for merging. */
export function bar(a: THREE.Vector3, b: THREE.Vector3, r: number, color: number, sides = 10): THREE.BufferGeometry {
  return part(barGeometry(a, b, r, sides), color);
}

const q = new THREE.Quaternion();
const s = new THREE.Vector3();
const mid = new THREE.Vector3();

/**
 * Instance `i` of `mesh` (a unit box or cylinder along y, centred on its middle) stretched
 * from `a` to `b`, `w` by `depth` thick. Turned the shortest way from up, so links in a
 * vertical plane (a crane's arms) come out unrolled.
 */
export function stretchBetween(mesh: THREE.InstancedMesh, i: number, a: THREE.Vector3, b: THREE.Vector3, w: number, depth: number, m = new THREE.Matrix4()): void {
  const dir = s.subVectors(b, a);
  const len = Math.max(1e-3, dir.length());
  q.setFromUnitVectors(UP, dir.multiplyScalar(1 / len));
  mesh.setMatrixAt(i, m.compose(mid.addVectors(a, b).multiplyScalar(0.5), q, s.set(w, len, depth)));
}

/**
 * Instance `i` of `mesh` (a unit-length piece along y from its base, its thickness in its
 * geometry) laid from `a` to `b`: one segment of a sagging rope.
 */
export function layFrom(mesh: THREE.InstancedMesh, i: number, a: THREE.Vector3, b: THREE.Vector3, m = new THREE.Matrix4()): void {
  const len = a.distanceTo(b);
  q.setFromUnitVectors(UP, s.copy(b).sub(a).divideScalar(Math.max(1e-6, len)));
  mesh.setMatrixAt(i, m.compose(a, q, s.set(1, len, 1)));
}

/**
 * How far a line of length `length` slung between points `span` apart hangs down at its
 * middle (a parabola close to the catenary for a shallow sag; 0 when it's taut).
 */
export function sagOf(span: number, length: number): number {
  return span < length ? Math.sqrt((3 * span * (length - span)) / 8) : 0;
}

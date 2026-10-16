/**
 * Mechanism library (modular boats, 2.8): a winch drum with wire wound on it. The drawing
 * and the point the wire leaves it come from here, so the towline (tow/tow.ts) leads off
 * exactly where the drum is drawn.
 */
import * as THREE from 'three';
import { part } from '../render/geometryUtils';

/** The drum's axle height above the deck: on cheeks `bed` m high, plus its radius. */
export function drumAxleY(deckY: number, radius: number, bed = 0.18): number {
  return deckY + bed + radius;
}

/** Where the wire leaves a drum (axle at [y, z]), over its top on the aft side: [x, y, z]. */
export function drumLead(axleY: number, z: number, radius: number): [number, number, number] {
  return [0, axleY + radius * 0.7, z + radius * 0.7];
}

/**
 * The drum's parts, centred on its axle (axle along x): the wire wound on it, a red flange
 * each end, and a pale stripe along it so you see it turn.
 */
export function drumParts(radius: number, width: number): THREE.BufferGeometry[] {
  const hw = width / 2;
  return [
    part(new THREE.CylinderGeometry(radius, radius, width, 14).rotateZ(Math.PI / 2), 0x2a2a2a),
    ...[-1, 1].map((s) => part(new THREE.CylinderGeometry(radius + 0.08, radius + 0.08, 0.035, 14).rotateZ(Math.PI / 2).translate(s * hw, 0, 0), 0xb8261a)),
    part(new THREE.BoxGeometry(width, 0.03, 0.03).translate(0, radius, 0), 0xd8d8d0),
  ];
}

/** Turn the drum: `turn` +1 heaving in, -1 paying out, 0 still (rad/s at full speed: `rate`). */
export function turnDrum(drum: THREE.Object3D, turn: number, dt: number, rate = 2.5): void {
  if (turn) drum.rotation.x += turn * rate * dt;
}

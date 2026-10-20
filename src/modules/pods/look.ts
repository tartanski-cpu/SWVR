/**
 * How a pod drive looks (owner, Oct 2026; modules/pods). Drawing only: its physics is the
 * module's (index.ts). Our own design: a slim faired strut down from her bottom to a
 * torpedo-shaped nacelle (the gears), two propellers one behind the other at the nacelle's
 * front (turning opposite ways), a small fin under its tail.
 *
 * One pod, in its own axes: the origin on its steering axis where the strut meets her bottom,
 * forward -z, so it swings by turning about y. One mesh, vertex-coloured.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { part } from '../../render/geometryUtils';

export type PodLook = typeof CONFIG.modules.pods.look;

const BODY = 0x23272b; // the strut and nacelle: anthracite antifouling-grey
const STEEL = 0xb9bec3; // the propellers: polished stainless

/** One pod's parts (see above). `strut`: the strut's length here (her bottom to the nacelle's centre); `propD` its propellers' diameter. */
export function podParts(o: PodLook, strut: number, propD: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const y = -strut;
  // The strut: a flattened lozenge (an 8-sided cylinder squeezed thin), down from her bottom.
  const s = new THREE.CylinderGeometry(0.5, 0.5, strut + 0.04, 8).scale(o.strutWidth, 1, o.strutChord).translate(0, y / 2 + 0.02, 0.05);
  parts.push(part(s, BODY));
  // The nacelle along the pod, from just behind the propellers aft, its tail a cone.
  const front = -o.propFwd + 0.08;
  const bodyLen = o.podLength * 0.72;
  parts.push(part(new THREE.CylinderGeometry(o.podRadius, o.podRadius, bodyLen, 14).rotateX(Math.PI / 2).translate(0, y, front + bodyLen / 2), BODY));
  const tail = o.podLength - bodyLen;
  parts.push(part(new THREE.ConeGeometry(o.podRadius, tail, 14).rotateX(Math.PI / 2).translate(0, y, front + bodyLen + tail / 2), BODY));
  // The fin under the tail (it keeps the nacelle steady and guards the propellers aground).
  parts.push(part(new THREE.BoxGeometry(0.03, o.podRadius * 1.6, 0.32).translate(0, y - o.podRadius * 1.3, front + bodyLen - 0.05), BODY));
  // The two propellers at the front, the forward one a little smaller, and the hub's nose cone.
  const hubZ = -o.propFwd;
  parts.push(part(new THREE.CylinderGeometry(o.podRadius * 0.55, o.podRadius * 0.8, 0.2, 12).rotateX(Math.PI / 2).translate(0, y, hubZ), STEEL));
  parts.push(part(new THREE.ConeGeometry(o.podRadius * 0.55, 0.14, 12).rotateX(-Math.PI / 2).translate(0, y, hubZ - 0.17), STEEL));
  for (const [dz, d, blades, twist] of [
    [-0.07, propD * 0.92, 4, -0.6],
    [0.06, propD, 5, 0.6],
  ] as const) {
    for (let i = 0; i < blades; i++) {
      const blade = new THREE.BoxGeometry(0.075, d / 2 - 0.05, 0.012).translate(0, d / 4 + 0.03, 0);
      blade.rotateY(twist).rotateZ((i * 2 * Math.PI) / blades + (dz > 0 ? 0.3 : 0)).translate(0, y, hubZ + dz);
      parts.push(part(blade, STEEL));
    }
  }
  return parts;
}

/** The fairing round the strut's foot on her bottom (fixed: the pod turns inside it), boat axes. */
export function podFairing(o: PodLook, x: number, y: number, z: number): THREE.BufferGeometry {
  return part(new THREE.CylinderGeometry(o.strutChord * 0.62, o.strutChord * 0.7, 0.05, 16).translate(x, y - 0.005, z), BODY);
}

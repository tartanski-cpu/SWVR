import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Intent } from '../core/intents';
import type { VesselState } from './vesselState';

const q = new THREE.Quaternion();
const e = new THREE.Euler();

/**
 * Place a vessel at rest. Heading is a compass bearing (0 = bow north = -Z, 90 = east).
 * Heel is positive to starboard, trim positive bow-down (degrees).
 */
export function placeVessel(
  s: VesselState,
  x: number,
  y: number,
  z: number,
  headingDeg: number,
  heelDeg = 0,
  trimDeg = 0,
): void {
  const D = Math.PI / 180;
  // Vessel axes: roll about z (bow is -z, so +rotation about z lifts port -> heel to stbd
  // is negative), pitch about x (bow-down is negative about +x), yaw about y.
  e.set(-trimDeg * D, -headingDeg * D, -heelDeg * D, 'YXZ');
  q.setFromEuler(e);
  s.position = [x, y, z];
  s.orientation = [q.x, q.y, q.z, q.w];
  s.linearVelocity = [0, 0, 0];
  s.angularVelocity = [0, 0, 0];
}

/** Debug test: drop the vessel from height at the spawn point. */
export function dropVessel(s: VesselState): void {
  const sp = CONFIG.vessels.workboat.spawn;
  placeVessel(s, sp.x, sp.dropHeight, sp.z, sp.headingDeg, 6, -3);
}

/**
 * Vessel intents. Milestone 3 only has debug tests; throttle, rudder, engine and
 * switches are routed through here from milestone 4.
 */
export function applyVesselIntent(s: VesselState, intent: Intent): void {
  switch (intent.control) {
    case 'debugDrop':
      dropVessel(s);
      break;
    case 'debugHeel': {
      // Heel to `value` degrees at the current position and heading, then release.
      q.fromArray(s.orientation);
      e.setFromQuaternion(q, 'YXZ');
      placeVessel(s, s.position[0], s.position[1], s.position[2], -e.y / (Math.PI / 180), intent.value);
      break;
    }
  }
}

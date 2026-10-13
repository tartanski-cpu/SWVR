import * as THREE from 'three';
import { CONFIG } from '../config';
import type { SimDebug } from '../core/simulation';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';

const q = new THREE.Quaternion();
const v = new THREE.Vector3();
const DEG = 180 / Math.PI;

/** Bridge and motion readouts for the debug overlay (four lines). */
export function vesselReadout(s: VesselState | undefined, simDebug: SimDebug): string {
  if (!s) return '';
  q.fromArray(s.orientation);
  const fwd = v.set(0, 0, -1).applyQuaternion(q);
  const heading = (Math.atan2(fwd.x, -fwd.z) * DEG + 360) % 360;
  const trim = -Math.asin(fwd.y) * DEG;
  const heel = -Math.asin(v.set(1, 0, 0).applyQuaternion(q).y) * DEG;
  const kn = Math.hypot(s.linearVelocity[0], s.linearVelocity[2]) * 1.943844;
  const gear = s.engine.gear === 1 ? 'AHEAD' : s.engine.gear === -1 ? 'ASTERN' : 'NEUTRAL';
  const engine = s.engine.phase === 'off' ? 'ENGINE OFF' : s.engine.phase === 'cranking' ? 'CRANKING' : `${s.engine.rpm.toFixed(0)} rpm`;
  const rudder = s.rudder * DEG;
  const rudderText = Math.abs(rudder) < 0.5 ? 'midships' : `${Math.abs(rudder).toFixed(0)}° ${rudder > 0 ? 'stbd' : 'port'}`;
  const vol = simDebug.get(s.id)?.submergedVolume ?? 0;
  const disp = (vol * CONFIG.ocean.density) / 1000;
  return [
    `SOG ${kn.toFixed(1)} kn  HDG ${heading.toFixed(0).padStart(3, '0')}°  ${engine}`,
    `lever ${(s.controls.lever * 100).toFixed(0)} %  ${gear}  rudder ${rudderText}`,
    `boat heel ${heel.toFixed(1)}°  trim ${trim.toFixed(1)}°  heave ${s.position[1].toFixed(2)} m`,
    `boat immersed ${disp.toFixed(1)} t of ${(VESSEL_DEFS[s.defId].mass / 1000).toFixed(1)} t`,
  ].join('\n');
}

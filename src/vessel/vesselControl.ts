import * as THREE from 'three';
import type { Intent } from '../core/intents';
import { clamp } from '../core/math';
import { toggleEngine } from './physics/propulsion';
import { toggleDock } from './physics/mooring';
import { VESSEL_DEFS, type VesselDef } from './vesselDef';
import { fuelBerthAt } from '../world/geography';
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
  const sp = VESSEL_DEFS[s.defId].spawn;
  placeVessel(s, sp.x, sp.dropHeight, sp.z, sp.headingDeg, 6, -3);
}

/**
 * Vessel intents: the only way players (local or, later, remote) operate a vessel.
 * Values are absolute (lever at 0.6, not "+0.1") so a repeated or late intent is harmless.
 */
export function applyVesselIntent(s: VesselState, intent: Intent): void {
  switch (intent.control) {
    case 'lever':
      s.controls.lever = clamp(intent.value, -1, 1);
      break;
    case 'helm':
      s.controls.helm = clamp(intent.value, -1, 1);
      break;
    case 'navLights':
      s.controls.navLights = intent.value > 0.5 ? 1 : 0;
      break;
    case 'horn':
      s.controls.horn = intent.value > 0.5 ? 1 : 0;
      break;
    case 'engineStartStop':
      toggleEngine(s, VESSEL_DEFS[s.defId]);
      break;
    case 'debugFuel': {
      // Set the tank to `value` litres (debug/test, e.g. to try running dry).
      const tank = VESSEL_DEFS[s.defId].engine.fuel.tankL;
      s.engine.fuelL = clamp(intent.value, 0, tank);
      break;
    }
    case 'debugCoolingFault':
      // Raw-water pump impeller failure on (1) / repaired (0).
      s.engine.coolingFault = intent.value > 0.5;
      break;
    case 'anchor':
      s.controls.anchor = intent.value > 0.5 ? 1 : 0;
      break;
    case 'cabinLight':
      s.controls.cabinLight = intent.value > 0.5 ? 1 : 0;
      break;
    case 'spotlight':
      s.controls.spotlight = intent.value > 0.5 ? 1 : 0;
      break;
    case 'spotPan': {
      const sp = VESSEL_DEFS[s.defId].spotlight;
      s.controls.spotPan = clamp(intent.value, -sp.panLimitDeg, sp.panLimitDeg);
      break;
    }
    case 'spotTilt': {
      const sp = VESSEL_DEFS[s.defId].spotlight;
      s.controls.spotTilt = clamp(intent.value, sp.tiltMinDeg, sp.tiltMaxDeg);
      break;
    }
    case 'dock':
      // DOCK button: dock in a berth's hot spot, or cast off.
      toggleDock(s);
      break;
    case 'refuel':
      // Start (1) or stop (0) taking fuel; stepRefuelling checks the berth each tick.
      s.refuelling = intent.value > 0.5;
      break;
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

/** Below this speed (m/s) a boat counts as alongside for fuelling. */
const REFUEL_MAX_SPEED = 0.6;

/** Whether a vessel is at a fuel berth and slow enough to take fuel. */
export function canRefuel(s: VesselState): boolean {
  return fuelBerthAt(s.position[0], s.position[2]) !== null && Math.hypot(s.linearVelocity[0], s.linearVelocity[2]) < REFUEL_MAX_SPEED;
}

/** Fuel flows while `refuelling` is on, the boat stays at the berth and the tank isn't full. */
export function stepRefuelling(s: VesselState, def: VesselDef, dt: number, archipelago: boolean): void {
  if (!s.refuelling) return;
  const f = def.engine.fuel;
  if (!archipelago || !canRefuel(s) || s.engine.fuelL >= f.tankL) {
    s.refuelling = false;
    return;
  }
  s.engine.fuelL = Math.min(f.tankL, s.engine.fuelL + f.refuelRateLps * dt);
}

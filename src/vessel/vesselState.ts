import type { EntityId } from '../core/ids';
import type { Quat, Vec3 } from '../core/math';

/** Control positions as set by players (via intents). */
export interface VesselControls {
  /** Combined throttle/gear lever, -1 (full astern) .. 0 (neutral) .. +1 (full ahead). */
  lever: number;
  /** Helm (wheel) position, -1 (hard to port) .. +1 (hard to starboard). */
  helm: number;
  /** Navigation lights switch, 0 off / 1 on. */
  navLights: number;
  /** Horn button, 0 released / 1 held. */
  horn: number;
}

/** Machinery state, advanced by the simulation. */
export interface EngineState {
  phase: 'off' | 'cranking' | 'running';
  /** Seconds spent cranking so far. */
  crank: number;
  /** Engine (crankshaft) speed. */
  rpm: number;
  /** Fuel rack position 0..1 as set by the governor (engine load). */
  rack: number;
  /** Engaged gear: -1 astern, 0 neutral, +1 ahead. */
  gear: -1 | 0 | 1;
  /** Seconds the lever has been asking for a different gear. */
  shift: number;
}

/**
 * Serializable state of one vessel. Everything needed to reproduce its motion lives
 * here; everything static lives in its VesselDef (looked up by `defId`).
 */
export interface VesselState {
  id: EntityId;
  defId: string;
  /** World position of the vessel origin (centreline, amidships, DWL). */
  position: Vec3;
  /** Orientation, vessel -> world. */
  orientation: Quat;
  /** World-frame velocity of the centre of gravity (m/s). */
  linearVelocity: Vec3;
  /** World-frame angular velocity (rad/s). */
  angularVelocity: Vec3;
  controls: VesselControls;
  engine: EngineState;
  /** Actual rudder angle (rad), + = trailing edge to starboard (turns the bow to starboard). */
  rudder: number;
  /** Propeller thrust (N) on the last tick, for displays/audio. */
  thrust: number;
}

export function createVesselState(id: EntityId, defId: string): VesselState {
  return {
    id,
    defId,
    position: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    linearVelocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    controls: { lever: 0, helm: 0, navLights: 0, horn: 0 },
    engine: { phase: 'off', crank: 0, rpm: 0, rack: 0, gear: 0, shift: 0 },
    rudder: 0,
    thrust: 0,
  };
}

import type { EntityId } from '../core/ids';
import type { Quat, Vec3 } from '../core/math';

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
}

export function createVesselState(id: EntityId, defId: string): VesselState {
  return {
    id,
    defId,
    position: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    linearVelocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
  };
}

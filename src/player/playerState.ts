import type { EntityId } from '../core/ids';
import type { Vec3 } from '../core/math';

/**
 * Simulation-side description of a player. The local player is just one entry in
 * `world.players`; remote players will be added the same way later.
 *
 * Positions are expressed in the frame of the vessel the player is aboard
 * (or world frame if `aboardVesselId` is null).
 */
export interface PlayerState {
  id: EntityId;
  name: string;
  aboardVesselId: EntityId | null;
  /** Rig origin (floor point under the play area centre). */
  position: Vec3;
  /** Rig heading about +Y (radians). */
  yaw: number;
}

export function createPlayerState(id: EntityId, name: string): PlayerState {
  return { id, name, aboardVesselId: null, position: [0, 0, 0], yaw: 0 };
}

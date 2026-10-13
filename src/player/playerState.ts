import type { EntityId } from '../core/ids';
import type { Vec3 } from '../core/math';

/**
 * Simulation-side description of a player. The local player is just one entry in
 * `world.players`; remote players are the other entries (multiplayer).
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
  /**
   * Head and hands as other players should see them (multiplayer), in the same frame as
   * `position`: head (x, y, z, qx, qy, qz, qw), hands (x, y, z) or null if not tracked.
   */
  avatar?: { head: [number, number, number, number, number, number, number]; left: Vec3 | null; right: Vec3 | null };
}

export function createPlayerState(id: EntityId, name: string): PlayerState {
  return { id, name, aboardVesselId: null, position: [0, 0, 0], yaw: 0 };
}

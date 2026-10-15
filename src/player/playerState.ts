import type { EntityId } from '../core/ids';
import type { Vec3 } from '../core/math';

/**
 * Simulation-side description of a player. The local player is just one entry in
 * `world.players`; remote players are the other entries (multiplayer).
 *
 * Positions are expressed in the frame of the vessel the player is aboard
 * (or world frame if `aboardVesselId` is null).
 */
/** A chart table tool in a player's hand (shown to the others). */
export interface HeldTool {
  kind: 'pencil' | 'eraser' | 'rule';
  hand: 'left' | 'right';
}

export interface PlayerState {
  id: EntityId;
  name: string;
  aboardVesselId: EntityId | null;
  /** Rig origin (floor point under the play area centre). */
  position: Vec3;
  /** Rig heading about +Y (radians). */
  yaw: number;
  /**
   * What the body is doing (player/body.ts): standing or walking on something, in the air
   * after a jump (world frame, with `velocity`), or swimming (world frame). Absent = walk.
   */
  mode?: 'walk' | 'air' | 'swim';
  /** World velocity while in the air (m/s). */
  velocity?: Vec3;
  /**
   * Head and hands as other players should see them (multiplayer), in the same frame as
   * `position`: head (x, y, z, qx, qy, qz, qw), hands (x, y, z) or null if not tracked.
   */
  avatar?: { head: [number, number, number, number, number, number, number]; left: Vec3 | null; right: Vec3 | null; tool?: HeldTool | null };
}

export function createPlayerState(id: EntityId, name: string): PlayerState {
  return { id, name, aboardVesselId: null, position: [0, 0, 0], yaw: 0 };
}

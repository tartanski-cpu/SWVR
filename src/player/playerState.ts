import type { EntityId } from '../core/ids';
import type { Quat, Vec3 } from '../core/math';

/**
 * Simulation-side description of a player. The local player is just one entry in
 * `world.players`; remote players are the other entries (multiplayer).
 *
 * Positions are expressed in the frame of the vessel the player is aboard
 * (or world frame if `aboardVesselId` is null).
 */
/** A laser pointer's beam: from and to, in the frame the player is aboard (or world). */
export type LaserPose = [number, number, number, number, number, number, boolean];

/** A chart table tool in a player's hand (shown to the others). */
export interface HeldTool {
  kind: 'pencil' | 'eraser';
  hand: 'left' | 'right';
}

/**
 * Hand gear in a player's hand (player/handGear.ts): which, whether it's working (spraying,
 * lit), and its nozzle / lens point and pointing direction, in the frame the player is
 * aboard (or world). The host uses the extinguisher's to put fires out; everyone draws it.
 */
export interface GearPose {
  kind: 'extinguisher' | 'torch' | 'rod' | 'lineGun';
  /** Which of the rack's rods (0, left out, for the first and for the other gear). */
  slot?: number;
  on: boolean;
  p: Vec3;
  d: Vec3;
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
   * `position`: head (x, y, z, qx, qy, qz, qw), hands (x, y, z) or null if not tracked, and
   * each VR hand's orientation (absent for desktop players, and from older versions).
   */
  /**
   * How others see you: a number the host picks when you join (net/avatarOutfits.ts
   * decodes it into an outfit, skin tone and beard). Absent from older hosts: then it's
   * derived from the player id.
   */
  look?: number;
  avatar?: {
    head: [number, number, number, number, number, number, number];
    left: Vec3 | null;
    right: Vec3 | null;
    leftQ?: Quat | null;
    rightQ?: Quat | null;
    /** Each VR hand's gesture [left, right] (player/handGesture.ts HAND_POSES); absent: relaxed. */
    poses?: [number, number];
    /** In the water: overboard (crew-mates are told, and can throw them the life ring). */
    swimming?: boolean;
    /** A recording camera (player/cameraMode.ts): drawn as a camera at `head`, not a figure. */
    camera?: boolean;
    tool?: HeldTool | null;
    laser?: LaserPose | null;
    gear?: GearPose | null;
    /** The handheld VHF (player/radioHandset.ts): which hand holds it (null: on the chest), and transmitting. */
    radio?: RadioPose | null;
  };
  /**
   * The player's network address (net/voice.ts calls it for voice): set by the host when
   * they join (a client's PeerJS id; the host's own is the room's id). Absent solo.
   */
  peerId?: string;
}

/** The handheld VHF as others see it: in which hand (null: clipped on the chest), and pressed to talk. */
export interface RadioPose {
  hand: 'left' | 'right' | null;
  tx: boolean;
}

export function createPlayerState(id: EntityId, name: string): PlayerState {
  return { id, name, aboardVesselId: null, position: [0, 0, 0], yaw: 0 };
}

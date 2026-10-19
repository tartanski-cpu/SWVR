/**
 * Multiplayer messages (peer-to-peer, one player hosts; see docs/MULTIPLAYER.md).
 *
 *   client -> host   hello     { name, build }              on connect (build: their page's version)
 *   host -> client   welcome   { playerId, world }          your id + the whole world
 *   client -> host   intents   { intents }                  vessel / environment / cargo intents
 *   client -> host   pose      { pose }                     ~20 Hz: where my body, head, hands are
 *   host -> client   snapshot  { world }                    ~20 Hz: the authoritative world
 *   both ways        chart     { op }                       pencil marks on the paper chart
 *
 * Chart marks are kept out of the world (too big to send 20 times a second): each peer
 * keeps its own copy and applies the same small ops (chart/marks.ts). A client applies its
 * own at once and sends them; the host applies them and relays them to everyone else; the
 * welcome carries the whole set.
 *
 * The host runs the simulation exactly as in single player. Clients don't simulate: they
 * render the host's snapshots ~100 ms in the past, interpolated, and send intents. Each
 * player's own body (walking, climbing, boarding) is client-authoritative and travels in
 * `pose` - it is cosmetic for everyone else, so trusting it is fine for co-op.
 * All payloads are plain JSON (WorldState is JSON by design).
 */
import type { EntityId } from '../core/ids';
import type { Intent } from '../core/intents';
import type { WorldState } from '../core/world';
import type { Quat, Vec3 } from '../core/math';
import type { ChartMarks, ChartOp } from '../chart/marks';
import type { GearPose, HeldTool, LaserPose, RadioPose } from '../player/playerState';

/** A player's body as others should see it, in the frame of what they're aboard. */
export interface PlayerPose {
  /** Shown over the head; can change mid-game from the menu. */
  name: string;
  aboardVesselId: EntityId | null;
  position: Vec3;
  yaw: number;
  /** Head position + orientation (x, y, z, qx, qy, qz, qw), and hands (absent if not tracked). */
  head: [number, number, number, number, number, number, number];
  left: Vec3 | null;
  right: Vec3 | null;
  /** VR hands' orientation (x, y, z, w), same frame; absent for desktop players. */
  leftQ?: Quat | null;
  rightQ?: Quat | null;
  /** VR hands' gestures [left, right] (player/handGesture.ts HAND_POSES); absent: relaxed. */
  poses?: [number, number];
  /** In the water (a crew-mate sees them overboard). */
  swimming?: boolean;
  /** A recording camera, not a figure (player/cameraMode.ts). */
  camera?: boolean;
  /** A chart table tool in one hand (pencil, eraser, rule), if any. */
  tool?: HeldTool | null;
  /** Laser pointer: beam from, to (frame coordinates) and whether it hit something. */
  laser?: LaserPose | null;
  /** Hand gear (extinguisher, torch) in hand, if any. */
  gear?: GearPose | null;
  /** The handheld VHF: in which hand (null: on the chest), and transmitting. */
  radio?: RadioPose | null;
}

export type ClientMessage = { t: 'hello'; name: string; build?: string } | { t: 'intents'; intents: Intent[] } | { t: 'pose'; pose: PlayerPose } | { t: 'chart'; op: ChartOp };

export type HostMessage = { t: 'welcome'; playerId: EntityId; world: WorldState; chart?: ChartMarks } | { t: 'snapshot'; world: WorldState } | { t: 'chart'; op: ChartOp };

/** Snapshot / pose send rate (Hz). */
export const NET_RATE = 20;
/** Clients render this far behind the newest snapshot, to always have two to blend (s). */
export const INTERP_DELAY = 0.12;

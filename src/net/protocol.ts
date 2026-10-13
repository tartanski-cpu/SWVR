/**
 * Multiplayer messages (peer-to-peer, one player hosts; see docs/MULTIPLAYER.md).
 *
 *   client -> host   hello     { name }                     on connect
 *   host -> client   welcome   { playerId, world }          your id + the whole world
 *   client -> host   intents   { intents }                  vessel / environment / cargo intents
 *   client -> host   pose      { pose }                     ~20 Hz: where my body, head, hands are
 *   host -> client   snapshot  { world }                    ~20 Hz: the authoritative world
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
import type { Vec3 } from '../core/math';

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
}

export type ClientMessage = { t: 'hello'; name: string } | { t: 'intents'; intents: Intent[] } | { t: 'pose'; pose: PlayerPose };

export type HostMessage = { t: 'welcome'; playerId: EntityId; world: WorldState } | { t: 'snapshot'; world: WorldState };

/** Snapshot / pose send rate (Hz). */
export const NET_RATE = 20;
/** Clients render this far behind the newest snapshot, to always have two to blend (s). */
export const INTERP_DELAY = 0.12;

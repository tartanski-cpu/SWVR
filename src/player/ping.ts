/**
 * Pings: "look here" markers a player drops where they point (VR: right stick click with
 * the controller's ray; desktop: right mouse button at the reticle). Shared simulation
 * state, so every crew-mate sees them: one per player, replaced by their next, gone after
 * CONFIG.ping.life seconds. A ping on a vessel is stored in its frame and rides with it.
 */
import { CONFIG } from '../config';
import type { EntityId } from '../core/ids';
import type { Intent } from '../core/intents';
import type { Vec3 } from '../core/math';
import type { WorldState } from '../core/world';

export interface Ping {
  /** Vessel the point is on (position in its axes), or null for the world frame. */
  vessel: EntityId | null;
  pos: Vec3;
  /** World time it was placed (s). */
  t: number;
}

/** 'ping' intent: args [x, y, z], ref = vessel id (or absent for the world frame). */
export function applyPing(world: WorldState, intent: Intent): void {
  const [x, y, z] = intent.args ?? [];
  if (![x, y, z].every((v) => typeof v === 'number' && Number.isFinite(v))) return;
  const vessel = intent.ref && world.vessels[intent.ref] ? intent.ref : null;
  world.pings ??= {};
  world.pings[intent.playerId] = { vessel, pos: [x, y, z], t: world.time };
}

/** Drop pings that have run their course. */
export function expirePings(world: WorldState): void {
  if (!world.pings) return;
  for (const [id, p] of Object.entries(world.pings)) if (world.time - p.t > CONFIG.ping.life) delete world.pings[id];
}

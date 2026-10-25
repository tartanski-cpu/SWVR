/**
 * Who is showing a browser tab on which TV (owner, Oct 2026: "streaming of another browser tab
 * into the TV screen. So only for desktop users, but the screen should be visible for all
 * users"). Part of the world, so every crew-mate knows whose picture to put on each TV: the
 * picture itself never goes through the simulation, it travels player to player
 * (modules/furniture/tvCast.ts).
 *
 * A TV is named `<vesselId>/<its place's id>` (furniture.tv, furniture.tv2). One player at a
 * time on each: whoever starts showing a tab on it takes it over; only they stop it (or their
 * leaving the game does).
 */
import type { Intent } from '../../core/intents';
import type { WorldState } from '../../core/world';

export interface TvState {
  /** Each TV showing a tab: who is showing it (their player id). */
  casts: Record<string, string>;
}

/** A TV's name in the world: her id and its place's. */
export const tvKey = (vesselId: string, socketId: string): string => `${vesselId}/${socketId}`;

/** 'tvCast': value 1 starts showing a tab on the TV (targetId her, ref its place), 0 stops it. */
export const isTvIntent = (control: string): boolean => control === 'tvCast';

export function applyTvIntent(world: WorldState, intent: Intent): void {
  if (!intent.ref || !world.vessels[intent.targetId]) return;
  const tv = (world.tv ??= { casts: {} });
  const key = tvKey(intent.targetId, intent.ref);
  if (intent.value > 0) tv.casts[key] = intent.playerId;
  else if (tv.casts[key] === intent.playerId) delete tv.casts[key];
}

/** Each tick: a TV whose player has gone (or whose boat has) goes dark. */
export function stepTv(world: WorldState): void {
  const casts = world.tv?.casts;
  if (!casts) return;
  for (const [key, who] of Object.entries(casts)) {
    if (!world.players[who] || !world.vessels[key.slice(0, key.indexOf('/'))]) delete casts[key];
  }
}

/**
 * The player's health (owner, Oct 2026: a berth "should have the function of healing the
 * player"; what hurts: cold water, a propeller, falls, and fire and smoke). One number, 1
 * well to 0 blacked out. Each player's own game keeps theirs (it runs their body: walking,
 * swimming, falling; it already finds the propeller strike), as it keeps their position; only
 * whether they're lying in a berth goes to the host, for sleep. Tunable rates: CONFIG.health.
 *
 * Plain numbers, no drawing (the app shows it and fades the view; app/App.ts).
 */
import { CONFIG } from '../config';
import { windVector } from '../environment/weather';
import type { WorldState } from '../core/world';

/** What's happening to them this moment. */
export interface Exposure {
  /** In the water: the cold. */
  swimming: boolean;
  /** In the flames, 0..1 (the fire's blaze where they stand). */
  fire: number;
  /** In its smoke, 0..1. */
  smoke: number;
  /** Lying in a berth. */
  resting: boolean;
}

/**
 * Their health after `dt` s: the cold, the flames and the smoke take it; lying in a berth,
 * out of harm, gives it back (a berth heals only while nothing's hurting).
 */
export function stepHealth(health: number, e: Exposure, dt: number): number {
  const c = CONFIG.health;
  const hurt = (e.swimming ? 1 / (c.coldMinutes * 60) : 0) + e.fire * c.firePerS + e.smoke * c.smokePerS;
  const heal = e.resting && hurt === 0 ? 1 / c.restFullS : 0;
  return Math.min(1, Math.max(0, health + (heal - hurt) * dt));
}

/** A fall's harm from the speed they hit at (m/s, down): the height that speed falls from, past the safe height. */
export function fallHarm(impactSpeed: number): number {
  const c = CONFIG.health;
  const h = (impactSpeed * impactSpeed) / (2 * CONFIG.body.gravity);
  return Math.max(0, h - c.safeFall) * c.fallPerM;
}

/**
 * How much of a fire's flames and smoke reach a point (world x, y, z): in the flames inside
 * its hitRadius (CONFIG.fire) and up to its flame height, as hard as it's burning; in the smoke
 * downwind of it, in a plume that widens and thins with distance (or, in a calm, rising all
 * round it out to twice its radius).
 */
export function fireExposure(world: WorldState, at: readonly number[]): { fire: number; smoke: number } {
  const job = world.fire?.job;
  if (!job || job.phase === 'out' || job.intensity <= 0) return { fire: 0, smoke: 0 };
  const c = CONFIG.health;
  const r = CONFIG.fire.hitRadius[job.kind];
  const top = job.y + CONFIG.fire.flameHeight[job.kind];
  const dx = at[0] - job.x;
  const dz = at[2] - job.z;
  const d = Math.hypot(dx, dz);
  const level = at[1] > job.y - 1 && at[1] < top + 2;
  const fire = level && d < r ? job.intensity : 0;
  const w = windVector(world.environment, { x: 0, z: 0 }, { x: job.x, z: job.z });
  const speed = Math.hypot(w.x, w.z);
  let smoke = 0;
  if (speed < c.calmWind) smoke = d < 2 * r && at[1] > job.y ? 1 - d / (2 * r) : 0;
  else {
    // Along the wind from the fire, and across it.
    const along = (dx * w.x + dz * w.z) / speed;
    const across = Math.abs(dx * w.z - dz * w.x) / speed;
    if (along > 0 && along < c.smokeReach && across < r + along * c.smokeSpread) smoke = 1 - along / c.smokeReach;
  }
  return { fire, smoke: fire ? 0 : smoke * job.intensity };
}

/** Night for sleeping (game hours): from `nightFrom` until `wakeHour`. */
export function isNight(timeOfDay: number): boolean {
  const c = CONFIG.health;
  return timeOfDay >= c.nightFrom || timeOfDay < c.wakeHour;
}

/**
 * Lying in a berth, should they get up now: lain down hurt, once well again by day (at night
 * they sleep on); else (asleep to pass the time) when the clock comes round to `wakeHour`,
 * from `before` (the time of day a moment ago) to `now`. A step gets them up any time.
 */
export function wakeNow(health: number, layDownHurt: boolean, before: number, now: number): boolean {
  if (layDownHurt && health >= 1 && !isNight(now)) return true;
  const w = CONFIG.health.wakeHour;
  // The clock passed the wake hour (allowing for midnight in between).
  const since = (now - before + 24) % 24;
  return since < 12 && (w - before + 24) % 24 <= since && since > 0;
}

/**
 * Sleep (host): with everyone in the game lying in a berth, the clock runs on fast (game
 * hours this step, added to the time of day); else nothing.
 */
export function sleepHours(world: WorldState, dt: number): number {
  const players = Object.values(world.players);
  return players.length && players.every((p) => p.avatar?.resting) ? CONFIG.health.sleepHoursPerS * dt : 0;
}

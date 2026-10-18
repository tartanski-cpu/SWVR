/**
 * How far off a thing can be seen (regions, milestone 2). Not horizon maths: a cull
 * distance from the thing's height on the clearest day (CONFIG.regions.sight: the owner's
 * rule of thumb, a 100 m hill from ~40 km, a 10 m light from ~12 km, the sea itself from
 * ~5 km), cut further by the day's visibility. Pure, so the drawing and the tests agree.
 */
import { CONFIG } from '../config';

/** The clearest day's sight distance (m) for a thing `height` m above the sea. */
export function sightDistance(height: number): number {
  const s = CONFIG.regions.sight;
  return s.base + s.perSqrtHeight * Math.sqrt(Math.max(0, height));
}

/**
 * How far off it is seen today (m): the sight distance, or the visibility (times `factor`:
 * a light carries a little further through haze than land), whichever is less.
 */
export function seenRange(height: number, visibility: number, factor = 1): number {
  return Math.min(sightDistance(height), visibility * factor);
}

/**
 * Where a spot at sea is, in words, as the coastguard would say it (the coast extras plan,
 * C4): "off Toward Point", "in Oban Bay". From a coast map's place names (PlaceDef, the map
 * data): the nearest within `reach` m, a more prominent name (lower rank) counting as nearer
 * (each rank down adds `rankWeight` of the distance). In a bay, a sound or a strait within
 * `inside` m of its name: "in"; anything else, "off". None near (or a hand-built region, with
 * no names): null, and the call says only the bearing or the position as before.
 */
import { CONFIG } from '../config';
import { PLACES } from './archipelago';
import type { PlaceDef } from './defs';

const WATERS = new Set(['bay', 'strait', 'sea']);

export function placePhrase(x: number, z: number, places: readonly PlaceDef[] = PLACES): string | null {
  const c = CONFIG.places;
  let best: PlaceDef | null = null;
  let bestScore = Infinity;
  let bestD = 0;
  for (const p of places) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d > c.reach) continue;
    const score = d * (1 + c.rankWeight * (p.rank - 1));
    if (score < bestScore) [best, bestScore, bestD] = [p, score, d];
  }
  if (!best) return null;
  const name = best.name.replace(/^The /, 'the ');
  return `${WATERS.has(best.kind) && bestD < c.inside ? 'in' : 'off'} ${name}`;
}

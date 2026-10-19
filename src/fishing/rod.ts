import { CONFIG } from '../config';
import type { Intent } from '../core/intents';
import { homeVessel, type WorldState } from '../core/world';
import { earn } from '../career/career';
import { nearestPort } from '../rescue/rescue';
import { groundAt } from './fishing';
import type { VesselState } from '../vessel/vesselState';

/**
 * The handheld rod's catch (owner, Oct 2026), the shared side of rod fishing: what bites
 * where, the bucket on deck (VesselState.rodCatch, in every snapshot) and its sale.
 *
 *   rodCatch   intent (value: the fish's weight, kg; ref: its species): one more in the
 *              bucket, if there's room (CONFIG.rod.bucketMax).
 *   the sale   tied up at a port (moored), the bucket is sold to the fish merchant at
 *              CONFIG.rod.pricePerKg times the port's fish factor, as a 'rod' job (the
 *              ledger, a little reputation), and emptied.
 *
 * The game itself (the cast, the bite, playing the fish) is each player's own, in their
 * hands: fishing/rodGame.ts.
 */

/** A bite's species and weight at (x, z): a fishing ground's own species in one, the coast's mix elsewhere. */
export function rodBite(x: number, z: number, rng: () => number = Math.random): { species: string; kg: number } {
  const c = CONFIG.rod.species;
  const g = groundAt(x, z);
  const species = g?.species && c.kg[g.species] ? g.species : c.coast[Math.floor(rng() * c.coast.length)];
  const [lo, hi] = c.kg[species] ?? [0.3, 1.0];
  // Most fish are small: the square of a uniform draw leans to the light end.
  const t = rng() ** 2;
  return { species, kg: Math.round((lo + (hi - lo) * t) * 100) / 100 };
}

/** The seconds to a bite here: open water's wait, shorter in a fishing ground by its richness. */
export function rodWait(x: number, z: number, rng: () => number = Math.random): number {
  const c = CONFIG.rod;
  const base = c.wait[0] + (c.wait[1] - c.wait[0]) * rng();
  const g = groundAt(x, z);
  return g ? base / (1 + g.richness * c.groundFactor) : base;
}

export function isRodIntent(control: string): boolean {
  return control === 'rodCatch';
}

/** `rodCatch` on a vessel: a fish into her bucket. Returns false if the bucket is full. */
export function applyRodIntent(s: VesselState, intent: Intent): boolean {
  if (intent.control !== 'rodCatch') return false;
  const kg = intent.value;
  if (!Number.isFinite(kg) || kg <= 0) return false;
  const b = (s.rodCatch ??= { count: 0, kg: 0 });
  if (b.count >= CONFIG.rod.bucketMax) return false;
  b.count += 1;
  b.kg = Math.round((b.kg + kg) * 100) / 100;
  if (intent.ref) b.last = intent.ref;
  return true;
}

/** The bucket is sold when she's tied up at a port. */
export function stepRodSale(world: WorldState): void {
  const v = homeVessel(world);
  const b = v?.rodCatch;
  if (!v || !b || b.count <= 0 || v.mooring.phase !== 'moored') return;
  const near = nearestPort(v.position[0], v.position[2]);
  if (near.dist > near.port.clearRadius) return;
  earn(world, 'rod', { port: near.port.id, kg: b.kg, text: `Rod fish sold at ${near.port.name.replace(' (anchorage)', '')}: ${b.count} fish, ${b.kg.toFixed(1)} kg` });
  v.rodCatch = { count: 0, kg: 0 };
}

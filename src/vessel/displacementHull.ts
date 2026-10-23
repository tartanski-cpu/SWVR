/**
 * A displacement hull's calm-water resistance (owner, Oct 2026: "respect the displacement
 * speed where possible"; CONFIG.displacementHull): for a heavy, full hull that can't plane (a
 * tug, a trawler), the wave she makes past her hull speed holds her back ever harder, so more
 * power barely moves her through it. A boat built on such a hull takes it in place of a planing
 * hull's curve, which levels off and lets enough power drive her through the hump.
 */
import { CONFIG } from '../config';
import type { VesselConfig } from './vesselDef';

/** Her resistance curve, on her own waterline length `lwl`, acting at height `y` (mid-draught). */
export function displacementResistance(lwl: number, y: number): VesselConfig['resistance'] {
  return { ...CONFIG.displacementHull.resistance, lwl, y };
}

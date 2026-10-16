/**
 * The bilge. A damaged hull leaks and the bilge fills; the electric bilge pump (on its
 * breaker, with a float switch) pumps it out. No physics of its own: it lights the BILGE
 * lamp and puts a duty on the board, and the water is weight low in the hull
 * (vessel/wear.ts: a flooding boat sits deeper).
 *
 *   inflow   damage x wear.leakRate per second
 *   outflow  pumpRate per second while the pump runs (electrics.bilgePumping)
 */
import { clamp } from '../core/math';
import { CONFIG } from '../config';
import { bilgePumping } from './electrics';
import { VESSEL_DEFS } from './vesselDef';
import type { VesselState } from './vesselState';

export function stepBilge(s: VesselState, dt: number): void {
  const cfg = VESSEL_DEFS[s.defId].bilge;
  if (!cfg || s.bilge === undefined) return;
  // A damaged hull leaks (vessel/wear.ts).
  let level = s.bilge + (s.damage ?? 0) * CONFIG.wear.leakRate * dt;
  if (bilgePumping(s)) level -= cfg.pumpRate * dt;
  s.bilge = clamp(level, 0, 1);
}

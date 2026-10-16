/**
 * The forepeak hatch and the bilge. Left open in the rain, water gets below and the bilge
 * fills; the electric bilge pump (on its breaker, with a float switch) pumps it out. No
 * physics of its own: it lights the BILGE lamp and puts a duty on the board, and the water
 * is weight low in the hull (vessel/wear.ts: a flooding boat sits deeper). A damaged hull
 * leaks too.
 *
 *   inflow   rain x rainInflow per second with the hatch open (a squall's spray doubles it)
 *   outflow  pumpRate per second while the pump runs (electrics.bilgePumping)
 */
import { clamp } from '../core/math';
import { CONFIG } from '../config';
import type { EnvironmentState } from '../environment/environmentState';
import { bilgePumping } from './electrics';
import { VESSEL_DEFS } from './vesselDef';
import type { VesselState } from './vesselState';

export function stepBilge(s: VesselState, env: EnvironmentState, dt: number): void {
  const cfg = VESSEL_DEFS[s.defId].bilge;
  if (!cfg || s.bilge === undefined) return;
  const rain = env.weather?.now.rain ?? 0;
  const spray = env.weather?.preset === 'Squall' ? 2 : 1;
  let level = s.bilge;
  if (s.controls.hatch > 0) level += rain * spray * cfg.rainInflow * dt;
  // A damaged hull leaks (vessel/wear.ts).
  level += (s.damage ?? 0) * CONFIG.wear.leakRate * dt;
  if (bilgePumping(s)) level -= cfg.pumpRate * dt;
  s.bilge = clamp(level, 0, 1);
}

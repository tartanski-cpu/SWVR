/**
 * The forepeak hatch and the bilge. Left open in the rain, water gets below and the bilge
 * fills; the electric bilge pump (on its breaker, with a float switch) pumps it out. No
 * physics: a full bilge only lights the BILGE lamp and puts a duty on the board - it is
 * state the crew has to look after, like the battery.
 *
 *   inflow   rain x rainInflow per second with the hatch open (a squall's spray doubles it)
 *   outflow  pumpRate per second while the pump runs (electrics.bilgePumping)
 */
import { clamp } from '../core/math';
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
  if (bilgePumping(s)) level -= cfg.pumpRate * dt;
  s.bilge = clamp(level, 0, 1);
}

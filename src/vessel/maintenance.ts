/**
 * Looking after the engine: lube oil. Running burns a little oil (more under load); every
 * so often an oil check falls due (a duty); the dipstick says whether it's fine or wants
 * topping up from the can on the engine casing. Very low oil blinks the OIL lamp. No damage
 * - like the battery and the bilge, it's state for the crew to keep an eye on.
 *
 * Intents: dipstick (a check: resets the clock), oilTopUp (fills the sump).
 */
import { VESSEL_DEFS } from './vesselDef';
import type { VesselState } from './vesselState';

export function stepOil(s: VesselState, dt: number): void {
  const cfg = VESSEL_DEFS[s.defId].maintenance;
  const e = s.engine;
  if (!cfg || e.oil === undefined || e.phase !== 'running') return;
  e.oil = Math.max(0, e.oil - cfg.use * (0.5 + e.rack) * dt);
  e.sinceCheck = (e.sinceCheck ?? 0) + dt;
}

/** What the dipstick shows. */
export function dipstickReading(s: VesselState): 'ok' | 'low' | 'empty' {
  const cfg = VESSEL_DEFS[s.defId].maintenance;
  const oil = s.engine.oil ?? 1;
  if (!cfg) return 'ok';
  return oil < cfg.lampAt ? 'empty' : oil < cfg.lowAt ? 'low' : 'ok';
}

/** Is an oil check due (running time since the last one)? */
export function oilCheckDue(s: VesselState): boolean {
  const cfg = VESSEL_DEFS[s.defId].maintenance;
  return !!cfg && (s.engine.sinceCheck ?? 0) >= cfg.checkEvery;
}

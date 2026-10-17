/**
 * Looking after the engine: lube oil. Running burns a little oil (more under load); every
 * so often an oil check falls due (a duty); the dipstick says whether it's fine or wants
 * topping up from the can on the engine casing. Very low oil blinks the OIL lamp. No damage
 * - like the battery and the bilge, it's state for the crew to keep an eye on.
 *
 * Intents: dipstick (a check: resets the clock), oilTopUp (fills the sump).
 */
import { gearOf } from '../boats/sims';
import type { EngineState, VesselState } from './vesselState';

/** Oil burnt while running (`use` of the sump per second at no load), and the time since the last check (the diesel module's, M4a). */
export function oilStep(e: EngineState, use: number, dt: number): void {
  if (e.oil === undefined || e.phase !== 'running') return;
  e.oil = Math.max(0, e.oil - use * (0.5 + e.rack) * dt);
  e.sinceCheck = (e.sinceCheck ?? 0) + dt;
}

/** What the dipstick shows. */
export function dipstickReading(s: VesselState): 'ok' | 'low' | 'empty' {
  const cfg = gearOf(s, 'diesel')?.maintenance;
  const oil = s.engine.oil ?? 1;
  if (!cfg) return 'ok';
  return oil < cfg.lampAt ? 'empty' : oil < cfg.lowAt ? 'low' : 'ok';
}

/** Is an oil check due (running time since the last one)? */
export function oilCheckDue(s: VesselState): boolean {
  const cfg = gearOf(s, 'diesel')?.maintenance;
  return !!cfg && (s.engine.sinceCheck ?? 0) >= cfg.checkEvery;
}

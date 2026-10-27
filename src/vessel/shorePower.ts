/**
 * Shore power (owner, 27 Oct 2026: "a plug-in charger at the quayside"; agreed: 22 kW posts at
 * the berths, a 150 kW fast charger by each fuel pump, on the game's clock): an electric boat
 * plugged in (VesselState.shore: by a charger's cable, fuel/fuelHose.ts, or the menu's Refuel at
 * a fuel berth) takes the charger's power into her battery.
 *
 *   power    the charger's rating, all of it below `taperFrom` of full, then less and less
 *            (a lithium pack's absorption) until `fullAt`, where it calls her full and stops;
 *            into her battery over `chargeEff`
 *   clock    on game hours (the clock you see, and the hours slept aboard): 22 kW fills her
 *            100 kWh in about 23 real minutes, the fast charger in about three. (Her motors
 *            and the sun run on real-time power: physics/electricMotor.ts, modules/solarRoof.)
 *   12 V     her house batteries are topped up too (`houseSocPerHour` of full a game hour)
 *   billed   the energy from the grid (`kWh`) is billed when she unplugs (career.ts)
 * Tunables: CONFIG.charger.
 */
import { gearOf } from '../boats/sims';
import { CONFIG } from '../config';
import type { VesselState } from './vesselState';

/** Can she plug in (electric motors with a battery)? */
export function hasSocket(v: VesselState): boolean {
  return !!gearOf(v, 'diesel')?.electric;
}

/** Plugged in to a charger of `ratedKw` (`menu`: by the menu's Refuel, no cable). */
export function plugIn(v: VesselState, ratedKw: number, menu = false): void {
  v.shore = { ratedKw, chargeKw: 0, kWh: 0, ...(menu ? { menu } : {}) };
}

/** One tick plugged in: `gameHours` of the game's clock (and of sleep) have gone by. */
export function stepShorePower(v: VesselState, gameHours: number): void {
  const sh = v.shore;
  const m = gearOf(v, 'diesel')?.electric;
  if (!sh) return;
  if (!m) {
    delete v.shore;
    return;
  }
  const c = CONFIG.charger;
  const soc = v.battery ?? 0;
  // Its current tailed off at `fullAt`: it calls her full and stops.
  if (soc >= c.fullAt) {
    v.battery = 1;
    sh.chargeKw = 0;
    return;
  }
  const accept = soc < c.taperFrom ? 1 : Math.max(0, (1 - soc) / (1 - c.taperFrom));
  const grid = sh.ratedKw * accept;
  sh.chargeKw = grid * c.chargeEff;
  sh.kWh += grid * gameHours;
  v.battery = Math.min(1, soc + (sh.chargeKw * gameHours) / m.usableKWh);
  if (v.electrics) v.electrics.soc = v.electrics.soc.map((s) => Math.min(1, s + c.houseSocPerHour * gameHours)) as [number, number];
}

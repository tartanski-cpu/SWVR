/**
 * The solar catamaran's battery figures (owner, 26 Oct 2026; CONFIG.shipyard.solarCat): what
 * her battery gives her at an easy cruise, and how high her wet deck sits over the water.
 *
 *   cruise   the speed where her calm-water resistance takes `cruiseKw` (both motors) at the
 *            game's `propulsiveEff` (the share of a motor's power that ends up pushing her):
 *            the game's own resistance (vessel/physics/propulsion.ts) on her as built;
 *   hours    her battery's usable share at that power;
 *   range    the two together, in nautical miles;
 *   wet deck her bridge deck's underside over the water as she floats (her lines' `tunnel`,
 *            raised or sunk with her weight).
 * Solar charging at sea isn't counted here (later, with the game's sun).
 * The foiling ferry's (CONFIG.shipyard.foilFerry): her cruise on her foils at 25 kn, its power
 * as measured in the game for her weight; her battery's usable share at it, her range.
 */
import { CONFIG } from '../../config';
import type { HullDefinition } from '../../modular/hull';
import type { HullForm } from '../../vessel/hullForm';
import type { MotorSpec } from '../../vessel/physics/electricMotor';
import { calmWaterResistance } from '../../vessel/physics/propulsion';
import { wettedSurfaceAtDWL, type VesselDef } from '../../vessel/vesselDef';
import { BATTERY_DEFAULT, batteryKWh, type ShipDesign } from '../design';
import { DESIGN_HULLS } from './catalog';

export interface SolarFigures {
  batteryKWh: number;
  cruiseKw: number;
  cruiseKn: number;
  hours: number;
  rangeNm: number;
  wetDeckM: number;
}

export function solarFigures(d: ShipDesign, hull: HullDefinition, shape: HullForm, massKg: number): SolarFigures {
  const c = CONFIG.shipyard.solarCat;
  const def = { resistance: hull.resistance, wettedSurface: wettedSurfaceAtDWL(shape), mass: massKg } as VesselDef;
  // Her speed (m/s) where the power her resistance takes meets what her motors give it.
  let lo = 0;
  let hi = 10;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (calmWaterResistance(def, m) * m < c.propulsiveEff * c.cruiseKw * 1000) lo = m;
    else hi = m;
  }
  const kWh = batteryKWh(d.battery ?? BATTERY_DEFAULT);
  // (The foiling ferry: on her foils at her service speed, the power measured for her weight; CONFIG.shipyard.foilFerry.)
  const ff = DESIGN_HULLS[d.hull]?.centrePod ? CONFIG.shipyard.foilFerry : null;
  const cruiseKn = ff ? ff.cruiseKn : lo / 0.5144;
  const cruiseKw = ff ? Math.round(ff.cruiseKw + ff.cruiseKwPerT * (massKg / 1000 - ff.cruiseRefT)) : c.cruiseKw;
  const hours = (kWh * electricOf(d).usableShare) / cruiseKw;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return { batteryKWh: kWh, cruiseKw, cruiseKn: r1(cruiseKn), hours: r1(hours), rangeNm: Math.round(hours * cruiseKn), wetDeckM: Math.round((shape.catamaran?.tunnel ?? 0) * 100) / 100 };
}

/** An electric boat's battery and drive figures: the foiling ferry's own (CONFIG.shipyard.foilFerry), else the solar catamaran's. */
export function electricOf(d: Pick<ShipDesign, 'hull'>): typeof CONFIG.shipyard.solarCat | typeof CONFIG.shipyard.foilFerry {
  return DESIGN_HULLS[d.hull]?.centrePod ? CONFIG.shipyard.foilFerry : CONFIG.shipyard.solarCat;
}

/** Her pod motors in the game (modules/pods `electric`; her type's `motor`, electricOf), from her battery's usable share. */
export function motorSpec(d: ShipDesign): MotorSpec {
  const c = electricOf(d);
  const m = c.motor;
  return { usableKWh: Math.round(batteryKWh(d.battery ?? BATTERY_DEFAULT) * c.usableShare * 10) / 10, efficiency: m.efficiency, inertia: m.inertia, responseS: m.responseS };
}

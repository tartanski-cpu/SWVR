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
 */
import { CONFIG } from '../../config';
import type { HullDefinition } from '../../modular/hull';
import type { HullForm } from '../../vessel/hullForm';
import { calmWaterResistance } from '../../vessel/physics/propulsion';
import { wettedSurfaceAtDWL, type VesselDef } from '../../vessel/vesselDef';
import { BATTERY_DEFAULT, batteryKWh, type ShipDesign } from '../design';

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
  const cruiseKn = lo / 0.5144;
  const hours = (kWh * c.usableShare) / c.cruiseKw;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return { batteryKWh: kWh, cruiseKw: c.cruiseKw, cruiseKn: r1(cruiseKn), hours: r1(hours), rangeNm: Math.round(hours * cruiseKn), wetDeckM: Math.round((shape.catamaran?.tunnel ?? 0) * 100) / 100 };
}

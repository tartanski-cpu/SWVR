/**
 * Module electrical.battery-bank: the house batteries (modular boats M4a): two 12 V
 * batteries, picked by the selector (1, 2 or both), behind the battery master. The energy
 * network charges and drains them (vessel/electrics.ts): charge changes by I dt / capacity,
 * the voltage rests on the charge, sags by I R discharging and rises toward the
 * alternator's regulated voltage charging; below `cutoffSoc` a battery is flat.
 *
 * Its state is today's VesselState.electrics (until M6); its defaults are the workboat's
 * batteries. (Until M6, whether the bus is powered still reads the vessel's own battery
 * config; a test keeps the two the same.)
 */
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';

const el = CONFIG.vessels.workboat.electrics;

export interface BatteryBankConfig {
  batteries: number;
  /** Each battery's capacity (Ah). */
  ah: number;
  /** Resting voltage flat .. full. */
  restVolts: readonly [number, number];
  internalOhm: number;
  /** The alternator's regulated charging voltage. */
  chargeVolts: number;
  /** Below this charge a battery is flat: nothing works from it. */
  cutoffSoc: number;
  /** Each battery's mass (kg). */
  massKg: number;
}

export const BATTERY_BANK: ModuleDefinition<BatteryBankConfig> = {
  id: 'electrical.battery-bank',
  version: 1,
  fits: ['engine.bay'],
  defaults: { batteries: 2, ah: el.batteryAh, restVolts: el.restVolts, internalOhm: el.internalOhm, chargeVolts: el.chargeVolts, cutoffSoc: el.cutoffSoc, ...CONFIG.modules.batteryBank },
  validateConfig: (c) => [
    ...(c.batteries === 2 ? [] : ['two batteries for now (the selector picks 1, 2 or both)']),
    ...(c.ah > 0 ? [] : ['ah should be more than 0']),
    ...(c.restVolts[1] > c.restVolts[0] ? [] : ['restVolts: flat should be below full']),
  ],
  ports: {},
  provides: () => [{ power: 'electrical' }],
  // The batteries' mass, at the bank (M6).
  physical: (c) => ({ massKg: c.batteries * c.massKg, units: c.batteries }),
  power: (c) => [{ role: 'store', ...c }],
};

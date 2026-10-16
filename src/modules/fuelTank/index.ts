/**
 * Module fuel.tank: the diesel tank (modular boats M4a). It provides the boat's diesel; the
 * engine draws from it and a fuel berth fills it, both through 'fuel.litres'. It has no
 * upkeep of its own (no sim tick). Its level is kept in today's engine state until M6, so
 * saves and snapshots stay as they are; its capacity and starting level are the vessel's
 * fuel config (CONFIG.vessels.workboat.engine.fuel) until then.
 */
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';

const fuel = CONFIG.vessels.workboat.engine.fuel;

export interface FuelTankConfig {
  /** Capacity, and what she starts a fresh game with (L). */
  tankL: number;
  startL: number;
}

export const FUEL_TANK: ModuleDefinition<FuelTankConfig> = {
  id: 'fuel.tank',
  version: 1,
  fits: ['engine.bay'],
  defaults: { tankL: fuel.tankL, startL: fuel.startL },
  validateConfig: (c) => (c.tankL > 0 && c.startL >= 0 && c.startL <= c.tankL ? [] : ['startL should be between 0 and tankL']),
  // Its level: the engine draws it down, a fuel berth fills it (nothing needs to, though).
  ports: { level: { dir: 'read', key: 'fuel.litres', required: false } },
  provides: () => [{ fuel: 'diesel' }],
};

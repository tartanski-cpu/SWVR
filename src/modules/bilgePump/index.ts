/**
 * Module pump.bilge: the electric bilge pump with its float switch (modular boats M4a). It
 * runs while there's water over the float and 12 V on its BILGE circuit, pumping at
 * `pumpRate` of a full bilge per second, and draws `amps` while it runs. A damaged hull
 * leaking in is the hull's (vessel/bilge.ts), just before.
 */
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';
import type { PortIO } from '../../modular/module';

export interface BilgePumpConfig {
  /** Of a full bilge per second. */
  pumpRate: number;
  /** The float switch: it runs above this level (0..1). */
  floatAt: number;
  amps: number;
}

/** Is it running: water over the float, and its circuit live? */
const running = (io: PortIO, c: BilgePumpConfig) => io.num('level') > c.floatAt && !!io.get('live');

export const BILGE_PUMP: ModuleDefinition<BilgePumpConfig, undefined> = {
  id: 'pump.bilge',
  version: 1,
  fits: ['engine.bay'],
  // Its pumping rate is the workboat's bilge config until M6 (the hull's old bilge step reads it too).
  defaults: { pumpRate: CONFIG.vessels.workboat.bilge.pumpRate, ...CONFIG.modules.bilgePump },
  validateConfig: (c) => (c.pumpRate > 0 ? [] : ['pumpRate should be more than 0']),
  ports: {
    level: { dir: 'write', key: 'bilge.level' },
    live: { dir: 'read', key: 'circuit.bilge.live' },
  },
  needs: () => [{ power: 'electrical', circuit: 'bilge' }],
  power: (c) => [{ role: 'load', circuit: 'bilge', amps: (io) => (running(io, c) ? c.amps : 0) }],
  sim: {
    init: () => undefined,
    tick({ config: c, io }, _s, dt) {
      if (running(io, c)) io.set('level', Math.min(1, Math.max(0, io.num('level') - c.pumpRate * dt)));
    },
  },
};

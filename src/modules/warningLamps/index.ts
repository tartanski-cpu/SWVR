/**
 * Module instrument.warning-lamps: the engine panel's row of warning lamps, OIL, CHARGE,
 * GLOW, NEUTRAL and BILGE (modular boats M3), and her condition, HULL and ENGINE (on when
 * worth a repair, blinking when bad); TEMP (coolant over its alarm) and FUEL (low) in every tier
 * of instruments (CS5). Each shows a key that is off, on or blinking;
 * when each one lights is decided by whatever writes its key (today's engine rules,
 * modular/busKeys.ts), not by the lamps. One instanced draw call; colours change only when
 * a lamp changes.
 */
import { CONFIG } from '../../config';
import { WarningLamps } from '../../controls/ignition';
import type { ModuleDefinition } from '../../modular/module';

const NAMES = ['oil', 'charge', 'glow', 'neutral', 'temp', 'fuel', 'bilge', 'hull', 'engine'] as const;

export const WARNING_LAMPS: ModuleDefinition<{ spacing: number }> = {
  id: 'instrument.warning-lamps',
  version: 1,
  fits: ['panel.slot'],
  defaults: { ...CONFIG.modules.warningLamps },
  needs: () => [{ power: 'electrical', circuit: 'instruments' }],
  ports: {
    oil: { dir: 'read', key: 'lamp.oil' },
    charge: { dir: 'read', key: 'lamp.charge' },
    glow: { dir: 'read', key: 'lamp.glow' },
    neutral: { dir: 'read', key: 'lamp.neutral' },
    bilge: { dir: 'read', key: 'lamp.bilge' },
    hull: { dir: 'read', key: 'lamp.hull' },
    engine: { dir: 'read', key: 'lamp.engine' },
    temp: { dir: 'read', key: 'lamp.temp' },
    fuel: { dir: 'read', key: 'lamp.fuel' },
  },
  view: {
    build({ config, keys }) {
      const lamps = new WarningLamps(config);
      return {
        staticParts: [],
        movingParts: [lamps.root],
        controls: [],
        update: (read) => lamps.show(NAMES.map((n) => String(read.get(keys[n])))),
      };
    },
  },
};

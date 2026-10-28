/**
 * (An electric boat's, `electric`: READY, NEUTRAL, BATT, SHORE, BILGE, HULL.)
 *
 * Module instrument.warning-lamps: the engine panel's row of warning lamps, OIL, CHARGE,
 * GLOW, NEUTRAL and BILGE (modular boats M3), and her condition, HULL and ENGINE (on when
 * worth a repair, blinking when bad); TEMP (coolant over its alarm) and FUEL (low) in every tier
 * of instruments (CS5). Each shows a key that is off, on or blinking;
 * when each one lights is decided by whatever writes its key (today's engine rules,
 * modular/busKeys.ts), not by the lamps. One instanced draw call; colours change only when
 * a lamp changes.
 */
import { CONFIG } from '../../config';
import { DIESEL_LAMPS, ELECTRIC_LAMPS, WarningLamps } from '../../controls/ignition';
import type { ModuleDefinition } from '../../modular/module';

const NAMES = ['oil', 'charge', 'glow', 'neutral', 'temp', 'fuel', 'bilge', 'hull', 'engine'] as const;
/** An electric boat's (`electric`; owner, 28 Oct 2026): READY, NEUTRAL, BATT, SHORE, BILGE, HULL (controls/ignition.ts ELECTRIC_LAMPS). */
const ELECTRIC_NAMES = ['ready', 'neutral', 'batt', 'shore', 'bilge', 'hull'] as const;

export const WARNING_LAMPS: ModuleDefinition<{ spacing: number; electric?: boolean }> = {
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
    ready: { dir: 'read', key: 'lamp.ready' },
    batt: { dir: 'read', key: 'lamp.batt' },
    shore: { dir: 'read', key: 'lamp.shore' },
  },
  view: {
    build({ config, keys }) {
      const lamps = new WarningLamps(config, config.electric ? ELECTRIC_LAMPS : DIESEL_LAMPS);
      const names = config.electric ? ELECTRIC_NAMES : NAMES;
      return {
        staticParts: [],
        movingParts: [lamps.root],
        controls: [],
        update: (read) => lamps.show(names.map((n) => String(read.get(keys[n])))),
      };
    },
  },
};

/**
 * Module hydraulics.pto-pump: the deck hydraulics' pump, on the engine's power take-off
 * (modular boats M4a). The crane, the tow winch and the net drum are hydraulic. The pump
 * only turns with the engine running, and its electric clutch and the machines' valve
 * solenoids are on the DECK HYD breaker: no engine or no breaker, no pressure
 * ('hydraulics.on'), and the machines stop where they are.
 *
 * The rule for pressure is still worked out where it was (vessel/electrics.ts,
 * hydraulicsOn), on demand, because the machines ask in the middle of a tick; this module
 * declares the pump's draw on the 12 V network, and that the boat has hydraulics.
 */
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';

export interface PtoPumpConfig {
  /** The clutch and the valve solenoids' draw while there's pressure (A). */
  amps: number;
}

export const PTO_PUMP: ModuleDefinition<PtoPumpConfig> = {
  id: 'hydraulics.pto-pump',
  version: 1,
  fits: ['engine.bay'],
  defaults: CONFIG.modules.ptoPump,
  ports: { pressure: { dir: 'read', key: 'hydraulics.on' } },
  needs: () => [{ power: 'pto' }, { power: 'electrical', circuit: 'hydraulics' }],
  provides: () => [{ power: 'hydraulic' }],
  power: (c) => [{ role: 'load', circuit: 'hydraulics', amps: (io) => (io.get('pressure') ? c.amps : 0) }],
};

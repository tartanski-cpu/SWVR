/**
 * Module electrical.consumer: a 12 V device that draws its current while its switch is on
 * (modular boats M4a): the navigation lights, the deck floods, the rail lights, the cabin
 * lamp, the searchlight, the horn, the wiper motor. The recipe says which switch
 * ("bind": { "on": "lights.nav" }), on which circuit, and how much it draws; with no circuit
 * it is on the battery master alone (the horn).
 *
 * Only its draw on the energy network for now; the lights and the horn are still drawn and
 * sounded by the app from their switches, and become this module's views later.
 */
import type { ModuleDefinition } from '../../modular/module';
import type { BreakerName } from '../../vessel/vesselState';
import { BREAKERS } from '../../vessel/vesselState';

export interface ConsumerConfig {
  /** What it is (hover text, the key table). */
  label: string;
  amps: number;
  /** Its breaker's circuit, or null: the master alone. */
  circuit: BreakerName | null;
}

export const CONSUMER: ModuleDefinition<ConsumerConfig> = {
  id: 'electrical.consumer',
  version: 1,
  fits: ['hull.light', 'roof.mount', 'cabin.overhead', 'window.wiper'],
  defaults: { label: 'Device', amps: 1, circuit: null },
  validateConfig: (c) => [
    ...(c.amps >= 0 ? [] : ['amps should be 0 or more']),
    ...(c.circuit === null || (BREAKERS as readonly string[]).includes(c.circuit) ? [] : [`'${c.circuit}' isn't a circuit (${BREAKERS.join(', ')})`]),
  ],
  ports: { on: { dir: 'read' } },
  needs: (c) => [{ power: 'electrical', ...(c.circuit ? { circuit: c.circuit } : {}) }],
  power: (c) => [{ role: 'load', ...(c.circuit ? { circuit: c.circuit } : {}), amps: (io) => (io.num('on') > 0 ? c.amps : 0) }],
};

/**
 * Module radio.vhf: the VHF set and its handset (modular boats M3c), hung from the
 * wheelhouse roof on two brackets, its face tilted down toward the helm, the handset on a
 * clip at its side.
 *
 * What it shows (distress and tow calls, the run's status) comes from the world, not the
 * boat: the app feeds the set through its `api` (the RadioSet), as it always has. Its case
 * and brackets are merged with the boat's fixed parts.
 */
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';
import { RadioSet } from '../../rescue/radioView';

export type VhfConfig = typeof CONFIG.modules.vhf;

export const VHF: ModuleDefinition<VhfConfig> = {
  id: 'radio.vhf',
  version: 1,
  fits: ['cabin.overhead'],
  defaults: CONFIG.modules.vhf,
  ports: { live: { dir: 'read', key: 'circuit.radio.live' } },
  needs: () => [{ power: 'electrical', circuit: 'radio' }],
  power: (c) => [{ role: 'load', circuit: 'radio', amps: () => c.amps }],
  view: {
    build({ config, socket, hull }) {
      // Its brackets reach up to the roof.
      const y = socket.transform.position[1];
      const radio = new RadioSet(config.tiltDeg, Math.max(0, (hull.cabinRoof ?? y) - y));
      return { staticParts: radio.fixedParts, movingParts: [radio.root], controls: [radio.handset, radio.sosButton], update: () => {}, api: radio };
    },
  },
};

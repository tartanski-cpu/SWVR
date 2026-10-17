/**
 * Module control.tiller: the outboard's tiller and the motor it swings (modular boats M6c;
 * it was the app's): the handle you steer and throttle by, the gear lever and the on/off
 * button on the motor, the battery bars on its cowl (controls/Tiller.ts). Fitted on the
 * outboard's own 'tiller' socket.
 *
 * It writes the helm ('helm.demand') and the twist-grip throttle ('throttle.demand'); the
 * gear lever and the button send their own intents (`obGear`: shifting closes the throttle;
 * `obPower`: a press toggles the motor), which do more than set a key. Drawn in the boat's
 * axes from the outboard's config (its pivot, leg and tiller).
 */
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';
import { Tiller } from '../../controls/Tiller';
import type { OutboardConfig } from '../../vessel/vesselDef';

/** What the app may want of it: the tiller (the motor's sound comes from where it is). */
export interface TillerApi {
  readonly tiller: Tiller;
}

export const TILLER: ModuleDefinition<OutboardConfig> = {
  id: 'control.tiller',
  version: 1,
  fits: ['outboard.tiller'],
  defaults: CONFIG.vessels.skiff.outboard,
  validateConfig: (c) => (c.tiller.length > 0 && c.maxSteerDeg > 0 ? [] : ['the tiller needs a length and room to swing']),
  ports: {
    helm: { dir: 'write', key: 'helm.demand' },
    throttle: { dir: 'write', key: 'throttle.demand' },
    gear: { dir: 'write', key: 'outboard.gear' },
    on: { dir: 'write', key: 'outboard.on' },
  },
  view: {
    frame: 'boat',
    build({ config, keys }) {
      const tiller = new Tiller(config, { helm: keys.helm, throttle: keys.throttle });
      const api: TillerApi = { tiller };
      return { staticParts: [], movingParts: [tiller.root], controls: tiller.parts, update: () => {}, api };
    },
  },
};

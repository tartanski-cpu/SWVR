/**
 * Module light.cabin: the wheelhouse ceiling lamp (modular boats M6c), white or red for
 * night work, from the CABIN switch ('lights.cabin': 0 off, 1 white, 2 red), on the deck
 * lights' breaker. One real PointLight, hidden while off (vessel/view/cabinLight.ts). It
 * draws 1 A while on.
 */
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';
import { CabinLight } from '../../vessel/view/cabinLight';
import { BREAKERS, type BreakerName } from '../../vessel/vesselState';

const cl = CONFIG.vessels.workboat.cabinLight;

export interface CabinLightConfig {
  /** Its light (cd) white and red, and its reach (m). */
  intensity: number;
  redIntensity: number;
  distance: number;
  amps: number;
  circuit: BreakerName;
}

export const CABIN_LIGHT: ModuleDefinition<CabinLightConfig> = {
  id: 'light.cabin',
  version: 1,
  fits: ['cabin.overhead'],
  defaults: { intensity: cl.intensity, redIntensity: cl.redIntensity, distance: cl.distance, amps: 1, circuit: 'deckLights' },
  validateConfig: (c) => [
    ...(c.amps >= 0 ? [] : ['amps should be 0 or more']),
    ...((BREAKERS as readonly string[]).includes(c.circuit) ? [] : [`'${c.circuit}' isn't a circuit (${BREAKERS.join(', ')})`]),
  ],
  ports: {
    on: { dir: 'read', key: 'lights.cabin' },
    live: { dir: 'read', key: 'circuit.deckLights.live' },
  },
  needs: (c) => [{ power: 'electrical', circuit: c.circuit }],
  power: (c) => [{ role: 'load', circuit: c.circuit, amps: (io) => (io.num('on') > 0 ? c.amps : 0) }],
  view: {
    build({ config, keys }) {
      // At its socket, on the ceiling.
      const lamp = new CabinLight({ ...config, position: [0, 0, 0] });
      return {
        staticParts: [],
        movingParts: [lamp.root],
        controls: [],
        update: (read) => lamp.update(read.get(keys.live) ? read.num(keys.on) : 0),
      };
    },
  },
};

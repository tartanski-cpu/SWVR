/**
 * Module deck.searchlight: the roof searchlight (modular boats M5b). A lamp drum on a yoke
 * that pans and tilts as the helm's joystick sets 'searchlight.pan' / 'searchlight.tilt',
 * lit while the SPOT switch ('searchlight.on') is on and there's 12 V on its circuit (the
 * deck lights' breaker). It throws one real spotlight (it lights islands, quays and boats;
 * the ocean shader adds its pool on the water) and a faint beam cone at night; stabilised,
 * it holds its aim level against her roll and pitch.
 *
 * It gives the boat a searchlight: its aim limits, which the controls clamp to. Its draw
 * (12 A while on) is its own (it was a generic 12 V consumer in M4a). Drawn by
 * vessel/view/searchlight.ts, in the boat's axes from its config (the vessel's,
 * CONFIG.vessels.workboat.spotlight, until M6); the app hands it how dark it is and gives
 * its light to the ocean (`api`).
 */
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';
import { Searchlight, type SearchlightLook } from '../../vessel/view/searchlight';
import { BREAKERS, type BreakerName } from '../../vessel/vesselState';

export type SearchlightConfig = SearchlightLook & {
  /** Its draw while on (A), and its breaker's circuit. */
  amps: number;
  circuit: BreakerName;
};

/** What the app hands the searchlight each frame, and takes from it. */
export interface SearchlightApi {
  /** The lamp (its SpotLight lights the water through the ocean shader). */
  readonly lamp: Searchlight;
  /** 0 (day) .. 1 (night): how strongly the beam shows. */
  darkness: number;
}

export const SEARCHLIGHT: ModuleDefinition<SearchlightConfig> = {
  id: 'deck.searchlight',
  version: 1,
  fits: ['roof.mount'],
  defaults: { ...CONFIG.vessels.workboat.spotlight, ...CONFIG.modules.searchlight, circuit: 'deckLights' },
  validateConfig: (c) => [
    ...(c.panLimitDeg > 0 && c.tiltMaxDeg > c.tiltMinDeg ? [] : ['the searchlight needs room to pan and tilt']),
    ...((BREAKERS as readonly string[]).includes(c.circuit) ? [] : [`'${c.circuit}' isn't a circuit (${BREAKERS.join(', ')})`]),
  ],
  ports: {
    on: { dir: 'read', key: 'searchlight.on' },
    pan: { dir: 'read', key: 'searchlight.pan' },
    tilt: { dir: 'read', key: 'searchlight.tilt' },
    live: { dir: 'read', key: 'circuit.deckLights.live' },
  },
  needs: (c) => [{ power: 'electrical', circuit: c.circuit }],
  provides: () => [{ gear: 'searchlight' }],
  gear: (c) => ({ searchlight: c }),
  power: (c) => [{ role: 'load', circuit: c.circuit, amps: (io) => (io.num('on') > 0 ? c.amps : 0) }],
  view: {
    frame: 'boat',
    build({ config, keys }) {
      const lamp = new Searchlight(config);
      const api: SearchlightApi = { lamp, darkness: 0 };
      return {
        staticParts: [],
        movingParts: [lamp.root],
        controls: [],
        update: (read) => lamp.update(!!read.get(keys.on), read.num(keys.pan), read.num(keys.tilt), api.darkness, !!read.get(keys.live)),
        api,
      };
    },
  },
};

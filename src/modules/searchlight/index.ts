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
 * vessel/view/searchlight.ts, in the boat's axes from its config (defaults:
 * CONFIG.vessels.workboat.spotlight); the app hands it how dark it is and gives
 * its light to the ocean (`api`).
 *
 * On the wheelhouse roof (a roof.mount, `pole` null) it's worked from the helm. On the
 * working deck (a deck.equipment socket, owner) it stands on a pole (`pole`, modules/
 * deckPole.ts) with its own SPOT switch and joystick in a box at hand height, as well as the
 * helm's if she has them: both work the same keys, so either moves it.
 */
import { CONFIG } from '../../config';
import { Joystick } from '../../controls/Joystick';
import { Toggle } from '../../controls/Toggle';
import { busOf } from '../../modular/bus';
import { TickSmoother } from '../../mechanisms/tickSmoother';
import type { ModuleDefinition } from '../../modular/module';
import { poleBoxTop, poleFootprint, poleParts, type DeckPole } from '../../mechanisms/deckPole';
import { Searchlight, type SearchlightLook } from '../../vessel/view/searchlight';
import { BREAKERS, type BreakerName } from '../../vessel/vesselState';

export type SearchlightConfig = SearchlightLook & {
  /** Its draw while on (A), and its breaker's circuit. */
  amps: number;
  circuit: BreakerName;
  /** On a deck pole (null: on the roof). */
  pole: DeckPole | null;
};

/** How far below the lamp's pivot its own short post ends (vessel/view/searchlight.ts). */
const POST_DROP = 0.245;

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
  fits: ['roof.mount', 'deck.equipment'],
  defaults: { ...CONFIG.vessels.workboat.spotlight, ...CONFIG.modules.searchlight, circuit: 'deckLights', pole: null },
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
  footprints: (c) => (c.pole ? [poleFootprint(c.position, c.position[1] - POST_DROP)] : []),
  power: (c) => [{ role: 'load', circuit: c.circuit, amps: (io) => (io.num('on') > 0 ? c.amps : 0) }],
  view: {
    frame: 'boat',
    build({ config, keys, socket }) {
      const lamp = new Searchlight(config);
      const aim = new TickSmoother([60, 30]);
      const api: SearchlightApi = { lamp, darkness: 0 };
      const pole = config.pole;
      // On a deck pole: the pole, and its box with the SPOT switch and a joystick.
      const controls = [];
      const labels = [];
      if (pole) {
        const [x, y, z] = poleBoxTop(config.position, pole);
        const stick = new Joystick(
          `${socket.id}PoleJoystick`,
          { ...CONFIG.modules.joystick, panLimitDeg: config.panLimitDeg, tiltMinDeg: config.tiltMinDeg, tiltMaxDeg: config.tiltMaxDeg },
          { pan: keys.pan, tilt: keys.tilt },
          'Searchlight joystick (on its pole)',
          0xe0b020,
          { pan: (s) => busOf(s).num(keys.pan), tilt: (s) => busOf(s).num(keys.tilt) },
        );
        stick.root.position.set(x - 0.07, y, z + 0.01);
        const spot = new Toggle(`${socket.id}PoleSwitch`, keys.on, 'Searchlight on/off (on its pole)', (s) => busOf(s).num(keys.on));
        spot.root.position.set(x + 0.1, y, z + 0.01);
        controls.push(stick, spot);
        labels.push({ text: 'SPOT', at: [x + 0.1, y, z + 0.07] as const }, { text: 'SEARCHLIGHT', at: [x - 0.07, y, z + 0.08] as const });
      }
      return {
        staticParts: pole ? poleParts(config.position, pole, config.position[1] - POST_DROP) : [],
        movingParts: [lamp.root],
        controls,
        labels,
        update: (read, _s, dt) => {
          // (Its pan and tilt drawn smoothly between the simulation's ticks: mechanisms/tickSmoother.ts.)
          const [pan, tilt] = aim.update([read.num(keys.pan), read.num(keys.tilt)], dt);
          lamp.update(!!read.get(keys.on), pan, tilt, api.darkness, !!read.get(keys.live));
        },
        api,
      };
    },
  },
};

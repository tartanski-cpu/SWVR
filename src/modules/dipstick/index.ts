/**
 * Module tool.dipstick: the engine's dipstick (modular boats M3c). A press pulls it: the
 * oil is checked ('engine.oilCheck'), and the app says what it shows. Under a hatch it can
 * only be reached with the hatch open: that's the recipe's interlock, not the dipstick's.
 * (It moves to the engine module when the engine is one, M4.)
 */
import { Dipstick } from '../../controls/deckGear';
import type { ModuleDefinition } from '../../modular/module';

export const DIPSTICK: ModuleDefinition<Record<string, never>> = {
  id: 'tool.dipstick',
  version: 1,
  fits: ['deck.fitting'],
  defaults: {},
  ports: { check: { dir: 'write', key: 'engine.oilCheck' } },
  view: {
    build({ keys, socket }) {
      return { staticParts: [], movingParts: [], controls: [new Dipstick(socket.id, { channel: keys.check })], update: () => {} };
    },
  },
};

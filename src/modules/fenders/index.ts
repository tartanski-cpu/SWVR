/**
 * Module deck.fenders: a basket of fenders on the aft deck, and the six fenders (modular
 * boats M5b). A press on the basket puts them all out over the side, or takes them in
 * ('fenders.out'); out, they hang on their lines just outside the hull below the sheer, in,
 * they lie along the bulwarks. Coming alongside, the duty board asks for them.
 *
 * It gives the boat fenders. Drawn in the boat's axes: the basket at `basket` (x, z) on
 * the deck, the fenders at the stations `z`, each side, hung from the hull's beam and deck
 * (defaults: CONFIG.vessels.workboat.fenders). One instanced draw call for the six.
 */
import { CONFIG } from '../../config';
import { FenderBasket, FendersView } from '../../controls/deckGear';
import { busOf } from '../../modular/bus';
import type { ModuleDefinition } from '../../modular/module';

export type FendersConfig = typeof CONFIG.vessels.workboat.fenders;

export const FENDERS: ModuleDefinition<FendersConfig> = {
  id: 'deck.fenders',
  version: 1,
  fits: ['deck.fitting'],
  defaults: CONFIG.vessels.workboat.fenders,
  validateConfig: (c) => (c.z.length > 0 ? [] : ['no fender stations']),
  ports: { out: { dir: 'write', key: 'fenders.out' } },
  provides: () => [{ gear: 'fenders' }],
  gear: () => ({ fenders: {} }),
  view: {
    frame: 'boat',
    build({ config: c, keys, hull }) {
      const key = keys.out;
      const basket = new FenderBasket('fenders', { channel: key, read: (s) => busOf(s).num(key) });
      const [fx, fz] = c.basket;
      basket.root.position.set(fx, hull.deckY(fz), fz);
      const fenders = new FendersView(c.z, hull);
      return {
        staticParts: [],
        movingParts: [fenders.mesh],
        controls: [basket],
        update: (read) => fenders.update(!!read.get(key)),
      };
    },
  },
};

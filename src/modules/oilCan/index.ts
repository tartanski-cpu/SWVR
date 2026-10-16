/**
 * Module tool.oil-can: a can of engine oil on a shelf (modular boats M3c). A press tops
 * the sump up ('engine.oilTopUp'). Out of reach with the engine hatch shut: the recipe's
 * interlock.
 */
import { CONFIG } from '../../config';
import { OilCan } from '../../controls/deckGear';
import type { ModuleDefinition } from '../../modular/module';

export type OilCanConfig = typeof CONFIG.modules.oilCan;

export const OIL_CAN: ModuleDefinition<OilCanConfig> = {
  id: 'tool.oil-can',
  version: 1,
  fits: ['deck.fitting'],
  defaults: CONFIG.modules.oilCan,
  validateConfig: (c) => (c.scale > 0 ? [] : ['scale should be more than 0']),
  ports: { topUp: { dir: 'write', key: 'engine.oilTopUp' } },
  view: {
    build({ config, keys, socket }) {
      const can = new OilCan(socket.id, { channel: keys.topUp });
      can.root.scale.setScalar(config.scale);
      return { staticParts: [], movingParts: [], controls: [can], update: () => {} };
    },
  },
};

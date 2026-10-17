/**
 * Module switch.battery-master: the battery master, a big red key on a yellow plate
 * (modular boats M3b). On the workboat it's low on the aft wall by the door, where the
 * engine-room switch is on a real boat, so you have to walk to it. A press turns it a
 * quarter turn; it throws 'electrical.master'. The existing MasterSwitch control does the
 * rest; its plate is merged with the boat's fixed parts.
 */
import { MasterSwitch } from '../../controls/batteryMaster';
import { busOf } from '../../modular/bus';
import type { ModuleDefinition } from '../../modular/module';

export const BATTERY_MASTER: ModuleDefinition<Record<string, never>> = {
  id: 'switch.battery-master',
  version: 1,
  fits: ['wall.panel'],
  defaults: {},
  ports: { master: { dir: 'write', key: 'electrical.master' } },
  view: {
    build({ keys, socket }) {
      const key = keys.master;
      const sw = new MasterSwitch(socket.id, { channel: key, read: (s) => busOf(s).num(key) });
      return { staticParts: [], movingParts: [], controls: [sw], update: () => {} };
    },
  },
};

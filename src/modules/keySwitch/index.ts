/**
 * Module control.key-switch: the ignition key in its lock (modular boats M3). A press turns
 * it on / off; it writes 'ignition.key'. The existing KeySwitch control does the rest.
 */
import { KeySwitch } from '../../controls/ignition';
import { busOf } from '../../modular/bus';
import type { ModuleDefinition } from '../../modular/module';

export const KEY_SWITCH: ModuleDefinition<{ engrave: string }> = {
  id: 'control.key-switch',
  version: 1,
  fits: ['panel.slot'],
  defaults: { engrave: 'KEY' },
  ports: { key: { dir: 'write', key: 'ignition.key' } },
  view: {
    build({ config, keys, socket }) {
      const key = keys.key;
      const sw = new KeySwitch(socket.id, { channel: key, read: (s) => busOf(s).num(key) });
      return { staticParts: [], movingParts: [], controls: [sw], labels: config.engrave ? [{ text: config.engrave, at: [0, 0, 0] }] : [], update: () => {} };
    },
  },
};

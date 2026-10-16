/**
 * Module switch.battery-selector: the battery selector, a knob pointing at 1, BOTH or 2
 * (modular boats M3b). A press steps it 1 -> BOTH -> 2 -> 1; it sets
 * 'electrical.selector' (3 = both). The existing SelectorSwitch control does the rest.
 */
import { SelectorSwitch } from '../../controls/ignition';
import { busOf } from '../../modular/bus';
import type { ModuleDefinition } from '../../modular/module';

export const BATTERY_SELECTOR: ModuleDefinition<Record<string, never>> = {
  id: 'switch.battery-selector',
  version: 1,
  fits: ['wall.panel'],
  defaults: {},
  ports: { selector: { dir: 'write', key: 'electrical.selector' } },
  view: {
    build({ keys, socket }) {
      const key = keys.selector;
      const sw = new SelectorSwitch(socket.id, { channel: key, read: (s) => busOf(s).num(key) });
      return { staticParts: [], movingParts: [], controls: [sw], update: () => {} };
    },
  },
};

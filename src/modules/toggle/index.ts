/**
 * Module control.toggle: a toggle switch (modular boats M3), two- or three-way. It throws
 * whatever key the recipe binds it to ("bind": { "value": "lights.nav" }); it has no
 * default, because which switch it is is the boat's business. The existing Toggle control
 * does the rest. Its engraved label lies just aft of it.
 */
import { Toggle } from '../../controls/Toggle';
import { busOf } from '../../modular/bus';
import type { ModuleDefinition } from '../../modular/module';

export interface ToggleConfig {
  /** Hover text. */
  label: string;
  /** Engraved under it on the panel ('' for none). */
  engrave: string;
  /** 2: off / on; 3: off / 1 / 2 (each press steps on). */
  positions: 2 | 3;
}

export const TOGGLE: ModuleDefinition<ToggleConfig> = {
  id: 'control.toggle',
  version: 1,
  fits: ['panel.slot'],
  defaults: { label: 'Switch', engrave: '', positions: 2 },
  validateConfig: (c) => (c.positions === 2 || c.positions === 3 ? [] : ['positions should be 2 or 3']),
  ports: { value: { dir: 'write' } },
  view: {
    build({ config, keys, socket }) {
      const key = keys.value;
      const toggle = new Toggle(socket.id, key, config.label, (s) => busOf(s).num(key), config.positions);
      return { staticParts: [], movingParts: [], controls: [toggle], labels: config.engrave ? [{ text: config.engrave, at: [0, 0, 0] }] : [], update: () => {} };
    },
  },
};

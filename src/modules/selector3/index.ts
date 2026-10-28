/**
 * Module control.selector3: a three-position rotary selector on a switch panel (owner, 28 Oct
 * 2026: the foiling ferry's ride height, LOW / NORM / HIGH). It sets whatever key the recipe
 * binds it to, 0, 1 or 2 ("bind": { "value": "foils.ride" }); the Selector3 control does the
 * rest. Its engraved name lies just aft of it, as a toggle's does.
 */
import { Selector3 } from '../../controls/Selector3';
import { busOf } from '../../modular/bus';
import type { ModuleDefinition } from '../../modular/module';

export interface Selector3Config {
  /** Hover text. */
  label: string;
  /** Engraved under it on the panel ('' for none). */
  engrave: string;
  /** What each position is called on its plate, left to right. */
  marks: [string, string, string];
}

export const SELECTOR3: ModuleDefinition<Selector3Config> = {
  id: 'control.selector3',
  version: 1,
  fits: ['panel.slot'],
  defaults: { label: 'Selector', engrave: '', marks: ['1', '2', '3'] },
  validateConfig: (c) => (c.marks.length === 3 ? [] : ['it needs three marks']),
  ports: { value: { dir: 'write' } },
  view: {
    build({ config, keys, socket }) {
      const key = keys.value;
      const knob = new Selector3(socket.id, key, config.label, (s) => busOf(s).num(key), config.marks);
      return { staticParts: [], movingParts: [], controls: [knob], labels: config.engrave ? [{ text: config.engrave, at: [0, 0, 0] }] : [], update: () => {} };
    },
  },
};

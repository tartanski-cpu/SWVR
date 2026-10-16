/**
 * Module control.push-button: a push button (modular boats M3). 'momentary' sends 1 while
 * held and 0 on release (the horn, HEAT, START); 'pulse' sends a single 1 per press. It
 * presses whatever key the recipe binds ("bind": { "press": "horn.sound" }). Optionally its
 * cap glows while a key has a value (START: while the engine runs).
 */
import { Button } from '../../controls/Button';
import { busOf, resolveKey } from '../../modular/bus';
import type { ModuleDefinition } from '../../modular/module';
import { colourOf } from '../../modular/palette';
import type { VesselState } from '../../vessel/vesselState';

export interface PushButtonConfig {
  label: string;
  engrave: string;
  mode: 'momentary' | 'pulse';
  /** Cap colour: 0x3aa04a, or '#3aa04a' in a recipe. */
  color: number | string;
  /** Glow while `key` has the value `is` (default true). */
  lit?: { key: string; is?: number | string | boolean };
}

export const PUSH_BUTTON: ModuleDefinition<PushButtonConfig> = {
  id: 'control.push-button',
  version: 1,
  fits: ['panel.slot'],
  defaults: { label: 'Button', engrave: '', mode: 'momentary', color: 0xd0d0d0 },
  validateConfig: (c) => [
    ...(c.mode === 'momentary' || c.mode === 'pulse' ? [] : ["mode should be 'momentary' or 'pulse'"]),
    ...(c.lit && !resolveKey(c.lit.key) ? [`lit.key '${c.lit.key}' isn't a key`] : []),
  ],
  ports: { press: { dir: 'write' } },
  view: {
    build({ config, keys, socket, share }) {
      const litKey = config.lit ? resolveKey(config.lit.key) : null;
      const is = config.lit?.is ?? true;
      const litWhen = litKey ? (s: VesselState) => busOf(s).get(litKey) === is : undefined;
      const button = new Button(socket.id, keys.press, config.label, config.mode, colourOf(config.color, 0xd0d0d0), litWhen);
      // Drawn with every other module's button cap as one shared part (its colour and glow too).
      share(button.cap, 'buttonCap');
      return { staticParts: [], movingParts: [], controls: [button], labels: config.engrave ? [{ text: config.engrave, at: [0, 0, 0] }] : [], update: () => {} };
    },
  },
};

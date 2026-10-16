/**
 * Module control.wheel: the steering wheel (modular boats M3). Writes 'helm.demand'
 * (-1 hard to port .. +1 hard to starboard); whatever steers the boat reads it. Its plane's
 * tilt toward the helmsman is its slot's rotation. The existing Wheel control does the rest
 * (hand-over-hand, two hands, spoke ticks, the stops, multiplayer hold).
 */
import { CONFIG } from '../../config';
import { Wheel } from '../../controls/Wheel';
import { busOf } from '../../modular/bus';
import type { ModuleDefinition } from '../../modular/module';

export interface WheelConfig {
  radius: number;
  turnsLockToLock: number;
}

export const WHEEL: ModuleDefinition<WheelConfig> = {
  id: 'control.wheel',
  version: 1,
  fits: ['panel.slot'],
  defaults: { ...CONFIG.modules.wheel },
  validateConfig: (c) => [...(c.radius > 0.05 ? [] : ['radius should be over 0.05 m']), ...(c.turnsLockToLock > 0 ? [] : ['turnsLockToLock should be over 0'])],
  ports: { demand: { dir: 'write', key: 'helm.demand' } },
  view: {
    build({ config, keys, socket }) {
      const key = keys.demand;
      const wheel = new Wheel(socket.id, config, { channel: key, read: (s) => busOf(s).num(key) });
      return { staticParts: [], movingParts: [], controls: [wheel], update: () => {} };
    },
  },
};

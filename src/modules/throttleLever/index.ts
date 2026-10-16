/**
 * Module control.throttle-lever: the combined throttle / gear lever (modular boats M2, the
 * first module).
 *
 * It writes one thing to the bus: 'throttle.demand', -1 (full astern) .. 0 (neutral) .. +1
 * (full ahead). It doesn't know an engine exists: whatever propulsion the boat has reads
 * that key. A boat with two engines would give each lever its own key in her recipe
 * (`bind: { demand: ... }`).
 *
 * The control itself is the existing Lever (controls/Lever.ts): grab maths, the magnetic
 * neutral detent, desktop drag, multiplayer hold. It sends the bus key as its channel, and
 * reads its position back through the bus. Its quadrant base is a fixed part, baked into
 * the bridge's one merged mesh as before, so the lever costs exactly the draw calls it did.
 *
 * No simulation half: a lever only has a position, and that is on the bus.
 */
import { CONFIG } from '../../config';
import { Lever } from '../../controls/Lever';
import { busOf } from '../../modular/bus';
import type { ModuleDefinition } from '../../modular/module';

export interface ThrottleLeverConfig {
  /** Travel either side of upright (deg). */
  maxAngleDeg: number;
  /** Pivot to knob (m). */
  length: number;
  /** The neutral notch, as a fraction of full travel either side. */
  detent: number;
  /** Engraved beside it ('' for none). */
  engrave: string;
}

export const THROTTLE_LEVER: ModuleDefinition<ThrottleLeverConfig> = {
  id: 'control.throttle-lever',
  version: 1,
  fits: ['panel.slot'],
  defaults: { ...CONFIG.modules.throttleLever },
  validateConfig: (c) => [
    ...(c.maxAngleDeg > 0 && c.maxAngleDeg <= 80 ? [] : ['maxAngleDeg should be between 0 and 80']),
    ...(c.length > 0 ? [] : ['length should be more than 0']),
    ...(c.detent >= 0 && c.detent < 0.5 ? [] : ['detent should be between 0 and 0.5']),
  ],
  ports: { demand: { dir: 'write', key: 'throttle.demand' } },
  view: {
    build(ctx) {
      const key = ctx.keys.demand;
      // Its id stays 'lever': the interaction system, the desktop hand and the wheelhouse's
      // hide-from-outside rule know the throttle by it.
      const lever = new Lever('lever', ctx.config, ctx.config.detent, { channel: key, read: (s) => busOf(s).num(key) });
      return { staticParts: [], movingParts: [], controls: [lever], labels: ctx.config.engrave ? [{ text: ctx.config.engrave, at: [0, 0, 0] }] : [], update: () => {} };
    },
  },
};

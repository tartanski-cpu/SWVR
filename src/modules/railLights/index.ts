/**
 * Module light.rail: LED strips along the inside of the bulwark tops and across the
 * transom (modular boats M6c), switched from the overhead panel ('lights.rail') on the
 * deck lights' breaker. Glow only, no real light: they mark the deck edge at night for
 * next to nothing (one draw call). Drawn in the boat's axes, following her deck edge
 * (vessel/view/deckLights.ts). They draw 1 A while on.
 */
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';
import { RailLights } from '../../vessel/view/deckLights';
import { BREAKERS, type BreakerName } from '../../vessel/vesselState';

export interface RailLightsConfig {
  /** Their glow when on (RGB hex). */
  color: number;
  amps: number;
  circuit: BreakerName;
}

export const RAIL_LIGHTS: ModuleDefinition<RailLightsConfig> = {
  id: 'light.rail',
  version: 1,
  fits: ['hull.light'],
  defaults: { color: CONFIG.vessels.workboat.deckLights.railColor, amps: 1, circuit: 'deckLights' },
  validateConfig: (c) => [
    ...(c.amps >= 0 ? [] : ['amps should be 0 or more']),
    ...((BREAKERS as readonly string[]).includes(c.circuit) ? [] : [`'${c.circuit}' isn't a circuit (${BREAKERS.join(', ')})`]),
  ],
  ports: {
    on: { dir: 'read', key: 'lights.rail' },
    live: { dir: 'read', key: 'circuit.deckLights.live' },
  },
  needs: (c) => [{ power: 'electrical', circuit: c.circuit }],
  power: (c) => [{ role: 'load', circuit: c.circuit, amps: (io) => (io.num('on') > 0 ? c.amps : 0) }],
  view: {
    frame: 'boat',
    build({ config, keys, hull }) {
      const rail = new RailLights(hull, config.color);
      return {
        staticParts: [],
        movingParts: [rail.root],
        controls: [],
        update: (read) => rail.update(read.num(keys.on) > 0 && !!read.get(keys.live)),
      };
    },
  },
};

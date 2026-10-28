/**
 * Module light.navigation: the navigation lights (modular boats M6c): masthead light,
 * sidelights and stern light, worked as one set by the NAV LIGHTS switch ('lights.nav') on
 * its own breaker. Mounted on the mast's masthead socket; the sidelights and the stern
 * light stand where its config puts them (the boat's axes: they're wired with the set, not
 * hung on the mast). Drawn by vessel/view/navLights.ts: each glow shows only inside its
 * arc of visibility from where you are, brighter at night. It draws 2 A while on.
 *
 * Without a mast to hang on (the landing craft, Shipyard designs), `mast` gives the masthead
 * light its own pole from the roof (`footY`) up to it (CONFIG.modules.lightMast).
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { part } from '../../render/geometryUtils';
import type { ModuleDefinition } from '../../modular/module';
import { NavLightsView } from '../../vessel/view/navLights';
import { BREAKERS, type BreakerName } from '../../vessel/vesselState';

export interface NavLightsConfig {
  /** Each lamp, the boat's axes. */
  lights: typeof CONFIG.vessels.workboat.navLights;
  amps: number;
  circuit: BreakerName;
  /** A pole under the masthead light, standing at height `footY` (the roof's top). */
  mast?: { footY: number };
}

export const NAV_LIGHTS: ModuleDefinition<NavLightsConfig> = {
  id: 'light.navigation',
  version: 1,
  fits: ['hull.light'],
  defaults: { lights: CONFIG.vessels.workboat.navLights, amps: 2, circuit: 'navLights' },
  validateConfig: (c) => [
    ...(c.amps >= 0 ? [] : ['amps should be 0 or more']),
    ...((BREAKERS as readonly string[]).includes(c.circuit) ? [] : [`'${c.circuit}' isn't a circuit (${BREAKERS.join(', ')})`]),
  ],
  ports: {
    on: { dir: 'read', key: 'lights.nav' },
    live: { dir: 'read', key: 'circuit.navLights.live' },
  },
  // On top of the masthead light (its housing is 9 cm tall): the masthead wind vane's place.
  sockets: (c) => {
    const [x, y, z] = c.lights.masthead;
    return [{ id: 'vane', type: 'roof.mount', transform: { position: [x, y + 0.045, z] }, label: 'On top of the masthead light: the wind vane' }];
  },
  footprints: (c) => {
    if (!c.mast) return [];
    const [x, y, z] = c.lights.masthead;
    const k = CONFIG.modules.lightMast.keepClear;
    return [{ x0: x - k, x1: x + k, z0: z - k, z1: z + k, base: c.mast.footY, top: y }];
  },
  needs: (c) => [{ power: 'electrical', circuit: c.circuit }],
  power: (c) => [{ role: 'load', circuit: c.circuit, amps: (io) => (io.num('on') > 0 ? c.amps : 0) }],
  view: {
    frame: 'boat',
    build({ config, keys }) {
      const lights = new NavLightsView(config.lights);
      const staticParts: THREE.BufferGeometry[] = [];
      if (config.mast) {
        // The pole, from the roof to the masthead lamp's foot (its housing is 9 cm tall).
        const [x, y, z] = config.lights.masthead;
        const s = CONFIG.modules.lightMast.size;
        const top = y - 0.045;
        staticParts.push(part(new THREE.BoxGeometry(s, top - config.mast.footY, s).translate(x, (top + config.mast.footY) / 2, z), 0x3a3f44));
      }
      return {
        staticParts,
        movingParts: [lights.root],
        controls: [],
        update: (read, _s, _dt, frame) => lights.update(read.num(keys.on) > 0 && !!read.get(keys.live), frame.darkness, frame.viewer),
      };
    },
  },
};

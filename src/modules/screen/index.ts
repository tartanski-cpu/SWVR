/**
 * Module instrument.screen: one screen on the boat's shared display atlas (modular boats
 * M3): speed and echo sounder, heading, rpm, rudder, the engine monitor, or NAV / WIND
 * (controls/instruments.ts SCREENS). All of a boat's screens share one texture and one draw
 * call; this module only says which screen, where, and how it's mounted (its size, full, a
 * strip or a quarter, is the screen's own: instruments.ts `cells`):
 *   dash  on a dash face, tilted back, standing just proud of it
 *   hung  under the roof on a bracket, face tilted down toward the helm, in a housing
 * (CONFIG.modules.screen has each mount's size and tilt; a recipe may override them.)
 * Without 12 V on the Instruments circuit it goes black.
 *
 * Until the engine is a module (M4) a screen's painter reads the boat's state directly.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { cellsOf, SCREENS, type ScreenName } from '../../controls/instruments';
import type { ModuleDefinition } from '../../modular/module';
import { part } from '../../render/geometryUtils';

export interface ScreenConfig {
  screen: ScreenName;
  mount: 'dash' | 'hung';
  /** Overrides of the mount's defaults (m, deg). */
  width?: number;
  height?: number;
  tiltDeg?: number;
  bracket?: number;
}

export const SCREEN: ModuleDefinition<ScreenConfig> = {
  id: 'instrument.screen',
  version: 1,
  fits: ['panel.slot', 'cabin.overhead'],
  defaults: { screen: 'speed', mount: 'dash' },
  validateConfig: (c) => [
    ...(c.screen in SCREENS ? [] : [`screen should be one of ${Object.keys(SCREENS).join(', ')}`]),
    ...(c.mount === 'dash' || c.mount === 'hung' ? [] : ["mount should be 'dash' or 'hung'"]),
  ],
  needs: () => [{ power: 'electrical', circuit: 'instruments' }],
  ports: {},
  view: {
    build({ config, display }) {
      const d = config.mount === 'hung' ? CONFIG.modules.screen.hung : CONFIG.modules.screen.dash;
      // A strip or a quarter screen (instruments.ts: in quarter cells) is that part of a full one.
      const [cw, ch] = cellsOf(SCREENS[config.screen]);
      const w = config.width ?? (d.width * cw) / 2;
      const h = config.height ?? (d.height * ch) / 2;
      const tilt = ((config.tiltDeg ?? d.tiltDeg) * Math.PI) / 180;
      const staticParts: THREE.BufferGeometry[] = [];
      let plane: THREE.BufferGeometry;
      if (config.mount === 'dash') {
        // Tilted back, the screen's top edge leans toward the dash: stand it off the face
        // far enough that the whole screen stays in front of it.
        plane = new THREE.PlaneGeometry(w, h).rotateX(-tilt).translate(0, 0, 0.006 + (h / 2) * Math.sin(tilt));
      } else {
        const bracket = config.bracket ?? CONFIG.modules.screen.hung.bracket;
        plane = new THREE.PlaneGeometry(w, h).rotateX(tilt);
        staticParts.push(part(new THREE.BoxGeometry(w + 0.04, h + 0.04, 0.05).translate(0, 0, -0.03).rotateX(tilt), 0x1a1d1c));
        staticParts.push(part(new THREE.BoxGeometry(0.04, bracket, 0.04).translate(0, bracket / 2, -0.06), 0x2a2d2c));
      }
      display(SCREENS[config.screen], plane, 'instruments');
      return { staticParts, movingParts: [], controls: [], update: () => {} };
    },
  },
};

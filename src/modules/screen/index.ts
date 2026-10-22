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
 * The advanced touchscreen (`screen: 'touch'`; CS5) is made here with this boat's `pages`, and
 * its tabs are press targets on the glass (controls/TouchTab.ts) that send its `channel`.
 *
 * Until the engine is a module (M4) a screen's painter reads the boat's state directly.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { cellsOf, SCREENS, touchScreen, touchTabs, TOUCH_BAR, TOUCH_PAGES, TOUCH_TABS, type ScreenName, type TouchPage } from '../../controls/instruments';
import { TouchTab } from '../../controls/TouchTab';
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
  /**
   * Up (+) or down along the dash's face from its slot (m; dash mount): two half-height screens
   * stacked in one full screen's place (owner, Oct 2026: "use the space above as well").
   */
  rise?: number;
  /** A touchscreen's pages, in tab order (instruments.ts TOUCH_PAGES), its channel and its first page (CS5). */
  pages?: TouchPage[];
  /**
   * Dash mount, on a dash whose face leans back as the screen does (console.standard `leanDeg`):
   * how far the face at its slot has leaned back from upright (m). The screen then lies flat on
   * the face, just proud of it, wherever it stands up or down it.
   */
  faceBack?: number;
  channel?: 'touchPage1' | 'touchPage2';
  first?: number;
}

export const SCREEN: ModuleDefinition<ScreenConfig> = {
  id: 'instrument.screen',
  version: 1,
  fits: ['panel.slot', 'cabin.overhead'],
  defaults: { screen: 'speed', mount: 'dash' },
  validateConfig: (c) => [
    ...(c.screen in SCREENS ? [] : [`screen should be one of ${Object.keys(SCREENS).join(', ')}`]),
    ...(c.mount === 'dash' || c.mount === 'hung' ? [] : ["mount should be 'dash' or 'hung'"]),
    ...((c.pages ?? []).every((pg) => (TOUCH_PAGES as readonly string[]).includes(pg)) ? [] : [`pages should be among ${TOUCH_PAGES.join(', ')}`]),
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
      // Where the glass is (the plane's turn and offset), for a touchscreen's tabs.
      const glass = new THREE.Matrix4();
      if (config.mount === 'dash') {
        // Tilted back, the screen's top edge leans toward the dash: stand it off the face
        // far enough that the whole screen stays in front of it.
        // (Raised along the tilted face: up, and back toward the dash as the face leans. The dash's
        // face is upright, so stand it off as if it were part of a screen centred on its slot and
        // reaching as far out as its own outer edge: that one's top edge just clears the face, and
        // stacked screens lie in the plane of a full one. Standing it off by its own height alone
        // put a raised quarter's top edge inside the dash, its top third hidden: CS4, Oct 2026.)
        const rise = config.rise ?? 0;
        const reach = h / 2 + Math.abs(rise);
        // (On a leaning face, `faceBack`: flat on it, 6 mm proud, its middle back by the lean at its height.)
        const off = config.faceBack !== undefined ? 0.006 - config.faceBack : 0.006 + reach * Math.sin(tilt);
        const lift = new THREE.Vector3(0, rise * Math.cos(tilt), off - rise * Math.sin(tilt));
        plane = new THREE.PlaneGeometry(w, h).rotateX(-tilt).translate(lift.x, lift.y, lift.z);
        glass.makeRotationX(-tilt).setPosition(lift);
      } else {
        const bracket = config.bracket ?? CONFIG.modules.screen.hung.bracket;
        plane = new THREE.PlaneGeometry(w, h).rotateX(tilt);
        glass.makeRotationX(tilt);
        staticParts.push(part(new THREE.BoxGeometry(w + 0.04, h + 0.04, 0.05).translate(0, 0, -0.03).rotateX(tilt), 0x1a1d1c));
        staticParts.push(part(new THREE.BoxGeometry(0.04, bracket, 0.04).translate(0, bracket / 2, -0.06), 0x2a2d2c));
      }
      if (config.screen !== 'touch') {
        display(SCREENS[config.screen], plane, 'instruments');
        return { staticParts, movingParts: [], controls: [], update: () => {} };
      }
      // A touchscreen: drawn with her pages, a press target over each tab it draws (the
      // screen's pixels, 512 x 256, to metres on its glass).
      const pages = config.pages ?? [...TOUCH_PAGES];
      const channel = config.channel ?? 'touchPage1';
      display(touchScreen(pages, channel, config.first ?? 0), plane, 'instruments');
      const toGlass = (px: number, py: number) => new THREE.Vector3((px / 512 - 0.5) * w, (0.5 - py / 256) * h, 0).applyMatrix4(glass);
      const turn = new THREE.Quaternion().setFromRotationMatrix(glass);
      const tabH = ((TOUCH_BAR.y1 - TOUCH_BAR.y0) / 256) * h;
      const controls = touchTabs(pages.length).map((t, i) => {
        const tab = new TouchTab(`${channel}.${pages[i]}`, channel, `Touchscreen: ${TOUCH_TABS[pages[i]]} page`, i, ((t.x1 - t.x0) / 512) * w, tabH);
        tab.root.position.copy(toGlass((t.x0 + t.x1) / 2, (TOUCH_BAR.y0 + TOUCH_BAR.y1) / 2));
        tab.root.quaternion.copy(turn);
        return tab;
      });
      return { staticParts, movingParts: [], controls, update: () => {} };
    },
  },
};

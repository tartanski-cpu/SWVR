/**
 * Module panel.overhead: the switch panel hung under the wheelhouse roof, above and ahead
 * of the helm (modular boats M3b). Like the console, it only holds things: its SLOTS take
 * switches (the deck lights) and the FM set, each another module. The switches hang upside
 * down from its face, pressed from below.
 *
 * Its box (from the roof down to its face) is a fixed part, merged with the boat's other fixed parts into
 * one draw call. Its legends are engraved on its underside, just aft of each control and
 * read from the helm looking up; they're drawn with the boat's other labels (one draw
 * call). Layout: CONFIG.modules.overheadPanel; its socket is the middle of its face.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { EngravedLabel, ModuleDefinition } from '../../modular/module';
import type { Socket } from '../../modular/socket';
import { part } from '../../render/geometryUtils';

export type OverheadPanelConfig = typeof CONFIG.modules.overheadPanel;

export const OVERHEAD_PANEL: ModuleDefinition<OverheadPanelConfig> = {
  id: 'panel.overhead',
  version: 1,
  fits: ['cabin.overhead'],
  defaults: CONFIG.modules.overheadPanel,
  validateConfig: (c) => [...(c.drop > 0 ? [] : ['drop should be more than 0']), ...(c.width > 0 && c.depth > 0 ? [] : ['width and depth should be more than 0'])],
  ports: {},
  sockets: (c) =>
    Object.entries(c.slots).map(([id, s]): Socket => ({
      id,
      type: 'panel.slot',
      // Upside down: the switch's "up" points at the floor.
      transform: { position: [s.x, 0, 0], rotationDeg: s.hang ? [180, 0, 0] : [0, 0, 0] },
    })),
  view: {
    build({ config: c }) {
      const body = part(new THREE.BoxGeometry(c.width, c.drop, c.depth).translate(0, c.drop / 2, 0), 0x2a2f33);
      const labels: EngravedLabel[] = c.legends.map((l) => ({ text: l.text, at: [l.x, 0, 0], underside: true, size: c.legend.size, offset: c.legend.offset }));
      return { staticParts: [body], movingParts: [], controls: [], labels, update: () => {} };
    },
  },
};

/**
 * Module console.standard: the helm console's dash, pedestals and group plates, and its
 * SLOTS, where controls and screens go (modular boats M3). The console itself only stands
 * there: everything you touch or read is another module in one of its slots, so a boat's
 * bridge layout is a sub-recipe (the console, and what goes in which slot).
 *
 * Its fixed parts (the dash box, the pedestals, the plates with their coloured strips) are
 * merged with the bridge's into one draw call. Positions are from its socket: the console's
 * top, on the centreline, at its aft face (CONFIG.modules.helmConsole).
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';
import { LABEL_OFFSET } from '../../modular/module';
import type { Socket } from '../../modular/socket';
import { part } from '../../render/geometryUtils';

export type ConsoleConfig = typeof CONFIG.modules.helmConsole;

const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: number) => part(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);

export const CONSOLE: ModuleDefinition<ConsoleConfig> = {
  id: 'console.standard',
  version: 1,
  fits: ['helm.console'],
  defaults: CONFIG.modules.helmConsole,
  ports: {},
  sockets: (c) =>
    Object.entries(c.slots).map(([id, s]): Socket => ({ id, type: 'panel.slot', transform: { position: s.position, rotationDeg: s.rotationDeg } })),
  view: {
    build({ config: c }) {
      const d = c.dash;
      const staticParts = [box(d.halfWidth * 2, d.top - d.bottom, d.aft - d.front, 0, (d.top + d.bottom) / 2, (d.front + d.aft) / 2, 0x30363b)];
      // Pedestals: from the console top down to the floor, jutting aft under the throttle
      // and the joysticks.
      const p = c.pedestals;
      for (const x of p.x) staticParts.push(box(p.halfWidth * 2, -p.floor, p.aft - p.front, x, p.floor / 2, (p.aft + p.front) / 2, 0x3c4248));
      // Group plates under the switch row, a coloured strip along the forward edge of each,
      // its title on the strip.
      const top = 0.005;
      const labels = [];
      for (const g of c.groups) {
        const [x0, x1] = g.x;
        staticParts.push(box(x1 - x0, 0.004, c.plates.aft - c.plates.front, (x0 + x1) / 2, top + 0.002, (c.plates.front + c.plates.aft) / 2, 0x3b434a));
        staticParts.push(box(x1 - x0, 0.005, 0.028, (x0 + x1) / 2, top + 0.0025, c.plates.front + 0.014, g.color));
        labels.push({ text: g.title, at: [(x0 + x1) / 2, top + 0.004, c.plates.front + 0.014 - LABEL_OFFSET] as const, title: true });
      }
      // The middle of the dash's face: the app measures how far you are from the screens.
      const dashAnchor = new THREE.Object3D();
      dashAnchor.name = 'dashAnchor';
      dashAnchor.position.set(0, (d.top + d.bottom) / 2, d.aft);
      return { staticParts, movingParts: [dashAnchor], controls: [], labels, update: () => {} };
    },
  },
};

/**
 * Module deck.stern-roller: the stern roller in the notch of the transom bulwark, on the
 * centreline (modular boats M5a): a steel roller across the notch that the towline runs
 * over, between two upright cheeks, on a short plate closing the notch below. It gives the
 * boat her tow point: the top of the roller, where the tow's pull acts on her.
 *
 * Drawn in the boat's axes from the hull's transom and deck (its config is the fairlead's,
 * CONFIG.tow.fairlead, and the notch's width); merged with the boat's fixed parts.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { HullQueries, ModuleDefinition } from '../../modular/module';
import { part } from '../../render/geometryUtils';

export interface SternRollerConfig {
  /** The roller's top: `inset` forward of the transom, `height` over the deck there (m). */
  inset: number;
  height: number;
  rollerRadius: number;
  /** The notch's width (m). */
  gap: number;
}

/** The top of the roller (the boat's axes). */
export function towPointOf(c: SternRollerConfig, hull: HullQueries): [number, number, number] {
  const z = hull.transom - c.inset;
  return [0, hull.deckY(z) + c.height, z];
}

export const STERN_ROLLER: ModuleDefinition<SternRollerConfig> = {
  id: 'deck.stern-roller',
  version: 1,
  fits: ['stern.gantry'],
  defaults: { ...CONFIG.tow.fairlead, gap: CONFIG.vessels.workboat.layout.fairleadGap },
  validateConfig: (c) => (c.gap > 2 * 0.04 + 0.05 ? [] : ['the notch is too narrow for the roller']),
  ports: {},
  provides: () => [{ gear: 'towPoint' }],
  gear: (c, hull) => ({ towPoint: { point: towPointOf(c, hull) } }),
  view: {
    frame: 'boat',
    build({ config: c, hull }) {
      const [, y, z] = towPointOf(c, hull);
      const deck = hull.deckY(z);
      const half = c.gap / 2;
      const r = c.rollerRadius;
      const axle = y - r;
      const zc = hull.transom - 0.03; // in the bulwark's line
      const top = hull.bulwarkTop(z) + 0.04;
      const box = (x0: number, x1: number, y0: number, y1: number, d: number, col: number) => part(new THREE.BoxGeometry(x1 - x0, y1 - y0, d).translate((x0 + x1) / 2, (y0 + y1) / 2, zc), col);
      return {
        staticParts: [
          box(-half, half, deck, axle - r * 0.5, 0.05, 0x3a3f44), // the plate closing the notch below the roller
          box(-half, -half + 0.04, deck, top, 0.1, 0x3a3f44), // the cheeks
          box(half - 0.04, half, deck, top, 0.1, 0x3a3f44),
          part(new THREE.CylinderGeometry(r, r, 2 * half - 0.08, 12).rotateZ(Math.PI / 2).translate(0, axle, zc), 0x9aa0a6), // the roller
        ],
        movingParts: [],
        controls: [],
        update: () => {},
      };
    },
  },
};

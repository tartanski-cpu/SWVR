/**
 * Module deck.bow-staple: a tug's towing staple at her bow (owner, Oct 2026: the harbour tug
 * "tows over the bow"). A tug that tows over her bow leads the towline from the winch on her
 * foredeck forward through a staple on her stem: two heavy steel posts with a roller across
 * their tops, standing on the bulwark's capping on her centreline. It gives the boat her tow
 * point: the top of the roller, where the tow's pull acts on her (as a stern roller's does
 * aft, modules/sternRoller).
 *
 * Drawn in the boat's axes at its socket (the foredeck at her stem); merged with the boat's
 * fixed parts.
 */
import * as THREE from 'three';
import type { ModuleDefinition } from '../../modular/module';
import { part } from '../../render/geometryUtils';

export interface BowStapleConfig {
  /** The roller's top over the deck (m): just over her bulwark there. */
  height: number;
  /** Half the gap between the posts (m). */
  halfGap: number;
}

const STEEL = 0x3a3f44;
const ROLLER = 0xb8bcbe;

export const BOW_STAPLE: ModuleDefinition<BowStapleConfig> = {
  id: 'deck.bow-staple',
  version: 1,
  fits: ['deck.equipment'],
  defaults: { height: 1.3, halfGap: 0.25 },
  validateConfig: (c) => [...(c.height > 0.3 ? [] : ['the bow staple is too low']), ...(c.halfGap > 0.1 ? [] : ['the bow staple is too narrow for a towline'])],
  ports: {},
  provides: () => [{ gear: 'towPoint' }],
  // (The socket stands on the deck at her stem: its position is the deck there.)
  gear: (c, _hull, at) => ({ towPoint: { point: at([0, c.height, 0]) } }),
  view: {
    frame: 'socket',
    build({ config: c }) {
      const r = 0.09;
      const parts = [
        ...[-1, 1].map((s) => part(new THREE.BoxGeometry(0.2, c.height + 0.15, 0.24).translate(s * (c.halfGap + 0.1), (c.height + 0.15) / 2, 0), STEEL)),
        part(new THREE.CylinderGeometry(r, r, 2 * c.halfGap, 10).rotateZ(Math.PI / 2).translate(0, c.height - r, 0), ROLLER),
      ];
      return { staticParts: parts, movingParts: [], controls: [], update: () => {} };
    },
  },
};

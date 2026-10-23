/**
 * Module deck.stern-roller: the stern roller in the notch of the transom bulwark, on the
 * centreline (modular boats M5a): a steel roller across the notch that the towline runs
 * over, between two upright cheeks, on a short plate closing the notch below. It gives the
 * boat her tow point: the top of the roller, where the tow's pull acts on her.
 *
 * Drawn in the boat's axes, at its socket's z (the transom on the workboat: her hull leaves
 * a notch in the transom bulwark for it, `layout.fairleadGap`) on the centreline, at the
 * hull's deck height there (its config is the fairlead's, CONFIG.tow.fairlead, and the
 * notch's width); merged with the boat's fixed parts.
 *
 * On a tug (`hook`; shipyard/parts/deckGear.ts, CONFIG.shipyard.deckGear.tug) her tow point is
 * a towing hook near amidships instead: a pedestal on the centreline with the hook on its top,
 * drawn here too. The line runs from it aft over the deck and through the roller's notch.
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
  /** A tug's towing hook: her tow point instead of the roller (z: boat axes; height: its top over the deck there, m). */
  hook?: { z: number; height: number } | null;
}

/** Her tow point (the boat's axes): a tug's hook, else the top of the roller, its stern line (its socket's z) at `sternZ`. */
export function towPointOf(c: SternRollerConfig, hull: HullQueries, sternZ: number): [number, number, number] {
  if (c.hook) return [0, hull.deckY(c.hook.z) + c.hook.height, c.hook.z];
  const z = sternZ - c.inset;
  return [0, hull.deckY(z) + c.height, z];
}

/**
 * A tug's towing hook: a round pedestal from the deck up to just under the top, a swivel
 * head, and the hook itself (open, pointing aft) on its top, where the line's eye goes.
 */
function towHookParts(h: { z: number; height: number }, hull: HullQueries): THREE.BufferGeometry[] {
  const f = CONFIG.shipyard.deckGear.tug.hook;
  const deck = hull.deckY(h.z);
  const top = deck + h.height;
  const steel = 0x3a3f44;
  const hookCol = 0xd8a020;
  return [
    part(new THREE.CylinderGeometry(f.postRadius, f.postRadius * 1.4, h.height - 0.18, 12).translate(0, deck + (h.height - 0.18) / 2, h.z), steel),
    part(new THREE.CylinderGeometry(f.postRadius * 1.25, f.postRadius * 1.25, 0.1, 12).translate(0, top - 0.13, h.z), steel),
    // The hook: a bar aft from the swivel and a half ring curling up at its end.
    part(new THREE.BoxGeometry(0.06, 0.06, 0.22).translate(0, top - 0.05, h.z + 0.11), hookCol),
    part(new THREE.TorusGeometry(0.07, 0.025, 6, 10, Math.PI).rotateY(Math.PI / 2).translate(0, top - 0.05 + 0.07, h.z + 0.22), hookCol),
  ];
}

export const STERN_ROLLER: ModuleDefinition<SternRollerConfig> = {
  id: 'deck.stern-roller',
  version: 1,
  fits: ['stern.gantry'],
  defaults: { ...CONFIG.tow.fairlead, gap: CONFIG.vessels.workboat.layout.fairleadGap, hook: null },
  validateConfig: (c) => (c.gap > 2 * 0.04 + 0.05 ? [] : ['the notch is too narrow for the roller']),
  ports: {},
  provides: () => [{ gear: 'towPoint' }],
  gear: (c, hull, at) => ({ towPoint: { point: towPointOf(c, hull, at([0, 0, 0])[2]), ...(c.hook ? { stern: towPointOf({ ...c, hook: null }, hull, at([0, 0, 0])[2]) } : {}) } }),
  view: {
    frame: 'boat',
    build({ config: c, hull, socket }) {
      const sternZ = socket.transform.position[2];
      const z = sternZ - c.inset;
      const y = hull.deckY(z) + c.height;
      const deck = hull.deckY(z);
      const half = c.gap / 2;
      const r = c.rollerRadius;
      const axle = y - r;
      const zc = sternZ - 0.03; // in the bulwark's line
      const top = hull.bulwarkTop(z) + 0.04;
      const box = (x0: number, x1: number, y0: number, y1: number, d: number, col: number) => part(new THREE.BoxGeometry(x1 - x0, y1 - y0, d).translate((x0 + x1) / 2, (y0 + y1) / 2, zc), col);
      return {
        staticParts: [
          box(-half, half, deck, axle - r * 0.5, 0.05, 0x3a3f44), // the plate closing the notch below the roller
          box(-half, -half + 0.04, deck, top, 0.1, 0x3a3f44), // the cheeks
          box(half - 0.04, half, deck, top, 0.1, 0x3a3f44),
          part(new THREE.CylinderGeometry(r, r, 2 * half - 0.08, 12).rotateZ(Math.PI / 2).translate(0, axle, zc), 0x9aa0a6), // the roller
          ...(c.hook ? towHookParts(c.hook, hull) : []),
        ],
        movingParts: [],
        controls: [],
        update: () => {},
      };
    },
  },
};

/**
 * Module deck.trawl-winches: a split pair of trawl winches (owner, Oct 2026: step 2 toward a
 * trawler, "the trawl deck gear"), one each side at the deck edge forward of the A-frame's
 * feet, each a drum of warp with its hydraulic motor outboard. The warps lead aft off their
 * tops to the A-frame's blocks (fishing/trawlView.ts draws them), so a boat with them trawls
 * without a tow winch. The drums turn and their warp runs off as the net is shot, back on as
 * it's hauled ('trawl.warpOut', worked out by fishing.ts). CONFIG.modules.trawlWinches.
 *
 * Drawn in the boat's axes (deck gear standing where the Shipyard put it): its config holds
 * the starboard winch's place (`x`, `z` and the deck's height `deck` there); the port one is
 * its mirror. Bases and motors merged with her fixed parts; the two drums and their warp one
 * moving part each side, turned and the warp's roll scaled when it changes.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { TickSmoother } from '../../mechanisms/tickSmoother';
import type { GearFootprint, ModuleDefinition } from '../../modular/module';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';

export type TrawlWinchesConfig = typeof CONFIG.modules.trawlWinches & { x: number; z: number; deck: number };

export const TRAWL_WINCHES: ModuleDefinition<TrawlWinchesConfig> = {
  id: 'deck.trawl-winches',
  version: 1,
  fits: ['deck.equipment'],
  defaults: { ...CONFIG.modules.trawlWinches, x: 1.5, z: 3, deck: 1 },
  validateConfig: (c) => (c.x > 0.3 && c.fullRadius < c.flange ? [] : ['the starboard winch out to starboard, its warp within its flanges']),
  ports: { warp: { dir: 'read', key: 'trawl.warpOut', required: false } },
  needs: () => [{ power: 'hydraulic' }],
  provides: () => [{ gear: 'trawlWinches' }],
  // Where the starboard warp leaves its drum: the top, aft (port is -x).
  gear: (c) => ({ trawlWinches: { lead: [c.x, c.deck + c.axleHeight + c.fullRadius, c.z + 0.05] } }),
  footprints: (c): GearFootprint[] =>
    [-1, 1].map((s) => {
      const [a, b] = [s * c.x - c.base.width / 2, s * c.x + c.base.width / 2];
      return { x0: a, x1: b, z0: c.z - c.base.length / 2, z1: c.z + c.base.length / 2, base: c.deck, top: c.deck + c.axleHeight + c.flange };
    }),
  view: {
    frame: 'boat',
    build({ config: c, keys }) {
      const col = c.colours;
      const half = c.drumWidth / 2;
      const fixed: THREE.BufferGeometry[] = [];
      const drums: THREE.Group[] = [];
      const rolls: THREE.Mesh[] = [];
      for (const s of [-1, 1]) {
        const x = s * c.x;
        // A base on the deck, two cheeks carrying the axle, the motor on the outboard cheek.
        fixed.push(part(new THREE.BoxGeometry(c.base.width, 0.06, c.base.length).translate(x, c.deck + 0.03, c.z), col.frame));
        for (const k of [-1, 1]) fixed.push(part(new THREE.BoxGeometry(0.05, c.axleHeight + 0.08, 0.3).translate(x + k * (half + 0.045), c.deck + (c.axleHeight + 0.08) / 2, c.z), col.frame));
        fixed.push(part(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 12).rotateZ(Math.PI / 2).translate(x + s * (half + 0.14), c.deck + c.axleHeight, c.z), col.motor));
        // The drum: core and flanges (a bar across each so you see it turn), and its roll of warp.
        const drum = new THREE.Group();
        drum.position.set(x, c.deck + c.axleHeight, c.z);
        const g: THREE.BufferGeometry[] = [part(new THREE.CylinderGeometry(c.drumRadius, c.drumRadius, 2 * half, 12).rotateZ(Math.PI / 2), col.frame)];
        for (const k of [-1, 1]) {
          g.push(part(new THREE.CylinderGeometry(c.flange, c.flange, 0.02, 16).rotateZ(Math.PI / 2).translate(k * half, 0, 0), col.frame));
          g.push(part(new THREE.BoxGeometry(0.025, 2 * c.flange - 0.03, 0.04).translate(k * (half + 0.015), 0, 0), 0x1d4a7a));
        }
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2 * half - 0.03, 14).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: col.warp }));
        drum.add(new THREE.Mesh(mergeParts(g), flatVertexColorMaterial()), roll);
        drums.push(drum);
        rolls.push(roll);
      }
      let shown = -1;
      const smooth = new TickSmoother([0.5]);
      const show = (out: number) => {
        // The warp's roll: full in, the core bare all out.
        const r = Math.sqrt(c.drumRadius ** 2 + (1 - out) * (c.fullRadius ** 2 - c.drumRadius ** 2));
        for (const roll of rolls) roll.scale.set(1, r, r);
        // Turned by the warp running off or on (`turns` from full to empty).
        if (shown >= 0) for (const d of drums) d.rotation.x -= (out - shown) * c.turns * 2 * Math.PI;
        shown = out;
      };
      show(0);
      return {
        staticParts: fixed,
        movingParts: drums,
        controls: [],
        update: (read, _s, dt) => {
          // (Drawn smoothly between the simulation's ticks: mechanisms/tickSmoother.ts.)
          const out = smooth.update([keys.warp ? read.num(keys.warp) : 0], dt)[0];
          if (out !== shown) show(out);
        },
      };
    },
  },
};

/**
 * Module deck.net-drum: the trawl net wound on a hydraulic drum (owner, Oct 2026: step 2
 * toward a trawler, "the trawl deck gear"). On the centreline forward of the A-frame, its axle
 * across her on two stands, the net leading aft off its top over the stern. As the net is shot
 * it comes off the drum, as it's hauled up the stern it's wound back on, and the drum turns
 * with it; the roll of net on it grows and shrinks ('trawl.netOnDrum', worked out by fishing.ts).
 * Its hydraulic motor is on the starboard stand. CONFIG.modules.netDrum.
 *
 * Its socket is on deck under the middle of its axle; it draws from there (x across, z aft).
 * The stands and motor are merged with her fixed parts; the drum and its roll of net are one
 * moving part, turned and the roll scaled each frame it changes.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { TickSmoother } from '../../mechanisms/tickSmoother';
import type { GearFootprint, ModuleDefinition } from '../../modular/module';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';

export type NetDrumConfig = typeof CONFIG.modules.netDrum;

/** Its plan from its socket (x across, z aft): the stands and the drum's flanges, and room to stand round it. */
const planOf = (c: NetDrumConfig) => ({ x0: -c.length / 2 - c.stand - 0.2, x1: c.length / 2 + c.stand + 0.3, z0: -c.flange - 0.05, z1: c.flange + 0.05 });

export const NET_DRUM: ModuleDefinition<NetDrumConfig> = {
  id: 'deck.net-drum',
  version: 1,
  fits: ['deck.equipment'],
  defaults: CONFIG.modules.netDrum,
  validateConfig: (c) => (c.flange > c.core && c.fullRadius <= c.flange && c.length > 0.3 ? [] : ['a drum with flanges bigger than its core, the net within them']),
  ports: { net: { dir: 'read', key: 'trawl.netOnDrum', required: false } },
  needs: () => [{ power: 'hydraulic' }],
  provides: () => [{ gear: 'netDrum' }],
  // Where the net leads off it: the top of a full roll, aft (her axes).
  gear: (c, _hull, at) => ({ netDrum: { lead: at([0, c.axleHeight + c.fullRadius, 0]) } }),
  footprints: (c): GearFootprint[] => [{ ...planOf(c), base: 0, top: c.axleHeight + c.flange }],
  view: {
    build({ config: c, keys }) {
      const col = c.colours;
      const [L, h] = [c.length / 2, c.axleHeight];
      // Two stands, a cross-member low between them, and the motor on the starboard one.
      const fixed: THREE.BufferGeometry[] = [];
      for (const s of [-1, 1]) {
        const x = s * (L + c.stand / 2 + 0.02);
        fixed.push(part(new THREE.BoxGeometry(c.stand, h, 0.36).translate(x, h / 2, 0), col.frame));
        fixed.push(part(new THREE.BoxGeometry(c.stand + 0.08, 0.04, 0.5).translate(x, 0.02, 0), col.frame));
      }
      fixed.push(part(new THREE.BoxGeometry(2 * L, 0.08, 0.12).translate(0, 0.1, 0.28), col.frame));
      fixed.push(part(new THREE.CylinderGeometry(0.11, 0.11, 0.22, 12).rotateZ(Math.PI / 2).translate(L + c.stand + 0.13, h, 0), col.motor));
      // The drum, turning on its axle: the core and flanges (spokes so you see it turn), and the roll of net.
      const drum = new THREE.Group();
      drum.position.set(0, h, 0);
      const spokes: THREE.BufferGeometry[] = [part(new THREE.CylinderGeometry(c.core, c.core, 2 * L, 16).rotateZ(Math.PI / 2), col.frame)];
      for (const s of [-1, 1]) {
        spokes.push(part(new THREE.CylinderGeometry(c.flange, c.flange, 0.03, 20).rotateZ(Math.PI / 2).translate(s * L, 0, 0), col.flange));
        for (let k = 0; k < 3; k++) spokes.push(part(new THREE.BoxGeometry(0.035, 2 * c.flange - 0.04, 0.05).rotateX((k * Math.PI) / 3).translate(s * (L + 0.02), 0, 0), 0x1d4a7a));
      }
      const frame = new THREE.Mesh(mergeParts(spokes), flatVertexColorMaterial());
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2 * L - 0.04, 16).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: col.net, flatShading: true }));
      drum.add(frame, roll);
      let shown = -1;
      const smooth = new TickSmoother([0.5]);
      const show = (net: number) => {
        // The roll's radius from the net's volume on it (an annulus: r² - core² grows with it).
        const r = Math.sqrt(c.core * c.core + net * (c.fullRadius * c.fullRadius - c.core * c.core));
        roll.scale.set(1, r, r);
        roll.visible = net > 0.01;
        // Turned by the net coming off or on: `turnsPerNet` turns from full to empty.
        if (shown >= 0) drum.rotation.x += (net - shown) * c.turnsPerNet * 2 * Math.PI;
        shown = net;
      };
      show(1);
      return {
        staticParts: fixed,
        movingParts: [drum],
        controls: [],
        update: (read, _s, dt) => {
          // (Drawn smoothly between the simulation's ticks: mechanisms/tickSmoother.ts.)
          const net = smooth.update([keys.net ? read.num(keys.net) : 1], dt)[0];
          if (net !== shown) show(net);
        },
      };
    },
  },
};

/**
 * Module deck.a-frame: the A-frame (gallows) over the transom that the trawl's warps run
 * through (modular boats M5a): two legs from the deck up and aft over the stern, braced
 * forward, a crossbeam with a block each side, and on the starboard leg a control box with
 * PAY OUT and HAUL (hold to run) for working the net by hand. It gives the boat a trawl
 * gantry: where the blocks are, where the net's drag acts on her.
 *
 * Drawn in the boat's axes from the hull's beam, deck and transom (its defaults: the
 * figures in CONFIG.vessels.workboat.fishing.aFrame); the frame and the box are
 * merged with the bridge's fixed parts, the button caps are shared parts.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { Button } from '../../controls/Button';
import { bar } from '../../mechanisms/line';
import type { GearFacts, HullQueries, ModuleDefinition } from '../../modular/module';
import { part } from '../../render/geometryUtils';

export type AFrameConfig = typeof CONFIG.vessels.workboat.fishing.aFrame;

/** Where the A-frame stands (the boat's axes), from the hull. */
export function aFrameGeometry(a: AFrameConfig, hull: HullQueries): GearFacts['trawlGantry'] {
  const footZ = hull.transom - a.footFromTransom;
  const deck = hull.deckY(footZ);
  return {
    x: hull.halfBeam(footZ) - a.footInset,
    footZ,
    deck,
    headZ: hull.transom + a.headAft,
    top: deck + a.height,
    blockX: a.blockX,
    braceZ: footZ - a.braceForward,
    buttonY: deck + a.buttonHeight,
  };
}

export const A_FRAME: ModuleDefinition<AFrameConfig> = {
  id: 'deck.a-frame',
  version: 1,
  fits: ['stern.gantry'],
  defaults: CONFIG.vessels.workboat.fishing.aFrame,
  validateConfig: (c) => (c.height > 0 ? [] : ['the A-frame needs a height']),
  ports: {
    payOut: { dir: 'write', key: 'net.payOut' },
    haul: { dir: 'write', key: 'net.haul' },
  },
  provides: () => [{ gear: 'trawlGantry' }],
  gear: (c, hull) => ({ trawlGantry: aFrameGeometry(c, hull) }),
  // The legs' feet and the braces' feet on the quarters, both sides.
  footprints: (c, hull) => {
    const af = aFrameGeometry(c, hull);
    return [af.footZ, af.braceZ].flatMap((z) => [-1, 1].map((s) => ({ x: s * af.x, z, r: 0.12, top: af.top })));
  },
  view: {
    frame: 'boat',
    build({ config, keys, hull, share }) {
      const af = aFrameGeometry(config, hull);
      const RED = 0xb8261a;
      const parts: THREE.BufferGeometry[] = [];
      for (const s of [-1, 1]) {
        const foot = new THREE.Vector3(s * af.x, af.deck, af.footZ);
        const head = new THREE.Vector3(s * af.x, af.top, af.headZ);
        parts.push(bar(foot, head, 0.07, RED)); // the leg
        parts.push(part(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 10).translate(foot.x, foot.y + 0.02, foot.z), 0x30343a)); // its foot plate
        // The brace: from a third of the way up the leg down to the deck forward of it.
        const knee = foot.clone().lerp(head, 0.38);
        parts.push(bar(new THREE.Vector3(s * af.x, af.deck, af.braceZ), knee, 0.045, RED));
        // The block on the beam, and its shackle.
        parts.push(part(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 12).rotateZ(Math.PI / 2).translate(s * af.blockX, af.top - 0.22, af.headZ), 0x30343a));
        parts.push(part(new THREE.BoxGeometry(0.03, 0.1, 0.03).translate(s * af.blockX, af.top - 0.08, af.headZ), 0x30343a));
      }
      // The crossbeam.
      parts.push(bar(new THREE.Vector3(-af.x - 0.05, af.top, af.headZ), new THREE.Vector3(af.x + 0.05, af.top, af.headZ), 0.08, RED));

      // By hand: PAY OUT / HAUL on a control box built onto the starboard leg's inboard side
      // at waist height, read from inboard facing the leg (PAY OUT forward, HAUL aft).
      const t = (af.buttonY - af.deck) / (af.top - af.deck);
      const legZ = af.footZ + (af.headZ - af.footZ) * t;
      const x0 = af.x - 0.06; // the leg's inboard face
      parts.push(part(new THREE.BoxGeometry(0.32, 0.2, 0.4).translate(x0 - 0.16, af.buttonY - 0.1, legZ), 0xb8261a));
      parts.push(part(new THREE.BoxGeometry(0.3, 0.012, 0.38).translate(x0 - 0.16, af.buttonY + 0.006, legZ), 0x3a4148));
      const bx = x0 - 0.21;
      const y = af.buttonY + 0.012;
      const out = new Button('netOut', keys.payOut, 'Trawl net: PAY OUT (hold)', 'momentary', 0xe0a020);
      out.root.position.set(bx, y, legZ - 0.09);
      const haul = new Button('netIn', keys.haul, 'Trawl net: HAUL (hold)', 'momentary', 0x3a9a4a);
      haul.root.position.set(bx, y, legZ + 0.09);
      share(out.cap, 'deckButtonCap');
      share(haul.cap, 'deckButtonCap');
      return {
        staticParts: parts,
        movingParts: [],
        controls: [out, haul],
        labels: [
          { text: 'PAY OUT', at: [bx, y, legZ - 0.09], yaw: -Math.PI / 2 },
          { text: 'HAUL', at: [bx, y, legZ + 0.09], yaw: -Math.PI / 2 },
        ],
        update: () => {},
      };
    },
  },
};

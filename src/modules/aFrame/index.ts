/**
 * Module deck.a-frame: the A-frame (gallows) over the transom that the trawl's warps run
 * through (modular boats M5a): two legs from the deck up and aft over the stern, a crossbeam
 * with a block each side and a lifting block in the middle for the codend, and a control box
 * on a post by the starboard foot with PAY OUT and HAUL (hold to run) for working the net by
 * hand and RELEASE for emptying the codend. It gives the boat a trawl gantry: where the
 * blocks are, where the net's drag acts on her.
 *
 * It swings (owner, Oct 2026: "a more advanced animation when you pull the net in"): its
 * braces are hydraulic rams, a barrel pinned to the deck and a rod to the leg, and hauling the
 * net they pull it forward on its feet to bring the codend in over the deck, then push it
 * back out ('aFrame.luff', worked out by fishing.ts; fishing/codend.ts). The frame is one
 * moving part turned about its feet, the four ram pieces one instanced mesh.
 *
 * Drawn in the boat's axes, standing where its socket is (on the starting workboat, her
 * transom), fitted to the hull there: its feet on the quarters at her beam and deck, so it
 * fits any hull (its figures: CONFIG.vessels.workboat.fishing.aFrame, distances from its
 * socket). The frame and the box are merged with the boat's fixed parts, the button caps
 * are shared parts.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { Button } from '../../controls/Button';
import { bar, stretchBetween } from '../../mechanisms/line';
import { TickSmoother } from '../../mechanisms/tickSmoother';
import { luffAngle, luffPoint } from '../../fishing/codend';
import type { GearFacts, HullQueries, ModuleDefinition } from '../../modular/module';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';

export type AFrameConfig = typeof CONFIG.vessels.workboat.fishing.aFrame;

/** Where the A-frame stands (the boat's axes), from its socket's z (its stern line: the transom on the workboat) and the hull there. */
export function aFrameGeometry(a: AFrameConfig, hull: HullQueries, sternZ: number): GearFacts['trawlGantry'] {
  const footZ = sternZ - a.footFromTransom;
  const deck = hull.deckY(footZ);
  return {
    x: hull.halfBeam(footZ) - a.footInset,
    footZ,
    deck,
    headZ: sternZ + a.headAft,
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
    release: { dir: 'write', key: 'net.release' },
    luff: { dir: 'read', key: 'aFrame.luff', required: false },
  },
  provides: () => [{ gear: 'trawlGantry' }],
  gear: (c, hull, at) => ({ trawlGantry: aFrameGeometry(c, hull, at([0, 0, 0])[2]) }),
  // The legs' feet and the rams' feet on the quarters, both sides, and the control box's post.
  footprints: (c, hull, at) => {
    const af = aFrameGeometry(c, hull, at([0, 0, 0])[2]);
    const box = boxAt(c, af);
    return [...[af.footZ, af.braceZ].flatMap((z) => [-1, 1].map((s) => ({ x: s * af.x, z, r: 0.12, top: af.top }))), { x: box.x, z: box.z, r: 0.2, top: af.buttonY }];
  },
  view: {
    frame: 'boat',
    build({ config, keys, hull, share, socket }) {
      const af = aFrameGeometry(config, hull, socket.transform.position[2]);
      const RED = 0xb8261a;
      const DARK = 0x30343a;
      // The frame, drawn raked aft as it stands trawling, turned about its feet as it swings.
      const frame: THREE.BufferGeometry[] = [];
      const fixed: THREE.BufferGeometry[] = [];
      for (const s of [-1, 1]) {
        const foot = new THREE.Vector3(s * af.x, af.deck, af.footZ);
        const head = new THREE.Vector3(s * af.x, af.top, af.headZ);
        frame.push(bar(foot, head, 0.07, RED)); // the leg
        frame.push(part(new THREE.CylinderGeometry(0.09, 0.09, 0.2, 10).rotateZ(Math.PI / 2).translate(foot.x, foot.y + 0.05, foot.z), DARK)); // its hinge pin
        fixed.push(part(new THREE.BoxGeometry(0.22, 0.12, 0.26).translate(foot.x, foot.y + 0.06, foot.z), DARK)); // its hinge lugs on the deck
        fixed.push(part(new THREE.BoxGeometry(0.16, 0.1, 0.2).translate(s * af.x, af.deck + 0.05, af.braceZ), DARK)); // the ram's deck lug
        // The block on the beam, and its shackle.
        frame.push(part(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 12).rotateZ(Math.PI / 2).translate(s * af.blockX, af.top - 0.22, af.headZ), DARK));
        frame.push(part(new THREE.BoxGeometry(0.03, 0.1, 0.03).translate(s * af.blockX, af.top - 0.08, af.headZ), DARK));
      }
      // The crossbeam, and the lifting block in its middle for the codend.
      frame.push(bar(new THREE.Vector3(-af.x - 0.05, af.top, af.headZ), new THREE.Vector3(af.x + 0.05, af.top, af.headZ), 0.08, RED));
      frame.push(part(new THREE.CylinderGeometry(0.12, 0.12, 0.07, 12).rotateZ(Math.PI / 2).translate(0, af.top - 0.2, af.headZ), DARK));
      // Pivoted on its feet: the mesh drawn about the pivot, the group turned.
      const pivot = new THREE.Group();
      pivot.position.set(0, af.deck, af.footZ);
      const mesh = new THREE.Mesh(mergeParts(frame).translate(0, -af.deck, -af.footZ), flatVertexColorMaterial());
      pivot.add(mesh);
      // The rams: a barrel from the deck lug, a rod out of it to the leg a third of the way up.
      const rams = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 10), new THREE.MeshLambertMaterial(), 4);
      rams.frustumCulled = false;
      for (let i = 0; i < 4; i++) rams.setColorAt(i, new THREE.Color(i < 2 ? RED : 0xc8ccd0));
      const knee = (s: number) => new THREE.Vector3(s * af.x, af.deck, af.footZ).lerp(new THREE.Vector3(s * af.x, af.top, af.headZ), 0.38);
      const barrel = knee(1).distanceTo(new THREE.Vector3(af.x, af.deck, af.braceZ)) * 0.62;
      const m = new THREE.Matrix4();
      const placeRams = (luff: number) => {
        [-1, 1].forEach((s, i) => {
          const k = new THREE.Vector3(...luffPoint(af, luff, knee(s).toArray()));
          const b = new THREE.Vector3(s * af.x, af.deck + 0.08, af.braceZ);
          const end = b.clone().add(k.clone().sub(b).setLength(barrel));
          stretchBetween(rams, i, b, end, 0.11, 0.11, m);
          stretchBetween(rams, 2 + i, end.clone().lerp(b, 0.05), k, 0.06, 0.06, m);
        });
        rams.instanceMatrix.needsUpdate = true;
      };
      placeRams(0);
      let shown = -1;
      const smooth = new TickSmoother([0.5]);

      // By hand: PAY OUT / HAUL / RELEASE on a control box on a post inboard of the starboard
      // foot, clear of the frame as it swings, read from inboard facing aft.
      const box = boxAt(config, af);
      fixed.push(part(new THREE.CylinderGeometry(0.05, 0.06, af.buttonY - af.deck - 0.2, 8).translate(box.x, af.deck + (af.buttonY - af.deck - 0.2) / 2, box.z), DARK)); // the post
      fixed.push(part(new THREE.BoxGeometry(0.4, 0.2, 0.32).translate(box.x, af.buttonY - 0.1, box.z), RED));
      fixed.push(part(new THREE.BoxGeometry(0.38, 0.012, 0.3).translate(box.x, af.buttonY + 0.006, box.z), 0x3a4148));
      const y = af.buttonY + 0.012;
      const out = new Button('netOut', keys.payOut, 'Trawl net: PAY OUT (hold)', 'momentary', 0xe0a020);
      out.root.position.set(box.x + 0.12, y, box.z);
      const haul = new Button('netIn', keys.haul, 'Trawl net: HAUL (hold)', 'momentary', 0x3a9a4a);
      haul.root.position.set(box.x, y, box.z);
      const release = new Button('netRelease', keys.release, 'Codend: RELEASE (empties it on deck, hanging inboard)', 'pulse', 0xd03020);
      release.root.position.set(box.x - 0.12, y, box.z);
      for (const b of [out, haul, release]) share(b.cap, 'deckButtonCap');
      return {
        staticParts: fixed,
        movingParts: [pivot, rams],
        controls: [out, haul, release],
        labels: [
          { text: 'PAY OUT', at: [box.x + 0.12, y, box.z - 0.09], yaw: 0 },
          { text: 'HAUL', at: [box.x, y, box.z - 0.09], yaw: 0 },
          { text: 'RELEASE', at: [box.x - 0.12, y, box.z - 0.09], yaw: 0 },
        ],
        update: (read, _s, dt) => {
          // (Drawn smoothly between the simulation's ticks: mechanisms/tickSmoother.ts.)
          const luff = smooth.update([keys.luff ? read.num(keys.luff) : 0], dt)[0];
          if (luff === shown) return;
          shown = luff;
          pivot.rotation.x = -luffAngle(luff);
          placeRams(luff);
        },
      };
    },
  },
};

/** Where the control box's post stands (the boat's axes): inboard of the starboard foot, a little forward of it. */
function boxAt(c: AFrameConfig, af: GearFacts['trawlGantry']): { x: number; z: number } {
  return { x: af.x - c.box.inboard, z: af.footZ - c.box.forward };
}

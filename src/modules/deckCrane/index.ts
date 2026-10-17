/**
 * Module deck.crane: a placeable hydraulic deck crane for cargo (owner), independent of the
 * skiff's crane (deck.tender-crane). A column that slews on its plinth, a boom that luffs
 * from the column's head on a ram, and a wire hanging from the boom's tip to a hook.
 *
 * Worked from a control post at its foot: the joystick asks for slew (sideways) and boom
 * angle (fore and aft: push to raise), and the crane follows at its own rates while there's
 * hydraulic pressure ('hydraulics.on'); HOIST UP / DOWN (hold) haul and pay out the wire;
 * HOOK takes the cargo under the hook or sets down what's on it. The hooking is the
 * world.s (cargo/cargo.ts, stepCraneCargo): the crane only says, through its state, that HOOK was
 * pressed (`press`), and the world says what's on the hook (`hooked`). The load hangs rigid
 * under the hook (no swing: owner's choice); its weight bears on the boat there (cargo
 * payload).
 *
 * Drawn from its socket (placeable on any deck.equipment socket): its axes are the socket's,
 * slew 0 along the socket's forward (-z), + to starboard. Its state (the angles it has
 * reached, the wire, the hook) is its own, in VesselState.modules, so crew see it move.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { Button } from '../../controls/Button';
import { Joystick } from '../../controls/Joystick';
import { barGeometry } from '../../mechanisms/line';
import { busOf } from '../../modular/bus';
import type { ModuleDefinition } from '../../modular/module';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';

export type DeckCraneConfig = typeof CONFIG.modules.deckCrane;

/** Its own state: where the column and boom have got to (deg), the wire out (m), the hook. */
export interface DeckCraneState {
  slew: number;
  luff: number;
  wire: number;
  /** HOOK pressed and not yet acted on by the world. */
  press: boolean;
  /** Was HOOK held last tick (to see a press). */
  held: boolean;
  /** The cargo item on the hook (the world sets it), or null. */
  hooked: string | null;
}

const RAD = Math.PI / 180;

/** The boom's tip in the crane's axes (its socket's), for these angles. */
export function craneTip(c: DeckCraneConfig, slewDeg: number, luffDeg: number): [number, number, number] {
  const reach = c.boomLength * Math.cos(luffDeg * RAD);
  return [reach * Math.sin(slewDeg * RAD), c.columnHeight + c.boomLength * Math.sin(luffDeg * RAD), -reach * Math.cos(slewDeg * RAD)];
}

/** The hook (its eye, where a load's sling meets it) in the crane's axes. */
export function craneHook(c: DeckCraneConfig, s: Pick<DeckCraneState, 'slew' | 'luff' | 'wire'>): [number, number, number] {
  const [x, y, z] = craneTip(c, s.slew, s.luff);
  return [x, y - s.wire, z];
}

/** Move `from` toward `to` by no more than `step`. */
const toward = (from: number, to: number, step: number) => from + Math.max(-step, Math.min(step, to - from));

export const DECK_CRANE: ModuleDefinition<DeckCraneConfig, DeckCraneState> = {
  id: 'deck.crane',
  version: 1,
  fits: ['deck.equipment'],
  defaults: CONFIG.modules.deckCrane,
  validateConfig: (c) => [
    ...(c.boomLength > 0 && c.columnHeight > 0 ? [] : ['the crane needs a column and a boom']),
    ...(c.wireMax > c.wireMin ? [] : ['the wire needs room to run (wireMax over wireMin)']),
  ],
  ports: {
    slew: { dir: 'write', key: 'crane.slew' },
    luff: { dir: 'write', key: 'crane.luff' },
    hoistUp: { dir: 'write', key: 'crane.hoistUp' },
    hoistDown: { dir: 'write', key: 'crane.hoistDown' },
    hook: { dir: 'write', key: 'crane.hook' },
    pressure: { dir: 'read', key: 'hydraulics.on' },
  },
  needs: () => [{ power: 'hydraulic' }],
  physical: (c) => ({ massKg: c.massKg, cg: [0, c.columnHeight / 2, 0], swlKg: c.swlKg }),
  // The plinth and column (in its own axes: the assembler puts them onto the boat), and the
  // control post beside it.
  footprints: (c) => [
    { x: 0, z: 0, r: c.plinthRadius + 0.05, top: c.columnHeight },
    { x0: c.post.x - 0.17, x1: c.post.x + 0.17, z0: c.post.z - 0.13, z1: c.post.z + 0.13, top: c.post.height + 0.1 },
  ],
  sim: {
    init: (c) => ({ slew: c.stow.slewDeg, luff: c.stow.luffDeg, wire: c.stow.wire, press: false, held: false, hooked: null }),
    tick({ config: c, io }, s, dt) {
      const hook = !!io.get('hook');
      if (hook && !s.held) s.press = true;
      s.held = hook;
      if (!io.get('pressure')) return; // no hydraulic pressure: it holds where it is
      s.slew = toward(s.slew, io.num('slew'), c.slewRateDeg * dt);
      s.luff = toward(s.luff, io.num('luff'), c.luffRateDeg * dt);
      const run = (io.get('hoistDown') ? 1 : 0) - (io.get('hoistUp') ? 1 : 0);
      s.wire = Math.max(c.wireMin, Math.min(c.wireMax, s.wire + run * c.hoistRate * dt));
    },
  },
  view: {
    build({ config: c, keys, socket }) {
      const steel = 0x3f464c;
      const yellow = 0xe0a020;
      const staticParts = [
        part(new THREE.CylinderGeometry(c.plinthRadius, c.plinthRadius * 1.1, c.plinthHeight, 16).translate(0, c.plinthHeight / 2, 0), steel),
        // The control post: a pillar and a sloping desk on top.
        part(new THREE.BoxGeometry(0.16, c.post.height, 0.16).translate(c.post.x, c.post.height / 2, c.post.z), steel),
        part(new THREE.BoxGeometry(0.34, 0.06, 0.26).translate(c.post.x, c.post.height + 0.03, c.post.z), 0x2a3035),
      ];
      // The slewing part: the column, and the boom on its pivot at the column's head.
      const slewing = new THREE.Group();
      slewing.position.y = c.plinthHeight;
      const column = new THREE.Mesh(
        mergeParts([
          part(new THREE.CylinderGeometry(c.columnRadius, c.columnRadius * 1.15, c.columnHeight - c.plinthHeight, 14).translate(0, (c.columnHeight - c.plinthHeight) / 2, 0), yellow),
          part(new THREE.BoxGeometry(0.3, 0.22, 0.3).translate(0, c.columnHeight - c.plinthHeight, 0), yellow), // the head
        ]),
        flatVertexColorMaterial(),
      );
      slewing.add(column);
      const boom = new THREE.Group();
      boom.position.y = c.columnHeight - c.plinthHeight;
      const d = c.boomDepth;
      boom.add(
        new THREE.Mesh(
          mergeParts([
            part(new THREE.BoxGeometry(d, d, c.boomLength).translate(0, 0, -c.boomLength / 2), yellow),
            part(new THREE.BoxGeometry(d * 1.3, d * 1.6, 0.18).translate(0, -d * 0.2, -c.boomLength + 0.05), yellow), // the sheave head
          ]),
          flatVertexColorMaterial(),
        ),
      );
      slewing.add(boom);
      // The luffing ram: from low on the column to a third of the way along the boom.
      const ramFoot = new THREE.Vector3(0, -0.75, -0.16);
      const ramAt = c.boomLength * 0.35;
      const ram = new THREE.Mesh(part(barGeometry(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 0.05, 8), 0xb8bcc0), flatVertexColorMaterial());
      slewing.add(ram);
      // The wire and the hook, hanging from the tip (in the crane's axes, so outside `slewing`).
      const wire = new THREE.Mesh(part(barGeometry(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 0.008, 5), 0x202326), flatVertexColorMaterial());
      const hookMesh = new THREE.Mesh(
        mergeParts([
          part(new THREE.BoxGeometry(0.12, 0.16, 0.08).translate(0, -0.08, 0), 0x202326), // the block
          part(new THREE.TorusGeometry(0.05, 0.014, 6, 10, Math.PI * 1.4).rotateZ(Math.PI * 0.8).translate(0, -0.2, 0), yellow), // the hook
        ]),
        flatVertexColorMaterial(),
      );

      // Controls on the post's desk: the joystick in the middle, HOIST UP and DOWN to one
      // side, HOOK to the other.
      const top = c.post.height + 0.06;
      const stick = new Joystick(
        `${socket.id}Joystick`,
        { panRateDeg: c.slewRateDeg, tiltRateDeg: c.luffRateDeg, panLimitDeg: c.slewLimitDeg, tiltMinDeg: c.luffMinDeg, tiltMaxDeg: c.luffMaxDeg },
        { pan: keys.slew, tilt: keys.luff },
        'Deck crane: slew (sideways) and boom (push to raise)',
        yellow,
        { pan: (s) => busOf(s).num(keys.slew), tilt: (s) => busOf(s).num(keys.luff) },
      );
      stick.root.position.set(c.post.x, top, c.post.z);
      const up = new Button(`${socket.id}HoistUp`, keys.hoistUp, 'Deck crane: HOIST UP (hold)', 'momentary', 0x3a9a4a);
      up.root.position.set(c.post.x + 0.11, top, c.post.z - 0.05);
      const down = new Button(`${socket.id}HoistDown`, keys.hoistDown, 'Deck crane: HOIST DOWN (hold)', 'momentary', 0xe0a020);
      down.root.position.set(c.post.x + 0.11, top, c.post.z + 0.06);
      const hookBtn = new Button(`${socket.id}Hook`, keys.hook, 'Deck crane: HOOK (take or set down the load)', 'momentary', 0xc0302a);
      hookBtn.root.position.set(c.post.x - 0.11, top, c.post.z);

      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const tip = new THREE.Vector3();
      const unitUp = new THREE.Vector3(0, 1, 0);
      return {
        staticParts,
        movingParts: [slewing, wire, hookMesh],
        controls: [stick, up, down, hookBtn],
        labels: [
          { text: 'HOIST', at: [c.post.x + 0.11, top, c.post.z + 0.13] },
          { text: 'HOOK', at: [c.post.x - 0.11, top, c.post.z + 0.08] },
          { text: 'CRANE', at: [c.post.x, top, c.post.z + 0.12] },
        ],
        update(_read, s) {
          const st = s ?? DECK_CRANE.sim!.init(c);
          slewing.rotation.y = -st.slew * RAD;
          boom.rotation.x = st.luff * RAD;
          // The ram, from its foot on the column to its pin on the boom (in `slewing`'s axes).
          a.copy(ramFoot).add(boom.position);
          b.set(0, ramAt * Math.sin(st.luff * RAD) - 0.1, -ramAt * Math.cos(st.luff * RAD)).add(boom.position);
          ram.position.copy(a);
          ram.quaternion.setFromUnitVectors(unitUp, b.clone().sub(a).normalize());
          ram.scale.set(1, a.distanceTo(b), 1);
          // The wire from the tip straight down to the hook.
          tip.fromArray(craneTip(c, st.slew, st.luff));
          wire.position.copy(tip).setY(tip.y - st.wire);
          wire.scale.set(1, st.wire, 1);
          hookMesh.position.copy(wire.position);
        },
      };
    },
  },
};

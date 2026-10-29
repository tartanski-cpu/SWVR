/**
 * Module deck.line-hauler: a powered sheave at her starboard rail for hauling a longline
 * (owner, 29 Oct 2026: "go ahead with the line hauler"; fishing/longline.ts). A steel post on
 * deck against the bulwark; a short davit arm from it out over the rail to a roller, where
 * the line comes aboard; on the post's top the sheave, its axle fore and aft, turned by a
 * hydraulic motor forward of it. The line comes up over the roller, over the sheave's top, and
 * falls inboard into a bin on deck. Its valve, a three-way knob on a bracket aft of the post
 * (STOP / SLOW / FAST), sets how fast it hauls ('hauler.valve'); it runs on the deck
 * hydraulics, and stops by itself with a fish at the roller (fishing/longline.ts works it all
 * out, and says how fast the sheave turns: 'hauler.run').
 *
 * Its socket is on deck at the post's foot, `postIn` in from her side; it draws from there
 * (x out to her side, y up, z aft), the rail's height from the hull there. The post, arm,
 * roller, motor and bin are merged with her fixed parts; the sheave turns (one moving part),
 * and the line round it shows only while a longline is led in ('hauler.line').
 * CONFIG.modules.lineHauler.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { Selector3 } from '../../controls/Selector3';
import { bar } from '../../mechanisms/line';
import { busOf } from '../../modular/bus';
import type { GearFootprint, HullQueries, ModuleDefinition } from '../../modular/module';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';

export type LineHaulerConfig = typeof CONFIG.modules.lineHauler;

type V3 = [number, number, number];

/** Its parts' places in its own axes (from the post's foot): the roller, the sheave's middle, the bin's foot, the valve; and the rail's height there. */
function plan(c: LineHaulerConfig, hull: HullQueries, foot: readonly number[]): { rail: number; roller: V3; sheave: V3; bin: V3; valve: V3 } {
  const rail = hull.bulwarkTop(foot[2]) - foot[1];
  return {
    rail,
    roller: [c.postIn + c.rollerOut, rail + c.rollerUp, 0],
    sheave: [0, rail + c.sheaveUp, 0],
    bin: [-c.binIn, 0, 0],
    valve: [0, c.valveY, c.valveAft],
  };
}

export const LINE_HAULER: ModuleDefinition<LineHaulerConfig> = {
  id: 'deck.line-hauler',
  version: 1,
  fits: ['deck.equipment'],
  defaults: CONFIG.modules.lineHauler,
  validateConfig: (c) => (c.sheaveR > 0 && c.postIn > c.sheaveR ? [] : ['a sheave inboard of her side']),
  ports: {
    valve: { dir: 'write', key: 'hauler.valve' },
    run: { dir: 'read', key: 'hauler.run', required: false },
    line: { dir: 'read', key: 'hauler.line', required: false },
  },
  needs: () => [{ power: 'hydraulic' }],
  provides: () => [{ gear: 'lineHauler' }],
  gear: (c, hull, at) => {
    const p = plan(c, hull, at([0, 0, 0]));
    return { lineHauler: { roller: at(p.roller), sheave: at(p.sheave), bin: at(p.bin), valve: at(p.valve) } };
  },
  // The post, and the bin inboard of it (in its own axes).
  footprints: (c): GearFootprint[] => [
    { x: 0, z: 0, r: c.postR + 0.04, top: 1.6 },
    { x0: -c.binIn - c.bin[0] / 2, x1: -c.binIn + c.bin[0] / 2, z0: -c.bin[2] / 2, z1: c.bin[2] / 2, base: 0, top: c.bin[1] },
  ],
  view: {
    build({ config: c, keys, hull, socket }) {
      const col = c.colours;
      const p = plan(c, hull, socket.transform.position);
      const [sx, sy] = [p.sheave[0], p.sheave[1]];
      const fixed: THREE.BufferGeometry[] = [];
      // The post, its foot plate on deck, and the motor forward of the sheave on its axle (the valve's aft).
      fixed.push(part(new THREE.CylinderGeometry(c.postR, c.postR * 1.15, sy, 10).translate(0, sy / 2, 0), col.frame));
      fixed.push(part(new THREE.BoxGeometry(0.26, 0.025, 0.26).translate(0, 0.012, 0), col.frame));
      fixed.push(part(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 12).rotateX(Math.PI / 2).translate(sx, sy, -c.sheaveW / 2 - 0.09), col.motor));
      fixed.push(part(new THREE.BoxGeometry(0.12, 0.14, 0.04).translate(sx, sy - 0.02, -c.sheaveW / 2 - 0.01), col.frame)); // the bearing plate between
      // The davit arm out over the rail, and the roller at its end (its axle fore and aft) between two cheeks.
      const [rx, ry] = [p.roller[0], p.roller[1]];
      fixed.push(bar(new THREE.Vector3(c.postR, p.rail - 0.05, 0), new THREE.Vector3(rx, ry - 0.06, 0), 0.028, col.frame));
      fixed.push(part(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 10).rotateX(Math.PI / 2).translate(rx, ry, 0), col.sheave));
      for (const s of [-1, 1]) fixed.push(part(new THREE.BoxGeometry(0.1, 0.12, 0.012).translate(rx, ry - 0.01, s * 0.087), col.frame));
      // The bin on deck inboard of it: an open box, the line falls in.
      const [bw, bh, bl] = c.bin;
      const bx = p.bin[0];
      fixed.push(part(new THREE.BoxGeometry(bw, 0.02, bl).translate(bx, 0.01, 0), col.bin));
      for (const s of [-1, 1]) {
        fixed.push(part(new THREE.BoxGeometry(0.02, bh, bl).translate(bx + s * (bw / 2 - 0.01), bh / 2, 0), col.bin));
        fixed.push(part(new THREE.BoxGeometry(bw, bh, 0.02).translate(bx, bh / 2, s * (bl / 2 - 0.01)), col.bin));
      }
      // The valve's bracket aft of the post, and its plate.
      const [vy, vz] = [p.valve[1], p.valve[2]];
      fixed.push(bar(new THREE.Vector3(0, vy - 0.12, 0), new THREE.Vector3(0, vy - 0.03, vz), 0.018, col.frame));
      fixed.push(part(new THREE.BoxGeometry(0.11, 0.03, 0.13).translate(0, vy - 0.015, vz), col.sheave));

      // The sheave: a dark wheel with a deep groove, its spokes showing it turn.
      const sheave = new THREE.Group();
      sheave.position.set(sx, sy, 0);
      const wheel: THREE.BufferGeometry[] = [];
      for (const s of [-1, 1]) wheel.push(part(new THREE.CylinderGeometry(c.sheaveR, c.sheaveR, 0.02, 20).rotateX(Math.PI / 2).translate(0, 0, s * (c.sheaveW / 2 - 0.01)), col.sheave));
      wheel.push(part(new THREE.CylinderGeometry(c.sheaveR * 0.72, c.sheaveR * 0.72, c.sheaveW - 0.02, 16).rotateX(Math.PI / 2), 0x52575c)); // the groove's floor
      for (let k = 0; k < 3; k++) wheel.push(part(new THREE.BoxGeometry(c.sheaveR * 1.6, 0.03, 0.01).rotateZ((k * Math.PI) / 3).translate(0, 0, c.sheaveW / 2 + 0.006), 0xe0a020));
      sheave.add(new THREE.Mesh(mergeParts(wheel), flatVertexColorMaterial()));

      // The line, while one's led in: up over the roller, round the sheave's top, down into the bin.
      const path: THREE.Vector3[] = [new THREE.Vector3(rx + 0.03, ry + 0.045, 0)];
      const r = c.sheaveR * 0.74;
      for (let k = 0; k <= 6; k++) {
        const a = (k / 6) * Math.PI;
        path.push(new THREE.Vector3(sx + r * Math.cos(a), sy + r * Math.sin(a), 0));
      }
      path.push(new THREE.Vector3(bx + 0.05, bh * 0.6, 0));
      const lineGeo = path.slice(1).map((b, i) => bar(path[i], b, 0.008, col.line));
      const line = new THREE.Mesh(mergeParts(lineGeo), flatVertexColorMaterial());
      line.visible = false;

      // The valve: a three-way knob, STOP / SLOW / FAST, read from aft.
      const key = keys.valve;
      const valve = new Selector3('haulerValve', key, 'Line hauler valve: STOP / SLOW / FAST (press to step)', (s) => busOf(s).num(key), ['STOP', 'SLOW', 'FAST']);
      valve.root.position.set(0, vy, vz);

      let turn = 0;
      return {
        staticParts: fixed,
        movingParts: [sheave, line],
        controls: [valve],
        update: (read, _s, dt) => {
          // Turned by the line coming in over its top (toward her middle).
          const run = keys.run ? read.num(keys.run) : 0;
          if (run) {
            turn = (turn + (run / (c.sheaveR * 0.74)) * dt) % (2 * Math.PI);
            sheave.rotation.z = turn;
          }
          line.visible = keys.line ? read.num(keys.line) > 0.5 : false;
        },
      };
    },
  },
};

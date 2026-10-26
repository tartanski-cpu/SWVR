/**
 * Module deck.dive-frame (owner, Oct 2026: "a dive support vessel to support the diving game
 * ... a small submersible" launched "from the A-frame at the back"): a launch and recovery
 * system for the submersible game's three-person work sub. As on a real dive support ship:
 *
 *   - a heavy A-frame over the transom, its feet pinned on the quarters, swung by two
 *     hydraulic rams from in over her deck (over the sub's cradle) to out over the stern;
 *   - an umbilical winch on its crosshead, and under it a docking head that hangs plumb and
 *     grips the sub's lift point, so she can't swing while she goes over the stern;
 *   - the sub on a cradle on deck forward of it;
 *   - a control stand by the starboard foot: FRAME OUT / FRAME IN and WINCH UP / WINCH DOWN
 *     (hold to run), working only with deck hydraulic pressure ('hydraulics.on').
 *
 * The launch: WINCH UP lifts her off her cradle into the docking head; FRAME OUT swings her
 * out over the stern; WINCH DOWN lowers her until she floats. Recovery is the same backwards.
 * Its interlocks, as a real system's: the frame swings only with the sub home in the docking
 * head (the wire in to `dockTol`), and the winch lowers only with the frame right in (onto
 * the cradle) or right out (into the sea), never with her over the transom.
 *
 * Its state is the frame's angle and the wire out; where the sub is follows from them
 * (`subAt`): hanging under the head, resting on her cradle, or afloat. Her 10 t is part of the
 * boat as designed, on her cradle (`physical`: the Shipyard floats her on her lines with it);
 * moved, the difference is a payload (onBoat.ts; simulation.ts adds it): hung out over the
 * stern she trims the boat by the stern; afloat her weight comes off the boat altogether.
 * Home in the docking head she's held rigid (no rope physics); on wire out she's drawn hanging
 * plumb, and floating at the surface (the view only).
 *
 * Its placings on the boat are the Shipyard's (`at`: her transom, deck, the feet's spread
 * and her waterline there), so the sim works without the hull; drawn in the boat's axes.
 * Draw calls: the frame, the docking head, the sub, the umbilical and the rams (instanced),
 * five; the cradle, lugs and stand are merged with the boat.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { Button } from '../../controls/Button';
import { bar, barGeometry, stretchBetween } from '../../mechanisms/line';
import { TickSmoother } from '../../mechanisms/tickSmoother';
import type { ModuleDefinition } from '../../modular/module';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';
import { submersibleParts } from './submersible';

/** Where it stands on the boat (her axes, m; the Shipyard's). */
export interface DiveFramePlace {
  /** Her transom (z). */
  transom: number;
  /** Her deck at the frame's feet (y). */
  deck: number;
  /** The feet out from her centreline (x, each side). */
  footX: number;
  /** Her designed waterline there (y). */
  waterY: number;
}

export type DiveFrameConfig = typeof CONFIG.modules.diveFrame & { at: DiveFramePlace };

/** Its state: the frame's angle (deg, + aft of upright) and the wire out below the docking head (m). */
export interface DiveFrameState {
  luff: number;
  wire: number;
}

const DEG = Math.PI / 180;
const END = 0.25; // deg: at an end of its swing

/** The frame's geometry: its feet, its swing's two ends (deg), the cradle's top. */
export function diveGeometry(c: DiveFrameConfig) {
  const { transom, deck, footX, waterY } = c.at;
  const L = c.legLength;
  const s = c.sub;
  const footZ = transom - c.footFromTransom;
  // In: the docking head over her lift point on her cradle (her tail `deckClear` short of the
  // transom). Out: her bow `overClear` clear aft of the transom.
  const cradleLiftZ = transom - c.deckClear - s.aft;
  const outLiftZ = transom + c.overClear + s.front;
  const inDeg = -Math.asin(Math.min(1, (footZ - cradleLiftZ) / L)) / DEG;
  const outDeg = Math.asin(Math.min(1, (outLiftZ - footZ) / L)) / DEG;
  return { footZ, footX, deck, L, inDeg, outDeg, cradleTop: deck + c.cradle.height, waterY, transom, cradleLiftZ };
}

/** The docking head (where her lift point is held) for the frame at `deg`: [y, z]. */
export function headAt(c: DiveFrameConfig, deg: number): [number, number] {
  const g = diveGeometry(c);
  return [g.deck + g.L * Math.cos(deg * DEG) - c.headDrop, g.footZ + g.L * Math.sin(deg * DEG)];
}

/** Where she rests if lowered there: on her cradle (frame right in) or afloat (right out); null over the transom. */
function restAxisY(c: DiveFrameConfig, deg: number): { y: number; on: 'cradle' | 'afloat' } | null {
  const g = diveGeometry(c);
  if (deg <= g.inDeg + END) return { y: g.cradleTop + c.sub.bottom, on: 'cradle' };
  if (deg >= g.outDeg - END) return { y: g.waterY + c.sub.floatAxis, on: 'afloat' };
  return null;
}

/** Where the sub is (her axis's middle, the boat's axes) and how: hanging in or under the head, on her cradle, or afloat. */
export function subAt(c: DiveFrameConfig, s: DiveFrameState): { axis: [number, number, number]; lift: [number, number, number]; on: 'hung' | 'cradle' | 'afloat' } {
  const [hy, hz] = headAt(c, s.luff);
  const lift: [number, number, number] = [0, hy - s.wire, hz];
  let y = lift[1] - c.sub.lift;
  let on: 'hung' | 'cradle' | 'afloat' = 'hung';
  const rest = restAxisY(c, s.luff);
  if (rest && y <= rest.y + 1e-6) {
    y = rest.y;
    on = rest.on;
  }
  return { axis: [0, y, hz - c.sub.liftZ], lift, on };
}

/** Where the sub's middle is on her cradle (the boat's axes): her weight there is designed into the boat. */
export function cradleAxis(c: DiveFrameConfig): [number, number, number] {
  const g = diveGeometry(c);
  return [0, g.cradleTop + c.sub.bottom, g.cradleLiftZ - c.sub.liftZ];
}

/** The most wire it pays out here: to where she rests, and `slack` more (none over the transom). */
export function maxWire(c: DiveFrameConfig, deg: number): number {
  const rest = restAxisY(c, deg);
  if (!rest) return 0;
  return Math.max(0, headAt(c, deg)[0] - (rest.y + c.sub.lift)) + c.slack;
}

/** Is she home in the docking head (the frame may swing)? */
export const docked = (c: DiveFrameConfig, s: DiveFrameState) => s.wire <= c.dockTol;

const DEFAULT_PLACE: DiveFramePlace = { transom: 9, deck: 1.4, footX: 2.4, waterY: 0 };

export const DIVE_FRAME: ModuleDefinition<DiveFrameConfig, DiveFrameState> = {
  id: 'deck.dive-frame',
  version: 1,
  fits: ['stern.gantry'],
  defaults: { ...CONFIG.modules.diveFrame, at: DEFAULT_PLACE },
  validateConfig: (c) => [
    ...(c.legLength > 0 ? [] : ['the frame needs legs']),
    ...(c.at.footX > c.sub.halfWidth ? [] : ['its legs stand too close together for the sub to pass between them']),
  ],
  ports: {
    out: { dir: 'write', key: 'dive.frameOut' },
    in: { dir: 'write', key: 'dive.frameIn' },
    up: { dir: 'write', key: 'dive.winchUp' },
    down: { dir: 'write', key: 'dive.winchDown' },
    pressure: { dir: 'read', key: 'hydraulics.on' },
  },
  needs: () => [{ power: 'hydraulic' }],
  // The frame, rams, winch and head, about halfway up the legs over the feet, and the sub on her
  // cradle: together, in its socket's axes (on her transom, at her deck there; without `at`, as
  // if at her deck at the feet). Moved, the sub's difference is a payload (onBoat.ts).
  physical: (c, _hull, at) => {
    const o = at ? at([0, 0, 0]) : [0, c.at.deck, c.at.transom];
    const sub = cradleAxis(c);
    const m = c.frameKg + c.sub.massKg;
    const frameY = c.at.deck + c.legLength / 2;
    const frameZ = c.at.transom - c.footFromTransom;
    return { massKg: m, cg: [0, (c.frameKg * frameY + c.sub.massKg * sub[1]) / m - o[1], (c.frameKg * frameZ + c.sub.massKg * sub[2]) / m - o[2]] };
  },
  // The feet and the rams' lugs, the stand, and the cradle with the sub on it.
  footprints: (c) => {
    const g = diveGeometry(c);
    const top = g.deck + g.L;
    const st = standAt(c);
    const s = c.sub;
    return [
      ...[g.footZ, g.footZ - c.ram.forward].flatMap((z) => [-1, 1].map((k) => ({ x: k * g.footX, z, r: 0.15, top }))),
      { x: st.x, z: st.z, r: 0.25, top: g.deck + c.stand.height },
      // (Her body full width; her tail cone, aft of her after thrusters, narrower.)
      { x0: -s.halfWidth, x1: s.halfWidth, z0: g.cradleLiftZ - s.front, z1: g.cradleLiftZ + s.aft - 1.4, top: g.cradleTop + s.bottom + s.lift },
      { x0: -0.9, x1: 0.9, z0: g.cradleLiftZ + s.aft - 1.4, z1: g.cradleLiftZ + s.aft, top: g.cradleTop + s.bottom + s.lift },
    ];
  },
  sim: {
    init: (c) => ({ luff: diveGeometry(c).inDeg, wire: Math.max(0, headAt(c, diveGeometry(c).inDeg)[0] - (diveGeometry(c).cradleTop + c.sub.bottom + c.sub.lift)) }),
    tick({ config: c, io }, s, dt) {
      if (!io.get('pressure')) return; // no hydraulic pressure: it holds where it is
      const g = diveGeometry(c);
      // The frame swings only with her home in the docking head.
      const swing = (io.get('out') ? 1 : 0) - (io.get('in') ? 1 : 0);
      if (swing && docked(c, s)) s.luff = Math.max(g.inDeg, Math.min(g.outDeg, s.luff + swing * c.luffRateDeg * dt));
      // The winch: hoists any time; lowers only at an end of the frame's swing.
      const winch = (io.get('down') ? 1 : 0) - (io.get('up') ? 1 : 0);
      if (winch < 0) s.wire = Math.max(0, s.wire - c.wireRate * dt);
      else if (winch > 0) s.wire = Math.min(Math.max(s.wire, maxWire(c, s.luff)), s.wire + c.wireRate * dt);
    },
  },
  view: {
    frame: 'boat',
    build({ config: c, keys, share, path }) {
      const g = diveGeometry(c);
      const col = c.colours;
      const fixed: THREE.BufferGeometry[] = [];
      // The frame, drawn upright about its feet (the pivot turned to its angle): the legs, the
      // crosshead, and the umbilical winch's drum and cheeks on it.
      const frame: THREE.BufferGeometry[] = [];
      for (const k of [-1, 1]) {
        frame.push(bar(new THREE.Vector3(k * g.footX, 0, 0), new THREE.Vector3(k * g.footX, g.L, 0), 0.11, col.frame)); // the leg
        frame.push(part(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 10).rotateZ(Math.PI / 2).translate(k * g.footX, 0.06, 0), col.head)); // its pin
        frame.push(part(new THREE.BoxGeometry(0.1, 0.5, 0.5).translate(k * 0.55, g.L + 0.3, 0), col.head)); // a winch cheek
        fixed.push(part(new THREE.BoxGeometry(0.34, 0.16, 0.4).translate(k * g.footX, g.deck + 0.08, g.footZ), col.head)); // the foot's lugs
        fixed.push(part(new THREE.BoxGeometry(0.24, 0.12, 0.3).translate(k * g.footX, g.deck + 0.06, g.footZ - c.ram.forward), col.head)); // the ram's lug
      }
      frame.push(bar(new THREE.Vector3(-g.footX - 0.08, g.L, 0), new THREE.Vector3(g.footX + 0.08, g.L, 0), 0.13, col.frame)); // the crosshead
      frame.push(part(new THREE.CylinderGeometry(0.28, 0.28, 0.95, 14).rotateZ(Math.PI / 2).translate(0, g.L + 0.32, 0), col.umbilical)); // the drum, wound with umbilical
      const pivot = new THREE.Group();
      pivot.position.set(0, g.deck, g.footZ);
      pivot.add(new THREE.Mesh(mergeParts(frame), flatVertexColorMaterial()));
      // The docking head: hangs plumb from the crosshead's middle; a funnel her lift point goes up into.
      const head = new THREE.Mesh(
        mergeParts([
          part(new THREE.BoxGeometry(0.12, c.headDrop - 0.15, 0.12).translate(0, (c.headDrop + 0.15) / 2, 0), col.head), // its hanger
          part(new THREE.BoxGeometry(0.9, 0.22, 0.6).translate(0, 0.2, 0), col.head),
          part(new THREE.CylinderGeometry(0.3, 0.12, 0.2, 12, 1, true).translate(0, 0, 0), col.frame), // the funnel
        ]),
        flatVertexColorMaterial(),
      );
      // The rams: a barrel from the deck lug, its rod out to the leg (each side).
      const rams = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 10), new THREE.MeshLambertMaterial(), 4);
      rams.frustumCulled = false;
      for (let i = 0; i < 4; i++) rams.setColorAt(i, new THREE.Color(i < 2 ? col.frame : col.ram));
      const knee = (k: number, deg: number) => new THREE.Vector3(k * g.footX, g.deck + c.ram.at * g.L * Math.cos(deg * DEG), g.footZ + c.ram.at * g.L * Math.sin(deg * DEG));
      const lug = (k: number) => new THREE.Vector3(k * g.footX, g.deck + 0.1, g.footZ - c.ram.forward);
      const barrel = Math.min(knee(1, g.inDeg).distanceTo(lug(1)), knee(1, g.outDeg).distanceTo(lug(1))) * 0.85;
      const m = new THREE.Matrix4();
      const placeRams = (deg: number) => {
        [-1, 1].forEach((k, i) => {
          const kn = knee(k, deg);
          const b = lug(k);
          const end = b.clone().add(kn.clone().sub(b).setLength(barrel));
          stretchBetween(rams, i, b, end, 0.16, 0.16, m);
          stretchBetween(rams, 2 + i, end.clone().lerp(b, 0.05), kn, 0.08, 0.08, m);
        });
        rams.instanceMatrix.needsUpdate = true;
      };
      // Her cradle on deck: a base and two saddles under her skids.
      const s = c.sub;
      const cz = g.cradleLiftZ - s.liftZ;
      fixed.push(part(new THREE.BoxGeometry(2.0, 0.1, 4.6).translate(0, g.deck + 0.05, cz + 0.2), col.cradle));
      for (const z of [-1.6, 2.0]) fixed.push(part(new THREE.BoxGeometry(2.0, c.cradle.height - 0.1, 0.3).translate(0, g.deck + 0.1 + (c.cradle.height - 0.1) / 2, cz + z), col.cradle));
      // The sub, and the umbilical from the docking head down to her lift point.
      const sub = new THREE.Mesh(mergeParts(submersibleParts()), flatVertexColorMaterial());
      sub.name = 'diveSub';
      const umbilical = new THREE.Mesh(part(barGeometry(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 0.03, 6), col.umbilical), flatVertexColorMaterial());

      // The control stand by the starboard foot, worked standing forward of it facing aft (the
      // frame and the sub in view): a post and a box, WINCH UP / DOWN on its left, FRAME OUT /
      // IN on its right.
      const st = standAt(c);
      const top = g.deck + c.stand.height;
      fixed.push(part(new THREE.CylinderGeometry(0.06, 0.07, c.stand.height - 0.2, 8).translate(st.x, g.deck + (c.stand.height - 0.2) / 2, st.z), col.head));
      fixed.push(part(new THREE.BoxGeometry(0.6, 0.2, 0.4).translate(st.x, top - 0.1, st.z), col.frame));
      fixed.push(part(new THREE.BoxGeometry(0.58, 0.012, 0.38).translate(st.x, top + 0.006, st.z), 0x3a4148));
      const y = top + 0.012;
      // (Two columns, the frame's and the winch's; each button's name just aft of it.)
      const at = (col: number, row: number): [number, number, number] => [st.x + col * 0.15, y, st.z - 0.1 + row * 0.15];
      const out = new Button('diveOut', keys.out, 'Dive A-frame: FRAME OUT (hold: swings the sub out over the stern; she must be up in the docking head)', 'momentary', 0xe0a020);
      const inn = new Button('diveIn', keys.in, 'Dive A-frame: FRAME IN (hold: swings the sub in over her cradle; she must be up in the docking head)', 'momentary', 0xe0a020);
      const up = new Button('diveUp', keys.up, 'Dive A-frame: WINCH UP (hold: hoists the sub into the docking head)', 'momentary', 0x3a9a4a);
      const down = new Button('diveDown', keys.down, 'Dive A-frame: WINCH DOWN (hold: lowers the sub onto her cradle, or into the sea with the frame right out)', 'momentary', 0x3a9a4a);
      const places: [Button, number, number, string][] = [
        // (OUT and UP the far row, toward the stern; IN and DOWN the near one.)
        [out, -1, 1, 'FRAME OUT'],
        [inn, -1, 0, 'FRAME IN'],
        [up, 1, 1, 'WINCH UP'],
        [down, 1, 0, 'WINCH DOWN'],
      ];
      for (const [b, c0, r] of places) b.root.position.set(...at(c0, r));
      // DIVE (stage 4: modules/diveFrame/launch.ts), between the columns, red, lit while the sub
      // is afloat: opens the submersible game at the wreck she's over. The app's to do (it
      // leaves the page), so its channel goes to no key of the boat's.
      const dive = new Button('diveLaunch', 'diveLaunch', 'DIVE: into the submersible (the sub afloat, the boat stopped over a wreck site)', 'pulse', 0xd03020, (v) => {
        const s = v.modules?.[path]?.s as DiveFrameState | undefined;
        return !!s && subAt(c, s).on === 'afloat';
      });
      dive.root.position.set(...at(0, 0.5));
      for (const b of [out, inn, up, down, dive]) share(b.cap, 'deckButtonCap');

      const smooth = new TickSmoother([3, 0.5]);
      let shown = '';
      const unitUp = new THREE.Vector3(0, 1, 0);
      const d = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const qLevel = new THREE.Quaternion();
      const e = new THREE.Euler();
      const w = new THREE.Vector3();
      const lift = new THREE.Vector3();
      const draw = (st: DiveFrameState) => {
        pivot.rotation.x = st.luff * DEG;
        placeRams(st.luff);
        const [hy, hz] = headAt(c, st.luff);
        head.position.set(0, hy, hz);
        const at = subAt(c, st);
        sub.position.fromArray(at.axis);
        sub.quaternion.identity();
        // On wire out of the docking head she hangs plumb under it, level, whatever the boat's
        // trim and heel; and where that would take her under the sea, the sea carries her: at
        // its mean level, her axis `floatAxis` under it. (The view has no waves: in a swell she
        // sits at the mean surface, the crests washing over her.) Home in the head, or on her
        // cradle, she's held by the boat. (Drawing only: the sim's payload is in the boat's axes.)
        const boat = sub.parent;
        if (boat && at.on !== 'cradle' && st.wire > c.dockTol) {
          boat.updateWorldMatrix(true, false);
          boat.getWorldQuaternion(q);
          qLevel.setFromEuler(e.set(0, e.setFromQuaternion(q, 'YXZ').y, 0, 'YXZ'));
          w.set(0, hy, hz).applyMatrix4(boat.matrixWorld);
          w.y -= st.wire;
          w.sub(lift.set(0, c.sub.lift, c.sub.liftZ).applyQuaternion(qLevel));
          w.y = Math.max(w.y, c.sub.floatAxis);
          sub.position.copy(boat.worldToLocal(w));
          sub.quaternion.copy(q).invert().multiply(qLevel);
        }
        // The umbilical from the head to her lift point (straight: slack or taut).
        lift.set(0, c.sub.lift, c.sub.liftZ).applyQuaternion(sub.quaternion).add(sub.position);
        d.set(0, hy, hz).sub(lift);
        umbilical.visible = d.length() > 0.05;
        umbilical.position.copy(lift);
        umbilical.scale.set(1, Math.max(0.01, d.length()), 1);
        umbilical.quaternion.setFromUnitVectors(unitUp, d.normalize());
      };
      const init = DIVE_FRAME.sim!.init(c);
      draw(init);
      return {
        staticParts: fixed,
        movingParts: [pivot, head, rams, sub, umbilical],
        controls: [out, inn, up, down, dive],
        // (Read facing aft, toward the frame and the sub: the operator stands forward of the stand.)
        labels: [...places.map(([, c0, r, text]) => ({ text, at: at(c0, r), yaw: Math.PI, size: [0.13, 0.02] as const })), { text: 'DIVE', at: at(0, 0.5), yaw: Math.PI, size: [0.08, 0.02] as const }],
        update: (_read, state, dt) => {
          // (Drawn smoothly between the simulation's ticks: mechanisms/tickSmoother.ts.)
          const raw = state ?? init;
          const [luff, wire] = smooth.update([raw.luff, raw.wire], dt);
          const key = `${luff.toFixed(3)}|${wire.toFixed(3)}`;
          // (Off the docking head she's placed against the world every frame: the boat moves under her.)
          if (key === shown && (wire <= c.dockTol || subAt(c, raw).on === 'cradle')) return;
          shown = key;
          draw({ luff, wire });
        },
      };
    },
  },
};

/** The control stand (the boat's axes): by the starboard foot, forward and inboard of it. */
export function standAt(c: DiveFrameConfig): { x: number; z: number } {
  const g = diveGeometry(c);
  return { x: g.footX - c.stand.inboard, z: g.footZ - c.stand.forward };
}

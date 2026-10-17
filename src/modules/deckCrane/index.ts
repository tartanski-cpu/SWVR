/**
 * Module deck.crane: a placeable hydraulic deck crane for cargo (owner), independent of the
 * skiff's crane (deck.tender-crane). A column that slews on its plinth, a boom that luffs
 * from the column's head on a ram, and a wire hanging from the boom's tip to a hook.
 *
 * Worked from a control post at its foot: the joystick asks for slew (sideways) and boom
 * angle (fore and aft: push to raise), and the crane follows at its own rates while there's
 * hydraulic pressure ('hydraulics.on'); HOIST UP / DOWN (hold) haul and pay out the wire;
 * BOOM OUT / IN (hold) run its telescopic inner section out of the boom's tip and back
 * (owner: to reach out over the deck); HOOK takes the cargo under the hook or sets down
 * what's on it. A load-moment limiter (`safeLoadAt`) keeps a load within what the crane can
 * hold at that reach. Bought as an upgrade, motion compensation holds the hook steady
 * against her roll, pitch and heave (the world works it: cargo/craneHook.ts). On desktop, clicking the joystick steers it with W A S D, and keys work
 * the buttons too (`keyExtras`: R / F hoist, Q / E boom in / out, Space the hook). The hooking is the
 * world.s (cargo/cargo.ts, stepCraneCargo): the crane only says, through its state, that HOOK was
 * pressed (`press`), and the world says what's on the hook (`hooked`). The load hangs rigid
 * under the hook (no swing: owner's choice); its weight bears on the boat there (cargo
 * payload).
 *
 * Drawn from its socket (placeable on any deck.equipment socket): its axes are the socket's,
 * slew 0 along the socket's forward (-z), + to starboard. It keeps the working deck clear
 * (owner): from a centreline socket it stands out at the deck edge (`side`, `craneSeat`),
 * its control post inboard of it; "the crane's axes" below are its column's. Its state (the angles it has
 * reached, the wire, the hook) is its own, in VesselState.modules, so crew see it move.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { Button } from '../../controls/Button';
import { Joystick } from '../../controls/Joystick';
import { barGeometry } from '../../mechanisms/line';
import { busOf } from '../../modular/bus';
import type { HullQueries, ModuleDefinition } from '../../modular/module';
import { matrixOf } from '../../modular/vesselAssembly';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';

export type DeckCraneConfig = typeof CONFIG.modules.deckCrane;

/** Its own state: where the column and boom have got to (deg), the wire out (m), the hook. */
export interface DeckCraneState {
  slew: number;
  luff: number;
  wire: number;
  /** How far the telescopic section is run out (m). */
  extend: number;
  /** The load on the hook (kg; the world sets it), for the load-moment limiter. */
  loadKg: number;
  /**
   * Motion compensation (a career upgrade; the world works it, cargo/craneHook.ts): where the
   * hook is held this tick, in the crane's axes, or null when it hangs where the boom puts it.
   */
  hookAt: [number, number, number] | null;
  /** Her height, averaged: the level the compensation holds the hook to (null: not yet). */
  refY: number | null;
  /** HOOK pressed and not yet acted on by the world. */
  press: boolean;
  /** Was HOOK held last tick (to see a press). */
  held: boolean;
  /** The cargo item on the hook (the world sets it), or null. */
  hooked: string | null;
}

const RAD = Math.PI / 180;

/** The boom's tip in the crane's axes (its socket's), for these angles and the boom run out `extend` (m). */
export function craneTip(c: DeckCraneConfig, slewDeg: number, luffDeg: number, extend = 0): [number, number, number] {
  const len = c.boomLength + extend;
  const reach = len * Math.cos(luffDeg * RAD);
  return [reach * Math.sin(slewDeg * RAD), c.columnHeight + len * Math.sin(luffDeg * RAD), -reach * Math.cos(slewDeg * RAD)];
}

/** The hook (its eye, where a load's sling meets it) in the crane's axes. */
export function craneHook(c: DeckCraneConfig, s: Pick<DeckCraneState, 'slew' | 'luff' | 'wire'> & { extend?: number }): [number, number, number] {
  const [x, y, z] = craneTip(c, s.slew, s.luff, s.extend ?? 0);
  return [x, y - s.wire, z];
}

/** How far out the hook hangs from the column (m, level): the reach a load's moment is taken at. */
export function craneRadius(c: DeckCraneConfig, luffDeg: number, extend: number): number {
  return (c.boomLength + extend) * Math.cos(luffDeg * RAD);
}

/**
 * What it may lift at this reach (kg): its safe working load out to the base boom's reach,
 * then the same load moment (load x reach) further out, the boom run out.
 */
export function safeLoadAt(c: DeckCraneConfig, s: Pick<DeckCraneState, 'luff' | 'extend'>): number {
  return c.swlKg * Math.min(1, c.boomLength / Math.max(1e-6, craneRadius(c, s.luff, s.extend)));
}

/** Where the column stands, in its socket's axes (along x: `dx`), and its control post's x beside it (inboard at the edge). */
export interface CraneSeat {
  dx: number;
  postX: number;
}

/**
 * Where it stands from its socket (`side`): out at the deck edge on its side, or on the
 * socket. `at` takes a point in the socket's axes to the boat's. A socket turned across her
 * (not square fore and aft) keeps it on the socket.
 */
export function craneSeat(c: DeckCraneConfig, hull: HullQueries, at: (p: readonly [number, number, number]) => [number, number, number]): CraneSeat {
  const p0 = at([0, 0, 0]);
  const dirX = at([1, 0, 0])[0] - p0[0]; // her x along the socket's x: +1, or -1 turned to face aft
  if (c.side === 'socket' || Math.abs(dirX) < 0.5) return { dx: 0, postX: c.post.x };
  const offCentre = Math.abs(p0[0]) > 0.05;
  const s = c.side === 'port' ? -1 : c.side === 'starboard' ? 1 : offCentre ? Math.sign(p0[0]) : 1;
  const x = c.side === 'auto' && offCentre ? p0[0] : s * (hull.halfBeam(p0[2]) - c.edgeInset);
  return { dx: (x - p0[0]) / dirX, postX: -s * Math.sign(dirX) * Math.abs(c.post.x) };
}

/** The same, for a socket's place as a matrix (the views). */
export function craneSeatAt(c: DeckCraneConfig, hull: HullQueries, place: THREE.Matrix4): CraneSeat {
  const v = new THREE.Vector3();
  return craneSeat(c, hull, (p) => v.set(...p).applyMatrix4(place).toArray());
}

/** Move `from` toward `to` by no more than `step`. */
const toward = (from: number, to: number, step: number) => from + Math.max(-step, Math.min(step, to - from));

export const DECK_CRANE: ModuleDefinition<DeckCraneConfig, DeckCraneState> = {
  id: 'deck.crane',
  // 2: the telescopic boom (`extend`) and the load on the hook (`loadKg`). 3: motion compensation (`hookAt`, `refY`).
  version: 3,
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
    boomOut: { dir: 'write', key: 'crane.boomOut' },
    boomIn: { dir: 'write', key: 'crane.boomIn' },
    hook: { dir: 'write', key: 'crane.hook' },
    pressure: { dir: 'read', key: 'hydraulics.on' },
  },
  needs: () => [{ power: 'hydraulic' }],
  // Its weight where its column stands (at the deck edge it heels her a little).
  physical: (c, hull, at) => ({ massKg: c.massKg, cg: [hull && at ? craneSeat(c, hull, at).dx : 0, c.columnHeight / 2, 0], swlKg: c.swlKg }),
  // The plinth and column (in its socket's axes: the assembler puts them onto the boat), and
  // the control post beside it.
  footprints: (c, hull, at) => {
    const { dx, postX } = craneSeat(c, hull, at);
    const px = dx + postX;
    return [
      { x: dx, z: 0, r: c.plinthRadius + 0.05, top: c.columnHeight },
      { x0: px - c.post.deskWidth / 2, x1: px + c.post.deskWidth / 2, z0: c.post.z - c.post.deskDepth / 2, z1: c.post.z + c.post.deskDepth / 2, top: c.post.height + 0.1 },
    ];
  },
  migrate: (old, from) => {
    const s = old as DeckCraneState;
    return { ...s, ...(from < 2 ? { extend: 0, loadKg: 0 } : {}), hookAt: null, refY: null };
  },
  sim: {
    init: (c) => ({ slew: c.stow.slewDeg, luff: c.stow.luffDeg, wire: c.stow.wire, extend: 0, loadKg: 0, hookAt: null, refY: null, press: false, held: false, hooked: null }),
    tick({ config: c, io }, s, dt) {
      const hook = !!io.get('hook');
      if (hook && !s.held) s.press = true;
      s.held = hook;
      if (!io.get('pressure')) return; // no hydraulic pressure: it holds where it is
      s.slew = toward(s.slew, io.num('slew'), c.slewRateDeg * dt);
      const run = (io.get('hoistDown') ? 1 : 0) - (io.get('hoistUp') ? 1 : 0);
      s.wire = Math.max(c.wireMin, Math.min(c.wireMax, s.wire + run * c.hoistRate * dt));
      // The boom's angle and length: held by the load-moment limiter if they'd take a load on
      // the hook past what it may hold that far out (it may always come back in).
      const luff = toward(s.luff, io.num('luff'), c.luffRateDeg * dt);
      const out = (io.get('boomOut') ? 1 : 0) - (io.get('boomIn') ? 1 : 0);
      const extend = Math.max(0, Math.min(c.extendMax, s.extend + out * c.extendRate * dt));
      const further = craneRadius(c, luff, extend) > craneRadius(c, s.luff, s.extend);
      if (further && s.loadKg > safeLoadAt(c, { luff, extend })) return;
      s.luff = luff;
      s.extend = extend;
    },
  },
  view: {
    build({ config: c, keys, socket, hull }) {
      const steel = 0x3f464c;
      const yellow = 0xe0a020;
      // Where it stands from its socket, and its post beside it: drawn in the socket's axes,
      // the column at `dx`, everything else from there.
      const { dx, postX } = craneSeatAt(c, hull, matrixOf(socket.transform));
      const p = { ...c.post, x: dx + postX };
      const staticParts = [
        part(new THREE.CylinderGeometry(c.plinthRadius, c.plinthRadius * 1.1, c.plinthHeight, 16).translate(dx, c.plinthHeight / 2, 0), steel),
        // The control post: a pillar and a desk on top.
        part(new THREE.BoxGeometry(0.16, p.height, 0.16).translate(p.x, p.height / 2, p.z), steel),
        part(new THREE.BoxGeometry(p.deskWidth, 0.06, p.deskDepth).translate(p.x, p.height + 0.03, p.z), 0x2a3035),
      ];
      // The slewing part: the column, and the boom on its pivot at the column's head.
      const slewing = new THREE.Group();
      slewing.position.set(dx, c.plinthHeight, 0);
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
      // The outer (base) section, open at its tip.
      boom.add(new THREE.Mesh(part(new THREE.BoxGeometry(d, d, c.boomLength).translate(0, 0, -c.boomLength / 2), yellow), flatVertexColorMaterial()));
      // The telescopic inner section: slides out of the base's tip (a size smaller, so it hides
      // inside when run in), the sheave head on its end. Long enough to keep 0.4 m inside at full stretch.
      const inner = new THREE.Group();
      const innerLength = c.extendMax + 0.4;
      inner.add(
        new THREE.Mesh(
          mergeParts([
            part(new THREE.BoxGeometry(d * 0.78, d * 0.78, innerLength).translate(0, 0, -c.boomLength + innerLength / 2 - 0.02), 0xc88a18),
            part(new THREE.BoxGeometry(d * 1.3, d * 1.6, 0.18).translate(0, -d * 0.2, -c.boomLength + 0.05), yellow), // the sheave head
          ]),
          flatVertexColorMaterial(),
        ),
      );
      boom.add(inner);
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

      // Controls on the post's desk, as you stand at it: the joystick in the middle, HOIST UP
      // and DOWN to its right with HOOK beyond, BOOM OUT and IN to its left (the far button of
      // each pair takes the hook up or out, the near one down or in).
      const top = p.height + 0.06;
      const stick = new Joystick(
        `${socket.id}Joystick`,
        { panRateDeg: c.slewRateDeg, tiltRateDeg: c.luffRateDeg, panLimitDeg: c.slewLimitDeg, tiltMinDeg: c.luffMinDeg, tiltMaxDeg: c.luffMaxDeg },
        { pan: keys.slew, tilt: keys.luff },
        'Deck crane: slew (sideways) and boom (push to raise)',
        yellow,
        { pan: (s) => busOf(s).num(keys.slew), tilt: (s) => busOf(s).num(keys.luff) },
      );
      stick.root.position.set(p.x, top, p.z);
      const button = (id: string, key: string, label: string, colour: number, dx: number, dz: number) => {
        const b = new Button(`${socket.id}${id}`, key, `Deck crane: ${label}`, 'momentary', colour);
        b.root.position.set(p.x + dx, top, p.z + dz);
        return b;
      };
      const up = button('HoistUp', keys.hoistUp, 'HOIST UP (hold)', 0x3a9a4a, 0.1, -0.06);
      const down = button('HoistDown', keys.hoistDown, 'HOIST DOWN (hold)', 0xe0a020, 0.1, 0.06);
      const boomOut = button('BoomOut', keys.boomOut, 'BOOM OUT (hold)', 0x3a7ac8, -0.1, -0.06);
      const boomIn = button('BoomIn', keys.boomIn, 'BOOM IN (hold)', 0x3a7ac8, -0.1, 0.06);
      const hookBtn = button('Hook', keys.hook, 'HOOK (take or set down the load)', 0xc0302a, 0.2, 0);
      // Desktop: clicked, the joystick steers with W A S D, and these keys work the buttons.
      stick.keyExtras = [
        { code: 'KeyR', key: 'R', does: 'hoist up', target: up },
        { code: 'KeyF', key: 'F', does: 'hoist down', target: down },
        { code: 'KeyE', key: 'E', does: 'boom out', target: boomOut },
        { code: 'KeyQ', key: 'Q', does: 'boom in', target: boomIn },
        { code: 'Space', key: 'Space', does: 'hook', target: hookBtn },
      ];

      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const tip = new THREE.Vector3();
      const unitUp = new THREE.Vector3(0, 1, 0);
      return {
        staticParts,
        movingParts: [slewing, wire, hookMesh],
        controls: [stick, up, down, boomOut, boomIn, hookBtn],
        labels: [
          // (Each lies LABEL_OFFSET nearer you than its point: along the desk's near edge.)
          { text: 'HOIST', at: [p.x + 0.1, top, p.z + 0.035] },
          { text: 'BOOM', at: [p.x - 0.1, top, p.z + 0.035] },
          { text: 'HOOK', at: [p.x + 0.2, top, p.z + 0.035] },
        ],
        update(_read, s) {
          const st = s ?? DECK_CRANE.sim!.init(c);
          const extend = st.extend ?? 0;
          slewing.rotation.y = -st.slew * RAD;
          boom.rotation.x = st.luff * RAD;
          inner.position.z = -extend;
          // The ram, from its foot on the column to its pin on the boom (in `slewing`'s axes).
          a.copy(ramFoot).add(boom.position);
          b.set(0, ramAt * Math.sin(st.luff * RAD) - 0.1, -ramAt * Math.cos(st.luff * RAD)).add(boom.position);
          ram.position.copy(a);
          ram.quaternion.setFromUnitVectors(unitUp, b.clone().sub(a).normalize());
          ram.scale.set(1, a.distanceTo(b), 1);
          // The hook: where the compensation holds it, or straight below the tip; the wire from
          // it up to the tip.
          tip.fromArray(craneTip(c, st.slew, st.luff, extend));
          if (st.hookAt) hookMesh.position.fromArray(st.hookAt);
          else hookMesh.position.copy(tip).setY(tip.y - st.wire);
          // (The crane's axes are its column's: in the socket's, out by `dx`.)
          tip.x += dx;
          hookMesh.position.x += dx;
          wire.position.copy(hookMesh.position);
          b.subVectors(tip, hookMesh.position);
          wire.scale.set(1, Math.max(0.01, b.length()), 1);
          wire.quaternion.setFromUnitVectors(unitUp, b.normalize());
        },
      };
    },
  },
};

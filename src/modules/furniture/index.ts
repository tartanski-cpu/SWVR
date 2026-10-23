/**
 * Module furniture.piece (parametric boats P5; owner: "berth, settee, galley run, seat,
 * locker, head with a door: placed on a floor level, each a furniture part with its footprint
 * for walking"). One module for every kind of piece, its `kind` saying which; the Shipyard
 * places each (shipyard/parts/furniture.ts) and sizes it from CONFIG.modules.furniture.
 *
 * Its socket is the middle of its foot on the floor. In its own axes x runs along the wall
 * it stands against and +z toward that wall (its back), so it faces -z: the socket's turn puts
 * it against whichever wall. A seat stands free, facing forward.
 *
 * Its footprint (its own axes; put on the boat by its socket) is where you can't walk: the whole piece,
 * or for the head its walls and the toilet, so you can walk in at its door. Its door is the
 * only moving part: hinged on the doorway's side, a press on it opens or shuts it
 * ('furniture.headDoor'); like the wheelhouse doors it's drawn, not walked into (you pass
 * through it shut or open). Everything else is merged with her fixed parts.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { busOf } from '../../modular/bus';
import type { GearFootprint, ModuleDefinition } from '../../modular/module';
import { flatVertexColorMaterial, part } from '../../render/geometryUtils';
import { Control, type Wiring } from '../../controls/Control';
import type { VesselState } from '../../vessel/vesselState';

export type FurnitureKind = 'berth' | 'settee' | 'galley' | 'seat' | 'locker' | 'head' | 'bunk' | 'mess' | 'shower';
export const FURNITURE_KINDS: readonly FurnitureKind[] = ['berth', 'settee', 'galley', 'seat', 'locker', 'head', 'bunk', 'mess', 'shower'];

export interface FurnitureConfig {
  kind: FurnitureKind;
  /** Along the wall, out from it, and up (m; for the locker and the head, to just under the ceiling). */
  length: number;
  depth: number;
  height: number;
}

const F = CONFIG.modules.furniture;
const C = F.colours;

/** A box in the piece's axes: x across, y up from the floor, z out from its back (+z the wall). */
const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, colour: number) =>
  part(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), colour);

/** The head's doorway, along its front (x from, x to): at the end of the front away from its middle, a hand's width in from the corner. */
function doorway(c: FurnitureConfig): [number, number] {
  const x1 = c.length / 2 - F.head.wall - 0.05;
  return [x1 - F.head.door, x1];
}

/** The plan boxes it stands solid in, in its own axes ([x0, x1, z0, z1]). */
function solidPlan(c: FurnitureConfig): [number, number, number, number][] {
  const [L, D] = [c.length / 2, c.depth / 2];
  if (c.kind === 'shower') {
    // Its walls and the drawn half of its curtain: you step in past the open half.
    const w = F.shower.wall;
    return [[-L, L, D - w, D], [-L, -L + w, -D, D], [L - w, L, -D, D], [-L, -L + c.length * 0.45, -D, -D + 0.04]];
  }
  if (c.kind !== 'head') return [[-L, L, -D, D]];
  const w = F.head.wall;
  const [d0, d1] = doorway(c);
  return [
    [-L, L, D - w, D], // the back, against the wall
    [-L, -L + w, -D, D], // the ends
    [L - w, L, -D, D],
    [-L, d0, -D, -D + w], // the front, beside its doorway
    [d1, L, -D, -D + w],
    [-0.22, 0.22, D - w - 0.55, D - w], // the toilet, against the back
  ];
}

/** The head's door: a hinged leaf in its doorway; a press opens or shuts it. Its root is on the hinge, at the floor. */
class HeadDoor extends Control {
  readonly kind = 'press' as const;
  readonly label = 'Head door: open / shut';
  private open = 0;
  private target = 0;
  private pressed = false;
  private readonly leaf = new THREE.Group();
  private readonly read: (s: VesselState) => number;

  constructor(width: number, height: number, wiring: Wiring = {}) {
    super('headDoor', wiring.channel ?? 'headDoor');
    this.read = wiring.read ?? ((s) => s.controls.headDoor ?? 0);
    // The leaf runs from the hinge (x 0) toward -x across the doorway, a knob near its free edge.
    const panel = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.03).translate(-width / 2, height / 2, 0), flatVertexColorMaterial());
    const g = panel.geometry as THREE.BufferGeometry;
    const col = new THREE.Color(C.joinery);
    g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: g.getAttribute('position').count }, () => [col.r, col.g, col.b]).flat(), 3));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6).translate(-width + 0.07, 1.0, -0.035), this.material(C.steel));
    this.leaf.add(panel, knob);
    this.root.add(this.leaf);
    this.hitObjects.push(panel, knob);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).length();
  }

  pressStart(): void {
    if (this.pressed) return;
    this.pressed = true;
    this.target = this.target > 0.5 ? 0 : 1;
    this.markPending();
    this.ctx?.haptic(0.5, 40);
    this.ctx?.emit(this.channel, this.target);
  }

  pressEnd(): void {
    this.pressed = false;
  }

  sync(state: VesselState): void {
    const open = this.read(state) > 0.5 ? 1 : 0;
    if (this.awaiting(open === this.target)) return;
    this.target = open;
  }

  tick(dt: number): void {
    super.tick(dt);
    if (this.open === this.target) return;
    this.open += Math.sign(this.target - this.open) * Math.min(Math.abs(this.target - this.open), dt * 2.5);
    // Swung out into the room (toward -z), 100 deg.
    this.leaf.rotation.y = -this.open * (100 * Math.PI) / 180;
  }
}

/**
 * A berth to lie in (owner, Oct 2026: a berth "should have the function of healing the
 * player"): a press on its mattress lies you down to rest (player/health.ts; the app handles
 * the 'berthRest' channel: it's yours, not the boat's), a press again or a step gets you up.
 * Its hit area is an unseen box over the mattress, `length` along x by `width` across z,
 * standing `top` up from its root.
 */
export class BerthRest extends Control {
  readonly kind = 'press' as const;
  readonly label = 'Berth: lie down and rest';
  private pressed = false;
  private readonly box: THREE.Mesh;

  constructor(length: number, width: number, top: number) {
    super('berthRest', 'berthRest');
    this.box = new THREE.Mesh(new THREE.BoxGeometry(length, 0.3, width).translate(0, top + 0.15, 0), new THREE.MeshBasicMaterial());
    // Unseen (the raycaster still finds it: Control.enabled's note).
    this.box.visible = false;
    this.root.add(this.box);
    this.hitObjects.push(this.box);
  }

  distanceTo(world: THREE.Vector3): number {
    const p = this.box.worldToLocal(world.clone());
    this.box.geometry.computeBoundingBox();
    return this.box.geometry.boundingBox!.distanceToPoint(p);
  }

  pressStart(): void {
    if (this.pressed) return;
    this.pressed = true;
    this.ctx?.haptic(0.3, 30);
    this.ctx?.emit(this.channel, 1);
  }

  pressEnd(): void {
    this.pressed = false;
  }

  sync(): void {}
}

/** Its fixed parts, in its own axes. */
function pieceParts(c: FurnitureConfig): THREE.BufferGeometry[] {
  const [L, D, H] = [c.length / 2, c.depth / 2, c.height];
  const parts: THREE.BufferGeometry[] = [];
  switch (c.kind) {
    case 'berth': {
      const b = F.berth;
      parts.push(box(-L, L, 0, b.top, -D, D, C.joinery), box(-L + 0.03, L - 0.03, b.top, b.top + b.cushion, -D + 0.03, D - 0.03, C.cushion));
      break;
    }
    case 'settee': {
      const s = F.settee;
      parts.push(box(-L, L, 0, s.seat - 0.08, -D, D, C.joinery), box(-L + 0.02, L - 0.02, s.seat - 0.08, s.seat, -D + 0.02, D - 0.02, C.cushion));
      parts.push(box(-L + 0.02, L - 0.02, s.seat, s.back, D - 0.14, D - 0.02, C.cushion));
      break;
    }
    case 'galley': {
      const g = F.galley;
      parts.push(box(-L, L, 0, g.top - 0.04, -D + 0.02, D, C.joinery), box(-L, L, g.top - 0.04, g.top, -D, D, C.top));
      // The sink (to one end) and the stove's top with its two burners (the other).
      parts.push(box(-L / 2 - 0.2, -L / 2 + 0.2, g.top, g.top + 0.004, -0.17, 0.17, C.dark));
      parts.push(box(L / 2 - 0.25, L / 2 + 0.25, g.top, g.top + 0.01, -0.2, 0.2, C.dark));
      for (const x of [L / 2 - 0.11, L / 2 + 0.11]) parts.push(part(new THREE.CylinderGeometry(0.07, 0.07, 0.012, 12).translate(x, g.top + 0.012, 0), C.steel));
      // A line between its doors.
      parts.push(box(-0.005, 0.005, 0.08, g.top - 0.1, -D + 0.015, -D + 0.02, C.dark));
      break;
    }
    case 'seat': {
      const s = F.seat;
      parts.push(part(new THREE.CylinderGeometry(0.2, 0.22, 0.04, 12).translate(0, 0.02, 0), C.steel));
      parts.push(part(new THREE.CylinderGeometry(0.05, 0.05, s.seat - 0.1, 10).translate(0, (s.seat - 0.1) / 2, 0), C.steel));
      parts.push(box(-L + 0.02, L - 0.02, s.seat - 0.1, s.seat, -D + 0.04, D - 0.04, C.cushion));
      parts.push(box(-L + 0.02, L - 0.02, s.seat, s.back, D - 0.12, D - 0.04, C.cushion));
      break;
    }
    case 'locker': {
      parts.push(box(-L, L, 0, H, -D, D, C.joinery));
      // Its door's edges, and a knob.
      parts.push(box(-L + 0.04, L - 0.04, 0.06, H - 0.06, -D - 0.006, -D, 0x8c6c46));
      parts.push(part(new THREE.SphereGeometry(0.02, 8, 6).translate(L - 0.1, H / 2, -D - 0.02), C.steel));
      break;
    }
    case 'head': {
      const w = F.head.wall;
      const [d0, d1] = doorway(c);
      // Its walls to the ceiling (light, as a head is lined), the head of the doorway, the toilet.
      parts.push(box(-L, L, 0, H, D - w, D, C.top), box(-L, -L + w, 0, H, -D, D, C.top), box(L - w, L, 0, H, -D, D, C.top));
      parts.push(box(-L, d0, 0, H, -D, -D + w, C.top), box(d1, L, 0, H, -D, -D + w, C.top), box(d0, d1, 1.95, H, -D, -D + w, C.top));
      parts.push(box(-0.18, 0.18, 0, 0.38, D - w - 0.5, D - w - 0.1, C.porcelain), box(-0.2, 0.2, 0.38, 0.41, D - w - 0.52, D - w - 0.08, C.porcelain));
      parts.push(box(-0.2, 0.2, 0.38, 0.75, D - w - 0.12, D - w, C.porcelain));
      break;
    }
    case 'bunk': {
      // Two berths one over the other between end boards, a lee rail along the upper's open
      // side and two rungs up to it at the end.
      const b = F.bunk;
      parts.push(box(-L, L, 0, b.lower, -D, D, C.joinery), box(-L + 0.03, L - 0.03, b.lower, b.lower + b.cushion, -D + 0.03, D - 0.03, C.cushion));
      parts.push(box(-L + 0.04, L - 0.04, b.upper - 0.05, b.upper, -D, D, C.joinery), box(-L + 0.05, L - 0.05, b.upper, b.upper + b.cushion, -D + 0.03, D - 0.03, C.cushion));
      const endTop = b.upper + b.cushion + b.rail;
      for (const s of [-1, 1]) parts.push(box(s * L - (s > 0 ? 0.04 : 0), s * L + (s < 0 ? 0.04 : 0), 0, endTop, -D, D, C.joinery));
      parts.push(box(-L + 0.5, L - 0.04, b.upper + b.cushion, endTop, -D, -D + 0.03, C.joinery)); // the lee rail, open at the ladder end
      for (const y of [b.lower + b.cushion + 0.25, (b.lower + b.cushion + b.upper) / 2 + 0.2]) parts.push(box(-L + 0.06, -L + 0.4, y, y + 0.03, -D - 0.03, -D, C.steel));
      break;
    }
    case 'mess': {
      // A table against the wall on a pedestal, a bench with a back at each end (facing in).
      const m = F.mess;
      const t0 = -L + m.bench;
      const t1 = L - m.bench;
      parts.push(box(t0, t1, m.table - 0.04, m.table, -D, D, C.top), box(-0.06, 0.06, 0, m.table - 0.04, -0.06 + D / 2, 0.06 + D / 2, C.steel));
      for (const s of [-1, 1]) {
        const [x0, x1] = s < 0 ? [-L, t0] : [t1, L];
        parts.push(box(x0, x1, 0, m.seat - 0.08, -D + 0.05, D, C.joinery), box(x0 + 0.02, x1 - 0.02, m.seat - 0.08, m.seat, -D + 0.07, D - 0.02, C.cushion));
        const bx = s < 0 ? x0 : x1 - 0.12;
        parts.push(box(bx, bx + 0.12, m.seat, m.back, -D + 0.07, D - 0.02, C.cushion));
      }
      break;
    }
    case 'shower': {
      // A tray, three walls to the ceiling, a rose on the back wall, a rail and curtain across the front (half drawn).
      const w = F.shower.wall;
      parts.push(box(-L, L, 0, 0.06, -D, D, C.porcelain));
      parts.push(box(-L, L, 0, H, D - w, D, C.top), box(-L, -L + w, 0, H, -D, D, C.top), box(L - w, L, 0, H, -D, D, C.top));
      parts.push(box(-0.06, 0.06, 1.85, 1.9, D - w - 0.18, D - w, C.steel), box(-0.08, 0.08, 1.82, 1.85, D - w - 0.24, D - w - 0.1, C.steel));
      parts.push(box(-L, L, 1.98, 2.0, -D, -D + 0.02, C.steel));
      parts.push(box(-L + w, -L + c.length * 0.45, 0.12, 1.97, -D + 0.005, -D + 0.035, C.curtain));
      break;
    }
  }
  return parts;
}

export const FURNITURE: ModuleDefinition<FurnitureConfig> = {
  id: 'furniture.piece',
  version: 1,
  fits: ['cabin.furniture'],
  defaults: { kind: 'locker', length: F.locker.length, depth: F.locker.depth, height: 1.9 },
  validateConfig: (c) => [
    ...(FURNITURE_KINDS.includes(c.kind) ? [] : [`a piece of furniture is a ${FURNITURE_KINDS.join(', ')}`]),
    ...(c.length > 0.2 && c.depth > 0.2 && c.height > 0.3 ? [] : ['length and depth over 0.2 m, height over 0.3 m']),
  ],
  physical: (c) => ({ size: [c.length, c.height, c.depth], massKg: F[c.kind].kg }),
  // Where you can't walk: the whole piece, or the head's walls and toilet (in at its door).
  // In its own axes, from its foot (base 0): the assembly puts them on the boat by its socket.
  footprints: (c): GearFootprint[] => {
    const top = c.kind === 'berth' ? F.berth.top + F.berth.cushion : c.kind === 'settee' ? F.settee.back : c.kind === 'galley' ? F.galley.top : c.kind === 'seat' ? F.seat.back : c.kind === 'bunk' ? F.bunk.upper + F.bunk.cushion + F.bunk.rail : c.kind === 'mess' ? F.mess.back : c.height;
    return solidPlan(c).map(([x0, x1, z0, z1]) => ({ x0, x1, z0, z1, base: 0, top }));
  },
  ports: { door: { dir: 'write', key: 'furniture.headDoor' } },
  view: {
    build({ config: c, keys }) {
      const controls: Control[] = [];
      const movingParts: THREE.Object3D[] = [];
      if (c.kind === 'berth') {
        // Along the wall (x), out from it (z): the mattress.
        controls.push(new BerthRest(c.length, c.depth, F.berth.top + F.berth.cushion));
      }
      // Two-high bunks: either one to lie down in.
      if (c.kind === 'bunk') controls.push(new BerthRest(c.length, c.depth, F.bunk.lower + F.bunk.cushion), new BerthRest(c.length, c.depth, F.bunk.upper + F.bunk.cushion));
      if (c.kind === 'head') {
        const [d0, d1] = doorway(c);
        const door = new HeadDoor(d1 - d0, 1.93, { channel: keys.door, read: (s) => busOf(s).num(keys.door) });
        // Hung on the doorway's far end (+x), on the front's outer face.
        door.root.position.set(d1, 0, -c.depth / 2 - 0.02);
        controls.push(door);
        movingParts.push(door.root);
      }
      return { staticParts: pieceParts(c), movingParts, controls, update: () => {} };
    },
  },
};

/** A berth drawn as part of her (the V-berth in a Shipyard boat's cabin below): no parts of its own, only the press to lie down in it (BerthRest). */
export interface RestSpotConfig {
  /** Along her, across her (m), and the mattress's top over the socket (m). */
  length: number;
  width: number;
  top: number;
}
export const REST_SPOT: ModuleDefinition<RestSpotConfig> = {
  id: 'furniture.restSpot',
  version: 1,
  fits: ['cabin.furniture'],
  defaults: { length: 1.8, width: 1.2, top: 0 },
  validateConfig: (c) => (c.length > 0.3 && c.width > 0.3 ? [] : ['a berth at least 0.3 m each way']),
  physical: () => ({ size: [0.1, 0.1, 0.1], massKg: 0 }),
  ports: {},
  view: {
    build({ config: c }) {
      // Its own x along the berth: turned by its socket to lie fore and aft.
      return { staticParts: [], movingParts: [], controls: [new BerthRest(c.length, c.width, c.top)], update: () => {} };
    },
  },
};

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

export type FurnitureKind = 'berth' | 'settee' | 'galley' | 'seat' | 'locker' | 'head';
export const FURNITURE_KINDS: readonly FurnitureKind[] = ['berth', 'settee', 'galley', 'seat', 'locker', 'head'];

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
    const top = c.kind === 'berth' ? F.berth.top + F.berth.cushion : c.kind === 'settee' ? F.settee.back : c.kind === 'galley' ? F.galley.top : c.kind === 'seat' ? F.seat.back : c.height;
    return solidPlan(c).map(([x0, x1, z0, z1]) => ({ x0, x1, z0, z1, base: 0, top }));
  },
  ports: { door: { dir: 'write', key: 'furniture.headDoor' } },
  view: {
    build({ config: c, keys }) {
      const controls: Control[] = [];
      const movingParts: THREE.Object3D[] = [];
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

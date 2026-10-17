/**
 * Module furniture.whiteboard: the crew's whiteboard (modular boats M3c), for sticky notes
 * written in the game. The notes are the world's (shared between the crew), and writing
 * on it is the app's: both go through its `api` (the BoardView).
 *
 * On a wall (a wall.panel or cabin.furniture socket) it's fixed there, its frame and pen
 * tray merged with the boat's fixed parts. Hung from a cabin roof (a cabin.overhead socket;
 * owner: not low on a wall) it's a pull-down board, like a projector screen, a little
 * bigger (`roller`): rolled up in a box under the roof, it unrolls when you pull the handle
 * on its bottom bar and rolls back up when you pull it again. Whether it's down is the
 * boat's ('whiteboard.down'), so the crew see the same; you can only write on it down.
 */
import * as THREE from 'three';
import { BoardView } from '../../board/boardView';
import { CONFIG } from '../../config';
import { Control } from '../../controls/Control';
import { busOf } from '../../modular/bus';
import type { ModuleDefinition } from '../../modular/module';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';
import type { VesselState } from '../../vessel/vesselState';

export type WhiteboardConfig = typeof CONFIG.modules.whiteboard;

/** The pull-down board's handle: a press pulls it down, or lets it roll up. */
class PullHandle extends Control {
  readonly kind = 'press' as const;
  private down = false;
  private readonly grip: THREE.Mesh;

  constructor(
    id: string,
    channel: string,
    readonly label: string,
    private readonly read: (s: VesselState) => boolean,
  ) {
    super(id, channel);
    // A loop of cord and a wooden grip hanging from the board's bottom bar.
    this.grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 8).rotateZ(Math.PI / 2).translate(0, -0.07, 0), this.material(0x8a5d3c));
    const cord = this.fixed(new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.06, 0.006).translate(0, -0.03, 0), new THREE.MeshLambertMaterial({ color: 0x30343a })));
    this.root.add(cord, this.grip);
    this.hitObjects.push(this.grip);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(new THREE.Vector3(0, -0.07, 0));
  }

  pressStart(): void {
    this.down = !this.down;
    this.markPending();
    this.ctx?.haptic(0.5, 30);
    this.ctx?.emit(this.channel, this.down ? 1 : 0);
  }

  sync(state: VesselState): void {
    const down = this.read(state);
    if (this.awaiting(down === this.down)) return;
    this.down = down;
  }
}

export const WHITEBOARD: ModuleDefinition<WhiteboardConfig> = {
  id: 'furniture.whiteboard',
  version: 1,
  fits: ['wall.panel', 'cabin.furniture', 'cabin.overhead'],
  defaults: CONFIG.modules.whiteboard,
  physical: (c) => ({ size: [c.width, c.height, 0.06] }),
  ports: { down: { dir: 'write', key: 'whiteboard.down', required: false } },
  view: {
    build({ config: c, socket, keys }) {
      if (socket.type !== 'cabin.overhead') {
        const board = new BoardView(c.width, c.height);
        return { staticParts: board.fixedParts, movingParts: [board.root], controls: [], update: () => {}, api: board };
      }
      // Pull-down: the roller box under the roof (its top at the socket), and the board
      // hanging from it, unrolled to `drop` of its height (0 up .. 1 down).
      const r = c.roller;
      const board = new BoardView(r.width, r.height);
      // Its frame and tray move with it (not merged with the boat's fixed parts).
      board.root.add(new THREE.Mesh(mergeParts(board.fixedParts), flatVertexColorMaterial()));
      const hanging = new THREE.Group();
      hanging.position.y = -r.box;
      hanging.add(board.root);
      const handle = new PullHandle(`${socket.id}Pull`, keys.down, 'Whiteboard: pull down / let it roll up', (s) => busOf(s).num(keys.down) > 0);
      hanging.add(handle.root);
      const box = [
        part(new THREE.BoxGeometry(r.width + 0.12, r.box, 0.1).translate(0, -r.box / 2, 0), 0xd8dcdf),
        ...[-1, 1].map((s) => part(new THREE.BoxGeometry(0.03, r.box + 0.02, 0.06).translate(s * (r.width / 2 + 0.075), -r.box / 2 + 0.01, 0), 0x8a9096)),
      ];
      const tray = 0.06; // the frame's border and pen tray below the face
      let drop = 0;
      const place = () => {
        // Unrolled `drop` of the way: the board's top at the box, its face as tall as it's out.
        const s = Math.max(0.02, drop);
        board.root.scale.y = s;
        board.root.position.y = -(r.height / 2) * s - 0.03;
        board.root.visible = drop > 0.04;
        handle.root.position.y = -(r.height + tray) * s - 0.03;
      };
      place();
      return {
        staticParts: box,
        movingParts: [hanging],
        controls: [handle],
        update(read, _s, dt) {
          const target = read.num(keys.down) > 0 ? 1 : 0;
          if (drop === target) return;
          drop = target > drop ? Math.min(1, drop + dt / r.rollS) : Math.max(0, drop - dt / r.rollS);
          place();
        },
        api: board,
      };
    },
  },
};

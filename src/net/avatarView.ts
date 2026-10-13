import * as THREE from 'three';
import type { EntityId } from '../core/ids';
import type { WorldState } from '../core/world';

const COLORS = [0xd8582a, 0x2a8ad8, 0x3aa84a, 0xc8a020, 0x9a4ad0, 0x20a8a0];

interface Avatar {
  root: THREE.Group;
  head: THREE.Group;
  body: THREE.Mesh;
  left: THREE.Mesh;
  right: THREE.Mesh;
  frame: THREE.Object3D | null;
}

/**
 * Other players, drawn from their PlayerState (pose + avatar): a head with a visor facing
 * where they look, two hands, and a simple body from their feet up to the neck. Everything
 * is placed in the frame of what they're aboard (vessel root or scene), so a crew-mate
 * stays put on the deck however the boat moves. Positions ease toward each new update, so
 * 20 Hz network poses look smooth.
 */
export class AvatarsView {
  private readonly avatars = new Map<EntityId, Avatar>();
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();

  constructor(private readonly scene: THREE.Object3D) {}

  update(world: WorldState, localId: EntityId, vesselRoots: Map<string, THREE.Object3D>, dt: number): void {
    const seen = new Set<EntityId>();
    let n = 0;
    for (const p of Object.values(world.players)) {
      if (p.id === localId) continue;
      seen.add(p.id);
      const a = this.avatars.get(p.id) ?? this.create(p.id, n);
      n++;
      const frame = (p.aboardVesselId && vesselRoots.get(p.aboardVesselId)) || this.scene;
      if (a.frame !== frame) {
        frame.add(a.root);
        a.frame = frame;
        snap(a, p.position, p.avatar);
      }
      const k = Math.min(1, dt * 15);
      const feet = this.tmpV.fromArray(p.position);
      a.root.position.lerp(feet, k);
      const head = p.avatar?.head;
      if (head) {
        a.head.position.lerp(this.tmpV.set(head[0] - p.position[0], head[1] - p.position[1], head[2] - p.position[2]), k);
        a.head.quaternion.slerp(this.tmpQ.set(head[3], head[4], head[5], head[6]), k);
      } else {
        a.head.position.set(0, 1.65, 0);
      }
      const neck = Math.max(0.6, a.head.position.y - 0.18);
      a.body.scale.set(1, neck, 1);
      a.body.position.set(a.head.position.x * 0.7, neck / 2, a.head.position.z * 0.7);
      for (const [mesh, hand] of [
        [a.left, p.avatar?.left],
        [a.right, p.avatar?.right],
      ] as const) {
        mesh.visible = !!hand;
        if (hand) mesh.position.lerp(this.tmpV.set(hand[0] - p.position[0], hand[1] - p.position[1], hand[2] - p.position[2]), k);
      }
    }
    for (const [id, a] of this.avatars) {
      if (seen.has(id)) continue;
      a.root.removeFromParent();
      this.avatars.delete(id);
    }
  }

  private create(id: EntityId, index: number): Avatar {
    const color = COLORS[index % COLORS.length];
    const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
    const root = new THREE.Group();
    root.name = `avatar:${id}`;
    const head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.24), mat);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.07, 0.02), new THREE.MeshLambertMaterial({ color: 0x15181c }));
    visor.position.set(0, 0.02, -0.125);
    head.add(skull, visor);
    // Unit-height body, scaled to the neck each frame.
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 1, 8).translate(0, 0, 0), mat);
    const handGeo = new THREE.SphereGeometry(0.05, 8, 6);
    const left = new THREE.Mesh(handGeo, mat);
    const right = new THREE.Mesh(handGeo, mat);
    root.add(head, body, left, right);
    const a: Avatar = { root, head, body, left, right, frame: null };
    this.avatars.set(id, a);
    return a;
  }
}

function snap(a: Avatar, feet: number[], av: WorldState['players'][string]['avatar']): void {
  a.root.position.fromArray(feet);
  if (av) {
    a.head.position.set(av.head[0] - feet[0], av.head[1] - feet[1], av.head[2] - feet[2]);
    a.head.quaternion.set(av.head[3], av.head[4], av.head[5], av.head[6]);
  }
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { EntityId } from '../core/ids';
import type { WorldState } from '../core/world';
import { LaserBeam } from '../player/laserBeam';

const COLORS = [0xd8582a, 0x2a8ad8, 0x3aa84a, 0xc8a020, 0x9a4ad0, 0x20a8a0];

/** A player's colour (avatar, name tag, laser): from the number in their id, the same for everyone. */
export function playerColor(id: EntityId): number {
  const n = Number(/(\d+)$/.exec(id)?.[1] ?? 1);
  return COLORS[(n - 1 + COLORS.length) % COLORS.length];
}

interface Avatar {
  root: THREE.Group;
  head: THREE.Group;
  body: THREE.Mesh;
  left: THREE.Mesh;
  right: THREE.Mesh;
  /** Arms: stretchy cylinders from the shoulders to the hands (a rubber band for desktop players). */
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  frame: THREE.Object3D | null;
  tag: THREE.Sprite;
  tagName: string;
  /** A chart tool in hand, shown at the hand. */
  tool: THREE.Object3D | null;
  toolKey: string;
  /** Their laser pointer, in the same frame as the avatar (the pose gives it in frame coordinates). */
  laser: LaserBeam;
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
  private readonly side = new THREE.Vector3();
  private readonly shoulder = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly yUp = new THREE.Vector3(0, 1, 0);
  private readonly laserTo = new THREE.Vector3();

  constructor(private readonly scene: THREE.Object3D) {}

  update(world: WorldState, localId: EntityId, vesselRoots: Map<string, THREE.Object3D>, dt: number): void {
    const seen = new Set<EntityId>();
    for (const p of Object.values(world.players)) {
      if (p.id === localId) continue;
      seen.add(p.id);
      const a = this.avatars.get(p.id) ?? this.create(p.id);
      const frame = (p.aboardVesselId && vesselRoots.get(p.aboardVesselId)) || this.scene;
      if (a.frame !== frame) {
        frame.add(a.root, a.laser.root);
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
      const laser = p.avatar?.laser;
      if (laser) a.laser.set(this.tmpV.set(laser[0], laser[1], laser[2]), this.laserTo.set(laser[3], laser[4], laser[5]), laser[6]);
      else a.laser.hide();
      if (a.tagName !== p.name) drawTag(a, p.name);
      a.tag.position.set(a.head.position.x, a.head.position.y + 0.32, a.head.position.z);
      const neck = Math.max(0.6, a.head.position.y - 0.18);
      a.body.scale.set(1, neck, 1);
      a.body.position.set(a.head.position.x * 0.7, neck / 2, a.head.position.z * 0.7);
      // Shoulders: below the head, either side of where it faces.
      this.side.set(1, 0, 0).applyQuaternion(a.head.quaternion).setY(0);
      if (this.side.lengthSq() < 1e-6) this.side.set(1, 0, 0);
      this.side.normalize().multiplyScalar(0.2);
      // A chart tool in hand (pencil, eraser): a small copy of it at that hand.
      const tool = p.avatar?.tool ?? null;
      const tk = tool ? `${tool.kind}:${tool.hand}` : '';
      if (a.toolKey !== tk) {
        a.toolKey = tk;
        a.tool?.removeFromParent();
        a.tool = tool ? toolMesh(tool.kind) : null;
        if (a.tool && tool) (tool.hand === 'left' ? a.left : a.right).add(a.tool);
      }
      for (const [mesh, arm, hand, s, hq] of [
        [a.left, a.leftArm, p.avatar?.left, -1, p.avatar?.leftQ],
        [a.right, a.rightArm, p.avatar?.right, 1, p.avatar?.rightQ],
      ] as const) {
        mesh.visible = !!hand;
        arm.visible = !!hand;
        if (!hand) continue;
        // Hands snap fast toward a new grip ("magnet"), then follow it.
        mesh.position.lerp(this.tmpV.set(hand[0] - p.position[0], hand[1] - p.position[1], hand[2] - p.position[2]), Math.min(1, dt * 20));
        // Turned as their real hand is (VR); a desktop player's hand faces where they look.
        if (hq) mesh.quaternion.slerp(this.tmpQ.set(hq[0], hq[1], hq[2], hq[3]), Math.min(1, dt * 20));
        else mesh.quaternion.copy(a.head.quaternion);
        this.shoulder.copy(a.head.position).addScaledVector(this.side, s);
        this.shoulder.y -= 0.3;
        const len = this.dir.copy(mesh.position).sub(this.shoulder).length();
        arm.position.copy(this.shoulder);
        arm.quaternion.setFromUnitVectors(this.yUp, this.dir.normalize());
        // Thinner as it stretches, like a rubber band.
        const w = Math.max(0.4, Math.min(1, 0.7 / Math.max(0.01, len)));
        arm.scale.set(w, Math.max(0.01, len), w);
      }
    }
    for (const [id, a] of this.avatars) {
      if (seen.has(id)) continue;
      a.root.removeFromParent();
      a.laser.root.removeFromParent();
      (a.tag.material.map as THREE.Texture).dispose();
      a.tag.material.dispose();
      this.avatars.delete(id);
    }
  }

  private create(id: EntityId): Avatar {
    const color = playerColor(id);
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
    const left = new THREE.Mesh(handGeometry(-1), mat);
    const right = new THREE.Mesh(handGeometry(1), mat);
    // Name tag: a camera-facing sprite above the head, redrawn when the name changes.
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
    tag.scale.set(0.6, 0.15, 1);
    tag.userData.color = color;
    const armGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 6).translate(0, 0.5, 0);
    const leftArm = new THREE.Mesh(armGeo, mat);
    const rightArm = new THREE.Mesh(armGeo, mat);
    leftArm.visible = rightArm.visible = false;
    root.add(head, body, left, right, leftArm, rightArm, tag);
    const a: Avatar = { root, head, body, left, right, leftArm, rightArm, frame: null, tag, tagName: '', tool: null, toolKey: '', laser: new LaserBeam(color) };
    this.avatars.set(id, a);
    return a;
  }
}

/**
 * A gloved hand, closed as it is round a controller (owner: the sphere hid how the hand
 * was turned). In the controller's grip frame: fingers wrapped round the -z axis, the
 * thumb on top (+y) on the inner side, the wrist and a cuff behind (+z). The flat-sided
 * fist, the thumb and the cuff make roll, pitch and yaw all readable from across the deck.
 * Built once per side (the thumb is on the inner side: +x for the left hand, -x for the right).
 */
const handGeos = new Map<number, THREE.BufferGeometry>();
function handGeometry(side: -1 | 1): THREE.BufferGeometry {
  const cached = handGeos.get(side);
  if (cached) return cached;
  const fist = new THREE.BoxGeometry(0.065, 0.08, 0.09);
  const knuckles = new THREE.BoxGeometry(0.06, 0.03, 0.03).translate(0, -0.035, -0.04);
  const thumb = new THREE.BoxGeometry(0.024, 0.024, 0.065).rotateY(side * 0.35).translate(-side * 0.022, 0.046, -0.025);
  const cuff = new THREE.CylinderGeometry(0.032, 0.036, 0.05, 8).rotateX(Math.PI / 2).translate(0, -0.005, 0.065);
  const g = mergeGeometries([fist, knuckles, thumb, cuff].map((x) => x.toNonIndexed()));
  g.computeVertexNormals();
  handGeos.set(side, g);
  return g;
}

function snap(a: Avatar, feet: number[], av: WorldState['players'][string]['avatar']): void {
  a.root.position.fromArray(feet);
  if (av) {
    a.head.position.set(av.head[0] - feet[0], av.head[1] - feet[1], av.head[2] - feet[2]);
    a.head.quaternion.set(av.head[3], av.head[4], av.head[5], av.head[6]);
  }
}

/** Draw a name on the avatar's tag: white text on a dark pill edged in the avatar colour. */
function drawTag(a: Avatar, name: string): void {
  a.tagName = name;
  const map = a.tag.material.map as THREE.CanvasTexture;
  const canvas = map.image as HTMLCanvasElement;
  const g = canvas.getContext('2d');
  if (!g) return;
  const w = canvas.width;
  const h = canvas.height;
  g.clearRect(0, 0, w, h);
  g.font = 'bold 34px system-ui, sans-serif';
  const tw = Math.min(w - 12, g.measureText(name).width + 36);
  const x = (w - tw) / 2;
  g.fillStyle = 'rgba(14, 22, 26, 0.75)';
  g.beginPath();
  g.roundRect(x, 6, tw, h - 12, (h - 12) / 2);
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = `#${(a.tag.userData.color as number).toString(16).padStart(6, '0')}`;
  g.stroke();
  g.fillStyle = '#f2f5f5';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name, w / 2, h / 2 + 1, tw - 20);
  map.needsUpdate = true;
}

/** Small stand-ins for the chart table tools, held in a crewmate's hand. */
function toolMesh(kind: string): THREE.Object3D {
  const color = kind === 'pencil' ? 0xe8c030 : 0xe88a9a;
  const geo = kind === 'pencil' ? new THREE.CylinderGeometry(0.005, 0.005, 0.17, 6).rotateX(Math.PI / 2).translate(0, -0.02, -0.07) : new THREE.BoxGeometry(0.025, 0.014, 0.05).translate(0, -0.03, -0.02);
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
}

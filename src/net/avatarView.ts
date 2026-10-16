import * as THREE from 'three';
import { CONFIG } from '../config';
import { flatVertexColorMaterial } from '../render/geometryUtils';
import { armGeometry, decodeLook, gloveGeometry, headGeometry, lookFromId, torsoGeometry } from './avatarOutfits';
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
  /** Head position and orientation (eased toward the pose); `face` hangs in it. */
  head: THREE.Group;
  face: THREE.Mesh;
  /** Hangs from the neck, turned to `bodyYaw` and leaning toward the waist. */
  torso: THREE.Mesh;
  /** Arms: upper arm from the shoulder to the elbow, forearm from the elbow to the hand. */
  upper: [THREE.Mesh, THREE.Mesh];
  fore: [THREE.Mesh, THREE.Mesh];
  left: THREE.Mesh;
  right: THREE.Mesh;
  /** The torso's heading (rad): follows the head's, lagging. */
  bodyYaw: number;
  /** The look the figure was built for (PlayerState.look). */
  look: number;
  frame: THREE.Object3D | null;
  tag: THREE.Sprite;
  tagName: string;
  /** A chart tool in hand, shown at the hand. */
  tool: THREE.Object3D | null;
  toolKey: string;
  /** Their laser pointer, in the same frame as the avatar (the pose gives it in frame coordinates). */
  laser: LaserBeam;
}

/** One vertex-coloured material for every figure (their colours are in the geometry). */
let figureMat: THREE.Material | null = null;
const DOWN = new THREE.Vector3(0, -1, 0);
const FWD = new THREE.Vector3(0, 0, -1);
const Y = new THREE.Vector3(0, 1, 0);

/**
 * Other players, drawn from their PlayerState (pose + avatar) as an upper-body figure in
 * working clothes (owner request; looks in avatarOutfits.ts, sizes in CONFIG.avatar):
 *   - the head where their head is, turned as it is;
 *   - the torso hanging from the neck right under the head (so the head can't come off
 *     it), turned toward where they look but lagging, leaning when the head is off the feet;
 *   - two-part arms: the elbow is worked out from the shoulder and the hand (two bones of
 *     fixed length: the law of cosines gives how far along and how far out the elbow sits,
 *     bent down, out and back like a real one). A hand beyond reach (a desktop player
 *     working a control metres away) stretches the forearm like a rubber band, as before;
 *   - an untracked hand (desktop's left) hangs relaxed at the side.
 * Everything is placed in the frame of what they're aboard (vessel root or scene), so a
 * crew-mate stays put on the deck however the boat moves. Positions ease toward each new
 * update, so 20 Hz network poses look smooth.
 */
export class AvatarsView {
  private readonly avatars = new Map<EntityId, Avatar>();
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly yawQ = new THREE.Quaternion();
  private readonly bodyQ = new THREE.Quaternion();
  private readonly neck = new THREE.Vector3();
  private readonly waist = new THREE.Vector3();
  private readonly shoulder = new THREE.Vector3();
  private readonly hand = new THREE.Vector3();
  private readonly elbow = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly bend = new THREE.Vector3();
  private readonly laserTo = new THREE.Vector3();

  constructor(private readonly scene: THREE.Object3D) {}

  update(world: WorldState, localId: EntityId, vesselRoots: Map<string, THREE.Object3D>, dt: number): void {
    const c = CONFIG.avatar;
    const seen = new Set<EntityId>();
    for (const p of Object.values(world.players)) {
      if (p.id === localId) continue;
      seen.add(p.id);
      const look = p.look ?? lookFromId(p.id);
      let a = this.avatars.get(p.id);
      if (a && a.look !== look) {
        this.remove(p.id, a);
        a = undefined;
      }
      a ??= this.create(p.id, look);
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
      a.tag.position.set(a.head.position.x, a.head.position.y + 0.34, a.head.position.z);

      // The torso's heading: toward the head's, lagging, never twisted more than maxTwistDeg.
      const f = this.dir.copy(FWD).applyQuaternion(a.head.quaternion);
      const headYaw = Math.atan2(-f.x, -f.z);
      let d = wrap(headYaw - a.bodyYaw);
      a.bodyYaw += d * Math.min(1, dt * c.bodyTurnRate);
      d = wrap(headYaw - a.bodyYaw);
      const max = (c.maxTwistDeg * Math.PI) / 180;
      if (Math.abs(d) > max) a.bodyYaw = headYaw - Math.sign(d) * max;
      // Hung from the neck, right under the head; the waist part way back over the feet.
      this.neck.copy(a.head.position);
      this.neck.y -= c.neckDrop;
      this.waist.set(this.neck.x * (1 - c.lean), this.neck.y - c.torsoLength, this.neck.z * (1 - c.lean));
      this.dir.subVectors(this.waist, this.neck).normalize();
      this.yawQ.setFromAxisAngle(Y, a.bodyYaw);
      this.bodyQ.setFromUnitVectors(DOWN, this.dir).multiply(this.yawQ);
      a.torso.position.copy(this.neck);
      a.torso.quaternion.copy(this.bodyQ);

      // A chart tool in hand (pencil, eraser): a small copy of it at that hand.
      const tool = p.avatar?.tool ?? null;
      const tk = tool ? `${tool.kind}:${tool.hand}` : '';
      if (a.toolKey !== tk) {
        a.toolKey = tk;
        a.tool?.removeFromParent();
        a.tool = tool ? toolMesh(tool.kind) : null;
        if (a.tool && tool) (tool.hand === 'left' ? a.left : a.right).add(a.tool);
      }
      const L1 = c.upperArm;
      const L2 = c.forearm;
      for (const [i, mesh, hand, s, hq] of [
        [0, a.left, p.avatar?.left, -1, p.avatar?.leftQ],
        [1, a.right, p.avatar?.right, 1, p.avatar?.rightQ],
      ] as const) {
        this.shoulder.set(s * c.shoulderHalf, -c.shoulderDrop, 0).applyQuaternion(this.bodyQ).add(this.neck);
        if (hand) {
          // Hands snap fast toward a new grip ("magnet"), then follow it.
          mesh.position.lerp(this.tmpV.set(hand[0] - p.position[0], hand[1] - p.position[1], hand[2] - p.position[2]), Math.min(1, dt * 20));
        } else {
          // Not tracked: hanging relaxed at the side, a little forward.
          mesh.position.copy(this.tmpV.set(s * 0.03, -(L1 + L2) * 0.97, -0.06).applyQuaternion(this.bodyQ).add(this.shoulder));
        }
        this.hand.copy(mesh.position);
        // The elbow (two-bone reach): along the shoulder-hand line by a, out from it by h.
        this.dir.subVectors(this.hand, this.shoulder);
        const dist = this.dir.length();
        this.dir.divideScalar(dist || 1);
        const reach = Math.min(Math.max(dist, Math.abs(L1 - L2) + 0.01), (L1 + L2) * 0.999);
        const along = (L1 * L1 - L2 * L2 + reach * reach) / (2 * reach);
        const out = Math.sqrt(Math.max(0, L1 * L1 - along * along));
        // Elbows bend down, out to the side and back, in the body's axes.
        this.bend.set(s * 0.5, -1, 0.4).applyQuaternion(this.bodyQ);
        this.bend.addScaledVector(this.dir, -this.bend.dot(this.dir));
        if (this.bend.lengthSq() < 1e-6) this.bend.set(s, 0, 0).applyQuaternion(this.bodyQ);
        this.bend.normalize();
        this.elbow.copy(this.shoulder).addScaledVector(this.dir, along).addScaledVector(this.bend, out);
        const up = a.upper[i];
        up.position.copy(this.shoulder);
        up.quaternion.setFromUnitVectors(DOWN, this.tmpV.subVectors(this.elbow, this.shoulder).normalize());
        // The forearm runs to the hand itself; beyond reach it stretches (a rubber band).
        const fore = a.fore[i];
        this.tmpV.subVectors(this.hand, this.elbow);
        const fl = this.tmpV.length();
        fore.position.copy(this.elbow);
        fore.quaternion.setFromUnitVectors(DOWN, this.tmpV.divideScalar(fl || 1));
        fore.scale.set(1, Math.max(0.2, fl / L2), 1);
        // Turned as their real hand is (VR); otherwise along the forearm.
        if (hq && hand) mesh.quaternion.slerp(this.tmpQ.set(hq[0], hq[1], hq[2], hq[3]), Math.min(1, dt * 20));
        else mesh.quaternion.setFromUnitVectors(FWD, this.tmpV);
      }
    }
    for (const [id, a] of this.avatars) if (!seen.has(id)) this.remove(id, a);
  }

  private remove(id: EntityId, a: Avatar): void {
    a.root.removeFromParent();
    a.laser.root.removeFromParent();
    (a.tag.material.map as THREE.Texture).dispose();
    a.tag.material.dispose();
    for (const m of [a.face, a.torso, ...a.upper, ...a.fore, a.left, a.right]) m.geometry.dispose();
    this.avatars.delete(id);
  }

  private create(id: EntityId, look: number): Avatar {
    const color = playerColor(id);
    const l = decodeLook(look);
    const mat = (figureMat ??= flatVertexColorMaterial());
    const root = new THREE.Group();
    root.name = `avatar:${id}`;
    const head = new THREE.Group();
    const face = new THREE.Mesh(headGeometry(l, color), mat);
    head.add(face);
    const torso = new THREE.Mesh(torsoGeometry(l, color), mat);
    const c = CONFIG.avatar;
    const upper: [THREE.Mesh, THREE.Mesh] = [new THREE.Mesh(armGeometry(l, c.upperArm, false), mat), new THREE.Mesh(armGeometry(l, c.upperArm, false), mat)];
    const fore: [THREE.Mesh, THREE.Mesh] = [new THREE.Mesh(armGeometry(l, c.forearm, true), mat), new THREE.Mesh(armGeometry(l, c.forearm, true), mat)];
    const left = new THREE.Mesh(gloveGeometry(l, -1), mat);
    const right = new THREE.Mesh(gloveGeometry(l, 1), mat);
    // Name tag: a camera-facing sprite above the head, redrawn when the name changes.
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
    tag.scale.set(0.6, 0.15, 1);
    tag.userData.color = color;
    root.add(head, torso, ...upper, ...fore, left, right, tag);
    const a: Avatar = { root, head, face, torso, upper, fore, left, right, bodyYaw: 0, look, frame: null, tag, tagName: '', tool: null, toolKey: '', laser: new LaserBeam(color) };
    this.avatars.set(id, a);
    return a;
  }
}

/** An angle wrapped to -pi..pi. */
function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function snap(a: Avatar, feet: number[], av: WorldState['players'][string]['avatar']): void {
  a.root.position.fromArray(feet);
  if (av) {
    a.head.position.set(av.head[0] - feet[0], av.head[1] - feet[1], av.head[2] - feet[2]);
    a.head.quaternion.set(av.head[3], av.head[4], av.head[5], av.head[6]);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(a.head.quaternion);
    a.bodyYaw = Math.atan2(-f.x, -f.z);
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

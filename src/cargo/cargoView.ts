import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { kindOf, lashPointFor, portById, type CargoItem } from './cargo';

const MAX = 48;
const STRAP = 0xe8641c;

/** Where a carried item is drawn: the middle of its base, and its orientation (world). */
export type CarriedPose = (item: CargoItem) => { pos: THREE.Vector3; quat: THREE.Quaternion } | null;

/**
 * Every cargo item, one instanced draw call per shape (boxes, drums) plus one for the
 * lashing straps: waiting ashore, riding a deck, or in someone's hands. Sized by kind,
 * coloured by destination (the port's colour), with pale bands so it reads as packaged
 * goods. The item a hand is on is drawn brighter. Lashing points (D-rings) are baked onto
 * each vessel once (`attachVessel`).
 */
export class CargoView {
  readonly root = new THREE.Group();
  private readonly boxes: THREE.InstancedMesh;
  private readonly drums: THREE.InstancedMesh;
  private readonly straps: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly qYaw = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();

  constructor() {
    // Unit shapes (1 m) standing on their base, with pale bands.
    const box = mergeParts([
      part(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), 0xffffff),
      part(new THREE.BoxGeometry(1.02, 0.08, 1.02).translate(0, 0.55, 0), 0xf2ead8),
      part(new THREE.BoxGeometry(1.02, 0.06, 1.02).translate(0, 0.97, 0), 0xf2ead8),
    ]);
    const drum = mergeParts([
      part(new THREE.CylinderGeometry(0.5, 0.5, 1, 12).translate(0, 0.5, 0), 0xffffff),
      part(new THREE.CylinderGeometry(0.515, 0.515, 0.05, 12).translate(0, 0.33, 0), 0xf2ead8),
      part(new THREE.CylinderGeometry(0.515, 0.515, 0.05, 12).translate(0, 0.67, 0), 0xf2ead8),
    ]);
    const mat = flatVertexColorMaterial();
    this.boxes = new THREE.InstancedMesh(box, mat, MAX);
    this.drums = new THREE.InstancedMesh(drum, mat, MAX);
    // Strap: a unit box on its base; bands round an item and ties down to its D-ring.
    this.straps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: STRAP }), MAX * 3);
    for (const im of [this.boxes, this.drums, this.straps]) {
      im.frustumCulled = false;
      im.count = 0;
      this.root.add(im);
    }
    this.root.name = 'cargo';
  }

  /** D-rings on a vessel's deck, baked into its root (one small draw call). */
  attachVessel(root: THREE.Object3D, defId: string): void {
    const def = VESSEL_DEFS[defId];
    const plan = def.hull.stations;
    const deckY = (z: number) => {
      for (let i = 0; i < plan.length - 1; i++) {
        if (z <= plan[i].z && z >= plan[i + 1].z) {
          const t = (plan[i].z - z) / (plan[i].z - plan[i + 1].z);
          return plan[i].polygon[0][1] + (plan[i + 1].polygon[0][1] - plan[i].polygon[0][1]) * t;
        }
      }
      return plan[0].polygon[0][1];
    };
    const parts = def.cargo.lashPoints.map(([x, z]) =>
      part(new THREE.TorusGeometry(0.05, 0.012, 5, 10).rotateY(Math.abs(x) > 0.1 ? 0 : Math.PI / 2).translate(x, deckY(z) + 0.05, z), 0xd8d0b0),
    );
    const mesh = new THREE.Mesh(mergeParts(parts), flatVertexColorMaterial());
    mesh.name = 'lashPoints';
    root.add(mesh);
  }

  /**
   * @param vesselRoots each vessel's interpolated root (deck cargo rides it)
   * @param carried     where items in hands are (local hands, or remote avatars' hands)
   * @param hovered     id of the item a hand or the reticle is on (drawn brighter)
   */
  update(world: WorldState, vesselRoots: Map<string, THREE.Object3D>, carried: CarriedPose, hovered: string | null): void {
    let nb = 0;
    let nd = 0;
    let ns = 0;
    for (const c of Object.values(world.cargo)) {
      const kind = kindOf(c);
      const [sx, sy, sz] = kind.size;
      let root: THREE.Object3D | null = null;
      if ('ground' in c.at) {
        this.p.fromArray(c.at.ground);
        this.q.setFromAxisAngle(this.up, c.at.yaw);
      } else if ('vessel' in c.at) {
        root = vesselRoots.get(c.at.vessel) ?? null;
        if (!root) continue;
        root.localToWorld(this.p.fromArray(c.at.pos));
        root.getWorldQuaternion(this.q).multiply(this.qYaw.setFromAxisAngle(this.up, c.at.yaw));
      } else {
        const pose = carried(c);
        if (!pose) continue;
        this.p.copy(pose.pos);
        this.q.copy(pose.quat);
      }
      const drum = kind.shape === 'drum';
      const im = drum ? this.drums : this.boxes;
      const i = drum ? nd++ : nb++;
      if (i >= MAX) continue;
      this.m.compose(this.p, this.q, this.scale.set(sx, sy, sz));
      im.setMatrixAt(i, this.m);
      this.color.set(portById(c.to)?.cargo.color ?? 0x888888);
      if (c.id === hovered) this.color.offsetHSL(0, 0, 0.18);
      im.setColorAt(i, this.color);

      // Lashed: two bands round it and a tie down to its D-ring.
      if (root && 'vessel' in c.at && c.at.lashed && ns + 3 <= MAX * 3) {
        for (const off of [-0.25, 0.25]) {
          this.a.set(0, -0.01, off * sz).applyQuaternion(this.q).add(this.p);
          this.m.compose(this.a, this.q, this.scale.set(sx + 0.03, sy + 0.025, 0.05));
          this.straps.setMatrixAt(ns++, this.m);
        }
        const v = world.vessels[c.at.vessel];
        const lp = v && lashPointFor(v, c);
        if (lp) {
          // From the ring up to the item's top edge on that side.
          root.localToWorld(this.a.set(lp[0], c.at.pos[1] + 0.05, lp[1]));
          const dir = this.b.set(lp[0] - c.at.pos[0], 0, lp[1] - c.at.pos[2]);
          const len = dir.length();
          dir.multiplyScalar(len > 1e-3 ? Math.min(1, Math.max(sx, sz) / 2 / len) : 0);
          root.localToWorld(this.b.set(c.at.pos[0] + dir.x, c.at.pos[1] + sy, c.at.pos[2] + dir.z));
          const span = this.b.clone().sub(this.a);
          this.qYaw.setFromUnitVectors(this.up, span.clone().normalize());
          this.m.compose(this.a, this.qYaw, this.scale.set(0.05, span.length(), 0.012));
          this.straps.setMatrixAt(ns++, this.m);
        }
      }
    }
    this.boxes.count = Math.min(nb, MAX);
    this.drums.count = Math.min(nd, MAX);
    this.straps.count = ns;
    for (const im of [this.boxes, this.drums, this.straps]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}


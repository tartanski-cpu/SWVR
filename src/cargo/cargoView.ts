import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { CONFIG } from '../config';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { kindOf, lashPointFor, portById, type CargoItem } from './cargo';
import { hasUpgrade } from '../career/career';

const MAX = 48;
const STRAP = 0xe8641c;

/**
 * A fish box from the trawl (owner request), built at the fish box's real size (m): an open
 * wooden box of two slats a side with darker corner posts, a bed of ice if she has the ice
 * machine (career upgrade 'ice'; without, the fish lie on the bare boards), and a few fish
 * lying in it - plain blocks with a tail, in different colours (cod grey, mackerel blue,
 * haddock brown, red gurnard, silver whiting). Origin at the middle of its base.
 */
function fishBoxGeometry(size: readonly number[], ice: boolean): THREE.BufferGeometry {
  const [L, H, W] = size;
  const wood = 0xb07a40;
  const post = 0x7a5028;
  const t = 0.02;
  const slatH = (H - 0.035) / 2;
  const parts = [part(new THREE.BoxGeometry(L, 0.02, W).translate(0, 0.01, 0), post)]; // bottom
  for (let k = 0; k < 2; k++) {
    const y = 0.02 + slatH / 2 + k * (slatH + 0.012);
    for (const s of [-1, 1]) {
      parts.push(part(new THREE.BoxGeometry(L - 0.04, slatH, t).translate(0, y, s * (W / 2 - t / 2)), wood)); // long sides
      parts.push(part(new THREE.BoxGeometry(t, slatH, W - 0.04).translate(s * (L / 2 - t / 2), y, 0), wood)); // ends
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(part(new THREE.BoxGeometry(0.035, H, 0.035).translate(sx * (L / 2 - 0.0175), H / 2, sz * (W / 2 - 0.0175)), post));
  if (ice) parts.push(part(new THREE.BoxGeometry(L - 0.05, 0.05, W - 0.05).translate(0, 0.045, 0), 0xe4eef2)); // ice
  // The fish: length, colour, position along / across, yaw; heads and tails alternating.
  const fish: [number, number, number, number, number][] = [
    [0.42, 0xa8b0b4, -0.1, -0.13, 0.08],
    [0.36, 0x3e6e80, 0.12, -0.04, -0.1],
    [0.4, 0x8a7a64, -0.06, 0.06, 0.05],
    [0.3, 0xc4563c, 0.16, 0.14, 0.2],
    [0.34, 0xc8d0d6, -0.14, 0.15, -0.06],
    [0.38, 0x5a7a86, 0.05, 0.02, 3.2],
  ];
  fish.forEach(([len, c, x, z, yaw], i) => {
    const y = (ice ? 0.095 : 0.045) + (i % 3) * 0.018;
    const body = new THREE.BoxGeometry(len * 0.82, 0.05, len * 0.24).translate(-len * 0.09, 0, 0);
    const tail = new THREE.BoxGeometry(len * 0.16, 0.035, len * 0.26).translate(len * 0.41, 0, 0);
    parts.push(part(body.rotateY(yaw).translate(x * L, y, z * W), c));
    parts.push(part(tail.rotateY(yaw).translate(x * L, y, z * W), new THREE.Color(c).multiplyScalar(0.75).getHex()));
  });
  return mergeParts(parts);
}

/** Where a carried item is drawn: the middle of its base, and its orientation (world). */
export type CarriedPose = (item: CargoItem) => { pos: THREE.Vector3; quat: THREE.Quaternion } | null;

/**
 * Every cargo item, one instanced draw call per shape (boxes, drums, the trawl's fish boxes) plus one for the
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
  /** The trawl's catch: wooden fish boxes (built at the fish box's real size), bare and iced. */
  private readonly fishBoxes: THREE.InstancedMesh;
  private readonly icedBoxes: THREE.InstancedMesh;
  private readonly fishSize: readonly number[];
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
      // Just below the lid, not flush with it (a band flush with the lid flickered against it).
      part(new THREE.BoxGeometry(1.02, 0.06, 1.02).translate(0, 0.95, 0), 0xf2ead8),
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
    this.fishSize = CONFIG.cargo.kinds.find((k) => k.name === 'Fish box')?.size ?? [0.8, 0.3, 0.5];
    this.fishBoxes = new THREE.InstancedMesh(fishBoxGeometry(this.fishSize, false), mat, MAX);
    this.icedBoxes = new THREE.InstancedMesh(fishBoxGeometry(this.fishSize, true), mat, MAX);
    for (const im of [this.boxes, this.drums, this.straps, this.fishBoxes, this.icedBoxes]) {
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
    if (!parts.length) return; // no D-rings (the skiff)
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
    let nf = 0;
    // With the ice machine the catch goes on ice (the boxes on deck show it as soon as it's bought).
    const iced = hasUpgrade(world, 'ice');
    const fishMesh = iced ? this.icedBoxes : this.fishBoxes;
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
      const fishBox = c.from === 'trawl';
      const drum = kind.shape === 'drum';
      const im = fishBox ? fishMesh : drum ? this.drums : this.boxes;
      const i = fishBox ? nf++ : drum ? nd++ : nb++;
      if (i >= MAX) continue;
      if (fishBox) {
        // Its own colours (built in); brighter while a hand is on it.
        this.m.compose(this.p, this.q, this.scale.set(sx / this.fishSize[0], sy / this.fishSize[1], sz / this.fishSize[2]));
        im.setMatrixAt(i, this.m);
        im.setColorAt(i, this.color.setScalar(c.id === hovered ? 1.35 : 1));
      } else {
        this.m.compose(this.p, this.q, this.scale.set(sx, sy, sz));
        im.setMatrixAt(i, this.m);
        // Cargo fished out of the sea (bound for 'any' harbour) stays rescue orange.
        this.color.set(c.to === 'any' ? 0xff6a10 : (portById(c.to)?.cargo.color ?? 0x888888));
        if (c.id === hovered) this.color.offsetHSL(0, 0, 0.18);
        im.setColorAt(i, this.color);
      }

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
    fishMesh.count = Math.min(nf, MAX);
    (iced ? this.fishBoxes : this.icedBoxes).count = 0;
    for (const im of [this.boxes, this.drums, this.straps, this.fishBoxes, this.icedBoxes]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}


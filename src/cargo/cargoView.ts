import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { CONFIG } from '../config';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { kindOf, lashPointFor, portById, type CargoItem } from './cargo';
import { hasUpgrade } from '../career/career';
import { bootGeometry, crabGeometry, floorSlot, lobsterGeometry, smallFishGeometry, starfishGeometry } from '../potting/catchGeometry';

const MAX = 48;
const MAX_ANIMALS = 96;
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
  // The fish, filling the floor: three rows across the box, two head to tail in each
  // (length, colour, position along and across the box (m), yaw), a slight skew each.
  const fish: [number, number, number, number, number][] = [
    [0.34, 0xa8b0b4, -0.19, -0.14, 0.05],
    [0.32, 0x3e6e80, 0.18, -0.15, 3.1],
    [0.36, 0x8a7a64, -0.17, 0.0, 3.2],
    [0.3, 0xc4563c, 0.2, 0.01, -0.06],
    [0.33, 0xc8d0d6, -0.18, 0.145, -0.04],
    [0.34, 0x5a7a86, 0.18, 0.14, 3.18],
  ];
  fish.forEach(([len, c, x, z, yaw], i) => {
    const y = (ice ? 0.095 : 0.045) + (i % 2) * 0.004;
    const body = new THREE.BoxGeometry(len * 0.82, 0.05, len * 0.24).translate(-len * 0.09, 0, 0);
    const tail = new THREE.BoxGeometry(len * 0.16, 0.035, len * 0.26).translate(len * 0.41, 0, 0);
    parts.push(part(body.rotateY(yaw).translate(x, y, z), c));
    parts.push(part(tail.rotateY(yaw).translate(x, y, z), new THREE.Color(c).multiplyScalar(0.75).getHex()));
  });
  return mergeParts(parts);
}

/**
 * A lobster / crab pot (creel), built at its real size (m), origin at the middle of its
 * base: a rectangular base frame, a half-round body of netting over hoops, a rope bridle,
 * the line coiled on top and the marker buoy (with its little flag) tied on. The netting is
 * drawn as an open lattice of cords (owner: you should see the crabs inside), with a solid
 * dark floor. Unrigged (`rigged` false): no coil or buoy on top (a pot coming up on its
 * line, its buoy already aboard).
 */
export function potGeometry(size: readonly number[], rigged = true): THREE.BufferGeometry {
  const [L, , W] = size;
  const frame = 0x3a4a3e;
  const hoop = 0x8a9a7a;
  const net = 0x24342c;
  const rope = 0xe0b440;
  const r = W / 2 - 0.02;
  const body = L - 0.06;
  const parts = [
    // Base frame: two long rails and two ends (weighted bars), and the floor.
    ...[-1, 1].map((s) => part(new THREE.BoxGeometry(L, 0.035, 0.035).translate(0, 0.018, s * (W / 2 - 0.018)), frame)),
    ...[-1, 1].map((s) => part(new THREE.BoxGeometry(0.035, 0.035, W).translate(s * (L / 2 - 0.018), 0.018, 0), frame)),
    part(new THREE.BoxGeometry(L - 0.04, 0.01, W - 0.04).translate(0, 0.012, 0), net),
    // Hoops over it: three stout ones, and lighter cords of netting between.
    ...[-0.3, 0, 0.3].map((f) => part(new THREE.TorusGeometry(r + 0.008, 0.009, 4, 12, Math.PI).rotateY(Math.PI / 2).translate(f * L, 0.035, 0), hoop)),
    ...[-0.46, -0.15, 0.15, 0.46].map((f) => part(new THREE.TorusGeometry(r, 0.004, 3, 10, Math.PI).rotateY(Math.PI / 2).translate(f * body, 0.035, 0), net)),
    // Cords along the pot, round the half-round.
    ...[1, 2, 3, 4, 5, 6].map((k) => {
      const a = (k * Math.PI) / 7;
      return part(new THREE.BoxGeometry(body, 0.006, 0.006).translate(0, 0.035 + Math.sin(a) * r, Math.cos(a) * r), net);
    }),
    // The ends: a few cords up each.
    ...[-1, 1].flatMap((s) => [-0.5, 0, 0.5].map((f) => part(new THREE.BoxGeometry(0.006, r * Math.sqrt(1 - f * f), 0.006).translate(s * body / 2, 0.035 + (r * Math.sqrt(1 - f * f)) / 2, f * r), net))),
    // The entrance eye on top (a ring in the netting).
    part(new THREE.TorusGeometry(0.06, 0.012, 4, 10).rotateX(Math.PI / 2).translate(0, 0.035 + r + 0.005, 0), hoop),
    // Bridle: two ropes from the ends up to a point above the middle.
    ...[-1, 1].map((s) => part(new THREE.CylinderGeometry(0.006, 0.006, Math.hypot(L / 2, 0.08), 4).rotateZ(s * (Math.PI / 2 - Math.atan2(0.08, L / 2))).translate(s * L / 4, 0.035 + r + 0.04, 0), rope)),
  ];
  if (rigged) {
    // The line coiled on top, and the buoy with its pole.
    parts.push(
      part(new THREE.TorusGeometry(0.09, 0.022, 5, 12).rotateX(Math.PI / 2).translate(-L * 0.18, 0.035 + r + 0.03, 0.02), rope),
      part(new THREE.SphereGeometry(0.075, 10, 7).translate(L * 0.22, 0.035 + r + 0.07, 0.0), 0xf26a1a),
      part(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 4).rotateZ(-1.1).translate(L * 0.22 + 0.1, 0.035 + r + 0.12, 0), 0x2a2e33),
    );
  }
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
  /** Lobster / crab pots (built at the pot's real size). */
  private readonly pots: THREE.InstancedMesh;
  private readonly potSize: readonly number[];
  /** The catch in hauled pots, seen through the netting. */
  private readonly crabs: THREE.InstancedMesh;
  private readonly lobsters: THREE.InstancedMesh;
  private readonly bycatch: Record<'fish' | 'starfish' | 'boot', THREE.InstancedMesh>;
  private readonly floor = new THREE.Vector3();
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
    this.potSize = CONFIG.cargo.kinds.find((k) => k.name === 'Pot')?.size ?? [0.75, 0.42, 0.5];
    this.pots = new THREE.InstancedMesh(potGeometry(this.potSize), mat, MAX);
    this.crabs = new THREE.InstancedMesh(crabGeometry(), mat, MAX_ANIMALS);
    this.lobsters = new THREE.InstancedMesh(lobsterGeometry(), mat, MAX_ANIMALS / 2);
    this.bycatch = { fish: new THREE.InstancedMesh(smallFishGeometry(), mat, 8), starfish: new THREE.InstancedMesh(starfishGeometry(), mat, 8), boot: new THREE.InstancedMesh(bootGeometry(), mat, 8) };
    for (const im of this.meshes()) {
      im.frustumCulled = false;
      im.count = 0;
      this.root.add(im);
    }
    this.root.name = 'cargo';
  }

  private meshes(): THREE.InstancedMesh[] {
    return [this.boxes, this.drums, this.straps, this.fishBoxes, this.icedBoxes, this.pots, this.crabs, this.lobsters, ...Object.values(this.bycatch)];
  }

  /**
   * Animals on a floor (an open pot's base, a catch crate's boards): `p`/`q` the container's
   * base pose, `y` the floor's height in it, L x W its size. Lobsters first, then crabs,
   * then any bycatch.
   */
  private drawCatch(crab: number, lobster: number, extra: 'fish' | 'starfish' | 'boot' | null, y: number, L: number, W: number, n: { crab: number; lobster: number; extra: Record<string, number> }): void {
    const total = crab + lobster + (extra ? 1 : 0);
    for (let i = 0; i < total; i++) {
      const im = i < lobster ? this.lobsters : i < lobster + crab ? this.crabs : this.bycatch[extra!];
      const key = im === this.lobsters ? 'lobster' : im === this.crabs ? 'crab' : null;
      const k = key ? n[key] : (n.extra[extra!] ?? 0);
      if (k >= im.instanceMatrix.count) continue;
      const [x, z, yaw] = floorSlot(i, total, L, W);
      this.floor.set(x, y + (i % 3) * 0.004, z).applyQuaternion(this.q).add(this.p);
      this.m.compose(this.floor, this.qYaw.setFromAxisAngle(this.up, yaw).premultiply(this.q), this.scale.set(1, 1, 1));
      im.setMatrixAt(k, this.m);
      if (key) n[key]++;
      else n.extra[extra!] = k + 1;
    }
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
    let np = 0;
    const n = { crab: 0, lobster: 0, extra: {} as Record<string, number> };
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
      const pot = kind.shape === 'pot';
      const drum = kind.shape === 'drum';
      const im = pot ? this.pots : fishBox ? fishMesh : drum ? this.drums : this.boxes;
      const i = pot ? np++ : fishBox ? nf++ : drum ? nd++ : nb++;
      if (i >= MAX) continue;
      // A hauled pot's catch, on its floor (seen through the netting).
      if (pot && c.pot) this.drawCatch(c.pot.crab, c.pot.lobster, c.pot.bycatch, 0.018, this.potSize[0] - 0.14, this.potSize[2] - 0.16, n);
      if (pot) {
        this.m.compose(this.p, this.q, this.scale.set(sx / this.potSize[0], sy / this.potSize[1], sz / this.potSize[2]));
        im.setMatrixAt(i, this.m);
        im.setColorAt(i, this.color.setScalar(c.id === hovered ? 1.4 : 1));
      } else if (im === fishMesh) {
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
    this.pots.count = Math.min(np, MAX);
    this.crabs.count = n.crab;
    this.lobsters.count = n.lobster;
    for (const [k, im] of Object.entries(this.bycatch)) im.count = n.extra[k] ?? 0;
    (iced ? this.fishBoxes : this.icedBoxes).count = 0;
    for (const im of this.meshes()) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}


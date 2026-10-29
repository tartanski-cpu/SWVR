import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { CONFIG } from '../config';
import { fitPaint, flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { kindOf, portById, type CargoItem } from './cargo';
import { hasUpgrade } from '../career/career';
import { hookOnBoat } from './craneHook';
import { TickSmoother } from '../mechanisms/tickSmoother';
import { bootGeometry, crabGeometry, floorSlot, lobsterGeometry, smallFishGeometry, starfishGeometry } from '../potting/catchGeometry';
import { levelOf } from './stack';
import { isProjectItem } from '../career/projects';

/** A hooked load's drawn position jumps (m), not followed: a reset, a fresh snapshot. A lift's step onto the hook (CONFIG.modules.deckCrane.hookReach, 0.6 m) is followed. */
const HOOK_SNAP = 1.5;

/**
 * Items drawn of each shape at most (one instanced draw each). Goods waiting ashore are drawn
 * only within CONFIG.cargo.drawRange of you: every port keeps a dozen or more (more cargo,
 * Oct 2026), and taken in the world's order the far ports' filled the meshes before yours.
 */
const MAX = 128;
const MAX_ANIMALS = 96;
const STRAP = 0xe8641c;

/**
 * A fish box from the trawl (owner request), built at the fish box's real size (m): an open
 * wooden box of two slats a side with darker corner posts, a bed of ice if she has the ice
 * machine (career upgrade 'ice'; without, the fish lie on the bare boards), and a few fish
 * lying in it - plain blocks with a tail, in different colours (cod grey, mackerel blue,
 * haddock brown, red gurnard, silver whiting). Origin at the middle of its base.
 */
export function fishBoxGeometry(size: readonly number[], ice: boolean): THREE.BufferGeometry {
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
 * A lobster / crab pot, built at its real size (m), origin at the middle of its base (owner,
 * 29 Oct 2026: "the fishing pots to stack ... they could be square"): a square wire trap,
 * green plastic-coated mesh on a stout frame, orange rope laced along its top edges, two dark
 * runners under it, a mesh divider across its middle (the kitchen and the parlour), two net
 * funnels in from its sides and a door on top. Its top is flat, so pots stack. The mesh is an
 * open lattice of wires (you see the crabs inside) over a solid dark floor. Rigged: its line
 * coiled on one end and its marker buoy tied beside it, below the top (unrigged, `rigged`
 * false: a pot coming up on its line, its buoy already aboard).
 */
export function potGeometry(size: readonly number[], rigged = true): THREE.BufferGeometry {
  const [L, H, W] = size;
  const wire = 0x1f7a66;
  const frame = 0x165a4c;
  const rope = 0xf06a20;
  const runner = 0x1c1e20;
  const net = 0x22332c;
  const pitch = 0.09; // mesh spacing (m)
  const t = 0.005; // a wire's thickness
  const parts: THREE.BufferGeometry[] = [];
  const bar = (sx: number, sy: number, sz: number, x: number, y: number, z: number, c: number) => parts.push(part(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), c));
  /** Positions across a span (m), one every `pitch`, not at its edges. */
  const across = (span: number) => {
    const n = Math.max(1, Math.round(span / pitch));
    return Array.from({ length: n - 1 }, (_, i) => -span / 2 + ((i + 1) * span) / n);
  };
  const y0 = 0.03; // the mesh starts on the runners
  const h = H - y0;
  const ym = y0 + h / 2;
  // The frame: its twelve edges.
  const f = 0.014;
  for (const sy of [y0, H - f / 2]) for (const sz of [-1, 1]) bar(L, f, f, 0, sy, sz * (W / 2 - f / 2), frame);
  for (const sy of [y0, H - f / 2]) for (const sx of [-1, 1]) bar(f, f, W, sx * (L / 2 - f / 2), sy, 0, frame);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(f, h, f, sx * (L / 2 - f / 2), ym, sz * (W / 2 - f / 2), frame);
  // The mesh: the top, the two long sides and the two ends.
  for (const z of across(W)) bar(L, t, t, 0, H - t, z, wire);
  for (const x of across(L)) bar(t, t, W, x, H - t, 0, wire);
  for (const sz of [-1, 1]) {
    for (const x of across(L)) bar(t, h, t, x, ym, sz * W / 2, wire);
    for (const y of across(h)) bar(L, t, t, 0, y0 + h / 2 + y, sz * W / 2, wire);
  }
  for (const sx of [-1, 1]) {
    for (const z of across(W)) bar(t, h, t, sx * L / 2, ym, z, wire);
    for (const y of across(h)) bar(t, t, W, sx * L / 2, y0 + h / 2 + y, 0, wire);
  }
  // The floor (solid, dark: the catch sits on it) and the runners under it, along each side.
  bar(L - 0.02, 0.01, W - 0.02, 0, 0.018, 0, net);
  for (const sz of [-1, 1]) bar(L, 0.03, 0.05, 0, 0.015, sz * (W / 2 - 0.03), runner);
  // Orange rope laced along the top edges.
  for (const sz of [-1, 1]) bar(L + 0.01, 0.012, 0.012, 0, H - 0.004, sz * (W / 2), rope);
  for (const sx of [-1, 1]) bar(0.012, 0.012, W + 0.01, sx * (L / 2), H - 0.004, 0, rope);
  // The divider across its middle (kitchen forward, parlour aft): a frame and a few wires.
  const xd = L * 0.08;
  for (const sz of [-1, 1]) bar(f * 0.7, h, f * 0.7, xd, ym, sz * (W / 2 - 0.02), frame);
  bar(f * 0.7, f * 0.7, W - 0.02, xd, H - 0.02, 0, frame);
  for (const z of across(W)) bar(t, h, t, xd, ym, z, wire);
  // The two funnels (heads) in from the sides into the kitchen, and the door on the kitchen's top.
  for (const sz of [-1, 1]) {
    parts.push(part(new THREE.ConeGeometry(0.06, 0.13, 6, 1, true).rotateX((sz * Math.PI) / 2).translate(-L * 0.2, y0 + h * 0.42, sz * (W / 2 - 0.065)), 0x4a7a68));
  }
  const dx = -L * 0.2;
  for (const sz of [-1, 1]) bar(0.22, 0.012, 0.01, dx, H + 0.002, sz * 0.1, frame);
  for (const sx of [-1, 1]) bar(0.01, 0.012, 0.2, dx + sx * 0.11, H + 0.002, 0, frame);
  // A yellow bungee holding the door shut.
  bar(0.008, 0.008, 0.16, dx + 0.13, H + 0.006, 0, 0xe8c020);
  if (rigged) {
    // The line coiled and hung on its parlour end, and the buoy with its pole tied beside it,
    // below the top so a pot stacks on it.
    const xe = L / 2 + 0.03;
    parts.push(
      part(new THREE.TorusGeometry(0.1, 0.022, 5, 12).rotateY(Math.PI / 2).translate(xe, y0 + h * 0.5, -W * 0.12), 0xe0b440),
      part(new THREE.SphereGeometry(0.07, 10, 7).translate(xe + 0.05, 0.08, W * 0.26), 0xf26a1a),
      part(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 4).rotateZ(-0.35).translate(xe + 0.08, 0.2, W * 0.26), 0x2a2e33),
    );
  }
  return mergeParts(parts);
}

/** Where a carried item is drawn: the middle of its base, and its orientation (world). */
export type CarriedPose = (item: CargoItem) => { pos: THREE.Vector3; quat: THREE.Quaternion } | null;

/**
 * Every cargo item, one instanced draw call per shape (crates, sacks, drums, the trawl's fish
 * boxes) plus one for the lashing straps: waiting ashore, riding a deck, or in someone's
 * hands. Sized by kind, coloured by destination (the port's colour), with the detail painted
 * on (pixel paint: a crate's boards, sacking, a drum's worn paint). The item a hand is on is drawn brighter.
 */
export class CargoView {
  readonly root = new THREE.Group();
  private readonly boxes: THREE.InstancedMesh;
  private readonly drums: THREE.InstancedMesh;
  /** Sacks: drawn only when there are some (an empty instanced mesh costs nothing). */
  private readonly sacks: THREE.InstancedMesh;
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
  private readonly prev = new THREE.Vector3();
  /** Each load on a crane hook's smoothing (its hook in her axes), and where each item was last drawn (world). */
  private readonly hooked = new Map<string, TickSmoother>();
  private readonly drawnAt = new Map<string, THREE.Vector3>();
  private readonly qYaw = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly base = new THREE.Vector3();

  constructor() {
    // Unit shapes (1 m) standing on their base. A box is a crate, each face painted as one
    // whole crate side (frame, planks, brace: pixel painting, step 2); a sack is a box of
    // sacking; a drum's paint is worn.
    const box = mergeParts([fitPaint(part(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), 0xffffff, 'crate'))]);
    const sack = mergeParts([part(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), 0xffffff, 'sacking')]);
    const drum = mergeParts([
      part(new THREE.CylinderGeometry(0.5, 0.5, 1, 12).translate(0, 0.5, 0), 0xffffff, 'worn'),
      part(new THREE.CylinderGeometry(0.515, 0.515, 0.05, 12).translate(0, 0.33, 0), 0xf2ead8),
      part(new THREE.CylinderGeometry(0.515, 0.515, 0.05, 12).translate(0, 0.67, 0), 0xf2ead8),
    ]);
    const mat = flatVertexColorMaterial();
    this.boxes = new THREE.InstancedMesh(box, mat, MAX);
    this.sacks = new THREE.InstancedMesh(sack, mat, MAX);
    this.drums = new THREE.InstancedMesh(drum, mat, MAX);
    // Strap: a unit box on its base; bands round an item and ties down to its D-ring.
    this.straps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: STRAP }), MAX * 6);
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
    return [this.boxes, this.sacks, this.drums, this.straps, this.fishBoxes, this.icedBoxes, this.pots, this.crabs, this.lobsters, ...Object.values(this.bycatch)];
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

  /**
   * @param vesselRoots each vessel's interpolated root (deck cargo rides it)
   * @param carried     where items in hands are (local hands, or remote avatars' hands)
   * @param hovered     id of the item a hand or the reticle is on (drawn brighter)
   */
  update(world: WorldState, vesselRoots: Map<string, THREE.Object3D>, carried: CarriedPose, hovered: string | null, viewer?: THREE.Vector3, dt = 1 / 60): void {
    const range = CONFIG.cargo.drawRange;
    let nb = 0;
    let nk = 0;
    let nd = 0;
    let ns = 0;
    let nf = 0;
    let np = 0;
    const n = { crab: 0, lobster: 0, extra: {} as Record<string, number> };
    // With the ice machine the catch goes on ice (the boxes on deck show it as soon as it's bought).
    const iced = hasUpgrade(world, 'ice');
    const fishMesh = iced ? this.icedBoxes : this.fishBoxes;
    const hooked = new Set<string>();
    // Items something is stacked on (their straps are drawn over the stack's top: cargo/stack.ts).
    const supporting = new Set<string>();
    for (const c of Object.values(world.cargo)) if ('vessel' in c.at && c.at.on) supporting.add(c.at.on);
    for (const c of Object.values(world.cargo)) {
      const kind = kindOf(c);
      const [sx, sy, sz] = kind.size;
      let root: THREE.Object3D | null = null;
      if ('ground' in c.at) {
        if (viewer && Math.hypot(c.at.ground[0] - viewer.x, c.at.ground[2] - viewer.z) > range) continue;
        this.p.fromArray(c.at.ground);
        this.q.setFromAxisAngle(this.up, c.at.yaw);
      } else if ('vessel' in c.at) {
        root = vesselRoots.get(c.at.vessel) ?? null;
        if (!root) continue;
        root.localToWorld(this.p.fromArray(c.at.pos));
        root.getWorldQuaternion(this.q).multiply(this.qYaw.setFromAxisAngle(this.up, c.at.yaw));
      } else if ('hook' in c.at) {
        // Hanging under her crane's hook (its base a load's height below the hook).
        const v = world.vessels[c.at.hook];
        root = vesselRoots.get(c.at.hook) ?? null;
        const hook = v && root ? hookOnBoat(v, c.at.crane, this.p) : null;
        if (!hook || !root) continue;
        // Drawn smoothly between the ticks, as the crane draws its hook (mechanisms/tickSmoother.ts;
        // owner, Oct 2026: the crane smooth but its load jerking): in her axes, so her own
        // motion is the app's. Just hooked, it starts where it was drawn and comes up onto the
        // hook (a lift's last half metre) instead of jumping.
        let sm = this.hooked.get(c.id);
        if (!sm) {
          sm = new TickSmoother([HOOK_SNAP, HOOK_SNAP, HOOK_SNAP]);
          this.hooked.set(c.id, sm);
          const was = this.drawnAt.get(c.id);
          if (was) sm.update(root.worldToLocal(this.prev.copy(was)).setY(this.prev.y + sy).toArray(), 0);
        }
        hook.fromArray(sm.update([hook.x, hook.y, hook.z], dt));
        hooked.add(c.id);
        root.localToWorld(hook.setY(hook.y - sy));
        root.getWorldQuaternion(this.q);
      } else {
        const pose = carried(c);
        if (!pose) continue;
        this.p.copy(pose.pos);
        this.q.copy(pose.quat);
      }
      (this.drawnAt.get(c.id) ?? this.drawnAt.set(c.id, new THREE.Vector3()).get(c.id)!).copy(this.p);
      const fishBox = c.from === 'trawl';
      const pot = kind.shape === 'pot';
      const drum = kind.shape === 'drum';
      // (Sacks, and a fish farm's big feed bags, net patches, mort bags and mussel bags: woven.)
      const sack = kind.name === 'Sack' || kind.name === 'Feed bag' || kind.name === 'Net patch' || kind.name === 'Mort bag' || kind.name === 'Mussel bag';
      const im = pot ? this.pots : fishBox ? fishMesh : drum ? this.drums : sack ? this.sacks : this.boxes;
      const i = pot ? np++ : fishBox ? nf++ : drum ? nd++ : sack ? nk++ : nb++;
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
        // A construction project's mark buoy: buoy yellow.
        this.color.set(c.to === 'any' ? 0xff6a10 : isProjectItem(c) ? 0xf0c418 : (portById(c.to)?.cargo.color ?? 0x888888));
        if (c.id === hovered) this.color.offsetHSL(0, 0, 0.18);
        im.setColorAt(i, this.color);
      }

      // Lashed (where it stands on open deck: no D-rings): two bands round it, each tied down
      // to the deck either side, as a ratchet strap is. A stack (cargo/stack.ts) is strapped
      // as one: the bands over its top item, down its whole height.
      if (root && 'vessel' in c.at && c.at.lashed && !supporting.has(c.id) && ns + 6 <= MAX * 6) {
        const below = c.at.on ? levelOf(world, c) - 1 : 0;
        const base = this.base.copy(this.up).multiplyScalar(-below * sy).applyQuaternion(this.q).add(this.p);
        const tall = sy * (below + 1);
        for (const off of [-0.25, 0.25]) {
          this.a.set(0, -0.01, off * sz).applyQuaternion(this.q).add(base);
          this.m.compose(this.a, this.q, this.scale.set(sx + 0.03, tall + 0.025, 0.05));
          this.straps.setMatrixAt(ns++, this.m);
          for (const side of [-1, 1]) {
            // From its top edge on that side out and down to the deck beside it.
            this.a.set(side * (sx / 2 + 0.22), 0, off * sz).applyQuaternion(this.q).add(base);
            this.b.set(side * (sx / 2), tall, off * sz).applyQuaternion(this.q).add(base);
            const span = this.b.clone().sub(this.a);
            this.qYaw.setFromUnitVectors(this.up, span.clone().normalize());
            this.m.compose(this.a, this.qYaw, this.scale.set(0.05, span.length(), 0.012));
            this.straps.setMatrixAt(ns++, this.m);
          }
        }
      }
    }
    // Loads off the hook (or gone) lose their smoothing; items gone, where they were drawn.
    for (const id of this.hooked.keys()) if (!hooked.has(id)) this.hooked.delete(id);
    for (const id of this.drawnAt.keys()) if (!world.cargo[id]) this.drawnAt.delete(id);
    this.boxes.count = Math.min(nb, MAX);
    this.sacks.count = Math.min(nk, MAX);
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


/**
 * Drawing the rescue gear: the life ring (orange and white, on its hook on the wheelhouse
 * aft wall, in someone's hand, flying, or floating), its line (a sagging curve from the
 * quarter cleat - not a rope simulation) and the boat hook (in its clips on the port
 * bulwark, or in someone's hand).
 *
 * The gear in the local player's hands is drawn where RescueHands holds it (no network
 * lag); other players' at their avatar's hand.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { gearOf } from '../boats/sims';
import type { RescueHands } from './rescueHands';
import { hookIn, ringIn } from './recovery';

export const ROPE_POINTS = 24;
const ROPE = 0xf0e6c0;
/** The line when a hand can take it, or is pulling it. */
const ROPE_LIT = 0xffd23a;

const tmpP = new THREE.Vector3();

/**
 * The line from the cleat to the ring, as drawn (and as hands find it): a parabola whose
 * depth grows with the slack (and a little always: it's rope); lying in the water it
 * floats on it. Writes ROPE_POINTS world points into `out`.
 */
export function ropePoints(cleat: THREE.Vector3, end: THREE.Vector3, line: number, inWater: boolean, waves: readonly PreparedWave[], out: Float32Array): void {
  const d = cleat.distanceTo(end);
  const len = inWater ? Math.max(line, d) : d + 1;
  const sag = Math.min(3, 0.15 + 0.5 * Math.sqrt(Math.max(0, len * len - d * d)));
  for (let i = 0; i < ROPE_POINTS; i++) {
    const s = i / (ROPE_POINTS - 1);
    const p = tmpP.lerpVectors(cleat, end, s);
    p.y -= sag * 4 * s * (1 - s);
    if (inWater) p.y = Math.max(p.y, surfaceHeight(waves, p.x, p.z) + 0.01);
    out[i * 3] = p.x;
    out[i * 3 + 1] = p.y;
    out[i * 3 + 2] = p.z;
  }
}

/** Where another player's hand / head is (world), if known. */
export interface AvatarHands {
  hand(playerId: string, out: THREE.Vector3): THREE.Vector3 | null;
  /** Their facing (world, horizontal unit vector). */
  facing(playerId: string, out: THREE.Vector3): THREE.Vector3 | null;
}

export class RescueGearView {
  readonly root = new THREE.Group();
  private readonly ring: THREE.Mesh;
  /** The rope: one thin cylinder per segment between the curve's points. */
  private readonly line: THREE.InstancedMesh;
  private readonly linePos: Float32Array;
  private readonly hook: THREE.Group;
  private readonly pole: THREE.Mesh;
  private readonly head: THREE.Mesh;
  private readonly tmp = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly zAxis = new THREE.Vector3(0, 0, 1);
  private readonly xAxis = new THREE.Vector3(1, 0, 0);
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private readonly qYaw = new THREE.Quaternion();
  private readonly segQ = new THREE.Quaternion();
  private readonly segM = new THREE.Matrix4();
  private readonly segS = new THREE.Vector3();

  constructor() {
    this.root.name = 'rescueGear';
    // Ring: a torus in the XY plane (faces +z), in alternating orange and white eighths,
    // coloured per vertex by angle.
    const torus = new THREE.TorusGeometry(0.3, 0.065, 8, 32);
    const colors: number[] = [];
    const pos = torus.attributes.position;
    const orange = new THREE.Color(0xff5a10);
    const white = new THREE.Color(0xf2f0e8);
    for (let i = 0; i < pos.count; i++) {
      const ang = Math.atan2(pos.getY(i), pos.getX(i)) + Math.PI;
      const c = Math.floor((ang / (Math.PI * 2)) * 8) % 2 ? white : orange;
      colors.push(c.r, c.g, c.b);
    }
    torus.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const ringMat = flatVertexColorMaterial();
    ringMat.emissive.setHex(0x2a1000);
    this.ring = new THREE.Mesh(torus, ringMat);
    this.ring.name = 'lifeRing';
    // Line.
    this.linePos = new Float32Array(ROPE_POINTS * 3);
    // Unit-length segment along +y from its origin; 2.5 cm thick so it's easy to see in VR.
    this.line = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.0125, 0.0125, 1, 5, 1, true).translate(0, 0.5, 0),
      new THREE.MeshLambertMaterial({ color: ROPE, emissive: 0x302a18 }),
      ROPE_POINTS - 1,
    );
    this.line.frustumCulled = false;
    // Boat hook: an ash pole along +z from its butt (origin), a galvanised hook at the end.
    const L = CONFIG.rescue.hookLength;
    // Two parts so it can telescope (auto-extend): the pole stretches, the head moves out.
    this.hook = new THREE.Group();
    this.pole = new THREE.Mesh(part(new THREE.CylinderGeometry(0.018, 0.02, L, 8).rotateX(Math.PI / 2).translate(0, 0, L / 2), 0xb08850), flatVertexColorMaterial());
    this.head = new THREE.Mesh(
      mergeParts([
        part(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6).rotateX(Math.PI / 2).translate(0, 0, 0.08), 0x9aa0a6),
        part(new THREE.TorusGeometry(0.06, 0.011, 6, 12, Math.PI).rotateY(Math.PI / 2).translate(0, -0.06, 0.12), 0x9aa0a6),
      ]),
      flatVertexColorMaterial(),
    );
    this.hook.add(this.pole, this.head);
    this.telescope(L);
    this.hook.name = 'boatHook';
    this.root.add(this.ring, this.line, this.hook);
  }

  update(world: WorldState, vesselId: string, vesselRoot: THREE.Object3D | undefined, waves: readonly PreparedWave[], local: RescueHands, localId: string, avatars: AvatarHands): void {
    const v = world.vessels[vesselId];
    this.root.visible = !!(v && vesselRoot);
    if (!v || !vesselRoot) return;
    // Her life ring station and boat-hook rack (modules): without one, nothing of it shows.
    const station = gearOf(v, 'lifeRing');
    const rack = gearOf(v, 'boatHook');
    this.ring.visible = !!station;
    this.hook.visible = !!rack;
    vesselRoot.getWorldQuaternion(this.q);
    const ring = ringIn(world, vesselId);
    const state = ring?.state ?? 'stowed';

    // ── Ring ──
    let inHand: THREE.Vector3 | null = null;
    if (local.holdingRing) inHand = local.ringPos;
    else if (state === 'held' && ring?.holder) inHand = avatars.hand(ring.holder, this.a);
    if (inHand) {
      this.ring.position.copy(inHand);
      this.ring.quaternion.copy(this.q); // upright, facing aft (held by its rim, roughly)
    } else if (state === 'flying' || state === 'water') {
      this.ring.position.fromArray(ring!.pos);
      // In the water it lies flat; in flight, tumbles a little.
      this.ring.quaternion.setFromAxisAngle(this.xAxis, Math.PI / 2);
      if (state === 'flying') this.ring.rotateY(world.time * 3);
      if (state === 'water') this.ring.position.y = surfaceHeight(waves, ring!.pos[0], ring!.pos[2]) + 0.02;
    } else {
      // On its hook on the wheelhouse aft wall.
      if (station) vesselRoot.localToWorld(this.ring.position.fromArray(station.stow));
      this.ring.quaternion.copy(this.q);
    }

    // ── Line: from the cleat to the ring, sagging by its slack ──
    const out = !!station && (state !== 'stowed' || local.holdingRing);
    this.line.visible = out;
    if (out) {
      const cleat = vesselRoot.localToWorld(this.b.fromArray(station.cleat));
      ropePoints(cleat, this.ring.position, ring?.line ?? 0, state === 'water', waves, this.linePos);
      (this.line.material as THREE.MeshLambertMaterial).color.setHex(local.lineHover || local.pulling ? ROPE_LIT : ROPE);
      for (let i = 0; i + 1 < ROPE_POINTS; i++) {
        this.a.fromArray(this.linePos, i * 3);
        const seg = this.tmp.fromArray(this.linePos, i * 3 + 3).sub(this.a);
        const len = seg.length();
        this.segQ.setFromUnitVectors(this.yAxis, len > 1e-6 ? seg.divideScalar(len) : this.yAxis);
        this.segM.compose(this.a, this.segQ, this.segS.set(1, Math.max(len, 1e-4), 1));
        this.line.setMatrixAt(i, this.segM);
      }
      this.line.instanceMatrix.needsUpdate = true;
    }

    // ── Boat hook ──
    const hookState = hookIn(world, vesselId);
    const holder = hookState?.holder ?? null;
    if (local.holdingHook) {
      this.pose(local.hookBase, local.hookTip);
    } else if (holder && holder !== localId && avatars.hand(holder, this.a)) {
      // Another player's: from their hand, out ahead and down toward the water.
      const f = avatars.facing(holder, this.b) ?? this.b.set(0, 0, -1);
      const tip = this.tmp.copy(this.a).addScaledVector(f, CONFIG.rescue.hookLength * 0.8);
      tip.y -= CONFIG.rescue.hookLength * 0.6;
      this.pose(this.a, tip);
    } else if (hookState?.deck) {
      this.telescope(CONFIG.rescue.hookLength);
      // Laid down on deck.
      const [x, y, z, yaw] = hookState.deck;
      vesselRoot.localToWorld(this.hook.position.set(x, y + 0.02, z));
      this.hook.quaternion.copy(this.q).multiply(this.qYaw.setFromAxisAngle(this.yAxis, yaw));
    } else {
      this.telescope(CONFIG.rescue.hookLength);
      // In its clips along the port bulwark.
      const [x, y, z0] = rack?.stow ?? [0, 0, 0];
      vesselRoot.localToWorld(this.hook.position.set(x, y, z0));
      this.hook.quaternion.copy(this.q);
    }
  }

  /** Pole from `base` to `tip`, telescoped to reach it (never shorter than the hook). */
  private pose(base: THREE.Vector3, tip: THREE.Vector3): void {
    this.hook.position.copy(base);
    const dir = this.tmp.copy(tip).sub(base);
    const len = dir.length();
    if (len < 1e-4) return;
    this.hook.quaternion.setFromUnitVectors(this.zAxis, dir.divideScalar(len));
    this.telescope(Math.max(CONFIG.rescue.hookLength, len));
  }

  /** Pole length (m): the pole is scaled along its axis, the head sits at its end. */
  private telescope(len: number): void {
    this.pole.scale.z = len / CONFIG.rescue.hookLength;
    this.head.position.z = len;
  }
}

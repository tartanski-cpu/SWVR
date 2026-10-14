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
import { VESSEL_DEFS } from '../vessel/vesselDef';
import type { RescueHands } from './rescueHands';

const LINE_POINTS = 24;

/** Where another player's hand / head is (world), if known. */
export interface AvatarHands {
  hand(playerId: string, out: THREE.Vector3): THREE.Vector3 | null;
  /** Their facing (world, horizontal unit vector). */
  facing(playerId: string, out: THREE.Vector3): THREE.Vector3 | null;
}

export class RescueGearView {
  readonly root = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private readonly line: THREE.Line;
  private readonly linePos: Float32Array;
  private readonly hook: THREE.Mesh;
  private readonly tmp = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly zAxis = new THREE.Vector3(0, 0, 1);
  private readonly xAxis = new THREE.Vector3(1, 0, 0);

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
    this.linePos = new Float32Array(LINE_POINTS * 3);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xf0e6c0 }));
    this.line.frustumCulled = false;
    // Boat hook: an ash pole along +z from its butt (origin), a galvanised hook at the end.
    const L = CONFIG.rescue.hookLength;
    this.hook = new THREE.Mesh(
      mergeParts([
        part(new THREE.CylinderGeometry(0.018, 0.02, L, 8).rotateX(Math.PI / 2).translate(0, 0, L / 2), 0xb08850),
        part(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6).rotateX(Math.PI / 2).translate(0, 0, L + 0.08), 0x9aa0a6),
        part(new THREE.TorusGeometry(0.06, 0.011, 6, 12, Math.PI).rotateY(Math.PI / 2).translate(0, -0.06, L + 0.12), 0x9aa0a6),
      ]),
      flatVertexColorMaterial(),
    );
    this.hook.name = 'boatHook';
    this.root.add(this.ring, this.line, this.hook);
  }

  update(world: WorldState, vesselId: string, vesselRoot: THREE.Object3D | undefined, waves: readonly PreparedWave[], local: RescueHands, localId: string, avatars: AvatarHands): void {
    const v = world.vessels[vesselId];
    const r = world.rescue;
    this.root.visible = !!(v && vesselRoot);
    if (!v || !vesselRoot) return;
    const gear = VESSEL_DEFS[v.defId].rescueGear;
    vesselRoot.getWorldQuaternion(this.q);
    const ring = r?.ring;
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
      vesselRoot.localToWorld(this.ring.position.fromArray(gear.ringStow));
      this.ring.quaternion.copy(this.q);
    }

    // ── Line: from the cleat to the ring, sagging by its slack ──
    const out = state !== 'stowed' || local.holdingRing;
    this.line.visible = out;
    if (out) {
      const cleat = vesselRoot.localToWorld(this.b.fromArray(gear.ringCleat));
      const end = this.ring.position;
      const d = cleat.distanceTo(end);
      const len = state === 'water' ? Math.max(ring!.line, d) : d + 1;
      // A parabola whose depth grows with the slack (and a little always: it's rope).
      const sag = Math.min(3, 0.15 + 0.5 * Math.sqrt(Math.max(0, len * len - d * d)));
      for (let i = 0; i < LINE_POINTS; i++) {
        const s = i / (LINE_POINTS - 1);
        const p = this.tmp.lerpVectors(cleat, end, s);
        p.y -= sag * 4 * s * (1 - s);
        // Rope lying in the water floats on it.
        if (state === 'water') p.y = Math.max(p.y, surfaceHeight(waves, p.x, p.z) + 0.01);
        this.linePos.set([p.x, p.y, p.z], i * 3);
      }
      this.line.geometry.attributes.position.needsUpdate = true;
    }

    // ── Boat hook ──
    const holder = r?.hook?.holder ?? null;
    if (local.holdingHook) {
      this.pose(local.hookBase, local.hookTip);
    } else if (holder && holder !== localId && avatars.hand(holder, this.a)) {
      // Another player's: from their hand, out ahead and down toward the water.
      const f = avatars.facing(holder, this.b) ?? this.b.set(0, 0, -1);
      const tip = this.tmp.copy(this.a).addScaledVector(f, CONFIG.rescue.hookLength * 0.8);
      tip.y -= CONFIG.rescue.hookLength * 0.6;
      this.pose(this.a, tip);
    } else {
      // In its clips along the port bulwark.
      const [x, y, z0] = gear.hookStow;
      vesselRoot.localToWorld(this.hook.position.set(x, y, z0));
      this.hook.quaternion.copy(this.q);
    }
  }

  /** Pole from `base` toward `tip`. */
  private pose(base: THREE.Vector3, tip: THREE.Vector3): void {
    this.hook.position.copy(base);
    const dir = this.tmp.copy(tip).sub(base);
    if (dir.lengthSq() < 1e-8) return;
    this.hook.quaternion.setFromUnitVectors(this.zAxis, dir.normalize());
  }
}

import * as THREE from 'three';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { launchPoint, type TenderCrane } from '../vessel/tenderCrane';
import type { VesselState } from '../vessel/vesselState';
import { Button } from './Button';

const WHITE = 0xe6e6de;
const STEEL = 0xb8bcc0;
const DARK = 0x2a2e33;
const ROPE = 0xe8dcc0;
const AMBER = 0xe0a020;

/** Lifting points on the skiff (her axes): her four gunwale corners. */
const LEGS: [number, number, number][] = [
  [-0.6, 0.48, -1.0],
  [0.6, 0.48, -1.0],
  [-0.62, 0.42, 1.55],
  [0.62, 0.42, 1.55],
];
/** How fast the boom moves on its own (m/s at the hook): when it parks, or reaches for her. */
const REACH_SPEED = 1.5;

/**
 * The tender crane on the foredeck (vessel/tenderCrane.ts moves the skiff; this draws the
 * crane to match), in the ship's axes (`root` goes in the ship's view root):
 *
 *   - static (one merged mesh): the column, the cradle's two padded saddles, the control box
 *   - moving (two instanced draw calls): the slewing turret, the main boom and the knuckle
 *     jib, their two hydraulic rams, the wire from the jib head, the hook and the 4-leg bridle
 *
 * Each frame the hook goes to her lifting point while she's on the crane (else back over
 * the empty cradle, at REACH_SPEED). The turret slews to face it; the jib head stands over
 * it, a little above (`tipAbove`), and the two arms are a two-link chain from the boom's
 * pivot on the turret to the jib head, knuckle up (law of cosines).
 *
 * The control box's button sends `<tenderId>:crane` (one press: launch if she's in the
 * cradle, recover if she's alongside); its hover text says which, or why not yet.
 */
export class TenderCraneView {
  readonly root = new THREE.Group();
  readonly button: Button;
  private readonly boxes: THREE.InstancedMesh;
  private readonly rods: THREE.InstancedMesh;
  private readonly hook = new THREE.Vector3();
  private hookSet = false;
  private moving = false;
  private readonly shoulder: THREE.Vector3;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly t = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(
    readonly tenderId: string,
    private readonly crane: TenderCrane,
    deckY: (z: number) => number,
  ) {
    const c = crane;
    const [cx, cz] = c.column;
    const base = deckY(cz);
    this.shoulder = new THREE.Vector3(cx, c.shoulderY, cz);
    this.root.name = 'tenderCrane';

    // Static: column and flange, the cradle's saddles under her, the control box.
    const parts: THREE.BufferGeometry[] = [
      part(new THREE.CylinderGeometry(c.columnRadius, c.columnRadius * 1.15, c.shoulderY - 0.2 - base, 14).translate(cx, (base + c.shoulderY - 0.2) / 2, cz), WHITE),
      part(new THREE.CylinderGeometry(c.columnRadius * 1.6, c.columnRadius * 1.6, 0.04, 14).translate(cx, base + 0.02, cz), DARK),
    ];
    const [sx, sy, sz] = c.stow;
    const keel = sy - 0.14; // her bottom (skiff keelY) in the cradle
    for (const dz of [-1.1, 1.0]) {
      const z = sz + dz;
      const y0 = deckY(z);
      parts.push(part(new THREE.BoxGeometry(1.1, keel - y0, 0.12).translate(sx, (keel + y0) / 2, z), 0x4a5258));
      parts.push(part(new THREE.BoxGeometry(1.0, 0.03, 0.14).translate(sx, keel - 0.012, z), DARK)); // rubber pad
    }
    const [bx, by, bz] = c.button;
    parts.push(part(new THREE.BoxGeometry(0.2, 0.24, 0.08).translate(bx, by, bz - 0.04), 0x5a6268));
    const fixed = new THREE.Mesh(mergeParts(parts), flatVertexColorMaterial());
    fixed.name = 'tenderCraneFixed';

    // Moving: unit boxes (turret, boom, jib, hook block) and unit cylinders (rams, wire, legs).
    this.boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ flatShading: true }), 4);
    this.rods = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 8), new THREE.MeshLambertMaterial({ flatShading: true }), 9);
    [WHITE, WHITE, WHITE, AMBER].forEach((col, i) => this.boxes.setColorAt(i, new THREE.Color(col)));
    [STEEL, 0xd8dcdf, STEEL, 0xd8dcdf, DARK, ROPE, ROPE, ROPE, ROPE].forEach((col, i) => this.rods.setColorAt(i, new THREE.Color(col)));
    for (const im of [this.boxes, this.rods]) {
      im.frustumCulled = false; // instances span the whole crane; the box's bounds are a unit cube
      im.name = 'tenderCraneMoving';
    }

    this.button = new Button(`crane:${tenderId}`, `${tenderId}:crane`, 'Skiff crane: launch / recover', 'pulse', 0x2a8f3a, () => this.moving);
    this.button.root.position.set(bx, by, bz);
    this.button.root.rotation.x = Math.PI / 2; // facing aft, from the box's aft face
    this.root.add(fixed, this.boxes, this.rods, this.button.root);
  }

  /**
   * @param tender      the tender's state
   * @param recover     can she be recovered now, and if not why
   * @param tenderRoot  her (interpolated) view root, for the lifting points
   */
  update(tender: VesselState, recover: { ok: boolean; why: string }, tenderRoot: THREE.Object3D | undefined, dt: number): void {
    const phase = tender.tender?.phase ?? 'free';
    this.moving = phase === 'lowering' || phase === 'hoisting';
    const charge = Math.round((tender.battery ?? 0) * 100);
    this.button.label =
      phase === 'stowed'
        ? `Skiff crane: LAUNCH (battery ${charge} %)`
        : phase === 'lowering'
          ? 'Skiff crane: lowering...'
          : phase === 'hoisting'
            ? 'Skiff crane: hoisting...'
            : recover.ok
              ? 'Skiff crane: RECOVER'
              : `Skiff crane: RECOVER - ${recover.why}`;
    this.button.sync(tender);

    // The hook: on her lifting point while she's on the crane, else parked over the cradle.
    const c = this.crane;
    const onHook = phase !== 'free' && !!tenderRoot;
    this.root.updateWorldMatrix(true, false);
    if (onHook) {
      tenderRoot!.localToWorld(this.t.fromArray(c.lift));
      this.root.worldToLocal(this.t);
    } else {
      launchPoint(c, 0, this.t).add(this.a.fromArray(c.lift));
    }
    if (!this.hookSet) {
      this.hook.copy(this.t);
      this.hookSet = true;
    }
    const gap = this.t.distanceTo(this.hook);
    const step = REACH_SPEED * dt;
    if (gap <= step || (onHook && phase !== 'hoisting')) this.hook.copy(this.t);
    else this.hook.lerp(this.t, step / gap);
    const attached = onHook && this.hook.distanceTo(this.t) < 0.05;
    this.pose(attached ? tenderRoot! : null);
  }

  /** Pose the turret, arms, rams, wire and bridle for the hook where it is now. */
  private pose(tenderRoot: THREE.Object3D | null): void {
    const c = this.crane;
    const S = this.shoulder;
    const H = this.hook;
    // Slew: the turret faces the hook; u is the horizontal unit vector toward it.
    const psi = Math.atan2(H.z - S.z, H.x - S.x);
    const u = new THREE.Vector3(Math.cos(psi), 0, Math.sin(psi));
    const reach = Math.hypot(H.x - S.x, H.z - S.z);
    // The jib head over the hook, a little above it (never below the shoulder much).
    const tipY = Math.max(H.y + 0.45, S.y + 0.2);
    let dv = tipY - S.y;
    let d = Math.hypot(reach, dv);
    const L1 = c.boom;
    const L2 = c.jib;
    const dMax = L1 + L2 - 0.02;
    const dMin = Math.abs(L1 - L2) + 0.05;
    const beta = Math.atan2(dv, reach);
    d = Math.min(dMax, Math.max(dMin, d));
    dv = d * Math.sin(beta);
    // Two-link chain, knuckle up: the boom's elevation is the target's plus the angle the
    // law of cosines gives between the boom and the line to the target.
    const alpha = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
    const th = beta + alpha;
    const at = (h: number, v: number, out: THREE.Vector3) => out.copy(S).addScaledVector(u, h).setY(S.y + v);
    const E = at(L1 * Math.cos(th), L1 * Math.sin(th), new THREE.Vector3());
    const T = at(d * Math.cos(beta), dv, new THREE.Vector3());

    // Boxes: turret, boom, jib, hook block.
    this.q.setFromAxisAngle(this.up, -psi);
    this.boxes.setMatrixAt(0, this.m.compose(this.a.set(S.x, S.y - 0.08, S.z), this.q, this.s.set(0.34, 0.3, 0.3)));
    this.boxes.setMatrixAt(3, this.m.compose(this.a.copy(H).setY(H.y + 0.06), this.q, this.s.set(0.1, 0.14, 0.08)));
    this.segment(this.boxes, 1, S, E, 0.13, 0.11);
    this.segment(this.boxes, 2, E, T, 0.1, 0.09);
    // Rams: turret to boom (lifts it), boom to jib (folds it); barrel then rod.
    const r1a = at(0.16, -0.45, new THREE.Vector3());
    const r1b = new THREE.Vector3().lerpVectors(S, E, 0.45);
    const r2a = new THREE.Vector3().lerpVectors(S, E, 0.6).addScaledVector(this.up, 0.1);
    const r2b = new THREE.Vector3().lerpVectors(E, T, 0.25).addScaledVector(this.up, 0.06);
    this.ram(0, r1a, r1b, 0.07);
    this.ram(2, r2a, r2b, 0.055);
    // The wire, jib head to hook.
    this.segment(this.rods, 4, T, this.b.copy(H).setY(H.y + 0.13), 0.012, 0.012);
    // The bridle: hook to her four lifting points while she's on it; else hidden.
    for (let i = 0; i < 4; i++) {
      if (tenderRoot) {
        tenderRoot.localToWorld(this.b.fromArray(LEGS[i]));
        this.root.worldToLocal(this.b);
        this.segment(this.rods, 5 + i, H, this.b, 0.012, 0.012);
      } else this.rods.setMatrixAt(5 + i, this.m.makeScale(0, 0, 0));
    }
    this.boxes.instanceMatrix.needsUpdate = true;
    this.rods.instanceMatrix.needsUpdate = true;
  }

  /** A hydraulic ram from `a` to `b`: the barrel two thirds of the way, the rod the rest. */
  private ram(i: number, a: THREE.Vector3, b: THREE.Vector3, r: number): void {
    const mid = new THREE.Vector3().lerpVectors(a, b, 0.62);
    this.segment(this.rods, i, a, mid, r, r);
    this.segment(this.rods, i + 1, mid, b, r * 0.55, r * 0.55);
  }

  /** Instance `i` of `mesh` (a unit box or cylinder along y) stretched from `a` to `b`. */
  private segment(mesh: THREE.InstancedMesh, i: number, a: THREE.Vector3, b: THREE.Vector3, w: number, depth: number): void {
    const dir = this.s.subVectors(b, a);
    const len = Math.max(1e-3, dir.length());
    // Shortest arc from up: the arms lie in a vertical plane, so they come out unrolled.
    this.q.setFromUnitVectors(this.up, dir.multiplyScalar(1 / len));
    mesh.setMatrixAt(i, this.m.compose(this.a.addVectors(a, b).multiplyScalar(0.5), this.q, this.s.set(w, len, depth)));
  }
}

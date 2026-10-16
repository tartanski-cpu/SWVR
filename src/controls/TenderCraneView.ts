import * as THREE from 'three';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { clamp } from '../core/math';
import { hullPlan } from '../vessel/layout';
import { launchPoint, launchTime, type TenderCrane } from '../vessel/tenderCrane';
import type { VesselDef } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { Button } from './Button';

const WHITE = 0xe6e6de;
const STEEL = 0xb8bcc0;
const DARK = 0x2a2e33;
const ROPE = 0xe8dcc0;
const AMBER = 0xe0a020;
const CANVAS = 0x26476a;

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
 * Folded (owner request: tidy while she's stowed, or away): while she's in the cradle or
 * off in the water, the crane folds into its transport position (`fold`: slewed forward,
 * the boom just below level along the starboard foredeck, the jib folded back over it, the
 * hook up at the jib head, no wire). It unfolds while the launch rigs (`rigTime`) and
 * while she's lined up for recovery, and folds again once she's back in the cradle: the
 * pose is a blend of the working pose and the folded one, angle by angle.
 *
 * In the cradle she's under a tarpaulin (`cover`: one mesh, over her and her motor): her
 * outboard and tiller and the crane remote aren't drawn or usable (the App hides them).
 * It comes off when the launch starts.
 *
 * Three buttons send `<tenderId>:crane` (one press: launch if she's in the cradle, recover
 * if she's alongside), each with hover text saying which, or why not yet: on the column's
 * control box (outboard side, from the starboard side deck), SKIFF CRANE on the helm
 * console (DECK group), and a remote on a post in the skiff by the helmsman (`remote`, in
 * her axes: the App puts it in her view) to call a recovery from the water.
 */
export class TenderCraneView {
  readonly root = new THREE.Group();
  /** The three buttons: column, console, the skiff's remote. */
  readonly buttons: Button[];
  /** The remote's post and button, in the skiff's axes (the App adds it to her view root). */
  readonly remote = new THREE.Group();
  private readonly boxes: THREE.InstancedMesh;
  private readonly rods: THREE.InstancedMesh;
  private readonly hook = new THREE.Vector3();
  private hookSet = false;
  /** 0: working, 1: folded away (eased in between). */
  private fold = 1;
  /** The tarpaulin over her in the cradle (ship axes). */
  readonly cover: THREE.Mesh;
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
    /** Where the SKIFF CRANE button stands on the helm console (ship axes). */
    consoleAt: [number, number, number],
    /** The tender (for the shape of her tarpaulin). */
    tenderDef: VesselDef,
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
    // The control box on the column's outboard side, its face to starboard.
    const [bx, by, bz] = c.button;
    parts.push(part(new THREE.BoxGeometry(bx - (cx + c.columnRadius) + 0.01, 0.24, 0.2).translate((bx + cx + c.columnRadius) / 2, by, bz), 0x5a6268));
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

    const button = (id: string) => new Button(`${id}:${tenderId}`, `${tenderId}:crane`, 'Skiff crane: launch / recover', 'pulse', 0x2a8f3a, () => this.moving);
    const column = button('crane');
    column.root.position.set(bx, by, bz);
    column.root.rotation.z = -Math.PI / 2; // facing starboard, from the box's outboard face
    const helm = button('craneHelm');
    helm.root.position.fromArray(consoleAt);
    // The remote: a post by the skiff's helmsman, starboard of the tiller, the button on top.
    const rm = c.remote;
    const remote = button('craneRemote');
    remote.root.position.set(rm.x, rm.height, rm.z);
    const post = new THREE.Mesh(
      mergeParts([part(new THREE.CylinderGeometry(0.025, 0.03, rm.height - 0.3, 8).translate(rm.x, (rm.height + 0.3) / 2 - 0.03, rm.z), STEEL), part(new THREE.BoxGeometry(0.12, 0.05, 0.12).translate(rm.x, rm.height - 0.025, rm.z), 0x5a6268)]),
      flatVertexColorMaterial(),
    );
    this.remote.add(post, remote.root);
    this.buttons = [column, helm, remote];
    this.cover = new THREE.Mesh(tarpaulin(tenderDef, c), flatVertexColorMaterial());
    this.cover.name = 'skiffCover';
    this.root.add(fixed, this.boxes, this.rods, column.root, helm.root, this.cover);
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
    const label =
      phase === 'stowed'
        ? `Skiff crane: LAUNCH (battery ${charge} %)`
        : phase === 'lowering'
          ? 'Skiff crane: lowering...'
          : phase === 'hoisting'
            ? 'Skiff crane: hoisting...'
            : recover.ok
              ? 'Skiff crane: RECOVER'
              : `Skiff crane: RECOVER - ${recover.why}`;
    for (const b of this.buttons) {
      b.label = label;
      b.sync(tender);
    }

    // Under the tarpaulin in the cradle: her remote can't be reached either.
    const covered = phase === 'stowed';
    this.cover.visible = covered;
    this.remote.visible = !covered;
    this.buttons[2].enabled = !covered;
    // Folded while she's stowed or away, and for the last of a recovery (unhooking).
    const c = this.crane;
    const tt = tender.tender?.t ?? 0;
    const folding = phase === 'stowed' || phase === 'free' || (phase === 'hoisting' && tt > c.alignTime + launchTime(c) - c.rigTime * 0.6);
    const rate = dt / (c.rigTime * 0.8);
    this.fold = clamp(this.fold + clamp((folding ? 1 : 0) - this.fold, -rate, rate), 0, 1);

    // The hook: on her lifting point while she's on the crane, else parked over the cradle.
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
    const attached = onHook && this.hook.distanceTo(this.t) < 0.05 && this.fold < 0.02;
    this.pose(attached ? tenderRoot! : null);
  }

  /**
   * Pose the turret, arms, rams, wire and bridle: the working pose for the hook where it is
   * now, blended toward the folded one by `fold`. The wire and bridle only while she's on
   * the hook and the crane is unfolded; else the hook rides up at the jib head.
   */
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
    const thW = beta + alpha;
    // The jib's direction in the same plane (elbow to head).
    const phiW = Math.atan2(dv - L1 * Math.sin(thW), d * Math.cos(beta) - L1 * Math.cos(thW));
    // Blend toward the folded pose, angle by angle (slew the short way round).
    const f = this.fold * this.fold * (3 - 2 * this.fold);
    const rad = Math.PI / 180;
    const psiF = c.fold.slewDeg * rad;
    const slew = psi + Math.atan2(Math.sin(psiF - psi), Math.cos(psiF - psi)) * f;
    const th = thW + (c.fold.boomDeg * rad - thW) * f;
    const phi = phiW + (c.fold.jibDeg * rad - phiW) * f;
    u.set(Math.cos(slew), 0, Math.sin(slew));
    const at = (h: number, v: number, out: THREE.Vector3) => out.copy(S).addScaledVector(u, h).setY(S.y + v);
    const E = at(L1 * Math.cos(th), L1 * Math.sin(th), new THREE.Vector3());
    const T = at(L1 * Math.cos(th) + L2 * Math.cos(phi), L1 * Math.sin(th) + L2 * Math.sin(phi), new THREE.Vector3());
    const stowed = this.fold > 0.02;

    // Boxes: turret, boom, jib, hook block.
    this.q.setFromAxisAngle(this.up, -slew);
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
    // The wire, jib head to hook; folded, the hook is up at the jib head and no wire shows.
    if (stowed) {
      this.rods.setMatrixAt(4, this.m.makeScale(0, 0, 0));
      this.q.setFromAxisAngle(this.up, -slew);
      this.boxes.setMatrixAt(3, this.m.compose(this.a.copy(T).setY(T.y - 0.12), this.q, this.s.set(0.1, 0.14, 0.08)));
    } else this.segment(this.rods, 4, T, this.b.copy(H).setY(H.y + 0.13), 0.012, 0.012);
    // The bridle: hook to her four lifting points while she's on it; else hidden.
    for (let i = 0; i < 4; i++) {
      if (tenderRoot && !stowed) {
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

/**
 * The tarpaulin over the skiff in her cradle (ship axes, one merged mesh): a canvas cover
 * stretched over a low ridge from bow to transom, its edges drawn down 0.12 m over the
 * gunwale, closed at the transom, and a bag over the outboard. Built from her hull plan
 * at her stowed position (she sits bow forward, so her axes are the ship's, shifted).
 */
function tarpaulin(def: VesselDef, c: TenderCrane): THREE.BufferGeometry {
  const plan = hullPlan(def);
  const [ox, oy, oz] = c.stow;
  const bulwark = def.layout.bulwarkHeight;
  const N = 12;
  const across = [-1, -1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1, 1];
  // A cross-section at her z: the drape, the gunwale edge, the ridge, the other edge, the drape.
  const section = (z: number) => {
    const w = plan.halfBeam(z) + 0.03;
    const top = plan.deckY(z) + bulwark + 0.02;
    return across.map((a, k) => {
      const drape = k === 0 || k === across.length - 1;
      return new THREE.Vector3(ox + a * w, oy + (drape ? top - 0.12 : top + 0.14 * (1 - a * a)), oz + z);
    });
  };
  const z0 = plan.stem + 0.05;
  const z1 = plan.transom;
  const rows = Array.from({ length: N + 1 }, (_, i) => section(z0 + ((z1 - z0) * i) / N));
  const pos: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < across.length - 1; k++) {
      const [a, b, d, e] = [rows[i][k], rows[i][k + 1], rows[i + 1][k], rows[i + 1][k + 1]];
      tri(a, d, b);
      tri(b, d, e);
    }
  }
  // Closed at the transom: a fan to a point just below the gunwale on the centreline.
  const last = rows[N];
  const hub = new THREE.Vector3(ox, oy + plan.deckY(z1) + bulwark - 0.08, oz + z1);
  for (let k = 0; k < last.length - 1; k++) tri(last[k], hub, last[k + 1]);
  const sheet = new THREE.BufferGeometry();
  sheet.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sheet.computeVertexNormals();
  const parts = [part(sheet, CANVAS)];
  // The bag over the outboard, on her transom.
  const ob = def.outboard;
  if (ob) parts.push(part(new THREE.BoxGeometry(0.32, 0.5, 0.36).translate(ox, oy + ob.tiller.pivot[1] - 0.05, oz + ob.position[2]), CANVAS));
  return mergeParts(parts);
}


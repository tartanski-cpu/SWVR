import * as THREE from 'three';
import { CONFIG } from '../config';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { dolphinPose, gullPose, podVisit, type DolphinPose, type GullPose } from './wildlife';

/** What the view noticed this frame, for the sounds. */
export interface WildlifeEvents {
  /** Distance to the nearest gull (m), or Infinity when there are none about. */
  gullDist: number;
  /** Distances of dolphins that just breathed this frame (m). */
  blows: number[];
}

/**
 * Draws the gulls and dolphins (see wildlife.ts for how they move). Three draw calls:
 * gull bodies and gull wings (instanced; each wing is one instance, the left one turned
 * half over about the bird's axis so one wing model serves both), and the dolphins.
 */
export class WildlifeView {
  readonly root = new THREE.Group();
  private readonly bodies: THREE.InstancedMesh;
  private readonly wings: THREE.InstancedMesh;
  private readonly dolphins: THREE.InstancedMesh;
  private readonly g: GullPose = { x: 0, y: 0, z: 0, yaw: 0, bank: 0, wing: 0 };
  private readonly d: DolphinPose = { x: 0, z: 0, y: 0, pitch: 0, up: false, sinceBreath: 0 };
  private readonly m = new THREE.Matrix4();
  private readonly w = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private readonly up: boolean[] = [];
  readonly events: WildlifeEvents = { gullDist: Infinity, blows: [] };

  constructor() {
    this.root.name = 'wildlife';
    const n = CONFIG.wildlife.gulls.count;
    // Gull: white body with a grey back, yellow bill; the bird faces -z.
    const body = mergeParts([
      part(new THREE.SphereGeometry(1, 8, 6).scale(0.09, 0.08, 0.26), 0xf2f2ee),
      part(new THREE.SphereGeometry(1, 6, 4).scale(0.07, 0.06, 0.08).translate(0, 0.05, -0.22), 0xf2f2ee),
      part(new THREE.ConeGeometry(0.018, 0.08, 4).rotateX(-Math.PI / 2).translate(0, 0.04, -0.33), 0xe8b820),
      part(new THREE.BoxGeometry(0.16, 0.02, 0.12).translate(0, -0.01, 0.28), 0xd8d8d4), // tail
    ]);
    this.bodies = new THREE.InstancedMesh(body, flatVertexColorMaterial(), n);
    // Wing: out along +x from the shoulder, tapering, grey above with a black tip.
    const wing = new THREE.BufferGeometry();
    const inner = new THREE.Shape([new THREE.Vector2(0.04, -0.12), new THREE.Vector2(0.55, -0.08), new THREE.Vector2(0.55, 0.06), new THREE.Vector2(0.04, 0.12)]);
    const tip = new THREE.Shape([new THREE.Vector2(0.55, -0.08), new THREE.Vector2(0.8, -0.02), new THREE.Vector2(0.8, 0.03), new THREE.Vector2(0.55, 0.06)]);
    // Shapes are drawn in x-y; lay them flat (y -> -z: the wing's chord fore-and-aft).
    wing.copy(mergeParts([part(new THREE.ShapeGeometry(inner).rotateX(Math.PI / 2), 0xb8bec4), part(new THREE.ShapeGeometry(tip).rotateX(Math.PI / 2), 0x202224)]));
    const wingMat = flatVertexColorMaterial();
    wingMat.side = THREE.DoubleSide;
    this.wings = new THREE.InstancedMesh(wing, wingMat, 2 * n);
    // Dolphin: a sleek grey body (facing -z), beak, dorsal fin, flukes; about 2.2 m.
    const dol = mergeParts([
      part(new THREE.SphereGeometry(1, 10, 6).scale(0.26, 0.28, 1.0), 0x56636e),
      part(new THREE.ConeGeometry(0.07, 0.3, 6).rotateX(-Math.PI / 2).translate(0, -0.04, -1.08), 0x56636e),
      part(new THREE.ConeGeometry(0.16, 0.36, 4).scale(0.25, 1, 1).rotateX(-0.5).translate(0, 0.38, 0.1), 0x48545e),
      part(new THREE.BoxGeometry(0.62, 0.03, 0.2).translate(0, 0, 1.05), 0x48545e),
    ]);
    this.dolphins = new THREE.InstancedMesh(dol, flatVertexColorMaterial(), CONFIG.wildlife.dolphins.count);
    for (const mesh of [this.bodies, this.wings, this.dolphins]) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.root.add(mesh);
    }
  }

  /**
   * @param t        world (render) time, s
   * @param boat     the workboat's drawn root (position and heading), or null
   * @param speed    her speed over the ground (m/s)
   * @param open     in open, deep water away from ports (dolphins come only there)
   * @param listener where the ears are (world)
   */
  update(t: number, boat: THREE.Object3D | null, speed: number, open: boolean, waves: readonly PreparedWave[], darkness: number, listener: THREE.Vector3): void {
    const ev = this.events;
    ev.gullDist = Infinity;
    ev.blows.length = 0;
    const night = darkness > CONFIG.wildlife.night;
    this.root.visible = !!boat && !night;
    if (!boat || night) return;
    const bx = boat.position.x;
    const bz = boat.position.z;

    // Gulls.
    const n = CONFIG.wildlife.gulls.count;
    for (let i = 0; i < n; i++) {
      const g = gullPose(i, t, bx, bz, this.g);
      this.p.set(g.x, g.y, g.z);
      this.q.setFromEuler(this.e.set(0, g.yaw, -g.bank));
      this.m.compose(this.p, this.q, this.s.set(1, 1, 1));
      this.bodies.setMatrixAt(i, this.m);
      // Wings: right one raised by `wing` about the bird's fore-and-aft axis; the left one
      // is the same model turned half over (so its raise is the opposite sign).
      for (const side of [1, -1]) {
        this.w.makeRotationZ(side > 0 ? g.wing : Math.PI - g.wing);
        this.wings.setMatrixAt(2 * i + (side > 0 ? 0 : 1), this.w.premultiply(this.m));
      }
      ev.gullDist = Math.min(ev.gullDist, this.p.distanceTo(listener));
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.wings.instanceMatrix.needsUpdate = true;

    // Dolphins: in the boat's heading frame (her yaw only), at the sea surface.
    const c = CONFIG.wildlife.dolphins;
    const into = open && speed > c.minSpeed ? podVisit(t) : null;
    this.e.setFromQuaternion(boat.quaternion, 'YXZ');
    const yaw = this.e.y;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    for (let j = 0; j < c.count; j++) {
      if (into === null) {
        this.dolphins.setMatrixAt(j, this.zero);
        this.up[j] = false;
        continue;
      }
      const d = dolphinPose(j, into, t, -7, this.d);
      const x = bx + d.x * cy + d.z * sy;
      const z = bz - d.x * sy + d.z * cy;
      const y = surfaceHeight(waves, x, z) + d.y;
      if (!d.up) {
        this.dolphins.setMatrixAt(j, this.zero);
      } else {
        this.p.set(x, y, z);
        this.q.setFromEuler(this.e.set(d.pitch, yaw, 0));
        this.dolphins.setMatrixAt(j, this.m.compose(this.p, this.q, this.s.set(1, 1, 1)));
        // Just broke the surface: a breath.
        if (!this.up[j]) ev.blows.push(this.p.distanceTo(listener));
      }
      this.up[j] = d.up;
    }
    this.dolphins.instanceMatrix.needsUpdate = true;
  }
}

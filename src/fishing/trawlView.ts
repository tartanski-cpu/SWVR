import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import { aFrameOf } from './fishing';

const FLOATS = 7;


/**
 * The trawl in the water astern (fishing.ts). Cheap and rope-free (the brief's rule). The
 * A-frame over the transom, with its blocks and the by-hand PAY OUT / HAUL buttons, is the
 * boat's own module (modules/aFrame); the warps lead from its blocks.
 *   warps    two straight dark lines from the blocks down into the water astern, longer
 *            as the net goes out (one line segment pair).
 *   floats   the headline's orange floats in an arc on the surface well astern, riding
 *            the waves (one instanced mesh); the net itself is under water, unseen.
 * The warps and floats show only while the net is out (t > 0).
 */
export class TrawlView {
  readonly root = new THREE.Group();
  private readonly warps: THREE.LineSegments;
  private readonly floats: THREE.InstancedMesh;
  /** The starboard block (port is -x): where the warp leaves it (vessel axes). */
  private readonly block = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();

  constructor() {
    this.root.name = 'trawl';
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    this.warps = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x1a1a1a }));
    this.warps.frustumCulled = false;
    this.floats = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshLambertMaterial({ color: 0xff7a1a }), FLOATS);
    this.floats.frustumCulled = false;
    this.root.add(this.warps, this.floats);
    this.root.visible = false;
  }

  /** Lead the warps from her trawl gantry's blocks (the A-frame is her module: deck.a-frame). */
  setBoat(v: { defId: string }): void {
    const af = aFrameOf(v);
    if (af) this.block.set(af.blockX, af.top - 0.22, af.headZ);
  }

  update(world: WorldState, boat: THREE.Object3D | null, waves: readonly PreparedWave[], t: number): void {
    const f = world.fishing;
    const out = f?.t ?? 0;
    if (!boat || out <= 0) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    // Warps: from the blocks down and astern; the further out, the longer and shallower.
    const pos = this.warps.geometry.attributes.position as THREE.BufferAttribute;
    const back = 6 + 34 * out;
    const down = 2 + 10 * out;
    [-1, 1].forEach((s, i) => {
      boat.localToWorld(this.a.set(s * this.block.x, this.block.y, this.block.z));
      boat.localToWorld(this.b.set(s * (this.block.x + 1.5 * out), -down, this.block.z + back));
      pos.setXYZ(2 * i, this.a.x, this.a.y, this.a.z);
      pos.setXYZ(2 * i + 1, this.b.x, this.b.y, this.b.z);
    });
    pos.needsUpdate = true;
    // Floats: an arc across the net's mouth, on the surface well astern.
    const n = out > 0.6 ? FLOATS : 0;
    this.floats.count = n;
    for (let i = 0; i < n; i++) {
      const u = i / (FLOATS - 1) - 0.5;
      boat.localToWorld(this.a.set(u * 7 * out, 0, this.block.z + back + 8 - 4 * u * u * 6));
      this.a.y = surfaceHeight(waves, this.a.x, this.a.z) + 0.08 + 0.02 * Math.sin(t * 3 + i);
      this.floats.setMatrixAt(i, this.m.makeTranslation(this.a.x, this.a.y, this.a.z));
    }
    this.floats.instanceMatrix.needsUpdate = true;
  }
}

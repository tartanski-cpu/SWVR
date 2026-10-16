import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import type { VesselDef } from '../vessel/vesselDef';
import { hullPlan } from '../vessel/layout';

const FLOATS = 7;

/** Where the gallows posts stand (vessel axes): x of the starboard one (port is -x), z, deck and top heights. */
export function gallowsOf(def: VesselDef): { x: number; z: number; deck: number; top: number } {
  const plan = hullPlan(def);
  const z = plan.transom - 0.7;
  const deck = plan.deckY(z);
  return { x: plan.halfBeam(z) - 0.12, z, deck, top: deck + 1.5 };
}

/**
 * The trawl as seen from the boat (fishing.ts). Cheap and rope-free (the brief's rule):
 *   gallows  quarter gallows: a short red post with a block on each quarter (always there).
 *            The warps lead off the tow winch by the towing post, and the by-hand PAY OUT /
 *            HAUL buttons on the posts are bridge controls (controls/bridge.ts).
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
  /** The two blocks' x (±), height and z (vessel axes). */
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

  /** Put the gear on the boat (once): a post and block on each quarter. */
  attachGallows(root: THREE.Object3D, def: VesselDef): void {
    if (!def.fishing) return;
    const { x, z, deck, top } = gallowsOf(def);
    this.block.set(x, top, z);
    const parts: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      parts.push(part(new THREE.CylinderGeometry(0.06, 0.08, top - deck, 8).translate(s * x, (top + deck) / 2, z), 0xb8261a));
      // An arm out over the side, the block hanging from its end.
      parts.push(part(new THREE.BoxGeometry(0.4, 0.07, 0.07).translate(s * (x + 0.15), top, z), 0xb8261a));
      parts.push(part(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 10).rotateZ(Math.PI / 2).translate(s * (x + 0.32), top - 0.14, z), 0x30343a));
    }
    const mesh = new THREE.Mesh(mergeParts(parts), flatVertexColorMaterial());
    mesh.name = 'trawlGallows';
    root.add(mesh);
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
      boat.localToWorld(this.a.set(s * (this.block.x + 0.32), this.block.y - 0.14, this.block.z));
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

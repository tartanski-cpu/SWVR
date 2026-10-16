import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import type { VesselDef } from '../vessel/vesselDef';
import { aFrameOf } from './fishing';

const FLOATS = 7;


/**
 * The trawl as seen from the boat (fishing.ts). Cheap and rope-free (the brief's rule):
 *   A-frame  over the transom (owner request, now the stern is clear of the skiff): two
 *            legs from the quarters raked aft to a crossbeam beyond the transom, each leg
 *            braced to the deck, a block each side on the beam (fishing.ts aFrameOf; one
 *            merged mesh, always there). The warps lead off the tow winch by the towing
 *            post; the by-hand PAY OUT / HAUL buttons on the starboard leg's control box are
 *            bridge controls (controls/bridge.ts).
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

  /** Put the A-frame on the boat (once). */
  attachAFrame(root: THREE.Object3D, def: VesselDef): void {
    const af = aFrameOf(def);
    if (!af) return;
    this.block.set(af.blockX, af.top - 0.22, af.headZ);
    const RED = 0xb8261a;
    const parts: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      const foot = new THREE.Vector3(s * af.x, af.deck, af.footZ);
      const head = new THREE.Vector3(s * af.x, af.top, af.headZ);
      parts.push(bar(foot, head, 0.07, RED)); // the leg
      parts.push(part(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 10).translate(foot.x, foot.y + 0.02, foot.z), 0x30343a)); // its foot plate
      // The brace: from a third of the way up the leg down to the deck forward of it.
      const knee = foot.clone().lerp(head, 0.38);
      parts.push(bar(new THREE.Vector3(s * af.x, af.deck, af.braceZ), knee, 0.045, RED));
      // The block on the beam, and its shackle.
      parts.push(part(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 12).rotateZ(Math.PI / 2).translate(s * af.blockX, af.top - 0.22, af.headZ), 0x30343a));
      parts.push(part(new THREE.BoxGeometry(0.03, 0.1, 0.03).translate(s * af.blockX, af.top - 0.08, af.headZ), 0x30343a));
    }
    // The crossbeam.
    parts.push(bar(new THREE.Vector3(-af.x - 0.05, af.top, af.headZ), new THREE.Vector3(af.x + 0.05, af.top, af.headZ), 0.08, RED));
    const mesh = new THREE.Mesh(mergeParts(parts), flatVertexColorMaterial());
    mesh.name = 'trawlAFrame';
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

/** A round bar from `a` to `b` (radius r), for the A-frame's legs, braces and beam. */
function bar(a: THREE.Vector3, b: THREE.Vector3, r: number, color: number): THREE.BufferGeometry {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), 10).translate(0, d.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return part(g.translate(a.x, a.y, a.z), color);
}


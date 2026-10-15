import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { VESSEL_DEFS, type VesselDef } from '../vessel/vesselDef';
import { CONFIG } from '../config';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import { bowEyeLocal, towPoint, towPostLocal } from './tow';

const SEGMENTS = 14;

/**
 * The towline, drawn between our towing post and the tow's bow eye on the rendered
 * (interpolated) boats: one instanced mesh of short cylinders (a single draw call, no
 * geometry rebuilt per frame). Slack, it hangs in a parabola whose sag makes the curve
 * about the line's length (s = sqrt(3 d (L - d) / 8) for chord d, length L); taut, it's
 * straight. It's yellow polypropylene: it floats, so a slack bight lies on the surface.
 * Also the towing post itself, a short bollard on the workboat's aft deck.
 */
export class TowlineView {
  readonly root = new THREE.Group();
  private readonly rope: THREE.InstancedMesh;
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly p0 = new THREE.Vector3();
  private readonly p1 = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private post: THREE.Mesh | null = null;

  constructor() {
    const geo = new THREE.CylinderGeometry(0.022, 0.022, 1, 5, 1, true).translate(0, 0.5, 0);
    this.rope = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xf2c84a }), SEGMENTS);
    this.rope.frustumCulled = false;
    this.rope.name = 'towline';
    this.root.add(this.rope);
    this.root.visible = false;
  }

  /** Put the towing post on the workboat (once). */
  attachPost(root: THREE.Object3D, def: VesselDef): void {
    if (this.post) return;
    const [x, y, z] = towPostLocal(def);
    const h = CONFIG.tow.postHeight;
    const g = new THREE.CylinderGeometry(0.07, 0.09, h, 10).translate(x, y - h / 2, z);
    this.post = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x2a2c2e }));
    this.post.name = 'towPost';
    root.add(this.post);
  }

  update(world: WorldState, roots: Map<string, THREE.Object3D>, tugId: string, waves: readonly PreparedWave[]): void {
    const line = world.tow?.line;
    const tug = roots.get(tugId);
    const tugS = world.vessels[tugId];
    if (!line || !tug || !tugS) {
      this.root.visible = false;
      return;
    }
    // A vessel's bow eye from her drawn pose (it rides the swell with her); debris at the
    // drawn surface.
    const towRoot = line.target.startsWith('v:') ? roots.get(line.target.slice(2)) : undefined;
    const ts = towRoot && world.vessels[line.target.slice(2)];
    if (towRoot && ts) towRoot.localToWorld(this.b.fromArray(bowEyeLocal(VESSEL_DEFS[ts.defId])));
    else if (towPoint(world, line.target, this.b)) this.b.setY(surfaceHeight(waves, this.b.x, this.b.z) + 0.15);
    else {
      this.root.visible = false;
      return;
    }
    tug.localToWorld(this.a.fromArray(towPostLocal(VESSEL_DEFS[tugS.defId])));
    const d = this.a.distanceTo(this.b);
    const L = CONFIG.tow.lineLength;
    const sag = d < L ? Math.sqrt((3 * d * (L - d)) / 8) : 0;
    const point = (t: number, out: THREE.Vector3) => {
      out.lerpVectors(this.a, this.b, t);
      return out.setY(Math.max(out.y - 4 * sag * t * (1 - t), surfaceHeight(waves, out.x, out.z) + 0.03));
    };
    point(0, this.p0);
    for (let i = 0; i < SEGMENTS; i++) {
      point((i + 1) / SEGMENTS, this.p1);
      const len = this.p0.distanceTo(this.p1);
      this.q.setFromUnitVectors(this.up, this.s.copy(this.p1).sub(this.p0).divideScalar(Math.max(1e-6, len)));
      this.m.compose(this.p0, this.q, this.s.set(1, len, 1));
      this.rope.setMatrixAt(i, this.m);
      this.p0.copy(this.p1);
    }
    this.rope.instanceMatrix.needsUpdate = true;
    this.root.visible = true;
  }
}

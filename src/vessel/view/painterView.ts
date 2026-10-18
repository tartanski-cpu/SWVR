import * as THREE from 'three';
import type { WorldState } from '../../core/world';
import { surfaceHeight, type PreparedWave } from '../../ocean/waves';
import { cleatLocal, lineFrom, skiffCleatLocal } from '../physics/painter';
import { VESSEL_DEFS } from '../vesselDef';

const SEGMENTS = 10;
/** At most this many lines drawn (one skiff today, bow and stern). */
const MAX = 4;

/**
 * The skiff's painter and stern line, drawn between the ship's cleat and hers on the drawn
 * (interpolated) boats. Like the towline: one instanced mesh of short cylinders, one draw
 * call. Slack, it hangs in a parabola about its length (sag s = sqrt(3 d (L - d) / 8) for
 * chord d, length L), but not below the water's surface; taut, it's straight.
 */
export class PainterView {
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

  constructor() {
    const geo = new THREE.CylinderGeometry(0.016, 0.016, 1, 5, 1, true).translate(0, 0.5, 0);
    this.rope = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xe0d2a0 }), SEGMENTS * MAX);
    this.rope.frustumCulled = false;
    this.rope.name = 'painter';
    this.rope.count = 0;
    this.root.add(this.rope);
  }

  update(world: WorldState, roots: Map<string, THREE.Object3D>, waves: readonly PreparedWave[]): void {
    let n = 0;
    for (const v of Object.values(world.vessels)) for (const end of ['bow', 'stern'] as const) {
      const t = v.tender;
      const line = t && lineFrom(t, end);
      if (!t || !line || t.phase !== 'free' || n >= MAX) continue;
      const host = world.vessels[t.hostId];
      const hostRoot = roots.get(t.hostId);
      const root = roots.get(v.id);
      const local = host && cleatLocal(VESSEL_DEFS[host.defId], line.cleat);
      const own = skiffCleatLocal(VESSEL_DEFS[v.defId], end);
      if (!hostRoot || !root || !local || !own) continue;
      hostRoot.localToWorld(this.a.fromArray(local));
      root.localToWorld(this.b.fromArray(own));
      const d = this.a.distanceTo(this.b);
      const L = line.length;
      const sag = d < L ? Math.sqrt((3 * d * (L - d)) / 8) : 0;
      const point = (u: number, out: THREE.Vector3) => {
        out.lerpVectors(this.a, this.b, u);
        return out.setY(Math.max(out.y - 4 * sag * u * (1 - u), surfaceHeight(waves, out.x, out.z) + 0.02));
      };
      point(0, this.p0);
      for (let i = 0; i < SEGMENTS; i++) {
        point((i + 1) / SEGMENTS, this.p1);
        const len = this.p0.distanceTo(this.p1);
        this.q.setFromUnitVectors(this.up, this.s.copy(this.p1).sub(this.p0).divideScalar(Math.max(1e-6, len)));
        this.m.compose(this.p0, this.q, this.s.set(1, len, 1));
        this.rope.setMatrixAt(n * SEGMENTS + i, this.m);
        this.p0.copy(this.p1);
      }
      n++;
    }
    this.rope.count = n * SEGMENTS;
    this.rope.instanceMatrix.needsUpdate = true;
    this.root.visible = n > 0;
  }
}

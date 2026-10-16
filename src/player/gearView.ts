import * as THREE from 'three';
import { CONFIG } from '../config';
import type { EntityId } from '../core/ids';
import type { WorldState } from '../core/world';
import { extinguisherShip, sprayPath } from '../fire/extinguisher';
import { gearMesh, type GearKind } from './handGear';
import type { GearPose } from './playerState';

const SEGMENTS = 14;
const MAX_SPRAYS = 4;
const MAX_BEAMS = 4;

/**
 * What hand gear does, as everyone sees it (player/handGear.ts):
 *   - crew-mates' gear in their hands (one mesh each, from their shared pose);
 *   - extinguisher spray: a short white arc along the spray's path (fire/extinguisher.ts
 *     sprayPath), as the monitor's jet is drawn, smaller: one instanced mesh of open
 *     cylinders for all sprays, widening from the nozzle (one draw call);
 *   - torch beams: a faint additive cone from each lit torch, yours included (one mesh
 *     each, only while lit). The light itself is only your own torch's (HandGear.light).
 */
export class GearView {
  readonly root = new THREE.Group();
  private readonly spray: THREE.InstancedMesh;
  private readonly beams: THREE.Mesh[] = [];
  private readonly beamMat: THREE.MeshBasicMaterial;
  private readonly others = new Map<EntityId, { kind: GearKind; mesh: THREE.Mesh; tip: THREE.Vector3 }>();
  private readonly path = Array.from({ length: 40 }, () => new THREE.Vector3());
  private readonly p = new THREE.Vector3();
  private readonly d = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly fwd = new THREE.Vector3(0, 0, -1);

  constructor() {
    this.root.name = 'handGear';
    const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0);
    this.spray = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xf2f6fa, transparent: true, opacity: 0.5, depthWrite: false }), SEGMENTS * MAX_SPRAYS);
    this.spray.frustumCulled = false;
    this.spray.count = 0;
    this.root.add(this.spray);
    // The torch beam: a cone from the lens (apex at the origin, opening along -z), fading out.
    const c = CONFIG.handGear.torch;
    const len = 14;
    const r = Math.tan((c.angleDeg * Math.PI) / 180) * len;
    const cone = new THREE.ConeGeometry(r, len, 16, 4, true).translate(0, -len / 2, 0).rotateX(Math.PI / 2); // apex at the lens, opening along -z
    const pos = cone.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const f = Math.max(0, 1 + pos.getZ(i) / len); // 1 at the lens, 0 at the far end
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = f * f;
    }
    cone.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xfff2d8, vertexColors: true, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < MAX_BEAMS; i++) {
      const b = new THREE.Mesh(cone, this.beamMat);
      b.name = 'torchBeam'; // the laser passes through it
      b.visible = false;
      this.beams.push(b);
      this.root.add(b);
    }
  }

  /**
   * @param local    your own gear's pose (world) this frame, if you hold some
   * @param roots    vessel roots (players aboard give their pose in that frame)
   * @param darkness 0 day .. 1 night (the beam shows more in the dark)
   */
  update(world: WorldState, localId: EntityId, local: { kind: GearKind; on: boolean; p: THREE.Vector3; d: THREE.Vector3 } | null, roots: Map<string, THREE.Object3D>, darkness: number): void {
    const charged = (extinguisherShip(world)?.extCharge ?? 1) > 0;
    let sprays = 0;
    let beams = 0;
    const work = (kind: GearKind, on: boolean, p: THREE.Vector3, d: THREE.Vector3) => {
      if (!on) return;
      if (kind === 'extinguisher' && charged && sprays < MAX_SPRAYS) this.drawSpray(sprays++, p, d);
      if (kind === 'torch' && beams < MAX_BEAMS) {
        const b = this.beams[beams++];
        b.position.copy(p);
        b.quaternion.setFromUnitVectors(this.fwd, d);
        b.visible = true;
      }
    };
    if (local) work(local.kind, local.on, local.p, local.d);
    const seen = new Set<EntityId>();
    for (const pl of Object.values(world.players)) {
      if (pl.id === localId) continue;
      const g = pl.avatar?.gear;
      if (!g) continue;
      const frame = pl.aboardVesselId ? roots.get(pl.aboardVesselId) : null;
      if (pl.aboardVesselId && !frame) continue;
      this.toWorld(g, frame ?? null);
      seen.add(pl.id);
      this.drawOther(pl.id, g.kind, this.p, this.d);
      work(g.kind, g.on, this.p, this.d);
    }
    for (const [id, o] of this.others) {
      if (seen.has(id)) continue;
      o.mesh.removeFromParent();
      this.others.delete(id);
    }
    this.spray.count = sprays * SEGMENTS;
    this.spray.instanceMatrix.needsUpdate = true;
    for (let i = beams; i < MAX_BEAMS; i++) this.beams[i].visible = false;
    this.beamMat.opacity = 0.03 + 0.12 * darkness;
  }

  private toWorld(g: GearPose, frame: THREE.Object3D | null): void {
    this.p.fromArray(g.p);
    this.d.fromArray(g.d);
    if (frame) {
      frame.localToWorld(this.p);
      this.d.transformDirection(frame.matrixWorld);
    }
    this.d.normalize();
  }

  /** A crew-mate's gear: its mesh at their nozzle, pointing their way. */
  private drawOther(id: EntityId, kind: GearKind, tipW: THREE.Vector3, dir: THREE.Vector3): void {
    let o = this.others.get(id);
    if (o && o.kind !== kind) {
      o.mesh.removeFromParent();
      o = undefined;
    }
    if (!o) {
      o = { kind, ...gearMesh(kind) };
      this.root.add(o.mesh);
      this.others.set(id, o);
    }
    o.mesh.quaternion.setFromUnitVectors(this.fwd, dir);
    // The mesh's origin is the grip, a little behind and above the tip.
    o.mesh.position.copy(tipW).sub(this.s.copy(o.tip).applyQuaternion(o.mesh.quaternion));
  }

  /** One spray: segments along its path, from 2 cm wide at the nozzle to 30 cm where it lands. */
  private drawSpray(k: number, from: THREE.Vector3, dir: THREE.Vector3): void {
    const n = sprayPath(from, dir, this.path, 0.03);
    const last = Math.max(1, n - 1);
    for (let i = 0; i < SEGMENTS; i++) {
      const a = this.path[Math.min(last - 1, Math.floor((i / SEGMENTS) * last))];
      const b = this.path[Math.min(last, Math.floor(((i + 1) / SEGMENTS) * last))];
      const len = Math.max(1e-3, a.distanceTo(b));
      const w = 0.02 + 0.14 * (i / SEGMENTS);
      this.q.setFromUnitVectors(this.up, this.s.copy(b).sub(a).divideScalar(len));
      this.m.compose(a, this.q, this.s.set(w, len, w));
      this.spray.setMatrixAt(k * SEGMENTS + i, this.m);
    }
  }
}

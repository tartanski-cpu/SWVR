/**
 * Drawing longlines (fishing/longline.ts):
 *
 *   dan buoys  each end of a line in the water: an orange float riding the waves, a pole and a
 *              black flag (seen from afar: how you find your line again). One instanced mesh.
 *   shooting   the groundline paying out over her stern into her wake: a short line from her
 *              transom to the water behind.
 *   hauling    the line over her gunwale at its lead, down to the water toward its next stretch;
 *              and a fish on the hook at the rail, its own species' colour and its own size.
 *
 * Plain lines and a handful of meshes, no rope physics; drawn only within `DRAW_RANGE`.
 */
import * as THREE from 'three';
import type { WorldState } from '../core/world';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { hullPlan } from '../vessel/layout';
import { FISH_HANG, nextStretch, speciesOf, type LineFish } from './longline';

const MAX_BUOYS = 24;
const MAX_SEGMENTS = 16;
const DRAW_RANGE = 1500;

/** A fish 1 m long hanging by its mouth from the hook at the origin, its tail down (-y): scaled to each fish's length. */
function fishGeometry(): THREE.BufferGeometry {
  return mergeParts([
    part(new THREE.SphereGeometry(0.5, 8, 6).scale(0.16, 1, 0.09).translate(0, -0.5, 0), 0xffffff),
    // The tail fin, widening below the body.
    part(new THREE.ConeGeometry(0.12, 0.22, 4).scale(1, 1, 0.3).translate(0, -1.08, 0), 0xffffff),
    // Its belly paler (under the instance colour).
    part(new THREE.SphereGeometry(0.5, 6, 4).scale(0.1, 0.8, 0.095).translate(0.03, -0.5, 0), 0xe8e8e0),
  ]);
}

/** A fish's length (m) from its weight: a cod-like fish, about 1 kg at 45 cm (length goes as the cube root). */
function fishLength(f: LineFish): number {
  return 0.45 * Math.cbrt(Math.max(0.05, f.kg));
}

export class LonglineView {
  readonly root = new THREE.Group();
  private readonly buoys: THREE.InstancedMesh;
  private readonly lines: THREE.LineSegments;
  private readonly linePos = new Float32Array(MAX_SEGMENTS * 6);
  private readonly fishGeo = fishGeometry();
  private readonly fish = new Map<string, THREE.Mesh>();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly p = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();

  constructor() {
    this.root.name = 'longline';
    // The dan buoy: float, pole, flag (its origin on the water).
    const geo = mergeParts([
      part(new THREE.SphereGeometry(0.32, 10, 7).scale(1, 0.85, 1), 0xf07018),
      part(new THREE.CylinderGeometry(0.025, 0.025, 2.4, 5).translate(0, 1.4, 0), 0x2a2e33),
      part(new THREE.BoxGeometry(0.02, 0.35, 0.5).translate(0, 2.4, 0.26), 0x141414),
      // A band of reflective tape round the pole.
      part(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 5).translate(0, 1.0, 0), 0xe8e8e0),
    ]);
    this.buoys = new THREE.InstancedMesh(geo, flatVertexColorMaterial(), MAX_BUOYS);
    this.buoys.count = 0;
    this.buoys.frustumCulled = false;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xd8c070 }));
    this.lines.frustumCulled = false;
    this.root.add(this.buoys, this.lines);
  }

  update(world: WorldState, waves: readonly PreparedWave[], viewer: THREE.Vector3, vesselRoots: Map<string, THREE.Object3D>): void {
    const s = world.longline;
    let nb = 0;
    let ns = 0;
    const live = new Set<string>();
    const seg = (a: THREE.Vector3, b: THREE.Vector3) => {
      if (ns >= MAX_SEGMENTS) return;
      this.linePos.set([a.x, a.y, a.z, b.x, b.y, b.z], ns * 6);
      ns++;
    };
    for (const line of s?.lines ?? []) {
      for (const e of [0, 1] as const) {
        const bu = line.buoys[e];
        // (A buoy brought aboard is drawn by the line over the rail instead.)
        if (!bu || nb >= MAX_BUOYS || (line.haul?.phase === 'line' && line.haul.end === e)) continue;
        if (Math.hypot(bu[0] - viewer.x, bu[1] - viewer.z) > DRAW_RANGE) continue;
        this.p.set(bu[0], surfaceHeight(waves, bu[0], bu[1]) - 0.08, bu[1]);
        this.m.compose(this.p, this.q, this.s);
        this.buoys.setMatrixAt(nb++, this.m);
      }
      const h = line.haul;
      const root = h?.vessel ? vesselRoots.get(h.vessel) : undefined;
      if (h?.phase !== 'line' || !h.lead || !root) continue;
      // Over the gunwale and down toward its next stretch.
      root.localToWorld(this.a.set(h.lead[0], h.lead[1], h.lead[2]));
      const [nx, nz] = nextStretch(line);
      const d = this.dir.set(nx - this.a.x, 0, nz - this.a.z);
      if (d.lengthSq() < 1e-6) d.set(1, 0, 0);
      d.normalize();
      this.b.set(this.a.x + d.x * 0.8, 0, this.a.z + d.z * 0.8);
      this.b.y = surfaceHeight(waves, this.b.x, this.b.z);
      seg(this.a, this.b);
      // A fish on its hook, swung up to the rail just outboard of the lead (FISH_HANG).
      if (h.fish) {
        let mesh = this.fish.get(line.id);
        if (!mesh) {
          mesh = new THREE.Mesh(this.fishGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
          this.fish.set(line.id, mesh);
          this.root.add(mesh);
        }
        live.add(line.id);
        const L = fishLength(h.fish);
        (mesh.material as THREE.MeshLambertMaterial).color.setHex(speciesOf(h.fish.species)?.color ?? 0x888888);
        mesh.position.set(this.a.x + d.x * FISH_HANG.out, this.a.y + FISH_HANG.up, this.a.z + d.z * FISH_HANG.out);
        mesh.scale.setScalar(L);
        mesh.rotation.set(0, Math.atan2(d.x, d.z), 0);
        mesh.visible = true;
      }
    }
    // Lines being shot: off her transom into the wake.
    for (const sh of s?.shooting ?? []) {
      const root = vesselRoots.get(sh.vessel);
      const v = world.vessels[sh.vessel];
      if (!root || !v) continue;
      const plan = hullPlan(VESSEL_DEFS[v.defId]);
      root.localToWorld(this.a.set(0, plan.deckY(plan.transom) + 0.3, plan.transom));
      root.localToWorld(this.b.set(0, 0, plan.transom + 3));
      this.b.y = surfaceHeight(waves, this.b.x, this.b.z);
      seg(this.a, this.b);
    }
    for (const [id, mesh] of this.fish) {
      if (live.has(id)) continue;
      mesh.removeFromParent();
      (mesh.material as THREE.Material).dispose();
      this.fish.delete(id);
    }
    this.buoys.count = nb;
    this.buoys.visible = nb > 0;
    if (nb) this.buoys.instanceMatrix.needsUpdate = true;
    this.lines.geometry.setDrawRange(0, ns * 2);
    (this.lines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.lines.visible = ns > 0;
  }
}

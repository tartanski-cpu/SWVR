/**
 * The timber run drawn (voyage/timber.ts): the logs stacked on each log barge's deck, and a
 * buoy in the timber camp's bay, so the anchorage reads as "something is here".
 *
 * Cheap on the Quest: every log on every barge is one instanced mesh (one draw call), the
 * buoy one small merged mesh. The logs lie fore and aft, side by side across her deck,
 * `logsPerTier` to a tier (tiers at 10, 20, 30, 40), and follow her as she rides the sea.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { hotspotAt } from './timber';
import type { MetaverseSite } from './metaverse';

/** Logs drawn at most (four full barges' worth). */
const MAX_LOGS = 4 * CONFIG.voyage.timber.maxLogs;

export class TimberView {
  readonly root = new THREE.Group();
  private readonly logs: THREE.InstancedMesh;
  private readonly buoys: THREE.Mesh[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly local = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor(sites: readonly MetaverseSite[]) {
    const c = CONFIG.voyage.timber;
    // A log along the barge's length (vessel z), its cut ends paler.
    const geo = new THREE.CylinderGeometry(c.logDiameter / 2, c.logDiameter / 2, c.logLength, 7).rotateX(Math.PI / 2);
    this.logs = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x8a6a48 }), MAX_LOGS);
    this.logs.name = 'logBargeLogs';
    this.logs.frustumCulled = false;
    this.logs.count = 0;
    this.root.add(this.logs);
    // The bay's buoy: a yellow can with a timber-brown band and a small topmark.
    for (const s of sites) {
      const at = hotspotAt(s);
      if (!at) continue;
      const can = new THREE.CylinderGeometry(0.45, 0.5, 0.9, 10).translate(0, 0.35, 0);
      const band = new THREE.CylinderGeometry(0.52, 0.52, 0.18, 10).translate(0, 0.45, 0);
      const mark = new THREE.ConeGeometry(0.2, 0.4, 8).translate(0, 1.0, 0);
      const colour = (g: THREE.BufferGeometry, hex: number) => {
        const col = new THREE.Color(hex);
        const n = g.getAttribute('position').count;
        g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [col.r, col.g, col.b]).flat(), 3));
        return g;
      };
      const buoy = new THREE.Mesh(mergeGeometries([colour(can, 0xe8c030), colour(band, 0x6a4a2a), colour(mark, 0x6a4a2a)]), new THREE.MeshLambertMaterial({ vertexColors: true }));
      buoy.name = `timberBuoy:${s.id}`;
      buoy.position.set(at.x, 0, at.z);
      this.buoys.push(buoy);
      this.root.add(buoy);
    }
  }

  /** Each frame: the logs on each barge where she is now; the buoys on the swell (`waveY`). */
  update(world: WorldState, waveY: (x: number, z: number) => number): void {
    const c = CONFIG.voyage.timber;
    const deck = CONFIG.vessels.barge.hull.deckYAft;
    let n = 0;
    for (const [id, b] of Object.entries(world.timber?.barges ?? {})) {
      const v = world.vessels[id];
      if (!v) continue;
      this.q.fromArray(v.orientation);
      this.p.fromArray(v.position);
      this.m.compose(this.p, this.q, this.one);
      for (let i = 0; i < b.logs && n < MAX_LOGS; i++) {
        const tier = Math.floor(i / c.logsPerTier);
        const k = i % c.logsPerTier;
        // Across her deck, centred; each tier set half a log in, as logs settle in the gaps.
        const across = (k - (c.logsPerTier - 1) / 2) * c.logDiameter + (tier % 2 ? c.logDiameter / 2 : 0);
        const up = deck + c.logDiameter * (0.5 + tier * 0.87);
        this.local.makeTranslation(across, up, -0.6);
        this.logs.setMatrixAt(n++, this.local.premultiply(this.m));
      }
    }
    this.logs.count = n;
    this.logs.instanceMatrix.needsUpdate = true;
    for (const buoy of this.buoys) buoy.position.y = waveY(buoy.position.x, buoy.position.z);
  }

  dispose(): void {
    this.logs.geometry.dispose();
    (this.logs.material as THREE.Material).dispose();
    for (const b of this.buoys) {
      b.geometry.dispose();
      (b.material as THREE.Material).dispose();
    }
  }
}

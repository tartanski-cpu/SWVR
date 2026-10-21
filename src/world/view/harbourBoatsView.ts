/**
 * Drawing the harbour boats (world/harbourBoats.ts): the nearest `maxShown` within
 * `drawDistance` of the viewer, re-picked every `refresh` s (CONFIG.harbourBoats; farther on
 * a desktop). One instanced mesh per design (harbourBoatKit.ts), so a harbour is a draw call
 * or a few, plus one for the mooring buoys and one for the anchor lights.
 *   - Each frame each boat shown is posed (swung to the wind) and set on the waves: within
 *     `bobDistance` from three wave samples (rise, pitch and roll, as the traffic's ships),
 *     beyond from one (rise and fall only).
 *   - A moored boat's buoy floats where it is; an anchored boat shows her all-round white
 *     anchor light at the masthead in the dark.
 *   - One alongside where a vessel lies (a saved game in her berth) isn't drawn.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { WorldState } from '../../core/world';
import { surfaceHeight, type PreparedWave } from '../../ocean/waves';
import { glowSprite, LightPointsMaterial } from '../../render/lightPoints';
import type { HarbourBoatKind } from '../defs';
import { boatWind, harbourBoatDisplaced, harbourBoatPose, harbourBoats, type HarbourBoat, type HarbourBoatPose } from '../harbourBoats';
import { harbourBoatGeometry, harbourBoatMaterial, mastheadHeight } from './harbourBoatKit';
import { treeLevel } from './treesView';

const KINDS: HarbourBoatKind[] = ['creel', 'yacht', 'cruiser', 'rib', 'caique'];

/** The settings in force: CONFIG.harbourBoats, farther on a desktop (the same device level as the trees). */
function boatSettings() {
  const c = CONFIG.harbourBoats;
  return treeLevel() === 'desktop' ? { ...c, ...c.desktop } : c;
}

export class HarbourBoatsView {
  readonly root = new THREE.Group();
  private readonly meshes = new Map<HarbourBoatKind, THREE.InstancedMesh>();
  private readonly buoys: THREE.InstancedMesh;
  private readonly lights: THREE.Points;
  private readonly lightMat = new LightPointsMaterial(glowSprite(), CONFIG.lightPoints.size * 0.7);
  private shown: HarbourBoat[] = [];
  private pickedAt = { x: Infinity, z: Infinity, t: -Infinity };
  private readonly pose: HarbourBoatPose = { x: 0, z: 0, heading: 0 };
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly p = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly col = new THREE.Color();
  /** How many boats are drawn now (the perf panel, tests). */
  count = 0;

  constructor() {
    this.root.name = 'harbour-boats';
    const cap = Math.max(CONFIG.harbourBoats.maxShown, CONFIG.harbourBoats.desktop.maxShown);
    const mat = harbourBoatMaterial();
    for (const k of KINDS) {
      const mesh = new THREE.InstancedMesh(harbourBoatGeometry(k), mat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, this.col.set(0xffffff)); // makes its instance colours
      mesh.count = 0;
      mesh.frustumCulled = false; // its instances spread over the harbour; the box of instance 0 says nothing
      mesh.name = `harbour-boats-${k}`;
      this.meshes.set(k, mesh);
      this.root.add(mesh);
    }
    const buoy = new THREE.IcosahedronGeometry(0.4, 0);
    buoy.setAttribute('color', new THREE.Float32BufferAttribute(new Array(buoy.attributes.position.count).fill([0.95, 0.45, 0.15]).flat(), 3));
    this.buoys = new THREE.InstancedMesh(buoy, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), cap);
    this.buoys.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.buoys.count = 0;
    this.buoys.frustumCulled = false;
    this.buoys.name = 'harbour-boat-buoys';
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3), 3));
    lg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cap * 3).fill(1), 3));
    lg.setDrawRange(0, 0);
    this.lights = new THREE.Points(lg, this.lightMat);
    this.lights.frustumCulled = false;
    this.lights.name = 'harbour-boat-lights';
    this.root.add(this.buoys, this.lights);
  }

  /** Pick the nearest boats to draw (every `refresh` s, or after a move of a tenth of the reach). */
  private pick(world: WorldState, x: number, z: number, now: number): void {
    const c = boatSettings();
    const moved = Math.hypot(x - this.pickedAt.x, z - this.pickedAt.z);
    if (now - this.pickedAt.t < c.refresh * 1000 && moved < c.drawDistance * 0.1) return;
    this.pickedAt = { x, z, t: now };
    const d2 = c.drawDistance * c.drawDistance;
    const near: { b: HarbourBoat; d: number }[] = [];
    for (const b of harbourBoats()) {
      const d = (b.x - x) ** 2 + (b.z - z) ** 2;
      if (d < d2 && !harbourBoatDisplaced(b, world)) near.push({ b, d });
    }
    near.sort((a, b) => a.d - b.d);
    this.shown = near.slice(0, c.maxShown).map((n) => n.b);
  }

  update(world: WorldState, waves: readonly PreparedWave[], darkness: number, viewer: { x: number; z: number }): void {
    this.pick(world, viewer.x, viewer.z, performance.now());
    const c = boatSettings();
    const { from, speed } = boatWind(world);
    const counts = new Map<HarbourBoatKind, number>(KINDS.map((k) => [k, 0]));
    let buoys = 0;
    let lights = 0;
    const lp = this.lights.geometry.attributes.position as THREE.BufferAttribute;
    const bob2 = c.bobDistance * c.bobDistance;
    for (const b of this.shown) {
      const k = c.kinds[b.kind];
      const s = harbourBoatPose(b, from, speed, world.time, this.pose);
      const fx = Math.sin(s.heading);
      const fz = -Math.cos(s.heading);
      const h = surfaceHeight(waves, s.x, s.z);
      let pitch = 0;
      let roll = 0;
      let y = h;
      if ((s.x - viewer.x) ** 2 + (s.z - viewer.z) ** 2 < bob2) {
        const L = k.length;
        const bow = surfaceHeight(waves, s.x + fx * L * 0.4, s.z + fz * L * 0.4);
        const stern = surfaceHeight(waves, s.x - fx * L * 0.4, s.z - fz * L * 0.4);
        const side = surfaceHeight(waves, s.x - fz * k.beam * 0.5, s.z + fx * k.beam * 0.5);
        y = (h * 2 + bow + stern) / 4;
        pitch = Math.atan2(bow - stern, L * 0.8);
        roll = Math.atan2(side - h, k.beam * 0.5) * 0.6;
      }
      const mesh = this.meshes.get(b.kind)!;
      const i = counts.get(b.kind)!;
      counts.set(b.kind, i + 1);
      this.q.setFromEuler(this.e.set(pitch, -s.heading, roll, 'YXZ'));
      mesh.setMatrixAt(i, this.m.compose(this.p.set(s.x, y, s.z), this.q, this.one));
      mesh.setColorAt(i, this.col.setHex(b.colour));
      if (b.how === 'moored') {
        this.q.identity();
        this.buoys.setMatrixAt(buoys++, this.m.compose(this.p.set(b.x, surfaceHeight(waves, b.x, b.z) + 0.1, b.z), this.q, this.one));
      } else if (b.how === 'anchored' && darkness > 0.35) {
        lp.setXYZ(lights++, s.x - fx * k.length * 0.14, y + mastheadHeight(b.kind), s.z - fz * k.length * 0.14);
      }
    }
    for (const [kind, mesh] of this.meshes) {
      mesh.count = counts.get(kind)!;
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.buoys.count = buoys;
    this.buoys.visible = buoys > 0;
    this.buoys.instanceMatrix.needsUpdate = true;
    lp.needsUpdate = true;
    this.lights.geometry.setDrawRange(0, lights);
    this.lights.visible = lights > 0;
    this.lightMat.set(CONFIG.lightPoints.size * 0.7 * (0.5 + 0.5 * darkness), Math.min(1, (darkness - 0.35) * 4));
    this.count = this.shown.length;
  }
}

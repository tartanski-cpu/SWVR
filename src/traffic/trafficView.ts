/**
 * Drawing the traffic: passing ships and floating debris (the hazard buoys are
 * world/view/navMarksView.ts). Cheap:
 *   - each ship type is ONE merged, vertex-coloured mesh (hull, superstructure, cargo,
 *     mast), built once and shared; its navigation lights are a few points (fixed pixel
 *     size, so they read far off) shown only in the dark;
 *   - ships bob, pitch and roll from three wave samples (big ships less);
 *   - debris share one small mesh.
 * Positions follow the shared state smoothly (they move on between snapshots).
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import type { ShipType } from './traffic';

interface ShipMarker {
  root: THREE.Group;
  lights: THREE.Points;
  x: number;
  z: number;
  type: ShipType;
}

const box = (w: number, h: number, l: number, x: number, y: number, z: number, c: number) => part(new THREE.BoxGeometry(w, h, l).translate(x, y, z), c);

/** A hull from its plan: straight sides, a pointed bow (toward -z), extruded from keel to sheer. */
function hull(L: number, B: number, bottom: number, top: number, bowFrac: number, color: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  // Shape y = -z (bow at +y), extruded along +z, which is turned to point up.
  s.moveTo(-B / 2, -L / 2);
  s.lineTo(B / 2, -L / 2);
  s.lineTo(B / 2, L / 2 - L * bowFrac);
  s.lineTo(0, L / 2);
  s.lineTo(-B / 2, L / 2 - L * bowFrac);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: top - bottom, bevelEnabled: false });
  g.rotateX(-Math.PI / 2).translate(0, bottom, 0);
  return part(g, color);
}

/** The three ship types, built once. Origin on the waterline amidships, bow toward -z. */
function shipGeometry(type: ShipType): { mesh: THREE.BufferGeometry; lights: { p: [number, number, number]; c: number }[] } {
  const st = CONFIG.traffic.ships[type];
  const L = st.length;
  const B = st.beam;
  if (type === 'cargo') {
    const parts = [hull(L, B, -3, 4, 0.14, 0x5a1a1a), box(B * 0.98, 0.6, L * 0.8, 0, 1, -L * 0.02, 0x2a2a2a)];
    // Accommodation aft, funnel, and containers on deck.
    parts.push(box(B * 0.85, 9, 10, 0, 8.5, L / 2 - 9, 0xeeeeee), box(B * 0.9, 0.5, 11, 0, 13.2, L / 2 - 9, 0xdddddd));
    parts.push(box(3, 5, 3, 0, 15.5, L / 2 - 4, 0x2a3a6a));
    const cols = [0x2a6aaa, 0xc0402a, 0x3a8a3a, 0xd8a020, 0x8a8a8a];
    for (let i = 0; i < 6; i++) {
      const z = -L / 2 + 16 + i * 9.5;
      parts.push(box(B * 0.84, 2.6 * (1 + (i % 3 === 0 ? 1 : 0)), 8, 0, 4 + 1.3 * (1 + (i % 3 === 0 ? 1 : 0)), z, cols[i % cols.length]));
    }
    parts.push(box(0.4, 10, 0.4, 0, 9, -L / 2 + 6, 0xcccccc));
    return { mesh: mergeParts(parts), lights: [{ p: [0, 14, -L / 2 + 6], c: 0xffffff }, { p: [0, 18, L / 2 - 9], c: 0xffffff }, { p: [-B / 2, 12, L / 2 - 9], c: 0xff2020 }, { p: [B / 2, 12, L / 2 - 9], c: 0x20ff40 }, { p: [0, 5, L / 2], c: 0xffffff }] };
  }
  if (type === 'fishing') {
    const parts = [hull(L, B, -1.8, 1.6, 0.25, 0x1f4f8f), box(B * 0.96, 0.2, L * 0.9, 0, 1.7, 0, 0xd8d4c8)];
    parts.push(box(3.6, 2.6, 4.2, 0, 3.0, -L / 2 + 6, 0xf0f0f0), box(3.8, 0.2, 4.6, 0, 4.4, -L / 2 + 6, 0x2a2a2a));
    parts.push(box(0.25, 6, 0.25, 0, 7, -L / 2 + 6.5, 0xcccccc));
    // The stern gantry.
    parts.push(box(0.3, 4.5, 0.3, -2.2, 4, L / 2 - 1.5, 0xd88a20), box(0.3, 4.5, 0.3, 2.2, 4, L / 2 - 1.5, 0xd88a20), box(4.7, 0.3, 0.3, 0, 6.2, L / 2 - 1.5, 0xd88a20));
    return { mesh: mergeParts(parts), lights: [{ p: [0, 9.8, -L / 2 + 6.5], c: 0xffffff }, { p: [-1.9, 4.6, -L / 2 + 6], c: 0xff2020 }, { p: [1.9, 4.6, -L / 2 + 6], c: 0x20ff40 }, { p: [0, 2.2, L / 2], c: 0xffffff }] };
  }
  // Yacht: white hull, low coachroof, mast and a mainsail.
  const parts = [hull(L, B, -1.2, 1.0, 0.3, 0xf2f2f0), box(B * 0.55, 0.6, L * 0.35, 0, 1.3, -0.5, 0xe8e4d8)];
  parts.push(part(new THREE.CylinderGeometry(0.09, 0.09, 15, 6).translate(0, 8.5, -1.2), 0xb0b4b8));
  const sail = new THREE.Shape();
  sail.moveTo(0, 0);
  sail.lineTo(4.6, 0);
  sail.lineTo(0, 13);
  sail.closePath();
  const sg = new THREE.ExtrudeGeometry(sail, { depth: 0.04, bevelEnabled: false });
  sg.rotateY(-Math.PI / 2).translate(0, 2.2, -1.1); // the boom runs aft from the mast
  parts.push(part(sg, 0xfafaf4));
  return { mesh: mergeParts(parts), lights: [{ p: [0, 15.8, -1.2], c: 0xffffff }, { p: [-1.5, 1.4, -L / 2 + 1.5], c: 0xff2020 }, { p: [1.5, 1.4, -L / 2 + 1.5], c: 0x20ff40 }, { p: [0, 1.4, L / 2], c: 0xffffff }] };
}

export class TrafficView {
  readonly root = new THREE.Group();
  private readonly geo = new Map<ShipType, { mesh: THREE.BufferGeometry; lights: THREE.BufferGeometry }>();
  private readonly material = flatVertexColorMaterial();
  private readonly lightMat = new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true, toneMapped: false });
  private readonly ships = new Map<string, ShipMarker>();
  private readonly debris = new Map<string, THREE.Mesh>();
  private readonly debrisGeo: THREE.BufferGeometry;
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor() {
    this.root.name = 'traffic';
    // Debris: a few planks and a drum, floating low.
    this.debrisGeo = mergeParts([
      box(3, 0.3, 0.4, 0, 0.05, 0, 0x6a5038),
      part(new THREE.BoxGeometry(2.4, 0.25, 0.35).rotateY(0.7).translate(0.4, 0.1, 0.6), 0x7a5a40),
      part(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 8).rotateZ(Math.PI / 2).translate(-0.6, 0.15, -0.7), 0x2a5a8a),
    ]);
  }

  private typeGeo(type: ShipType) {
    let g = this.geo.get(type);
    if (!g) {
      const s = shipGeometry(type);
      const lights = new THREE.BufferGeometry();
      lights.setAttribute('position', new THREE.Float32BufferAttribute(s.lights.flatMap((l) => l.p), 3));
      const c = new THREE.Color();
      lights.setAttribute('color', new THREE.Float32BufferAttribute(s.lights.flatMap((l) => c.setHex(l.c).toArray()), 3));
      g = { mesh: s.mesh, lights };
      this.geo.set(type, g);
    }
    return g;
  }

  /** Position on the waves: height, pitch and roll from samples at bow, stern and beam. */
  private float(obj: THREE.Object3D, waves: readonly PreparedWave[], x: number, z: number, course: number, L: number, B: number): void {
    const h = surfaceHeight(waves, x, z);
    const fx = Math.sin(course);
    const fz = -Math.cos(course);
    const bow = surfaceHeight(waves, x + fx * L * 0.4, z + fz * L * 0.4);
    const stern = surfaceHeight(waves, x - fx * L * 0.4, z - fz * L * 0.4);
    const side = surfaceHeight(waves, x - fz * B * 0.5, z + fx * B * 0.5);
    const damp = Math.min(1, 25 / L); // big ships move less
    obj.position.set(x, (h * 2 + bow + stern) / 4, z);
    this.e.set(Math.atan2(bow - stern, L * 0.8) * damp, -course, Math.atan2(side - h, B * 0.5) * damp * 0.6);
    obj.quaternion.setFromEuler(this.e);
  }

  update(world: WorldState, waves: readonly PreparedWave[], darkness: number, dt: number): void {
    const t = world.traffic;
    const seen = new Set<string>();
    for (const s of t?.ships ?? []) {
      seen.add(s.id);
      let m = this.ships.get(s.id);
      if (!m) {
        const g = this.typeGeo(s.type);
        const root = new THREE.Group();
        const lights = new THREE.Points(g.lights, this.lightMat);
        root.add(new THREE.Mesh(g.mesh, this.material), lights);
        root.name = `ship:${s.name}`;
        this.root.add(root);
        m = { root, lights, x: s.x, z: s.z, type: s.type };
        this.ships.set(s.id, m);
      }
      // Keep moving between updates; ease onto the shared position.
      m.x += Math.sin(s.course) * s.speed * dt;
      m.z -= Math.cos(s.course) * s.speed * dt;
      const k = Math.hypot(s.x - m.x, s.z - m.z) > 50 ? 1 : Math.min(1, dt * 2);
      m.x += (s.x - m.x) * k;
      m.z += (s.z - m.z) * k;
      const st = CONFIG.traffic.ships[s.type];
      this.float(m.root, waves, m.x, m.z, s.course, st.length, st.beam);
      m.lights.visible = darkness > 0.35;
    }
    for (const [id, m] of this.ships) {
      if (seen.has(id)) continue;
      m.root.removeFromParent();
      this.ships.delete(id);
    }
    const dseen = new Set<string>();
    for (const d of t?.debris ?? []) {
      dseen.add(d.id);
      let mesh = this.debris.get(d.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.debrisGeo, this.material);
        mesh.name = 'debris';
        this.root.add(mesh);
        this.debris.set(d.id, mesh);
      }
      this.float(mesh, waves, d.x, d.z, 0.4, 3, 2);
    }
    for (const [id, mesh] of this.debris) {
      if (dseen.has(id)) continue;
      mesh.removeFromParent();
      this.debris.delete(id);
    }
  }

  /** Where a ship is drawn (for its horn), or null. */
  shipPosition(id: string): THREE.Vector3 | null {
    const m = this.ships.get(id);
    return m ? m.root.position.clone().setY(m.root.position.y + 8) : null;
  }

  shipType(id: string): ShipType | null {
    return this.ships.get(id)?.type ?? null;
  }
}

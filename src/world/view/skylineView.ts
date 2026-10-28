/**
 * A coast map's skyline (the coast extras plan, C2): what stands up against the sky from the
 * sea, from the map data (SkylineDef, the pipeline's features stage): castles, towers, masts,
 * chimneys, water towers, monuments, churches and wind turbines. Designs of the game's own,
 * not copies: a castle is a tower house, a church a harled nave with a tower (in the Aegean,
 * a white chapel with a blue dome).
 *
 * Cheap, and seen as far as the fog allows:
 *   - everything that stands still is ONE merged mesh (one draw call), made again when a big
 *     map's ground streams in or out under it (checked every few seconds), so nothing floats
 *     or sinks when the coarse ground gives way to the detailed;
 *   - the turbines' nacelles and rotors are two instanced meshes: each nacelle turned to the
 *     wind, each rotor turning (CONFIG.skyline.turbine: from cut-in to rated speed, stopped
 *     above cut-out), every frame (a few dozen matrices);
 *   - the red obstruction lights after dark are one set of points: steady on masts and tall
 *     chimneys, turbines flashing together.
 * Height from the map where tagged, else the kind's own (CONFIG.skyline.heights).
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { WorldState } from '../../core/world';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';
import { glowSprite, LightPointsMaterial } from '../../render/lightPoints';
import { coastTerrains } from '../coastTerrain';
import type { SkylineDef } from '../defs';
import { groundHeight } from '../terrain';
import { boatWind } from '../harbourBoats';

const STONE = 0x8a8478;
const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) => part(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);
const cyl = (r0: number, r1: number, h: number, seg: number, x: number, y: number, z: number, c: number) => part(new THREE.CylinderGeometry(r1, r0, h, seg).translate(x, y + h / 2, z), c);

/** How tall it stands (m): the map's height, else the kind's. */
export function skylineHeight(s: SkylineDef): number {
  return s.height && s.height > 2 && s.height < 400 ? s.height : CONFIG.skyline.heights[s.kind] ?? 12;
}

/** One still landmark's parts at (x, g, z): its foot on the ground `g`. */
function landmarkParts(s: SkylineDef, g: number, aegean: boolean): THREE.BufferGeometry[] {
  const h = skylineHeight(s);
  const { x, z } = s;
  const turn = (((s.x * 7.13 + s.z * 3.71) % 360) * Math.PI) / 180;
  const spin = (geos: THREE.BufferGeometry[]) => geos.map((p) => p.translate(-x, 0, -z).rotateY(turn).translate(x, 0, z));
  switch (s.kind) {
    case 'castle': {
      const c = CONFIG.skyline.castleFootprint;
      const w = Math.max(c.min, Math.min(c.max, (s.size ?? 0) * c.share));
      return spin([box(w, h, w * 0.8, x, g + h / 2, z, STONE), box(w + 0.6, 1, w * 0.8 + 0.6, x, g + h + 0.5, z, STONE), cyl(1.6, 1.6, h + 3, 6, x + w / 2, g, z + w * 0.4, STONE)]);
    }
    case 'church':
      if (aegean) return spin([box(6, 4.5, 9, x, g + 2.25, z, 0xf2f0ea), part(new THREE.SphereGeometry(2.6, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, g + 4.5, z), 0x2a5a9a), box(1.6, 3, 1.6, x, g + 6, z - 4, 0xf2f0ea)]);
      return spin([box(7, 6, 15, x, g + 3, z, 0xd8d2c4), part(new THREE.CylinderGeometry(0.01, 5.2, 3.5, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 2.1).translate(x, g + 7.75, z), 0x4a4e54), box(4, h, 4, x, g + h / 2, z - 9, 0xd8d2c4), part(new THREE.ConeGeometry(2.9, 4, 4).rotateY(Math.PI / 4).translate(x, g + h + 2, z - 9), 0x4a4e54)]);
    case 'tower':
      return spin([box(5, h, 5, x, g + h / 2, z, STONE), box(5.6, 0.8, 5.6, x, g + h + 0.4, z, STONE)]);
    case 'mast':
      // A lattice mast seen from afar: a slim three-sided taper, a dish part way up.
      return [cyl(1.4, 0.25, h, 3, x, g, z, 0xb8bcc0), cyl(0.8, 0.8, 0.4, 6, x, g + h * 0.7, z, 0xd8dcdc)];
    case 'chimney':
      return [cyl(h * 0.06, h * 0.035, h, 8, x, g, z, 0x8a5040)];
    case 'water_tower':
      return [cyl(1.2, 1.2, h * 0.7, 6, x, g, z, 0xb0aca4), cyl(5, 5, h * 0.3, 10, x, g + h * 0.7, z, 0xb0aca4)];
    case 'monument':
      return [box(2.4, 1, 2.4, x, g + 0.5, z, 0x9a948a), cyl(0.9, 0.5, h - 1.6, 4, x, g + 1, z, 0x9a948a), part(new THREE.ConeGeometry(0.5, 0.6, 4).translate(x, g + h - 0.3, z), 0x9a948a)];
    case 'turbine':
      // The tower only: her nacelle and rotor turn (TURBINE below).
      return [cyl(h * 0.035, h * 0.02, h, 8, x, g, z, 0xeef0f0)];
  }
  return [];
}

/** A turbine's nacelle (pointing -z, into the wind) and her three blades about the shaft (z), sized to a 1 m hub; scaled per turbine. */
function nacelleGeometry(): THREE.BufferGeometry {
  return mergeParts([part(new THREE.BoxGeometry(0.06, 0.06, 0.16).translate(0, 0, 0.03), 0xeef0f0)]);
}
function rotorGeometry(): THREE.BufferGeometry {
  const b = CONFIG.skyline.turbine.blade;
  const blades = [0, 1, 2].map((k) => part(new THREE.BoxGeometry(0.03, b, 0.008).translate(0, b / 2, 0).rotateZ((k * 2 * Math.PI) / 3), 0xeef0f0));
  return mergeParts([...blades, part(new THREE.ConeGeometry(0.025, 0.05, 6).rotateX(-Math.PI / 2).translate(0, 0, -0.07), 0xeef0f0)]);
}

export class SkylineView {
  readonly root = new THREE.Group();
  private stills: THREE.Mesh | null = null;
  private readonly material = flatVertexColorMaterial();
  private readonly turbines: SkylineDef[];
  private readonly nacelles: THREE.InstancedMesh;
  private readonly rotors: THREE.InstancedMesh;
  private readonly lit: { x: number; z: number; top: number; flash: boolean }[] = [];
  private readonly lights: THREE.Points;
  private readonly lightMat = new LightPointsMaterial(glowSprite(), CONFIG.lightPoints.size * CONFIG.skyline.lights.size);
  private groundVersion = -1;
  private groundAt = -Infinity;
  private feet: number[] = [];
  private angle = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly qs = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();
  private readonly y = new THREE.Vector3(0, 1, 0);
  private readonly zAxis = new THREE.Vector3(0, 0, 1);

  constructor(
    private readonly items: readonly SkylineDef[],
    private readonly aegean = false,
  ) {
    this.root.name = 'skyline';
    this.turbines = items.filter((s) => s.kind === 'turbine');
    const n = Math.max(1, this.turbines.length);
    this.nacelles = new THREE.InstancedMesh(nacelleGeometry(), this.material, n);
    this.rotors = new THREE.InstancedMesh(rotorGeometry(), this.material, n);
    for (const mesh of [this.nacelles, this.rotors]) {
      mesh.count = this.turbines.length;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    const L = CONFIG.skyline.lights;
    for (const s of items) {
      const h = skylineHeight(s);
      if (s.kind === 'mast' || s.kind === 'turbine' || (s.kind === 'chimney' && h >= L.chimneyLit)) this.lit.push({ x: s.x, z: s.z, top: h + (s.kind === 'turbine' ? h * 0.04 : 0.5), flash: s.kind === 'turbine' });
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(1, this.lit.length) * 3), 3));
    lg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(Math.max(1, this.lit.length) * 3).fill(0).map((_, i) => (i % 3 === 0 ? 1 : i % 3 === 1 ? 0.2 : 0.12)), 3));
    this.lights = new THREE.Points(lg, this.lightMat);
    this.lights.frustumCulled = false;
    this.lights.visible = false;
    this.root.add(this.nacelles, this.rotors, this.lights);
  }

  /** The still landmarks, merged, on the ground as it is now. */
  private build(): void {
    this.feet = this.items.map((s) => groundHeight(s.x, s.z));
    if (this.stills) {
      this.root.remove(this.stills);
      this.stills.geometry.dispose();
    }
    // (A landmark modelled in full from the map's 3D, world/coastStructures.ts, isn't drawn here too.)
    const parts = this.items.flatMap((s, i) => (s.modelled ? [] : landmarkParts(s, this.feet[i], this.aegean)));
    this.stills = parts.length ? new THREE.Mesh(mergeParts(parts), this.material) : null;
    if (this.stills) {
      this.stills.name = 'skyline-stills';
      this.stills.matrixAutoUpdate = false;
      this.root.add(this.stills);
    }
    const lp = this.lights.geometry.attributes.position as THREE.BufferAttribute;
    this.lit.forEach((l, i) => lp.setXYZ(i, l.x, groundHeight(l.x, l.z) + l.top, l.z));
    lp.needsUpdate = true;
  }

  update(world: WorldState, darkness: number, dt: number): void {
    // Made again when a big map's ground has streamed in or out (its squares' count, every 3 s).
    const now = performance.now();
    if (now - this.groundAt > 3000 || this.groundVersion < 0) {
      this.groundAt = now;
      const v = coastTerrains().reduce((n, t) => n + t.pieces.size, 0);
      if (v !== this.groundVersion) {
        this.groundVersion = v;
        this.build();
      }
    }
    // The turbines: into the wind, their blades turning with it.
    const { from, speed } = boatWind(world);
    const t = CONFIG.skyline.turbine;
    const rpm = speed < t.cutIn || speed > t.cutOut ? 0 : t.rpm * Math.min(1, (speed - t.cutIn) / (t.rated - t.cutIn));
    this.angle = (this.angle + ((rpm * 2 * Math.PI) / 60) * dt) % (Math.PI * 2);
    const yaw = -(from * Math.PI) / 180;
    this.q.setFromAxisAngle(this.y, yaw);
    this.turbines.forEach((s, i) => {
      const h = skylineHeight(s);
      const g = groundHeight(s.x, s.z);
      this.p.set(s.x, g + h, s.z);
      this.sc.set(h, h, h);
      this.nacelles.setMatrixAt(i, this.m.compose(this.p, this.q, this.sc));
      // Each turbine a little out of step with the next (they don't turn in unison).
      this.qs.setFromAxisAngle(this.zAxis, this.angle + i * 1.7);
      this.rotors.setMatrixAt(i, this.m.compose(this.p, this.qs.premultiply(this.q), this.sc));
    });
    this.nacelles.instanceMatrix.needsUpdate = true;
    this.rotors.instanceMatrix.needsUpdate = true;
    // The red lights after dark; the turbines' flashing together, half on.
    const L = CONFIG.skyline.lights;
    const on = darkness > L.from && this.lit.length > 0;
    this.lights.visible = on;
    if (on) {
      const flashOn = (now / 1000) % L.flash < L.flash / 2;
      const c = this.lights.geometry.attributes.color as THREE.BufferAttribute;
      this.lit.forEach((l, i) => c.setXYZ(i, l.flash && !flashOn ? 0 : 1, l.flash && !flashOn ? 0 : 0.2, l.flash && !flashOn ? 0 : 0.12));
      c.needsUpdate = true;
      this.lightMat.set(CONFIG.lightPoints.size * CONFIG.skyline.lights.size * (0.5 + 0.5 * darkness), Math.min(1, (darkness - L.from) * 4));
    }
  }
}

/**
 * Drawing the offshore wind farms (WindFarmDef, world/windFarm.ts; owner, Oct 2026: crew
 * transfer to wind farms). Our own design of a modest offshore turbine (CONFIG.windFarm):
 *
 *   still     the dark monopile just under the water, the yellow transition piece over it, the
 *             grey platform round it with its rail, the white tower, and the boat landing on the
 *             face toward the crew boats (two yellow tubes braced to the transition piece, the
 *             ladder between them and on up to the platform): ONE merged mesh for every turbine
 *             (one draw call);
 *   turning   the nacelles (each turned to face the wind) and the rotors (turning with it, from
 *             cut-in to rated, feathered and still in a gale): two instanced meshes;
 *   lights    after dark, a red light on each nacelle flashing together, and a steady yellow one
 *             on each platform: one set of points.
 *
 * So three or four draw calls for the whole farm, seen as far as the fog allows.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { WorldState } from '../../core/world';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';
import { glowSprite, LightPointsMaterial } from '../../render/lightPoints';
import type { WindFarmDef } from '../defs';
import { boatWind } from '../harbourBoats';
import { landingAxis } from '../windFarm';

type Turbine = WindFarmDef['turbines'][number];

const cyl = (r0: number, r1: number, y0: number, y1: number, seg: number, c: number) => part(new THREE.CylinderGeometry(r1, r0, y1 - y0, seg).translate(0, (y0 + y1) / 2, 0), c);
const boxAt = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) => part(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);

/** One turbine's still parts, in its own frame (its landing out along -z), before it's placed. */
function turbineParts(): THREE.BufferGeometry[] {
  const c = CONFIG.windFarm;
  const col = c.colors;
  const P = c.platform;
  return [
    cyl(c.pile.radius, c.pile.radius, c.pile.from, c.tp.from + 0.2, 16, col.pile),
    ...transitionPieceParts(),
    // The tower, white, tapering up to the nacelle.
    cyl(c.tower.base, c.tower.top, P.y, c.hub - c.nacelle.height / 2, 16, col.tower),
  ];
}

/**
 * A transition piece, in a turbine's frame (its landing out along -z): the yellow piece over
 * the pile, the platform on top with its rail, and the boat landing with its ladder. A turbine's
 * (above), and on its own: a construction project's as it's fitted, or carried on its barge
 * (career/projectView.ts, tow/towLook.ts).
 */
export function transitionPieceParts(): THREE.BufferGeometry[] {
  const c = CONFIG.windFarm;
  const col = c.colors;
  const P = c.platform;
  const out: THREE.BufferGeometry[] = [];
  out.push(cyl(c.tp.radius, c.tp.radius, c.tp.from, P.y - P.thickness, 16, col.tp));
  // The platform: a disc, and its rail on posts round the edge (open over the ladder's head).
  out.push(cyl(P.radius, P.radius, P.y - P.thickness, P.y, 16, col.grey));
  const posts = 16;
  for (let i = 0; i < posts; i++) {
    const a0 = (i / posts) * Math.PI * 2;
    const a1 = ((i + 1) / posts) * Math.PI * 2;
    const [x0, z0, x1, z1] = [Math.sin(a0) * (P.radius - 0.1), -Math.cos(a0) * (P.radius - 0.1), Math.sin(a1) * (P.radius - 0.1), -Math.cos(a1) * (P.radius - 0.1)];
    out.push(boxAt(0.08, P.rail, 0.08, x0, P.y + P.rail / 2, z0, col.tp));
    // (The segment over the ladder's head, at -z, left open.)
    if (i === 0 || i === posts - 1) continue;
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (const k of [1, 0.5]) out.push(part(new THREE.BoxGeometry(0.06, 0.06, len).rotateY(Math.atan2(x1 - x0, z1 - z0)).translate((x0 + x1) / 2, P.y + P.rail * k, (z0 + z1) / 2), col.tp));
  }
  // The boat landing, out along -z: two tubes, braced to the transition piece top and bottom
  // and midway; the ladder's rungs between them, and on up the transition piece's face to the platform.
  const L = c.landing;
  const zt = -(c.tp.radius + L.out);
  for (const sx of [-1, 1]) {
    const x = sx * L.halfSpacing;
    out.push(part(new THREE.CylinderGeometry(L.tube, L.tube, L.top - L.bottom, 8).translate(x, (L.top + L.bottom) / 2, zt), col.tp));
    for (const y of [L.bottom + 0.4, (L.top + L.bottom) / 2, L.top - 0.2]) out.push(boxAt(0.14, 0.14, L.out, x, y, -(c.tp.radius + L.out / 2) + 0.05, col.tp));
    // The ladder's stiles from the landing's top up the transition piece to the platform.
    out.push(boxAt(0.07, P.y - L.top + 1.0, 0.07, sx * 0.25, (L.top + P.y + 1.0) / 2, -c.tp.radius - 0.2, col.grey));
  }
  for (let y = L.bottom + 0.3; y < L.top; y += L.rung) out.push(boxAt(2 * L.halfSpacing, 0.04, 0.04, 0, y, zt, col.grey));
  for (let y = L.top + L.rung; y < P.y; y += L.rung) out.push(boxAt(0.5, 0.04, 0.04, 0, y, -c.tp.radius - 0.2, col.grey));
  // (The ladder's head: a short step-off from the landing's top over to the upper ladder.)
  out.push(boxAt(2 * L.halfSpacing, 0.08, L.out - 0.2, 0, L.top, -(c.tp.radius + L.out / 2), col.grey));
  return out;
}

/** A nacelle over the tower's axis (the origin), its hub end 3 m forward at -z, into the wind. */
export function nacelleGeometry(): THREE.BufferGeometry {
  const n = CONFIG.windFarm.nacelle;
  return mergeParts([part(new THREE.BoxGeometry(n.width, n.height, n.length).translate(0, 0, n.length / 2 - 3), CONFIG.windFarm.colors.tower)]);
}

/** Three blades about the shaft (z) and the spinner, at the hub (3.5 m forward of the tower's axis). */
export function rotorGeometry(): THREE.BufferGeometry {
  const b = CONFIG.windFarm.blade;
  const col = CONFIG.windFarm.colors.tower;
  const blades = [0, 1, 2].map((k) => part(new THREE.BoxGeometry(1.6, b, 0.4).translate(0, b / 2 + 1.2, -3.5).rotateZ((k * 2 * Math.PI) / 3), col));
  return mergeParts([...blades, part(new THREE.ConeGeometry(1.6, 3, 8).rotateX(-Math.PI / 2).translate(0, 0, -4.5), col)]);
}

export class WindFarmView {
  readonly root = new THREE.Group();
  private readonly material = flatVertexColorMaterial();
  private readonly turbines: Turbine[];
  private readonly nacelles: THREE.InstancedMesh;
  private readonly rotors: THREE.InstancedMesh;
  private readonly lights: THREE.Points;
  private readonly lightMat = new LightPointsMaterial(glowSprite(), CONFIG.lightPoints.size * CONFIG.windFarm.lights.size);
  private angle = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly qs = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly y = new THREE.Vector3(0, 1, 0);
  private readonly zAxis = new THREE.Vector3(0, 0, 1);

  constructor(farms: readonly WindFarmDef[]) {
    this.root.name = 'wind-farms';
    this.turbines = farms.flatMap((f) => f.turbines);
    const n = this.turbines.length;
    if (n) {
      // Each turbine's still parts turned so its landing faces out along its bearing, and placed.
      const one = turbineParts();
      const parts = this.turbines.flatMap((t) => {
        const { ax, az } = landingAxis(t.landingDeg);
        // Its frame's -z onto (ax, az): turned about y.
        const yaw = Math.atan2(-ax, -az);
        return one.map((g) => g.clone().rotateY(yaw).translate(t.x, 0, t.z));
      });
      const stills = new THREE.Mesh(mergeParts(parts), this.material);
      stills.name = 'wind-farm-stills';
      stills.matrixAutoUpdate = false;
      this.root.add(stills);
    }
    this.nacelles = new THREE.InstancedMesh(nacelleGeometry(), this.material, Math.max(1, n));
    this.rotors = new THREE.InstancedMesh(rotorGeometry(), this.material, Math.max(1, n));
    for (const mesh of [this.nacelles, this.rotors]) {
      mesh.count = n;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }
    // The lights: a red one on each nacelle, a yellow one on each platform.
    const c = CONFIG.windFarm;
    const lg = new THREE.BufferGeometry();
    const pos = new Float32Array(Math.max(1, 2 * n) * 3);
    const colr = new Float32Array(Math.max(1, 2 * n) * 3);
    this.turbines.forEach((t, i) => {
      pos.set([t.x, c.hub + c.nacelle.height / 2 + 0.3, t.z], 6 * i);
      pos.set([t.x, c.platform.y + c.platform.rail + 0.5, t.z], 6 * i + 3);
      colr.set([1, 0.2, 0.12, 1, 0.8, 0.1], 6 * i);
    });
    lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    lg.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    this.lights = new THREE.Points(lg, this.lightMat);
    this.lights.frustumCulled = false;
    this.lights.visible = false;
    this.root.add(this.nacelles, this.rotors, this.lights);
  }

  update(world: WorldState, darkness: number, dt: number): void {
    const n = this.turbines.length;
    if (!n) return;
    // Into the wind, the blades turning with it (CONFIG.windFarm.rotor).
    const { from, speed } = boatWind(world);
    const r = CONFIG.windFarm.rotor;
    const rpm = speed < r.cutIn || speed > r.cutOut ? 0 : r.rpm * Math.min(1, (speed - r.cutIn) / (r.rated - r.cutIn));
    this.angle = (this.angle + ((rpm * 2 * Math.PI) / 60) * dt) % (Math.PI * 2);
    // (The hub end, -z, toward where the wind comes from.)
    this.q.setFromAxisAngle(this.y, -(from * Math.PI) / 180);
    const hub = CONFIG.windFarm.hub;
    this.turbines.forEach((t, i) => {
      this.p.set(t.x, hub, t.z);
      this.nacelles.setMatrixAt(i, this.m.compose(this.p, this.q, this.one));
      // Each a little out of step with the next.
      this.qs.setFromAxisAngle(this.zAxis, this.angle + i * 1.7);
      this.rotors.setMatrixAt(i, this.m.compose(this.p, this.qs.premultiply(this.q), this.one));
    });
    this.nacelles.instanceMatrix.needsUpdate = true;
    this.rotors.instanceMatrix.needsUpdate = true;
    // After dark: the red lights flashing together (as the coast maps' turbines), the yellow steady.
    const L = CONFIG.skyline.lights;
    const on = darkness > L.from;
    this.lights.visible = on;
    if (on) {
      const flashOn = (performance.now() / 1000) % CONFIG.windFarm.lights.flash < CONFIG.windFarm.lights.flash / 2;
      const c = this.lights.geometry.attributes.color as THREE.BufferAttribute;
      for (let i = 0; i < n; i++) c.setXYZ(2 * i, flashOn ? 1 : 0, flashOn ? 0.2 : 0, flashOn ? 0.12 : 0);
      c.needsUpdate = true;
      this.lightMat.set(CONFIG.lightPoints.size * CONFIG.windFarm.lights.size * (0.5 + 0.5 * darkness), Math.min(1, (darkness - L.from) * 4));
    }
  }
}

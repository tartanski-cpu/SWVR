import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hullPlan } from '../layout';
import type { WorkboatDef } from '../vesselDef';
import type { VesselState } from '../vesselState';

/**
 * Working lights on deck, switched from the overhead panel:
 *   - foredeck and aft deck floodlights: a lamp on the wheelhouse roof edge aimed down at
 *     the deck, each ONE real SpotLight. Off, a light is hidden, so no shader pays for it
 *     (switching costs one shader recompile, a brief hitch);
 *   - rail lights: LED strips along the inside of the bulwark tops and across the transom.
 *     Glow only (an unlit material), no real light: they mark the deck edge at night for
 *     next to nothing.
 * Draw calls: two lamp housings + two lenses, one merged strip mesh.
 */
export class DeckLights {
  readonly root = new THREE.Group();
  private readonly floods: { light: THREE.SpotLight; lens: THREE.MeshBasicMaterial }[] = [];
  private readonly rail: THREE.MeshBasicMaterial;

  constructor(private readonly def: WorkboatDef) {
    const c = def.deckLights;
    for (const f of [c.fore, c.aft]) {
      const lamp = new THREE.Group();
      lamp.position.fromArray(f.position);
      lamp.lookAt(new THREE.Vector3().fromArray(f.target)); // +z toward the target (group: no flip)
      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.12), new THREE.MeshLambertMaterial({ color: 0x3c4248 }));
      const lensMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.1), lensMat);
      lens.position.z = 0.061;
      lamp.add(housing, lens);
      const light = new THREE.SpotLight(0xfff4e0, 0, c.distance, (c.angleDeg * Math.PI) / 180, c.penumbra, 2);
      light.position.fromArray(f.position);
      light.target.position.fromArray(f.target);
      this.root.add(lamp, light, light.target);
      this.floods.push({ light, lens: lensMat });
    }

    // Rail LED strips: short straight pieces following the deck edge, both sides and transom.
    const plan = hullPlan(def);
    const h = def.layout.bulwarkHeight - 0.02;
    const inset = 0.07;
    const pts = (side: number) => {
      const out: THREE.Vector3[] = [];
      const z0 = plan.stem + 0.4;
      const z1 = plan.transom - 0.05;
      const n = Math.ceil((z1 - z0) / 0.4);
      for (let i = 0; i <= n; i++) {
        const z = z0 + ((z1 - z0) * i) / n;
        out.push(new THREE.Vector3(side * Math.max(0, plan.halfBeam(z) - inset), plan.deckY(z) + h, z));
      }
      return out;
    };
    const strips: THREE.BufferGeometry[] = [];
    const piece = (a: THREE.Vector3, b: THREE.Vector3) => {
      const d = b.clone().sub(a);
      const len = d.length();
      if (len < 1e-3) return;
      const g = new THREE.BoxGeometry(0.035, 0.022, len);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()));
      g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      strips.push(g);
    };
    for (const side of [-1, 1]) {
      const p = pts(side);
      for (let i = 0; i + 1 < p.length; i++) piece(p[i], p[i + 1]);
    }
    const port = pts(-1).at(-1)!;
    const stbd = pts(1).at(-1)!;
    piece(port, stbd);
    this.rail = new THREE.MeshBasicMaterial({ color: 0x2a3036 });
    const railMesh = new THREE.Mesh(mergeGeometries(strips), this.rail);
    railMesh.name = 'railLights';
    this.root.add(railMesh);
  }

  update(s: VesselState): void {
    const c = this.def.deckLights;
    const on = [s.controls.deckFore > 0, s.controls.deckAft > 0];
    this.floods.forEach((f, i) => {
      f.light.intensity = on[i] ? c.intensity : 0;
      // Off = out of the scene's light list, so no shader pays for it.
      f.light.visible = on[i];
      f.lens.color.setHex(on[i] ? 0xfffbe8 : 0x333333);
    });
    this.rail.color.setHex(s.controls.railLights > 0 ? c.railColor : 0x2a3036);
  }
}

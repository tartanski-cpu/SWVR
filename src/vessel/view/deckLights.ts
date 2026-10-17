import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HullQueries } from '../../modular/module';

/**
 * Working lights on deck, switched from the overhead panel (each a module since M6c:
 * modules/floodlight, modules/railLights):
 *   - foredeck and aft deck floodlights: a lamp on the wheelhouse roof edge aimed down at
 *     the deck, each ONE real SpotLight. Off, a light is hidden, so no shader pays for it
 *     (switching costs one shader recompile, a brief hitch);
 *   - rail lights: LED strips along the inside of the bulwark tops and across the transom.
 *     Glow only (an unlit material), no real light: they mark the deck edge at night for
 *     next to nothing.
 * Draw calls: a lamp housing and a lens per flood, one merged strip mesh.
 */

/** A floodlight's lamp and beam (vessel axes). */
export interface FloodLook {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  /** cd, m, half-angle (deg), penumbra 0..1. */
  intensity: number;
  distance: number;
  angleDeg: number;
  penumbra: number;
}

export class Floodlight {
  readonly root = new THREE.Group();
  private readonly light: THREE.SpotLight;
  private readonly lens: THREE.MeshBasicMaterial;

  constructor(private readonly c: FloodLook) {
    const lamp = new THREE.Group();
    lamp.position.fromArray(c.position);
    lamp.lookAt(new THREE.Vector3().fromArray(c.target)); // +z toward the target (group: no flip)
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.12), new THREE.MeshLambertMaterial({ color: 0x3c4248 }));
    this.lens = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.1), this.lens);
    lens.position.z = 0.061;
    lamp.add(housing, lens);
    this.light = new THREE.SpotLight(0xfff4e0, 0, c.distance, (c.angleDeg * Math.PI) / 180, c.penumbra, 2);
    this.light.position.fromArray(c.position);
    this.light.target.position.fromArray(c.target);
    this.root.add(lamp, this.light, this.light.target);
  }

  /** @param on switched on, with 12 V on its circuit */
  update(on: boolean): void {
    this.light.intensity = on ? this.c.intensity : 0;
    // Off = out of the scene's light list, so no shader pays for it.
    this.light.visible = on;
    this.lens.color.setHex(on ? 0xfffbe8 : 0x333333);
  }
}

export class RailLights {
  readonly root = new THREE.Group();
  private readonly rail: THREE.MeshBasicMaterial;

  /**
   * @param inset how far in from the deck edge the strips run (m)
   * @param drop  how far below the bulwark top (m)
   */
  constructor(
    hull: HullQueries,
    private readonly color: number,
    inset = 0.07,
    drop = 0.02,
  ) {
    // Short straight pieces following the deck edge, both sides and transom.
    const pts = (side: number) => {
      const out: THREE.Vector3[] = [];
      const z0 = hull.stem + 0.4;
      const z1 = hull.transom - 0.05;
      const n = Math.ceil((z1 - z0) / 0.4);
      for (let i = 0; i <= n; i++) {
        const z = z0 + ((z1 - z0) * i) / n;
        out.push(new THREE.Vector3(side * Math.max(0, hull.halfBeam(z) - inset), hull.bulwarkTop(z) - drop, z));
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
    piece(pts(-1).at(-1)!, pts(1).at(-1)!);
    this.rail = new THREE.MeshBasicMaterial({ color: 0x2a3036 });
    const railMesh = new THREE.Mesh(mergeGeometries(strips), this.rail);
    railMesh.name = 'railLights';
    this.root.add(railMesh);
  }

  /** @param on switched on, with 12 V on its circuit */
  update(on: boolean): void {
    this.rail.color.setHex(on ? this.color : 0x2a3036);
  }
}

import * as THREE from 'three';
import type { WorkboatDef } from '../vesselDef';

/**
 * Wheelhouse ceiling lamp: a small fixture whose diffuser glows when on, and ONE real
 * PointLight (short reach). The light always exists and is dimmed to 0 when off, so
 * switching it never changes the scene's light count (which would recompile shaders and
 * hitch the frame).
 */
export class CabinLight {
  readonly root = new THREE.Group();
  private readonly light: THREE.PointLight;
  private readonly diffuser: THREE.MeshBasicMaterial;

  constructor(private readonly def: WorkboatDef) {
    const [x, y, z] = def.cabinLight.position;
    this.root.position.set(x, y, z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 12), new THREE.MeshLambertMaterial({ color: 0x3c4248 }));
    base.position.y = 0.06;
    this.diffuser = new THREE.MeshBasicMaterial({ color: 0x444444 });
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.05, 12), this.diffuser);
    lens.position.y = 0.02;
    this.light = new THREE.PointLight(0xfff1d6, 0, def.cabinLight.distance, 2);
    this.light.position.y = -0.08;
    this.root.add(base, lens, this.light);
  }

  update(on: boolean): void {
    this.light.intensity = on ? this.def.cabinLight.intensity : 0;
    this.diffuser.color.setHex(on ? 0xfff6e0 : 0x444444);
  }
}

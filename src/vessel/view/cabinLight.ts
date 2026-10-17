import * as THREE from 'three';
import type { VesselDef } from '../vesselDef';

/**
 * Wheelhouse ceiling lamp, white or red (night): a small fixture whose diffuser glows when on, and ONE real
 * PointLight (short reach). Off, the light is hidden: hidden lights are left out of every
 * lit material's shader, so an unused lamp costs nothing per pixel. The price is one shader
 * recompile (a brief hitch) when it's switched - far cheaper on Quest than paying for a
 * dark light on every pixel all the time.
 */
export class CabinLight {
  readonly root = new THREE.Group();
  private readonly light: THREE.PointLight;
  private readonly diffuser: THREE.MeshBasicMaterial;

  constructor(private readonly cfg: NonNullable<VesselDef['cabinLight']>) {
    const [x, y, z] = cfg.position;
    this.root.position.set(x, y, z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 12), new THREE.MeshLambertMaterial({ color: 0x3c4248 }));
    base.position.y = 0.06;
    this.diffuser = new THREE.MeshBasicMaterial({ color: 0x444444 });
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.05, 12), this.diffuser);
    lens.position.y = 0.02;
    this.light = new THREE.PointLight(0xfff1d6, 0, cfg.distance, 2);
    this.light.position.y = -0.08;
    this.root.add(base, lens, this.light);
  }

  /** @param mode 0 off, 1 white, 2 red (dim, for night work: the eyes stay dark-adapted) */
  update(mode: number): void {
    const on = mode > 0;
    const red = mode === 2;
    const c = this.cfg;
    this.light.intensity = on ? (red ? c.redIntensity : c.intensity) : 0;
    this.light.color.setHex(red ? 0xff2008 : 0xfff1d6);
    this.light.visible = on; // off: not in any shader (one recompile when switched on/off)
    this.diffuser.color.setHex(!on ? 0x444444 : red ? 0xff3018 : 0xfff6e0);
  }
}

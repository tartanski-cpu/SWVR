import * as THREE from 'three';
import type { WorkboatDef } from '../vesselDef';
import type { VesselState } from '../vesselState';

/**
 * The roof searchlight: a lamp housing that pans and tilts with the controls, one real
 * SpotLight (it lights islands, quays and other boats; the ocean shader adds its pool on the
 * water via `light`), and a faint additive beam cone that shows at night.
 * The light always exists and is dimmed to 0 when off - no shader recompiles.
 */
export class Searchlight {
  readonly root = new THREE.Group();
  readonly light: THREE.SpotLight;
  private readonly pan = new THREE.Group();
  private readonly tilt = new THREE.Group();
  private readonly lens: THREE.MeshBasicMaterial;
  private readonly beamMat: THREE.MeshBasicMaterial;

  constructor(private readonly def: WorkboatDef) {
    const c = def.spotlight;
    this.root.position.fromArray(c.position);
    // Yoke on a short post, lamp drum pointing forward (-Z).
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.25, 8).translate(0, -0.12, 0), new THREE.MeshLambertMaterial({ color: 0x3c4248 }));
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.08), new THREE.MeshLambertMaterial({ color: 0x3c4248 }));
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.3, 14).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xd8dcdf }));
    drum.position.y = 0.12;
    this.lens = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), this.lens);
    lens.position.set(0, 0.12, -0.152);
    lens.rotation.y = Math.PI;
    this.tilt.position.y = 0;
    this.tilt.add(drum, lens);
    this.pan.add(yoke, this.tilt);
    this.root.add(post, this.pan);

    this.light = new THREE.SpotLight(0xf4f6ff, 0, c.distance, (c.angleDeg * Math.PI) / 180, c.penumbra, 2);
    this.light.position.set(0, 0.12, -0.16);
    const target = new THREE.Object3D();
    target.position.set(0, 0.12, -10);
    this.light.target = target;
    this.tilt.add(this.light, target);

    // Beam: an open cone from the lens, brightest at the lamp, fading with distance.
    const len = 60;
    const r = len * Math.tan((c.angleDeg * Math.PI) / 180);
    const cone = new THREE.ConeGeometry(r, len, 20, 6, true).rotateX(Math.PI / 2).translate(0, 0.12, -len / 2 - 0.16);
    const pos = cone.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const f = Math.max(0, 1 + (pos.getZ(i) + 0.16) / len); // 1 at the lamp -> 0 at the end
      col.set([f * f, f * f, f * f], i * 3);
    }
    cone.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.beamMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(cone, this.beamMat);
    beam.name = 'searchlightBeam';
    this.tilt.add(beam);
  }

  /** @param darkness 0 (day) .. 1 (night) */
  update(s: VesselState, darkness: number): void {
    const c = s.controls;
    const on = c.spotlight > 0;
    this.pan.rotation.y = (-c.spotPan * Math.PI) / 180;
    this.tilt.rotation.x = (c.spotTilt * Math.PI) / 180;
    this.light.intensity = on ? this.def.spotlight.intensity : 0;
    this.lens.color.setHex(on ? 0xffffff : 0x333333);
    this.beamMat.opacity = on ? 0.02 + 0.07 * darkness : 0;
    this.beamMat.visible = on;
  }
}

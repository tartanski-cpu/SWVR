import * as THREE from 'three';
import type { HydroDebug } from '../vessel/physics/vesselPhysics';
import type { VesselDef } from '../vessel/vesselDef';
import { physicsStations } from '../vessel/hullForm';

/** Metres of arrow per newton (10 kN = 1 m). */
const FORCE_SCALE = 1 / 10000;

/**
 * Hydrostatics debug overlay, parented to a vessel's root (vessel-local coordinates):
 *  - the hull stations as outlines (the slices the physics actually uses),
 *  - per station, a dot at the immersed-area centroid and a yellow arrow for its buoyant
 *    force (pointing world-up),
 *  - the centre of gravity as a red dot.
 * Drawn on top of everything so it is visible through the hull and the water.
 */
export class HydroDebugView {
  readonly root = new THREE.Group();
  private readonly arrows: THREE.LineSegments;
  private readonly dots: THREE.Points;
  private readonly cg: [number, number, number];

  constructor(def: VesselDef, visible: boolean) {
    this.root.name = 'hydroDebug';
    this.cg = def.cg;
    this.root.visible = visible;
    const onTop = { depthTest: false, transparent: true, fog: false } as const;

    // Station outlines (static).
    const outline: number[] = [];
    for (const s of physicsStations(def.hull)) {
      for (let k = 0; k < s.polygon.length; k++) {
        const a = s.polygon[k];
        const b = s.polygon[(k + 1) % s.polygon.length];
        outline.push(a[0], a[1], s.z, b[0], b[1], s.z);
      }
    }
    const outlineGeo = new THREE.BufferGeometry();
    outlineGeo.setAttribute('position', new THREE.Float32BufferAttribute(outline, 3));
    const outlines = new THREE.LineSegments(outlineGeo, new THREE.LineBasicMaterial({ color: 0x66ccff, opacity: 0.45, ...onTop }));

    const n = physicsStations(def.hull).length;
    const arrowGeo = new THREE.BufferGeometry();
    arrowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    this.arrows = new THREE.LineSegments(arrowGeo, new THREE.LineBasicMaterial({ color: 0xffe14d, ...onTop }));

    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.dots = new THREE.Points(dotGeo, new THREE.PointsMaterial({ color: 0xffe14d, size: 0.15, ...onTop }));

    const cg = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 6), new THREE.MeshBasicMaterial({ color: 0xff3030, ...onTop }));
    cg.position.fromArray(def.cg);

    for (const o of [outlines, this.arrows, this.dots, cg]) {
      o.renderOrder = 1000;
      o.frustumCulled = false;
      this.root.add(o);
    }
  }

  toggle(): void {
    this.root.visible = !this.root.visible;
  }

  update(debug: HydroDebug | undefined): void {
    if (!this.root.visible || !debug) return;
    const a = this.arrows.geometry.attributes.position as THREE.BufferAttribute;
    const p = this.dots.geometry.attributes.position as THREE.BufferAttribute;
    const [ux, uy, uz] = debug.upLocal;
    debug.stations.forEach((s, i) => {
      const len = s.force * FORCE_SCALE;
      a.setXYZ(i * 2, s.x, s.y, s.z);
      a.setXYZ(i * 2 + 1, s.x + ux * len, s.y + uy * len, s.z + uz * len);
      // Dry stations have no centroid: tuck their dot into the CG marker.
      if (s.force > 0) p.setXYZ(i, s.x, s.y, s.z);
      else p.setXYZ(i, ...this.cg);
    });
    a.needsUpdate = true;
    p.needsUpdate = true;
  }
}

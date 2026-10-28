/**
 * A foiling boat's foils, struts and motor pod drawn (the hull study viewer; the foiling ferry):
 * each foil panel a thin slab at its incidence, each strut a thin upright slab from its top to
 * its foot, a pod a short tube on the foot of a strut that has one. In her own axes, as the
 * game's hull form has them (vessel/physics/foils.ts). One mesh, a few dozen triangles.
 */
import * as THREE from 'three';
import type { FoilSystem } from '../vessel/physics/foils';

/** The foils' colour: a dark composite grey. */
export const FOIL_GREY = 0x39434b;

export function foilsGeometry(fs: FoilSystem): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const p of fs.panels) {
    // A slab span x thickness x chord, pitched nose up by its incidence (about x).
    const g = new THREE.BoxGeometry(p.span, 0.05, p.chord);
    g.rotateX((p.incidenceDeg * Math.PI) / 180);
    g.translate(p.at[0], p.at[1], p.at[2]);
    parts.push(g);
  }
  for (const s of fs.struts) {
    const h = s.top - s.bottom;
    const g = new THREE.BoxGeometry(0.06, h, s.chord);
    g.translate(s.x, s.bottom + h / 2, s.z);
    parts.push(g);
    if (s.podDragArea) {
      const pod = new THREE.CylinderGeometry(0.16, 0.12, 1.2, 10);
      pod.rotateX(Math.PI / 2);
      pod.translate(s.x, s.bottom, s.z + 0.1);
      parts.push(pod);
    }
  }
  // Merged by hand (positions and normals only): one mesh.
  const pos: number[] = [];
  const nor: number[] = [];
  for (const g of parts) {
    const ng = g.index ? g.toNonIndexed() : g;
    pos.push(...(ng.getAttribute('position').array as Float32Array));
    nor.push(...(ng.getAttribute('normal').array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

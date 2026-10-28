/**
 * A foiling boat's foils, struts and motor pods drawn (the hull study viewer; the foiling
 * ferry): each foil panel a thin slab at its incidence (the forward foil's end plates small
 * swept fins), each strut a thin upright slab from its top to its foot, a pod a short tube on
 * the foot of a strut that has one, a bulb a slimmer one; `deploy` below 1 draws them retracted. In her own axes, as
 * the game's hull form has them (vessel/physics/foils.ts). One mesh, about 150 triangles.
 */
import * as THREE from 'three';
import type { FoilSystem } from '../vessel/physics/foils';

/** The foils' colour: a dark composite grey. */
export const FOIL_GREY = 0x39434b;

export function foilsGeometry(fs: FoilSystem, deploy = 1): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Retracted (shallow mode): foils and struts' feet `retract` x (1 - deploy) higher.
  const up = (1 - deploy) * (fs.retract ?? 0);
  const fwd = fs.panels.filter((p) => p.role !== 'aft');
  const xs = fwd.flatMap((p) => [p.at[0] - p.span / 2, p.at[0] + p.span / 2]);
  for (const p of fs.panels) {
    // A slab span x thickness x chord, pitched nose up by its incidence (about x).
    const g = new THREE.BoxGeometry(p.span, 0.05, p.chord);
    g.rotateX((p.incidenceDeg * Math.PI) / 180);
    g.translate(p.at[0], p.at[1] + up, p.at[2]);
    parts.push(g);
    // The forward foil's end plates: a short swept fin at each of its ends, fore and aft.
    if (fs.endPlate && p.role !== 'aft') {
      for (const x of [p.at[0] - p.span / 2, p.at[0] + p.span / 2].filter((x) => Math.abs(x - Math.min(...xs)) < 1e-6 || Math.abs(x - Math.max(...xs)) < 1e-6)) {
        const fin = new THREE.BoxGeometry(0.04, fs.endPlate, p.chord * 1.3);
        fin.rotateX(-0.35);
        fin.translate(x, p.at[1] + up + fs.endPlate / 2 - 0.03, p.at[2] + 0.08);
        parts.push(fin);
      }
    }
  }
  for (const s of fs.struts) {
    const bottom = s.bottom + up;
    const h = Math.max(0.05, s.top - bottom);
    const g = new THREE.BoxGeometry(0.06, h, s.chord);
    g.translate(s.x, bottom + h / 2, s.z);
    parts.push(g);
    if (s.podDragArea) {
      const pod = new THREE.CylinderGeometry(0.12, 0.09, 0.9, 10);
      pod.rotateX(Math.PI / 2);
      pod.translate(s.x, bottom, s.z + 0.05);
      parts.push(pod);
    } else if (s.bulbDragArea) {
      // A bulb where foil and strut meet: a short, slim spindle.
      const bulb = new THREE.CylinderGeometry(0.07, 0.05, 0.55, 8);
      bulb.rotateX(Math.PI / 2);
      bulb.translate(s.x, bottom, s.z + 0.03);
      parts.push(bulb);
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

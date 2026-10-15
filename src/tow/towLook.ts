import * as THREE from 'three';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { buildVesselMesh } from '../vessel/view/hullMesh';
import { hullPlan } from '../vessel/layout';
import type { VesselDef } from '../vessel/vesselDef';
import { bowEyeLocal } from './tow';

/**
 * The models drawn for the towable hulls (towing missions). Each is a single merged,
 * vertex-coloured mesh (one draw call, two for the cruiser), built once per tow:
 *   derelict  the lofted hull (as the physics floats it) with a small cuddy cabin, a
 *             windscreen and a stub mast: a motor cruiser, a bit weathered.
 *   logs      five logs side by side with two on top, lashed with two dark bands. The
 *             physics hull under them is a flat, bluff box of about the same size.
 *   barge     a rust-red pontoon with a raked bow, a grey deck, a little deckhouse
 *             and bollards (the physics hull is the same size, finer at the bow).
 * Every one has an orange bow eye at the stem: what the boat hook goes for.
 */
export function buildTowModel(def: VesselDef): THREE.Object3D {
  const look = def.tow?.look ?? 'derelict';
  const g = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, l: number, x: number, y: number, z: number, color: number) => parts.push(part(new THREE.BoxGeometry(w, h, l).translate(x, y, z), color));
  const p = def.hull.params;
  const plan = hullPlan(def);

  if (look === 'derelict') {
    g.add(buildVesselMesh(def.hull, def.layout));
    const z0 = -0.6;
    const deck = plan.deckY(z0);
    // Cuddy cabin forward of amidships, sloped windscreen, a hatch, a stub mast.
    box(1.7, 0.75, 2.4, 0, deck + 0.37, z0, 0xe8e4da);
    parts.push(part(new THREE.BoxGeometry(1.6, 0.04, 0.6).rotateX(-0.6).translate(0, deck + 0.62, z0 + 1.35), 0x1c2a30));
    box(1.72, 0.08, 2.42, 0, deck + 0.78, z0, 0x2c5c8a);
    box(0.6, 0.06, 0.6, 0, deck + 0.82, z0 - 0.4, 0xc8c2b4);
    parts.push(part(new THREE.CylinderGeometry(0.03, 0.04, 1.4, 6).translate(0, deck + 1.45, z0), 0xa8a8a0));
  } else if (look === 'logs') {
    const r = 0.3;
    const len = p.length - 0.3;
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * (2 * r * 0.97);
      parts.push(part(new THREE.CylinderGeometry(r * (0.9 + 0.1 * ((i * 7) % 3)), r, len - (i % 2) * 0.5, 9).rotateX(Math.PI / 2).translate(x, -0.12, (i % 2) * 0.2), i % 2 ? 0x6e4a2c : 0x7a5434));
    }
    for (let i = 0; i < 2; i++) parts.push(part(new THREE.CylinderGeometry(r * 0.9, r * 0.9, len - 1.2, 9).rotateX(Math.PI / 2).translate((i - 0.5) * 2 * r, -0.12 + 1.7 * r, 0.3), 0x5c3c22));
    for (const z of [-len * 0.3, len * 0.3]) box(p.beamDeck + 0.04, 0.07, 0.12, 0, 0.2, z, 0x222222);
  } else {
    // Barge: side profile (z aft, y up) extruded across the beam. Shape x = -z (see below).
    const L = p.length / 2;
    const bottom = p.keelY;
    const top = p.deckYAft;
    const s = new THREE.Shape();
    s.moveTo(-L, bottom); // transom foot (shape x = -z: transom at z = +L)
    s.lineTo(-L, top);
    s.lineTo(L, top);
    s.lineTo(L, bottom + 0.55); // raked bow
    s.lineTo(L - 1.4, bottom);
    s.closePath();
    // ExtrudeGeometry extrudes along +Z; rotateY(90°) maps (x, y, z) -> (z, y, -x): shape
    // x becomes -z (hence the sign above) and the extrusion runs across the beam.
    const hull = new THREE.ExtrudeGeometry(s, { depth: p.beamDeck, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-p.beamDeck / 2, 0, 0);
    parts.push(part(hull, 0x8a3a24));
    box(p.beamDeck - 0.1, 0.04, p.length - 0.6, 0, top + 0.02, 0.15, 0x6a6c68);
    box(1.4, 1.0, 1.6, 0, top + 0.5, L - 1.4, 0xd8d4c8);
    box(1.5, 0.06, 1.7, 0, top + 1.03, L - 1.4, 0x3a3e40);
    for (const [x, z] of [
      [-1.4, -L + 1.2],
      [1.4, -L + 1.2],
      [-1.4, L - 0.4],
      [1.4, L - 0.4],
    ])
      parts.push(part(new THREE.CylinderGeometry(0.09, 0.11, 0.3, 8).translate(x, top + 0.15, z), 0x222222));
  }

  // The bow eye: an orange ring standing on the stem.
  const eye = bowEyeLocal(def);
  parts.push(part(new THREE.TorusGeometry(0.11, 0.025, 6, 12).translate(eye[0], eye[1] + 0.1, eye[2]), 0xff7a1a));
  parts.push(part(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 6).translate(eye[0], eye[1] - 0.03, eye[2]), 0x333333));
  const m = new THREE.Mesh(mergeParts(parts), flatVertexColorMaterial());
  m.name = look === 'derelict' ? 'towTop' : 'hull';
  g.add(m);
  return g;
}

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
 *   dory      an open fishing boat: the lofted hull in blue, two thwarts, an outboard on
 *             the transom, a fish box.
 *   yacht     a dismasted sailing yacht: the lofted hull in white, a coachroof with its
 *             windows, a cockpit, the mast broken off at the deck and lying along her
 *             with its boom.
 *   trawler   a fishing trawler: the lofted hull in navy, a wheelhouse forward, a mast,
 *             a gallows over the stern and a net drum.
 *   pontoon   a big crane pontoon (as the barge's hull, larger): a crawler crane on deck
 *             with its boom lowered onto a rest at the bow, over two containers.
 *   coaster   a loaded coaster (a tug's tow): the lofted hull in dark red with a black
 *             boot-top band, a long raised hatch coaming with its covers, a forecastle, the
 *             accommodation block and funnel aft, a mast forward and a crane amidships.
 * Every one has an orange bow eye at the stem: what the boat hook goes for.
 */
/**
 * A deck structure lofted along the hull from `zAft` to `zFwd`: flat top at `yTop`, each
 * side `inset` m inside the hull's half-breadth at its station, its foot on the deck there
 * (so nothing shows below the deck edge where the sheer rises); closed at both ends.
 * Flat-shaded triangles, no index.
 */
function loft(plan: ReturnType<typeof hullPlan>, zAft: number, zFwd: number, inset: number, yTop: number, n: number): THREE.BufferGeometry {
  const st: { z: number; hw: number; yb: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const z = zAft + ((zFwd - zAft) * i) / n;
    st.push({ z, hw: Math.max(0.15, plan.halfBeam(z) - inset), yb: plan.deckY(z) - 0.05 });
  }
  const v: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => v.push(...a, ...b, ...c);
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    tri(a, b, c);
    tri(a, c, d);
  };
  for (let i = 0; i < n; i++) {
    const a = st[i];
    const b = st[i + 1];
    // Port side (x < 0), top, starboard side: wound to face outward.
    quad([-a.hw, a.yb, a.z], [-a.hw, yTop, a.z], [-b.hw, yTop, b.z], [-b.hw, b.yb, b.z]);
    quad([-a.hw, yTop, a.z], [a.hw, yTop, a.z], [b.hw, yTop, b.z], [-b.hw, yTop, b.z]);
    quad([a.hw, a.yb, a.z], [b.hw, b.yb, b.z], [b.hw, yTop, b.z], [a.hw, yTop, a.z]);
  }
  const s0 = st[0];
  quad([-s0.hw, s0.yb, s0.z], [s0.hw, s0.yb, s0.z], [s0.hw, yTop, s0.z], [-s0.hw, yTop, s0.z]); // the aft bulkhead
  const s1 = st[n];
  quad([s1.hw, s1.yb, s1.z], [-s1.hw, s1.yb, s1.z], [-s1.hw, yTop, s1.z], [s1.hw, yTop, s1.z]); // the stem end
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

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
  } else if (look === 'cage') {
    // A fish-farm cage section: a ring of black floats with a handrail on stanchions, a few
    // net-weight posts, and the net's top hanging under the ring (its skirt, dark).
    const R = p.length / 2 - 0.3;
    parts.push(part(new THREE.TorusGeometry(R, 0.3, 8, 28).rotateX(Math.PI / 2).translate(0, 0.05, 0), 0x1e2226, 'worn'));
    parts.push(part(new THREE.TorusGeometry(R - 0.5, 0.2, 7, 24).rotateX(Math.PI / 2).translate(0, 0.0, 0), 0x2a2e32, 'worn'));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      parts.push(part(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6).translate(Math.cos(a) * R, 0.55, Math.sin(a) * R), 0x8a8f94));
    }
    parts.push(part(new THREE.TorusGeometry(R, 0.03, 6, 28).rotateX(Math.PI / 2).translate(0, 1.05, 0), 0x8a8f94));
    parts.push(part(new THREE.CylinderGeometry(R - 0.25, R - 0.35, 1.4, 24, 1, true).translate(0, -0.75, 0), 0x202a26));
  } else if (look === 'dory') {
    g.add(buildVesselMesh(def.hull, def.layout, undefined, { topsides: 0x2f6a8a, deck: 0x8f826c, bottom: 0x6a2a22, rail: 0x2a2a2a }));
    // Two thwarts across, an outboard on the transom, a fish box.
    for (const z of [-0.7, 0.8]) box(2 * plan.halfBeam(z) - 0.2, 0.05, 0.28, 0, plan.deckY(z) + 0.25, z, 0xb89a6a);
    const tz = plan.transom;
    box(0.34, 0.42, 0.38, 0, plan.deckY(tz) + 0.3, tz + 0.12, 0x1e1e1e); // the motor's cowl
    box(0.08, 0.8, 0.1, 0, plan.deckY(tz) - 0.3, tz + 0.18, 0x2a2a2a); // its leg
    box(0.6, 0.25, 0.4, 0.35, plan.deckY(0.1) + 0.13, 0.1, 0x5a8aa8); // a fish box
  } else if (look === 'yacht') {
    g.add(buildVesselMesh(def.hull, def.layout, undefined, { topsides: 0xf2f2ee, deck: 0xd9d2c0, bottom: 0x1f2f4a, rail: 0xb8bcc0 }));
    // Coachroof amidships with a band of windows each side, the cockpit aft of it.
    const z0 = -0.6;
    const deck = plan.deckY(z0);
    const hw = Math.min(1.1, plan.halfBeam(z0) - 0.4);
    box(2 * hw, 0.5, 3.4, 0, deck + 0.25, z0, 0xf4f2ea);
    for (const s of [-1, 1]) box(0.02, 0.16, 2.2, s * (hw + 0.005), deck + 0.3, z0, 0x1c2a30);
    box(1.6, 0.35, 2.2, 0, plan.deckY(3.5) + 0.12, 3.5, 0xd2c8b0); // cockpit well's coaming
    // The mast broken off a metre up; the rest of it lying along her, with the boom.
    box(0.16, 1.0, 0.12, 0, deck + 1.0, z0 - 1.3, 0xc8ccd0);
    parts.push(part(new THREE.BoxGeometry(0.14, 0.11, 9).rotateY(0.12).translate(0.45, deck + 0.6, z0 + 1.0), 0xc8ccd0));
    parts.push(part(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 6).rotateX(Math.PI / 2).translate(-0.3, deck + 0.62, z0 + 2.4), 0xb0b4b8));
  } else if (look === 'trawler') {
    g.add(buildVesselMesh(def.hull, def.layout, undefined, { topsides: 0x1f3a5c, deck: 0x7d7a6a, bottom: 0x8c2a22, rail: 0x1f3a5c }));
    // Wheelhouse forward of amidships, windows round it, a dark roof.
    const zw = -2.2;
    const deck = plan.deckY(zw);
    box(3.6, 2.4, 3.4, 0, deck + 1.2, zw, 0xeceae2);
    box(3.62, 0.5, 3.42, 0, deck + 1.9, zw, 0x1c2a30);
    box(3.8, 0.12, 3.6, 0, deck + 2.46, zw, 0x3a3e40);
    // Mast on the wheelhouse roof, a gallows (A-frame) over the stern, the net drum before it.
    parts.push(part(new THREE.CylinderGeometry(0.07, 0.09, 4, 6).translate(0, deck + 4.5, zw), 0xd8d4c8));
    const tz = plan.transom;
    const st = plan.deckY(tz);
    for (const s of [-1, 1]) parts.push(part(new THREE.BoxGeometry(0.2, 3.6, 0.2).rotateX(-0.25).translate(s * 2.2, st + 1.7, tz - 0.7), 0xd6a020));
    box(4.6, 0.25, 0.25, 0, st + 3.45, tz - 0.25, 0xd6a020);
    parts.push(part(new THREE.CylinderGeometry(0.75, 0.75, 3.0, 12).rotateZ(Math.PI / 2).translate(0, st + 0.9, tz - 3.2), 0x3c5a3c));
  } else if (look === 'barge' || look === 'pontoon') {
    // (Only these: the coaster, drawn below, fell in here too and got a barge round her.)
    // Barge (and the pontoon, larger): side profile (z aft, y up) extruded across the beam. Shape x = -z (see below).
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
    parts.push(part(hull, look === 'pontoon' ? 0x4a5a48 : 0x8a3a24, 'worn'));
    box(p.beamDeck - 0.1, 0.04, p.length - 0.6, 0, top + 0.02, 0.15, 0x6a6c68);
    const bx = p.beamDeck / 2 - 0.4;
    for (const [x, z] of [
      [-bx, -L + 1.2],
      [bx, -L + 1.2],
      [-bx, L - 0.4],
      [bx, L - 0.4],
    ])
      parts.push(part(new THREE.CylinderGeometry(0.09, 0.11, 0.3, 8).translate(x, top + 0.15, z), 0x222222));
    if (look === 'barge') {
      box(1.4, 1.0, 1.6, 0, top + 0.5, L - 1.4, 0xd8d4c8);
      box(1.5, 0.06, 1.7, 0, top + 1.03, L - 1.4, 0x3a3e40);
    } else {
      // A crawler crane aft: its tracks, the turntable and cab, the counterweight, and its
      // lattice boom lowered forward onto a rest; two containers forward.
      const zc = L - 5;
      for (const s of [-1, 1]) box(0.8, 0.9, 5, s * 1.6, top + 0.45, zc, 0x2a2a2a);
      box(3.4, 0.8, 3.6, 0, top + 1.3, zc, 0xe0b020);
      box(1.2, 1.4, 1.6, 1.0, top + 2.4, zc - 0.6, 0xe0b020);
      box(3.0, 1.2, 1.0, 0, top + 2.3, zc + 1.6, 0x4a4a48);
      // Level, clear over the containers, on a tall rest at her bow.
      for (const s of [-1, 1]) parts.push(part(new THREE.BoxGeometry(0.18, 0.18, 14).translate(s * 0.55, top + 3.05, zc - 8.2), 0xe0b020));
      box(1.6, 2.95, 0.3, 0, top + 1.48, zc - 14.5, 0x5a5c58); // the boom rest
      box(2.44, 2.6, 6.06, -2.4, top + 1.3, -L + 4.5, 0x2a6aa8);
      box(2.44, 2.6, 6.06, 2.4, top + 1.3, -L + 4.5, 0xb8402a);
    }
  }

  if (look === 'coaster') {
    g.add(buildVesselMesh(def.hull, def.layout));
    const L = p.length / 2;
    const top = plan.deckY(0);
    const B = p.beamDeck;
    // The hatch: a long coaming with pontoon covers, between the forecastle and the house.
    box(B * 0.62, 0.9, L * 1.05, 0, top + 0.45, -L * 0.08, 0x6a2a20);
    box(B * 0.64, 0.25, L * 1.07, 0, top + 1.02, -L * 0.08, 0x8a8c88);
    for (let i = 0; i < 5; i++) box(B * 0.64, 0.08, 0.25, 0, top + 1.18, -L * 0.08 - L * 0.42 + i * L * 0.21, 0x3a3c3a);
    // The forecastle: a raised deck at the bow, lofted station by station so its sides
    // follow the hull's half-breadths and its foot follows the sheer (owner: a plain box
    // stuck out through the bow's plating, and the bow is where the hull narrows and the
    // deck rises). A windlass stands on it.
    const fcAft = -L + L * 0.25;
    const fcFwd = plan.stem + 0.25;
    const fcTop = plan.deckY(fcFwd) + 1.0;
    parts.push(part(loft(plan, fcAft, fcFwd, 0.06, fcTop, 8), 0x6a2a20));
    box(1.4, 0.7, 1.2, 0, fcTop + 0.35, -L + L * 0.16, 0x3a3e40);
    // The accommodation aft: two tiers, the bridge with its windows, a funnel, davits.
    box(B * 0.86, 2.6, L * 0.3, 0, top + 1.3, L - L * 0.22, 0xe8e4da);
    box(B * 0.7, 2.4, L * 0.16, 0, top + 3.8, L - L * 0.2, 0xe8e4da);
    box(B * 0.72, 0.9, 0.08, 0, top + 4.3, L - L * 0.28 - 0.04, 0x1c2a30);
    box(B * 0.74, 0.2, L * 0.17, 0, top + 5.1, L - L * 0.2, 0xc8c4b8);
    parts.push(part(new THREE.CylinderGeometry(0.9, 1.0, 3.2, 10).translate(0, top + 6.5, L - L * 0.1), 0x2a2a2a));
    parts.push(part(new THREE.CylinderGeometry(0.9, 0.9, 0.5, 10).translate(0, top + 7.6, L - L * 0.1), 0xc0402a));
    // A mast on the forecastle, a crane post amidships with its jib over the hatch.
    parts.push(part(new THREE.CylinderGeometry(0.12, 0.16, 9, 8).translate(0, top + 5.6, -L + L * 0.1), 0xcccccc));
    parts.push(part(new THREE.CylinderGeometry(0.3, 0.35, 5, 8).translate(B * 0.42, top + 3.5, L * 0.18), 0xe0b020));
    parts.push(part(new THREE.BoxGeometry(0.3, 0.3, 12).rotateX(-0.35).translate(B * 0.42, top + 7.2, L * 0.18 - 5.2), 0xe0b020));
    for (const [x, z] of [[-B / 2 + 0.6, L - L * 0.2], [B / 2 - 0.6, L - L * 0.2]]) box(0.3, 1.2, 3, x, top + 3.0, z, 0xdddddd);
    // Bollards: a pair on the forecastle, a pair aft, each inside the deck edge there.
    for (const z of [-L + 4.5, L - 2.5]) {
      const hw = plan.halfBeam(z) - 0.7;
      const y = z < 0 ? fcTop : top;
      for (const s of [-1, 1]) parts.push(part(new THREE.CylinderGeometry(0.18, 0.2, 0.7, 8).translate(s * hw, y + 0.35, z), 0x222222));
    }
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

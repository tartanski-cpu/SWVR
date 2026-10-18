/**
 * Her machinery, drawn for the Shipyard's Engine step (owner, Oct 2026): the engine she has
 * (one of the four types, singly or as a twin installation), its gearbox, the shaft down to
 * the propeller, the propeller at the diameter her design gives it, and the rudder behind.
 * Shown inside a ghost of her hull and house, so you see what's fitted and where.
 *
 * Only here: the game never draws her engines (they're under the cabin floor, and leaving
 * them out keeps the Quest's draw calls down). Original, generic designs, coloured by type:
 *
 *   straight six (150 kW)   long and narrow: one row of six cylinders under a ribbed cover;
 *   V8s (280, 400 kW)       short and wide: two banks under angled covers, a turbo on top;
 *   tug diesel (450 kW)     big and tall, slow-revving: six separate heads in a row, a big
 *                           flywheel housing and a heavy gearbox for the big propeller.
 *
 * Sizes are in metres, about right for each engine's power and weight (build.ts ENGINES).
 */
import * as THREE from 'three';

type V3 = readonly [number, number, number];

/** Each engine type's look: its size (length along her, width, height), block colour, and build. */
export const ENGINE_LOOKS = [
  { kind: 'six', size: [1.15, 0.62, 0.78], block: 0x5a84a6 },
  { kind: 'v8', size: [1.0, 0.86, 0.8], block: 0xa8483e },
  { kind: 'v8', size: [1.2, 0.96, 0.9], block: 0x7d8792 },
  { kind: 'bigSix', size: [2.1, 0.95, 1.35], block: 0x4f8a6c },
] as const;

/** What to draw (from her design: build.ts puts the engine bed, propeller and rudder). */
export interface Machinery {
  /** ENGINES index. */
  engine: number;
  /** Two engines, side by side, each with its own shaft, propeller and rudder. */
  twin: boolean;
  /** The engine bed (boat axes, m): under the cabin floor. */
  bed: V3;
  /** Twin propellers' distance off the centreline (m). */
  twinX: number;
  /** The propeller's diameter (m) and centre; the rudder's stock. */
  propD: number;
  prop: V3;
  rudder: V3;
}

const mats = new Map<number, THREE.MeshStandardMaterial>();
function mat(colour: number, metal = 0.35): THREE.MeshStandardMaterial {
  let m = mats.get(colour);
  if (!m) mats.set(colour, (m = new THREE.MeshStandardMaterial({ color: colour, metalness: metal, roughness: 0.55 })));
  return m;
}
const STEEL = 0xb4bcc4;
const BRONZE = 0xd29a48;
const DARK = 0x3a4046;

function box(g: THREE.Group, w: number, h: number, l: number, x: number, y: number, z: number, colour: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat(colour));
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
/** A cylinder along her length (z). */
function drum(g: THREE.Group, r: number, l: number, x: number, y: number, z: number, colour: number, sides = 14): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, sides).rotateX(Math.PI / 2), mat(colour));
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

/**
 * One engine and its gearbox, crankshaft along her length, the gearbox aft (+z). Its origin
 * is the gearbox's output flange (where the shaft starts), so it's placed by that.
 */
export function buildEngine(type: number): { group: THREE.Group; length: number; height: number } {
  const look = ENGINE_LOOKS[type] ?? ENGINE_LOOKS[0];
  const [L, W, H] = look.size;
  const g = new THREE.Group();
  const gearL = look.kind === 'bigSix' ? 0.55 : 0.32;
  // Everything forward of the gearbox: z from -(gearL + L) to -gearL; the crank at y = 0.
  const zMid = -gearL - L / 2;
  const crankY = H * 0.12;
  // Sump and block.
  box(g, W * 0.62, H * 0.28, L * 0.9, 0, crankY - H * 0.22, zMid, DARK);
  if (look.kind === 'v8') {
    box(g, W * 0.55, H * 0.42, L, 0, crankY + H * 0.08, zMid, look.block);
    // Two banks at 45° each side, a cover on each.
    for (const s of [-1, 1]) {
      const bank = box(g, W * 0.36, H * 0.3, L * 0.86, s * W * 0.27, crankY + H * 0.34, zMid, look.block);
      bank.rotation.z = -s * 0.5;
      const cover = box(g, W * 0.3, H * 0.07, L * 0.8, s * W * 0.34, crankY + H * 0.5, zMid, STEEL);
      cover.rotation.z = -s * 0.5;
    }
    // The turbo and its pipe, on top at the front; the intercooler across the vee.
    drum(g, H * 0.11, W * 0.3, 0, crankY + H * 0.62, zMid - L * 0.38, STEEL).rotation.y = Math.PI / 2;
    box(g, W * 0.3, H * 0.12, L * 0.55, 0, crankY + H * 0.52, zMid + L * 0.05, 0x9aa3ab);
  } else {
    // A straight row of cylinders: the block, then the head(s) on top.
    box(g, W * 0.6, H * 0.5, L, 0, crankY + H * 0.12, zMid, look.block);
    if (look.kind === 'bigSix') {
      // Six separate heads, a gap between each, and the rocker covers on them.
      for (let i = 0; i < 6; i++) {
        const z = zMid - L * 0.42 + (i * L * 0.84) / 5;
        box(g, W * 0.56, H * 0.16, L * 0.12, 0, crankY + H * 0.45, z, look.block);
        box(g, W * 0.44, H * 0.08, L * 0.1, 0, crankY + H * 0.57, z, STEEL);
      }
      // Air manifold along one side, the exhaust along the other, the turbo at the back.
      drum(g, H * 0.07, L * 0.9, -W * 0.38, crankY + H * 0.35, zMid, 0x9aa3ab);
      drum(g, H * 0.08, L * 0.9, W * 0.38, crankY + H * 0.38, zMid, 0x6d5d4f);
      drum(g, H * 0.14, W * 0.3, W * 0.25, crankY + H * 0.62, zMid + L * 0.42, STEEL).rotation.y = Math.PI / 2;
    } else {
      // One head and a ribbed cover over the six.
      box(g, W * 0.55, H * 0.14, L * 0.92, 0, crankY + H * 0.44, zMid, look.block);
      box(g, W * 0.42, H * 0.06, L * 0.86, 0, crankY + H * 0.54, zMid, STEEL);
      for (let i = 0; i < 6; i++) box(g, W * 0.44, H * 0.02, L * 0.02, 0, crankY + H * 0.575, zMid - L * 0.36 + (i * L * 0.72) / 5, DARK);
      drum(g, H * 0.07, L * 0.75, W * 0.36, crankY + H * 0.32, zMid, 0x6d5d4f); // the exhaust manifold
      drum(g, H * 0.1, W * 0.22, W * 0.3, crankY + H * 0.5, zMid + L * 0.36, STEEL).rotation.y = Math.PI / 2; // turbo
    }
  }
  // Front: the heat exchanger tank across the top, the crank pulley, the alternator.
  box(g, W * 0.7, H * 0.16, L * 0.12, 0, crankY + H * 0.5, zMid - L * 0.48, 0x9aa3ab);
  drum(g, H * 0.12, 0.05, 0, crankY, zMid - L / 2 - 0.03, DARK);
  drum(g, H * 0.07, H * 0.14, -W * 0.33, crankY + H * 0.2, zMid - L * 0.42, 0xb8bdc2);
  // The flywheel housing, then the gearbox down to the output flange.
  drum(g, Math.max(W, H) * 0.36, 0.12, 0, crankY, -gearL - 0.06, DARK, 18);
  box(g, W * 0.5, H * 0.55, gearL - 0.08, 0, crankY - H * 0.12, -gearL / 2 - 0.02, 0x2f3438);
  drum(g, 0.07, 0.06, 0, 0, -0.03, STEEL);
  // Mounting feet on the bed rails, each side.
  for (const s of [-1, 1]) for (const k of [-0.42, 0.42]) box(g, 0.1, 0.08, 0.16, s * W * 0.42, crankY - H * 0.25, zMid + k * L, DARK);
  // The crank above the output flange (a marine gearbox drops the shaft line): set the whole
  // engine so the flange is at the origin.
  g.position.set(0, 0, 0);
  return { group: g, length: L + gearL, height: H };
}

/** A propeller of diameter `d`: a hub and four blades, its disc across her length (facing aft). */
export function buildPropeller(d: number): THREE.Group {
  const g = new THREE.Group();
  const r = d / 2;
  drum(g, Math.max(0.05, d * 0.09), Math.max(0.1, d * 0.2), 0, 0, 0, BRONZE);
  for (let i = 0; i < 4; i++) {
    // A blade: wide in the middle, rounded off at the tip, pitched about 25°.
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.05 * d);
    shape.quadraticCurveTo(r * 0.55, -0.32 * r, r, -0.05 * r);
    shape.quadraticCurveTo(r * 1.02, 0.12 * r, r * 0.8, 0.2 * r);
    shape.quadraticCurveTo(r * 0.4, 0.3 * r, 0, 0.05 * d);
    const blade = new THREE.Mesh(new THREE.ShapeGeometry(shape, 6), new THREE.MeshStandardMaterial({ color: BRONZE, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }));
    blade.rotation.x = 0.45; // pitch
    const arm = new THREE.Group();
    arm.rotation.z = (i * Math.PI) / 2 + 0.3;
    arm.add(blade);
    g.add(arm);
  }
  return g;
}

/** Her machinery (one or two of everything) for the Engine step's view. */
export function buildMachinery(m: Machinery): THREE.Group {
  const out = new THREE.Group();
  const xs = m.twin ? [-1, 1] : [0];
  const one = buildEngine(m.engine);
  // Side by side, a little closer together than the propellers (they sit inside her hull).
  const engineX = m.twin ? Math.max(0.45, Math.min(m.twinX * 0.8, m.twinX - 0.1)) : 0;
  // Its top just under the cabin floor (the bed is 0.35 m under it).
  const flangeY = m.bed[1] + 0.3 - one.height * 0.7;
  const flangeZ = m.bed[2] + one.length / 2;
  for (const s of xs) {
    const e = s === xs[0] ? one.group : buildEngine(m.engine).group;
    const from = new THREE.Vector3(s * engineX, flangeY, flangeZ);
    e.position.copy(from);
    out.add(e);
    // The shaft from the gearbox to the propeller, and the propeller on it.
    const to = new THREE.Vector3(s * (m.twin ? m.twinX : 0), m.prop[1], m.prop[2]);
    const len = from.distanceTo(to);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 10), mat(STEEL, 0.7));
    shaft.position.copy(from).add(to).multiplyScalar(0.5);
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    out.add(shaft);
    const prop = buildPropeller(m.propD);
    prop.position.copy(to);
    prop.name = 'propeller';
    out.add(prop);
    // The rudder behind it: a plate about as tall as the propeller.
    const rh = m.propD * 0.9;
    box(out, 0.04, rh, Math.max(0.25, m.propD * 0.45), s * (m.twin ? m.twinX : 0), m.rudder[1] + rh / 2 - m.propD * 0.35, m.rudder[2] + 0.05, 0x5d646b);
  }
  return out;
}

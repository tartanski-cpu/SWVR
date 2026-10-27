/**
 * Her engines' models (owner, Oct 2026): one per engine type, an original, generic design
 * coloured by type, built at the engine's own size (length, width, height: the Shipyard's
 * ENGINES `size`), so what's drawn is what's checked for fit (shipyard/machinery.ts):
 *
 *   straight six (150 kW)   long and narrow: one row of six cylinders under a ribbed cover;
 *   V8s (280, 400 kW)       short and wide: two banks under angled covers, a turbo on top;
 *   tug diesel (450 kW)     big and tall, slow-revving: six separate heads in a row, a big
 *                           flywheel housing and a heavy gearbox for the big propeller.
 *
 * Drawn two ways from the one model: as meshes for the Shipyard's Engine step
 * (shipyard/enginePreview.ts), and baked into the boat's fixed, vertex-coloured parts for the
 * game (`engineGeometry`: the diesel module's look, seen under its hatch; no draw calls of
 * its own).
 */
import * as THREE from 'three';
import { FLANGE_SHARE } from '../../shipyard/machinery';
import { part } from '../../render/geometryUtils';

/**
 * Each engine type's look: its build and block colour. Its size is the engine's own
 * (build.ts ENGINES `size`): the model is scaled to exactly that, so what's drawn is what's
 * checked for fit (machinery.ts).
 */
export const ENGINE_LOOKS = [
  { kind: 'six', block: 0x5a84a6 },
  { kind: 'v8', block: 0xa8483e },
  { kind: 'v8', block: 0x7d8792 },
  { kind: 'bigSix', block: 0x4f8a6c },
  { kind: 'bigSix', block: 0x8c5a3c },
  // The harbour tug's 1850 kW V16 (Shipyard ENGINES): drawn as a V engine, its length its own.
  { kind: 'v8', block: 0x3f5f7a },
  // The solar catamaran's electric pod motor (Shipyard ENGINES, owner Oct 2026): a finned can.
  { kind: 'electric', block: 0x8a96a0 },
] as const;

const mats = new Map<number, THREE.MeshStandardMaterial>();
export function mat(colour: number, metal = 0.35): THREE.MeshStandardMaterial {
  let m = mats.get(colour);
  if (!m) mats.set(colour, (m = new THREE.MeshStandardMaterial({ color: colour, metalness: metal, roughness: 0.55 })));
  return m;
}
export const STEEL = 0xb4bcc4;
export const BRONZE = 0xd29a48;
export const DARK = 0x3a4046;

export function box(g: THREE.Group, w: number, h: number, l: number, x: number, y: number, z: number, colour: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat(colour));
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
/** A cylinder along her length (z). */
export function drum(g: THREE.Group, r: number, l: number, x: number, y: number, z: number, colour: number, sides = 14): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, sides).rotateX(Math.PI / 2), mat(colour));
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

/**
 * One engine and its gearbox, crankshaft along her length, the gearbox aft (+z). Its origin
 * is the gearbox's output flange (where the shaft starts), so it's placed by that.
 */
export function buildEngineModel(type: number, size: readonly [number, number, number]): { group: THREE.Group; length: number; height: number } {
  const look = ENGINE_LOOKS[type] ?? ENGINE_LOOKS[0];
  const [L0, W, H] = size;
  if (look.kind === 'electric') {
    // An electric motor: a finned round can along her length, its junction box on top, its
    // output flange aft at the origin (no gearbox, sump or exhaust).
    const g = new THREE.Group();
    const r = Math.min(W, H) * 0.45;
    const zMid = -L0 / 2;
    drum(g, r, L0 * 0.8, 0, 0, zMid, look.block, 18);
    for (let i = 0; i < 7; i++) drum(g, r * 1.08, 0.02, 0, 0, zMid - L0 * 0.32 + (i * L0 * 0.64) / 6, DARK, 18);
    drum(g, r * 0.7, L0 * 0.1, 0, 0, -L0 * 0.05, DARK, 14);
    box(g, W * 0.4, H * 0.18, L0 * 0.3, 0, r + H * 0.06, zMid, 0x2f3438);
    for (const s of [-1, 1]) box(g, 0.08, 0.06, L0 * 0.6, s * r * 0.8, -r * 0.9, zMid, DARK);
    return { group: g, length: L0, height: H };
  }
  const gearShare = look.kind === 'bigSix' ? 0.55 : 0.32;
  const L = L0 - gearShare;
  const g = new THREE.Group();
  const gearL = gearShare;
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

/** Where an engine sits: its gearbox's output flange (where the shaft starts) and the shaft's angle. */
export interface EnginePlace {
  x: number;
  flangeY: number;
  flangeZ: number;
  /** The shaft's angle to the horizontal (deg), rising forward: the engine is tilted to it. */
  angleDeg: number;
}

/**
 * One engine on its shaft line: scaled to exactly its size, its underside FLANGE_SHARE of its
 * height under the flange, its aft end at the flange; then tilted to the shaft, forward end up.
 */
export function placeEngine(type: number, size: readonly [number, number, number], at: EnginePlace): { holder: THREE.Group; model: THREE.Group } {
  const e = buildEngineModel(type, size).group;
  const bb = new THREE.Box3().setFromObject(e);
  const got = bb.getSize(new THREE.Vector3());
  const inner = new THREE.Group();
  inner.scale.set(size[1] / got.x, size[2] / got.y, size[0] / got.z);
  inner.position.set(-((bb.min.x + bb.max.x) / 2) * inner.scale.x, -FLANGE_SHARE * size[2] - bb.min.y * inner.scale.y, -bb.max.z * inner.scale.z);
  inner.add(e);
  const holder = new THREE.Group();
  holder.add(inner);
  holder.rotation.x = (at.angleDeg * Math.PI) / 180;
  holder.position.set(at.x, at.flangeY, at.flangeZ);
  return { holder, model: e };
}

/** The same engine as fixed parts (boat axes), each coloured as its mesh, for merging with the boat's. */
export function engineGeometry(type: number, size: readonly [number, number, number], at: EnginePlace): THREE.BufferGeometry[] {
  const { holder } = placeEngine(type, size, at);
  holder.updateMatrixWorld(true);
  const out: THREE.BufferGeometry[] = [];
  holder.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const colour = (mesh.material as THREE.MeshStandardMaterial).color.getHex();
    out.push(part(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), colour));
  });
  return out;
}

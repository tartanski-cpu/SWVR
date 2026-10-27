/**
 * The harbour tug's main engine, in detail, for her engine room (owner, 27 Oct 2026: "keep the
 * engine dimensions and the sort of principles of it"): the same 1850 kW V16, in the same box
 * (her ENGINES size: 4.4 m long, 1.7 m wide, 2.1 m high), on the same shaft line, in her
 * colours (vessel/view/engineModels.ts ENGINE_LOOKS). What a big medium-speed V16 in a harbour
 * tug's engine room has, laid out as such engines generally are (our own arrangement, not any
 * maker's):
 *
 *   on a fabricated bedplate on resilient (rubber) mounts, its sump below; a crankcase with
 *   inspection doors down each side; two banks of eight cylinders at 45 degrees, each head with
 *   its rocker cover; the inlet manifolds inside the vee, the lagged exhaust manifolds outboard
 *   of each bank, running forward to two turbochargers on the free (forward) end, their air
 *   filters on them and their exhaust outlets turned up to the uptakes; a charge-air cooler
 *   across the vee at the front; the vibration damper and gear case on the free end; the
 *   flywheel housing aft, with the starter motors on it; engine-driven sea-water and jacket-
 *   water pumps low on the front; duplex lube oil and fuel filters on the sides; the dipstick;
 *   lifting eyes. (Its local operating panel is on a stand in the aisle: the room's, room.ts.)
 *
 * Built in the engine's own frame: x across (+ starboard), y up from the flange's height, z
 * along her from the flange (0, aft end) forward to -length. Placed by the caller as the boat
 * places hers (tilted to the shaft, at the flange).
 */
import * as THREE from 'three';
import { Kit, circle, type V3 } from './kit';

const BLOCK = 0x3f5f7a; // her engines' paint (ENGINE_LOOKS[5])
const DARK = 0x2a2e31;
const STEEL = 0x8c9399;
const LAGGING = 0xc8ccc8; // exhaust lagging: silver-grey cloth
const RUBBER = 0x1b1b1b;
const BRONZE = 0x8a6b3a;
const YELLOW = 0xe2b21c;
const RED = 0xb52a20;

export interface DetailedEngine {
  kit: Kit;
  /** The local operating panel's face: its centre and which way it faces (engine frame), and its size. */
  lop: { at: V3; facing: 'port' | 'stbd'; w: number; h: number };
  /** The exhaust outlets on the turbochargers (engine frame): the room runs the uptakes up from them. */
  exhausts: V3[];
  /** The front PTO shaft's end (engine frame): the fire pump's on it. */
  pto: V3;
}

/**
 * @param size  [length, width, height] (m)
 * @param side  which side her walkway's on (the LOP and filters face it): -1 port, +1 starboard
 */
export function detailedEngine(size: readonly [number, number, number], side: -1 | 1): DetailedEngine {
  const [L, W, H] = size;
  const k = new Kit();
  const y0 = -0.25 * H; // her underside (FLANGE_SHARE under the flange)
  const crank = 0; // the crankshaft at the flange's height: her shaft line leaves the engine there
  const fly = 0.42; // flywheel housing's length aft
  const free = 0.3; // gear case and damper on the free end
  const zA = -fly; // the block's aft face
  const zF = -L + free; // its forward face
  const blockL = zA - zF;
  const zm = (zA + zF) / 2;

  // ── Bedplate and mounts ──
  for (const s of [-1, 1]) {
    k.box(0.14, 0.22, L * 0.96, s * W * 0.44, y0 + 0.11, -L / 2, DARK);
    for (let i = 0; i < 4; i++) k.box(0.2, 0.08, 0.26, s * W * 0.44, y0 + 0.02, -L * 0.12 - i * L * 0.25, RUBBER);
  }
  // The sump, and the crankcase over it with its inspection doors.
  k.box(W * 0.62, 0.3, blockL * 0.96, 0, y0 + 0.24, zm, DARK);
  k.box(W * 0.74, 0.55, blockL, 0, crank, zm, BLOCK);
  for (const s of [-1, 1])
    for (let i = 0; i < 8; i++) {
      const z = zF + blockL * ((i + 0.5) / 8);
      k.box(0.03, 0.26, blockL / 8 - 0.08, s * W * 0.375, crank - 0.02, z, BLOCK);
      k.bolts(circle([s * W * 0.39, crank - 0.02, z], 0.13, 10, 'x'), 0.014, 'x', STEEL);
      k.box(0.02, 0.04, 0.08, s * W * 0.395, crank + 0.08, z, 0xb52a20); // its relief valve's cap
    }

  // ── Two banks of eight, at 45 degrees ──
  const bankY = crank + 0.42;
  for (const s of [-1, 1]) {
    const bx = s * W * 0.22;
    // The bank's block, leaning out.
    k.add(boxTilted(W * 0.3, 0.5, blockL, bx, bankY, zm, s * -0.5), BLOCK);
    for (let i = 0; i < 8; i++) {
      const z = zF + blockL * ((i + 0.5) / 8);
      const hx = s * W * 0.31;
      const hy = bankY + 0.3;
      // The head, its rocker cover (ribbed), its bolts, and the injector pipe to it.
      k.add(boxTilted(W * 0.27, 0.2, blockL / 8 - 0.05, hx, hy, z, s * -0.5), BLOCK);
      k.add(boxTilted(W * 0.22, 0.09, blockL / 8 - 0.1, hx + s * 0.05, hy + 0.13, z, s * -0.5), STEEL);
      for (const dz of [-0.06, 0.06]) k.add(boxTilted(W * 0.2, 0.02, 0.012, hx + s * 0.06, hy + 0.18, z + dz, s * -0.5), STEEL);
      k.bolts([[hx + s * 0.13, hy + 0.06, z - 0.1], [hx + s * 0.13, hy + 0.06, z + 0.1]], 0.016, 'y', STEEL);
      k.cyl(0.008, [s * W * 0.12, bankY + 0.52, z], [hx, hy + 0.17, z], STEEL, 6);
      // The exhaust branch from the head out to the manifold.
      k.cyl(0.05, [hx + s * 0.12, hy, z], [s * W * 0.48, hy - 0.05, z], LAGGING, 10);
    }
    // Along the bank: the fuel rail and its injector pipes looped to each head, the jacket water
    // manifold under the exhaust (blue) with a branch to each head, and the wiring harness in its conduit.
    const railX = s * W * 0.14;
    k.cyl(0.02, [railX, bankY + 0.5, zA - 0.1], [railX, bankY + 0.5, zF + 0.1], STEEL, 8);
    const jwX = s * W * 0.47;
    k.cyl(0.05, [jwX, bankY + 0.02, zA - 0.1], [jwX, bankY + 0.02, zF + 0.1], 0x3d6fa8, 12);
    k.cyl(0.03, [s * W * 0.2, bankY + 0.66, zA - 0.1], [s * W * 0.2, bankY + 0.66, zF + 0.1], 0x26292b, 8);
    for (let i = 0; i < 8; i++) {
      const z = zF + blockL * ((i + 0.5) / 8);
      const hx = s * W * 0.31;
      const hy = bankY + 0.3;
      k.pipe(0.007, [[railX, bankY + 0.5, z - 0.04], [railX + s * 0.04, bankY + 0.58, z - 0.04], [hx - s * 0.02, hy + 0.2, z - 0.04]], STEEL, false);
      k.cyl(0.018, [hx - s * 0.02, hy + 0.17, z - 0.04], [hx - s * 0.02, hy + 0.25, z - 0.04], 0x55595c, 8); // injector cap
      k.cyl(0.025, [jwX, bankY + 0.05, z], [hx + s * 0.1, hy - 0.08, z], 0x3d6fa8, 8);
      k.bolts([[hx - s * 0.1, hy + 0.08, z - 0.08], [hx - s * 0.1, hy + 0.08, z + 0.08], [hx + s * 0.02, hy + 0.12, z - 0.08], [hx + s * 0.02, hy + 0.12, z + 0.08]], 0.014, 'y', STEEL);
      k.cyl(0.012, [s * W * 0.2, bankY + 0.66, z], [hx, hy + 0.2, z], 0x26292b, 6); // its sensor lead
      k.ring(0.034, 0.008, [s * W * 0.2, bankY + 0.66, z], 'z', STEEL, 8); // harness clip
    }
    // The exhaust manifold along the bank's outside, lagged, forward to its turbocharger.
    k.cyl(0.11, [s * W * 0.48, bankY + 0.25, zA - 0.05], [s * W * 0.48, bankY + 0.25, zF - 0.05], LAGGING, 16);
    for (let i = 0; i <= 8; i++) k.ring(0.115, 0.012, [s * W * 0.48, bankY + 0.25, zF + (blockL * i) / 8], 'z', STEEL, 16);
  }
  // The inlet manifold in the vee, and the charge-air cooler across its front.
  k.cyl(0.13, [0, bankY + 0.42, zA - 0.1], [0, bankY + 0.42, zF + 0.4], STEEL, 16);
  k.box(W * 0.5, 0.36, 0.5, 0, bankY + 0.5, zF + 0.2, BLOCK);
  for (let i = 0; i < 6; i++) k.box(W * 0.48, 0.012, 0.48, 0, bankY + 0.36 + i * 0.05, zF + 0.2, STEEL);

  // ── The free (forward) end: turbochargers, filters, damper, gear case, pumps ──
  const exhausts: V3[] = [];
  for (const s of [-1, 1]) {
    const tx = s * W * 0.3;
    const ty = bankY + 0.62;
    const tz = zF - 0.05;
    // The turbocharger: its turbine housing (in the exhaust), the core, the compressor scroll, and its air filter.
    k.ball(0.2, tx, ty, tz, STEEL, 16);
    k.cyl(0.13, [tx, ty, tz], [tx, ty, tz - 0.32], STEEL, 16);
    k.ring(0.17, 0.06, [tx, ty, tz - 0.36], 'z', 0xa8adb2, 18);
    k.cyl(0.16, [tx, ty, tz - 0.42], [tx, ty, tz - 0.62], 0x55595c, 18);
    for (let i = 0; i < 6; i++) k.ring(0.162, 0.006, [tx, ty, tz - 0.44 - i * 0.03], 'z', DARK, 18);
    // From the manifold to it, lagged; and its outlet turned up.
    k.pipe(0.11, [[s * W * 0.48, bankY + 0.25, zF - 0.05], [s * W * 0.48, ty, zF - 0.05], [tx + s * 0.15, ty, tz]], LAGGING, false);
    k.cyl(0.14, [tx, ty + 0.18, tz + 0.05], [tx, ty + 0.42, tz + 0.05], LAGGING, 16);
    exhausts.push([tx, ty + 0.42, tz + 0.05]);
    // Charge air down from the compressor to the cooler.
    k.pipe(0.08, [[tx, ty - 0.15, tz - 0.36], [tx * 0.5, bankY + 0.6, zF + 0.05]], STEEL, true);
  }
  // Gear case, the damper on the crank, and the PTO shaft forward (the fire pump's).
  k.box(W * 0.78, 0.9, free * 0.8, 0, crank + 0.1, zF - free * 0.4, BLOCK);
  k.cyl(0.36, [0, crank, zF - free * 0.8], [0, crank, zF - free], DARK, 24);
  k.bolts(circle([0, crank, zF - free - 0.005], 0.3, 12, 'z'), 0.016, 'z', STEEL);
  const pto: V3 = [0, crank, -L + 0.02];
  k.cyl(0.07, [0, crank, zF - free], pto, STEEL, 12);
  // Engine-driven pumps, low on the front: jacket water (blue) and sea water (green), their pipes away down.
  for (const [s, c] of [[-1, 0x3d6fa8], [1, 0x3f8a52]] as const) {
    const px = s * W * 0.3;
    const py = y0 + 0.5;
    k.ball(0.15, px, py, zF - 0.12, c, 14);
    k.cyl(0.1, [px, py, zF - 0.12], [px, py, zF + 0.1], c, 12);
    k.pipe(0.06, [[px, py - 0.12, zF - 0.12], [px, y0 + 0.08, zF - 0.12]], c);
  }

  // ── The aft end: flywheel housing, starters ──
  k.cyl(0.52, [0, crank, zA], [0, crank, -0.02], DARK, 28);
  k.bolts(circle([0, crank, -0.015], 0.48, 16, 'z'), 0.018, 'z', STEEL);
  for (const s of [-1, 1]) k.cyl(0.08, [s * 0.46, crank - 0.25, zA - 0.05], [s * 0.46, crank - 0.25, zA - 0.45], RED, 12);

  // ── On her walkway side: the oil and fuel filters, the dipstick, the local panel ──
  const sx = side * W * 0.42;
  const filters = (z: number, colour: number) => {
    k.box(0.08, 0.12, 0.42, sx + side * 0.04, crank - 0.05, z, STEEL);
    for (const dz of [-0.12, 0.12]) k.vessel(0.075, sx + side * 0.12, crank - 0.35, crank + 0.05, z + dz, colour);
    k.cyl(0.012, [sx + side * 0.12, crank + 0.06, z], [sx + side * 0.12, crank + 0.06, z + side * 0.12], RED, 6);
  };
  filters(zm - 0.6, 0xc9a227); // lube oil (yellow)
  filters(zm + 0.4, 0x7a5a32); // fuel (brown)
  k.cyl(0.012, [sx, crank - 0.2, zm + 1.1], [sx + side * 0.08, crank + 0.35, zm + 1.1], STEEL, 6);
  k.ball(0.025, sx + side * 0.08, crank + 0.37, zm + 1.1, YELLOW, 8);
  // (Its local operating panel stands on its own in the aisle beside it: the room's, room.ts.)
  const lop = { at: [sx + side * 0.06, bankY + 0.05, zm - 1.4] as V3, facing: side < 0 ? ('port' as const) : ('stbd' as const), w: 0.42, h: 0.3 };
  // Lifting eyes on top, and the crankcase breather.
  for (const z of [zF + 0.3, zA - 0.3]) k.ring(0.05, 0.015, [0, bankY + 0.66, z], 'x', STEEL, 10);
  k.pipe(0.035, [[0, bankY + 0.6, zA - 0.2], [0, bankY + 0.75, zA - 0.2], [0, bankY + 0.75, zA + 0.15]], BRONZE, false);
  return { kit: k, lop, exhausts, pto };
}

/** A box rolled `roll` rad about the fore-and-aft axis (a bank of cylinders leaning out). */
function boxTilted(w: number, h: number, d: number, x: number, y: number, z: number, roll: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).rotateZ(roll).translate(x, y, z);
}

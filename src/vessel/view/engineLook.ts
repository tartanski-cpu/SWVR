import * as THREE from 'three';
import type { CONFIG } from '../../config';
import { part } from '../../render/geometryUtils';

/**
 * The diesel as you see it under the open hatch in the wheelhouse floor (the diesel
 * module's look, M6c): bearers, sump, block, head and rocker cover, the air and fuel
 * filters, the exhaust manifold and riser, the alternator, the flywheel housing, the oil
 * filler cap, and the oil can's shelf on the engine space's outboard side. Fixed parts,
 * vertex-coloured, merged with the boat's other fixed parts (no draw calls of their own).
 *
 * @param mt      the engine's upkeep config: the block's place and size, the filler, the can
 * @param floorY  the wheelhouse floor's height (the rocker cover sits just under it)
 * @param space   the engine space: its depth below the floor, its outboard side (x)
 */
export function engineParts(mt: typeof CONFIG.vessels.workboat.maintenance, floorY: number, space: { depth: number; outboardX: number }): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const fy = floorY;
  const box = (ax: number, bx: number, ay: number, by: number, az: number, bz: number, col: number) =>
    part(new THREE.BoxGeometry(bx - ax, by - ay, bz - az).translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), col);
  const e = mt.engine;
  const top = fy - 0.12; // the rocker cover's top, just under the floor
  const x0 = e.x - e.width / 2;
  const x1 = e.x + e.width / 2;
  const z0 = e.z - e.length / 2;
  const z1 = e.z + e.length / 2;
  const base = top - e.height;
  const GREEN = 0x2f6b4a; // engine paint
  // Bearers, sump, block, head, rocker cover.
  for (const bx of [x0 + 0.04, x1 - 0.04]) out.push(box(bx - 0.03, bx + 0.03, fy - space.depth, base + 0.05, z0 - 0.08, z1 + 0.08, 0x3a3f44));
  out.push(box(x0 + 0.05, x1 - 0.05, base, base + 0.12, z0 + 0.04, z1 - 0.04, 0x2a2e32));
  out.push(box(x0, x1, base + 0.12, top - 0.16, z0, z1, GREEN));
  out.push(box(x0 + 0.03, x1 - 0.03, top - 0.16, top - 0.07, z0 + 0.02, z1 - 0.02, GREEN));
  out.push(box(x0 + 0.06, x1 - 0.06, top - 0.07, top, z0 + 0.06, z1 - 0.06, 0x3f8a5f)); // rocker cover
  // The air filter on the forward end of the cover, and the fuel filter on the inboard side.
  out.push(part(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 14).translate(e.x, top - 0.035, z0 + 0.03), 0x2a2e32));
  out.push(part(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10).translate(x0 - 0.035, top - 0.22, z1 - 0.15), 0xd8d8d0));
  // Exhaust manifold along the outboard side, the riser going aft; the alternator and
  // belt on the forward end; the flywheel housing aft.
  out.push(box(x1, x1 + 0.06, top - 0.2, top - 0.12, z0 + 0.06, z1 - 0.06, 0x6a5a4a));
  out.push(part(new THREE.CylinderGeometry(0.04, 0.04, 0.32, 10).translate(x1 + 0.03, top - 0.32, z1 + 0.02), 0x6a5a4a));
  out.push(part(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12).rotateZ(Math.PI / 2).translate(x0 + 0.05, top - 0.24, z0 - 0.05), 0xb0b4b8));
  out.push(part(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 14).rotateX(Math.PI / 2).translate(e.x, base + 0.24, z0 - 0.015), 0x2a2e32));
  out.push(part(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 16).rotateX(Math.PI / 2).translate(e.x, base + 0.22, z1 + 0.04), 0x2a2e32));
  // The oil filler cap on the rocker cover (yellow, like the dipstick ring).
  out.push(part(new THREE.CylinderGeometry(0.03, 0.034, 0.03, 12).translate(mt.filler[0], top + 0.015, mt.filler[1]), 0xe8c020));
  // The oil can's shelf on the engine space's outboard wall.
  const shelfY = fy - mt.shelfDrop;
  out.push(box(mt.oilCan[0] - 0.09, space.outboardX, shelfY - 0.02, shelfY, mt.oilCan[1] - 0.1, mt.oilCan[1] + 0.1, 0x8a9096));
  return out;
}

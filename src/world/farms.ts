/**
 * Fish farms (FarmDef, the Fjord): where each cage ring floats, and the low solid block that
 * stands in for each ring in the collision (a boat bumps the ring's float pipe and goes no
 * further; she can't sail through a net pen). Shared by the collision (archipelago.ts
 * BLOCKS) and the drawing (worldView.ts), so what you see is what you hit.
 */
import type { BlockDef, FarmDef } from './defs';

/** The middle of each cage ring (world x, z), row by row. */
export function ringCentres(f: FarmDef): [number, number][] {
  const a = (f.yawDeg * Math.PI) / 180;
  // Along a row: the farm's bearing (x east, z south: north is -z). Across: 90° to the right.
  const ax = Math.sin(a);
  const az = -Math.cos(a);
  const cx = -az;
  const cz = ax;
  const out: [number, number][] = [];
  for (let r = 0; r < f.rows; r++) for (let c = 0; c < f.cols; c++) out.push([f.x + ax * c * f.spacing + cx * r * f.spacing, f.z + az * c * f.spacing + cz * r * f.spacing]);
  return out;
}

/**
 * Each ring as a block: a square a little inside the ring (its float pipe is round; the
 * square's corners reach it), its top at the float, unfendered.
 */
export function farmBlocks(f: FarmDef): BlockDef[] {
  return ringCentres(f).map(([x, z]) => ({ kind: 'barge', x, z, halfLength: f.ringRadius * 0.8, halfWidth: f.ringRadius * 0.8, yawDeg: f.yawDeg, top: 0.35, fendered: false }));
}

/**
 * Fish farms (FarmDef: the Fjord's, and a coast map's from the map data): where each cage ring floats (or each mussel line lies), and the low solid block that
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
 * A mussel farm's long-lines (FarmDef kind 'lines'; the coast extras plan, C2): each line's
 * start and end (world x, z), row by row: along the farm's bearing, a `spacing` apart across it.
 */
export function lineEnds(f: FarmDef): [[number, number], [number, number]][] {
  const a = (f.yawDeg * Math.PI) / 180;
  const ax = Math.sin(a);
  const az = -Math.cos(a);
  const L = f.lineLength ?? 100;
  const out: [[number, number], [number, number]][] = [];
  for (let r = 0; r < f.rows; r++) {
    const x = f.x - az * r * f.spacing;
    const z = f.z + ax * r * f.spacing;
    out.push([
      [x, z],
      [x + ax * L, z + az * L],
    ]);
  }
  return out;
}

/**
 * The farm in the collision: each cage ring a square a little inside the ring (its float
 * pipe is round; the square's corners reach it), its top at the float; each mussel line a
 * long low strip (a boat runs onto its floats and goes no further). Unfendered.
 */
export function farmBlocks(f: FarmDef): BlockDef[] {
  if (f.kind === 'lines')
    return lineEnds(f).map(([[x0, z0], [x1, z1]]) => ({ kind: 'barge', x: (x0 + x1) / 2, z: (z0 + z1) / 2, halfLength: (f.lineLength ?? 100) / 2, halfWidth: 0.6, yawDeg: f.yawDeg, top: 0.3, fendered: false, farm: true }));
  return ringCentres(f).map(([x, z]) => ({ kind: 'barge', x, z, halfLength: f.ringRadius * 0.8, halfWidth: f.ringRadius * 0.8, yawDeg: f.yawDeg, top: 0.35, fendered: false, farm: true }));
}

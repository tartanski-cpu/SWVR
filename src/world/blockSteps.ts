/**
 * Overlapping quay and pier blocks, drawn apart (owner, Oct 2026: "there's a bit of z-fighting
 * ... when you have quaysides which are intersecting").
 *
 * The coast maps' piers are cut into straight runs, each box reaching a little past its ends so
 * the corners close (tools/coast/src/harbours.ts runBox); so neighbouring runs overlap, their
 * decks at the same height and often their sides in one plane. Two surfaces in one plane
 * flicker: the depth buffer can't tell which is in front. Here each block gets a drawing
 * step, different from every block it overlaps at the same deck height (a greedy colouring
 * of the overlap graph); the view draws its slab that many steps (CONFIG.render.blockStepM)
 * lower and narrower. Drawing only: walking, mooring and collisions use the blocks as they are.
 */
import type { BlockDef } from './defs';

/** Corners (x, z) of a block in plan, in the frame world/berths.ts inBlock uses. */
function corners(b: BlockDef): [number, number][] {
  const yaw = (b.yawDeg * Math.PI) / 180;
  // Across (block-local x) and along (local z) in the world.
  const ax = Math.cos(yaw);
  const az = Math.sin(yaw);
  const lx = -Math.sin(yaw);
  const lz = Math.cos(yaw);
  return ([[1, 1], [1, -1], [-1, -1], [-1, 1]] as const).map(([sa, sl]) => [b.x + ax * sa * b.halfWidth + lx * sl * b.halfLength, b.z + az * sa * b.halfWidth + lz * sl * b.halfLength]);
}

/** Do two blocks overlap in plan (separating axes: neither box's edges part them)? */
export function blocksOverlap(a: BlockDef, b: BlockDef): boolean {
  if (Math.hypot(a.x - b.x, a.z - b.z) > Math.hypot(a.halfLength, a.halfWidth) + Math.hypot(b.halfLength, b.halfWidth)) return false;
  const p = corners(a);
  const q = corners(b);
  for (const poly of [p, q]) {
    for (let i = 0; i < 4; i++) {
      const [x1, z1] = poly[i];
      const [x2, z2] = poly[(i + 1) % 4];
      const nx = z2 - z1;
      const nz = x1 - x2;
      const pa = p.map(([x, z]) => nx * x + nz * z);
      const qa = q.map(([x, z]) => nx * x + nz * z);
      if (Math.max(...pa) <= Math.min(...qa) + 1e-6 || Math.max(...qa) <= Math.min(...pa) + 1e-6) return false;
    }
  }
  return true;
}

/** Each block's drawing step (0, 1, 2 ...): different from every earlier block it overlaps at the same deck height. */
export function blockSteps(blocks: readonly BlockDef[]): number[] {
  const steps: number[] = [];
  blocks.forEach((b, i) => {
    const used = new Set<number>();
    for (let j = 0; j < i; j++) if (Math.abs(blocks[j].top - b.top) < 0.01 && blocksOverlap(blocks[j], b)) used.add(steps[j]);
    let s = 0;
    while (used.has(s)) s++;
    steps.push(s);
  });
  return steps;
}

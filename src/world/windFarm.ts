/**
 * Offshore wind farms (WindFarmDef; owner, Oct 2026: crew transfer to wind farms): where each
 * turbine's boat landing is, and the solid blocks that stand in for the turbine in the
 * collision (archipelago.ts BLOCKS), so a boat stops against what she sees (world/view/
 * windFarmView.ts draws it from the same numbers, CONFIG.windFarm):
 *
 *   the foundation   a square block round the round transition piece (its corners reach just
 *                    past it), up to the platform;
 *   the landing      a block from the transition piece out to the landing tubes' outer face,
 *                    as wide as the tubes, up to their top: a crew boat's bow fender meets
 *                    its face (unfendered steel: the fender's own rubber grips it).
 *
 * Both marked `farm` (solid, but nowhere to tie up: world/berths.ts).
 */
import { CONFIG } from '../config';
import type { BlockDef, WindFarmDef } from './defs';

/** A turbine's landing direction: the unit vector (world x east, z south) its landing faces out along. */
export function landingAxis(landingDeg: number): { ax: number; az: number } {
  const a = (landingDeg * Math.PI) / 180;
  return { ax: Math.sin(a), az: -Math.cos(a) };
}

/**
 * Its boat landing's outer face: the middle of the face the tubes present (world x, z), how
 * far out from the turbine's centre that is (m), and its half width across.
 */
export function landingFace(t: WindFarmDef['turbines'][number]): { x: number; z: number; out: number; halfWidth: number } {
  const c = CONFIG.windFarm;
  const { ax, az } = landingAxis(t.landingDeg);
  const out = c.tp.radius + c.landing.out + c.landing.tube;
  return { x: t.x + ax * out, z: t.z + az * out, out, halfWidth: c.landing.halfSpacing + c.landing.tube };
}

/** The turbines of a farm in the collision: see above. */
export function windFarmBlocks(f: WindFarmDef): BlockDef[] {
  const c = CONFIG.windFarm;
  return f.turbines.flatMap((t): BlockDef[] => {
    const { ax, az } = landingAxis(t.landingDeg);
    const face = landingFace(t);
    const r = c.tp.radius;
    // From the transition piece's face out to the tubes' outer face.
    const half = (face.out - r * 0.9) / 2;
    const mid = r * 0.9 + half;
    return [
      { kind: 'barge', x: t.x, z: t.z, halfLength: r * 0.9, halfWidth: r * 0.9, yawDeg: t.landingDeg, top: c.platform.y, fendered: false, farm: true },
      { kind: 'barge', x: t.x + ax * mid, z: t.z + az * mid, halfLength: half, halfWidth: face.halfWidth, yawDeg: t.landingDeg, top: c.landing.top, fendered: false, farm: true },
    ];
  });
}

/**
 * Sheltered water: a wave-amplitude multiplier s(x, z) in [factor, 1] from the circular
 * shelter zones in archipelago.ts (inside rIn: `factor`; smoothstep back to 1 at rOut;
 * overlapping zones take the most sheltered).
 *
 * It is applied to every wave component at the particle's REST position (x0, z0), both on
 * the CPU (waves.ts) and in the ocean vertex shader (same formula, zones passed as
 * uniforms), so the calm water in a harbour is calm for the physics too. The gradient of s
 * is ignored in the surface normal - harmless because zones fade over tens of metres.
 */
import { SHELTERS, type ShelterDef } from './archipelago';

/** Zones the ocean shader can hold at once: those of the regions drawn in full (worldView.ts). */
export const MAX_SHELTERS = 8;

/** A zone's factor at distance d from its centre (its `factor` inside rIn, 1 beyond rOut). */
function zoneK(z0: ShelterDef, d: number): number {
  const t = Math.min(1, Math.max(0, (d - z0.rIn) / (z0.rOut - z0.rIn)));
  return z0.factor + (1 - z0.factor) * t * t * (3 - 2 * t);
}

/** The shelter at (x, z) from the zones with no gap (the same for every wave). */
export function shelterFactor(x: number, z: number): number {
  let s = 1;
  for (const z0 of SHELTERS) {
    if (z0.openArcDeg) continue;
    const d = Math.hypot(x - z0.x, z - z0.z);
    if (d >= z0.rOut) continue;
    const k = zoneK(z0, d);
    if (k < s) s = k;
  }
  return s;
}

/** The soft edge of a gap (deg): fully open this far inside the arc, fully sheltered this far outside it. */
const ARC_EDGE = 15;

/**
 * The shelter at (x, z) from the zones WITH a gap, for one wave travelling along (dirX,
 * dirZ): full shelter unless the wave comes from within the gap, where it fades to none.
 * The shader does the same (gerstner.glsl arcShelterAt). 1 when no such zone is near.
 */
export function arcShelter(x: number, z: number, dirX: number, dirZ: number): number {
  let s = 1;
  for (const z0 of SHELTERS) {
    if (!z0.openArcDeg) continue;
    if (Math.abs(x - z0.x) >= z0.rOut || Math.abs(z - z0.z) >= z0.rOut) continue;
    const d = Math.hypot(x - z0.x, z - z0.z);
    if (d >= z0.rOut) continue;
    // The sea comes FROM the bearing opposite its travel (bearings: 0 north = -z, clockwise).
    const from = ((Math.atan2(-dirX, dirZ) * 180) / Math.PI + 360) % 360;
    let diff = Math.abs(from - (z0.openFromDeg ?? 0)) % 360;
    if (diff > 180) diff = 360 - diff;
    const open = Math.min(1, Math.max(0, (z0.openArcDeg + ARC_EDGE - diff) / (2 * ARC_EDGE)));
    const k = zoneK(z0, d);
    const kDir = k + (1 - k) * open;
    if (kDir < s) s = kDir;
  }
  return s;
}

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
import { SHELTERS } from './archipelago';

/** Zones the ocean shader can hold at once: those of the regions drawn in full (worldView.ts). */
export const MAX_SHELTERS = 8;

export function shelterFactor(x: number, z: number): number {
  let s = 1;
  for (const z0 of SHELTERS) {
    const d = Math.hypot(x - z0.x, z - z0.z);
    if (d >= z0.rOut) continue;
    const t = Math.min(1, Math.max(0, (d - z0.rIn) / (z0.rOut - z0.rIn)));
    const k = z0.factor + (1 - z0.factor) * t * t * (3 - 2 * t);
    if (k < s) s = k;
  }
  return s;
}

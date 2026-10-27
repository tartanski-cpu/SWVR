/**
 * Sunlight on the sea for solar panels (owner, 27 Oct 2026: the solar catamaran's charging,
 * "a realistic model"). Pure functions on plain data, so they run in the headless sim and
 * tests. Tunables: CONFIG.environment.sunlight.
 *
 *   clear sky   global horizontal irradiance (GHI, W/m2) from the sun's height h (Haurwitz):
 *               GHI = a sin h exp(-b / sin h); nothing with the sun below the horizon
 *   cloud       Kasten and Czeplak: GHI x (1 - 0.75 C^3.4), C the cloud cover 0..1; rain
 *               dims it further (`rainCut`)
 *   split       into the direct beam (DNI, on a surface square to the sun) and the diffuse
 *               light from the whole sky (DHI), by Erbs's correlation on the clearness index
 *               kt = GHI / (I0 sin h): a clear sky is mostly beam, an overcast one all diffuse
 *   on a panel  facing n (a unit vector, world axes), tilted b from level (cos b = n.y), the
 *               sun's direction s: POA = DNI max(0, n.s) + DHI (1 + cos b) / 2
 *               + GHI albedo (1 - cos b) / 2 (beam, sky, and the sea's reflection)
 *
 * Not modelled: shading (her own house on her panels), the sea's glitter, the air's
 * temperature by the hour.
 */
import { CONFIG } from '../config';
import type { Vec3 } from '../core/math';

export interface Sunlight {
  /** Global horizontal, direct normal and diffuse horizontal irradiance (W/m2). */
  ghi: number;
  dni: number;
  dhi: number;
  /** Unit vector toward the sun (world axes). */
  sun: Vec3;
}

/** The sunlight for the sun at `sun` (unit vector toward it), cloud cover and rain (0..1). */
export function sunlight(sun: Vec3, cloud: number, rain: number, c = CONFIG.environment.sunlight): Sunlight {
  const sinH = sun[1];
  if (sinH <= 0.01) return { ghi: 0, dni: 0, dhi: 0, sun };
  const [a, b] = c.clearSky;
  const clear = a * sinH * Math.exp(-b / sinH);
  const C = Math.min(1, Math.max(0, cloud));
  const ghi = clear * (1 - c.cloudCut * C ** c.cloudPower) * (1 - c.rainCut * Math.min(1, Math.max(0, rain)));
  // Erbs: the diffuse share from the clearness index.
  const kt = Math.min(1, ghi / (c.solarConstant * sinH));
  const kd = kt <= 0.22 ? 1 - 0.09 * kt : kt <= 0.8 ? 0.9511 - 0.1604 * kt + 4.388 * kt ** 2 - 16.638 * kt ** 3 + 12.336 * kt ** 4 : 0.165;
  const dhi = kd * ghi;
  return { ghi, dhi, dni: (ghi - dhi) / sinH, sun };
}

/** The irradiance on a panel facing `n` (unit vector, world axes), W/m2. */
export function planeIrradiance(s: Sunlight, n: Vec3, albedo = CONFIG.environment.sunlight.albedo): number {
  if (s.ghi <= 0) return 0;
  const cosI = n[0] * s.sun[0] + n[1] * s.sun[1] + n[2] * s.sun[2];
  const cosB = Math.max(-1, Math.min(1, n[1]));
  return s.dni * Math.max(0, cosI) + (s.dhi * (1 + cosB)) / 2 + (s.ghi * albedo * (1 - cosB)) / 2;
}

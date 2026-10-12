/**
 * Plain-data math types used in simulation state. Simulation code may use Three.js
 * math classes (Vector3, Quaternion) internally as scratch values, but anything
 * stored in WorldState uses these tuples so it stays JSON-serializable.
 */
export type Vec3 = [number, number, number];
/** Quaternion as [x, y, z, w]. */
export type Quat = [number, number, number, number];
export type RGB = [number, number, number];

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const DEG = Math.PI / 180;

/** Wrap to [0, m). */
export const wrap = (v: number, m: number): number => ((v % m) + m) % m;

export function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** 0xRRGGBB -> linear-ish [0..1] sRGB triplet (no colour-space conversion). */
export function hexToRGB(hex: number): RGB {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/**
 * A boat's mass properties from her parts (modular boats 2.6, M6): the hull's lightship
 * plus the modules that declare their own mass (the engine, the batteries). Headless.
 *
 *   mass     M = m_hull + sum m_i
 *   CG       G = (m_hull G_hull + sum m_i p_i) / M
 *   inertia  principal moments about G in the boat's axes, x = pitch, y = yaw, z = roll:
 *            the hull's own (about its CG) moved to G by the parallel-axis rule, plus each
 *            module as a point mass:  I_x += m (dy^2 + dz^2), I_y += m (dx^2 + dz^2),
 *            I_z += m (dx^2 + dy^2). Products of inertia are left out, as for deck cargo
 *            (vessel/physics/vesselPhysics.ts): small for parts near the centreline.
 *
 * `lightshipOf` is the inverse: a weighed boat less the parts that declare a mass, which
 * gives the hull's lightship such that the parts add back up to the weighed boat. That is
 * how the starter workboat's hull figure is set: so she is exactly as heavy, and trims and
 * rolls exactly as, before her engine and batteries had masses of their own.
 */
import type { Vec3 } from '../core/math';

export interface MassProperties {
  massKg: number;
  cg: Vec3;
  /** Principal moments about the CG (kg m^2): pitch (x), yaw (y), roll (z). */
  inertia: Vec3;
}

/** A part of the boat with a mass of its own, as a point at its CG (the boat's axes). */
export interface PointMass {
  massKg: number;
  at: readonly [number, number, number];
}

/** Inertia from radii of gyration (m): pitch, yaw, roll. */
export function inertiaFromGyradius(massKg: number, g: { roll: number; pitch: number; yaw: number }): Vec3 {
  return [massKg * g.pitch ** 2, massKg * g.yaw ** 2, massKg * g.roll ** 2];
}

/** I += m d^2 about each axis, for a point mass at offset d from the CG. */
function addPoint(I: Vec3, m: number, d: readonly [number, number, number], sign = 1): void {
  I[0] += sign * m * (d[1] * d[1] + d[2] * d[2]);
  I[1] += sign * m * (d[0] * d[0] + d[2] * d[2]);
  I[2] += sign * m * (d[0] * d[0] + d[1] * d[1]);
}

const sub = (a: readonly number[], b: readonly number[]): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** The whole boat: the hull's lightship plus the parts. */
export function combine(hull: MassProperties, parts: readonly PointMass[]): MassProperties {
  if (!parts.length) return { massKg: hull.massKg, cg: [...hull.cg], inertia: [...hull.inertia] };
  let m = hull.massKg;
  const s = [hull.cg[0] * hull.massKg, hull.cg[1] * hull.massKg, hull.cg[2] * hull.massKg];
  for (const p of parts) {
    m += p.massKg;
    for (let i = 0; i < 3; i++) s[i] += p.at[i] * p.massKg;
  }
  const cg: Vec3 = [s[0] / m, s[1] / m, s[2] / m];
  const inertia: Vec3 = [...hull.inertia];
  addPoint(inertia, hull.massKg, sub(hull.cg, cg));
  for (const p of parts) addPoint(inertia, p.massKg, sub(p.at, cg));
  return { massKg: m, cg, inertia };
}

/** The hull's lightship: a weighed boat less the parts that declare their own mass. */
export function lightshipOf(weighed: MassProperties, parts: readonly PointMass[]): MassProperties {
  if (!parts.length) return { massKg: weighed.massKg, cg: [...weighed.cg], inertia: [...weighed.inertia] };
  let m = weighed.massKg;
  const s = [weighed.cg[0] * weighed.massKg, weighed.cg[1] * weighed.massKg, weighed.cg[2] * weighed.massKg];
  for (const p of parts) {
    m -= p.massKg;
    for (let i = 0; i < 3; i++) s[i] -= p.at[i] * p.massKg;
  }
  if (m <= 0) throw new Error('the parts weigh more than the boat');
  const cg: Vec3 = [s[0] / m, s[1] / m, s[2] / m];
  // About the weighed boat's CG, take the parts' and the hull's own transfer terms away.
  const inertia: Vec3 = [...weighed.inertia];
  for (const p of parts) addPoint(inertia, p.massKg, sub(p.at, weighed.cg), -1);
  addPoint(inertia, m, sub(cg, weighed.cg), -1);
  return { massKg: m, cg, inertia };
}

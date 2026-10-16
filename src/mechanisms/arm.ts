/**
 * Mechanism library (modular boats, 2.8): a knuckle-boom arm, as on the tender crane. Pure
 * geometry, no scene: a module's view poses its own meshes from these angles.
 *
 * The arm is a two-link chain (boom, then jib) from a shoulder on a slewing turret. To put
 * the jib head over a target, the turret slews to face it and the two links solve the
 * triangle shoulder-elbow-head by the law of cosines, knuckle up. A folded (transport)
 * pose is blended in angle by angle, the slew going the short way round.
 */

/** Something with x, y, z (a THREE.Vector3 will do). */
export interface Point {
  x: number;
  y: number;
  z: number;
}

/** Link lengths (m). */
export interface ArmLinks {
  boom: number;
  jib: number;
}

/**
 * The arm's angles (rad): slew (the turret's heading, from +x toward +z, as atan2(z, x)),
 * the boom's elevation, and the jib's direction (from the elbow) in the same vertical plane.
 */
export interface ArmAngles {
  slew: number;
  boom: number;
  jib: number;
}

/**
 * The working pose with the jib head over `target`: `above` m over it, but never lower than
 * `minRise` m over the shoulder; out of reach, the arm stretches (or folds) as far as it can.
 */
export function reachOver(shoulder: Point, target: Point, links: ArmLinks, above: number, minRise: number): ArmAngles {
  const S = shoulder;
  const H = target;
  const psi = Math.atan2(H.z - S.z, H.x - S.x);
  const reach = Math.hypot(H.x - S.x, H.z - S.z);
  const tipY = Math.max(H.y + above, S.y + minRise);
  let dv = tipY - S.y;
  let d = Math.hypot(reach, dv);
  const L1 = links.boom;
  const L2 = links.jib;
  const dMax = L1 + L2 - 0.02;
  const dMin = Math.abs(L1 - L2) + 0.05;
  const beta = Math.atan2(dv, reach);
  d = Math.min(dMax, Math.max(dMin, d));
  dv = d * Math.sin(beta);
  // Knuckle up: the boom's elevation is the target's plus the angle the law of cosines gives
  // between the boom and the line to the target.
  const alpha = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const thW = beta + alpha;
  // The jib's direction in the same plane (elbow to head).
  const phiW = Math.atan2(dv - L1 * Math.sin(thW), d * Math.cos(beta) - L1 * Math.cos(thW));
  return { slew: psi, boom: thW, jib: phiW };
}

/** `working` blended toward `folded` by `fold` (0..1, eased in and out). */
export function foldToward(working: ArmAngles, folded: ArmAngles, fold: number): ArmAngles {
  const f = fold * fold * (3 - 2 * fold);
  const psi = working.slew;
  return {
    slew: psi + Math.atan2(Math.sin(folded.slew - psi), Math.cos(folded.slew - psi)) * f,
    boom: working.boom + (folded.boom - working.boom) * f,
    jib: working.jib + (folded.jib - working.jib) * f,
  };
}

/** Where the elbow and the jib head are for these angles (written into `elbow` and `head`). */
export function armJoints<P extends Point>(shoulder: Point, a: ArmAngles, links: ArmLinks, elbow: P, head: P): void {
  const ux = Math.cos(a.slew);
  const uz = Math.sin(a.slew);
  const h1 = links.boom * Math.cos(a.boom);
  const v1 = links.boom * Math.sin(a.boom);
  const h2 = h1 + links.jib * Math.cos(a.jib);
  const v2 = v1 + links.jib * Math.sin(a.jib);
  elbow.x = shoulder.x + ux * h1;
  elbow.y = shoulder.y + v1;
  elbow.z = shoulder.z + uz * h1;
  head.x = shoulder.x + ux * h2;
  head.y = shoulder.y + v2;
  head.z = shoulder.z + uz * h2;
}

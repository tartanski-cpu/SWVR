/**
 * Joystick vector mode for pod drives (owner, Oct 2026; modules/pods): what each pod does
 * for what the stick asks.
 *
 * The stick asks for three things at once: a push sideways (stick left / right), a push ahead
 * or astern (stick forward / back), and a turning moment (stick twisted). Each pod gives one
 * push, along its own heading, which it can point anywhere within its swing and run ahead or
 * astern. Two pods are four numbers (each one's push to starboard and push aft) for three
 * wants, so there are many ways to do it: we take the one with the least push in all
 * (the least-squares, "minimum norm" answer, v = Aᵀ(AAᵀ)⁻¹b), which never makes the pods
 * fight each other harder than they must.
 *
 *   Fx  = Σ vx_i                     the push to starboard
 *   Fz  = Σ vz_i                     the push aft
 *   τ   = Σ (z_i vx_i - x_i vz_i)    the turning moment about her centre (the boat's y axis:
 *                                    + turns her bow to port), x_i z_i each pod's place from it
 *
 * A push sideways from pods aft of her centre would also turn her (stern away), so the answer
 * angles them in toward each other, one pushing ahead and the other astern, their two pushes
 * crossing about her centre: she crabs. A pure twist is one ahead and one astern, straight.
 *
 * Plain functions on plain numbers (the simulation's; no Three.js).
 */

/** One pod's push: its heading (rad, the pods' swing convention: + turns its push to port) and its share of a full push, signed (- astern). */
export interface PodOrder {
  angle: number;
  push: number;
}

/** A push (boat axes: `x` to starboard, `z` aft), in shares of one pod's full push. */
export interface Push {
  x: number;
  z: number;
}

/**
 * Each pod's push vector for a push `fx` (to starboard), `fz` (aft) and a moment `torque`
 * about her centre (shares of one pod's full push; the moment's per metre), the pods at `at`
 * (x, z from her centre, m): the least push in all that gives them (above).
 */
export function podPushes(at: readonly { x: number; z: number }[], fx: number, fz: number, torque: number): Push[] {
  const n = at.length;
  // AAᵀ (3 × 3, symmetric) for the rows Fx, Fz, τ.
  let sx = 0;
  let sz = 0;
  let sr = 0;
  for (const p of at) {
    sx += p.x;
    sz += p.z;
    sr += p.x * p.x + p.z * p.z;
  }
  const m: number[][] = [
    [n, 0, sz],
    [0, n, -sx],
    [sz, -sx, sr],
  ];
  const l = solve3(m, [fx, fz, torque]);
  return at.map((p) => ({ x: l[0] + p.z * l[2], z: l[1] - p.x * l[2] }));
}

/**
 * What the pods do for a push and a turn together: the turn first. If together they'd ask a
 * pod for more than its full push, the push (crabbing, creeping) is cut back until they don't,
 * and the turn kept (so she holds her head, or turns as asked, before she moves).
 */
export function combinePushes(move: readonly Push[], turn: readonly Push[]): Push[] {
  const fits = (k: number) => move.every((m, i) => Math.hypot(k * m.x + turn[i].x, k * m.z + turn[i].z) <= 1 + 1e-9);
  let k = 1;
  if (!fits(1)) {
    let lo = 0;
    let hi = 1;
    for (let it = 0; it < 14; it++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }
    k = lo;
  }
  return move.map((m, i) => ({ x: k * m.x + turn[i].x, z: k * m.z + turn[i].z }));
}

/**
 * Each pod's heading and push for its push vector: a push ahead points along the pod's
 * heading (-sin a, -cos a), so past ±90° it's the other way round, astern. Each heading is
 * kept within ±`maxAngle` (rad); a push it would need beyond that it gives within it. If one
 * pod would need more than its full push, all are scaled back together (so what she does
 * keeps its direction).
 */
export function podOrders(pushes: readonly Push[], maxAngle: number): PodOrder[] {
  const orders = pushes.map((v) => {
    const size = Math.hypot(v.x, v.z);
    if (size < 1e-6) return { angle: 0, push: 0 };
    let a = Math.atan2(-v.x, -v.z);
    let sign = 1;
    if (a > Math.PI / 2) [a, sign] = [a - Math.PI, -1];
    else if (a < -Math.PI / 2) [a, sign] = [a + Math.PI, -1];
    return { angle: Math.max(-maxAngle, Math.min(maxAngle, a)), push: sign * size };
  });
  const most = Math.max(...orders.map((o) => Math.abs(o.push)));
  if (most > 1) for (const o of orders) o.push /= most;
  return orders;
}

/** All three steps at once: the pods' orders for what the stick asks (the turn first). */
export function allocatePods(at: readonly { x: number; z: number }[], fx: number, fz: number, torque: number, maxAngle: number): PodOrder[] {
  return podOrders(combinePushes(podPushes(at, fx, fz, 0), podPushes(at, 0, 0, torque)), maxAngle);
}

/** Solve a 3 × 3 system (Cramer's rule; the pods' matrix is never singular for two pods apart). */
function solve3(m: number[][], b: number[]): [number, number, number] {
  const det = (a: number[][]) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const d = det(m);
  if (Math.abs(d) < 1e-9) return [0, 0, 0];
  const col = (i: number) => m.map((row, r) => row.map((v, c) => (c === i ? b[r] : v)));
  return [det(col(0)) / d, det(col(1)) / d, det(col(2)) / d];
}

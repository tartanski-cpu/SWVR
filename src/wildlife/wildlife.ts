import { CONFIG } from '../config';

/**
 * Wildlife for atmosphere (owner request): gulls wheeling over the boat, and now and then a
 * pod of dolphins riding the bow wave. Decoration only - no physics, no state in the
 * world: every pose is a pure function of the (shared) world time and the boat's pose, so
 * every crew-mate sees the same birds and the same dolphins, with nothing sent over the
 * network. The view (wildlifeView.ts) draws them; the sounds are in audio/wildlifeAudio.ts.
 *
 *   gulls     `count` birds, each circling its own point that drifts slowly about the boat
 *             (radius, height, turn rate from a per-bird hash). They glide with a slight
 *             dihedral and now and then flap; they bank into the turn (tan(bank) = v^2 / g r,
 *             exaggerated a little to read). Not at night.
 *   dolphins  every `every` s or so (in fixed time slots, most of them), if she's under way
 *             in open, deep water by day, a pod comes up from astern, rides off the bow for
 *             `stay` s, then drops back. Each surfaces on its own rhythm: a low arc out of
 *             the water (a breath), then under again.
 */

/** Deterministic hash in [0, 1). */
export function hash(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface GullPose {
  x: number;
  y: number;
  z: number;
  /** Heading: yaw (rad, three.js: 0 = facing -z), bank (rad, + = right wing down). */
  yaw: number;
  bank: number;
  /** Wing angle up from level (rad). */
  wing: number;
}

/**
 * Gull `i` at time `t` (s), circling over a boat at (bx, bz). Heights are above sea level.
 */
export function gullPose(i: number, t: number, bx: number, bz: number, out: GullPose): GullPose {
  const c = CONFIG.wildlife.gulls;
  const r = lerp(c.radius[0], c.radius[1], hash(i + 0.1));
  const dir = hash(i + 0.4) < 0.5 ? -1 : 1;
  const w = lerp(c.turnRate[0], c.turnRate[1], hash(i + 0.3)) * dir;
  const th = hash(i + 0.5) * 2 * Math.PI + w * t;
  // Each circles its own centre, which wanders about the boat.
  const cx = bx + c.wander * Math.sin(t * 0.05 + i * 1.7);
  const cz = bz + c.wander * Math.cos(t * 0.043 + i * 2.3);
  out.x = cx + r * Math.cos(th);
  out.z = cz + r * Math.sin(th);
  out.y = lerp(c.height[0], c.height[1], hash(i + 0.2)) + 1.5 * Math.sin(t * 0.21 + i);
  // Flying along the circle: velocity = w r (-sin th, cos th).
  const vx = -Math.sin(th) * dir;
  const vz = Math.cos(th) * dir;
  out.yaw = Math.atan2(-vx, -vz);
  const v = Math.abs(w) * r;
  out.bank = Math.atan((1.6 * v * v) / (9.81 * r)) * dir;
  const flapping = Math.sin(t * 0.35 + i * 7.1) > 0.55;
  out.wing = flapping ? 0.55 * Math.sin(t * 10 + i) : 0.12 + 0.05 * Math.sin(t * 1.3 + i);
  return out;
}

export interface DolphinPose {
  /** In the boat's heading frame (m): x to starboard, z aft (+) / ahead (-). */
  x: number;
  z: number;
  /** Height relative to the sea surface (m), and nose-up pitch (rad). Out of the water? */
  y: number;
  pitch: number;
  up: boolean;
  /** Seconds since this dolphin last broke the surface (for the blow sound). */
  sinceBreath: number;
}

/**
 * Is a pod with us at time t? Returns how far into the visit (s), or null. Time is cut
 * into slots of `every` s; in most slots (`chance`) a pod comes at a hashed moment.
 */
export function podVisit(t: number): number | null {
  const c = CONFIG.wildlife.dolphins;
  const k = Math.floor(t / c.every);
  if (hash(k + 0.77) > c.chance) return null;
  const start = k * c.every + hash(k + 0.31) * (c.every - c.stay);
  const into = t - start;
  return into >= 0 && into < c.stay ? into : null;
}

/** Dolphin j of the pod, `into` s into the visit, at time t. */
export function dolphinPose(j: number, into: number, t: number, bowZ: number, out: DolphinPose): DolphinPose {
  const c = CONFIG.wildlife.dolphins;
  const side = j % 2 ? 1 : -1;
  // Coming up from astern at the start, dropping back at the end.
  const arrive = Math.max(0, 1 - into / 8);
  const leave = Math.max(0, 1 - (c.stay - into) / 8);
  out.x = side * (2.2 + 1.2 * Math.floor(j / 2)) + 0.6 * Math.sin(t * 0.4 + j);
  out.z = bowZ - 2 - 2.5 * j + 2 * Math.sin(t * 0.3 + j * 2) + 45 * (arrive * arrive + leave * leave);
  // Breathing rhythm: an arc out of the water for the first part of each cycle.
  const period = 2.8 + 0.5 * hash(j + 0.6);
  const p = (t / period + hash(j + 0.9)) % 1;
  const arc = 0.3;
  out.up = p < arc;
  out.sinceBreath = p * period;
  if (out.up) {
    const s = p / arc;
    out.y = -0.55 + 0.85 * Math.sin(Math.PI * s);
    out.pitch = 0.8 * Math.cos(Math.PI * s);
  } else {
    out.y = -1.6;
    out.pitch = 0;
  }
  return out;
}

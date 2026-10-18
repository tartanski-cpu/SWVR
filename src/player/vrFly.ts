import { CONFIG } from '../config';

/**
 * VR fly (Debug menu; owner request): for getting round the world quickly in the headset.
 * The left stick flies the way you look - push forward to fly where your head points (up
 * and down too), back to back off, sideways to slide - with no floor, walls or gravity.
 * The triggers are the throttle: one held is fast, both very fast (CONFIG.vrFly).
 * Switch it off and you drop from wherever you are (the body falls as after a jump).
 */

/** Flying speed (m/s) from how far each trigger is pulled (0..1): one past half fast, both very fast. */
export function vrFlySpeed(leftTrigger: number, rightTrigger: number, c = CONFIG.vrFly): number {
  const n = (leftTrigger > 0.5 ? 1 : 0) + (rightTrigger > 0.5 ? 1 : 0);
  return c.speed * (n === 2 ? c.veryFast : n === 1 ? c.fast : 1);
}

type V3 = { x: number; y: number; z: number };

/**
 * This frame's move (world metres): stick x right, y forward (-1..1), along the head's
 * forward and right (world unit vectors), at `speed` for `dt`.
 */
export function vrFlyStep(stickX: number, stickY: number, forward: V3, right: V3, speed: number, dt: number): V3 {
  const s = speed * dt;
  return {
    x: (forward.x * stickY + right.x * stickX) * s,
    y: (forward.y * stickY + right.y * stickX) * s,
    z: (forward.z * stickY + right.z * stickX) * s,
  };
}

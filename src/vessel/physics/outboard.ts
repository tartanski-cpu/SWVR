/**
 * Electric outboard: a motor and propeller on a bracket on the transom, steered by
 * swinging the whole unit on its tiller. Deliberately simple, like the rest of the
 * machinery:
 *
 *   throttle = twist grip 0..1 (`lever`), in the gear selected (`obGear`: +1 forward,
 *              0 neutral, -1 reverse), only with the motor switched on (`obOn`)
 *   thrust T = throttle * T0 * (1 - Va / Vz)     forward  (Va: speed of advance at the prop)
 *            = -throttle * T0 * astern           reverse
 *   direction: along the motor's centreline, swung by the steering angle
 *              delta = helm * maxSteer  (helm +1: tiller to port -> stern pushed to port ->
 *              bow swings to starboard; the same sense as the workboat's wheel)
 *   power  P = Pmax * |throttle|^1.5 (most of it near full), drawn from the battery.
 *
 * No battery, no thrust. Thrust fades as the propeller comes out of the water.
 * Since M6a it is the skiff's module (modules/electricOutboard), pushing through the
 * physics port; this is its arithmetic.
 */
import type { OutboardConfig } from '../vesselDef';

/** What the outboard reads: its on/off button, gear lever, twist grip and tiller. */
export interface OutboardInputs {
  on: boolean;
  /** +1 forward, 0 neutral, -1 reverse. */
  gear: number;
  /** Twist grip 0..1 (the throttle key). */
  throttle: number;
  /** Tiller -1..1 (the helm key). */
  helm: number;
}

/**
 * Advance the outboard by dt: drain its battery (`b.battery`, 0..1) and return the thrust
 * (N) and the unit vector it acts along, in vessel axes (forward is -z).
 *
 * @param speed     speed of advance at the propeller (m/s, + ahead)
 * @param immersion 0 (propeller out of the water) .. 1
 */
export function stepOutboard(ob: OutboardConfig, inp: OutboardInputs, b: { battery?: number }, speed: number, immersion: number, dt: number, outDir: { x: number; z: number }): number {
  const throttle = inp.on ? Math.sign(inp.gear) * Math.max(0, Math.min(1, inp.throttle)) : 0;
  const delta = (Math.max(-1, Math.min(1, inp.helm)) * ob.maxSteerDeg * Math.PI) / 180;
  outDir.x = -Math.sin(delta);
  outDir.z = -Math.cos(delta);
  const battery = b.battery ?? 0;
  if (battery <= 0 || Math.abs(throttle) < 0.02) return 0;
  // Battery: kWh -> fraction per second at this power.
  const kw = ob.powerKw * Math.pow(Math.abs(throttle), 1.5);
  b.battery = Math.max(0, battery - (kw * dt) / 3600 / ob.batteryKWh);
  const t = throttle > 0 ? throttle * ob.staticThrustN * Math.max(0, 1 - speed / ob.zeroThrustSpeed) : throttle * ob.staticThrustN * ob.asternFactor;
  return t * immersion;
}

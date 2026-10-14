/**
 * Electric outboard: a motor and propeller on a bracket on the transom, steered by
 * swinging the whole unit on its tiller. Deliberately simple, like the rest of the
 * machinery:
 *
 *   thrust T = throttle * T0 * (1 - Va / Vz)     ahead  (Va: speed of advance at the prop)
 *            = throttle * T0 * astern             astern (|throttle|, pointing aft)
 *   direction: along the motor's centreline, swung by the steering angle
 *              delta = helm * maxSteer  (helm +1: tiller to port -> stern pushed to port ->
 *              bow swings to starboard; the same sense as the workboat's wheel)
 *   power  P = Pmax * |throttle|^1.5 (most of it near full), drawn from the battery.
 *
 * No battery, no thrust. Thrust fades as the propeller comes out of the water.
 */
import type { VesselDef } from '../vesselDef';
import type { VesselState } from '../vesselState';

/**
 * Advance the outboard by dt: drain the battery and return the thrust (N) and the unit
 * vector it acts along, in vessel axes (forward is -z).
 *
 * @param speed     speed of advance at the propeller (m/s, + ahead)
 * @param immersion 0 (propeller out of the water) .. 1
 */
export function stepOutboard(s: VesselState, def: VesselDef, speed: number, immersion: number, dt: number, outDir: { x: number; z: number }): number {
  const ob = def.outboard;
  if (!ob) return 0;
  const throttle = Math.max(-1, Math.min(1, s.controls.lever));
  const delta = (Math.max(-1, Math.min(1, s.controls.helm)) * ob.maxSteerDeg * Math.PI) / 180;
  outDir.x = -Math.sin(delta);
  outDir.z = -Math.cos(delta);
  const battery = s.battery ?? 0;
  if (battery <= 0 || Math.abs(throttle) < 0.02) return 0;
  // Battery: kWh -> fraction per second at this power.
  const kw = ob.powerKw * Math.pow(Math.abs(throttle), 1.5);
  s.battery = Math.max(0, battery - (kw * dt) / 3600 / ob.batteryKWh);
  const t = throttle > 0 ? throttle * ob.staticThrustN * Math.max(0, 1 - speed / ob.zeroThrustSpeed) : throttle * ob.staticThrustN * ob.asternFactor;
  return t * immersion;
}

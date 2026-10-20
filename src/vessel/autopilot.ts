/**
 * The helm assist panel's three jobs (owner, Oct 2026; modules/helmAssist):
 *   - AUTO START: the whole start-up in one press, as the debug's quick start does: battery
 *     master on, the main breakers on, the engine started;
 *   - DOCK: the menu's Dock / Cast off (vessel/physics/mooring.ts toggleDock);
 *   - AUTOPILOT: holds the compass heading she was on when it was engaged, by turning the
 *     wheel itself, as a helmsman would (its gear: CONFIG.modules.helmAssist.autopilot). It lets go when
 *     anyone turns the wheel, or when the INSTRUMENTS circuit goes dead.
 * Simulation only: the boat's own state, no drawing.
 */
import { gearOf } from '../boats/sims';
import { clamp } from '../core/math';
import { isPowered } from './electrics';
import { toggleEngine } from './physics/propulsion';
import type { VesselState } from './vesselState';

const RAD = 180 / Math.PI;

/** Her compass heading (deg, 0 north = -Z, 90 east), from her orientation. */
export function compassHeading(s: VesselState): number {
  const [x, y, z, w] = s.orientation;
  const fx = -2 * (x * z + w * y);
  const fz = -(1 - 2 * (x * x + y * y));
  const h = Math.atan2(fx, -fz) * RAD;
  return h < 0 ? h + 360 : h;
}

/** One press does it all: master, main breakers, start (the debug's quick start; AUTO START). */
export function quickStart(s: VesselState): void {
  if (s.electrics) {
    s.electrics.master = 1;
    for (const k of ['instruments', 'chart', 'radio', 'navLights', 'hydraulics'] as const) s.electrics.breakers[k] = 1;
  }
  const diesel = gearOf(s, 'diesel');
  if (s.engine.phase === 'off' && diesel) toggleEngine(s, diesel);
}

/** Engage the autopilot on the heading she's on now (with the INSTRUMENTS circuit live), or let it go. */
export function engageAutopilot(s: VesselState, on: boolean): void {
  if (on && isPowered(s, 'instruments')) {
    s.controls.autopilot = 1;
    s.controls.autopilotHeading = compassHeading(s);
    s.controls.autopilotHelm = s.controls.helm;
  } else s.controls.autopilot = 0;
}

/**
 * Each tick, before her steering is read: with the autopilot engaged, the wheel set to bring
 * her back to her heading. Her heading's error e (deg, + when she must come round to
 * starboard) and her rate of turn r (deg/s, + to starboard): helm = k e - c r, within the
 * limit. Anyone moving the wheel (her helm not where the autopilot left it) lets it go.
 */
export function stepAutopilot(s: VesselState): void {
  if (!s.controls.autopilot) return;
  const ap = gearOf(s, 'autopilot');
  if (!ap || !isPowered(s, 'instruments') || s.controls.helm !== s.controls.autopilotHelm) {
    s.controls.autopilot = 0;
    return;
  }
  const e = ((((s.controls.autopilotHeading ?? 0) - compassHeading(s)) % 360) + 540) % 360 - 180;
  // (Her yaw rate about the vertical, + anticlockwise seen from above; her heading grows clockwise.)
  const r = -s.angularVelocity[1] * RAD;
  s.controls.helm = clamp(ap.helmPerDeg * e - ap.helmPerDegS * r, -ap.maxHelm, ap.maxHelm);
  s.controls.autopilotHelm = s.controls.helm;
}

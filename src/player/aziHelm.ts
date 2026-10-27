/**
 * Driving a boat with azimuth drives (the harbour tug) from the desktop's keys and a game
 * controller, at her helm (owner, 27 Oct 2026, "I want my non-VR friends to be able to drive
 * this tug"; his choices from the modular-builder chat's proposal). Plain functions: what the
 * keys and sticks ask of each drive. The app (App.driveAzimuth) sends it as the levers' own
 * intents (`azimuth.demand`, `throttle.demand` and their `2`s), so a VR crew-mate sees the
 * levers move.
 *
 *   Keys: W / S the port drive's power up and down, A / D its twist (A turns its push toward
 *   port, D toward starboard); the arrow keys the same for the starboard drive. Power stops at
 *   idle: astern is twisting the drive round. The levers' own rates (90°/s, half the power a
 *   second) and notches at ahead, abeam and astern (modules/azimuthLevers/lever.ts).
 *   Controller: point and push, the left stick the port drive and the right the starboard: the
 *   way it's pushed is the way the drive pushes (up ahead, right to starboard, back astern),
 *   how far is its power. Let go: idle, the drive kept pointing where it was.
 */
import { CONFIG } from '../config';
import { clamp } from '../core/math';
import { KEY_LEAN, KEY_TURN, snapTo, wrapDeg } from '../modules/azimuthLevers/lever';

/** One drive as asked: its direction (deg, 0 ahead, + to starboard) and power (0 idle .. 1). */
export interface DriveAsk {
  angle: number;
  power: number;
}

/** A drive's keys this frame: power (+1 up, -1 down) and twist (+1 toward starboard, -1 toward port). */
export interface DriveKeys {
  power: number;
  twist: number;
}

/**
 * One drive from its keys: `turn` is its twist before the notches (the lever's own, kept by the
 * caller so a held key turns on through a notch), the returned `angle` its notched direction.
 */
export function stepDriveKeys(turn: number, power: number, keys: DriveKeys, dt: number): { turn: number; angle: number; power: number } {
  const t = wrapDeg(turn + clamp(keys.twist, -1, 1) * KEY_TURN * dt);
  const angle = snapTo(t, CONFIG.modules.azimuth.lever.snapDeg) ?? t;
  return { turn: t, angle, power: clamp(power + clamp(keys.power, -1, 1) * KEY_LEAN * dt, 0, 1) };
}

/**
 * A stick, point and push (x right, y down, the dead zone already out): the way it points is
 * the drive's direction (notched as the lever's), how far its power; null when it's let go.
 */
export function pointAndPush(x: number, y: number): DriveAsk | null {
  const r = Math.hypot(x, y);
  if (r <= 0) return null;
  const deg = (Math.atan2(x, -y) * 180) / Math.PI;
  return { angle: snapTo(deg, CONFIG.modules.azimuth.lever.snapDeg) ?? deg, power: clamp(r, 0, 1) };
}

/**
 * The glance (desktop, held keys): Q over the port shoulder, E over the starboard one, both (or
 * Tab) straight aft. The view's turn from ahead (rad, + to port as the desktop's yaw).
 */
export function glanceYaw(q: boolean, e: boolean, tab: boolean): number {
  const g = CONFIG.aziHelm.glanceDeg * (Math.PI / 180);
  if (tab || (q && e)) return Math.PI;
  return q ? g : e ? -g : 0;
}

/** The keys the azimuth helm takes while you're at it (their usual jobs wait: Q cargo, E engine, T trials ...). */
export const AZI_HELM_CODES = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyX', 'KeyT', 'KeyQ', 'KeyE', 'Tab'];

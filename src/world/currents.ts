/**
 * Tidal races as current zones (the regions brief, section 4). No tide model: each zone's
 * water runs along its set at
 *
 *   u(t) = peak x sin(2 pi (t - phase) / period),   t the game clock (hours)
 *
 * flooding one way on the positive half, ebbing back on the negative, slack at the zero
 * crossings (phase + k x period / 2). Inside the zone (an oriented rectangle, faded in over
 * CONFIG.currents.edgeFade m from its edges) the water's velocity is offset by u along the
 * set: the vessel physics works against the water, so speed through the water stays what
 * the engine gives and speed over the ground is what's left (ocean/waves.ts sampleSurface
 * adds it to every surface sample; world/drift.ts adds it to everything that floats).
 *
 * The clock: setRaceClock(timeOfDay, override) once per tick (the host) and once per frame
 * (every player's views) sets each zone's strength, so the physics, the drift and the
 * drawing all read the same running race. The debug override pins every race at peak or
 * slack (EnvironmentState.raceOverride, Debug → World → Race).
 *
 * Reading the water: inside a running race the waves stand up (raceWaveFactor, applied to
 * the wave amplitude with the shelter factor, on the CPU and in the ocean shader alike), and
 * `knocks` whirl points along the zone push the boat's head and heel as she passes
 * (stepRaceKnocks: a small angular impulse, so the helm has to work; never a capsize).
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import { CURRENTS, type CurrentZoneDef } from './archipelago';
import type { VesselState } from '../vessel/vesselState';

const KN = 0.514444;

export type RaceOverride = 'peak' | 'slack' | undefined;

/** The race's strength now, -1..1 (negative: the ebb, running against the set). */
export function raceFactor(zone: CurrentZoneDef, timeOfDay: number, override?: RaceOverride): number {
  if (override === 'peak') return 1;
  if (override === 'slack') return 0;
  return Math.sin((2 * Math.PI * (timeOfDay - zone.phaseH)) / zone.periodH);
}

/** The zone's set as a unit vector (world x, z). */
export function setVector(zone: CurrentZoneDef): { x: number; z: number } {
  const a = (zone.setDeg * Math.PI) / 180;
  return { x: Math.sin(a), z: -Math.cos(a) };
}

/**
 * How much of the zone (x, z) is in: 1 well inside, fading to 0 at the edges over edgeFade.
 */
export function zoneWeight(zone: CurrentZoneDef, x: number, z: number): number {
  const s = setVector(zone);
  const dx = x - zone.x;
  const dz = z - zone.z;
  const along = dx * s.x + dz * s.z;
  const across = -dx * s.z + dz * s.x;
  const fade = CONFIG.currents.edgeFade;
  const inA = zone.length / 2 - Math.abs(along);
  const inB = zone.width / 2 - Math.abs(across);
  const m = Math.min(inA, inB);
  if (m <= 0) return 0;
  const t = Math.min(1, m / fade);
  return t * t * (3 - 2 * t);
}

/** Slack times in the day (hours, ascending), and the next slack after `timeOfDay`. */
export function slackTimes(zone: CurrentZoneDef): number[] {
  const out: number[] = [];
  const half = zone.periodH / 2;
  for (let t = ((zone.phaseH % half) + half) % half; t < 24; t += half) out.push(t);
  return out;
}
export function nextSlack(zone: CurrentZoneDef, timeOfDay: number): number {
  const half = zone.periodH / 2;
  const base = ((zone.phaseH % half) + half) % half;
  const k = Math.ceil((timeOfDay - base) / half + 1e-9);
  return (base + k * half) % 24;
}

// ── The clock ──────────────────────────────────────────────────────────────────

/** Each zone's signed strength now (-1..1), set by setRaceClock. */
const strength: number[] = CURRENTS.map(() => 0);
let clockTime = CONFIG.environment.startTimeOfDay;

/** Set every race's strength from the game clock (host: each tick; views: each frame). */
export function setRaceClock(timeOfDay: number, override?: RaceOverride): void {
  clockTime = timeOfDay;
  for (let i = 0; i < CURRENTS.length; i++) strength[i] = raceFactor(CURRENTS[i], timeOfDay, override);
}
export function raceClockTime(): number {
  return clockTime;
}
/** The zone's strength now, as set by the clock. */
export function raceStrength(zone: CurrentZoneDef): number {
  const i = CURRENTS.indexOf(zone);
  return i < 0 ? 0 : strength[i];
}

/**
 * The current at (x, z) now (m/s, world x, z), added into `out`. Returns the strongest
 * zone's weight there (0 outside every zone), for the callers that want to know.
 */
export function addCurrent(x: number, z: number, out: { x: number; z: number }): number {
  let best = 0;
  for (let i = 0; i < CURRENTS.length; i++) {
    const zn = CURRENTS[i];
    const reach = Math.hypot(zn.length, zn.width) / 2;
    if (Math.abs(x - zn.x) > reach || Math.abs(z - zn.z) > reach) continue;
    const w = zoneWeight(zn, x, z);
    if (w <= 0) continue;
    const s = setVector(zn);
    const u = zn.peakKn * KN * strength[i] * w;
    out.x += s.x * u;
    out.z += s.z * u;
    best = Math.max(best, w);
  }
  return best;
}

/** The current's speed at (x, z) now (kn), for readouts. */
export function currentKnAt(x: number, z: number): number {
  const v = { x: 0, z: 0 };
  addCurrent(x, z, v);
  return Math.hypot(v.x, v.z) / KN;
}

/**
 * The wave amplitude multiplier at rest position (x0, z0) from the races: the waves stand
 * up inside a running one, waveFactor x at full strength. Multiplied with the shelter factor
 * (ocean/waves.ts and gerstner.glsl, the same formula).
 */
export function raceWaveFactor(x0: number, z0: number): number {
  let f = 1;
  for (let i = 0; i < CURRENTS.length; i++) {
    const zn = CURRENTS[i];
    const reach = Math.hypot(zn.length, zn.width) / 2;
    if (Math.abs(x0 - zn.x) > reach || Math.abs(z0 - zn.z) > reach) continue;
    const w = zoneWeight(zn, x0, z0);
    if (w <= 0) continue;
    f = Math.max(f, 1 + (zn.waveFactor - 1) * Math.abs(strength[i]) * w);
  }
  return f;
}

// ── Whirl points ───────────────────────────────────────────────────────────────

export interface KnockPoint {
  x: number;
  z: number;
  /** +1 turns the head to starboard, -1 to port. */
  turn: number;
}

/** The zone's whirl points: spaced along its length, staggered across it, turning alternately. */
export function knockPoints(zone: CurrentZoneDef): KnockPoint[] {
  const s = setVector(zone);
  const out: KnockPoint[] = [];
  for (let i = 0; i < zone.knocks; i++) {
    const along = ((i + 0.5) / zone.knocks - 0.5) * zone.length * 0.8;
    const across = (i % 2 === 0 ? 1 : -1) * zone.width * 0.18;
    out.push({ x: zone.x + s.x * along - s.z * across, z: zone.z + s.z * along + s.x * across, turn: i % 2 === 0 ? 1 : -1 });
  }
  return out;
}

const fwd = new THREE.Vector3();
const q = new THREE.Quaternion();

/**
 * The whirl points' push on a boat (host, each tick): within `knock.radius` of one, a yaw
 * and a heel angular impulse, strongest at the point's middle and at peak, each point
 * turning its own way and swinging slowly with time so no two passes are alike. Added to
 * the angular velocity (world axes: yaw about up, heel about her own fore-and-aft line).
 */
export function stepRaceKnocks(v: VesselState, time: number, dt: number): void {
  const c = CONFIG.currents.knock;
  for (let i = 0; i < CURRENTS.length; i++) {
    const zn = CURRENTS[i];
    const f = Math.abs(strength[i]);
    if (f < 0.05) continue;
    const reach = Math.hypot(zn.length, zn.width) / 2 + c.radius;
    if (Math.abs(v.position[0] - zn.x) > reach || Math.abs(v.position[2] - zn.z) > reach) continue;
    knockPoints(zn).forEach((k, j) => {
      const d = Math.hypot(v.position[0] - k.x, v.position[2] - k.z);
      if (d >= c.radius) return;
      const bump = 1 - d / c.radius;
      const swing = Math.sin(time * 0.6 + j * 2.1);
      const yaw = k.turn * c.yaw * f * bump * (0.6 + 0.4 * swing);
      const roll = c.roll * f * bump * Math.sin(time * 1.3 + j);
      q.fromArray(v.orientation);
      fwd.set(0, 0, -1).applyQuaternion(q);
      // Yaw: about the world's up (to starboard = clockwise seen from above = -y).
      v.angularVelocity[1] -= yaw * dt;
      // Heel: about her own fore-and-aft axis.
      v.angularVelocity[0] += fwd.x * roll * dt;
      v.angularVelocity[1] += fwd.y * roll * dt;
      v.angularVelocity[2] += fwd.z * roll * dt;
    });
  }
}

/**
 * How loud the races are where you are, 0..1: the strongest running race's strength inside
 * it, fading to nothing CONFIG.currents.roar.hearRange m outside its edges.
 */
export function raceRoarLevel(x: number, z: number): number {
  const range = CONFIG.currents.roar.hearRange;
  let level = 0;
  for (let i = 0; i < CURRENTS.length; i++) {
    const zn = CURRENTS[i];
    const f = Math.abs(strength[i]);
    if (f < 0.02) continue;
    const s = setVector(zn);
    const dx = x - zn.x;
    const dz = z - zn.z;
    const along = Math.abs(dx * s.x + dz * s.z) - zn.length / 2;
    const across = Math.abs(-dx * s.z + dz * s.x) - zn.width / 2;
    const outside = Math.hypot(Math.max(0, along), Math.max(0, across));
    if (outside >= range) continue;
    level = Math.max(level, f * (1 - outside / range));
  }
  return level;
}

/** For the plotter and the forecast: a short reading of the race now. */
export function raceReading(zone: CurrentZoneDef, timeOfDay: number, override?: RaceOverride): { kn: number; dirDeg: number; slack: boolean; nextSlackH: number } {
  const f = raceFactor(zone, timeOfDay, override);
  const kn = Math.abs(f) * zone.peakKn;
  return { kn, dirDeg: f >= 0 ? zone.setDeg : (zone.setDeg + 180) % 360, slack: kn < CONFIG.currents.slackBelowKn, nextSlackH: nextSlack(zone, timeOfDay) };
}

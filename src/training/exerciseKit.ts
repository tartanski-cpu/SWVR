/**
 * What every Training exercise is built from (exercises.ts, harbourCourse.ts, rescueCourse.ts):
 * its shape, the measures it judges by, and the setting up (the boat placed, the wind, the
 * light). World axes: +X east, -Z north; a heading is degrees true, 0 north, clockwise.
 */
import { CONFIG } from '../config';
import { moorAtBerth, type WorldState } from '../core/world';
import { setManualWeather, setWeatherPreset } from '../environment/weather';
import { seaScaleFor } from '../world/coastWeather';
import { berthWithId } from '../world/berths';
import { quickStart } from '../vessel/autopilot';
import { placeVessel } from '../vessel/vesselControl';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import type { TrainingState } from './training';

/** One knot in m/s. */
export const KN = 1852 / 3600;

export interface Ctx {
  world: WorldState;
  /** The boat being judged (the home boat, or the exercise's small boat). */
  v: VesselState;
  t: TrainingState;
  /** The attempt's own measurements (TrainingState.data). */
  d: Record<string, number>;
}

export interface StepDef {
  /** The duty board's line. */
  text: string;
  /** What the instructor says over the VHF as it comes up (worked out then, if it depends on the moment). */
  say: string | ((c: Ctx) => string);
  /** As it comes up (after its words go out): a measurement to start, the boat to put back. */
  enter?(c: Ctx): void;
  done(c: Ctx): boolean;
  /** A question's three answers (C7): shown on the Training tab while this step is on; the trainee's pick is `onAnswer`'s. */
  choices?: string[];
}

export interface ExerciseDef {
  id: string;
  /** Its number in the plan's course tables (H Harbour practice, R Rescue practice). */
  code: string;
  name: string;
  /** Which course it's in (the Training tab's sections). */
  course: 'harbour' | 'rescue' | 'coast';
  /** The syllabus items it practises (shown on the Training tab). */
  practises: string;
  /** The first words over the VHF. */
  brief: string;
  /** Its speed limit (kn) where it isn't the harbour's (CONFIG.training.harbourKn). */
  capKn?: number;
  /** Time allowed for the attempt (s). */
  limitS: number;
  /** A small boat to do it in instead of the home boat (a vessel type: 'skiff'). */
  boat?: string;
  /** Gear the boat must have, said if she hasn't (e.g. "a fire monitor: the pilot boat has one"), else null. */
  needs?(v: VesselState): string | null;
  setup(world: WorldState, v: VesselState): void;
  steps: StepDef[];
  /** Every tick while it runs: measurements, and a fault of its own if there is one. */
  watch?(c: Ctx): { kind: string; weight: number; text: string } | null;
  verdict(c: Ctx): { passed: boolean; reason: string };
  /** The numbers on the card. */
  numbers(c: Ctx): [string, string][];
  /** A bearing taken through the binoculars (deg true) from (x, z) (C3; binoculars.ts). */
  onBearing?(c: Ctx, deg: number, x: number, z: number): void;
  /** A position marked on the paper chart with a pot marker (C3). */
  onFix?(c: Ctx, x: number, z: number): void;
  /** An answer picked on the Training tab (the step's `choices` index). */
  onAnswer?(c: Ctx, choice: number): void;
}

// ── The harbour's places (world/regions/training.ts) ──

/** The quay face's line (z): boats alongside lie 2.5 m north of it. */
export const FACE = 200;
/** The stopping lane between the four yellow marks (H5). */
export const LANE = { x0: -140, x1: 140, z0: 40, z1: 70 };
/** The dock (H6): inside its walls, and its mouth's line. */
export const DOCK = { x0: 62.5, x1: 92.5, mouth: 168 };
/** The breakwater's entrance line (z): north of it is outside. */
export const ENTRANCE_Z = -80;

// ── Measures ──

/** Her speed over the ground (kn). */
export function speedKn(v: VesselState): number {
  return Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) / KN;
}

/** Her heading (deg true). */
export function heading(v: VesselState): number {
  const [qx, qy, qz, qw] = v.orientation;
  return ((Math.atan2(-(2 * (qx * qz + qw * qy)), 1 - 2 * (qx * qx + qy * qy)) * 180) / Math.PI + 360) % 360;
}

/** The smallest turn from heading `b` to `a` (deg, -180..180). */
export function turnFrom(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/** Her speed along her own heading (kn; negative going astern). */
export function aheadKn(v: VesselState): number {
  const h = (heading(v) * Math.PI) / 180;
  return (v.linearVelocity[0] * Math.sin(h) - v.linearVelocity[2] * Math.cos(h)) / KN;
}

/** The bearing (deg true) from one point to another. */
export function bearingTo(fx: number, fz: number, tx: number, tz: number): number {
  return ((Math.atan2(tx - fx, -(tz - fz)) * 180) / Math.PI + 360) % 360;
}

export const lengthOf = (v: VesselState) => VESSEL_DEFS[v.defId]?.hull.params.length ?? 10;
export const inLane = (v: VesselState) => v.position[0] >= LANE.x0 && v.position[0] <= LANE.x1 && v.position[2] >= LANE.z0 && v.position[2] <= LANE.z1;
export const stopped = (v: VesselState) => speedKn(v) < CONFIG.training.stoppedKn;
export const fmt = (n: number | undefined, unit: string, dp = 1) => (n === undefined || !Number.isFinite(n) ? 'not reached' : `${n.toFixed(dp)}${unit === '°' ? '' : ' '}${unit}`);
export const cfg = () => CONFIG.training;
/** Where her bow is (world x, z). */
export function bowPoint(v: VesselState): { x: number; z: number } {
  const h = (heading(v) * Math.PI) / 180;
  const half = lengthOf(v) / 2;
  return { x: v.position[0] + Math.sin(h) * half, z: v.position[2] - Math.cos(h) * half };
}
/** Her motor running (a diesel, or an outboard switched on). */
export const motorOn = (v: VesselState) => v.engine.phase === 'running' || !!v.controls.obOn;
/** In gear (a diesel's gearbox, an outboard's gear lever). */
export const inGear = (v: VesselState) => v.engine.gear !== 0 || (!!v.controls.obOn && !!v.controls.obGear);

// ── Setting up ──

/** Afloat and free at (x, z), stopped, heading `hdg`, the lever in neutral and the wheel amidships. */
export function placeFree(v: VesselState, x: number, z: number, hdg: number): void {
  placeVessel(v, x, 0, z, hdg);
  v.mooring = { phase: 'free', berthId: null, reversed: false, t: 0 };
  ready(v);
}

/** Alongside a named berth, moored, lines fast. */
export function placeAt(v: VesselState, berthId: string): void {
  const b = berthWithId(berthId);
  if (b) moorAtBerth(v, b);
  ready(v);
}

/**
 * Anchor up, no spring or buoy, the controls at rest, nothing wrong with her (a fault seeded
 * by the last exercise mended), and her engine started (it catches in a second or two). A
 * small boat's motor is the trainee's to start (her kill cord first).
 */
export function ready(v: VesselState): void {
  v.anchor = { phase: 'stowed', x: 0, z: 0, rodeM: 0, tension: 0, dragging: false };
  v.controls.anchor = 0;
  delete v.mooring.spring;
  delete v.mooring.buoy;
  v.controls.lever = 0;
  if (v.controls.lever2 !== undefined) v.controls.lever2 = 0;
  v.controls.helm = 0;
  v.controls.autopilot = 0;
  v.controls.horn = 0;
  v.refuelling = false;
  v.engine.coolingFault = false;
  v.engine.coolantC = Math.min(v.engine.coolantC, 80);
  v.engine.oilC = Math.min(v.engine.oilC, 80);
  delete v.killCord;
  v.controls.obOn = 0;
  quickStart(v);
}

/** Cold and dark: master off, breakers off, engine off (H1). */
export function coldAndDark(v: VesselState): void {
  v.engine.phase = 'off';
  v.engine.key = 0;
  v.engine.rpm = 0;
  if (v.electrics) {
    v.electrics.master = 0;
    for (const k of Object.keys(v.electrics.breakers) as (keyof typeof v.electrics.breakers)[]) v.electrics.breakers[k] = 0;
  }
}

/** The wind for the exercise (kn, from deg), a flat sea in the harbour, a clear sky; daylight unless `hour` says. */
export function setWind(world: WorldState, kn: number, from: number, hour?: number): void {
  const env = world.environment;
  const hs = 0.1;
  setManualWeather(env, { wind: kn * KN, windFrom: from, rain: 0, hs }, world.time, seaScaleFor(hs));
  if (hour !== undefined) env.timeOfDay = hour;
  else if (env.timeOfDay < 8 || env.timeOfDay > 18) env.timeOfDay = 11;
}

/** Thick fog, held (R5, R7): the game's Fog (CONFIG.weather.presets.Fog), daylight. */
export function setFog(world: WorldState): void {
  const env = world.environment;
  if (!env.weather) return;
  setWeatherPreset(env.weather, 'Fog', world.time, true, env);
  env.weather.fixed = true;
  if (env.timeOfDay < 8 || env.timeOfDay > 17) env.timeOfDay = 11;
}

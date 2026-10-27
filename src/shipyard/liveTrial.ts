/**
 * Live sea trials on the Shipyard page (owner, Oct 2026): the game's own physics, run in
 * front of you on her as designed, so you can see how the hull behaves rather than only read
 * the numbers. Three tests, each in calm, deep water:
 *
 *   drop     lifted (CONFIG drop height, a little heeled and trimmed, as the game's "Drop"
 *            test does) and let go: she falls in, plunges, and heaves and rolls back to
 *            rest. Shows her heave and pitch damping, and whether she rights herself.
 *   roll     heeled (CONFIG roll angle: 45°) and let go: the free roll decay. Her roll period
 *            (from the peaks) and damping (the logarithmic decrement), or that she didn't
 *            come back.
 *   incline  the inclining experiment: a known weight (a share of her displacement) is
 *            moved across her deck; she heels to a steady angle, and GM = w·d / (Δ·tan φ).
 *            As in the trial's own inclining test (seaTrials.ts), the weight's shift acts as
 *            a heeling couple, so her displacement and centre of gravity are unchanged.
 *
 * Simulation only (plain world state, no drawing): the page moves her model from it.
 *
 * Her stability as she heels (owner, 27 Oct 2026: the roll and the inclining experiment
 * "should show the GZ and GM"; `stabilityOf`): from the physics' own buoyancy, station by
 * station, each tick. B, her centre of buoyancy, is the stations' immersed centroids weighted
 * by their buoyant force; the buoyancy acts straight up through B. GZ, her righting lever, is
 * the horizontal distance from G (her centre of gravity) to that line, + when it rights her.
 * M, the metacentre, is where that line crosses her centreline (at small angles the true
 * metacentre, GM = GZ / sin φ; at large ones a "false" one, shown only for the picture).
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import { IdFactory } from '../core/ids';
import { stepWorld, type SimDebug } from '../core/simulation';
import type { HydroDebug } from '../vessel/physics/vesselPhysics';
import { createWorld, type WorldState } from '../core/world';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { placeVessel } from '../vessel/vesselControl';

export type LiveTest = 'drop' | 'roll' | 'incline';

const DT = 1 / 60;

/** One moment of a test, for the readout and its chart. */
export interface LiveSample {
  t: number;
  /** Heel (deg, + to starboard), trim (deg, + bow up), heave (m above her rest). */
  heelDeg: number;
  trimDeg: number;
  heaveM: number;
}

export class LiveTrial {
  readonly world: WorldState;
  readonly v: VesselState;
  /** Seconds since the test began. */
  t = 0;
  readonly samples: LiveSample[] = [];
  /** The physics' own readings each step (the game's debug overlay: buoyancy by station, immersed volume). */
  readonly debug: SimDebug = new Map();
  /** Where she floats at rest (her position's height), from settling her first. */
  readonly restY: number;
  /** The inclining weight's position across her (0 centreline .. 1 at the full shift). */
  shift = 0;
  /** The weight (kg) and how far it's moved across (m), for the inclining test. */
  readonly weightKg: number;
  readonly shiftM: number;
  private acc = 0;
  private readonly q = new THREE.Quaternion();
  private readonly f = new THREE.Vector3();

  constructor(readonly test: LiveTest, defId = 'design') {
    const { world, vesselId } = createWorld(new IdFactory(), defId);
    world.environment.waves = []; // calm water
    world.geography = 'openSea'; // deep water: it's about the hull
    this.world = world;
    this.v = world.vessels[vesselId];
    placeVessel(this.v, 0, 0, 0, 0);
    // Let her settle to rest before the test.
    for (let i = 0; i < Math.round(CONFIG.shipyard.live.settleS / DT); i++) stepWorld(world, [], DT);
    this.restY = this.v.position[1];
    const def = VESSEL_DEFS[defId];
    this.weightKg = Math.round(def.mass * CONFIG.shipyard.live.inclineShare);
    const beam = 2 * Math.max(...def.hull.stations.map((s) => s.halfBeamDeck));
    this.shiftM = Math.round(beam * CONFIG.shipyard.live.inclineBeamShare * 100) / 100;
    const L = CONFIG.shipyard.live;
    if (test === 'drop') placeVessel(this.v, 0, this.restY + L.dropM, 0, 0, L.dropHeelDeg, L.dropTrimDeg);
    if (test === 'roll') placeVessel(this.v, 0, this.restY, 0, 0, L.rollDeg);
    this.v.linearVelocity = [0, 0, 0];
    this.v.angularVelocity = [0, 0, 0];
    this.sample();
  }

  /** How long the test runs (s). */
  get duration(): number {
    return CONFIG.shipyard.live.seconds[this.test];
  }
  get done(): boolean {
    return this.t >= this.duration;
  }

  /** Advance by `dt` of real time (in the simulation's fixed steps). */
  advance(dt: number): void {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= DT && !this.done) {
      this.acc -= DT;
      if (this.test === 'incline') this.heelingCouple();
      stepWorld(this.world, [], DT, this.debug);
      this.t += DT;
      this.sample();
    }
  }

  /**
   * The inclining weight: moved across over the first part of the test, held, and its
   * moment (w·g·d, growing as it moves) applied about her fore-and-aft axis.
   */
  private heelingCouple(): void {
    const L = CONFIG.shipyard.live;
    this.shift = Math.min(1, Math.max(0, (this.t - L.inclineStartS) / L.inclineMoveS));
    const moment = this.weightKg * 9.81 * this.shiftM * this.shift; // N·m
    const def = VESSEL_DEFS[this.v.defId];
    this.q.fromArray(this.v.orientation);
    const axis = new THREE.Vector3(0, 0, -1).applyQuaternion(this.q); // + heels her to starboard
    const dw = (moment * DT) / (def.inertia[2] * (1 + def.addedAngular[2]));
    const w = this.v.angularVelocity;
    this.v.angularVelocity = [w[0] + axis.x * dw, w[1] + axis.y * dw, w[2] + axis.z * dw];
  }

  private sample(): void {
    this.q.fromArray(this.v.orientation);
    this.f.set(1, 0, 0).applyQuaternion(this.q);
    const heelDeg = (-Math.asin(this.f.y) * 180) / Math.PI;
    this.f.set(0, 0, -1).applyQuaternion(this.q);
    const trimDeg = (Math.asin(this.f.y) * 180) / Math.PI;
    this.samples.push({ t: this.t, heelDeg, trimDeg, heaveM: this.v.position[1] - this.restY });
  }

  /** What the test found so far, in a line or two (null until there's something to say). */
  result(): string | null {
    const s = this.samples;
    if (this.test === 'incline') {
      const L = CONFIG.shipyard.live;
      if (this.t < L.inclineStartS + L.inclineMoveS + 2) return null;
      // The steady heel: the mean of the last two seconds.
      const tail = s.filter((x) => x.t > this.t - 2);
      const phi = tail.reduce((a, x) => a + x.heelDeg, 0) / tail.length;
      const gm = (this.weightKg * this.shiftM) / (VESSEL_DEFS[this.v.defId].mass * Math.tan((Math.abs(phi) * Math.PI) / 180));
      return `${(this.weightKg / 1000).toFixed(2)} t moved ${this.shiftM.toFixed(2)} m across: steady heel ${Math.abs(phi).toFixed(2)}°, so GM = w·d / (Δ·tan φ) = ${gm.toFixed(2)} m`;
    }
    const key = this.test === 'roll' ? 'heelDeg' : 'heaveM';
    const peaks = peaksOf(s.map((x) => x[key]), this.test === 'roll' ? 0.2 : 0.02).filter((p) => p.i > 0);
    if (peaks.length < 3) return null;
    const period = (2 * (s[peaks[peaks.length - 1].i].t - s[peaks[0].i].t)) / (peaks.length - 1);
    if (this.test === 'roll') {
      const last = Math.abs(s[s.length - 1].heelDeg);
      if (this.done && last > 30) return `She didn't come back: lying at ${last.toFixed(0)}° after ${this.duration} s`;
      const delta = Math.log(Math.abs(peaks[0].v) / Math.abs(peaks[2].v));
      const zeta = delta / Math.sqrt(4 * Math.PI * Math.PI + delta * delta);
      return `Roll period ${period.toFixed(1)} s; damping ${(zeta * 100).toFixed(0)} % of critical (from the peaks: ${peaks.slice(0, 4).map((p) => `${Math.abs(p.v).toFixed(1)}°`).join(', ')})`;
    }
    const maxHeel = Math.max(...s.map((x) => Math.abs(x.heelDeg)));
    const settled = Math.abs(s[s.length - 1].heaveM) < 0.03 && Math.abs(s[s.length - 1].heelDeg) < 1;
    return `Heave period ${period.toFixed(1)} s; plunged ${Math.abs(Math.min(...s.map((x) => x.heaveM))).toFixed(2)} m below her waterline; heeled up to ${maxHeel.toFixed(1)}°${settled ? '; back at rest' : ''}`;
  }
}

/** Her stability now (boat axes, x starboard, y up, z aft): G, B, Z (the foot of GZ on the buoyancy's line), M, world up, and GZ (m, + righting). */
export interface Stability {
  g: [number, number, number];
  b: [number, number, number];
  z: [number, number, number];
  m: [number, number, number] | null;
  up: [number, number, number];
  gzM: number;
}

/**
 * Her stability from one tick of the physics' buoyancy (see above), G at `cg` (boat axes),
 * heeled `heelDeg` (+ to starboard; the sign of a righting GZ). Null with nothing immersed.
 */
export function stabilityOf(h: HydroDebug, cg: readonly number[], heelDeg: number): Stability | null {
  let sum = 0;
  const b = [0, 0, 0];
  for (const s of h.stations) {
    sum += s.force;
    b[0] += s.force * s.x;
    b[1] += s.force * s.y;
    b[2] += s.force * s.z;
  }
  if (sum <= 0) return null;
  const B: [number, number, number] = [b[0] / sum, b[1] / sum, b[2] / sum];
  const u = h.upLocal;
  // Z: G's foot on the line up through B; GZ is G to Z, across her (its fore-and-aft part left out).
  const d = [cg[0] - B[0], cg[1] - B[1], cg[2] - B[2]];
  const along = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
  const Z: [number, number, number] = [B[0] + along * u[0], B[1] + along * u[1], cg[2]];
  // Signed in the athwartships plane: + when B lies on the low side of G (she rights herself).
  const cross = (B[0] - cg[0]) * u[1] - (B[1] - cg[1]) * u[0];
  const gzM = Math.abs(heelDeg) < 1e-6 ? 0 : cross * Math.sign(heelDeg);
  // M: the buoyancy's line across her centreline (none when she's upright: it runs along it).
  const m: [number, number, number] | null = Math.abs(u[0]) > 0.01 ? [0, B[1] - (B[0] / u[0]) * u[1], B[2]] : null;
  return { g: [cg[0], cg[1], cg[2]], b: B, z: Z, m, up: [u[0], u[1], u[2]], gzM };
}

/** The peaks (either way) of a series that has started swinging: index and value. */
function peaksOf(series: number[], least: number): { i: number; v: number }[] {
  const out: { i: number; v: number }[] = [];
  for (let i = 1; i < series.length - 1; i++) {
    const a = Math.abs(series[i]);
    if (a > least && a > Math.abs(series[i - 1]) && a >= Math.abs(series[i + 1]) && Math.sign(series[i]) !== Math.sign(out[out.length - 1]?.v ?? 0)) out.push({ i, v: series[i] });
  }
  return out;
}

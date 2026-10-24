/**
 * Crew transfer to the wind farm (owner, Oct 2026; stop 2 of "crew transfer to wind farms").
 * Plain shared state (WorldState.transfer), stepped by the host like the salvage and the tows;
 * the view (transfer/transferView.ts) only draws it.
 *
 *   a job       now and then (CONFIG.transfer.every) the wind farm's office radios for a crew
 *               boat: `techs` technicians for one turbine, waiting on the quay at the pickup
 *               port (`pickup`). One job at a time.
 *   boarding    a boat made fast at a berth in that port takes them aboard, one at a time,
 *               each to a seat on her deck (her rescue seats: VesselDef.rescueGear).
 *   on the      a boat is "on the landing" of a turbine while her bow is pushed against its
 *   landing     tubes (landedOn: her bow within `landing.reach` of the landing's face, barely
 *               moving, pushing at least `landing.minPush` on her bow fender or her stem). The
 *               state keeps, every tick, which boat is on which landing (`landed`): the
 *               players' gangway mark reads it (player/gangway.ts, "Step across").
 *   crossing    held there `landing.hold` s, the first technician steps across onto the
 *               ladder; each of the others after `landing.perTech` s more. Come off the
 *               landing and the count starts again (nobody steps across a gap). Each climbs
 *               the ladder to the platform (`climb` m/s) and stands there.
 *   pay         all of them up: the job is done and paid (career.ts 'transfer', credited to the
 *               pickup port), and the next is called a while later. The technicians stay on
 *               the platform, working, until then.
 *
 * Off unless the game switches it on (createTransferState(true)); tests raise jobs by hand.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Vec3 } from '../core/math';
import { homeVessel, type WorldState } from '../core/world';
import { gearOf } from '../boats/sims';
import { earn } from '../career/career';
import { sayRadio } from '../rescue/rescue';
import { vesselToWorld } from '../rescue/recovery';
import { hullPlan } from '../vessel/layout';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import type { Intent } from '../core/intents';
import { placeVessel } from '../vessel/vesselControl';
import { WIND_FARMS } from '../world/archipelago';
import { berthWithId } from '../world/berths';
import { landingAxis, landingFace } from '../world/windFarm';

export interface Technician {
  id: string;
  /** On the quay, sitting aboard, stepping across, on the ladder, on the platform. */
  phase: 'quay' | 'aboard' | 'crossing' | 'climbing' | 'platform';
  /** Seconds in this phase. */
  t: number;
  /** Aboard: where they sit (vessel axes). */
  seat?: Vec3;
  /** Crossing and climbing: the height (world y) they stepped across at (her bow's deck). */
  from?: number;
}

export interface TransferJob {
  id: string;
  /** The turbine: its farm's and its own index (WIND_FARMS). */
  farm: number;
  turbine: number;
  techs: Technician[];
  /** The boat they're aboard (once the first has boarded). */
  vesselId?: string;
  /** Seconds she's been held on the right landing (the crossing count). */
  hold: number;
  /** Told off for the wrong turbine already (said once a time). */
  wrongTold?: boolean;
  done?: boolean;
}

export interface TransferState {
  /** Jobs come by themselves (the game); tests raise them with raiseTransfer. */
  spawn: boolean;
  nextAt: number | null;
  job: TransferJob | null;
  /** Which landing each boat is on this tick: vessel id -> "farm:turbine". */
  landed: Record<string, string>;
  /** Jobs raised (ids). */
  n: number;
}

export function createTransferState(spawn = false): TransferState {
  return { spawn, nextAt: null, job: null, landed: {}, n: 0 };
}

/** A turbine's name as the radio and the chart give it: "Holm Rig turbine 2". */
export function turbineName(farm: number, turbine: number): string {
  const f = WIND_FARMS[farm];
  return `${f ? f.name.replace(/ wind farm$/, '') : 'the wind farm'} turbine ${turbine + 1}`;
}

/** Where the technicians wait on the quay (world x, z), the k-th of them, and which way they face (deg, as a player's yaw). */
export function quayPlace(k: number): { x: number; z: number; yawDeg: number } {
  const p = CONFIG.transfer.pickup;
  return { x: p.x, z: p.z + (k - 1) * p.spacing, yawDeg: p.yawDeg };
}

const bow = new THREE.Vector3();

/**
 * Which turbine's landing a boat is on, or null: her bow (her bow fender's face, else her stem
 * at the deck) within `reach` of a landing's face, barely moving over the ground, and pushing
 * at least `minPush` on it (her fender's force, or her hull's).
 */
export function landedOn(v: VesselState): { farm: number; turbine: number } | null {
  const c = CONFIG.transfer.landing;
  const def = VESSEL_DEFS[v.defId];
  if (!def) return null;
  if (Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) > c.maxSpeed) return null;
  if ((v.contact?.guardForce ?? 0) + (v.contact?.force ?? 0) < c.minPush) return null;
  const probes = gearOf(v, 'pushFender')?.probes;
  const plan = hullPlan(def);
  const local: Vec3 = probes?.length
    ? [probes.reduce((a, p) => a + p[0], 0) / probes.length, probes.reduce((a, p) => a + p[1], 0) / probes.length, Math.min(...probes.map((p) => p[2]))]
    : [0, plan.deckY(plan.stem), plan.stem];
  vesselToWorld(v, local, bow);
  for (let f = 0; f < WIND_FARMS.length; f++) {
    const ts = WIND_FARMS[f].turbines;
    for (let i = 0; i < ts.length; i++) {
      const face = landingFace(ts[i]);
      const { ax, az } = landingAxis(ts[i].landingDeg);
      const dx = bow.x - face.x;
      const dz = bow.z - face.z;
      // Out from the face (along its bearing), and across it.
      const out = dx * ax + dz * az;
      const across = -dx * az + dz * ax;
      if (out > -0.3 && out < c.reach && Math.abs(across) < face.halfWidth + c.across) return { farm: f, turbine: i };
    }
  }
  return null;
}

/** Raise a job now (the game's own clock does it otherwise): `techs` technicians for that turbine. */
export function raiseTransfer(world: WorldState, farm: number, turbine: number, techs: number): TransferJob | null {
  const s = (world.transfer ??= createTransferState());
  if (s.job && !s.job.done) return null;
  if (!WIND_FARMS[farm]?.turbines[turbine]) return null;
  const id = `tr${++s.n}`;
  s.job = { id, farm, turbine, hold: 0, techs: Array.from({ length: techs }, (_, k) => ({ id: `${id}-${k}`, phase: 'quay', t: 0 })) };
  const port = CONFIG.transfer.pickupPort;
  sayRadio(world, 'info', `${WIND_FARMS[farm].name.replace(/ wind farm$/, '')} to any crew boat: ${techs} technicians for ${turbineName(farm, turbine)}, waiting on the quay at ${portLabel(port)}. Make fast there to take them out; put your bow on the turbine's landing and hold her there for them to step across.`);
  return s.job;
}

const portLabel = (id: string) => (id === 'calder' ? 'Calder Haven' : id);

/** A small deterministic random from the job count (so every machine agrees). */
function rand(s: TransferState): number {
  const v = Math.sin((s.n + 1) * 91.7 + 13.1) * 43758.5453;
  return v - Math.floor(v);
}

/** Her free seat for the next technician aboard (her rescue seats, else where you board her). */
function seatFor(v: VesselState, taken: number): Vec3 {
  const def = VESSEL_DEFS[v.defId];
  const seats = def.rescueGear?.seats;
  const plan = hullPlan(def);
  if (seats?.length) {
    const [x, z] = seats[Math.min(taken, seats.length - 1)];
    // (More than her seats: the last seat's neighbours, along her.)
    const extra = Math.max(0, taken - seats.length + 1) * 0.6;
    return [x, plan.deckY(z + extra), z + extra];
  }
  const b = def.boardingSpot;
  return [b[0] + (taken - 1) * 0.6, b[1], b[2]];
}

/** One tick: jobs called, technicians boarding and crossing, boats on the landings. */
export function stepTransfer(world: WorldState, dt: number): void {
  const s = (world.transfer ??= createTransferState());
  const c = CONFIG.transfer;
  // Which boat is on which landing (every boat: the players' gangway mark reads it too).
  s.landed = {};
  for (const v of Object.values(world.vessels)) {
    const on = landedOn(v);
    if (on) s.landed[v.id] = `${on.farm}:${on.turbine}`;
  }
  // A job now and then (the game), for a turbine of the home region's farm.
  if (s.spawn && WIND_FARMS.length && homeVessel(world)) {
    if (s.nextAt === null) s.nextAt = world.time + c.firstAfter;
    if (world.time >= s.nextAt && (!s.job || s.job.done)) {
      const farm = 0;
      const n = WIND_FARMS[farm].turbines.length;
      const turbine = Math.min(n - 1, Math.floor(rand(s) * n));
      const techs = c.techs[0] + Math.floor(rand(s) * (c.techs[1] - c.techs[0] + 1));
      raiseTransfer(world, farm, turbine, techs);
      s.nextAt = world.time + c.every[0] + rand(s) * (c.every[1] - c.every[0]);
    }
  }
  const job = s.job;
  if (!job || job.done) return;
  for (const tech of job.techs) tech.t += dt;
  // Boarding: a boat made fast at a berth in the pickup port takes those on the quay, one every `boardEvery` s.
  const onQuay = job.techs.filter((t) => t.phase === 'quay');
  if (onQuay.length) {
    const boat = job.vesselId ? world.vessels[job.vesselId] : Object.values(world.vessels).find((v) => v.mooring.phase === 'moored' && berthWithId(v.mooring.berthId ?? '')?.portId === c.pickupPort && !VESSEL_DEFS[v.defId]?.tow);
    const moored = boat && boat.mooring.phase === 'moored' && berthWithId(boat.mooring.berthId ?? '')?.portId === c.pickupPort;
    if (boat && moored && onQuay[0].t >= c.boardEvery) {
      const aboard = job.techs.filter((t) => t.phase !== 'quay').length;
      const tech = onQuay[0];
      tech.phase = 'aboard';
      tech.t = 0;
      tech.seat = seatFor(boat, aboard);
      job.vesselId = boat.id;
      // The next one waits their turn.
      for (const o of onQuay.slice(1)) o.t = 0;
      if (onQuay.length === 1) sayRadio(world, 'info', `${portLabel(c.pickupPort)}: all ${job.techs.length} technicians aboard for ${turbineName(job.farm, job.turbine)}. Safe trip.`);
    }
  }
  // At the turbine: held on its landing, they step across one by one.
  const boat = job.vesselId ? world.vessels[job.vesselId] : undefined;
  const on = boat ? s.landed[boat.id] : undefined;
  if (boat && on === `${job.farm}:${job.turbine}`) {
    job.hold += dt;
    job.wrongTold = false;
    const next = job.techs.find((t) => t.phase === 'aboard');
    if (next && job.hold >= c.landing.hold) {
      // (Her bow's deck: where they step off.)
      const plan = hullPlan(VESSEL_DEFS[boat.defId]);
      next.from = vesselToWorld(boat, [0, plan.deckY(plan.stem), plan.stem]).y;
      next.phase = 'crossing';
      next.t = 0;
      job.hold = c.landing.hold - c.landing.perTech;
    }
  } else {
    job.hold = 0;
    if (boat && on && !job.wrongTold) {
      const [f, t] = on.split(':').map(Number);
      sayRadio(world, 'info', `Technicians: that's ${turbineName(f, t)}. We're for ${turbineName(job.farm, job.turbine)}.`);
      job.wrongTold = true;
    }
  }
  // Across, up the ladder, onto the platform.
  for (const tech of job.techs) {
    if (tech.phase === 'crossing' && tech.t >= c.cross) {
      tech.phase = 'climbing';
      tech.t = 0;
    } else if (tech.phase === 'climbing' && tech.t >= climbTime(tech)) {
      tech.phase = 'platform';
      tech.t = 0;
    }
  }
  if (job.techs.every((t) => t.phase === 'platform')) {
    job.done = true;
    earn(world, 'transfer', { port: c.pickupPort, people: job.techs.length, text: `Crew transfer: ${job.techs.length} technicians to ${turbineName(job.farm, job.turbine)}` });
    sayRadio(world, 'info', `${turbineName(job.farm, job.turbine)}: all ${job.techs.length} technicians up. Thanks, nicely held. You're clear to back off.`);
  }
}

/** How long a technician takes up the ladder from where they stepped across to the platform (s). */
export function climbTime(tech: Technician): number {
  return Math.max(2, (CONFIG.windFarm.platform.y - (tech.from ?? 2)) / CONFIG.transfer.climb);
}

/**
 * Debug intents (the menu's Tests tab, Wind farm):
 *   transferCall   a job now (value: the turbine's number, 1..; 0 at random)
 *   transferPlace  the boat (the intent's target) put 40 m off the job's turbine's landing
 *                  (or turbine 1's), stopped, heading onto it
 */
export function isTransferIntent(control: string): boolean {
  return control === 'transferCall' || control === 'transferPlace';
}

export function applyTransferIntent(world: WorldState, intent: Intent): void {
  const s = (world.transfer ??= createTransferState());
  if (intent.control === 'transferCall') {
    const n = WIND_FARMS[0]?.turbines.length ?? 0;
    if (!n) return;
    if (s.job && !s.job.done) s.job.done = true;
    const turbine = intent.value >= 1 ? Math.min(n, Math.round(intent.value)) - 1 : Math.floor(rand(s) * n);
    raiseTransfer(world, 0, turbine, CONFIG.transfer.techs[1]);
    return;
  }
  const v = world.vessels[intent.targetId];
  const job = s.job && !s.job.done ? s.job : null;
  const t = WIND_FARMS[job?.farm ?? 0]?.turbines[job?.turbine ?? 0];
  if (!v || !t) return;
  const f = landingFace(t);
  const { ax, az } = landingAxis(t.landingDeg);
  Object.assign(v.mooring, { phase: 'free', berthId: null });
  placeVessel(v, f.x + ax * 40, 0, f.z + az * 40, (t.landingDeg + 180) % 360);
  v.linearVelocity = [0, 0, 0];
  v.angularVelocity = [0, 0, 0];
}

/**
 * Towing missions. Plain-data simulation state (WorldState.tow), stepped by the host each
 * tick and shared in the snapshots, like the rescues.
 *
 *   call       out of harbour, with no rescue and no tow on, a call comes every so often
 *              (CONFIG.tow.every): something adrift ahead of us, a little off to one side.
 *              The tow itself is a vessel in world.vessels from the moment of the call (a
 *              towable def: no engine, no controls, the same boat physics as ours), so it
 *              drifts with the wind and bumps into things like any boat.
 *   job        'calling': the radio rings until someone picks up the handset ('accepted')
 *              or the call times out (another vessel takes it; the tow goes away).
 *              'accepted': go and get it, make the towline fast (the boat hook on its bow
 *              eye, or the menu), tow it into any port. Slow in port for a few seconds and
 *              it's 'delivered': the harbour takes it over, the line is cast off, the job
 *              counts as a completed mission (and goes in the log). The tow is taken away
 *              once we're clear of it.
 *   towline    one straight spring-damper between our towing post and its bow eye (see
 *              CONFIG.tow and towlineForces below). It parts if snatched too hard.
 *
 * Random choices use a deterministic hash of a counter in the state, like the rescues.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { EntityId } from '../core/ids';
import type { Intent } from '../core/intents';
import type { WorldState } from '../core/world';
import { hullPlan } from '../vessel/layout';
import { isWorkboat, TOW_DEFS, VESSEL_DEFS, type VesselDef } from '../vessel/vesselDef';
import { createVesselState, type VesselState } from '../vessel/vesselState';
import { placeVessel } from '../vessel/vesselControl';
import { isPowered } from '../vessel/electrics';
import { groundHeight } from '../world/terrain';
import { PORTS } from '../world/archipelago';
import type { ExternalForce } from '../vessel/physics/vesselContact';
import { createRescueState, nearestPort, sayRadio } from '../rescue/rescue';
import { formatPosition } from '../nav/geo';

export interface TowJob {
  /** The tow (a vessel in world.vessels while the job lasts) and its kind (def id). */
  vesselId: EntityId;
  defId: string;
  /** calling -> accepted (fetch it, make fast, tow it in) -> delivered (left in port). */
  phase: 'calling' | 'accepted' | 'delivered';
  /** World time of the call, and of the last alert (s). */
  callT: number;
  alertT: number;
  /** The towline is made fast, and its tension on the last tick (N). */
  fast: boolean;
  tension: number;
  /** Seconds the tow has lain slow inside a port (counts up to deliverTime). */
  inPort: number;
  /** Delivered: the port's name and when (s). */
  port?: string;
  doneT?: number;
}

export interface TowState {
  seq: number;
  /** World time the next call may come (s); null until first set. */
  nextAt: number | null;
  job: TowJob | null;
  /** Tows delivered so far. */
  delivered: number;
  /** Calls come by themselves (the game); off, only the debug intents raise jobs (tests). */
  calls: boolean;
}

export function createTowState(calls = false): TowState {
  return { seq: 0, nextAt: null, job: null, delivered: 0, calls };
}

/** Deterministic pseudo-random number in [0, 1) from the state's counter. */
function rand(t: TowState): number {
  const n = ++t.seq;
  const s = Math.sin(n * 73.1931 + 11.917) * 43758.5453;
  return s - Math.floor(s);
}

const between = (t: TowState, [a, b]: [number, number]) => a + (b - a) * rand(t);

/** The towing boat: the workboat (the first fully equipped vessel). */
function tug(world: WorldState): VesselState | undefined {
  return Object.values(world.vessels).find((v) => isWorkboat(VESSEL_DEFS[v.defId]));
}

/** Our towing post (vessel axes): on the centreline just in from the transom, above the deck. */
export function towPostLocal(def: VesselDef): [number, number, number] {
  const plan = hullPlan(def);
  const z = plan.transom - CONFIG.tow.postInset;
  return [0, plan.deckY(z) + CONFIG.tow.postHeight, z];
}

/** The tow's bow eye (vessel axes): at the stem, just above the deck edge. */
export function bowEyeLocal(def: VesselDef): [number, number, number] {
  const plan = hullPlan(def);
  const z = plan.stem + 0.25;
  return [0, plan.deckY(z) + 0.1, z];
}

const q = new THREE.Quaternion();
const tmp = new THREE.Vector3();

/** A point in a vessel's axes -> world. */
function toWorld(v: VesselState, local: readonly number[], out: THREE.Vector3): THREE.Vector3 {
  q.fromArray(v.orientation);
  return out.set(local[0], local[1], local[2]).applyQuaternion(q).add(tmp.fromArray(v.position));
}

/** Velocity (world) of a world point fixed to a vessel (rigid body: v + w x r, r from the origin). */
function pointVelocity(v: VesselState, point: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const [wx, wy, wz] = v.angularVelocity;
  const rx = point.x - v.position[0];
  const ry = point.y - v.position[1];
  const rz = point.z - v.position[2];
  return out.set(v.linearVelocity[0] + wy * rz - wz * ry, v.linearVelocity[1] + wz * rx - wx * rz, v.linearVelocity[2] + wx * ry - wy * rx);
}

/** The tow job's vessel, if the job and vessel exist. */
export function towVessel(world: WorldState): VesselState | undefined {
  const job = world.tow?.job;
  return job ? world.vessels[job.vesselId] : undefined;
}

/** Distance from our towing post to the tow's bow eye (m), or Infinity. */
export function towReach(world: WorldState): number {
  const v = tug(world);
  const t = towVessel(world);
  if (!v || !t) return Infinity;
  const a = toWorld(v, towPostLocal(VESSEL_DEFS[v.defId]), new THREE.Vector3());
  const b = toWorld(t, bowEyeLocal(VESSEL_DEFS[t.defId]), new THREE.Vector3());
  return a.distanceTo(b);
}

const pA = new THREE.Vector3();
const pB = new THREE.Vector3();
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const dir = new THREE.Vector3();

/**
 * The towline's pull this tick, as external forces on the two boats (evaluated from the
 * start-of-tick states, before the vessels are stepped, like boat-to-boat contact).
 *
 *   stretch e = |B - A| - L          (A: our towing post, B: the tow's bow eye, L: lineLength)
 *   T = k e + c de/dt  for e > 0, never below zero (a slack rope doesn't push)
 *   c = 2 * zeta * sqrt(k * m),  m = m_tug m_tow / (m_tug + m_tow)  (the two-body "reduced" mass)
 *
 * T acts on the tow at B toward A, and on us at A toward B. Above breakForce, or stretched
 * past maxStretch (aground, snagged), the line parts.
 */
export function towlineForces(world: WorldState): Map<EntityId, ExternalForce[]> {
  const out = new Map<EntityId, ExternalForce[]>();
  const job = world.tow?.job;
  const v = tug(world);
  const t = towVessel(world);
  if (!job?.fast || !v || !t) return out;
  const cfg = CONFIG.tow;
  const defV = VESSEL_DEFS[v.defId];
  const defT = VESSEL_DEFS[t.defId];
  toWorld(v, towPostLocal(defV), pA);
  toWorld(t, bowEyeLocal(defT), pB);
  dir.copy(pB).sub(pA);
  const len = dir.length();
  if (len < 1e-6) return out;
  dir.divideScalar(len);
  const stretch = len - cfg.lineLength;
  if (stretch <= 0) {
    job.tension = 0;
    return out;
  }
  // Rate of stretch: the two points' relative velocity along the line.
  const rate = pointVelocity(t, pB, vB).sub(pointVelocity(v, pA, vA)).dot(dir);
  const m = (defV.mass * defT.mass) / (defV.mass + defT.mass);
  const c = 2 * cfg.dampingRatio * Math.sqrt(cfg.stiffness * m);
  const T = Math.max(0, cfg.stiffness * stretch + c * rate);
  job.tension = T;
  if (T > cfg.breakForce || stretch > cfg.maxStretch) {
    job.fast = false;
    job.tension = 0;
    sayRadio(world, 'info', 'The towline has parted! Come back round and make fast again.');
    return out;
  }
  out.set(t.id, [{ force: dir.clone().multiplyScalar(-T), point: pB.clone() }]);
  out.set(v.id, [{ force: dir.clone().multiplyScalar(T), point: pA.clone() }]);
  return out;
}

function pickKind(t: TowState): string {
  const w = CONFIG.tow.weights;
  const total = TOW_DEFS.reduce((s, d) => s + (w[d] ?? 0), 0);
  let x = rand(t) * total;
  for (const d of TOW_DEFS) {
    x -= w[d] ?? 0;
    if (x <= 0) return d;
  }
  return TOW_DEFS[0];
}

/** Put a tow of this kind in the water at (x, z) and make it the job. */
function spawnTow(world: WorldState, defId: string, x: number, z: number, phase: TowJob['phase']): TowJob {
  const t = world.tow!;
  const id = `tow-${t.seq}-${Math.floor(world.time)}`;
  const s = createVesselState(id, defId);
  placeVessel(s, x, 0, z, rand(t) * 360);
  world.vessels[id] = s;
  const job: TowJob = { vesselId: id, defId, phase, callT: world.time, alertT: world.time, fast: false, tension: 0, inPort: 0 };
  t.job = job;
  return job;
}

/** A call: something adrift ahead of the boat, a little off to one side, in open water. */
export function startTowCall(world: WorldState, v: VesselState, defId?: string): TowJob {
  const cfg = CONFIG.tow;
  const t = (world.tow ??= createTowState());
  const kind = defId && TOW_DEFS.includes(defId as (typeof TOW_DEFS)[number]) ? defId : pickKind(t);
  const [bx, , bz] = v.position;
  // Straight ahead: the bow is -z in vessel axes.
  const [qx, qy, qz, qw] = v.orientation;
  let dx = -(2 * (qx * qz + qw * qy));
  let dz = -(1 - 2 * (qx * qx + qy * qy));
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  let x = bx + dx * cfg.ahead[0];
  let z = bz + dz * cfg.ahead[0];
  for (let i = 0; i < 32; i++) {
    const a = between(t, cfg.ahead);
    const o = between(t, cfg.offset) * (rand(t) < 0.5 ? -1 : 1);
    const cx = bx + dx * a - dz * o;
    const cz = bz + dz * a + dx * o;
    if (groundHeight(cx, cz) > -cfg.minDepth) continue;
    if (nearestPort(cx, cz).dist < cfg.minPortDistance) continue;
    x = cx;
    z = cz;
    break;
  }
  const job = spawnTow(world, kind, x, z, 'calling');
  const name = VESSEL_DEFS[kind].tow?.name ?? 'a vessel';
  const where = CONFIG.rescue.plotYourself
    ? `in position ${formatPosition(x, z)}`
    : `bearing ${bearing(bx, bz, x, z).toFixed(0).padStart(3, '0')}°, ${(Math.hypot(x - bx, z - bz) / 1852).toFixed(1)} miles from you`;
  sayRadio(world, 'distress', `SÉCURITÉ. Tow wanted: ${name}, adrift ${where}. Can you take her in tow to any harbour?`);
  return job;
}

function bearing(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return ((Math.atan2(toX - fromX, -(toZ - fromZ)) * 180) / Math.PI + 360) % 360;
}

/** Take the tow away (job over); nobody may be standing on it. Returns false if someone is. */
function removeTow(world: WorldState, job: TowJob): boolean {
  if (Object.values(world.players).some((p) => p.aboardVesselId === job.vesselId)) return false;
  delete world.vessels[job.vesselId];
  return true;
}

/** End the job now (another vessel took it, or debug), taking the tow away when it can. */
function dropJob(world: WorldState): void {
  const t = world.tow!;
  const job = t.job;
  if (!job) return;
  job.fast = false;
  // Someone standing on it: it stays as a delivered hulk until they step off.
  if (removeTow(world, job)) t.job = null;
  else {
    job.phase = 'delivered';
    job.doneT = world.time;
  }
  t.nextAt = world.time + between(t, CONFIG.tow.every);
}

/** Someone picked up the handset: takes a ringing tow call. Returns true if it did. */
export function acceptTowCall(world: WorldState): boolean {
  const job = world.tow?.job;
  const v = tug(world);
  if (job?.phase !== 'calling' || (v && !isPowered(v, 'radio'))) return false;
  job.phase = 'accepted';
  sayRadio(world, 'reply', 'Thank you, skipper. She is on your chart. Make fast to her bow eye and bring her into any harbour.');
  return true;
}

/** Is a call (rescue or tow) ringing, and when did it last alert? (-1: none) */
export function towAlertT(world: WorldState): number {
  const job = world.tow?.job;
  return job?.phase === 'calling' ? job.alertT : -1;
}

/** One tick: calls, timeouts, delivery, taking delivered tows away. */
export function stepTow(world: WorldState, dt: number): void {
  const cfg = CONFIG.tow;
  const t = (world.tow ??= createTowState());
  const v = tug(world);
  if (!v) return;
  if (t.nextAt === null) t.nextAt = world.time + between(t, cfg.every);
  const job = t.job;
  const tow = job ? world.vessels[job.vesselId] : undefined;
  // The tow vanished (a snapshot from an older host, a debug reset): no job.
  if (job && !tow) {
    t.job = null;
    return;
  }

  if (!job) {
    const busy = !!world.rescue?.active;
    const out = nearestPort(v.position[0], v.position[2]).dist > CONFIG.rescue.harbourRadius;
    // Only out of harbour, with nothing else on; otherwise the call waits.
    if (t.calls && world.time >= t.nextAt && out && !busy) startTowCall(world, v);
    return;
  }

  if (job.phase === 'calling') {
    if (world.time - job.callT > cfg.callTimeout) {
      dropJob(world);
      sayRadio(world, 'info', 'All stations: the vessel adrift has been taken in tow by another vessel. Out.');
    } else if (world.time - job.alertT > cfg.callRepeat) {
      job.alertT = world.time;
    }
    return;
  }

  if (job.phase === 'accepted' && tow) {
    // Delivered: slow inside a port for a few seconds (on the line or not: she may have
    // been let go to drift the last bit in).
    const port = PORTS.find((p) => Math.hypot(p.x - tow.position[0], p.z - tow.position[2]) < cfg.deliverRadius);
    const speed = Math.hypot(tow.linearVelocity[0], tow.linearVelocity[2]);
    job.inPort = port && speed < cfg.deliverSpeed ? job.inPort + dt : 0;
    if (port && job.inPort >= cfg.deliverTime) {
      const name = port.name.replace(' (anchorage)', '');
      job.phase = 'delivered';
      job.fast = false;
      job.tension = 0;
      job.port = name;
      job.doneT = world.time;
      t.delivered += 1;
      // A completed mission: counted with the rescues, and the log picks it up from there.
      const r = (world.rescue ??= createRescueState());
      r.completed += 1;
      const what = VESSEL_DEFS[job.defId].tow?.name ?? 'a tow';
      r.lastDone = `Tow: ${what.replace(/^an? /, '')} brought into ${name}.`;
      sayRadio(world, 'info', `${name} harbour: we have her, skipper, cast off your line. Thank you, a fine tow.`);
    }
    return;
  }

  if (job.phase === 'delivered' && tow) {
    const away = Math.hypot(tow.position[0] - v.position[0], tow.position[2] - v.position[2]) > cfg.removeRange;
    if ((away || world.time - (job.doneT ?? 0) > cfg.removeAfter) && removeTow(world, job)) {
      t.job = null;
      t.nextAt = world.time + between(t, cfg.every);
    }
  }
}

/**
 * Tow intents (targetId: the workboat or env):
 *   towMake        make the towline fast (the hook on the bow eye; in range)
 *   towCast        cast it off
 *   towToggle      the menu: make fast if in range, else cast off
 *   towDebugNear   a tow job lying just astern, accepted (to try towing)
 *   towDebugCall   a tow call now
 *   towDebugEnd    end the tow job
 */
export function applyTowIntent(world: WorldState, intent: Intent): void {
  const t = (world.tow ??= createTowState());
  const job = t.job;
  const v = tug(world);
  switch (intent.control) {
    case 'towMake':
    case 'towToggle': {
      if (job?.phase !== 'accepted') break;
      if (intent.control === 'towToggle' && job.fast) {
        job.fast = false;
        job.tension = 0;
      } else if (!job.fast && towReach(world) <= CONFIG.tow.attachRange) {
        job.fast = true;
        job.tension = 0;
      }
      break;
    }
    case 'towCast':
      if (job) {
        job.fast = false;
        job.tension = 0;
      }
      break;
    case 'towDebugNear': {
      if (!v || job) break;
      // Just astern of us, lying the same way, ready to make fast.
      const [qx, qy, qz, qw] = v.orientation;
      const fx = -(2 * (qx * qz + qw * qy));
      const fz = -(1 - 2 * (qx * qx + qy * qy));
      const len = Math.hypot(fx, fz) || 1;
      const kind = TOW_DEFS.includes(intent.ref as (typeof TOW_DEFS)[number]) ? intent.ref! : TOW_DEFS[0];
      const back = CONFIG.tow.debugDistance + hullPlan(VESSEL_DEFS[v.defId]).transom - hullPlan(VESSEL_DEFS[kind]).stem;
      const nj = spawnTow(world, kind, v.position[0] - (fx / len) * back, v.position[2] - (fz / len) * back, 'accepted');
      placeVessel(world.vessels[nj.vesselId], world.vessels[nj.vesselId].position[0], 0, world.vessels[nj.vesselId].position[2], (Math.atan2(fx, -fz) * 180) / Math.PI);
      sayRadio(world, 'info', `Debug: ${VESSEL_DEFS[kind].tow?.name ?? 'a tow'} astern of you. Hook her bow eye to make fast.`);
      break;
    }
    case 'towDebugCall':
      if (v && !job) startTowCall(world, v, intent.ref);
      break;
    case 'towDebugEnd':
      if (job) dropJob(world);
      break;
  }
}

export function isTowIntent(control: string): boolean {
  return control.startsWith('tow');
}

/** One line for displays while a tow job is on, else null. */
export function towStatus(world: WorldState): string | null {
  const job = world.tow?.job;
  if (!job) return null;
  if (job.phase === 'calling') return 'Tow wanted: pick up the handset';
  if (job.phase === 'delivered') return `Tow delivered to ${job.port ?? 'harbour'}`;
  if (job.fast) return `Towing: bring her into any harbour (line ${(job.tension / 1000).toFixed(1)} kN)`;
  const d = towReach(world);
  return d <= CONFIG.tow.attachRange ? 'Tow alongside: hook her bow eye to make fast' : `Tow adrift ${Math.round(d)} m off: go and get her`;
}

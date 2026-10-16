/**
 * Fire missions (owner request). Plain-data simulation state (WorldState.fire), stepped by
 * the host and shared in the snapshots, like the rescues and tows.
 *
 *   call      out of harbour, with no other job on, every so often (CONFIG.fire.every) a
 *             fire is reported on the VHF: a fishing boat burning at sea, or a fire ashore
 *             (a shed by the shore) somewhere you can reach from deep water. Pick up the
 *             handset to take it; unanswered, another vessel is sent.
 *   the fire  `intensity` 0..1. Left alone it grows (`growth` per s) up to 1; water on it
 *             knocks it down (`douse` per s at full flow). Below `outBelow` it's out: the
 *             radio thanks you, it counts as a completed mission, and the smouldering wreck
 *             is taken away a little later.
 *   the jet   from the fire monitor on the roof (the boat's fireMonitor gear: modules/fireMonitor),
 *             with the pump on and the engine running: a ballistic arc from the nozzle with
 *             the boat's own velocity, a little air drag and wind drift (jetPath). It wets
 *             the fire if the arc passes through the fire's volume (its hit radius, up to
 *             the flames' height). The same function draws the jet, so what you see is
 *             what hits.
 *
 * Random choices use a deterministic hash of a counter in the state.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Intent } from '../core/intents';
import type { WorldState } from '../core/world';
import { windVector } from '../environment/weather';
import { formatPosition } from '../nav/geo';
import { isPowered } from '../vessel/electrics';
import { isWorkboat, VESSEL_DEFS } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { gearOf } from '../boats/sims';
import { groundHeight } from '../world/terrain';
import { earn } from '../career/career';
import { createRescueState, nearestPort, sayRadio } from '../rescue/rescue';

export type FireKind = 'boat' | 'shore';

export interface FireJob {
  kind: FireKind;
  /** Where it burns (world): x, z, and the base height (sea level for a boat, the ground ashore). */
  x: number;
  z: number;
  y: number;
  /** Heading of the hulk / shed (deg). */
  yawDeg: number;
  /** 0 (out) .. 1 (fully ablaze). */
  intensity: number;
  /** Fraction of full flow landing on it on the last tick (0..1), for the views (steam). */
  wetting: number;
  /** The same from hand extinguishers (fire/extinguisher.ts), 0..1. Absent = none. */
  handWet?: number;
  phase: 'calling' | 'accepted' | 'out';
  callT: number;
  alertT: number;
  /** World time it went out (s). */
  outT?: number;
  /**
   * Progress calls on the VHF so far (owner: better feedback while fighting it): 1 first
   * water on it, 2 knocked down below half, 3 nearly out. Each said once.
   */
  said?: number;
}

export interface FireState {
  seq: number;
  nextAt: number | null;
  job: FireJob | null;
  /** Fires put out so far. */
  out: number;
  /** Calls come by themselves (the game); off, only the debug intents raise them (tests). */
  calls: boolean;
}

export function createFireState(calls = false): FireState {
  return { seq: 0, nextAt: null, job: null, out: 0, calls };
}

function rand(f: FireState): number {
  const n = ++f.seq;
  const s = Math.sin(n * 57.3311 + 3.917) * 43758.5453;
  return s - Math.floor(s);
}
const between = (f: FireState, [a, b]: readonly [number, number]) => a + (b - a) * rand(f);

function tug(world: WorldState): VesselState | undefined {
  return Object.values(world.vessels).find((v) => isWorkboat(VESSEL_DEFS[v.defId]));
}

/** Is any job (rescue, tow, fire) on? Only one at a time. */
export function jobOn(world: WorldState): boolean {
  return !!world.rescue?.active || !!world.tow?.job || !!world.fire?.job;
}

// ── The jet ────────────────────────────────────────────────────────────────

const q = new THREE.Quaternion();
const tmp = new THREE.Vector3();

/** Is water coming out of the monitor (pump on, engine running, 12 V for the pump clutch)? */
export function jetOn(v: VesselState): boolean {
  return !!gearOf(v, 'fireMonitor') && v.controls.firePump > 0 && v.engine.phase === 'running' && isPowered(v);
}

/**
 * The jet's path (world points, `n` of them at `step` s apart, ending where it meets the
 * sea or the ground): nozzle on the roof, aimed by pan (+ starboard, from the bow) and
 * elevation, leaving at nozzleSpeed plus the boat's own velocity; gravity, a little air
 * drag (velocity relative to the air decays at airDrag per s) and wind drift.
 *   p(t+dt) = p + v dt,  v += (g - airDrag (v - windDrift w)) dt
 * Returns the number of points used.
 */
/**
 * The monitor's aim (world direction) from its pan (+ to starboard from the bow) and
 * elevation (deg), for a boat at attitude `boat`. Stabilised, only her heading is used: the
 * aim is held level against her roll and pitch (the mount moves the barrel to cancel them;
 * MonitorView draws that). Unstabilised, it moves with the roof.
 */
export function monitorAim(panDeg: number, tiltDeg: number, boat: THREE.Quaternion, stabilised: boolean, out: THREE.Vector3): THREE.Vector3 {
  const pan = (panDeg * Math.PI) / 180;
  const el = (tiltDeg * Math.PI) / 180;
  // Bow is -z, starboard +x in vessel axes.
  out.set(Math.sin(pan) * Math.cos(el), Math.sin(el), -Math.cos(pan) * Math.cos(el));
  if (!stabilised) return out.applyQuaternion(boat);
  // Her heading alone: the yaw of her bow direction.
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(boat);
  const yaw = Math.atan2(-f.x, -f.z);
  return out.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
}

export function jetPath(world: WorldState, v: VesselState, out: THREE.Vector3[], step = 0.12): number {
  const m = gearOf(v, 'fireMonitor');
  if (!m || !out.length) return 0;
  q.fromArray(v.orientation);
  const p = tmp.fromArray(m.position).applyQuaternion(q).add(new THREE.Vector3().fromArray(v.position));
  const dir = monitorAim(v.controls.monPan, v.controls.monTilt, q, m.stabilised, new THREE.Vector3());
  const vel = dir.multiplyScalar(m.nozzleSpeed).add(new THREE.Vector3(v.linearVelocity[0], 0, v.linearVelocity[2]));
  const w = windVector(world.environment, { x: 0, z: 0 });
  const g = CONFIG.ocean.gravity;
  const pos = p.clone();
  let n = 0;
  for (; n < out.length; n++) {
    out[n].copy(pos);
    if (n > 0) {
      const floor = Math.max(0, groundHeight(pos.x, pos.z));
      if (pos.y <= floor) {
        out[n].y = floor;
        n++;
        break;
      }
    }
    vel.x += -m.airDrag * (vel.x - m.windDrift * w.x) * step;
    vel.z += -m.airDrag * (vel.z - m.windDrift * w.z) * step;
    vel.y += (-g - m.airDrag * vel.y) * step;
    pos.addScaledVector(vel, step);
  }
  return n;
}

const path = Array.from({ length: 60 }, () => new THREE.Vector3());

/** How much of the jet lands on the fire (0..1): the arc passing through its volume. */
function wetting(world: WorldState, v: VesselState, job: FireJob): number {
  if (!jetOn(v)) return 0;
  return arcWetting(path, jetPath(world, v, path), job);
}

/**
 * How much of a stream of water (its path, `n` world points) lands on the fire, 0..1: the
 * first point inside the fire's volume (within `hitRadius` of it, no higher than a metre
 * over the flames), more the nearer its middle. The monitor's jet and the extinguisher's.
 */
export function arcWetting(path: readonly THREE.Vector3[], n: number, job: FireJob): number {
  const c = CONFIG.fire;
  const r = c.hitRadius[job.kind];
  const top = job.y + c.flameHeight[job.kind] * (0.4 + 0.6 * job.intensity);
  for (let i = 1; i < n; i++) {
    const a = path[i];
    if (a.y > top + 1) continue;
    const d = Math.hypot(a.x - job.x, a.z - job.z);
    if (d < r) return Math.min(1, 1.2 - d / (r * 2.5));
  }
  return 0;
}

// ── Calls ──────────────────────────────────────────────────────────────────

function bearing(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return ((Math.atan2(toX - fromX, -(toZ - fromZ)) * 180) / Math.PI + 360) % 360;
}

/** A spot for a boat fire: open water ahead, a little off to one side. */
function seaSpot(f: FireState, v: VesselState): { x: number; z: number } | null {
  const c = CONFIG.fire;
  const [qx, qy, qz, qw] = v.orientation;
  let dx = -(2 * (qx * qz + qw * qy));
  let dz = -(1 - 2 * (qx * qx + qy * qy));
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  for (let i = 0; i < 32; i++) {
    const a = between(f, c.ahead);
    const o = between(f, c.offset) * (rand(f) < 0.5 ? -1 : 1);
    const x = v.position[0] + dx * a - dz * o;
    const z = v.position[2] + dz * a + dx * o;
    if (groundHeight(x, z) > -c.minDepth) continue;
    if (nearestPort(x, z).dist < c.minPortDistance) continue;
    return { x, z };
  }
  return null;
}

/**
 * A spot for a fire ashore: dry land just above the water's edge (ground `shoreHeight`)
 * with deep water (`minDepth`) within `shoreReach` m, so you can get close enough to hit
 * it, somewhere within `shoreRange` of the boat and away from the ports.
 */
function shoreSpot(f: FireState, v: VesselState): { x: number; z: number; y: number } | null {
  const c = CONFIG.fire;
  for (let i = 0; i < 400; i++) {
    const a = rand(f) * Math.PI * 2;
    const d = between(f, [300, c.shoreRange]);
    const x = v.position[0] + Math.cos(a) * d;
    const z = v.position[2] + Math.sin(a) * d;
    const h = groundHeight(x, z);
    if (h < c.shoreHeight[0] || h > c.shoreHeight[1]) continue;
    if (nearestPort(x, z).dist < c.minPortDistance) continue;
    let reachable = false;
    for (let k = 0; k < 8 && !reachable; k++) {
      const b = (k / 8) * Math.PI * 2;
      reachable = groundHeight(x + Math.cos(b) * c.shoreReach, z + Math.sin(b) * c.shoreReach) < -c.minDepth;
    }
    if (reachable) return { x, z, y: h };
  }
  return null;
}

const KIND_NAME: Record<FireKind, string> = { boat: 'a fishing boat on fire', shore: 'a fire ashore, a shed by the water' };

/** Raise a fire call (ahead of the boat at sea, or on a nearby shore). */
export function startFireCall(world: WorldState, v: VesselState, kind?: FireKind): FireJob | null {
  const c = CONFIG.fire;
  const f = (world.fire ??= createFireState());
  const k: FireKind = kind ?? (rand(f) < c.shoreChance ? 'shore' : 'boat');
  let spot: { x: number; z: number; y: number } | null = null;
  if (k === 'shore') spot = shoreSpot(f, v);
  if (!spot) {
    const s = seaSpot(f, v);
    if (s) spot = { ...s, y: 0 };
  }
  if (!spot) return null;
  const real: FireKind = spot.y > 0 ? 'shore' : 'boat';
  const job: FireJob = { kind: real, x: spot.x, z: spot.z, y: spot.y, yawDeg: rand(f) * 360, intensity: c.startIntensity, wetting: 0, phase: 'calling', callT: world.time, alertT: world.time };
  f.job = job;
  const [bx, , bz] = v.position;
  const where = CONFIG.rescue.plotYourself
    ? `in position ${formatPosition(job.x, job.z)}`
    : `bearing ${bearing(bx, bz, job.x, job.z).toFixed(0).padStart(3, '0')}°, ${(Math.hypot(job.x - bx, job.z - bz) / 1852).toFixed(1)} miles from you`;
  sayRadio(world, 'distress', `PAN-PAN. Fire reported: ${KIND_NAME[real]}, ${where}. You have a fire monitor, skipper: can you attend?`);
  return job;
}

/** Someone picked up the handset: takes a ringing fire call. */
export function acceptFireCall(world: WorldState): boolean {
  const job = world.fire?.job;
  const v = tug(world);
  if (job?.phase !== 'calling' || (v && !isPowered(v, 'radio'))) return false;
  job.phase = 'accepted';
  sayRadio(world, 'reply', 'Thank you, skipper. It is on your chart. Engine running and FIRE PUMP on, then aim the monitor with its joystick.');
  return true;
}

/** The fire call's last alert time, or -1 (the radio rings while it's calling). */
export function fireAlertT(world: WorldState): number {
  const job = world.fire?.job;
  return job?.phase === 'calling' ? job.alertT : -1;
}

/** One tick: calls, growth, water on the fire, out. */
export function stepFire(world: WorldState, dt: number): void {
  const c = CONFIG.fire;
  const f = (world.fire ??= createFireState());
  const v = tug(world);
  if (!v) return;
  if (f.nextAt === null) f.nextAt = world.time + between(f, c.every);
  const job = f.job;
  if (!job) {
    const out = nearestPort(v.position[0], v.position[2]).dist > CONFIG.rescue.harbourRadius;
    if (f.calls && !world.quietCalls && world.time >= f.nextAt && out && !jobOn(world)) {
      if (!startFireCall(world, v)) f.nextAt = world.time + 30;
    }
    return;
  }
  if (job.phase === 'calling') {
    if (world.time - job.callT > c.callTimeout) {
      f.job = null;
      f.nextAt = world.time + between(f, c.every);
      sayRadio(world, 'info', 'All stations: the fire is being attended by the fire service. Out.');
    } else if (world.time - job.alertT > c.callRepeat) job.alertT = world.time;
    return;
  }
  if (job.phase === 'accepted') {
    job.wetting = wetting(world, v, job);
    // Plus any hand extinguishers on it (fire/extinguisher.ts, stepped just before).
    const hand = CONFIG.handGear.extinguisher.douse * (job.handWet ?? 0);
    job.intensity = Math.min(1, Math.max(0, job.intensity + (c.growth - c.douse * (job.wetting + hand)) * dt));
    progressCall(world, job);
    if (job.intensity < c.outBelow) {
      job.phase = 'out';
      job.intensity = 0;
      job.outT = world.time;
      f.out += 1;
      const r = (world.rescue ??= createRescueState());
      r.completed += 1;
      const near = nearestPort(job.x, job.z).port;
      earn(world, 'fire', { port: near.id, text: `Fire put out near ${near.name.replace(' (anchorage)', '')}` });
      sayRadio(world, 'info', 'Coastguard: that fire is out. Thank you, skipper, well fought. You can shut down the pump.');
    }
    return;
  }
  // Out: the wet, smoking wreck stays a while, then the job is over.
  job.wetting = wetting(world, v, job);
  if (world.time - (job.outT ?? 0) > c.removeAfter) {
    f.job = null;
    f.nextAt = world.time + between(f, c.every);
  }
}

/**
 * The coastguard's running commentary as the fire is fought: once when the water first
 * lands on it, once below `progressCalls[0]` of full and once below `progressCalls[1]`.
 */
function progressCall(world: WorldState, job: FireJob): void {
  const said = job.said ?? 0;
  const [half, nearly] = CONFIG.fire.progressCalls;
  if (said < 1 && job.wetting > 0.05) {
    job.said = 1;
    sayRadio(world, 'info', "Coastguard: that's water on the fire, skipper. Keep it on the base of the flames.");
  } else if (said < 2 && job.intensity < half) {
    job.said = 2;
    sayRadio(world, 'info', "Coastguard: you're knocking it down, it's under half now. Keep at it.");
  } else if (said < 3 && job.intensity < nearly) {
    job.said = 3;
    sayRadio(world, 'info', 'Coastguard: nearly out, skipper. Hold the jet on it.');
  }
}

/**
 * Fire intents (targetId: the workboat or env):
 *   fireDebugNear  ref 'boat' | 'shore': a fire close by, accepted (to try the monitor)
 *   fireDebugCall  a fire call now
 *   fireDebugEnd   end the fire job
 */
export function applyFireIntent(world: WorldState, intent: Intent): void {
  const f = (world.fire ??= createFireState());
  const v = tug(world);
  switch (intent.control) {
    case 'fireDebugCall':
      if (v && !jobOn(world)) startFireCall(world, v, intent.ref === 'shore' ? 'shore' : intent.ref === 'boat' ? 'boat' : undefined);
      break;
    case 'fireDebugNear': {
      if (!v || jobOn(world)) break;
      if (intent.ref === 'shore') {
        // The nearest shore spot we can find, accepted.
        const job = startFireCall(world, v, 'shore');
        if (job) job.phase = 'accepted';
        break;
      }
      // A burning boat 45 m off the bow, accepted.
      const [qx, qy, qz, qw] = v.orientation;
      const fx = -(2 * (qx * qz + qw * qy));
      const fz = -(1 - 2 * (qx * qx + qy * qy));
      const len = Math.hypot(fx, fz) || 1;
      const d = CONFIG.fire.debugDistance;
      f.job = { kind: 'boat', x: v.position[0] + (fx / len) * d, z: v.position[2] + (fz / len) * d, y: 0, yawDeg: 40, intensity: CONFIG.fire.startIntensity, wetting: 0, phase: 'accepted', callT: world.time, alertT: world.time };
      sayRadio(world, 'info', 'Debug: a fishing boat on fire off your bow. Engine running, FIRE PUMP on, aim the monitor.');
      break;
    }
    case 'fireDebugEnd':
      if (f.job) {
        f.job = null;
        f.nextAt = world.time + between(f, CONFIG.fire.every);
      }
      break;
  }
}

export function isFireIntent(control: string): boolean {
  return control.startsWith('fireDebug');
}

/** One line for displays while a fire job is on, else null. */
export function fireStatus(world: WorldState): string | null {
  const job = world.fire?.job;
  if (!job) return null;
  if (job.phase === 'calling') return 'Fire reported: pick up the handset';
  if (job.phase === 'out') return 'Fire out';
  const v = tug(world);
  const d = v ? Math.round(Math.hypot(job.x - v.position[0], job.z - v.position[2])) : 0;
  const pct = Math.round(job.intensity * 100);
  if (v && !jetOn(v)) return `Fire ${d} m off (${pct} %): engine running, FIRE PUMP on`;
  return `Fire ${d} m off: ${pct} %${job.wetting > 0.05 ? ' - on target!' : ' - aim the monitor at it'}`;
}

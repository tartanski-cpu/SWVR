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
 *              counts as a completed mission. The tow is taken away
 *              a few seconds later (CONFIG.tow.removeAfter).
 *   towline    one straight spring-damper between our stern roller and what it's made fast
 *              to (see CONFIG.tow and towlineForces below). It parts if snatched too hard.
 *              It isn't only for the job (owner request: "tow anything in the water"): it
 *              goes on any vessel afloat - a tow, our own skiff - at her bow eye, or on a
 *              piece of drifting debris, or a salvage log (TowState.line, keyed 'v:<vessel
 *              id>' / 'd:<debris id>' / 'l:<log id>'). Debris has no physics of its own: on
 *              the line it's a point mass with water drag (CONFIG.tow.debris); towed slow
 *              into a harbour, it's cleared away. Logs are stepped by salvage/salvage.ts
 *              (beach friction, then afloat) with a longer line (CONFIG.salvage.line).
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
import { isPowered, hydraulicsOn } from '../vessel/electrics';
import { groundHeight } from '../world/terrain';
import { PORTS } from '../world/archipelago';
import type { ExternalForce } from '../vessel/physics/vesselContact';
import { createRescueState, nearestPort, sayRadio } from '../rescue/rescue';
import { formatPosition } from '../nav/geo';
import { logOf, salvageStatus, stepLog } from '../salvage/salvage';
import { earn, hasUpgrade } from '../career/career';

export interface TowJob {
  /** The tow (a vessel in world.vessels while the job lasts) and its kind (def id). */
  vesselId: EntityId;
  defId: string;
  /** calling -> accepted (fetch it, make fast, tow it in) -> delivered (left in port). */
  phase: 'calling' | 'accepted' | 'delivered';
  /** World time of the call, and of the last alert (s). */
  callT: number;
  alertT: number;
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
  /** Our towline, when it's made fast to something (one at a time). */
  line?: TowLine | null;
  /** Pieces of debris towed into harbour. */
  cleared?: number;
}

/** The towline made fast: to what, its pull, and for debris its motion. */
export interface TowLine {
  /** 'v:<vessel id>' (her bow eye) or 'd:<debris id>'. */
  target: string;
  /** Tension on the last tick (N). */
  tension: number;
  /** Line paid out from the tow winch (m); unset: as made fast (lineFor(target).length). */
  length?: number;
  /** Debris: its velocity on the line (world x, z; m/s), and seconds lain slow in a port. */
  vel?: [number, number];
  inPort?: number;
}

export function createTowState(calls = false): TowState {
  return { seq: 0, nextAt: null, job: null, delivered: 0, calls, line: null, cleared: 0 };
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

/**
 * Where the towline leaves us (vessel axes): the top of the stern roller in the transom
 * bulwark on the centreline. The tow's pull acts on the boat here.
 */
export function towPostLocal(def: VesselDef): [number, number, number] {
  const plan = hullPlan(def);
  const f = CONFIG.tow.fairlead;
  const z = plan.transom - f.inset;
  return [0, plan.deckY(z) + f.height, z];
}

/** Where the towline comes off the winch drum (vessel axes): the top of the drum, aft side. */
export function winchLeadLocal(def: VesselDef): [number, number, number] | null {
  const tw = def.towWinch;
  if (!tw) return null;
  const plan = hullPlan(def);
  const axle = plan.deckY(tw.z) + 0.18 + tw.drumRadius; // as drawn in controls/bridge.ts
  return [0, axle + tw.drumRadius * 0.7, tw.z + tw.drumRadius * 0.7];
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

/** The towline's key for a vessel (her bow eye). */
export const vesselKey = (id: EntityId) => `v:${id}`;

/**
 * Everything the towline can go on now: vessels afloat other than ours (a tender hanging
 * in her cradle or on the crane isn't afloat) and drifting debris.
 */
export function towTargets(world: WorldState): string[] {
  const v = tug(world);
  const keys: string[] = [];
  for (const o of Object.values(world.vessels)) {
    if (o === v || (o.tender && o.tender.phase !== 'free')) continue;
    keys.push(vesselKey(o.id));
  }
  for (const d of world.traffic?.debris ?? []) keys.push(`d:${d.id}`);
  for (const l of world.salvage?.logs ?? []) keys.push(`l:${l.id}`);
  return keys;
}

/** The line's length and how near our post a target must be to make fast (m): longer for logs (we stand off the beach). */
export function lineFor(key: string): { length: number; attach: number } {
  return key.startsWith('l:') ? CONFIG.salvage.line : { length: CONFIG.tow.lineLength, attach: CONFIG.tow.attachRange };
}

/** How much line is out now (m): as made fast, or as the tow winch has left it. */
export function lineLength(line: TowLine): number {
  return line.length ?? lineFor(line.target).length;
}

/**
 * The tow winch by our towing post (hold-to-run HEAVE IN / PAY OUT, vessel controls
 * `winchHeave` / `winchPayOut`): the line comes in at `heaveSpeed` and goes out at `payOutSpeed`,
 * between `minLength` and `maxLength`. Heaving in stalls while the line pulls harder than
 * the winch can (`pullN`): ease off, or slow down, and it comes in.
 */
function stepTowWinch(line: TowLine, v: VesselState, dt: number): void {
  const w = CONFIG.tow.winch;
  const heave = (v.controls.winchHeave ?? 0) > 0.5;
  const payOut = (v.controls.winchPayOut ?? 0) > 0.5;
  // Hydraulic: no pressure (engine off or DECK HYD off), the drum holds where it is.
  if (heave === payOut || !hydraulicsOn(v)) return;
  const L = lineLength(line);
  if (payOut) line.length = Math.min(w.maxLength, L + w.payOutSpeed * dt);
  else if (line.tension <= w.pullN) line.length = Math.max(w.minLength, L - w.heaveSpeed * dt);
}

/** The tow winch is stalled: heaving in against more pull than it has. */
export function winchStalled(world: WorldState): boolean {
  const line = world.tow?.line;
  const v = tug(world);
  return !!line && !!v && (v.controls.winchHeave ?? 0) > 0.5 && line.tension > CONFIG.tow.winch.pullN;
}

function debrisOf(world: WorldState, key: string) {
  return key.startsWith('d:') ? world.traffic?.debris.find((d) => d.id === key.slice(2)) : undefined;
}

function vesselOf(world: WorldState, key: string): VesselState | undefined {
  return key.startsWith('v:') ? world.vessels[key.slice(2)] : undefined;
}

/** Where the line goes on a target (world): a vessel's bow eye, debris at the waterline. Null if it's gone. */
export function towPoint(world: WorldState, key: string, out: THREE.Vector3): THREE.Vector3 | null {
  const o = vesselOf(world, key);
  if (o) return toWorld(o, bowEyeLocal(VESSEL_DEFS[o.defId]), out);
  const d = debrisOf(world, key);
  if (d) return out.set(d.x, 0.2, d.z);
  const l = logOf(world, key);
  if (!l) return null;
  // The end of the log nearer our boat (a line goes round one end).
  const tug0 = tug(world);
  const ex = (Math.sin(l.yaw) * l.len) / 2;
  const ez = (Math.cos(l.yaw) * l.len) / 2;
  const s = tug0 && Math.hypot(l.x + ex - tug0.position[0], l.z + ez - tug0.position[2]) > Math.hypot(l.x - ex - tug0.position[0], l.z - ez - tug0.position[2]) ? -1 : 1;
  return out.set(l.x + s * ex, l.afloat ? 0.1 : groundHeight(l.x, l.z) + 0.3, l.z + s * ez);
}

/** What it is, for messages: the tow's name, "the skiff", "the debris". */
export function towName(world: WorldState, key: string): string {
  const o = vesselOf(world, key);
  if (o) return o.id === world.tow?.job?.vesselId ? 'her' : (VESSEL_DEFS[o.defId].tow?.name ?? `the ${o.defId}`);
  return key.startsWith('l:') ? 'the log' : 'the debris';
}

/** The line is fast to the tow job's vessel. */
export function towFast(world: WorldState): boolean {
  const job = world.tow?.job;
  return !!job && world.tow?.line?.target === vesselKey(job.vesselId);
}

/**
 * Distance from our towing post to a target's tow point (m), or Infinity: by default what
 * the line is on, else the tow job's vessel.
 */
export function towReach(world: WorldState, key?: string): number {
  const v = tug(world);
  const k = key ?? world.tow?.line?.target ?? (world.tow?.job ? vesselKey(world.tow.job.vesselId) : undefined);
  if (!v || !k) return Infinity;
  const a = toWorld(v, towPostLocal(VESSEL_DEFS[v.defId]), new THREE.Vector3());
  const b = towPoint(world, k, new THREE.Vector3());
  return b ? a.distanceTo(b) : Infinity;
}

/** The nearest thing within reach of our towing post to make fast to (the job first), or null. */
export function nearestTowTarget(world: WorldState): string | null {
  const job = world.tow?.job;
  if (job?.phase === 'accepted' && towReach(world, vesselKey(job.vesselId)) <= CONFIG.tow.attachRange) return vesselKey(job.vesselId);
  let best: string | null = null;
  let bd = Infinity;
  for (const k of towTargets(world)) {
    const d = towReach(world, k);
    if (d <= lineFor(k).attach && d < bd) [best, bd] = [k, d];
  }
  return best;
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
 *   stretch e = |B - A| - L          (A: our towing post, B: the tow's bow eye, L: the line out)
 *   T = k e + c de/dt  for e > 0, never below zero (a slack rope doesn't push)
 *   c = 2 * zeta * sqrt(k * m),  m = m_tug m_tow / (m_tug + m_tow)  (the two-body "reduced" mass)
 *
 * T acts on the tow at B toward A, and on us at A toward B. Above breakForce, or stretched
 * past maxStretch (aground, snagged), the line parts.
 */
export function towlineForces(world: WorldState): Map<EntityId, ExternalForce[]> {
  const out = new Map<EntityId, ExternalForce[]>();
  const line = world.tow?.line;
  const v = tug(world);
  if (!line || !v) return out;
  const t = vesselOf(world, line.target);
  const d = debrisOf(world, line.target);
  const log = logOf(world, line.target);
  if (!t && !d && !log) return out;
  const cfg = CONFIG.tow;
  const defV = VESSEL_DEFS[v.defId];
  toWorld(v, towPostLocal(defV), pA);
  if (t) toWorld(t, bowEyeLocal(VESSEL_DEFS[t.defId]), pB);
  else if (d) pB.set(d.x, pA.y, d.z); // debris: the pull is horizontal (it floats at the surface)
  else towPoint(world, line.target, pB)?.setY(pA.y); // a log, by its near end
  dir.copy(pB).sub(pA);
  const len = dir.length();
  if (len < 1e-6) return out;
  dir.divideScalar(len);
  const stretch = len - lineLength(line);
  if (stretch <= 0) {
    line.tension = 0;
    return out;
  }
  // Rate of stretch: the two points' relative velocity along the line. For debris, its
  // velocity on the line (from stepTow).
  if (t) pointVelocity(t, pB, vB);
  else if (log) vB.set(log.vel[0], 0, log.vel[1]);
  else vB.set(line.vel?.[0] ?? 0, 0, line.vel?.[1] ?? 0);
  const rate = vB.sub(pointVelocity(v, pA, vA)).dot(dir);
  const mT = t ? VESSEL_DEFS[t.defId].mass : log ? CONFIG.salvage.mass : cfg.debris.mass;
  const m = (defV.mass * mT) / (defV.mass + mT);
  const c = 2 * cfg.dampingRatio * Math.sqrt(cfg.stiffness * m);
  const T = Math.max(0, cfg.stiffness * stretch + c * rate);
  line.tension = T;
  // The heavy towing post (an upgrade) holds more before the line parts.
  if (T > cfg.breakForce * (hasUpgrade(world, 'towPost') ? cfg.heavyPostFactor : 1) || stretch > cfg.maxStretch) {
    world.tow!.line = null;
    sayRadio(world, 'info', 'The towline has parted! Come back round and make fast again.');
    return out;
  }
  if (t) out.set(t.id, [{ force: dir.clone().multiplyScalar(-T), point: pB.clone() }]);
  out.set(v.id, [{ force: dir.clone().multiplyScalar(T), point: pA.clone() }]);
  return out;
}

/**
 * Debris on the line, one tick: a point mass m pulled toward our post by the tension T
 * and held back by the water, F = T u - (cL + cQ |v|) v (u: unit vector to the post,
 * horizontal). Its usual drift still moves it too (a current under it). Towed slow into a
 * harbour (as for tows), it's taken away and counted as cleared.
 */
function stepTowedDebris(world: WorldState, line: TowLine, dt: number): void {
  const d = debrisOf(world, line.target);
  const v = tug(world);
  if (!d || !v) return;
  const cfg = CONFIG.tow;
  toWorld(v, towPostLocal(VESSEL_DEFS[v.defId]), pA);
  const ux = pA.x - d.x;
  const uz = pA.z - d.z;
  const ul = Math.hypot(ux, uz) || 1;
  const vel = (line.vel ??= [0, 0]);
  const sp = Math.hypot(vel[0], vel[1]);
  const drag = cfg.debris.dragLinear + cfg.debris.dragQuad * sp;
  for (const i of [0, 1]) {
    const u = i === 0 ? ux / ul : uz / ul;
    vel[i] += ((line.tension * u - drag * vel[i]) / cfg.debris.mass) * dt;
  }
  d.x += vel[0] * dt;
  d.z += vel[1] * dt;
  const port = PORTS.find((p) => Math.hypot(p.x - d.x, p.z - d.z) < cfg.deliverRadius);
  line.inPort = port && Math.hypot(vel[0], vel[1]) < cfg.deliverSpeed ? (line.inPort ?? 0) + dt : 0;
  if (port && line.inPort >= cfg.deliverTime) {
    const t = world.tow!;
    t.line = null;
    t.cleared = (t.cleared ?? 0) + 1;
    earn(world, 'debris', { port: port.id, text: `Debris cleared into ${port.name.replace(' (anchorage)', '')}` });
    world.traffic!.debris = world.traffic!.debris.filter((o) => o !== d);
    sayRadio(world, 'info', `${port.name.replace(' (anchorage)', '')} harbour: thank you for clearing that debris from the fairway, skipper. We'll take it from here.`);
  }
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
  const job: TowJob = { vesselId: id, defId, phase, callT: world.time, alertT: world.time, inPort: 0 };
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

/** A log on the line: pulled toward our post with the line's tension (salvage.ts does the rest). */
function stepTowedLog(world: WorldState, line: TowLine, dt: number): void {
  const log = logOf(world, line.target);
  const v = tug(world);
  if (!log || !v) return;
  toWorld(v, towPostLocal(VESSEL_DEFS[v.defId]), pA);
  const ux = pA.x - log.x;
  const uz = pA.z - log.z;
  const ul = Math.hypot(ux, uz) || 1;
  stepLog(world, log, line.tension, ux / ul, uz / ul, dt);
}

/** Cast the line off if it's on this vessel. */
function castOffFrom(world: WorldState, id: EntityId): void {
  if (world.tow?.line?.target === vesselKey(id)) world.tow.line = null;
}

/** Take the tow away (job over); nobody may be standing on it. Returns false if someone is. */
function removeTow(world: WorldState, job: TowJob): boolean {
  if (Object.values(world.players).some((p) => p.aboardVesselId === job.vesselId)) return false;
  castOffFrom(world, job.vesselId);
  delete world.vessels[job.vesselId];
  return true;
}

/** End the job now (another vessel took it, or debug), taking the tow away when it can. */
function dropJob(world: WorldState): void {
  const t = world.tow!;
  const job = t.job;
  if (!job) return;
  castOffFrom(world, job.vesselId);
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
  // The line: gone with what it was on; debris on it is towed along.
  const line = t.line;
  if (line && !vesselOf(world, line.target) && !debrisOf(world, line.target) && !logOf(world, line.target)) t.line = null;
  else if (line?.target.startsWith('d:')) stepTowedDebris(world, line, dt);
  else if (line?.target.startsWith('l:')) stepTowedLog(world, line, dt);
  if (t.line) stepTowWinch(t.line, v, dt);
  const job = t.job;
  const tow = job ? world.vessels[job.vesselId] : undefined;
  // The tow vanished (a snapshot from an older host, a debug reset): no job.
  if (job && !tow) {
    t.job = null;
    return;
  }

  if (!job) {
    const busy = !!world.rescue?.active || !!world.fire?.job;
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
      castOffFrom(world, job.vesselId);
      job.port = name;
      job.doneT = world.time;
      t.delivered += 1;
      // A completed mission: counted with the rescues.
      const r = (world.rescue ??= createRescueState());
      r.completed += 1;
      earn(world, 'tow', { port: port.id, what: job.defId, text: `Tow into ${name}` });
      sayRadio(world, 'info', `${name} harbour: we have her, skipper, cast off your line. Thank you, a fine tow.`);
    }
    return;
  }

  // The harbour takes her over: she's gone a few seconds after the hand-over (owner
  // feedback: delivered tows were left drifting about the harbour).
  if (job.phase === 'delivered' && tow) {
    if (world.time - (job.doneT ?? 0) > cfg.removeAfter && removeTow(world, job)) {
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
    case 'towMake': {
      // ref: what to make fast to (a key from towTargets); none: the tow job's vessel.
      const key = intent.ref ?? (job?.phase === 'accepted' ? vesselKey(job.vesselId) : null);
      if (!key || t.line || !towTargets(world).includes(key)) break;
      // A tow that's been handed over is the harbour's now.
      if (job && key === vesselKey(job.vesselId) && job.phase !== 'accepted') break;
      if (towReach(world, key) <= lineFor(key).attach) t.line = { target: key, tension: 0 };
      break;
    }
    case 'towToggle': {
      // The menu: cast off, or make fast to the nearest thing in reach.
      if (t.line) t.line = null;
      else {
        const key = nearestTowTarget(world);
        if (key) t.line = { target: key, tension: 0 };
      }
      break;
    }
    case 'towCast':
      t.line = null;
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

/** One line for displays while a tow job is on or something's on the line, else null. */
export function towStatus(world: WorldState): string | null {
  const job = world.tow?.job;
  const line = world.tow?.line;
  const kN = `${line ? Math.round(lineLength(line)) : 0} m out, ${((line?.tension ?? 0) / 1000).toFixed(1)} kN${winchStalled(world) ? ', winch stalled: ease off' : ''}`;
  if (line?.target.startsWith('l:')) return salvageStatus(world);
  if (line && !towFast(world)) {
    return line.target.startsWith('d:') ? `Towing debris: bring it into a harbour to clear it (${kN})` : `Towing ${towName(world, line.target)} (${kN})`;
  }
  if (!job) return null;
  if (job.phase === 'calling') return 'Tow wanted: pick up the handset';
  if (job.phase === 'delivered') return `Tow delivered to ${job.port ?? 'harbour'}`;
  if (towFast(world)) return `Towing: bring her into any harbour (${kN})`;
  const d = towReach(world);
  return d <= CONFIG.tow.attachRange ? 'Tow alongside: hook her bow eye to make fast' : `Tow adrift ${Math.round(d)} m off: go and get her`;
}

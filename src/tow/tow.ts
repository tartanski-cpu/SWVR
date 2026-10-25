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
 *              A ship (a tug's job, TowLook.needs 'tug') has to be laid alongside: slow
 *              with her middle within her half beam + berthReach of a quay or pier face
 *              (shipBerthed): tow her to the approach, cast off, push her in with your
 *              bow. She lies there shipRemoveAfter s with her lines ashore.
 *   towline    one straight spring-damper between a boat's stern roller and what it's made
 *              fast to (see CONFIG.tow and towlineForces below). It parts if snatched too hard.
 *              Every boat with a stern roller has her own (TowState.lines, by her id; multi-
 *              boat towing, owner Oct 2026): several boats can be on one tow, their pulls
 *              adding up, as two tugs on a ship.
 *              It isn't only for the job (owner request: "tow anything in the water"): it
 *              goes on any vessel afloat - a tow, our own skiff - at her bow eye, or on a
 *              piece of drifting debris, or a salvage log (TowLine.target, keyed 'v:<vessel
 *              id>' / 'd:<debris id>' / 'l:<log id>'). Debris has no physics of its own: on
 *              the line it's a point mass with water drag (CONFIG.tow.debris); towed slow
 *              into a harbour, it's cleared away. Logs are stepped by salvage/salvage.ts
 *              (beach friction, then afloat) with a longer line (CONFIG.salvage.line).
 *
 * Random choices use a deterministic hash of a counter in the state, like the rescues.
 */
import { placePhrase } from '../world/places';
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { EntityId } from '../core/ids';
import type { Intent } from '../core/intents';
import type { WorldState } from '../core/world';
import { hullPlan } from '../vessel/layout';
import { TOW_DEFS, VESSEL_DEFS, type VesselDef } from '../vessel/vesselDef';
import { gearOf } from '../boats/sims';
import { createVesselState, type VesselState } from '../vessel/vesselState';
import { placeVessel } from '../vessel/vesselControl';
import { isPowered, hydraulicsOn } from '../vessel/electrics';
import { groundHeight } from '../world/terrain';
import { PORTS } from '../world/archipelago';
import { nearestBlockEdge } from '../world/geography';
import { regionAt } from '../world/regions';
import type { ExternalForce } from '../vessel/physics/vesselContact';
import { createRescueState, nearestPort, sayRadio } from '../rescue/rescue';
import { formatPosition } from '../nav/geo';
import { logMass, logOf, salvageStatus, stepLog } from '../salvage/salvage';
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
  /**
   * The towlines made fast, by the boat towing (her vessel id): one each, as many boats as
   * have a stern roller, and several may be on the same tow (multi-boat towing).
   */
  lines: Record<EntityId, TowLine>;
  /** Pieces of debris towed into harbour. */
  cleared?: number;
}

/** The towline made fast: to what, its pull, and for debris its motion. */
export interface TowLine {
  /** 'v:<vessel id>' (her bow eye) or 'd:<debris id>'. */
  target: string;
  /** Tension on the last tick (N). */
  tension: number;
  /**
   * On a vessel, which fitting it's on (vessel axes x: + starboard): 0 or unset, her centre
   * bow eye; -1 / +1, her port / starboard bow fairlead (a second boat's line: towFitting).
   */
  at?: -1 | 0 | 1;
  /** Line paid out from the tow winch (m); unset: as made fast (lineFor(target).length). */
  length?: number;
  /** Debris: its velocity on the line (world x, z; m/s), and seconds lain slow in a port. */
  vel?: [number, number];
  inPort?: number;
}

export function createTowState(calls = false): TowState {
  return { seq: 0, nextAt: null, job: null, delivered: 0, calls, lines: {}, cleared: 0 };
}

/** Deterministic pseudo-random number in [0, 1) from the state's counter. */
function rand(t: TowState): number {
  const n = ++t.seq;
  const s = Math.sin(n * 73.1931 + 11.917) * 43758.5453;
  return s - Math.floor(s);
}

const between = (t: TowState, [a, b]: [number, number]) => a + (b - a) * rand(t);

/**
 * The boat the tow calls come to: the home boat if she has a tow point (a stern roller;
 * modular boats M5), else the first that has one. A boat without one can't take a tow.
 */
function tug(world: WorldState): VesselState | undefined {
  const home = world.homeVesselId ? world.vessels[world.homeVesselId] : undefined;
  return home && gearOf(home, 'towPoint') ? home : Object.values(world.vessels).find((v) => gearOf(v, 'towPoint'));
}

/**
 * The towing boat a request is for (multi-boat towing): the boat it names (the one the player
 * is aboard) if she has a tow point, else the calls' boat (tug above).
 */
function towerFor(world: WorldState, boatId?: EntityId): VesselState | undefined {
  const b = boatId ? world.vessels[boatId] : undefined;
  return b && gearOf(b, 'towPoint') ? b : tug(world);
}

/** The towlines (made sure of: a state from before multi-boat towing had one `line`). */
function linesOf(world: WorldState): Record<EntityId, TowLine> {
  const t = (world.tow ??= createTowState());
  return (t.lines ??= {});
}

/** A boat's towline (by default the calls' boat's), or null. */
export function lineOf(world: WorldState, boatId?: EntityId): TowLine | null {
  const b = towerFor(world, boatId);
  return (b && world.tow?.lines?.[b.id]) || null;
}

/** Every towline made fast, with the boat towing on it. */
export function towLines(world: WorldState): { boat: VesselState; line: TowLine }[] {
  const out: { boat: VesselState; line: TowLine }[] = [];
  for (const [id, line] of Object.entries(world.tow?.lines ?? {})) {
    const boat = world.vessels[id];
    if (boat) out.push({ boat, line });
  }
  return out;
}

/** The towlines on one target (a tow, debris, a log): several boats may be on it. */
export function linesOn(world: WorldState, key: string): { boat: VesselState; line: TowLine }[] {
  return towLines(world).filter((o) => o.line.target === key);
}

/** Is anything (any boat's line) made fast to this target? */
export function onAnyLine(world: WorldState, key: string): boolean {
  return Object.values(world.tow?.lines ?? {}).some((l) => l.target === key);
}

/** Cast off every line on this target (it's delivered, sold, cleared or gone). */
export function castOffKey(world: WorldState, key: string): void {
  const lines = world.tow?.lines;
  if (!lines) return;
  for (const [id, l] of Object.entries(lines)) if (l.target === key) delete lines[id];
}

/** A boat taken away or moved (the SOS tug): her own line and every line on her let go. */
export function castOffBoat(world: WorldState, id: EntityId): void {
  if (world.tow?.lines) delete world.tow.lines[id];
  castOffKey(world, vesselKey(id));
}

/**
 * Tug class (owner, Oct 2026): a boat that gets the big tows (a ship; TowLook.needs 'tug').
 * Her engine is the slow-revving tug diesel (rated at or under CONFIG.tow.tugRpm), or she
 * has the heavy towing post.
 */
export function isTugClass(world: WorldState, v: VesselState): boolean {
  const rated = gearOf(v, 'diesel')?.engine.ratedRpm;
  return (rated !== undefined && rated <= CONFIG.tow.tugRpm) || hasUpgrade(world, 'towPost');
}

/** The kinds this boat may be called for: a ship only for a tug. */
function kindsFor(world: WorldState, v: VesselState): readonly (typeof TOW_DEFS)[number][] {
  const tug = isTugClass(world, v);
  return TOW_DEFS.filter((d) => !VESSEL_DEFS[d].tow?.needs || tug);
}

/**
 * Where the towline leaves her (vessel axes): her tow point, the top of the stern roller
 * (modules/sternRoller). The tow's pull acts on the boat here. Her stern, on a boat
 * without one (nothing tows from it: tug() passes her by).
 */
export function towPostLocal(v: { defId: string }): [number, number, number] {
  const p = gearOf(v, 'towPoint')?.point;
  if (p) return p;
  const plan = hullPlan(VESSEL_DEFS[v.defId]);
  return [0, plan.deckY(plan.transom), plan.transom];
}

/**
 * Where a line is passed aboard her (vessel axes): her stern roller. The same as her tow
 * point but on a tug, whose tow point is her towing hook amidships (modules/sternRoller):
 * how near a tow must be to make fast is measured from here.
 */
export function sternLocal(v: { defId: string }): [number, number, number] {
  return gearOf(v, 'towPoint')?.stern ?? towPostLocal(v);
}

/** Where the towline comes off her tow winch's drum (vessel axes), or null: no winch. */
export function winchLeadLocal(v: { defId: string }): [number, number, number] | null {
  return gearOf(v, 'towWinch')?.lead ?? null;
}

/** Is this ship alongside: her middle within her half beam + CONFIG.tow.berthReach of a quay or pier face? */
export function shipBerthed(tow: VesselState): boolean {
  const def = VESSEL_DEFS[tow.defId];
  const halfBeam = Math.max(...def.hull.stations.map((st) => st.halfBeamDeck));
  // (nearestBlockEdge measures to a point 0.6 m inside the face.)
  return !!nearestBlockEdge(tow.position[0], tow.position[2], halfBeam + 0.6 + CONFIG.tow.berthReach);
}

/** A tug's job: a ship that has to be laid alongside (TowLook.needs 'tug'). */
export function isShipJob(job: TowJob | null | undefined): boolean {
  return !!job && VESSEL_DEFS[job.defId]?.tow?.needs === 'tug';
}

/** The tow's bow eye (vessel axes): at the stem, just above the deck edge. */
export function bowEyeLocal(def: VesselDef): [number, number, number] {
  const plan = hullPlan(def);
  const z = plan.stem + 0.25;
  return [0, plan.deckY(z) + 0.1, z];
}

/**
 * Where a line goes on a vessel (vessel axes): `at` 0 her bow eye; -1 / +1 her port /
 * starboard bow fairlead, CONFIG.tow.fairleadAft of her length aft of the stem, just inside
 * the deck edge (multi-boat towing).
 */
export function towFittingLocal(def: VesselDef, at: -1 | 0 | 1 = 0): [number, number, number] {
  if (!at) return bowEyeLocal(def);
  const plan = hullPlan(def);
  const z = plan.stem + CONFIG.tow.fairleadAft * (plan.transom - plan.stem);
  return [at * Math.max(0, plan.halfBeam(z) - 0.15), plan.deckY(z) + 0.1, z];
}

/**
 * The fitting a boat's line takes on a vessel: her own line's, if it's on; else the bow eye
 * when no other line is on her; else the free fitting (eye, port or starboard fairlead)
 * nearest the boat's stern roller (all taken: the nearest).
 */
function fittingFor(world: WorldState, key: string, boat: VesselState | undefined): -1 | 0 | 1 {
  const own = boat ? world.tow?.lines?.[boat.id] : undefined;
  if (own?.target === key) return own.at ?? 0;
  const o = vesselOf(world, key);
  const taken = Object.entries(world.tow?.lines ?? {}).filter(([id, l]) => l.target === key && id !== boat?.id).map(([, l]) => l.at ?? 0);
  if (!o || !boat || !taken.length) return 0;
  const post = toWorld(boat, towPostLocal(boat), new THREE.Vector3());
  const def = VESSEL_DEFS[o.defId];
  const near = (at: -1 | 0 | 1) => toWorld(o, towFittingLocal(def, at), new THREE.Vector3()).distanceTo(post);
  const all: (-1 | 0 | 1)[] = [0, -1, 1];
  const free = all.filter((a) => !taken.includes(a));
  return (free.length ? free : all).reduce((a, b) => (near(b) < near(a) ? b : a));
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
export function towTargets(world: WorldState, boatId?: EntityId): string[] {
  const v = towerFor(world, boatId);
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

/**
 * A line just made fast: paid out to the distance between our stern roller and what it's on,
 * plus a little slack (`tow.winch.makeFastSlack`), inside the winch's limits. (Made fast at
 * the full default length, a tow 15-20 m off had metres of slack, and the winch spent its
 * first many seconds just taking it up: owner feedback, "the winch doesn't pull".)
 */
function newLine(world: WorldState, key: string, boatId: EntityId): TowLine {
  const w = CONFIG.tow.winch;
  const at = key.startsWith('v:') ? fittingFor(world, key, world.vessels[boatId]) : 0;
  const line: TowLine = { target: key, tension: 0, ...(at ? { at } : {}) };
  // Paid out to that fitting (a fairlead, for a second boat's line).
  const reach = towReach(world, key, boatId, at);
  if (Number.isFinite(reach)) line.length = Math.min(w.maxLength, Math.max(w.minLength, reach + w.makeFastSlack));
  return line;
}

/**
 * Make this boat's towline fast to a vessel at once, from wherever it lies within the tow
 * winch's longest line: the barge the timber camp hands over (voyage/timber.ts), already on
 * the line as you come back aboard. False if she has a line out already, or it's too far.
 */
export function makeFastNow(world: WorldState, boatId: EntityId, targetId: EntityId): boolean {
  const lines = linesOf(world);
  const key = vesselKey(targetId);
  if (!world.vessels[boatId] || !world.vessels[targetId] || lines[boatId]) return false;
  if (towReach(world, key, boatId) > CONFIG.tow.winch.maxLength - CONFIG.tow.winch.makeFastSlack) return false;
  lines[boatId] = newLine(world, key, boatId);
  return true;
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
  // Hydraulic: no pressure (engine off or DECK HYD off), the drum holds where it is. No
  // winch fitted: the line stays as made fast.
  if (heave === payOut || !hydraulicsOn(v) || !gearOf(v, 'towWinch')) return;
  const L = lineLength(line);
  if (payOut) line.length = Math.min(w.maxLength, L + w.payOutSpeed * dt);
  else if (line.tension <= w.pullN) line.length = Math.max(w.minLength, L - w.heaveSpeed * dt);
}

/** A boat's tow winch is stalled: heaving in against more pull than it has. */
export function winchStalled(world: WorldState, boatId?: EntityId): boolean {
  const line = lineOf(world, boatId);
  const v = towerFor(world, boatId);
  return !!line && !!v && (v.controls.winchHeave ?? 0) > 0.5 && line.tension > CONFIG.tow.winch.pullN;
}

function debrisOf(world: WorldState, key: string) {
  return key.startsWith('d:') ? world.traffic?.debris.find((d) => d.id === key.slice(2)) : undefined;
}

function vesselOf(world: WorldState, key: string): VesselState | undefined {
  return key.startsWith('v:') ? world.vessels[key.slice(2)] : undefined;
}

/**
 * Where a boat's line goes on a target (world): a vessel's bow eye (or, a second boat's, a
 * bow fairlead: fittingFor; `at` to name one), debris at the waterline. Null if it's gone.
 */
export function towPoint(world: WorldState, key: string, out: THREE.Vector3, boatId?: EntityId, at?: -1 | 0 | 1): THREE.Vector3 | null {
  const o = vesselOf(world, key);
  if (o) return toWorld(o, towFittingLocal(VESSEL_DEFS[o.defId], at ?? fittingFor(world, key, towerFor(world, boatId))), out);
  const d = debrisOf(world, key);
  if (d) return out.set(d.x, 0.2, d.z);
  const l = logOf(world, key);
  if (!l) return null;
  // The end of the log nearer the boat (a line goes round one end).
  const tug0 = towerFor(world, boatId);
  const ex = (Math.sin(l.yaw) * l.len) / 2;
  const ez = (Math.cos(l.yaw) * l.len) / 2;
  const s = tug0 && Math.hypot(l.x + ex - tug0.position[0], l.z + ez - tug0.position[2]) > Math.hypot(l.x - ex - tug0.position[0], l.z - ez - tug0.position[2]) ? -1 : 1;
  return out.set(l.x + s * ex, l.afloat ? 0.1 : groundHeight(l.x, l.z) + 0.3, l.z + s * ez);
}

/** What it is, for messages: the tow's name, "the skiff", "the debris". */
export function towName(world: WorldState, key: string): string {
  const o = vesselOf(world, key);
  if (o) return o.id === world.tow?.job?.vesselId ? 'her' : (VESSEL_DEFS[o.defId].tow?.name ?? (o.owner || o.id === world.homeVesselId ? 'her' : `the ${o.defId}`));
  return key.startsWith('l:') ? 'the log' : 'the debris';
}

/**
 * A line is fast to the tow job's vessel: any boat's, or with `boatId`, that boat's.
 */
export function towFast(world: WorldState, boatId?: EntityId): boolean {
  const job = world.tow?.job;
  if (!job) return false;
  return boatId ? lineOf(world, boatId)?.target === vesselKey(job.vesselId) : onAnyLine(world, vesselKey(job.vesselId));
}

/**
 * Distance from a boat's towing post (by default the calls' boat's) to a target's tow point
 * (m), or Infinity: by default what her line is on, else the tow job's vessel.
 */
export function towReach(world: WorldState, key?: string, boatId?: EntityId, at?: -1 | 0 | 1, fromStern = false): number {
  const v = towerFor(world, boatId);
  const k = key ?? (v && world.tow?.lines?.[v.id]?.target) ?? (world.tow?.job ? vesselKey(world.tow.job.vesselId) : undefined);
  if (!v || !k) return Infinity;
  const a = toWorld(v, fromStern ? sternLocal(v) : towPostLocal(v), new THREE.Vector3());
  const b = towPoint(world, k, new THREE.Vector3(), v.id, at);
  return b ? a.distanceTo(b) : Infinity;
}

/** The nearest thing within reach of a boat's towing post to make fast to (the job first), or null. */
export function nearestTowTarget(world: WorldState, boatId?: EntityId): string | null {
  const job = world.tow?.job;
  const v = towerFor(world, boatId);
  if (!v) return null;
  if (job?.phase === 'accepted' && job.vesselId !== v.id && towReach(world, vesselKey(job.vesselId), v.id, undefined, true) <= CONFIG.tow.attachRange) return vesselKey(job.vesselId);
  let best: string | null = null;
  let bd = Infinity;
  for (const k of towTargets(world, v.id)) {
    const d = towReach(world, k, v.id, undefined, true);
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
 * The towlines' pull this tick, as external forces on the boats (evaluated from the
 * start-of-tick states, before the vessels are stepped, like boat-to-boat contact). Each
 * boat's line on its own (lineForce); two boats on one tow each pull it, and the forces on
 * her simply add up.
 */
export function towlineForces(world: WorldState): Map<EntityId, ExternalForce[]> {
  const out = new Map<EntityId, ExternalForce[]>();
  const lines = world.tow?.lines ?? {};
  // A boat with no line fast: her gauge reads nothing (PARTED a while after it went).
  for (const v of Object.values(world.vessels)) {
    if (!v.towLine) continue;
    if (v.towLine.fast && !lines[v.id]) Object.assign(v.towLine, { fast: false, tension: 0, load: 0 });
    if (v.towLine.parted && world.time - (v.towLine.partedAt ?? 0) > CONFIG.tow.gauge.partedShowS) v.towLine.parted = false;
  }
  for (const { boat, line } of towLines(world)) lineForce(world, boat, line, out);
  return out;
}

function addForce(out: Map<EntityId, ExternalForce[]>, id: EntityId, f: ExternalForce): void {
  const list = out.get(id);
  if (list) list.push(f);
  else out.set(id, [f]);
}

/**
 * One towline's pull:
 *
 *   stretch e = |B - A| - L          (A: the boat's towing post, B: the tow's bow eye, L: the line out)
 *   T = k e + c de/dt  for e > 0, never below zero (a slack rope doesn't push)
 *   c = 2 * zeta * sqrt(k * m),  m = m_tug m_tow / (m_tug + m_tow)  (the two-body "reduced" mass)
 *
 * T acts on the tow at B toward A, and on the boat at A toward B. Above breakForce, or
 * stretched past maxStretch (aground, snagged), the line parts.
 */
function lineForce(world: WorldState, v: VesselState, line: TowLine, out: Map<EntityId, ExternalForce[]>): void {
  const t = vesselOf(world, line.target);
  const d = debrisOf(world, line.target);
  const log = logOf(world, line.target);
  if (!t && !d && !log) return;
  const cfg = CONFIG.tow;
  const defV = VESSEL_DEFS[v.defId];
  toWorld(v, towPostLocal(v), pA);
  if (t) toWorld(t, towFittingLocal(VESSEL_DEFS[t.defId], line.at), pB);
  else if (d) pB.set(d.x, pA.y, d.z); // debris: the pull is horizontal (it floats at the surface)
  else towPoint(world, line.target, pB, v.id)?.setY(pA.y); // a log, by its near end
  dir.copy(pB).sub(pA);
  const len = dir.length();
  if (len < 1e-6) return;
  dir.divideScalar(len);
  const stretch = len - lineLength(line);
  if (stretch <= 0) {
    line.tension = 0;
    gauge(world, v, 0, 0);
    return;
  }
  // Rate of stretch: the two points' relative velocity along the line. For debris, its
  // velocity on the line (from stepTow).
  if (t) pointVelocity(t, pB, vB);
  else if (log) vB.set(log.vel[0], 0, log.vel[1]);
  else vB.set(line.vel?.[0] ?? 0, 0, line.vel?.[1] ?? 0);
  const rate = vB.sub(pointVelocity(v, pA, vA)).dot(dir);
  const mT = t ? VESSEL_DEFS[t.defId].mass : log ? logMass(log) : cfg.debris.mass;
  const m = (defV.mass * mT) / (defV.mass + mT);
  const c = 2 * cfg.dampingRatio * Math.sqrt(cfg.stiffness * m);
  const T = Math.max(0, cfg.stiffness * stretch + c * rate);
  line.tension = T;
  // The heavy towing post (an upgrade) holds more before the line parts, and so does a large
  // tow's own heavy hawser (`tow.lineFactor`).
  const hawser = t ? (VESSEL_DEFS[t.defId].tow?.lineFactor ?? 1) : 1;
  const breakAt = cfg.breakForce * hawser * (hasUpgrade(world, 'towPost') ? cfg.heavyPostFactor : 1);
  // How near it is to parting, for her TOW LINE gauge: the nearer of the two.
  gauge(world, v, T, Math.max(T / breakAt, stretch / cfg.maxStretch));
  if (T > breakAt || stretch > cfg.maxStretch) {
    delete linesOf(world)[v.id];
    Object.assign(v.towLine!, { fast: false, tension: 0, load: 0, partedAt: world.time, parted: true });
    // With other boats towing too, say which line went.
    const others = Object.keys(linesOf(world)).length > 0;
    sayRadio(world, 'info', others ? 'One of the towlines has parted! Come back round and make fast again.' : 'The towline has parted! Come back round and make fast again.');
    return;
  }
  if (t) addForce(out, t.id, { force: dir.clone().multiplyScalar(-T), point: pB.clone() });
  addForce(out, v.id, { force: dir.clone().multiplyScalar(T), point: pA.clone() });
}

/**
 * The towing boat's tow line gauge (VesselState.towLine; the TOW LINE screen): its tension and
 * load toward parting this tick, and the highest load held a while (CONFIG.tow.gauge), so a
 * snatch too quick to see on the bar still shows.
 */
function gauge(world: WorldState, v: VesselState, tension: number, load: number): void {
  const g = (v.towLine ??= { fast: true, tension: 0, load: 0, peak: 0, peakAt: world.time });
  g.fast = true;
  g.parted = false;
  g.tension = tension;
  g.load = load;
  if (load >= g.peak || world.time - g.peakAt > CONFIG.tow.gauge.peakHoldS) {
    g.peak = load;
    g.peakAt = world.time;
  }
}

/**
 * The pull of every line on one target (debris, a log), summed: tension T along the unit
 * vector u from it toward each boat's post (horizontal). Returns [Fx, Fz] (N).
 */
function pullOn(world: WorldState, key: string, x: number, z: number): [number, number] {
  let fx = 0;
  let fz = 0;
  for (const { boat, line } of linesOn(world, key)) {
    toWorld(boat, towPostLocal(boat), pA);
    const ux = pA.x - x;
    const uz = pA.z - z;
    const ul = Math.hypot(ux, uz) || 1;
    fx += (line.tension * ux) / ul;
    fz += (line.tension * uz) / ul;
  }
  return [fx, fz];
}

/**
 * Debris on the line(s), one tick: a point mass m pulled by every line on it (pullOn) and
 * held back by the water, F = sum(T u) - (cL + cQ |v|) v. Its usual drift still moves it too
 * (a current under it). Its velocity is kept on each line on it (TowLine.vel, the same on
 * all). Towed slow into a harbour (as for tows), it's taken away and counted as cleared.
 */
function stepTowedDebris(world: WorldState, key: string, dt: number): void {
  const d = debrisOf(world, key);
  const on = linesOn(world, key).map((o) => o.line);
  if (!d || !on.length) return;
  const cfg = CONFIG.tow;
  const [fx, fz] = pullOn(world, key, d.x, d.z);
  const was = on.find((l) => l.vel)?.vel ?? [0, 0];
  const vel: [number, number] = [was[0], was[1]];
  const sp = Math.hypot(vel[0], vel[1]);
  const drag = cfg.debris.dragLinear + cfg.debris.dragQuad * sp;
  vel[0] += ((fx - drag * vel[0]) / cfg.debris.mass) * dt;
  vel[1] += ((fz - drag * vel[1]) / cfg.debris.mass) * dt;
  d.x += vel[0] * dt;
  d.z += vel[1] * dt;
  const port = PORTS.find((p) => Math.hypot(p.x - d.x, p.z - d.z) < cfg.deliverRadius);
  const inPort = port && Math.hypot(vel[0], vel[1]) < cfg.deliverSpeed ? Math.max(...on.map((l) => l.inPort ?? 0)) + dt : 0;
  for (const l of on) {
    l.vel = [vel[0], vel[1]];
    l.inPort = inPort;
  }
  if (port && inPort >= cfg.deliverTime) {
    const t = world.tow!;
    castOffKey(world, key);
    t.cleared = (t.cleared ?? 0) + 1;
    earn(world, 'debris', { port: port.id, text: `Debris cleared into ${port.name.replace(' (anchorage)', '')}` });
    world.traffic!.debris = world.traffic!.debris.filter((o) => o !== d);
    sayRadio(world, 'info', `${port.name.replace(' (anchorage)', '')} harbour: thank you for clearing that debris from the fairway, skipper. We'll take it from here.`);
  }
}

function pickKind(t: TowState, w: Record<string, number> = CONFIG.tow.weights, from: readonly string[] = TOW_DEFS): string {
  const total = from.reduce((s, d) => s + (w[d] ?? 0), 0);
  let x = rand(t) * total;
  for (const d of from) {
    x -= w[d] ?? 0;
    if (x <= 0) return d;
  }
  return from[0] ?? TOW_DEFS[0];
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

/**
 * A call: something adrift ahead of the boat, a little off to one side, in open water; or,
 * from a region's job list, at its own spot (`at`, within r), described in its own words.
 */
export function startTowCall(world: WorldState, v: VesselState, defId?: string, opts: { name?: string; at?: { x: number; z: number; r: number } } = {}): TowJob {
  const cfg = CONFIG.tow;
  const t = (world.tow ??= createTowState());
  // A tug gets the big tows their share of the time (CONFIG.tow.bigShare); no one else does.
  const allowed = kindsFor(world, v);
  const big = isTugClass(world, v) && rand(t) < cfg.bigShare;
  const kind = defId && allowed.includes(defId as (typeof TOW_DEFS)[number]) ? defId : big ? pickKind(t, cfg.bigWeights, allowed) : pickKind(t, cfg.weights, allowed);
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
  if (opts.at) {
    x = opts.at.x;
    z = opts.at.z;
    for (let i = 0; i < 32; i++) {
      const ang = rand(t) * Math.PI * 2;
      const d = Math.sqrt(rand(t)) * opts.at.r;
      const cx = opts.at.x + Math.cos(ang) * d;
      const cz = opts.at.z + Math.sin(ang) * d;
      if (groundHeight(cx, cz) > -cfg.minDepth) continue;
      x = cx;
      z = cz;
      break;
    }
  } else {
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
  }
  const job = spawnTow(world, kind, x, z, 'calling');
  const name = opts.name ?? VESSEL_DEFS[kind].tow?.name ?? 'a vessel';
  const phrase = placePhrase(x, z); // where, in words, on a coast map (world/places.ts)
  const where = (phrase ? `${phrase}, ` : '') + (CONFIG.rescue.plotYourself
    ? `in position ${formatPosition(x, z)}`
    : `bearing ${bearing(bx, bz, x, z).toFixed(0).padStart(3, '0')}°, ${(Math.hypot(x - bx, z - bz) / 1852).toFixed(1)} miles from you`);
  const heavy = (VESSEL_DEFS[kind].tow?.lineFactor ?? 1) > 1 ? ' She is a big one: she will pass you her own heavy hawser. Take up the strain gently.' : '';
  const ship = VESSEL_DEFS[kind].tow?.needs === 'tug';
  sayRadio(world, 'distress', ship ? `PAN PAN. Tug wanted: ${name}, drifting ${where}. She needs a tug to bring her into harbour and lay her alongside a quay: tow her in, then push her onto the berth with your bow. Nothing smaller will shift her.${heavy}` : `SÉCURITÉ. Tow wanted: ${name}, adrift ${where}. Can you take her in tow to any harbour?${heavy}`);
  return job;
}

function bearing(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return ((Math.atan2(toX - fromX, -(toZ - fromZ)) * 180) / Math.PI + 360) % 360;
}

/** A log on the line(s): pulled by every line on it, summed (salvage.ts does the rest). */
function stepTowedLog(world: WorldState, key: string, dt: number): void {
  const log = logOf(world, key);
  if (!log) return;
  const [fx, fz] = pullOn(world, key, log.x, log.z);
  const F = Math.hypot(fx, fz);
  stepLog(world, log, F, F > 0 ? fx / F : 0, F > 0 ? fz / F : 0, dt);
}

/** Cast off every line on this vessel. */
function castOffFrom(world: WorldState, id: EntityId): void {
  castOffKey(world, vesselKey(id));
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
  // The lines: gone with what they were on, or with the boat towing (handed back, her
  // player left); debris and logs on them are towed along, by every line on each.
  const lines = linesOf(world);
  const pulled = new Set<string>();
  for (const [id, line] of Object.entries(lines)) {
    const boat = world.vessels[id];
    if (!boat || (!vesselOf(world, line.target) && !debrisOf(world, line.target) && !logOf(world, line.target))) {
      delete lines[id];
      continue;
    }
    if (!line.target.startsWith('v:')) pulled.add(line.target);
  }
  for (const key of pulled) {
    if (key.startsWith('d:')) stepTowedDebris(world, key, dt);
    else stepTowedLog(world, key, dt);
  }
  for (const [id, line] of Object.entries(lines)) stepTowWinch(line, world.vessels[id], dt);
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
    const busy = !!world.rescue?.active || !!world.fire?.job;
    const out = nearestPort(v.position[0], v.position[2]).dist > CONFIG.rescue.harbourRadius;
    // Only out of harbour, with nothing else on; otherwise the call waits.
    if (t.calls && !world.quietCalls && world.time >= t.nextAt && out && !busy) {
      // The region's own jobs where it has them (RegionDef.jobs.tows), else the open-water mix.
      const list = regionAt(v.position[0], v.position[2]).jobs?.tows;
      if (list?.length) {
        const total = list.reduce((s, j) => s + j.weight, 0);
        let r = rand(t) * total;
        const tpl = list.find((j) => (r -= j.weight) <= 0) ?? list[list.length - 1];
        startTowCall(world, v, tpl.kind, { name: tpl.name, at: tpl.at });
      } else startTowCall(world, v);
    }
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
    // A ship has to lie alongside a quay, not just inside the harbour.
    const ship = isShipJob(job);
    const alongside = !ship || shipBerthed(tow);
    job.inPort = port && speed < cfg.deliverSpeed && alongside ? job.inPort + dt : 0;
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
      sayRadio(world, 'info', ship ? `${name} harbour: her lines are ashore, skipper. Well berthed. Thank you, a fine job.` : `${name} harbour: we have her, skipper, cast off your line. Thank you, a fine tow.`);
    }
    return;
  }

  // The harbour takes her over: she's gone a few seconds after the hand-over (owner
  // feedback: delivered tows were left drifting about the harbour).
  if (job.phase === 'delivered' && tow) {
    if (world.time - (job.doneT ?? 0) > (isShipJob(job) ? cfg.shipRemoveAfter : cfg.removeAfter) && removeTow(world, job)) {
      t.job = null;
      t.nextAt = world.time + between(t, cfg.every);
    }
  }
}

/**
 * Tow intents (targetId: the workboat or env):
 *   towMake        make the towline fast (the hook on the bow eye; in range; args [1]: by the
 *                  line gun, within its range)
 *   towCast        cast it off
 *   towToggle      the menu: make fast if in range, else cast off
 *   towDebugNear   a tow job lying just astern, accepted (to try towing)
 *   towDebugCall   a tow call now
 *   towDebugEnd    end the tow job
 */
export function applyTowIntent(world: WorldState, intent: Intent): void {
  const t = (world.tow ??= createTowState());
  const lines = linesOf(world);
  const job = t.job;
  // The boat it's for: the one it's sent to (the player's boat), each with her own line.
  const v = towerFor(world, intent.targetId);
  switch (intent.control) {
    case 'towMake': {
      // ref: what to make fast to (a key from towTargets); none: the tow job's vessel.
      const key = intent.ref ?? (job?.phase === 'accepted' ? vesselKey(job.vesselId) : null);
      if (!key || !v || lines[v.id] || !towTargets(world, v.id).includes(key)) break;
      // A tow that's been handed over is the harbour's now.
      if (job && key === vesselKey(job.vesselId) && job.phase !== 'accepted') break;
      // By the line gun (tow/lineGun.ts; args [1]): made fast at the gun's range, not the hook's.
      const byGun = (intent.args?.[0] ?? 0) > 0.5;
      if (towReach(world, key, v.id, undefined, true) <= (byGun ? CONFIG.lineGun.range : lineFor(key).attach)) lines[v.id] = newLine(world, key, v.id);
      break;
    }
    case 'towToggle': {
      // The menu: cast off, or make fast to the nearest thing in reach.
      if (!v) break;
      if (lines[v.id]) delete lines[v.id];
      else {
        const key = nearestTowTarget(world, v.id);
        if (key) lines[v.id] = newLine(world, key, v.id);
      }
      break;
    }
    case 'towCast':
      if (v) delete lines[v.id];
      break;
    case 'towDebugNear': {
      if (!v || job) break;
      // Just astern of us, lying the same way, ready to make fast.
      const [qx, qy, qz, qw] = v.orientation;
      const fx = -(2 * (qx * qz + qw * qy));
      const fz = -(1 - 2 * (qx * qx + qy * qy));
      const len = Math.hypot(fx, fz) || 1;
      // A kind by name, or one of a size (the debug menu's Small / Medium / Large / Ship, owner), at random.
      const ofSize = TOW_DEFS.filter((d) => VESSEL_DEFS[d].tow?.size === intent.ref);
      const kind = TOW_DEFS.includes(intent.ref as (typeof TOW_DEFS)[number]) ? intent.ref! : ofSize.length ? ofSize[Math.floor(rand(t) * ofSize.length)] : TOW_DEFS[0];
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

/**
 * One line for displays while a tow job is on or something's on a boat's line (by default
 * the calls' boat's), else null. With other boats on the same tow, it says how many.
 */
export function towStatus(world: WorldState, boatId?: EntityId): string | null {
  const job = world.tow?.job;
  const line = lineOf(world, boatId);
  const others = line ? linesOn(world, line.target).length - 1 : 0;
  const kN = `${line ? Math.round(lineLength(line)) : 0} m out, ${((line?.tension ?? 0) / 1000).toFixed(1)} kN${winchStalled(world, boatId) ? ', winch stalled: ease off' : ''}${others ? `; ${others === 1 ? 'one other boat' : `${others} other boats`} on her too` : ''}`;
  if (line?.target.startsWith('l:')) return salvageStatus(world, boatId);
  if (line && !towFast(world, boatId)) {
    return line.target.startsWith('d:') ? `Towing debris: bring it into a harbour to clear it (${kN})` : `Towing ${towName(world, line.target)} (${kN})`;
  }
  if (!job) return null;
  if (job.phase === 'calling') return 'Tow wanted: pick up the handset';
  if (job.phase === 'delivered') return `Tow delivered to ${job.port ?? 'harbour'}`;
  if (towFast(world, boatId)) return isShipJob(job) ? `Towing the ship: into harbour, then cast off and push her onto a quay (${kN})` : `Towing: bring her into any harbour (${kN})`;
  if (job.phase === 'accepted' && towFast(world)) return 'Under tow by another boat: make fast to her bow eye too, to add your pull';
  const d = towReach(world, undefined, boatId, undefined, true);
  return d <= CONFIG.tow.attachRange ? 'Tow alongside: hook her bow eye to make fast' : `Tow adrift ${Math.round(d)} m off: go and get her`;
}

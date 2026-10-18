/**
 * Rescues during cargo runs. Plain-data simulation state (WorldState.rescue), stepped by
 * the host each tick, shared with the crew in the snapshots - the same pattern as cargo.
 *
 *   cargo run   cargo aboard bound for another port, and the boat out of harbour. When a
 *               run starts, it rolls once (CONFIG.rescue.chance) whether a call will come,
 *               and at what distance from the departure port.
 *   incident    one at a time. 'calling': the radio rings until someone picks up the
 *               handset (accepted) or the call times out (declined: it just goes away).
 *               'accepted': the search is on; the cargo run is paused (the radio and, from
 *               milestone 2, the chart show the rescue instead of the destination) and
 *               resumes when the rescue is over. 'recovered': everything is out of the
 *               water (recovery.ts); survivors sit on deck until she is moored alongside a
 *               quay, where they step ashore one by one ('landed': they wave from the quay
 *               a while, then the rescue closes).
 *               Recovered crates are cargo bound for any harbour (cargo.ts).
 *   radio       the latest message (id, text, kind). Every client's radio plays a message
 *               when its id changes.
 *
 * Random choices use a deterministic hash of a counter in the state, like the cargo code.
 */
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { isPowered } from '../vessel/electrics';
import { formatPosition } from '../nav/geo';

import { CONFIG } from '../config';
import { driftVelocity } from '../world/drift';
import type { EntityId } from '../core/ids';
import type { Intent } from '../core/intents';
import { homeVessel, type WorldState } from '../core/world';
import type { VesselState } from '../vessel/vesselState';
import { PORTS, type PortDef } from '../world/archipelago';
import { regionAt } from '../world/regions';
import { earn } from '../career/career';
import { berthById } from '../vessel/physics/mooring';
import { groundHeight } from '../world/terrain';
import { RESCUE_DEFS, type RescueDef } from './rescueDefs';
import type { Vec3 } from '../core/math';
import type { PreparedWave } from '../ocean/waves';
import { acceptTowCall, towStatus } from '../tow/tow';
import { acceptFireCall, fireStatus } from '../fire/fire';
import { fishingStatus } from '../fishing/fishing';
import { applyRecoveryIntent, freeSeat, stepRecovery, type HookState, type RingState, type Shout } from './recovery';

export interface RadioMessage {
  id: number;
  kind: 'distress' | 'reply' | 'info';
  text: string;
  /** World time it was sent (s). */
  t: number;
}

export interface CargoRun {
  from: string;
  to: string;
  /** Distance from the departure port at which the call comes (m), or null for no call. */
  triggerAt: number | null;
}

/** Something in the water to recover: a person in a lifejacket, or a floating crate. */
export interface RescueTarget {
  id: string;
  kind: 'person' | 'crate';
  /** World position on the water (m). */
  x: number;
  z: number;
  /** Recovery (rescue/recovery.ts). Absent = floating. */
  phase?: 'floating' | 'onLine' | 'climbing' | 'aboard' | 'hooked' | 'landing' | 'ashore';
  /** Climbing: seconds since they reached the stern. Landing: since they got up. */
  t?: number;
  /** Landing / ashore: where they stand ashore (world x, z). */
  shore?: [number, number];
  /** Aboard: where they sit (vessel axes). */
  seat?: Vec3;
  /** Hooked: by whom. Lifted crates: the cargo item they became. */
  hookedBy?: string;
  cargoId?: string;
}

export interface Incident {
  defId: string;
  targets: RescueTarget[];
  /**
   * calling -> accepted (searching, recovering) -> recovered (survivors aboard, to be
   * landed) -> landed (ashore; the rescue closes at `endT`).
   */
  phase: 'calling' | 'accepted' | 'recovered' | 'landed';
  /** Landing: world time the last survivor got up (s), and where (port name). */
  landT?: number;
  landedAt?: string;
  endT?: number;
  /** Last time the survivor shouted about the propeller (s). */
  propWarned?: number;
  /** The closing radio message has gone out. */
  doneSaid?: boolean;
  /** Centre of the search area (world, m) and its radius. */
  x: number;
  z: number;
  radius: number;
  count: number;
  /** World time of the call (s). */
  callT: number;
  /** Last time the alert sounded (s). */
  alertT: number;
}

export interface RescueState {
  seq: number;
  msgSeq: number;
  /** The port the boat was last in, and the run under way (if any). */
  lastPort: string | null;
  run: CargoRun | null;
  active: Incident | null;
  radio: RadioMessage | null;
  completed: number;
  /** Rescue gear and survivors' shouts (rescue/recovery.ts); counter for the cheer. */
  ring?: RingState;
  hook?: HookState;
  shout?: Shout;
  shoutSeq?: number;
  /** The last swimmer into a turning propeller (views spray red when `seq` changes). */
  strike?: { seq: number; pos: Vec3; player: string };
  strikeSeq?: number;
  /** When a crew-mate on the ring last shouted about the propeller (world time, s). */
  propWarnedCrew?: number;
  cheer?: number;
  /**
   * After a rescue, the cargo run carries on: no second call for cargo bound here (port id)
   * until she gets there.
   */
  quietTo?: string | null;
}

export function createRescueState(): RescueState {
  return { seq: 0, msgSeq: 0, lastPort: null, run: null, active: null, radio: null, completed: 0 };
}

/** Deterministic pseudo-random number in [0, 1) from the state's counter. */
function rand(r: RescueState): number {
  const n = ++r.seq;
  const s = Math.sin(n * 91.3458 + 47.123) * 43758.5453;
  return s - Math.floor(s);
}

const between = (r: RescueState, [a, b]: [number, number]) => a + (b - a) * rand(r);

export function portById(id: string): PortDef | undefined {
  return PORTS.find((p) => p.id === id);
}

export function nearestPort(x: number, z: number): { port: PortDef; dist: number } {
  let best = PORTS[0];
  let bd = Infinity;
  for (const p of PORTS) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) [best, bd] = [p, d];
  }
  return { port: best, dist: bd };
}

/**
 * The port most of the cargo aboard is bound for, or null if none. Counts items on deck and
 * items in the hands of players standing aboard.
 */
export function cargoDestination(world: WorldState, vesselId: EntityId): string | null {
  const counts = new Map<string, number>();
  for (const c of Object.values(world.cargo)) {
    const onDeck = 'vessel' in c.at && c.at.vessel === vesselId;
    const inHand = 'carriedBy' in c.at && world.players[c.at.carriedBy]?.aboardVesselId === vesselId;
    if ((onDeck || inHand) && portById(c.to)) counts.set(c.to, (counts.get(c.to) ?? 0) + 1);
  }
  let best: string | null = null;
  let bn = 0;
  for (const [to, n] of counts) if (n > bn) [best, bn] = [to, n];
  return best;
}

/** The cargo run is on hold from accepting a rescue until the survivors are landed. */
export function cargoPaused(world: WorldState): boolean {
  const ph = world.rescue?.active?.phase;
  return ph === 'accepted' || ph === 'recovered';
}

function say(r: RescueState, kind: RadioMessage['kind'], text: string, t: number): void {
  r.radio = { id: ++r.msgSeq, kind, text, t };
}

/** A radio message from outside the rescues (the towing missions share the VHF). */
export function sayRadio(world: WorldState, kind: RadioMessage['kind'], text: string): void {
  say((world.rescue ??= createRescueState()), kind, text, world.time);
}

function bearingDeg(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return ((Math.atan2(toX - fromX, -(toZ - fromZ)) * 180) / Math.PI + 360) % 360;
}

function pickDef(r: RescueState): RescueDef {
  const pool = RESCUE_DEFS.filter((d) => d.weight > 0);
  const total = pool.reduce((s, d) => s + d.weight, 0);
  let x = rand(r) * total;
  for (const d of pool) {
    x -= d.weight;
    if (x <= 0) return d;
  }
  return pool[pool.length - 1];
}

/**
 * Raise an incident ahead of the boat, a little off her route toward `toward` (a port id,
 * or null: straight ahead), in open water, and send the distress call.
 */
export function startIncident(world: WorldState, v: VesselState, toward: string | null, defId?: string, at?: { x: number; z: number; r: number }): Incident {
  const cfg = CONFIG.rescue;
  const r = world.rescue!;
  const def = (defId && RESCUE_DEFS.find((d) => d.id === defId)) || pickDef(r);
  const [bx, , bz] = v.position;
  const dest = toward ? portById(toward) : undefined;
  let dx: number;
  let dz: number;
  if (dest) {
    dx = dest.x - bx;
    dz = dest.z - bz;
  } else {
    // Straight ahead: the bow is -z in vessel axes.
    const [qx, qy, qz, qw] = v.orientation;
    dx = -(2 * (qx * qz + qw * qy));
    dz = -(1 - 2 * (qx * qx + qy * qy));
  }
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  let x = bx + dx * cfg.ahead[0];
  let z = bz + dz * cfg.ahead[0];
  // A region's job at its own spot (RegionDef.jobs.rescues `at`), else ahead of the boat.
  for (let i = 0; i < 24; i++) {
    let cx: number;
    let cz: number;
    if (at) {
      const ang = rand(r) * Math.PI * 2;
      const d = Math.sqrt(rand(r)) * at.r;
      cx = at.x + Math.cos(ang) * d;
      cz = at.z + Math.sin(ang) * d;
    } else {
      const a = between(r, cfg.ahead);
      const o = between(r, cfg.offset) * (rand(r) < 0.5 ? -1 : 1);
      cx = bx + dx * a - dz * o;
      cz = bz + dz * a + dx * o;
    }
    if (groundHeight(cx, cz) > -cfg.minDepth) continue;
    if (!at && nearestPort(cx, cz).dist < cfg.minPortDistance) continue;
    x = cx;
    z = cz;
    break;
  }
  const count = Math.round(between(r, [def.count[0], def.count[1] + 0.999]) - 0.499);
  const inc: Incident = { defId: def.id, phase: 'calling', x, z, radius: def.searchRadius, count, callT: world.time, alertT: world.time, targets: placeTargets(r, def, x, z, count) };
  r.active = inc;
  // Plot-it-yourself mode: the call gives the position only; the crew plots it on the chart.
  const call = cfg.plotYourself ? def.call.replace('bearing {bearing}, {range} miles from you', `last seen in position ${formatPosition(x, z)}`) : def.call;
  const text = call
    .replace('{bearing}', `${bearingDeg(bx, bz, x, z).toFixed(0).padStart(3, '0')}°`)
    .replace('{range}', (Math.hypot(x - bx, z - bz) / 1852).toFixed(1))
    .replace('{count}', String(count));
  say(r, 'distress', text, world.time);
  return inc;
}

/**
 * Where the people or crates are: somewhere inside the search area (not at its centre - the
 * area is where to look, not where they are), crates in a loose group.
 */
function placeTargets(r: RescueState, def: RescueDef, cx: number, cz: number, count: number): RescueTarget[] {
  const cfg = CONFIG.rescue;
  const ang = rand(r) * Math.PI * 2;
  const dist = Math.sqrt(rand(r)) * def.searchRadius * cfg.targetSpread;
  const gx = cx + Math.cos(ang) * dist;
  const gz = cz + Math.sin(ang) * dist;
  const out: RescueTarget[] = [];
  for (let i = 0; i < count; i++) {
    const a = rand(r) * Math.PI * 2;
    const d = i === 0 ? 0 : between(r, cfg.crateSpacing);
    out.push({ id: `t${r.seq}-${i}`, kind: def.target === 'person' ? 'person' : 'crate', x: gx + Math.cos(a) * d, z: gz + Math.sin(a) * d });
  }
  return out;
}

/** End the active rescue: closing message naming where to land what was recovered. */
export function finishIncident(world: WorldState, v: VesselState): void {
  const r = world.rescue!;
  const inc = r.active;
  if (!inc) return;
  const def = RESCUE_DEFS.find((d) => d.id === inc.defId);
  const harbour = nearestPort(v.position[0], v.position[2]).port.name.replace(' (anchorage)', '');
  r.active = null;
  r.completed += 1;
  const np = nearestPort(v.position[0], v.position[2]).port;
  earn(world, 'rescue', { port: np.id, people: inc.targets.filter((t) => t.kind === 'person').length, text: `Rescue (${np.name.replace(' (anchorage)', '')})` });
  const run = r.run ? ` Carry on to ${portById(r.run.to)?.name.replace(' (anchorage)', '')} when you're ready.` : '';
  say(r, 'info', (def?.done ?? 'Thank you, skipper.').replace('{harbour}', harbour) + run, world.time);
}

/**
 * Where survivors can be landed right now, or null: moored alongside a quay (they stand on
 * the quay in from the edge, spread along it). Anchorages have no quay.
 */
export function landingSpot(v: VesselState): { port: PortDef; at: (i: number, n: number) => [number, number] } | null {
  const cfg = CONFIG.rescue;
  if (v.mooring.phase === 'moored') {
    const b = berthById(v.mooring.berthId);
    const port = b && portById(b.portId);
    if (b && port) {
      const d = b.shoreDist + cfg.quayInset;
      // Along the quay: perpendicular to the shore direction.
      const ax = -b.shoreZ;
      const az = b.shoreX;
      return {
        port,
        at: (i, n) => {
          const o = (i - (n - 1) / 2) * cfg.ashoreSpacing;
          return [b.x + b.shoreX * d + ax * o, b.z + b.shoreZ * d + az * o];
        },
      };
    }
  }
  return null;
}

/** Survivors aboard step ashore one by one; when all are ashore the coastguard thanks you. */
function stepLanding(world: WorldState, r: RescueState, inc: Incident, v: VesselState, dt: number): void {
  const cfg = CONFIG.rescue;
  const people = inc.targets.filter((t) => t.kind === 'person');
  for (const t of people) {
    if (t.phase === 'landing') {
      t.t = (t.t ?? 0) + dt;
      if (t.t >= cfg.landTime) t.phase = 'ashore';
    }
  }
  if (inc.phase === 'recovered') {
    const spot = landingSpot(v);
    const next = people.find((t) => t.phase === 'aboard');
    const busy = inc.landT !== undefined && world.time - inc.landT < cfg.landEvery;
    if (spot && next && !busy) {
      const i = people.indexOf(next);
      next.phase = 'landing';
      next.t = 0;
      next.shore = spot.at(i, people.length);
      inc.landT = world.time;
      inc.landedAt = spot.port.name.replace(' (anchorage)', '');
    }
    if (people.length && people.every((t) => t.phase === 'ashore')) {
      const def = RESCUE_DEFS.find((d) => d.id === inc.defId);
      inc.phase = 'landed';
      inc.endT = world.time + cfg.ashoreTime;
      r.completed += 1;
      const lp = PORTS.find((p) => p.name.replace(' (anchorage)', '') === inc.landedAt);
      earn(world, 'rescue', { port: lp?.id ?? null, people: people.length, text: `Rescue: survivors landed at ${inc.landedAt}` });
      r.cheer = (r.cheer ?? 0) + 1;
      const dest = r.run?.to ?? cargoDestination(world, v.id);
      r.quietTo = dest;
      const carryOn = dest ? ` Carry on to ${portById(dest)?.name.replace(' (anchorage)', '')} when you're ready.` : '';
      say(r, 'info', (def?.landed ?? 'Thank you, skipper.').replace('{harbour}', inc.landedAt ?? 'the harbour') + carryOn, world.time);
    }
  }
  if (inc.phase === 'landed' && world.time >= (inc.endT ?? 0)) r.active = null;
}

/** The vessel the rescues follow: the home boat, if she has places to take survivors aboard (her hull's fittings). */
function rescueVessel(world: WorldState): VesselState | undefined {
  const v = homeVessel(world);
  return v && VESSEL_DEFS[v.defId].rescueGear ? v : undefined;
}

/** One tick: track cargo runs, roll and raise calls, time out unanswered ones, drift targets, recovery. */
const driftV = { x: 0, z: 0 };

export function stepRescue(world: WorldState, dt: number, waves: readonly PreparedWave[] = []): void {
  const cfg = CONFIG.rescue;
  const r = (world.rescue ??= createRescueState());
  const v = rescueVessel(world);
  if (!v) return;
  const [x, , z] = v.position;
  const near = nearestPort(x, z);

  if (near.dist < cfg.harbourRadius) {
    // In harbour: whatever run there was is over; the next one starts from here.
    r.lastPort = near.port.id;
    r.run = null;
    if (r.quietTo === near.port.id) r.quietTo = null;
  } else {
    const dest = cargoDestination(world, v.id);
    if (dest && !r.run && dest !== r.lastPort) {
      const from = r.lastPort ?? near.port.id;
      const a = portById(from)!;
      const b = portById(dest)!;
      const route = Math.hypot(b.x - a.x, b.z - a.z);
      // One rescue per delivery: cargo that already stopped for one carries on in peace.
      const call = rand(r) < cfg.chance && dest !== r.quietTo;
      r.run = { from, to: dest, triggerAt: call ? route * between(r, cfg.triggerFraction) : null };
    }
    const run = r.run;
    // A tow job on: the call waits until it's over.
    if (run && run.triggerAt !== null && !world.quietCalls && !r.active && !world.tow?.job && !world.fire?.job) {
      const a = portById(run.from)!;
      if (Math.hypot(x - a.x, z - a.z) >= run.triggerAt) {
        run.triggerAt = null; // one call per run
        // The region's own rescues where it has them (RegionDef.jobs.rescues).
        const list = regionAt(x, z).jobs?.rescues;
        if (list?.length) {
          const total = list.reduce((s, j) => s + j.weight, 0);
          let pick = rand(r) * total;
          const tpl = list.find((j) => (pick -= j.weight) <= 0) ?? list[list.length - 1];
          startIncident(world, v, run.to, tpl.def, tpl.at);
        } else startIncident(world, v, run.to);
      }
    }
  }

  const inc = r.active;
  if (inc) {
    for (const t of inc.targets) {
      if (!t.phase || t.phase === 'floating') {
        // The set, the wind's leeway and any race: things in the water drift (world/drift.ts).
        const d = driftVelocity(world.environment, t.x, t.z, driftV);
        t.x += d.x * dt;
        t.z += d.z * dt;
      }
    }
  }
  stepRecovery(world, v, waves, dt);
  if (inc && (inc.phase === 'recovered' || inc.phase === 'landed')) stepLanding(world, r, inc, v, dt);
  if (inc && inc.phase === 'recovered' && !inc.doneSaid) {
    inc.doneSaid = true;
    const def = RESCUE_DEFS.find((d) => d.id === inc.defId);
    const harbour = nearestPort(x, z).port.name.replace(' (anchorage)', '');
    say(r, 'info', (def?.done ?? 'Thank you, skipper.').replace('{harbour}', harbour), world.time);
    // Only crates: they're cargo now (land them at any harbour), so the rescue is over.
    if (!inc.targets.some((t) => t.kind === 'person')) {
      r.active = null;
      r.completed += 1;
          earn(world, 'rescue', { port: nearestPort(x, z).port.id, people: 0, text: 'Lost cargo recovered' });
    }
  }
  if (inc?.phase === 'calling') {
    if (world.time - inc.callT > cfg.callTimeout) {
      r.active = null;
      say(r, 'info', 'All stations: the vessel in distress is now being assisted by another vessel. Out.', world.time);
    } else if (world.time - inc.alertT > cfg.callRepeat) {
      inc.alertT = world.time; // the radio repeats its alert (views watch alertT)
    }
  }
}

/**
 * Rescue intents:
 *   rescueHandset  value 1: someone picked up the radio handset - accepts a call
 *   rescueDebugTrigger  raise an incident now (ahead of the boat)
 *   rescueDebugAboard   a survivor sitting aboard (to try landing)
 *   rescueDebugComplete end the active rescue as if done
 */
export function applyRescueIntent(world: WorldState, intent: Intent): void {
  const r = (world.rescue ??= createRescueState());
  const v = rescueVessel(world);
  if (applyRecoveryIntent(world, v, intent)) return;
  switch (intent.control) {
    case 'rescueHandset': {
      // A ringing tow call is answered the same way.
      if (intent.value > 0.5 && (acceptTowCall(world) || acceptFireCall(world))) break;
      const inc = r.active;
      // The VHF needs 12 V: with the bridge dark the call just rings out unheard.
      if (intent.value > 0.5 && inc?.phase === 'calling' && (!v || isPowered(v, 'radio'))) {
        inc.phase = 'accepted';
        const client = r.run ? ' Your cargo client has been told.' : '';
        say(r, 'reply', `Thanks, skipper.${client} Search area is on your chart.`, world.time);
      }
      break;
    }
    case 'rescueDebugTrigger':
      if (v && !r.active) startIncident(world, v, r.run?.to ?? null, intent.ref);
      break;
    case 'rescueDebugNear': {
      // A target alongside, off the bow, already accepted: for trying out spotting and recovery.
      if (!v || r.active) break;
      const def = RESCUE_DEFS.find((d) => d.id === intent.ref) ?? RESCUE_DEFS[0];
      const [qx, qy, qz, qw] = v.orientation;
      const fx = -(2 * (qx * qz + qw * qy));
      const fz = -(1 - 2 * (qx * qx + qy * qy));
      const len = Math.hypot(fx, fz) || 1;
      const d = CONFIG.rescue.debugSpawnDistance;
      const x = v.position[0] + (fx / len) * d;
      const z = v.position[2] + (fz / len) * d;
      const count = def.count[1];
      const targets = placeTargets(r, { ...def, searchRadius: 0 }, x, z, count);
      r.active = { defId: def.id, phase: 'accepted', x, z, radius: def.searchRadius, count, callT: world.time, alertT: world.time, targets };
      say(r, 'info', `Debug: ${def.target === 'person' ? 'a person' : 'crates'} in the water off your bow.`, world.time);
      break;
    }
    case 'rescueDebugAboard': {
      // A survivor already sitting aboard, to try landing them.
      if (!v || r.active) break;
      const inc: Incident = { defId: 'manOverboard', phase: 'recovered', doneSaid: true, x: v.position[0], z: v.position[2], radius: 0, count: 1, callT: world.time, alertT: world.time, targets: [] };
      r.active = inc;
      inc.targets.push({ id: `t${++r.seq}-0`, kind: 'person', x: v.position[0], z: v.position[2], phase: 'aboard', seat: freeSeat(r, v) });
      say(r, 'info', 'Debug: a survivor aboard. Dock at a quay to land them.', world.time);
      break;
    }
    case 'rescueDebugComplete':
      if (v) finishIncident(world, v);
      break;
  }
}

export function isRescueIntent(control: string): boolean {
  return control.startsWith('rescue') || control.startsWith('ring') || control.startsWith('hook') || control.startsWith('crate');
}

/** One line for displays: the cargo aboard and the run, or the rescue that has paused it. */
export function runStatus(world: WorldState): string {
  const r = world.rescue;
  const inc = r?.active;
  const v = rescueVessel(world);
  const short = (id: string | null | undefined) => (id ? portById(id)?.name.replace(' (anchorage)', '') : undefined);
  // The run under way, or (still in harbour) the cargo already aboard.
  const runTo = short(r?.run?.to);
  const aboardTo = v ? short(cargoDestination(world, v.id)) : undefined;
  if (inc?.phase === 'calling') return 'Distress call: pick up the handset';
  const tow = !inc ? (towStatus(world) ?? fireStatus(world) ?? fishingStatus(world)) : null;
  if (tow) return tow;
  if (inc?.phase === 'accepted') return runTo || aboardTo ? `Cargo for ${runTo ?? aboardTo}: paused (rescue)` : 'Rescue under way';
  if (inc?.phase === 'recovered') {
    const people = inc.targets.filter((t) => t.kind === 'person' && t.phase !== 'ashore').length;
    return people ? `${people === 1 ? 'Survivor' : 'Survivors'} aboard: dock alongside a quay to land them` : 'Survivors going ashore';
  }
  if (inc?.phase === 'landed') return `Survivors landed at ${inc.landedAt}${runTo || aboardTo ? ` · cargo for ${runTo ?? aboardTo}` : ''}`;
  if (runTo) return `Cargo run to ${runTo}`;
  if (aboardTo) {
    const here = v && nearestPort(v.position[0], v.position[2]);
    if (here && here.dist < CONFIG.rescue.harbourRadius && short(here.port.id) === aboardTo) return `Cargo for ${aboardTo}: set it down ashore`;
    return `Cargo for ${aboardTo}: loaded, head out`;
  }
  return 'No cargo aboard';
}

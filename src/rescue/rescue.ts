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
 *               resumes when the rescue is over.
 *   radio       the latest message (id, text, kind). Every client's radio plays a message
 *               when its id changes.
 *
 * Random choices use a deterministic hash of a counter in the state, like the cargo code.
 */
import { CONFIG } from '../config';
import type { EntityId } from '../core/ids';
import type { Intent } from '../core/intents';
import type { WorldState } from '../core/world';
import type { VesselState } from '../vessel/vesselState';
import { PORTS, type PortDef } from '../world/archipelago';
import { groundHeight } from '../world/terrain';
import { RESCUE_DEFS, type RescueDef } from './rescueDefs';

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

export interface Incident {
  defId: string;
  phase: 'calling' | 'accepted';
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

/** The port most of the cargo aboard is bound for, or null if none. */
export function cargoDestination(world: WorldState, vesselId: EntityId): string | null {
  const counts = new Map<string, number>();
  for (const c of Object.values(world.cargo)) {
    if ('vessel' in c.at && c.at.vessel === vesselId && portById(c.to)) counts.set(c.to, (counts.get(c.to) ?? 0) + 1);
  }
  let best: string | null = null;
  let bn = 0;
  for (const [to, n] of counts) if (n > bn) [best, bn] = [to, n];
  return best;
}

/** The cargo run is on hold while a rescue is accepted. */
export function cargoPaused(world: WorldState): boolean {
  return world.rescue?.active?.phase === 'accepted';
}

function say(r: RescueState, kind: RadioMessage['kind'], text: string, t: number): void {
  r.radio = { id: ++r.msgSeq, kind, text, t };
}

function bearingDeg(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return ((Math.atan2(toX - fromX, -(toZ - fromZ)) * 180) / Math.PI + 360) % 360;
}

function pickDef(r: RescueState): RescueDef {
  const total = RESCUE_DEFS.reduce((s, d) => s + d.weight, 0);
  let x = rand(r) * total;
  for (const d of RESCUE_DEFS) {
    x -= d.weight;
    if (x <= 0) return d;
  }
  return RESCUE_DEFS[RESCUE_DEFS.length - 1];
}

/**
 * Raise an incident ahead of the boat, a little off her route toward `toward` (a port id,
 * or null: straight ahead), in open water, and send the distress call.
 */
export function startIncident(world: WorldState, v: VesselState, toward: string | null, defId?: string): Incident {
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
  for (let i = 0; i < 24; i++) {
    const a = between(r, cfg.ahead);
    const o = between(r, cfg.offset) * (rand(r) < 0.5 ? -1 : 1);
    const cx = bx + dx * a - dz * o;
    const cz = bz + dz * a + dx * o;
    if (groundHeight(cx, cz) > -cfg.minDepth) continue;
    if (nearestPort(cx, cz).dist < cfg.minPortDistance) continue;
    x = cx;
    z = cz;
    break;
  }
  const count = Math.round(between(r, [def.count[0], def.count[1] + 0.999]) - 0.499);
  const inc: Incident = { defId: def.id, phase: 'calling', x, z, radius: def.searchRadius, count, callT: world.time, alertT: world.time };
  r.active = inc;
  const text = def.call
    .replace('{bearing}', `${bearingDeg(bx, bz, x, z).toFixed(0).padStart(3, '0')}°`)
    .replace('{range}', (Math.hypot(x - bx, z - bz) / 1852).toFixed(1))
    .replace('{count}', String(count));
  say(r, 'distress', text, world.time);
  return inc;
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
  const run = r.run ? ` Carry on to ${portById(r.run.to)?.name.replace(' (anchorage)', '')} when you're ready.` : '';
  say(r, 'info', (def?.done ?? 'Thank you, skipper.').replace('{harbour}', harbour) + run, world.time);
}

/** The vessel the rescues follow: the first one (the cargo boat). */
function rescueVessel(world: WorldState): VesselState | undefined {
  return Object.values(world.vessels)[0];
}

/** One tick: track cargo runs, roll and raise calls, time out unanswered ones. */
export function stepRescue(world: WorldState): void {
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
  } else {
    const dest = cargoDestination(world, v.id);
    if (dest && !r.run && dest !== r.lastPort) {
      const from = r.lastPort ?? near.port.id;
      const a = portById(from)!;
      const b = portById(dest)!;
      const route = Math.hypot(b.x - a.x, b.z - a.z);
      const call = rand(r) < cfg.chance;
      r.run = { from, to: dest, triggerAt: call ? route * between(r, cfg.triggerFraction) : null };
    }
    const run = r.run;
    if (run && run.triggerAt !== null && !r.active) {
      const a = portById(run.from)!;
      if (Math.hypot(x - a.x, z - a.z) >= run.triggerAt) {
        run.triggerAt = null; // one call per run
        startIncident(world, v, run.to);
      }
    }
  }

  const inc = r.active;
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
 *   rescueDebugComplete end the active rescue as if done
 */
export function applyRescueIntent(world: WorldState, intent: Intent): void {
  const r = (world.rescue ??= createRescueState());
  const v = rescueVessel(world);
  switch (intent.control) {
    case 'rescueHandset': {
      const inc = r.active;
      if (intent.value > 0.5 && inc?.phase === 'calling') {
        inc.phase = 'accepted';
        const client = r.run ? ' Your cargo client has been told.' : '';
        say(r, 'reply', `Thanks, skipper.${client} Search area is on your chart.`, world.time);
      }
      break;
    }
    case 'rescueDebugTrigger':
      if (v && !r.active) startIncident(world, v, r.run?.to ?? null, intent.ref);
      break;
    case 'rescueDebugComplete':
      if (v) finishIncident(world, v);
      break;
  }
}

export function isRescueIntent(control: string): boolean {
  return control.startsWith('rescue');
}

/** One line for displays: the cargo run, or the rescue that has paused it. */
export function runStatus(world: WorldState): string {
  const r = world.rescue;
  const inc = r?.active;
  const run = r?.run;
  const to = run ? portById(run.to)?.name.replace(' (anchorage)', '') : null;
  if (inc?.phase === 'accepted') return to ? `Cargo for ${to}: paused (rescue)` : 'Rescue under way';
  if (inc?.phase === 'calling') return 'Distress call: pick up the handset';
  if (to) return `Cargo run to ${to}`;
  return 'No cargo run';
}

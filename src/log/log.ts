/**
 * The ship's log: plain shared state (WorldState.log), host-authoritative like the
 * whiteboard. The logbook view on the chart table draws it and sends intents.
 *
 *   voyage   from a departure to an arrival. Entries go into the open voyage (one is
 *            opened if there's none); an arrival entry closes it. The last
 *            `keepVoyages` are kept, and the host saves them in its browser.
 *   events   loggable things that happened (left harbour, arrived): each puts a "Log: ..."
 *            duty on the duty board and fills in the port when that entry is written.
 *            Unlogged, they drop off after `eventLinger` s.
 *   draft    the new entry being written on the right-hand page: its type and the values
 *            picked so far. One writer at a time (`by`, a simple lock); someone else can
 *            take it over once it's been left alone for `draftIdle` s.
 *   checks   values the crew reads off the boat (fuel) are checked against the real
 *            state when signed: a correct one gets a tick. A wrong one is still written
 *            (it's their log). The arrival entry shows the voyage's score.
 *
 * Intents (targetId: environment): logBegin [type index], logPick ref=field [value
 * index], logSign, logCancel.
 */
import { CONFIG } from '../config';
import type { EntityId } from '../core/ids';
import type { Intent } from '../core/intents';
import type { WorldState } from '../core/world';
import { formatPosition } from '../nav/geo';
import { berthById } from '../vessel/physics/mooring';
import { isWorkboat, VESSEL_DEFS } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { PORTS } from '../world/archipelago';

/** Entry types, in the order of the buttons on the page (more come with milestone 8). */
export const LOG_TYPES = ['departure', 'arrival'] as const;
export type LogType = (typeof LOG_TYPES)[number];

/** The values the crew picks for each type of entry. */
export const FUEL_WORDS = ['Full', '¾', '½', '¼'] as const;
export const LOG_FIELDS: Record<LogType, { key: string; label: string; options: readonly string[] }[]> = {
  departure: [{ key: 'fuel', label: 'Fuel (read the gauge)', options: FUEL_WORDS }],
  arrival: [{ key: 'fuel', label: 'Fuel (read the gauge)', options: FUEL_WORDS }],
};
export const LOG_TITLES: Record<LogType, string> = { departure: 'Departure', arrival: 'Arrival' };

export interface LogField {
  key: string;
  value: string;
  /** Checked against the boat when signed (absent: nothing to check). */
  correct?: boolean;
}

export interface LogEntry {
  id: number;
  type: LogType;
  /** Ship's clock "HH:MM" and position (lat/long) when signed. */
  time: string;
  pos: string;
  /** The port (departures, arrivals). */
  port?: string;
  fields: LogField[];
  remarks?: string;
  /** Who signed it (player name). */
  by: string;
  /** Arrival: correct readings / readings checked this voyage. */
  score?: [number, number];
}

export interface Voyage {
  id: number;
  entries: LogEntry[];
  closed: boolean;
}

export interface LogEvent {
  id: number;
  type: LogType;
  port?: string;
  /** World time it happened (s). */
  at: number;
  logged: boolean;
}

export interface LogDraft {
  type: LogType;
  values: Record<string, string>;
  by: EntityId;
  byName: string;
  /** World time it was last touched (s). */
  touched: number;
}

export interface LogState {
  voyages: Voyage[];
  events: LogEvent[];
  draft: LogDraft | null;
  /** Counts every change (views redraw, the host saves). */
  seq: number;
  entrySeq: number;
  /** Where the workboat was (harbour detection): the port she's in, and her mooring phase. */
  harbour: string | null;
  mooredAt: string | null;
  started: boolean;
}

export function createLog(): LogState {
  return { voyages: [], events: [], draft: null, seq: 0, entrySeq: 0, harbour: null, mooredAt: null, started: false };
}

export function isLogIntent(control: string): boolean {
  return control === 'logBegin' || control === 'logPick' || control === 'logSign' || control === 'logCancel';
}

/** The fuel gauge, in the words a log uses: the nearest of Full / ¾ / ½ / ¼. */
export function fuelWord(v: VesselState): string {
  const tank = VESSEL_DEFS[v.defId].engine?.fuel.tankL ?? 1;
  const f = v.engine.fuelL / tank;
  const levels = [1, 0.75, 0.5, 0.25];
  let best = 0;
  levels.forEach((l, i) => {
    if (Math.abs(f - l) < Math.abs(f - levels[best])) best = i;
  });
  return FUEL_WORDS[best];
}

function workboat(world: WorldState): VesselState | undefined {
  return Object.values(world.vessels).find((x) => isWorkboat(VESSEL_DEFS[x.defId]));
}

function portName(id: string | null | undefined): string | undefined {
  return PORTS.find((p) => p.id === id)?.name;
}

/** The ship's clock, "HH:MM". */
export function clockTime(timeOfDay: number): string {
  const h = Math.floor(timeOfDay) % 24;
  const m = Math.floor((timeOfDay - Math.floor(timeOfDay)) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** The oldest unlogged event of a type (its port goes in the entry). */
export function pendingEvent(log: LogState, type: LogType): LogEvent | undefined {
  return log.events.find((e) => e.type === type && !e.logged);
}

/** Watch the workboat for loggable events: leaving harbour, arriving (host, each tick). */
export function stepLog(world: WorldState): void {
  const log = (world.log ??= createLog());
  const v = workboat(world);
  if (!v) return;
  const [x, , z] = v.position;
  const near = PORTS.find((p) => Math.hypot(p.x - x, p.z - z) < CONFIG.log.harbourRadius)?.id ?? null;
  // Arrival: made fast at a berth, or anchored in an anchorage's circle.
  const berth = v.mooring.phase === 'moored' ? (berthById(v.mooring.berthId)?.portId ?? null) : null;
  const anchorage = v.anchor.phase === 'set' ? (PORTS.find((p) => p.cargo.anchorage && Math.hypot(p.cargo.anchorage.x - x, p.cargo.anchorage.z - z) < p.cargo.anchorage.radius)?.id ?? null) : null;
  const arrivedAt = berth ?? anchorage;
  if (!log.started) {
    // Whatever she's doing when the session starts isn't news.
    log.started = true;
    log.harbour = near;
    log.mooredAt = arrivedAt;
    return;
  }
  const add = (type: LogType, port: string | null) => {
    log.entrySeq += 1;
    log.events.push({ id: log.entrySeq, type, port: portName(port), at: world.time, logged: false });
    log.seq += 1;
  };
  if (log.harbour && !near) add('departure', log.harbour);
  if (arrivedAt && arrivedAt !== log.mooredAt) add('arrival', arrivedAt);
  log.harbour = near;
  log.mooredAt = arrivedAt;
  // Old events nobody logged drop off.
  const before = log.events.length;
  log.events = log.events.filter((e) => !e.logged && world.time - e.at < CONFIG.log.eventLinger);
  if (log.events.length !== before) log.seq += 1;
}

export function applyLogIntent(world: WorldState, intent: Intent): void {
  const log = (world.log ??= createLog());
  const d = log.draft;
  const who = intent.playerId;
  const name = world.players[who]?.name ?? '';
  // The lock: someone else's draft, unless it's been left alone.
  const locked = !!d && d.by !== who && world.time - d.touched < CONFIG.log.draftIdle;
  switch (intent.control) {
    case 'logBegin': {
      if (locked) return;
      const type = LOG_TYPES[Math.round(intent.args?.[0] ?? -1)];
      if (!type) return;
      log.draft = { type, values: {}, by: who, byName: name, touched: world.time };
      break;
    }
    case 'logPick': {
      if (!d || locked) return;
      const field = LOG_FIELDS[d.type].find((f) => f.key === intent.ref);
      const value = field?.options[Math.round(intent.args?.[0] ?? -1)];
      if (!field || value === undefined) return;
      d.values[field.key] = value;
      d.by = who;
      d.byName = name;
      d.touched = world.time;
      break;
    }
    case 'logCancel':
      if (!d || locked) return;
      log.draft = null;
      break;
    case 'logSign': {
      if (!d || locked) return;
      const fields = LOG_FIELDS[d.type];
      if (fields.some((f) => !d.values[f.key])) return; // not filled in yet
      sign(world, log, d, name);
      log.draft = null;
      break;
    }
    default:
      return;
  }
  log.seq += 1;
}

/** Write the draft into the open voyage: time, position, port, checked values. */
function sign(world: WorldState, log: LogState, d: LogDraft, name: string): void {
  const v = workboat(world);
  let voyage = log.voyages[log.voyages.length - 1];
  if (!voyage || voyage.closed) {
    voyage = { id: (voyage?.id ?? 0) + 1, entries: [], closed: false };
    log.voyages.push(voyage);
    while (log.voyages.length > CONFIG.log.keepVoyages) log.voyages.shift();
  }
  const ev = pendingEvent(log, d.type);
  const fields: LogField[] = LOG_FIELDS[d.type].map((f) => {
    const value = d.values[f.key];
    const truth = f.key === 'fuel' && v ? fuelWord(v) : undefined;
    return truth === undefined ? { key: f.key, value } : { key: f.key, value, correct: value === truth };
  });
  log.entrySeq += 1;
  const entry: LogEntry = {
    id: log.entrySeq,
    type: d.type,
    time: clockTime(world.environment.timeOfDay),
    pos: v ? formatPosition(v.position[0], v.position[2]) : '',
    port: ev?.port ?? nearestPortName(v),
    fields,
    by: name,
  };
  if (d.type === 'arrival') {
    // The voyage's score: correct readings out of those checked, this entry included.
    const checked = [...voyage.entries.flatMap((e) => e.fields), ...fields].filter((f) => f.correct !== undefined);
    entry.score = [checked.filter((f) => f.correct).length, checked.length];
    voyage.closed = true;
  }
  voyage.entries.push(entry);
  if (ev) ev.logged = true;
}

function nearestPortName(v: VesselState | undefined): string | undefined {
  if (!v) return undefined;
  let best: (typeof PORTS)[number] | undefined;
  let bd = Infinity;
  for (const p of PORTS) {
    const d = Math.hypot(p.x - v.position[0], p.z - v.position[2]);
    if (d < bd) [best, bd] = [p, d];
  }
  return best?.name;
}

/** A saved log (from localStorage), checked loosely: anything malformed is dropped. */
export function parseLog(raw: string | null): LogState | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { voyages?: unknown };
    if (!Array.isArray(o.voyages)) return null;
    const voyages = (o.voyages as Voyage[])
      .filter((v) => v && typeof v.id === 'number' && Array.isArray(v.entries))
      .map((v) => ({ id: v.id, closed: !!v.closed, entries: v.entries.filter((e) => e && LOG_TYPES.includes(e.type) && typeof e.time === 'string' && Array.isArray(e.fields)) }))
      .slice(-CONFIG.log.keepVoyages);
    const log = createLog();
    log.voyages = voyages;
    log.entrySeq = Math.max(0, ...voyages.flatMap((v) => v.entries.map((e) => e.id)));
    return log;
  } catch {
    return null;
  }
}

/** What the host saves: the voyages only. */
export function serializeLog(log: LogState): string {
  return JSON.stringify({ voyages: log.voyages });
}

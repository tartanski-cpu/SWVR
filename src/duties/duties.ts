/**
 * The duty board's task list: everything the game asks of the crew (start-up, and later
 * log entries due, fog signal, close hatches, transit jobs). Plain data in WorldState, so
 * it is host-authoritative and shared like the rest; the board view only draws it. The
 * crew's own whiteboard (board/board.ts) is separate and never gets game tasks.
 *
 *   - Each duty has a title and, optionally, steps. Steps tick off by themselves when the
 *     world shows them done (they stay ticked).
 *   - A finished duty stays up, ticked, for `doneLinger` seconds, then drops off. One that
 *     is ignored drops off quietly after its own `expireAt` (start-up never does while the
 *     boat is cold). No penalty either way.
 *
 * The duties:
 *   startup     while the boat is cold: the start-up procedure.
 *   fogSignal   under way in restricted visibility (COLREG rule 35): nav lights on and a
 *               prolonged blast on the horn (4 s+) every two minutes. The blast step un-ticks
 *               when the next one is due. Done when the fog clears (if you sounded it).
 *   secure      rain or a squall forecast (or here): close the forepeak hatch, lash the deck
 *               cargo (wipers on, optional). Dropped if the weather turns fair first.
 *   bilge       water over the alarm level: bilge breaker on, pump her dry.
 */
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { visibilityAt } from '../environment/weather';
import { isPowered } from '../vessel/electrics';
import { leverDemand } from '../vessel/physics/propulsion';
import { isWorkboat, VESSEL_DEFS, type WorkboatDef } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';

export interface DutyStep {
  text: string;
  done: boolean;
  /** Shown but not needed to finish the duty. */
  optional?: boolean;
}

export interface Duty {
  id: string;
  kind: 'startup' | 'fogSignal' | 'secure' | 'bilge';
  title: string;
  steps: DutyStep[];
  createdAt: number;
  doneAt?: number;
  /** Quietly dropped at this world time if not done (undefined: never). */
  expireAt?: number;
  /** fogSignal: when the horn went down, and the last prolonged blast (world time). */
  hornFrom?: number;
  lastBlast?: number;
  /** Stays up even with every step ticked (fogSignal, until the fog clears). */
  holdOpen?: boolean;
}

export interface DutiesState {
  items: Duty[];
  seq: number;
  /** Duties completed so far (the board's little tally; the App plays a tick on change). */
  completed: number;
}

export function createDuties(): DutiesState {
  return { items: [], seq: 0, completed: 0 };
}

/** The boat's start-up steps, in order, with how to tell each is done. */
const STARTUP: { text: string; check: (v: VesselState, def: WorkboatDef) => boolean; optional?: boolean }[] = [
  { text: 'Battery master ON (aft wall, by the door)', check: (v) => (v.electrics?.master ?? 1) > 0 },
  { text: 'INSTR breaker ON (panel by the helm)', check: (v) => (v.electrics?.breakers.instruments ?? 1) > 0 },
  { text: 'Throttle in NEUTRAL', check: (v, def) => leverDemand(def, v.controls.lever).gear === 0 },
  { text: 'Key ON, hold HEAT until the glow lamp goes out', check: (v, def) => v.engine.key > 0 && v.engine.glow >= def.engine.preheatTime },
  { text: 'Hold START until she runs', check: (v) => v.engine.phase === 'running' },
  { text: 'Breakers as needed: CHART, RADIO, NAV LTS', check: (v) => !!v.electrics && v.electrics.breakers.chart > 0 && v.electrics.breakers.radio > 0, optional: true },
];

/** Is the boat cold: engine off and below the cold-start temperature? */
function isCold(v: VesselState, def: WorkboatDef): boolean {
  return v.engine.phase === 'off' && v.engine.coolantC < def.engine.coldBelowC;
}

function addDuty(d: DutiesState, kind: Duty['kind'], title: string, steps: DutyStep[], now: number): Duty {
  const duty: Duty = { id: `duty-${++d.seq}`, kind, title, steps, createdAt: now };
  d.items.unshift(duty);
  return duty;
}

function open(d: DutiesState, kind: Duty['kind']): Duty | undefined {
  return d.items.find((x) => x.kind === kind && x.doneAt === undefined);
}

/** Restricted visibility: nav lights on, a prolonged blast every two minutes. */
function stepFogSignal(world: WorldState, d: DutiesState, v: VesselState): void {
  const cfg = CONFIG.duties;
  const now = world.time;
  const vis = visibilityAt(world.environment, v.position[0], v.position[2]);
  let duty = open(d, 'fogSignal');
  if (!duty) {
    if (vis >= cfg.fogVis || v.engine.phase !== 'running') return;
    duty = addDuty(
      d,
      'fogSignal',
      'Restricted visibility',
      [
        { text: 'NAV LTS breaker and nav lights ON', done: false },
        { text: `Prolonged blast on the horn (${cfg.blastMin} s+), every ${cfg.blastEvery / 60} min`, done: false },
        { text: 'Safe speed: keep a lookout, slow down', done: false, optional: true },
      ],
      now,
    );
  }
  const navOn = isPowered(v, 'navLights') && v.controls.navLights > 0;
  duty.steps[0].done = navOn;
  // The horn: time the blast while it's held; a long enough one counts.
  const sounding = v.controls.horn > 0 && isPowered(v);
  if (sounding && duty.hornFrom === undefined) duty.hornFrom = now;
  if (!sounding && duty.hornFrom !== undefined) {
    if (now - duty.hornFrom >= cfg.blastMin) duty.lastBlast = now;
    duty.hornFrom = undefined;
  }
  if (sounding && duty.hornFrom !== undefined && now - duty.hornFrom >= cfg.blastMin) duty.lastBlast = now;
  duty.steps[1].done = duty.lastBlast !== undefined && now - duty.lastBlast < cfg.blastEvery;
  // Cleared: done if the signal was kept, else it just goes.
  duty.holdOpen = vis <= cfg.fogClearVis;
  if (vis > cfg.fogClearVis) {
    if (duty.lastBlast !== undefined) duty.steps.forEach((s) => (s.done = true));
    else duty.expireAt = now;
  }
}

/** Heavy weather coming (forecast) or here: hatch shut, cargo lashed. */
function stepSecure(world: WorldState, d: DutiesState, v: VesselState): void {
  const w = world.environment.weather;
  if (!w || !VESSEL_DEFS[v.defId].hatch) return;
  const now = world.time;
  const wet = (p: string) => p === 'Rain' || p === 'Squall';
  const fc = world.forecast;
  const warned = !!fc && now - fc.at < CONFIG.duties.forecastValid && wet(fc.next);
  const heavy = warned || wet(w.preset);
  const loose = Object.values(world.cargo).some((c) => 'vessel' in c.at && c.at.vessel === v.id && !c.at.lashed);
  let duty = open(d, 'secure');
  if (!duty) {
    if (!heavy || (v.controls.hatch <= 0 && !loose)) return;
    duty = addDuty(
      d,
      'secure',
      `${w.preset === 'Squall' || fc?.next === 'Squall' ? 'Squall' : 'Rain'}${wet(w.preset) ? '' : ' coming'}: secure the boat`,
      [
        { text: 'Close the forepeak hatch (foredeck)', done: false },
        { text: 'Lash all deck cargo', done: false },
        { text: 'Wipers ON (switch by the helm)', done: false, optional: true },
      ],
      now,
    );
  }
  duty.steps[0].done = v.controls.hatch <= 0;
  duty.steps[1].done = !loose;
  duty.steps[2].done = v.controls.wipers > 0;
  if (!heavy) duty.expireAt = now; // fair again before it was done
}

/** Water in the bilge over the alarm level: pump her dry. */
function stepBilgeDuty(world: WorldState, d: DutiesState, v: VesselState): void {
  const cfg = VESSEL_DEFS[v.defId].bilge;
  if (!cfg || v.bilge === undefined) return;
  let duty = open(d, 'bilge');
  if (!duty) {
    if (v.bilge < cfg.alarmAt) return;
    duty = addDuty(
      d,
      'bilge',
      'Bilge alarm: water below',
      [
        { text: 'BILGE breaker ON (the pump)', done: false },
        { text: 'Close the forepeak hatch', done: false, optional: true },
        { text: 'Bilge pumped dry', done: false },
      ],
      world.time,
    );
  }
  duty.steps[0].done = isPowered(v, 'bilge');
  duty.steps[1].done = v.controls.hatch <= 0;
  duty.steps[2].done = v.bilge < 0.02;
}

/** Advance the duties: add what's due, tick off steps, finish, drop old ones. */
export function stepDuties(world: WorldState): void {
  const d = (world.duties ??= createDuties());
  const now = world.time;
  const cfg = CONFIG.duties;
  const v = Object.values(world.vessels).find((x) => isWorkboat(VESSEL_DEFS[x.defId]));
  const def = v && (VESSEL_DEFS[v.defId] as WorkboatDef);

  if (v && def) {
    // Start-up: up while the boat is cold and not yet started.
    let startup = d.items.find((x) => x.kind === 'startup' && x.doneAt === undefined);
    if (!startup && isCold(v, def)) {
      startup = {
        id: `duty-${++d.seq}`,
        kind: 'startup',
        title: 'Start-up',
        steps: STARTUP.map((s) => ({ text: s.text, done: false, ...(s.optional ? { optional: true } : {}) })),
        createdAt: now,
      };
      d.items.unshift(startup);
    }
    if (startup) {
      STARTUP.forEach((s, i) => {
        if (!startup!.steps[i].done && s.check(v, def)) startup!.steps[i].done = true;
      });
      // Running (however she was started): the duty is done.
      if (v.engine.phase === 'running') {
        startup.steps.forEach((s, i) => {
          if (!s.optional && i < 5) s.done = true;
        });
      }
    }
    stepFogSignal(world, d, v);
    stepSecure(world, d, v);
    stepBilgeDuty(world, d, v);
  }

  for (const x of d.items) {
    if (x.doneAt === undefined && !x.holdOpen && x.steps.length && x.steps.every((s) => s.done || s.optional)) {
      x.doneAt = now;
      d.completed += 1;
    }
  }
  d.items = d.items.filter((x) => (x.doneAt === undefined ? x.expireAt === undefined || now < x.expireAt : now - x.doneAt < cfg.doneLinger));
}

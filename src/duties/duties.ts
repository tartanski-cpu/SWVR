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
 */
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
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
  kind: 'startup';
  title: string;
  steps: DutyStep[];
  createdAt: number;
  doneAt?: number;
  /** Quietly dropped at this world time if not done (undefined: never). */
  expireAt?: number;
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
  }

  for (const x of d.items) {
    if (x.doneAt === undefined && x.steps.length && x.steps.every((s) => s.done || s.optional)) {
      x.doneAt = now;
      d.completed += 1;
    }
  }
  d.items = d.items.filter((x) => (x.doneAt === undefined ? x.expireAt === undefined || now < x.expireAt : now - x.doneAt < cfg.doneLinger));
}

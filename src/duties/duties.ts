/**
 * The duty board's task list: everything the game asks of the crew (start-up, fog signal,
 * weather, transit jobs). Plain data in WorldState, so
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
 *   secure      rain or a squall forecast (or here) with loose cargo on deck: lash it
 *               (wipers on, optional). Dropped if the weather turns fair first.
 *   bilge       water over the alarm level: bilge breaker on, pump her dry.
 *   fendersOut  coming up to a berth under way with the fenders in: put them out.
 *   fendersIn   out of harbour with them still hanging over the side: take them in.
 *   lash        under way with loose cargo on deck: lash it (unless a weather duty has it).
 *   oil         an engine oil check is due: pull the dipstick, top up if it's low.
 *   cargo       cargo aboard bound for a port: take her there and set it down ashore.
 *   rescue      a distress call (answer it), the search and recovery, landing survivors.
 *   tow         a tow job: answer the call, make fast, bring her into a harbour.
 *   fire        a fire job: answer the call, pump on, put it out with the monitor.
 */
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { visibilityAt } from '../environment/weather';
import { isPowered } from '../vessel/electrics';
import { cargoDestination, nearestPort, portById } from '../rescue/rescue';
import { jetOn } from '../fire/fire';
import { towFast } from '../tow/tow';
import { TUTORIAL } from '../career/tutorial';
import { answerFogSignal } from '../traffic/traffic';
import { PORTS } from '../world/archipelago';
import { allBerths } from '../world/berths';
import { oilCheckDue } from '../vessel/maintenance';
import { leverDemand, preheatNeeded } from '../vessel/physics/propulsion';
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
  kind: 'startup' | 'fogSignal' | 'secure' | 'bilge' | 'fendersOut' | 'fendersIn' | 'lash' | 'oil' | 'cargo' | 'rescue' | 'tow' | 'fire' | 'fishing' | 'salvage' | 'damage' | 'wear' | 'tutorial';
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
  /** cargo / rescue / tow: which job it's for (port id, incident call time, tow vessel id). */
  key?: string;
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
  { text: 'Key ON, hold HEAT until the glow lamp goes out', check: (v, def) => v.engine.key > 0 && v.engine.glow >= preheatNeeded(v, def) },
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
    if (now - duty.hornFrom >= cfg.blastMin) {
      duty.lastBlast = now;
      answerFogSignal(world); // a ship out there in the murk answers
    }
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

/** Heavy weather coming (forecast) or here: deck cargo lashed. */
function stepSecure(world: WorldState, d: DutiesState, v: VesselState): void {
  const w = world.environment.weather;
  if (!w) return;
  const now = world.time;
  const wet = (p: string) => p === 'Rain' || p === 'Squall';
  const fc = world.forecast;
  const warned = !!fc && now - fc.at < CONFIG.duties.forecastValid && wet(fc.next);
  const heavy = warned || wet(w.preset);
  const loose = Object.values(world.cargo).some((c) => 'vessel' in c.at && c.at.vessel === v.id && !c.at.lashed);
  let duty = open(d, 'secure');
  if (!duty) {
    if (!heavy || !loose) return;
    duty = addDuty(
      d,
      'secure',
      `${w.preset === 'Squall' || fc?.next === 'Squall' ? 'Squall' : 'Rain'}${wet(w.preset) ? '' : ' coming'}: secure the boat`,
      [
        { text: 'Lash all deck cargo', done: false },
        { text: 'Wipers ON (switch by the helm)', done: false, optional: true },
      ],
      now,
    );
  }
  duty.steps[0].done = !loose;
  duty.steps[1].done = v.controls.wipers > 0;
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
        { text: 'Bilge pumped dry', done: false },
      ],
      world.time,
    );
  }
  duty.steps[0].done = isPowered(v, 'bilge');
  duty.steps[1].done = v.bilge < 0.02;
}

/** Fenders: out coming alongside, in again once clear of the harbour. */
function stepFenders(world: WorldState, d: DutiesState, v: VesselState): void {
  if (!VESSEL_DEFS[v.defId].fenders) return;
  const now = world.time;
  const [x, , z] = v.position;
  const berth = Math.min(...allBerths().map((b) => Math.hypot(b.x - x, b.z - z)));
  const speed = Math.hypot(v.linearVelocity[0], v.linearVelocity[2]);
  const under = v.engine.phase === 'running' && v.mooring.phase === 'free';
  let out = open(d, 'fendersOut');
  if (!out && under && berth < 200 && v.controls.fenders <= 0) {
    out = addDuty(d, 'fendersOut', 'Coming alongside: fenders out', [{ text: 'Fenders out (basket on the aft deck, starboard)', done: false }], now);
  }
  if (out) {
    out.steps[0].done = v.controls.fenders > 0;
    if (!out.steps[0].done && berth > 400) out.expireAt = now; // went somewhere else
  }
  let inn = open(d, 'fendersIn');
  if (!inn && v.controls.fenders > 0 && berth > 350 && speed > 1.5) {
    inn = addDuty(d, 'fendersIn', 'Under way: fenders in', [{ text: 'Fenders in (basket on the aft deck)', done: false }], now);
  }
  if (inn) inn.steps[0].done = v.controls.fenders <= 0;
}

/** Under way with loose cargo: lash it (a weather "secure" duty covers it when up). */
function stepLash(world: WorldState, d: DutiesState, v: VesselState): void {
  const [x, , z] = v.position;
  const away = PORTS.every((p) => Math.hypot(p.x - x, p.z - z) > CONFIG.rescue.harbourRadius);
  const loose = Object.values(world.cargo).some((c) => 'vessel' in c.at && c.at.vessel === v.id && !c.at.lashed);
  let duty = open(d, 'lash');
  if (!duty && away && loose && v.engine.phase === 'running' && !open(d, 'secure')) {
    duty = addDuty(d, 'lash', 'Under way: lash the deck cargo', [{ text: 'Lash every crate and drum on deck', done: false }], world.time);
  }
  if (duty) duty.steps[0].done = !loose;
}

/** Engine oil: a check falls due every so often; top up if the dipstick says low. */
function stepOilDuty(world: WorldState, d: DutiesState, v: VesselState): void {
  const cfg = VESSEL_DEFS[v.defId].maintenance;
  if (!cfg || v.engine.oil === undefined) return;
  let duty = open(d, 'oil');
  if (!duty && oilCheckDue(v)) {
    duty = addDuty(
      d,
      'oil',
      'Engine check: oil',
      [
        { text: 'Open the engine hatch (wheelhouse floor, aft starboard) and pull the dipstick', done: false },
        { text: 'Top up from the oil can if it reads low', done: false, optional: true },
      ],
      world.time,
    );
  }
  if (!duty) return;
  duty.steps[0].done ||= (v.engine.sinceCheck ?? 0) < cfg.checkEvery;
  const low = v.engine.oil < cfg.lowAt;
  duty.steps[1].optional = !low;
  duty.steps[1].done = !low && duty.steps[0].done;
}

/**
 * A job duty (cargo, rescue, tow) kept in step with the world: up while `key` is the
 * active job (with its steps' done flags), finished when the job is over (`key` null or a
 * different job, after it was up).
 */
function syncJob(d: DutiesState, kind: Duty['kind'], key: string | null, title: string, steps: DutyStep[], now: number): void {
  let duty = d.items.find((x) => x.kind === kind && x.doneAt === undefined);
  if (duty && duty.key !== key) {
    // That job is over. A call nobody answered (it went to another vessel) just goes;
    // anything else was seen through: tick it off.
    const unanswered = kind !== 'cargo' && !duty.steps[0]?.done;
    if (unanswered) d.items = d.items.filter((x) => x !== duty);
    else for (const st of duty.steps) st.done = true;
    duty = undefined;
  }
  if (!key) return;
  if (!duty) {
    duty = addDuty(d, kind, title, steps, now);
    duty.key = key;
  }
  duty.title = title;
  steps.forEach((st, i) => {
    if (duty!.steps[i]) duty!.steps[i].done ||= st.done;
  });
}

/** The cargo job: cargo aboard bound for a port, until it's set down there. */
function stepCargoDuty(world: WorldState, d: DutiesState, v: VesselState): void {
  const to = cargoDestination(world, v.id);
  const port = to ? portById(to) : undefined;
  const name = port?.name.replace(' (anchorage)', '') ?? '';
  const there = !!port && nearestPort(v.position[0], v.position[2]).port.id === port.id && nearestPort(v.position[0], v.position[2]).dist < CONFIG.rescue.harbourRadius;
  syncJob(d, 'cargo', port ? port.id : null, `Cargo job: deliver to ${name}`, [
    { text: `Take her to ${name}`, done: there },
    { text: 'Set the cargo down ashore by the goods stack', done: false },
  ], world.time);
}

/** The rescue under way (a distress call, the search, landing survivors). */
function stepRescueDuty(world: WorldState, d: DutiesState): void {
  const inc = world.rescue?.active;
  const what = inc?.defId === 'manOverboard' ? 'man overboard' : inc?.defId === 'lostCargo' ? 'lost deck cargo' : 'rescue';
  const people = !!inc?.targets.some((t) => t.kind === 'person');
  const live = inc && inc.phase !== 'landed' ? `${inc.defId}@${Math.round(inc.callT)}` : null;
  const recovered = !!inc && (inc.phase === 'recovered' || inc.phase === 'landed');
  const steps: DutyStep[] = [
    { text: 'Answer the call: pick up the VHF handset', done: !!inc && inc.phase !== 'calling' },
    { text: people ? 'Search the area on the chart; get them aboard' : 'Search the area on the chart; hook the crates aboard', done: recovered },
  ];
  if (people) steps.push({ text: 'Land the survivors: moor alongside a quay', done: inc?.phase === 'landed' });
  syncJob(d, 'rescue', live, `Rescue: ${what}`, steps, world.time);
}

/** The fire job (answer, pump on, put it out). */
function stepFireDuty(world: WorldState, d: DutiesState, v: VesselState | undefined): void {
  const job = world.fire?.job;
  const live = job && job.phase !== 'out' ? `${job.kind}@${Math.round(job.callT)}` : null;
  syncJob(d, 'fire', live, job?.kind === 'shore' ? 'Fire: a shed ashore' : 'Fire: a fishing boat', [
    { text: 'Answer the call: pick up the VHF handset', done: !!job && job.phase !== 'calling' },
    { text: 'Engine running, FIRE PUMP on (console, right of the wheel)', done: !!v && jetOn(v) },
    { text: 'Put it out: aim the monitor with its joystick (red knob)', done: false },
  ], world.time);
}

/** The tow job (answer, make fast, bring her in). */
function stepTowDuty(world: WorldState, d: DutiesState): void {
  const job = world.tow?.job;
  const live = job && job.phase !== 'delivered' ? job.vesselId : null;
  const name = job ? (VESSEL_DEFS[job.defId]?.tow?.name ?? 'a tow').replace(/^an? /, '') : '';
  syncJob(d, 'tow', live, `Tow: ${name}`, [
    { text: 'Answer the call: pick up the VHF handset', done: !!job && job.phase !== 'calling' },
    { text: 'Make the towline fast to her bow eye (boat hook)', done: towFast(world) },
    { text: 'Bring her into any harbour, slow', done: false },
  ], world.time);
}

/** Fishing (a side mission): from shooting the net until the catch is landed. */
function stepFishingDuty(world: WorldState, d: DutiesState, v: VesselState | undefined): void {
  const f = world.fishing;
  const fishAboard = !!v && Object.values(world.cargo).some((c) => c.from === 'trawl' && 'vessel' in c.at && c.at.vessel === v.id);
  const live = f && (f.net !== 'stowed' || fishAboard) ? 'fishing' : null;
  syncJob(d, 'fishing', live, 'Fishing: trawl', [
    { text: 'Shoot the net: TRAWL switch (console, behind the throttle) or PAY OUT on the A-frame', done: !!f && (f.net !== 'stowed' || f.caught > 0) },
    { text: 'Tow it on a fishing ground (dashed on the plotter) at 2-4 kn', done: !!f && f.caught > 0 },
    { text: 'Haul the net; carry the fish boxes ashore to any goods stack', done: false },
  ], world.time);
}

/** Log salvage (a side mission): while there are logs on the beaches. */
function stepSalvageDuty(world: WorldState, d: DutiesState): void {
  const logs = world.salvage?.logs ?? [];
  const onLine = !!world.tow?.line?.target.startsWith('l:');
  syncJob(d, 'salvage', logs.length ? 'salvage' : null, `Log salvage: ${logs.length} ${logs.length === 1 ? 'log' : 'logs'} washed up`, [
    { text: 'Find one (LOG on the plotter); stand off the beach, stern to it', done: onLine },
    { text: 'Make the towline fast to it (hook, or menu Tow, within 30 m) and pull it off', done: onLine && logs.some((l) => l.afloat && world.tow?.line?.target === `l:${l.id}`) },
    { text: 'Tow it into any harbour, slow: the yard buys it', done: false },
  ], world.time);
}

/** Phase 3: the first voyage, step by step (career/tutorial.ts). */
function stepTutorialDuty(world: WorldState, d: DutiesState): void {
  const t = world.career?.tutorial;
  const on = !!t && t.step < TUTORIAL.length;
  syncJob(d, 'tutorial', on ? 'first-voyage' : null, 'First voyage (the harbour master talks you through it)', TUTORIAL.map((s, i) => ({ text: s.text, done: !!t && i < t.step })), world.time);
}

/** Phase 2: a damaged hull (it leaks) and a worn engine, until they're mended in port. */
function stepDamageDuties(world: WorldState, d: DutiesState, v: VesselState | undefined): void {
  const dmg = v?.damage ?? 0;
  syncJob(d, 'damage', dmg > CONFIG.duties.damageAt ? 'hull' : null, 'Hull damaged: she is leaking', [
    { text: 'BILGE breaker ON: keep her pumped (BILGE lamp)', done: !!v && isPowered(v, 'bilge') },
    { text: 'Get her into port: Office tab, Repairs (hull)', done: false },
  ], world.time);
  const wear = v?.engine.wear ?? 0;
  syncJob(d, 'wear', wear > CONFIG.duties.wearAt ? 'engine' : null, 'Engine worn: she has lost power', [
    { text: 'Run her cooler: ease off when the TEMP lamp shows; keep the oil up', done: false, optional: true },
    { text: 'In port, engine stopped: Office tab, Repairs (overhaul)', done: false },
  ], world.time);
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
    stepFenders(world, d, v);
    stepLash(world, d, v);
    stepOilDuty(world, d, v);
    stepCargoDuty(world, d, v);
  }
  stepRescueDuty(world, d);
  stepTowDuty(world, d);
  stepFireDuty(world, d, v);
  stepFishingDuty(world, d, v);
  stepSalvageDuty(world, d);
  stepTutorialDuty(world, d);
  stepDamageDuties(world, d, v);

  for (const x of d.items) {
    if (x.doneAt === undefined && !x.holdOpen && x.steps.length && x.steps.every((s) => s.done || s.optional)) {
      x.doneAt = now;
      d.completed += 1;
    }
  }
  d.items = d.items.filter((x) => (x.doneAt === undefined ? x.expireAt === undefined || now < x.expireAt : now - x.doneAt < cfg.doneLinger));
}

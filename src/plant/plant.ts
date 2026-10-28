/**
 * The harbour tug's engine room machinery, and her start-up from dead ship (owner, 27 Oct 2026:
 * "a realistic startup procedure ... go downstairs, turn the fuel and whatever is appropriate
 * for the generator, get power on"). As a twin medium-speed diesel ASD tug is generally brought
 * to life, shortened to keep it playable (CONFIG.plant):
 *
 *   1. 24 V on: the battery master (`electrics.master`, its switch on the control room's
 *      switchboard; normally left on). Without it nothing starts.
 *   2. The generator: its fuel valve open, START on its own panel; it runs up to 400 V 50 Hz
 *      in `genRunUpS`.
 *   3. Power on: its breaker closed on the main switchboard (only with it running; it trips if
 *      the generator stops). The switchboard is live: the room's main lights, and the pumps
 *      and the compressor can run.
 *   4. Fuel to the main engines: each engine's day tank valve open, the fuel supply pump on.
 *   5. Sea water cooling: each engine's sea suction open. Shut, a running engine overheats
 *      (the cooling fault the boats already have: vessel/physics).
 *   6. Pre-lube: each engine's pre-lube pump run until its oil pressure is up.
 *   7. Starting air: the compressor fills the bottles; the main air valve open.
 *   8. Start: at the engine's own panel (here), or from the bridge's START once she's handed
 *      over; each start takes some air. Anything missing, the start is blocked and `note` says
 *      what, as the engine's alarm would.
 *   9. Hand over: the control place switch (local, control room, bridge) to BRIDGE: only then
 *      do the bridge's levers and STARTs work her (the diesel module reads `plant.bridge`).
 *
 * Simulation only (plain JSON on the boat, stepped by the host after her machinery each tick);
 * the room's drawing and its controls are app/engineRoom/tug/. Only the harbour tug has it:
 * the boat with twin azimuth drives (`hasPlant`). Other boats start from the bridge as before.
 * Quick start (the menu's Tests) makes it ready in one go.
 */
import { CONFIG } from '../config';
import { gearOf } from '../boats/sims';
import { clamp } from '../core/math';
import { isPowered } from '../vessel/electrics';
import { preheatNeeded } from '../vessel/physics/propulsion';
import type { EngineState, PlantState, VesselState } from '../vessel/vesselState';

/** The boats with an engine room to start her from: twin azimuth drives (the harbour tug). */
export function hasPlant(s: VesselState): boolean {
  const d = gearOf(s, 'diesel');
  return !!d?.azimuth && !!d.twin;
}

/** Her machinery as it stands: dead ship (all shut and stopped), or ready and handed to the bridge. */
export function newPlant(ready: boolean): PlantState {
  const on = ready ? 1 : 0;
  const pair = (): [number, number] => [on, on];
  return {
    genFuel: on,
    gen: ready ? 'running' : 'off',
    genT: ready ? CONFIG.plant.genRunUpS : 0,
    genBreaker: on,
    fuelPump: on,
    dayValve: pair(),
    sea: pair(),
    prelube: pair(),
    lubeBar: ready ? [CONFIG.plant.prelubeBar, CONFIG.plant.prelubeBar] : [0, 0],
    compressor: 0,
    airBar: ready ? CONFIG.plant.airMaxBar : 0,
    airValve: on,
    place: ready ? 2 : 1,
    starve: [0, 0],
    genStarve: 0,
    cranked: [0, 0],
  };
}

/** Her machinery, made the first time it's asked for: dead ship if her engines are stopped (a fresh boat), ready if they're running (a game carried on). */
export function plantOf(s: VesselState): PlantState | undefined {
  if (!hasPlant(s)) return undefined;
  if (!s.plant) {
    // (Her 24 V batteries are left as they are: on a real tug they're normally left on.)
    s.plant = newPlant(s.engine.phase !== 'off');
  }
  return s.plant;
}

/** The main switchboard live: the generator running with its breaker closed. */
export function busLive(p: PlantState): boolean {
  return p.gen === 'running' && p.genBreaker > 0;
}

/** The bridge has her (the control place at BRIDGE), or she has no engine room: the diesel's `plant.bridge`. */
export function bridgeHasControl(s: VesselState): boolean {
  return !s.plant || s.plant.place === 2;
}

/** Her two engines, port first (the starboard one once the diesel has made it). */
function engines(s: VesselState): [EngineState, EngineState | undefined] {
  return [s.engine, s.engine.stbd];
}

const NAMES = ['PORT ENGINE', 'STBD ENGINE'];

function say(p: PlantState, text: string): void {
  p.note = text;
  p.noteN = (p.noteN ?? 0) + 1;
}

/** Why engine `k` can't start now, as its alarm says it, or null if it can. */
export function startBlock(s: VesselState, p: PlantState, k: number): string | null {
  const c = CONFIG.plant;
  const name = NAMES[k];
  if (!isPowered(s)) return `${name}: NO 24 V - battery master on (control room switchboard)`;
  if (p.lubeBar[k] < c.lubeStartBar) return `${name}: START BLOCKED - LUBE OIL PRESSURE LOW (run its pre-lube pump)`;
  if (!p.dayValve[k]) return `${name}: START BLOCKED - NO FUEL (open its day tank valve)`;
  if (!p.fuelPump || !busLive(p)) return `${name}: START BLOCKED - FUEL PRESSURE LOW (fuel supply pump, on a live switchboard)`;
  if (!p.airValve) return `${name}: START BLOCKED - START AIR VALVE SHUT`;
  if (p.airBar < c.airStartMinBar) return `${name}: START BLOCKED - START AIR LOW (run the compressor)`;
  return null;
}

/** Each tick, after her machinery (core/simulation.ts): the generator, the pumps and air, and what her engines may do. */
export function stepPlant(s: VesselState, dt: number): void {
  const p = plantOf(s);
  if (!p) return;
  const c = CONFIG.plant;

  // The generator: runs up from START, on its own fuel; stops without it; its breaker trips when it stops.
  if (p.gen !== 'off' && !p.genFuel) {
    p.genStarve += dt;
    if (p.genStarve >= c.starveS) {
      p.gen = 'off';
      say(p, 'GENERATOR STOPPED - NO FUEL (its fuel valve is shut)');
    }
  } else p.genStarve = 0;
  if (p.gen === 'starting') {
    p.genT += dt;
    if (p.genT >= c.genRunUpS) p.gen = 'running';
  }
  if (p.gen !== 'running' && p.genBreaker) {
    p.genBreaker = 0;
    say(p, 'BLACKOUT - GENERATOR BREAKER TRIPPED');
  }
  const bus = busLive(p);

  // Her battery chargers, on the live switchboard: the 24 V batteries filled while the generator runs.
  const el = s.electrics;
  if (bus && el) el.soc = el.soc.map((x) => Math.min(1, x + c.chargeSocPerS * dt)) as [number, number];

  // Starting air: the compressor (on the switchboard's power) fills the bottles.
  if (p.compressor && bus) p.airBar = Math.min(c.airMaxBar, p.airBar + c.airFillBarS * dt);

  const es = engines(s);
  es.forEach((e, k) => {
    // Lube oil pressure: the engine's own pump running, else the pre-lube pump; falling with neither.
    const running = !!e && e.phase === 'running';
    const target = running ? c.lubeRunBar : p.prelube[k] && bus ? c.prelubeBar : 0;
    const rise = c.prelubeBar / c.prelubeS;
    p.lubeBar[k] = target >= p.lubeBar[k] ? Math.min(target, p.lubeBar[k] + (running ? rise * 4 : rise) * dt) : Math.max(target, p.lubeBar[k] - (running ? 1 : c.lubeDecayBarS) * dt);
    if (!e) return;
    // A start (from here or the bridge) checked as it begins, and its air taken.
    if (e.phase === 'cranking' && !p.cranked[k]) {
      const why = startBlock(s, p, k);
      if (why) {
        e.phase = 'off';
        e.autoCrank = false;
        // (The quick start's starboard engine waits on the port one: not now.)
        if (k === 0 && s.engine.stbd) s.engine.stbd.queued = false;
        say(p, why);
        return;
      }
      p.airBar = Math.max(0, p.airBar - c.startAirBar);
      p.cranked[k] = 1;
    }
    if (e.phase !== 'cranking') p.cranked[k] = 0;
    // Running on: her day tank valve shut, she starves and stops.
    if (running && !p.dayValve[k]) {
      p.starve[k] += dt;
      if (p.starve[k] >= c.starveS) {
        e.phase = 'off';
        e.autoCrank = false;
        say(p, `${NAMES[k]} STOPPED - FUEL PRESSURE LOW (day tank valve shut)`);
      }
    } else p.starve[k] = 0;
  });

  // Sea water cooling: a running engine with its sea suction shut has no raw water (the cooling
  // fault: she heats up). The two share her coolant, as the diesel models them.
  const dry = es.some((e, k) => !!e && e.phase === 'running' && !p.sea[k]);
  if (dry && !s.engine.coolingFault) {
    s.engine.coolingFault = true;
    p.seaFault = true;
  } else if (!dry && p.seaFault) {
    s.engine.coolingFault = false;
    p.seaFault = false;
  }
}

/** The engine room's controls (intents 'er.<what>'), 1 open / on / pressed, 0 shut / off. */
export function applyPlantIntent(s: VesselState, what: string, value: number): void {
  const p = plantOf(s);
  if (!p) return;
  const on = value > 0.5 ? 1 : 0;
  const pair = (key: 'dayValve' | 'sea' | 'prelube', k: number) => {
    p[key][k] = on;
  };
  switch (what) {
    case 'genFuel':
      p.genFuel = on;
      break;
    case 'genStart':
      // A press: START if it's stopped (with 24 V and its fuel), STOP if it's going.
      if (!on) break;
      if (p.gen !== 'off') {
        p.gen = 'off';
        p.genT = 0;
      } else if (!isPowered(s)) say(p, 'GENERATOR: NO 24 V - battery master on (control room switchboard)');
      else if (!p.genFuel) say(p, 'GENERATOR: WILL NOT START - NO FUEL (open its fuel valve)');
      else {
        p.gen = 'starting';
        p.genT = 0;
      }
      break;
    case 'genBreaker':
      if (on && p.gen !== 'running') {
        say(p, p.gen === 'starting' ? 'GENERATOR BREAKER: WAIT - generator still running up' : 'GENERATOR BREAKER: WILL NOT CLOSE - generator not running');
        p.genBreaker = 0;
      } else p.genBreaker = on;
      break;
    case 'fuelPump':
      p.fuelPump = on;
      break;
    case 'compressor':
      p.compressor = on;
      break;
    case 'airValve':
      p.airValve = on;
      break;
    case 'place':
      p.place = clamp(Math.round(value), 0, 2);
      break;
    case 'dayValve1':
    case 'dayValve2':
      pair('dayValve', what.endsWith('1') ? 0 : 1);
      break;
    case 'sea1':
    case 'sea2':
      pair('sea', what.endsWith('1') ? 0 : 1);
      break;
    case 'prelube1':
    case 'prelube2':
      pair('prelube', what.endsWith('1') ? 0 : 1);
      break;
    case 'start1':
    case 'start2': {
      // Its own panel's START: with 24 V she cranks on air until she catches (stepPlant checks the rest).
      if (!on) break;
      const k = what.endsWith('1') ? 0 : 1;
      const e = engines(s)[k];
      const diesel = gearOf(s, 'diesel');
      if (!e || !diesel || e.phase !== 'off') break;
      if (!isPowered(s)) {
        say(p, `${NAMES[k]}: NO 24 V - battery master on (control room switchboard)`);
        break;
      }
      s.engine.key = 1;
      e.key = 1;
      e.glow = preheatNeeded(s, diesel);
      e.phase = 'cranking';
      e.crank = 0;
      e.autoCrank = true;
      break;
    }
    case 'stop1':
    case 'stop2': {
      if (!on) break;
      const e = engines(s)[what.endsWith('1') ? 0 : 1];
      if (e && e.phase !== 'off') {
        e.phase = 'off';
        e.autoCrank = false;
      }
      break;
    }
  }
}

/**
 * Quick start (the menu's Tests): everything below open, running and handed to the bridge, in
 * one go; her levers to idle (her engines start in neutral: owner, 27 Oct 2026, quick start "wasn't
 * working" with a lever left at some power); and flat batteries given enough to start on, as a jump
 * start (her generator's chargers then fill them: stepPlant).
 */
export function plantReady(s: VesselState): void {
  if (!hasPlant(s)) return;
  const was = s.plant;
  s.plant = { ...newPlant(true), noteN: was?.noteN };
  s.controls.lever = 0;
  if (s.controls.lever2 !== undefined) s.controls.lever2 = 0;
  const e = s.electrics;
  if (e) e.soc = e.soc.map((x) => Math.max(x, CONFIG.plant.jumpStartSoc)) as [number, number];
}

/** One step of her start-up, as the control room's START-UP page and its checklist card show it. */
export interface StartupStep {
  what: string;
  where: string;
  done: boolean;
  /** How it stands, when that says more than done or not (the generator running up, the air's pressure). */
  note?: string;
}

/** Her start-up's steps from dead ship to the bridge, each done or not from her state as it is now (plant/plant.ts's order). */
export function startupSteps(s: VesselState): StartupStep[] {
  const p = s.plant;
  if (!p) return [];
  const c = CONFIG.plant;
  const es = engines(s);
  const both = (f: (k: number) => boolean) => f(0) && f(1);
  const running = (k: number) => es[k]?.phase === 'running';
  return [
    { what: 'BATTERY MASTER ON', where: 'switchboard', done: isPowered(s) },
    { what: 'GENERATOR: FUEL VALVE, START', where: 'port generator, aft', done: p.gen === 'running', note: p.gen === 'starting' ? `RUNNING UP ${Math.max(0, Math.ceil(c.genRunUpS - p.genT))} s` : !p.genFuel ? 'FUEL VALVE SHUT' : undefined },
    { what: 'GENERATOR BREAKER CLOSED', where: 'switchboard', done: busLive(p) },
    { what: 'DAY TANK VALVES, FUEL PUMP', where: 'tanks fwd stbd; switchboard', done: both((k) => !!p.dayValve[k]) && !!p.fuelPump },
    { what: 'SEA SUCTION VALVES OPEN', where: 'strainers, port side', done: both((k) => !!p.sea[k]) },
    { what: 'PRE-LUBE: OIL PRESSURE UP', where: 'each engine\'s stand', done: both((k) => running(k) || p.lubeBar[k] >= c.lubeStartBar), note: `${p.lubeBar[0].toFixed(1)} / ${p.lubeBar[1].toFixed(1)} bar` },
    { what: 'START AIR: COMPRESSOR, VALVE', where: 'fwd stbd; air bottle', done: !!p.airValve && (p.airBar >= c.airStartMinBar || both(running)), note: `${p.airBar.toFixed(0)} bar` },
    { what: 'START BOTH ENGINES', where: 'each engine\'s stand', done: both(running) },
    { what: 'ENGINE CONTROL TO BRIDGE', where: 'switchboard', done: p.place === 2 },
  ];
}

/**
 * The controls (their intents' names, as the room's controls send them) still to work for the
 * next step of her start-up: what the engine room cues with a glow (owner, 27 Oct 2026: "highlight
 * the next thing that needs to be touched ... don't make it too easy"). None once she's handed over.
 */
export function nextControls(s: VesselState): string[] {
  const p = s.plant;
  if (!p) return [];
  const steps = startupSteps(s);
  const i = steps.findIndex((st) => !st.done);
  const es = engines(s);
  const off = (k: number) => es[k]?.phase !== 'running';
  const each = (name: string, todo: (k: number) => boolean) => [0, 1].filter(todo).map((k) => `er.${name}${k + 1}`);
  switch (i) {
    case 0:
      return ['master'];
    case 1:
      return !p.genFuel ? ['er.genFuel'] : p.gen === 'off' ? ['er.genStart'] : [];
    case 2:
      return ['er.genBreaker'];
    case 3:
      return [...each('dayValve', (k) => !p.dayValve[k]), ...(p.fuelPump ? [] : ['er.fuelPump'])];
    case 4:
      return each('sea', (k) => !p.sea[k]);
    case 5:
      return each('prelube', (k) => !p.prelube[k] && off(k));
    case 6:
      return [...(p.compressor ? [] : ['er.compressor']), ...(p.airValve ? [] : ['er.airValve'])];
    case 7:
      return each('start', (k) => off(k) && es[k]?.phase !== 'cranking');
    case 8:
      return ['er.place'];
    default:
      return [];
  }
}

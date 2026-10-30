/**
 * Training mode's exercise engine (docs/TRAINING.md section 5): the first-voyage tutorial's
 * pattern (career/tutorial.ts) made general. An exercise (exercises.ts) puts the boat in
 * place and sets the wind, then has steps, each a plain check on the world, announced once
 * over the VHF and ticked on the duty board; while it runs, faults are counted against the
 * limits in CONFIG.training. It ends "passed" or "try again", with the reason and the few
 * numbers that matter: an examiner's verdict, not a score.
 *
 * The boat judged is the exercise's: the home boat (the fishing boat), or for the tiller
 * exercises the skiff, put in the water beside her with the trainee aboard (`boatId`).
 *
 * The Examiner's Run (M3; the SBF practical's form): the manoeuvres in a seeded order, one
 * after the other: the compulsory ones must each pass by their second attempt, two of the
 * three others must pass, and a prop strike, a hard knock or gear engaged by a swimmer ends it.
 *
 * Plain JSON on WorldState.training, stepped by the host in stepWorld and driven by intents
 * (trainingStart, trainingRetry, trainingRestart, trainingAbort, trainingExam), so crew and an
 * instructor see the same in their snapshots. Nothing here touches Three.js, the DOM, VR or
 * the desktop. Everything is timed on world.time.
 */
import { CONFIG } from '../config';
import type { Intent } from '../core/intents';
import { homeVessel, type WorldState } from '../core/world';
import { sayRadio } from '../rescue/rescue';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { createVesselState, type VesselState } from '../vessel/vesselState';
import { EXERCISES, EXAM, exerciseById, KN, speedKn, type Ctx } from './exercises';

export interface TrainingFault {
  /** Seconds into the attempt. */
  t: number;
  kind: string;
  /** 1 or 2: counted; 3: the run is failed there and then. */
  weight: number;
  text: string;
}

/** The card at the end of an attempt: passed or try again, why, and the numbers that matter. */
export interface TrainingResult {
  id: string;
  name: string;
  attempt: number;
  passed: boolean;
  reason: string;
  numbers: [string, string][];
  faults: TrainingFault[];
  /** The faults' weights added up (the badges are given on it: badges.ts). */
  total: number;
  /** World time it ended. */
  t: number;
}

/** The Examiner's Run under way: its items in their order, each's outcome, and where it's got to. */
export interface ExamState {
  items: { id: string; compulsory: boolean; attempts: number; passed: boolean | null; reason: string }[];
  i: number;
  /** World time it began. */
  startedAt: number;
  faults: TrainingFault[];
}

export interface TrainingState {
  /** The exercise running (exercises.ts id), or null between exercises. */
  id: string | null;
  /** Who started it (a player id): the trainee, whose place the recording keeps. */
  by?: string;
  /** The boat being judged when it isn't the home boat (the skiff for the tiller exercises): her id. */
  boatId?: string;
  /** Which attempt this is (1 or 2: CONFIG.training.attempts). */
  attempt: number;
  /** The step being worked on (index into its steps). */
  step: number;
  /** The current step has been announced. */
  said: boolean;
  /** World time this attempt began, and the current step. */
  startedAt: number;
  stepAt: number;
  faults: TrainingFault[];
  /** When each kind of fault was last counted (world time): CONFIG.training.faultGapS. */
  lastFault: Record<string, number>;
  /** The exercise's own measurements this attempt (exercises.ts). */
  data: Record<string, number>;
  /** The last attempt's card. */
  result: TrainingResult | null;
  /** The exercises passed this session. */
  passed: string[];
  /** Bumped on every change worth redrawing (the menu, the board). */
  seq: number;
  /**
   * The instructor's lines waiting to go out over the VHF, and when the last one will have
   * been spoken (world time): the VHF holds one message, which the page speaks aloud, so each
   * waits for the one before (CONFIG.training.voiceCharsPerS).
   */
  queue: string[];
  quietUntil: number;
  /**
   * The horn as the instructor hears it (trackHorn): the blasts of the signal being sounded,
   * the last whole signal (its blast count and when it ended), and the last prolonged blast.
   */
  horn: { down: number | null; blasts: number; lastUp: number; signal: number; signalAt: number; prolongedAt: number };
  /** The Examiner's Run, while one is on. */
  exam?: ExamState;
}

export function createTraining(): TrainingState {
  return { id: null, attempt: 1, step: 0, said: false, startedAt: 0, stepAt: 0, faults: [], lastFault: {}, data: {}, result: null, passed: [], seq: 0, queue: [], quietUntil: 0, horn: freshHorn() };
}

const freshHorn = (): TrainingState['horn'] => ({ down: null, blasts: 0, lastUp: -Infinity, signal: 0, signalAt: -Infinity, prolongedAt: -Infinity });

const TRAINING_INTENTS = ['trainingStart', 'trainingRetry', 'trainingRestart', 'trainingAbort', 'trainingExam'];

export function isTrainingIntent(control: string): boolean {
  return TRAINING_INTENTS.includes(control);
}

/** The boat being judged: the exercise's small boat when it has one, else the home boat. */
export function trainingBoat(world: WorldState): VesselState | undefined {
  const id = world.training?.boatId;
  return (id ? world.vessels[id] : undefined) ?? homeVessel(world);
}

/**
 * trainingStart (ref: the exercise's id) begins its first attempt; trainingRetry the next
 * attempt after a "try again" (the first again once both are used); trainingRestart the
 * attempt running, from the beginning, not counted (going round again is never a fault);
 * trainingAbort stops it (and an Examiner's Run), no verdict; trainingExam starts the
 * Examiner's Run.
 */
export function applyTrainingIntent(world: WorldState, intent: Intent): void {
  const t = world.training;
  if (!t || !homeVessel(world)) return;
  switch (intent.control) {
    case 'trainingStart':
      if (intent.ref && exerciseById(intent.ref)) {
        delete t.exam;
        begin(world, t, intent.ref, 1, intent.playerId);
      }
      break;
    case 'trainingRetry': {
      const r = t.result;
      if (!r || t.id) break;
      if (r.id === 'exam') startExam(world, t, intent.playerId);
      else begin(world, t, r.id, !r.passed && r.attempt < CONFIG.training.attempts ? r.attempt + 1 : 1, intent.playerId);
      break;
    }
    case 'trainingRestart':
      if (t.id) begin(world, t, t.id, t.attempt, intent.playerId);
      break;
    case 'trainingAbort':
      if (t.id || t.exam) {
        t.queue = [];
        voice(world, t, t.exam ? "Examiner's Run stopped. Start it again when you are ready." : 'Exercise stopped. Pick another, or the same again, when you are ready.');
        t.id = null;
        delete t.exam;
        t.seq += 1;
      }
      break;
    case 'trainingExam':
      startExam(world, t, intent.playerId);
      break;
  }
}

/**
 * The exercise's boat ready: the home boat, or (an exercise with `boat`) that small boat put
 * in the water at her start, made if she isn't there. The home boat goes back to her berth
 * out of the way then; a small boat no exercise wants is taken away (nobody aboard her).
 */
function boatFor(world: WorldState, t: TrainingState, defId: string | undefined): VesselState {
  const home = homeVessel(world)!;
  const smallId = 'training-boat';
  const small = world.vessels[smallId];
  if (!defId) {
    if (small && !Object.values(world.players).some((p) => p.aboardVesselId === smallId)) delete world.vessels[smallId];
    delete t.boatId;
    return home;
  }
  if (!small || small.defId !== defId) world.vessels[smallId] = createVesselState(smallId, defId);
  t.boatId = smallId;
  return world.vessels[smallId];
}

/** The trainee aboard her, where boarding puts you (her helm), as the `board` intent does. */
function aboard(world: WorldState, playerId: string, v: VesselState): void {
  const p = world.players[playerId];
  if (!p) return;
  p.aboardVesselId = v.id;
  p.position = [...VESSEL_DEFS[v.defId].boardingSpot];
  p.yaw = 0;
  p.mode = 'walk';
  delete p.velocity;
}

/** An attempt from the beginning: the boat in place, the wind set, the trainee aboard, the first step to come. */
function begin(world: WorldState, t: TrainingState, id: string, attempt: number, by: string): void {
  const ex = exerciseById(id)!;
  const v = boatFor(world, t, ex.boat);
  // Gear she must have (the fire monitor for the fire exercise): said, not started.
  const missing = ex.needs?.(v);
  if (missing) {
    t.queue = [];
    voice(world, t, `${ex.code} ${ex.name} needs ${missing}. Pick another exercise.`);
    t.id = null;
    t.seq += 1;
    return;
  }
  // Nothing else calls while you practise.
  world.quietCalls = true;
  // Anything left from the last exercise: a casualty in the water, a tow, a fire.
  clearScene(world);
  ex.setup(world, v);
  aboard(world, by, v);
  Object.assign(t, { id, by, attempt, step: 0, said: false, startedAt: world.time, stepAt: world.time, faults: [], lastFault: {}, data: {}, result: null, quietUntil: 0, horn: freshHorn() });
  // (In an Examiner's Run the examiner's own words go first: they're already queued.)
  if (!t.exam) t.queue = [];
  t.seq += 1;
  voice(world, t, `${ex.code} ${ex.name}${t.exam ? '' : `, attempt ${attempt} of ${CONFIG.training.attempts}`}. ${ex.brief}`);
}

/** The last exercise's scene cleared: the casualty, the tow, the fire. */
function clearScene(world: WorldState): void {
  if (world.rescue) world.rescue.active = null;
  if (world.tow?.job) {
    const id = world.tow.job.vesselId;
    world.tow.lines = {};
    if (!Object.values(world.players).some((p) => p.aboardVesselId === id)) delete world.vessels[id];
    world.tow.job = null;
  }
  if (world.fire?.job) world.fire.job = null;
}

/** The Examiner's Run: its items in a seeded order (compulsory and other mixed), the first begun. */
function startExam(world: WorldState, t: TrainingState, by: string): void {
  // A seed from the world's clock: a different order each time, the same for everyone watching.
  let seed = Math.floor(world.time * 1000) % 2147483647 || 7;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const items = [...EXAM.compulsory.map((id) => ({ id, compulsory: true })), ...EXAM.other.map((id) => ({ id, compulsory: false }))]
    .map((x) => ({ ...x, k: rnd() }))
    .sort((a, b) => a.k - b.k)
    .map(({ id, compulsory }) => ({ id, compulsory, attempts: 0, passed: null as boolean | null, reason: '' }));
  t.exam = { items, i: 0, startedAt: world.time, faults: [] };
  t.queue = [];
  voice(world, t, `Examiner's Run: ${items.length} manoeuvres, one after another. The compulsory ones (${EXAM.compulsory.map((id) => exerciseById(id)?.name).join(', ')}) must each pass by the second attempt, and two of the others. A prop strike, a hard knock, or the engine in gear by the swimmer ends it. First up.`);
  items[0].attempts = 1;
  begin(world, t, items[0].id, 1, by);
}

/** An item of the Examiner's Run finished: again (once), the next, or the verdict. */
function examNext(world: WorldState, t: TrainingState, passed: boolean, reason: string, ended: boolean): void {
  const e = t.exam!;
  const item = e.items[e.i];
  e.faults.push(...t.faults);
  item.passed = passed;
  item.reason = reason;
  const by = t.by ?? Object.keys(world.players)[0];
  if (!ended && !passed && item.attempts < CONFIG.training.attempts) {
    item.attempts += 1;
    voice(world, t, 'Again, please.');
    begin(world, t, item.id, item.attempts, by);
    return;
  }
  e.i += 1;
  const failedCompulsory = e.items.some((x) => x.compulsory && x.passed === false);
  if (!ended && !failedCompulsory && e.i < e.items.length) {
    e.items[e.i].attempts = 1;
    voice(world, t, 'Next.');
    begin(world, t, e.items[e.i].id, 1, by);
    return;
  }
  // The verdict.
  const others = e.items.filter((x) => !x.compulsory);
  const othersPassed = others.filter((x) => x.passed).length;
  const ok = !ended && !failedCompulsory && othersPassed >= EXAM.otherToPass;
  const why = ended
    ? `Ended: ${reason}`
    : failedCompulsory
      ? `A compulsory manoeuvre not passed: ${e.items.find((x) => x.compulsory && x.passed === false)!.reason}`
      : ok
        ? `Every compulsory manoeuvre passed, and ${othersPassed} of ${others.length} others`
        : `Only ${othersPassed} of the ${others.length} other manoeuvres passed (${EXAM.otherToPass} needed)`;
  const total = e.faults.reduce((s, f) => s + f.weight, 0);
  t.result = {
    id: 'exam',
    name: "Examiner's Run",
    attempt: 1,
    passed: ok,
    reason: why,
    numbers: e.items.map((x): [string, string] => [`${x.compulsory ? '*' : ''}${exerciseById(x.id)?.code ?? x.id} ${exerciseById(x.id)?.name ?? ''}`, x.passed === null ? 'not reached' : `${x.passed ? 'passed' : 'not passed'}${x.attempts > 1 ? ' (2nd)' : ''}`]),
    faults: e.faults,
    total,
    t: world.time,
  };
  if (ok && !t.passed.includes('exam')) t.passed.push('exam');
  delete t.exam;
  t.id = null;
  t.seq += 1;
  voice(world, t, ok ? `That is the Examiner's Run passed. ${why}.` : `Examiner's Run: not this time. ${why}.`);
}

/** A line for the VHF, in its turn (TrainingState.queue). */
function voice(world: WorldState, t: TrainingState, text: string): void {
  t.queue.push(text);
  speakNext(world, t);
}

/** The next waiting line, once the last has been spoken. */
function speakNext(world: WorldState, t: TrainingState): boolean {
  if (!t.queue.length || world.time < t.quietUntil) return false;
  say(world, t, t.queue.shift()!);
  return true;
}

function say(world: WorldState, t: TrainingState, text: string): void {
  sayRadio(world, 'info', text);
  t.quietUntil = world.time + CONFIG.training.voicePauseS + text.length / CONFIG.training.voiceCharsPerS;
}

/** Nothing being said or waiting to be. */
const quiet = (world: WorldState, t: TrainingState) => !t.queue.length && world.time >= t.quietUntil;

/**
 * The horn as an examiner hears it (COLREG rule 34's manoeuvring signals; rule 35's in fog):
 * a press of `shortS` or less is a short blast, of `prolongedS` or more a prolonged one; blasts
 * with gaps under `gapS` make one signal, whose count is known once the gap passes.
 */
function trackHorn(world: WorldState, t: TrainingState, v: VesselState): void {
  const h = (t.horn ??= freshHorn());
  const cfg = CONFIG.training.horn;
  const on = v.controls.horn > 0.5;
  if (on && h.down === null) h.down = world.time;
  if (!on && h.down !== null) {
    const held = world.time - h.down;
    h.down = null;
    if (held >= cfg.prolongedS) h.prolongedAt = world.time;
    else if (held <= cfg.shortS) {
      h.blasts += 1;
      h.lastUp = world.time;
    }
  }
  if (h.blasts && h.down === null && world.time - h.lastUp > cfg.gapS) {
    h.signal = h.blasts;
    h.signalAt = world.time;
    h.blasts = 0;
  }
}

/** One tick (host): announce the step, watch for faults, check the step, move on, judge at the end. */
export function stepTraining(world: WorldState): void {
  const t = world.training;
  const v = trainingBoat(world);
  if (t) speakNext(world, t);
  if (!t?.id || !v) return;
  const ex = exerciseById(t.id);
  if (!ex) {
    t.id = null;
    return;
  }
  trackHorn(world, t, v);
  const c: Ctx = { world, v, t, d: t.data };
  const step = ex.steps[t.step];
  // The faults, from the moment the boat is hers (the brief too): the exercise's own, then the speed and the knocks.
  const own = ex.watch?.(c);
  if (own) fault(world, t, own.kind, own.weight, own.text);
  if (t.id) commonFaults(world, t, v, ex.capKn ?? CONFIG.training.harbourKn);
  if (!t.id) return;
  if (world.time - t.startedAt > ex.limitS) {
    finish(world, t, ex.code, ex.name, false, `Out of time: ${Math.round(ex.limitS / 60)} minutes is plenty for this one`, ex.numbers(c));
    return;
  }
  if (!t.said) {
    // Each step is called once the words before it are out (its `enter` then: "Stop her!" starts the measuring as it's said).
    if (!quiet(world, t)) return;
    t.said = true;
    t.stepAt = world.time;
    step.enter?.(c);
    say(world, t, typeof step.say === 'function' ? step.say(c) : step.say);
    t.seq += 1;
    return;
  }
  if (!step.done(c)) return;
  t.step += 1;
  t.said = false;
  t.seq += 1;
  if (t.step < ex.steps.length) return;
  const verdict = ex.verdict(c);
  // A run with faults can still pass (the RYA's words: a fault is not necessarily a fail);
  // only a fail-weight fault (it ended the run there and then) or the exercise's own test fails it.
  finish(world, t, ex.code, ex.name, verdict.passed, verdict.reason, ex.numbers(c));
}

/** The speed over the harbour's limit (or the exercise's), the knocks, and a kill cord not worn, as faults. */
function commonFaults(world: WorldState, t: TrainingState, v: VesselState, capKn: number): void {
  const cfg = CONFIG.training;
  // (Judged as shown, to a tenth: 3.04 kn is 3.0, not over 3.)
  const kn = Math.round(speedKn(v) * 10) / 10;
  if (kn > capKn) fault(world, t, 'speed', cfg.weights.speed, `Over ${capKn} kn (${kn.toFixed(1)} kn)`);
  const knock = v.contact.impact / KN;
  t.data.maxKnock = Math.max(t.data.maxKnock ?? 0, knock);
  if (knock > cfg.knock.failKn) fault(world, t, 'knock', cfg.weights.fail, `A hard knock: ${knock.toFixed(1)} kn`);
  else if (knock > cfg.knock.faultKn) fault(world, t, 'knock', cfg.weights.knock, `A knock: ${knock.toFixed(1)} kn`);
}

/** Count a fault (once per kind per CONFIG.training.faultGapS); a fail-weight one ends the run. */
function fault(world: WorldState, t: TrainingState, kind: string, weight: number, text: string): void {
  const last = t.lastFault[kind];
  if (weight < CONFIG.training.weights.fail && last !== undefined && world.time - last < CONFIG.training.faultGapS) return;
  t.lastFault[kind] = world.time;
  t.faults.push({ t: Math.round(world.time - t.startedAt), kind, weight, text });
  t.seq += 1;
  const ex = t.id ? exerciseById(t.id) : undefined;
  if (weight >= CONFIG.training.weights.fail && ex) {
    finish(world, t, ex.code, ex.name, false, text, ex.numbers({ world, v: trainingBoat(world)!, t, d: t.data }), EXAM.enders.includes(kind));
  } else if (quiet(world, t)) say(world, t, `Fault: ${text}.`); // (else on the card only: no talking over a line)
}

function finish(world: WorldState, t: TrainingState, code: string, name: string, passed: boolean, reason: string, numbers: [string, string][], ender = false): void {
  const id = t.id!;
  const total = t.faults.reduce((s, f) => s + f.weight, 0);
  t.result = { id, name: `${code} ${name}`, attempt: t.attempt, passed, reason, numbers, faults: [...t.faults], total, t: world.time };
  if (passed && !t.passed.includes(id)) t.passed.push(id);
  t.id = null;
  t.seq += 1;
  t.queue = [];
  if (t.exam) {
    voice(world, t, passed ? `${name}: passed.` : `${name}: ${reason}.`);
    examNext(world, t, passed, reason, ender);
    return;
  }
  const more = !passed && t.attempt < CONFIG.training.attempts;
  voice(world, t, passed ? `Passed: ${code} ${name}. ${reason}.` : `Try again: ${reason}.${more ? ' Your second attempt when you are ready (Training tab).' : ' Practise it, then start it again.'}`);
}

/** The duty board's entry while an exercise runs (duties/duties.ts): its steps, ticked as done. */
export function trainingDuty(world: WorldState): { key: string; title: string; steps: { text: string; done: boolean }[] } | null {
  const t = world.training;
  const ex = t?.id ? exerciseById(t.id) : undefined;
  if (!t || !ex) return null;
  return {
    key: `${ex.id}-${t.attempt}-${t.startedAt}`,
    title: `${ex.code} ${ex.name} (${t.exam ? `Examiner's Run ${t.exam.i + 1} of ${t.exam.items.length}` : `attempt ${t.attempt} of ${CONFIG.training.attempts}`})`,
    steps: ex.steps.map((s, i) => ({ text: s.text, done: i < t.step })),
  };
}

/** For the menu: what's running and the step, or null. */
export function trainingLine(world: WorldState): string | null {
  const t = world.training;
  const ex = t?.id ? exerciseById(t.id) : undefined;
  if (!t || !ex) return null;
  return `${ex.code} ${ex.name}, attempt ${t.attempt}: ${ex.steps[Math.min(t.step, ex.steps.length - 1)].text}`;
}

export { EXERCISES };
